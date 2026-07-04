package com.kamesuta.advquesting.util;

import org.bukkit.Material;
import org.bukkit.Keyed;
import org.bukkit.NamespacedKey;
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
