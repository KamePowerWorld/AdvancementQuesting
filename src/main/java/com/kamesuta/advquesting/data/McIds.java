package com.kamesuta.advquesting.data;

/** Minecraft の ID 文字列 ("minecraft:diamond" 等) の共通処理。純ロジック (Bukkit 非依存)。 */
public final class McIds {

    private McIds() {}

    /** 名前空間を除去する: "minecraft:diamond" → "diamond"。名前空間なしはそのまま返す。 */
    public static String stripNamespace(String id) {
        return id.contains(":") ? id.substring(id.indexOf(':') + 1) : id;
    }
}
