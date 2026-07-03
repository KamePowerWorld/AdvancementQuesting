package com.kamesuta.advquesting.data;

import com.kamesuta.advquesting.db.ProgressDao;
import org.bukkit.Bukkit;
import org.bukkit.NamespacedKey;
import org.bukkit.advancement.Advancement;
import org.bukkit.entity.Player;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.Map;
import java.util.logging.Logger;

/**
 * NMS リフレクションを介した Advancement 操作を集約するクラス。
 * {@link AdvancementSyncManager} から java.lang.reflect への直接依存を排除する。
 */
public class NmsAdvancementBridge {

    private static final String NAMESPACE = "advquesting";

    private final QuestManager questManager;
    private final ProgressDao progressDao;
    private final Logger log;

    public NmsAdvancementBridge(QuestManager questManager, ProgressDao progressDao, Logger log) {
        this.questManager = questManager;
        this.progressDao = progressDao;
        this.log = log;
    }

    /**
     * DB の進捗を NMS 経由でサイレントに反映し、reset パケットで再送する（トーストなし）。
     * 成功時 true。
     */
    public boolean resyncPlayerSilently(Player player) {
        try {
            Object serverPlayer = player.getClass().getMethod("getHandle").invoke(player);
            Object playerAdv = serverPlayer.getClass().getMethod("getAdvancements").invoke(serverPlayer);
            Method getOrStart = findMethod(playerAdv.getClass(), "getOrStartProgress", 1);
            if (getOrStart == null) return false;

            // root を付与
            Advancement root = Bukkit.getAdvancement(new NamespacedKey(NAMESPACE, "root"));
            if (root != null) {
                Object holder = root.getClass().getMethod("getHandle").invoke(root);
                Object progress = getOrStart.invoke(playerAdv, holder);
                setCriterionSilently(progress, "root", true);
            }

            // 各クエストの criterion を DB の状態に合わせて付与/剥奪
            String playerUuid = player.getUniqueId().toString();
            for (Quest quest : questManager.loadAll()) {
                if (!"public".equals(quest.status)) continue;
                Advancement adv = Bukkit.getAdvancement(new NamespacedKey(NAMESPACE, "q" + quest.id));
                if (adv == null) continue;
                Object holder = adv.getClass().getMethod("getHandle").invoke(adv);
                Object progress = getOrStart.invoke(playerAdv, holder);
                ProgressDao.ProgressRecord rec = progressDao.findByPlayerAndQuest(playerUuid, quest.id);
                Map<String, Boolean> done = AdvancementJsonBuilder.parseProgress(rec != null ? rec.progress() : null);
                if (quest.conditions == null || quest.conditions.isEmpty()) {
                    setCriterionSilently(progress, "_root", false);
                    continue;
                }
                for (Map<String, Object> cond : quest.conditions) {
                    String condId = (String) cond.get("id");
                    if (condId == null) continue;
                    String crit = "c_" + AdvancementJsonBuilder.sanitizeCriterionName(condId);
                    setCriterionSilently(progress, crit, done.getOrDefault(condId, false));
                }
            }

            // save() で在メモリ進捗をディスクへ書き出し、reload() で reset パケットとして再送する。
            playerAdv.getClass().getMethod("save").invoke(playerAdv);
            Object server = Class.forName("net.minecraft.server.MinecraftServer").getMethod("getServer").invoke(null);
            Object manager = server.getClass().getMethod("getAdvancements").invoke(server);
            Method reload = findMethod(playerAdv.getClass(), "reload", 1);
            if (reload == null) return false;
            reload.invoke(playerAdv, manager);
            return true;
        } catch (Exception e) {
            log.warning("進捗のサイレント再同期に失敗 (" + player.getName() + "): " + e.getMessage());
            return false;
        }
    }

    /**
     * Paper 1.21+ の removeAdvancement はファイル削除のみで in-memory レジストリに反映されない。
     * このメソッドでレジストリからも削除する。
     */
    public static void removeFromRegistry(NamespacedKey key, Logger log) {
        try {
            Object server = Class.forName("net.minecraft.server.MinecraftServer")
                    .getMethod("getServer").invoke(null);
            Object advManager = server.getClass().getMethod("getAdvancements").invoke(server);
            // Paper 1.21 では ResourceLocation は net.minecraft.resources.Identifier として再マップされる。
            // CraftNamespacedKey.toMinecraft() を経由して正しいクラスのインスタンスを取得する。
            Object resourceLocation = Class.forName("org.bukkit.craftbukkit.util.CraftNamespacedKey")
                    .getMethod("toMinecraft", NamespacedKey.class)
                    .invoke(null, key);
            // "advancements" フィールドをクラス階層から探す
            Field advField = null;
            for (Class<?> c = advManager.getClass(); c != null; c = c.getSuperclass()) {
                try {
                    advField = c.getDeclaredField("advancements");
                    break;
                } catch (NoSuchFieldException ignored) {}
            }
            if (advField == null) return;
            advField.setAccessible(true);
            @SuppressWarnings("unchecked")
            java.util.Map<Object, Object> existing = (java.util.Map<Object, Object>) advField.get(advManager);
            if (existing == null || !existing.containsKey(resourceLocation)) return;
            // ImmutableMap は変更不可なので新しい LinkedHashMap に差し替える
            java.util.Map<Object, Object> newMap = new java.util.LinkedHashMap<>(existing);
            newMap.remove(resourceLocation);
            advField.set(advManager, newMap);
        } catch (Exception e) {
            log.fine("NMS advancement removal skipped: " + e.getMessage());
        }
    }

    /** NMS AdvancementProgress に対し criterion を付与/剥奪する（パケット送信なし）。*/
    private void setCriterionSilently(Object nmsProgress, String criterion, boolean grant) throws Exception {
        Method m = findMethod(nmsProgress.getClass(), grant ? "grantProgress" : "revokeProgress", 1);
        if (m != null) m.invoke(nmsProgress, criterion);
    }

    /** クラス階層を遡って名前と引数の数が一致するメソッドを探し setAccessible して返す。*/
    static Method findMethod(Class<?> clazz, String name, int paramCount) {
        for (Class<?> c = clazz; c != null; c = c.getSuperclass()) {
            for (Method m : c.getDeclaredMethods()) {
                if (m.getName().equals(name) && m.getParameterCount() == paramCount) {
                    m.setAccessible(true);
                    return m;
                }
            }
        }
        return null;
    }
}
