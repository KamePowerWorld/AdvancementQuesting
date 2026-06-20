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

    // イベントハンドラから毎回ディスクI/Oが発生しないようにオンメモリキャッシュを持つ。
    // create/update/delete 後にのみ無効化される。
    private volatile List<Quest> cache = null;

    public QuestManager(File dataFolder) {
        this.questsDir = new File(dataFolder, "quests");
        questsDir.mkdirs();
    }

    public List<Quest> loadAll() {
        if (cache != null) return cache;
        lock.readLock().lock();
        try {
            if (cache != null) return cache;
            cache = loadFromDisk();
            return cache;
        } finally {
            lock.readLock().unlock();
        }
    }

    private List<Quest> loadFromDisk() {
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
    }

    private void invalidateCache() {
        cache = null;
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
            int nextId = loadFromDisk().stream().mapToInt(q -> q.id).max().orElse(0) + 1;
            quest.id = nextId;
            String now = Instant.now().toString();
            quest.createdAt = now;
            quest.updatedAt = now;
            MAPPER.writeValue(file(quest), quest);
            invalidateCache();
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
            if (patch.subtitle != null)     existing.subtitle = patch.subtitle;
            if (patch.creatorName != null)  existing.creatorName = patch.creatorName;
            if (patch.creatorUuid != null)  existing.creatorUuid = patch.creatorUuid;
            // repeat は null（なし）も含めて常に上書き
            existing.repeat = patch.repeat;
            existing.updatedAt = Instant.now().toString();
            // タイトルが変わるとファイル名も変わる → 旧ファイル削除
            f.delete();
            MAPPER.writeValue(file(existing), existing);
            invalidateCache();
            return existing;
        } finally {
            lock.writeLock().unlock();
        }
    }

    public boolean delete(int id) {
        lock.writeLock().lock();
        try {
            File f = findFile(id);
            if (f != null && f.delete()) {
                invalidateCache();
                return true;
            }
            return false;
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
