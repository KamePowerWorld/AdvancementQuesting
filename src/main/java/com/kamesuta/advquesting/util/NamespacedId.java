package com.kamesuta.advquesting.util;

import org.bukkit.Material;
import org.bukkit.Keyed;
import org.bukkit.NamespacedKey;
import org.bukkit.Statistic;
import org.jetbrains.annotations.NotNull;

/**
 * Minecraftの名前空間付きID ("minecraft:stone") を表す不変クラス。
 *
 * <p>このクラスの目的は、プロジェクト全体でID形式を統一することにより、
 * "minecraft:" プレフィックスの有無によるバグを仕組み的に防止することです。
 *
 * <p>{@code namespace:path} 形式（例: "minecraft:stone"）のみを使用します。
 * TypeScript側で入力を正規化し、Java側では常に完全形式が前提となります。
 */
public final class NamespacedId {

    private final String namespace;
    private final String path;

    private NamespacedId(String namespace, String path) {
        if (namespace == null || namespace.isEmpty()) {
            throw new IllegalArgumentException("namespace must not be null or empty");
        }
        if (path == null || path.isEmpty()) {
            throw new IllegalArgumentException("path must not be null or empty");
        }
        this.namespace = namespace;
        this.path = path;
    }

    /**
     * namespace と path からインスタンスを構築します。
     *
     * @param namespace 名前空間 (例: "minecraft")
     * @param path パス (例: "stone")
     * @return NamespacedId インスタンス
     */
    public static NamespacedId of(String namespace, String path) {
        return new NamespacedId(namespace, path);
    }

    /**
     * Keyed オブジェクト (Material, EntityType, Statistic 等) から NamespacedId を構築します。
     * これが「minecraft:」プレフィックスを確実に取得する唯一の正しい方法です。
     *
     * <p>⚠️ 使用禁止: {@code keyed.getKey().getKey()} は namespace を失います。
     * 使用禁止: {@code "minecraft:" + keyed.getKey().getKey()} は冗長で間違いやすいです。
     *
     * @param keyed Material, EntityType, Statistic 等
     * @return NamespacedId インスタンス
     */
    public static NamespacedId from(Keyed keyed) {
        NamespacedKey key = keyed.getKey();
        return new NamespacedId(key.getNamespace(), key.getKey());
    }

    /**
     * UNTYPED (カスタム統計) の Statistic を vanilla の統計ID に変換します。
     *
     * <p>⚠️ {@link #from(Keyed)} を Statistic に使ってはいけません。
     * Paper の {@code Statistic.getKey()} は enum 名を小文字化するだけで、
     * vanilla の統計ID とは一致しません (例: CHEST_OPENED → "chest_opened" だが
     * vanilla は "open_chest")。Web UI は vanilla レジストリ
     * (web/public/mc/registry/custom_stat.json) のIDでクエスト条件を保存するため、
     * ここで全件明示的にマッピングします。
     *
     * @param stat カスタム統計 (Type.UNTYPED)
     * @return vanilla ID の NamespacedId、UNTYPED でない場合は null
     */
    public static NamespacedId fromCustomStatistic(Statistic stat) {
        String path = switch (stat) {
            case ANIMALS_BRED -> "animals_bred";
            case AVIATE_ONE_CM -> "aviate_one_cm";
            case BELL_RING -> "bell_ring";
            case BOAT_ONE_CM -> "boat_one_cm";
            case ARMOR_CLEANED -> "clean_armor";
            case BANNER_CLEANED -> "clean_banner";
            case CLEAN_SHULKER_BOX -> "clean_shulker_box";
            case CLIMB_ONE_CM -> "climb_one_cm";
            case CROUCH_ONE_CM -> "crouch_one_cm";
            case DAMAGE_ABSORBED -> "damage_absorbed";
            case DAMAGE_BLOCKED_BY_SHIELD -> "damage_blocked_by_shield";
            case DAMAGE_DEALT -> "damage_dealt";
            case DAMAGE_DEALT_ABSORBED -> "damage_dealt_absorbed";
            case DAMAGE_DEALT_RESISTED -> "damage_dealt_resisted";
            case DAMAGE_RESISTED -> "damage_resisted";
            case DAMAGE_TAKEN -> "damage_taken";
            case DEATHS -> "deaths";
            case DROP_COUNT -> "drop";
            case CAKE_SLICES_EATEN -> "eat_cake_slice";
            case ITEM_ENCHANTED -> "enchant_item";
            case FALL_ONE_CM -> "fall_one_cm";
            case CAULDRON_FILLED -> "fill_cauldron";
            case FISH_CAUGHT -> "fish_caught";
            case FLY_ONE_CM -> "fly_one_cm";
            case HAPPY_GHAST_ONE_CM -> "happy_ghast_one_cm";
            case HORSE_ONE_CM -> "horse_one_cm";
            case DISPENSER_INSPECTED -> "inspect_dispenser";
            case DROPPER_INSPECTED -> "inspect_dropper";
            case HOPPER_INSPECTED -> "inspect_hopper";
            case INTERACT_WITH_ANVIL -> "interact_with_anvil";
            case BEACON_INTERACTION -> "interact_with_beacon";
            case INTERACT_WITH_BLAST_FURNACE -> "interact_with_blast_furnace";
            case BREWINGSTAND_INTERACTION -> "interact_with_brewingstand";
            case INTERACT_WITH_CAMPFIRE -> "interact_with_campfire";
            case INTERACT_WITH_CARTOGRAPHY_TABLE -> "interact_with_cartography_table";
            case CRAFTING_TABLE_INTERACTION -> "interact_with_crafting_table";
            case FURNACE_INTERACTION -> "interact_with_furnace";
            case INTERACT_WITH_GRINDSTONE -> "interact_with_grindstone";
            case INTERACT_WITH_LECTERN -> "interact_with_lectern";
            case INTERACT_WITH_LOOM -> "interact_with_loom";
            case INTERACT_WITH_SMITHING_TABLE -> "interact_with_smithing_table";
            case INTERACT_WITH_SMOKER -> "interact_with_smoker";
            case INTERACT_WITH_STONECUTTER -> "interact_with_stonecutter";
            case JUMP -> "jump";
            case LEAVE_GAME -> "leave_game";
            case MINECART_ONE_CM -> "minecart_one_cm";
            case MOB_KILLS -> "mob_kills";
            case NAUTILUS_ONE_CM -> "nautilus_one_cm";
            case OPEN_BARREL -> "open_barrel";
            case CHEST_OPENED -> "open_chest";
            case ENDERCHEST_OPENED -> "open_enderchest";
            case SHULKER_BOX_OPENED -> "open_shulker_box";
            case PIG_ONE_CM -> "pig_one_cm";
            case NOTEBLOCK_PLAYED -> "play_noteblock";
            case RECORD_PLAYED -> "play_record";
            case PLAY_ONE_MINUTE -> "play_time";
            case PLAYER_KILLS -> "player_kills";
            case FLOWER_POTTED -> "pot_flower";
            case RAID_TRIGGER -> "raid_trigger";
            case RAID_WIN -> "raid_win";
            case SLEEP_IN_BED -> "sleep_in_bed";
            case SNEAK_TIME -> "sneak_time";
            case SPRINT_ONE_CM -> "sprint_one_cm";
            case STRIDER_ONE_CM -> "strider_one_cm";
            case SWIM_ONE_CM -> "swim_one_cm";
            case TALKED_TO_VILLAGER -> "talked_to_villager";
            case TARGET_HIT -> "target_hit";
            case TIME_SINCE_DEATH -> "time_since_death";
            case TIME_SINCE_REST -> "time_since_rest";
            case TOTAL_WORLD_TIME -> "total_world_time";
            case TRADED_WITH_VILLAGER -> "traded_with_villager";
            case TRAPPED_CHEST_TRIGGERED -> "trigger_trapped_chest";
            case NOTEBLOCK_TUNED -> "tune_noteblock";
            case CAULDRON_USED -> "use_cauldron";
            case WALK_ON_WATER_ONE_CM -> "walk_on_water_one_cm";
            case WALK_ONE_CM -> "walk_one_cm";
            case WALK_UNDER_WATER_ONE_CM -> "walk_under_water_one_cm";
            default -> null;
        };
        return path == null ? null : new NamespacedId("minecraft", path);
    }

