package com.kamesuta.advquesting.data;

import com.kamesuta.advquesting.db.ProgressDao;
import org.bukkit.Bukkit;
import org.bukkit.NamespacedKey;
import org.bukkit.advancement.Advancement;
import org.bukkit.advancement.AdvancementProgress;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.File;
import java.util.HashSet;
import java.util.Map;
import java.util.logging.Logger;

/**
 * クエストを Minecraft の進捗（Advancement）画面に表示する。
 * プラグイン起動時にクエストを Advancement として登録し、
 * プレイヤーの条件達成に合わせて criterion を award/revoke する。
 */
public class AdvancementSyncManager {

    private static final String NAMESPACE = "advquesting";

    private final JavaPlugin plugin;
    private final QuestManager questManager;
    private final ProgressDao progressDao;
    private final Logger log;
    private final AdvancementJsonBuilder jsonBuilder;
    private final NmsAdvancementBridge nmsBridge;

    public AdvancementSyncManager(JavaPlugin plugin, QuestManager questManager, ProgressDao progressDao) {
        this.plugin = plugin;
        this.questManager = questManager;
        this.progressDao = progressDao;
        this.log = plugin.getLogger();
        this.jsonBuilder = new AdvancementJsonBuilder(
                questManager,
                () -> plugin.getConfig().getString("web-url", ""));
        this.nmsBridge = new NmsAdvancementBridge(questManager, progressDao, log);
    }

    /** サーバー起動時・プラグインリロード時: root と public クエスト全件を Advancement 登録する。
     *  既にログイン中のプレイヤーへも定義と進捗を即時送信する（/reload 対応）。*/
    public void loadAll() {
        loadRoot();
        for (Quest quest : questManager.loadAll()) {
            if ("public".equals(quest.status)) {
                loadQuestAdvancement(quest);
            }
        }
        // リロード後など、既にログイン中のプレイヤーに Advancement 定義と進捗を再送信する。
        // awardCriteria() が ClientboundUpdateAdvancementsPacket を生成し定義も含めて送る。
        for (Player player : Bukkit.getOnlinePlayers()) {
            syncAllQuestsForPlayer(player);
        }
    }

    /**
     * プラグイン無効時: 全プレイヤーの advquesting 進捗を消去し Advancement を削除する。
     * オンラインプレイヤーは Bukkit API で revoke、オフラインプレイヤーはワールドの
     * advancements/*.json から advquesting:* キーを直接削除する。
     */
    public void unloadAll() {
        // オンラインプレイヤーの criteria を revoke
        for (Player player : Bukkit.getOnlinePlayers()) {
            revokeAllAdvQuestingCriteriaForPlayer(player);
        }
        // 全プレイヤーのアドバンスメントファイルから advquesting:* を削除
        cleanAllPlayerAdvancementFiles();
        // Advancement を unload
        removeAdvancementSafe(rootKey());
        for (Quest quest : questManager.loadAll()) {
            removeAdvancementSafe(questKey(quest.id));
        }
    }

    /** 指定プレイヤーの advquesting:* に関する criteria を全て revoke する。*/
    private void revokeAllAdvQuestingCriteriaForPlayer(Player player) {
        Advancement root = Bukkit.getAdvancement(rootKey());
        if (root != null) {
            AdvancementProgress ap = player.getAdvancementProgress(root);
            for (String c : new HashSet<>(ap.getAwardedCriteria())) ap.revokeCriteria(c);
        }
        for (Quest quest : questManager.loadAll()) {
            revokeAllCriteriaForPlayer(player, quest.id);
        }
    }

    /**
     * ワールドの advancements/*.json から advquesting:* キーを削除する。
     * オフラインプレイヤーのデータを含む全ファイルを対象とする。
     */
    private void cleanAllPlayerAdvancementFiles() {
        if (Bukkit.getWorlds().isEmpty()) return;
        File advFolder = new File(Bukkit.getWorlds().get(0).getWorldFolder(), "advancements");
        AdvancementFileCleaner.cleanFolder(advFolder, NAMESPACE, log);
    }

    /**
     * クエスト作成/更新時に呼ぶ。Bukkit main thread から呼ぶこと。
     * public なら再登録し全オンラインプレイヤーの進捗を同期する。
     */
    public void syncQuest(Quest quest) {
        removeAdvancementSafe(questKey(quest.id));
        if ("public".equals(quest.status)) {
            loadQuestAdvancement(quest);
            for (Player player : Bukkit.getOnlinePlayers()) {
                syncAllQuestsForPlayer(player);
            }
        } else {
            for (Player player : Bukkit.getOnlinePlayers()) {
                revokeAllCriteriaForPlayer(player, quest.id);
            }
        }
    }

    /**
     * クエスト削除時に呼ぶ。Bukkit main thread から呼ぶこと。
     * 全オンラインプレイヤーの criteria を revoke してから Advancement を削除する。
     */
    public void removeQuest(int questId) {
        NamespacedKey key = questKey(questId);
        Advancement adv = Bukkit.getAdvancement(key);
        if (adv != null) {
            for (Player player : Bukkit.getOnlinePlayers()) {
                AdvancementProgress ap = player.getAdvancementProgress(adv);
                for (String criterion : new HashSet<>(ap.getAwardedCriteria())) {
                    ap.revokeCriteria(criterion);
                }
            }
        }
        removeAdvancementSafe(key);
    }

