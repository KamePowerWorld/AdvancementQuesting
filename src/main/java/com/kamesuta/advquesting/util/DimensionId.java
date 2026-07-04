package com.kamesuta.advquesting.util;

import org.bukkit.Keyed;
import org.bukkit.NamespacedKey;

/**
 * Minecraft のディメンション ID を表す enum。
 *
 * <p>NamespacedId とは異なり、"minecraft:" プレフィックスは含みません。
 * 代わりに、Bukkit の World.getKey() が返すパス（"the_nether", "the_end" 等）に
 * 対応する enum 定数を持ちます。
 *
 * <p>API レスポンス等で使用する正規化名（"nether", "end"）への変換も提供します。
 */
public enum DimensionId {
    /**
     * オーバーワールド。
     * Bukkit のキー: "overworld"
     * 正規化名: "overworld"
     */
    OVERWORLD("overworld"),
    /**
     * ネザー。
     * Bukkit のキー: "the_nether"
     * 正規化名: "nether"
     */
    NETHER("the_nether"),
    /**
     * エンド。
     * Bukkit のキー: "the_end"
     * 正規化名: "end"
     */
    THE_END("the_end");

    private final String key;

    DimensionId(String key) {
        this.key = key;
    }

    /**
     * Bukkit の NamespacedKey から DimensionId を取得します。
     *
     * @param keyed World 等 Keyed オブジェクト
     * @return 対応する DimensionId
     */
    public static DimensionId from(Keyed keyed) {
        NamespacedKey namespacedKey = keyed.getKey();
        // namespace は "minecraft" の前提で、path のみで判定
        String path = namespacedKey.getKey();
        return switch (path) {
            case "the_nether" -> NETHER;
            case "the_end" -> THE_END;
            default -> OVERWORLD; // "overworld" または未知のキーは OVERWORLD とみなす
        };
    }

    /**
     * Bukkit のキー（"the_nether", "the_end" 等）を返します。
     */
    public String key() {
        return key;
    }

    /**
     * API レスポンス等で使用する正規化名を返します。
     * - OVERWORLD -> "overworld"
     * - NETHER -> "nether"
     * - THE_END -> "end"
     */
    public String normalize() {
        return switch (this) {
            case NETHER -> "nether";
            case THE_END -> "end";
            case OVERWORLD -> "overworld";
        };
    }
}