    /**
     * アイテム/ブロック/エンティティ系の Statistic を "minecraft:mined" 等の
     * statType ID に変換します。対象外の統計は null を返します。
     */
    public static NamespacedId fromStatType(Statistic stat) {
        String path = switch (stat) {
            case MINE_BLOCK         -> "mined";
            case CRAFT_ITEM         -> "crafted";
            case USE_ITEM           -> "used";
            case BREAK_ITEM         -> "broken";
            case PICKUP             -> "picked_up";
            case DROP               -> "dropped";
            case KILL_ENTITY        -> "killed";
            case ENTITY_KILLED_BY   -> "killed_by";
            default                 -> null;
        };
        return path == null ? null : new NamespacedId("minecraft", path);
    }

    /**
     * 完全なID文字列 ("namespace:path") を厳密にパースします。
     * コロンが含まれていない場合は例外をスローします。
     *
     * <p>TypeScript側から送信されるAPIレスポンス等、既に完全な形式であることが保証されている文字列用です。
     *
     * @param fullId "minecraft:stone" のような完全なID文字列
     * @return NamespacedId インスタンス
     * @throws IllegalArgumentException コロンが含まれていない場合
     */
    public static NamespacedId parse(String fullId) {
        if (fullId == null || fullId.isEmpty()) {
            throw new IllegalArgumentException("fullId must not be null or empty");
        }
        int colonIndex = fullId.indexOf(':');
        if (colonIndex < 0) {
            throw new IllegalArgumentException("Invalid NamespacedId (missing ':'): " + fullId);
        }
        String namespace = fullId.substring(0, colonIndex);
        String path = fullId.substring(colonIndex + 1);
        if (namespace.isEmpty() || path.isEmpty()) {
            throw new IllegalArgumentException("Invalid NamespacedId (empty namespace or path): " + fullId);
        }
        return new NamespacedId(namespace, path);
    }

    /** 名前空間を返します。 */
    public String namespace() {
        return namespace;
    }

    /** パスを返します。 */
    public String path() {
        return path;
    }

    /**
     * この NamespacedId を Bukkit の Material に解決します。
     *
     * <p>Material.matchMaterial() は名前空間なしの文字列（例: "DIAMOND"）を要求するため、
     * path のみを大文字変換して渡します。namespace は無視されます（Bukkit API の制約）。
     *
     * @return 対応する Material、見つからなければ null
     */
    public Material resolveMaterial() {
        return Material.matchMaterial(path().toUpperCase());
    }

    /**
     * "namespace:path" 形式の文字列を返します。
     * API境界等で文字列出力が必要な場合のみ使用してください。
     */
    @Override
    public String toString() {
        return namespace + ":" + path;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof NamespacedId that)) return false;
        return namespace.equals(that.namespace) && path.equals(that.path);
    }

    @Override
    public int hashCode() {
        return toString().hashCode();
    }
}