    /**
     * 指定プレイヤーの指定クエストの criterion 状態を progressJson に合わせて同期する。
     * Javalin スレッドから呼ばれるため Bukkit main thread に委譲する。
     */
    public void syncPlayerQuestProgress(String playerUuid, Quest quest, String progressJson) {
        Player player = Bukkit.getPlayer(java.util.UUID.fromString(playerUuid));
        if (player == null) return;
        NamespacedKey key = questKey(quest.id);
        Advancement adv = Bukkit.getAdvancement(key);
        if (adv == null) return;

        Bukkit.getScheduler().runTask(plugin, () ->
            applyProgressToPlayer(player, adv, quest, progressJson));
    }

    /**
     * ログイン時・リロード時・定義変更時に全クエストの進捗を一括同期する。Bukkit main thread から呼ぶこと。
     *
     * NMS の PlayerAdvancements に進捗をサイレントに書き込み、save()+reload() で
     * reset パケットとして再送する。reset パケットはクライアント側でトーストを出さない
     * （バニラのログイン時と同じ挙動）ため、達成済みクエストのトースト連発を防げる。
     * また reload() は最新の Advancement 定義も含めて送るため、リロード後の即時反映
     * （定義の再送）も同時に達成される。
     */
    public void syncAllQuestsForPlayer(Player player) {
        if (nmsBridge.resyncPlayerSilently(player)) return;
        // NMS リフレクションが失敗した場合は Bukkit API でフォールバック（トーストが出る可能性あり）
        fallbackBukkitSync(player);
    }

    /** NMS リフレクション不可時のフォールバック。Bukkit API で進捗を同期する（トーストが出る場合あり）。*/
    private void fallbackBukkitSync(Player player) {
        grantRootCriterion(player);
        String playerUuid = player.getUniqueId().toString();
        for (Quest quest : questManager.loadAll()) {
            if (!"public".equals(quest.status)) continue;
            NamespacedKey key = questKey(quest.id);
            Advancement adv = Bukkit.getAdvancement(key);
            if (adv == null) continue;
            try {
                ProgressDao.ProgressRecord rec = progressDao.findByPlayerAndQuest(playerUuid, quest.id);
                applyProgressToPlayer(player, adv, quest, rec != null ? rec.progress() : null);
            } catch (Exception e) {
                log.warning("fallbackBukkitSync error for quest " + quest.id + ": " + e.getMessage());
            }
        }
    }

    // ---- private helpers ----

    private void loadRoot() {
        NamespacedKey key = rootKey();
        removeAdvancementSafe(key);
        try {
            Bukkit.getUnsafe().loadAdvancement(key, jsonBuilder.buildRootJson());
        } catch (Exception e) {
            log.warning("Failed to load root advancement: " + e.getMessage());
        }
    }

    private void loadQuestAdvancement(Quest quest) {
        removeAdvancementSafe(questKey(quest.id));
        try {
            Bukkit.getUnsafe().loadAdvancement(questKey(quest.id), jsonBuilder.buildAdvancementJson(quest));
        } catch (Exception e) {
            log.warning("Failed to load advancement for quest " + quest.id + ": " + e.getMessage());
        }
    }

    private void grantRootCriterion(Player player) {
        Advancement root = Bukkit.getAdvancement(rootKey());
        if (root == null) return;
        player.getAdvancementProgress(root).awardCriteria("root");
    }

    private void revokeAllCriteriaForPlayer(Player player, int questId) {
        Advancement adv = Bukkit.getAdvancement(questKey(questId));
        if (adv == null) return;
        AdvancementProgress ap = player.getAdvancementProgress(adv);
        for (String criterion : new HashSet<>(ap.getAwardedCriteria())) {
            ap.revokeCriteria(criterion);
        }
    }

    private void applyProgressToPlayer(Player player, Advancement adv, Quest quest, String progressJson) {
        if (quest.conditions == null || quest.conditions.isEmpty()) return;
        Map<String, Boolean> completedMap = AdvancementJsonBuilder.parseProgress(progressJson);
        AdvancementProgress ap = player.getAdvancementProgress(adv);
        for (Map<String, Object> cond : quest.conditions) {
            String condId = (String) cond.get("id");
            if (condId == null) continue;
            String criterionName = "c_" + AdvancementJsonBuilder.sanitizeCriterionName(condId);
            boolean shouldAward = completedMap.getOrDefault(condId, false);
            boolean isAwarded = ap.getAwardedCriteria().contains(criterionName);
            if (shouldAward && !isAwarded) {
                ap.awardCriteria(criterionName);
            } else if (!shouldAward && isAwarded) {
                ap.revokeCriteria(criterionName);
            }
        }
    }

    private void removeAdvancementSafe(NamespacedKey key) {
        // Bukkit API で削除を試みる (ディスクのデータパックファイルを削除するだけ)
        try {
            Bukkit.getUnsafe().removeAdvancement(key);
        } catch (Exception ignored) {}
        // Paper 1.21+ の removeAdvancement はファイル削除のみで in-memory レジストリに反映されない。
        NmsAdvancementBridge.removeFromRegistry(key, log);
    }

    private NamespacedKey questKey(int questId) {
        return new NamespacedKey(NAMESPACE, "q" + questId);
    }

    private NamespacedKey rootKey() {
        return new NamespacedKey(NAMESPACE, "root");
    }
}
