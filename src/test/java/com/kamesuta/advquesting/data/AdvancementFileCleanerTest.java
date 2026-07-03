package com.kamesuta.advquesting.data;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.File;
import java.nio.file.Files;

import static org.junit.jupiter.api.Assertions.*;

/** {@link AdvancementFileCleaner} のキャラクタリゼーションテスト。 */
class AdvancementFileCleanerTest {

    @TempDir
    File tempDir;

    @Test
    void removeNamespaceKeys_removesAdvquestingKeysLeavesOthers() throws Exception {
        // File with both advquesting:* and minecraft:* keys
        String content = "{\"advquesting:q1\":{},\"advquesting:q2\":{},\"minecraft:story/root\":{}}";
        File file = new File(tempDir, "player1.json");
        Files.writeString(file.toPath(), content);

        boolean changed = AdvancementFileCleaner.removeNamespaceKeys(file, "advquesting");

        assertTrue(changed, "Should return true when keys are removed");
        String result = Files.readString(file.toPath());
        assertFalse(result.contains("advquesting:"), "advquesting keys should be removed");
        assertTrue(result.contains("minecraft:story/root"), "minecraft keys should be kept");
    }

    @Test
    void removeNamespaceKeys_noMatchingKeys_returnsFalse() throws Exception {
        String content = "{\"minecraft:story/root\":{},\"minecraft:nether/root\":{}}";
        File file = new File(tempDir, "player2.json");
        Files.writeString(file.toPath(), content);

        boolean changed = AdvancementFileCleaner.removeNamespaceKeys(file, "advquesting");

        assertFalse(changed, "Should return false when nothing changed");
        // File content should be unchanged
        String result = Files.readString(file.toPath());
        assertTrue(result.contains("minecraft:story/root"));
    }

    @Test
    void removeNamespaceKeys_emptyFile_returnsFalse() throws Exception {
        String content = "{}";
        File file = new File(tempDir, "empty.json");
        Files.writeString(file.toPath(), content);

        boolean changed = AdvancementFileCleaner.removeNamespaceKeys(file, "advquesting");

        assertFalse(changed);
    }

    @Test
    void cleanFolder_processesAllJsonFiles() throws Exception {
        File f1 = new File(tempDir, "uuid1.json");
        File f2 = new File(tempDir, "uuid2.json");
        Files.writeString(f1.toPath(), "{\"advquesting:q1\":{}}");
        Files.writeString(f2.toPath(), "{\"advquesting:q2\":{}}");

        AdvancementFileCleaner.cleanFolder(tempDir, "advquesting", java.util.logging.Logger.getLogger("test"));

        assertFalse(Files.readString(f1.toPath()).contains("advquesting:"));
        assertFalse(Files.readString(f2.toPath()).contains("advquesting:"));
    }

    @Test
    void cleanFolder_nullFolder_noException() {
        assertDoesNotThrow(() ->
            AdvancementFileCleaner.cleanFolder(null, "advquesting",
                java.util.logging.Logger.getLogger("test")));
    }

    @Test
    void cleanFolder_nonexistentFolder_noException() {
        File nonexistent = new File(tempDir, "does_not_exist");
        assertDoesNotThrow(() ->
            AdvancementFileCleaner.cleanFolder(nonexistent, "advquesting",
                java.util.logging.Logger.getLogger("test")));
    }
}
