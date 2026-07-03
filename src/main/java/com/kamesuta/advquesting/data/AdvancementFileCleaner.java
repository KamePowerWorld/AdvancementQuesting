package com.kamesuta.advquesting.data;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.File;
import java.nio.file.Files;
import java.util.Map;
import java.util.logging.Logger;

/**
 * ワールドのアドバンスメントファイルから特定名前空間のキーを削除するユーティリティ。
 * Bukkit への依存を持たない静的メソッド群。
 */
public class AdvancementFileCleaner {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private AdvancementFileCleaner() {}

    /**
     * 指定フォルダ内のすべての *.json ファイルから指定名前空間のキーを削除する。
     *
     * @param advFolder アドバンスメントフォルダ (例: world/advancements)
     * @param namespace 削除する名前空間 (例: "advquesting")
     * @param log       警告ログ出力先
     */
    public static void cleanFolder(File advFolder, String namespace, Logger log) {
        if (advFolder == null || !advFolder.isDirectory()) return;
        File[] files = advFolder.listFiles((dir, name) -> name.endsWith(".json"));
        if (files == null) return;
        for (File file : files) {
            try {
                removeNamespaceKeys(file, namespace);
            } catch (Exception e) {
                log.warning("進捗ファイルのクリーンアップ失敗 " + file.getName() + ": " + e.getMessage());
            }
        }
    }

    /**
     * 指定ファイルから指定名前空間のキーを削除する。
     *
     * @param file      対象 JSON ファイル
     * @param namespace 削除する名前空間
     * @return ファイルが変更された場合 true
     */
    @SuppressWarnings("unchecked")
    public static boolean removeNamespaceKeys(File file, String namespace) throws Exception {
        String content = Files.readString(file.toPath());
        Map<String, Object> data = MAPPER.readValue(content, new TypeReference<Map<String, Object>>() {});
        boolean changed = data.entrySet().removeIf(e -> e.getKey().startsWith(namespace + ":"));
        if (changed) {
            Files.writeString(file.toPath(), MAPPER.writeValueAsString(data));
        }
        return changed;
    }
}
