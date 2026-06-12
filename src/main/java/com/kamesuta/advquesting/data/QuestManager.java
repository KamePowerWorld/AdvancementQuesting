package com.kamesuta.advquesting.data;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;

import java.io.File;
import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.locks.ReadWriteLock;
import java.util.concurrent.locks.ReentrantReadWriteLock;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * クエスト JSON ファイルの CRUD。
 * ファイル名形式: "00001_基本.json"
 */
public class QuestManager {

    private static final Pattern FILE_PATTERN = Pattern.compile("^(\\d+)_.*\\.json$");
    private static final ObjectMapper MAPPER = new ObjectMapper()
            .enable(SerializationFeature.INDENT_OUTPUT);

    private final File questsDir;
    private final ReadWriteLock lock = new ReentrantReadWriteLock();

    public QuestManager(File dataFolder) {
        this.questsDir = new File(dataFolder, "quests");
        questsDir.mkdirs();
    }

    public List<Quest> loadAll() {
        lock.readLock().lock();
        try {
            File[] files = questsDir.listFiles(f -> FILE_PATTERN.matcher(f.getName()).matches());
            if (files == null) return Collections.emptyList();
            Arrays.sort(files);
            List<Quest> result = new ArrayList<>();
            for (File f : files) {
                try {
                    result.add(MAPPER.readValue(f, Quest.class));
                } catch (IOException e) {
                    // 壊れたファイルはスキップ
                }
            }
            return result;
        } finally {
            lock.readLock().unlock();
        }
    }

    public Quest findById(int id) {
        lock.readLock().lock();
        try {
            File f = findFile(id);
            if (f == null) return null;
            return MAPPER.readValue(f, Quest.class);
        } catch (IOException e) {
            return null;
        } finally {
            lock.readLock().unlock();
        }
    }

    /**
     * 新規クエストを保存して採番した id を返す。
     * 既存の最大 id + 1 を割り当てる。
     */
    public Quest create(Quest quest) throws IOException {
        lock.writeLock().lock();
        try {
            int nextId = loadAll().stream().mapToInt(q -> q.id).max().orElse(0) + 1;
            quest.id = nextId;
            String now = Instant.now().toString();
            quest.createdAt = now;
            quest.updatedAt = now;
            MAPPER.writeValue(file(quest), quest);
            return quest;
        } finally {
            lock.writeLock().unlock();
        }
    }

    public Quest update(int id, Quest patch) throws IOException {
        lock.writeLock().lock();
        try {
            File f = findFile(id);
            if (f == null) return null;
            Quest existing = MAPPER.readValue(f, Quest.class);
            // 指定されたフィールドだけ上書き (null は保持)
            if (patch.title != null)        existing.title = patch.title;
            if (patch.description != null)  existing.description = patch.description;
            if (patch.icon != null)         existing.icon = patch.icon;
            if (patch.category != null)     existing.category = patch.category;
            if (patch.prerequisites != null) existing.prerequisites = patch.prerequisites;
            if (patch.conditions != null)   existing.conditions = patch.conditions;
            if (patch.rewards != null)      existing.rewards = patch.rewards;
            if (patch.mapPosition != null)  existing.mapPosition = patch.mapPosition;
            if (patch.customButtons != null) existing.customButtons = patch.customButtons;
            if (patch.status != null)       existing.status = patch.status;
            existing.updatedAt = Instant.now().toString();
            // タイトルが変わるとファイル名も変わる → 旧ファイル削除
            f.delete();
            MAPPER.writeValue(file(existing), existing);
            return existing;
        } finally {
            lock.writeLock().unlock();
        }
    }

    public boolean delete(int id) {
        lock.writeLock().lock();
        try {
            File f = findFile(id);
            return f != null && f.delete();
        } finally {
            lock.writeLock().unlock();
        }
    }

    // ---- ヘルパー ----

    private File file(Quest q) {
        String safeName = q.title == null ? "quest" : q.title.replaceAll("[\\\\/:*?\"<>|]", "_");
        return new File(questsDir, String.format("%05d_%s.json", q.id, safeName));
    }

    private File findFile(int id) {
        File[] files = questsDir.listFiles(f -> {
            Matcher m = FILE_PATTERN.matcher(f.getName());
            return m.matches() && Integer.parseInt(m.group(1)) == id;
        });
        return (files != null && files.length > 0) ? files[0] : null;
    }
}
