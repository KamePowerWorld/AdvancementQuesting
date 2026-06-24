package com.kamesuta.advquesting.data;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;

import java.io.File;
import java.io.IOException;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.locks.ReadWriteLock;
import java.util.concurrent.locks.ReentrantReadWriteLock;
import java.util.logging.Logger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * クエストラインを管理するトップレベルクラス。
 *
 * フォルダ構造:
 *   questlines/
 *     01_a1b2c3d4_メインクエストライン/
 *       map.json        … Questline.MapFile (icon, nodes)
 *       quests/
 *         a3f7b2c1_基本クエスト.json   … Quest
 *
 * 起動時に旧 quests/ フォルダが存在すれば自動マイグレーション。
 * コマンド用整数はクエストラインの order 順 × map.json の nodes 配列順で採番（メモリ内のみ）。
 */
public class QuestlineManager {

    /** クエストラインフォルダ名パターン: {2桁順序}_{8桁ID}_{日本語名} */
    private static final Pattern FOLDER_PATTERN = Pattern.compile("^(\\d{2})_([a-z0-9]{8})_(.+)$");

    /** クエストファイル名パターン: {8桁ID}_{タイトル}.json */
    private static final Pattern QUEST_FILE_PATTERN = Pattern.compile("^([a-z0-9]{8})_.*\\.json$");

    /** 旧クエストファイル名パターン: {整数ID}_{タイトル}.json */
    private static final Pattern LEGACY_QUEST_FILE_PATTERN = Pattern.compile("^(\\d+)_.*\\.json$");

    private static final String ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
    private static final int ID_LENGTH = 8;
    private static final ObjectMapper MAPPER = new ObjectMapper()
            .enable(SerializationFeature.INDENT_OUTPUT);

    private final File dataFolder;
    private final File questlinesDir;
    private final Logger log;
    private final ReadWriteLock lock = new ReentrantReadWriteLock();

    /** クエストラインキャッシュ */
    private volatile List<Questline> cache = null;

    /** コマンド番号 → (questlineId, questId) のマッピング（メモリ内のみ） */
    private volatile Map<Integer, QuestRef> commandMap = Collections.emptyMap();

    /** コマンド番号検索用の逆引きマップ */
    private volatile Map<String, Integer> commandNumberMap = Collections.emptyMap();

    public record QuestRef(String questlineId, String questId) {
        public String commandKey() {
            return questlineId + "/" + questId;
        }
    }

    public QuestlineManager(File dataFolder, Logger log) {
        this.dataFolder = dataFolder;
        this.questlinesDir = new File(dataFolder, "questlines");
        this.log = log;
    }

    /** 起動時に呼ぶ。旧フォーマットのマイグレーションとコマンドマップ構築を行う */
    public void init() {
        questlinesDir.mkdirs();
        File legacyDir = new File(dataFolder, "quests");
        if (legacyDir.exists() && legacyDir.isDirectory()) {
            migrateFromLegacy(legacyDir);
        }
        buildCommandMap();
    }

    // ---- クエストライン読み込み ----

    /** 全クエストラインを取得（キャッシュあり） */
    public List<Questline> loadAllQuestlines() {
        if (cache != null) return cache;
        lock.readLock().lock();
        try {
            if (cache != null) return cache;
            cache = loadQuestlinesFromDisk();
            return cache;
        } finally {
            lock.readLock().unlock();
        }
    }

    /** 全クエストを取得（全クエストラインを結合） */
    public List<Quest> loadAll() {
        return loadAllQuestlines().stream()
                .flatMap(ql -> ql.quests.stream())
                .collect(Collectors.toList());
    }

    /** 指定クエストラインのクエストを取得 */
    public List<Quest> loadByQuestline(String questlineId) {
        return loadAllQuestlines().stream()
                .filter(ql -> questlineId.equals(ql.id))
                .findFirst()
                .map(ql -> ql.quests)
                .orElse(Collections.emptyList());
    }

    /** questlineId + questId でクエストを検索 */
    public Quest findById(String questlineId, String questId) {
        return loadAllQuestlines().stream()
                .filter(ql -> questlineId.equals(ql.id))
                .findFirst()
                .flatMap(ql -> ql.quests.stream().filter(q -> questId.equals(q.id)).findFirst())
                .orElse(null);
    }

    // ---- コマンド番号 ----

    /** コマンド番号 → QuestRef の解決（null なら番号が存在しない） */
    public QuestRef resolveCommandNumber(int n) {
        return commandMap.get(n);
    }

    /** questlineId + questId → コマンド番号（0 なら未採番） */
    public int getCommandNumber(String questlineId, String questId) {
        return commandNumberMap.getOrDefault(new QuestRef(questlineId, questId).commandKey(), 0);
    }

    // ---- クエスト CRUD ----

    /**
     * 新規クエストを作成し、map.json にも追加する。
     * @param quest 作成するクエスト（id は null でよい、内部で生成する）
     * @param questlineId 追加先クエストラインID
     * @param x マップ上のX座標
     * @param y マップ上のY座標
     */
    public Quest create(Quest quest, String questlineId, double x, double y) throws IOException {
        lock.writeLock().lock();
        try {
            File questlineDir = findQuestlineDir(questlineId);
            if (questlineDir == null) throw new IOException("Questline not found: " + questlineId);

            File questsDir = new File(questlineDir, "quests");
            questsDir.mkdirs();

            // ID生成（重複チェックあり）
            Set<String> existingIds = existingQuestIds(questsDir);
            String newId = generateId(existingIds);

            String now = Instant.now().toString();
            quest.id = newId;
            quest.questlineId = null; // ファイルには保存しない
            quest.mapPosition = null; // ファイルには保存しない
            quest.commandNumber = null;
            quest.createdAt = now;
            quest.updatedAt = now;

            File questFile = questFile(questsDir, quest);
            MAPPER.writeValue(questFile, quest);

            // map.json にノードを追加
            appendNodeToMap(questlineDir, newId, x, y);

            invalidateCache();
            buildCommandMap();

            // キャッシュから返す
            Quest loaded = findById(questlineId, newId);
            return loaded != null ? loaded : quest;
        } finally {
            lock.writeLock().unlock();
        }
    }

    /** クエストを更新する */
    public Quest update(String questlineId, String questId, Quest patch) throws IOException {
        lock.writeLock().lock();
        try {
            File questlineDir = findQuestlineDir(questlineId);
            if (questlineDir == null) return null;

            File questsDir = new File(questlineDir, "quests");
            File f = findQuestFile(questsDir, questId);
            if (f == null) return null;

            Quest existing = MAPPER.readValue(f, Quest.class);
            if (patch.title != null)          existing.title = patch.title;
            if (patch.description != null)    existing.description = patch.description;
            if (patch.icon != null)           existing.icon = patch.icon;
            if (patch.category != null)       existing.category = patch.category;
            if (patch.prerequisites != null)  existing.prerequisites = patch.prerequisites;
            if (patch.conditions != null)     existing.conditions = patch.conditions;
            if (patch.rewards != null)        existing.rewards = patch.rewards;
            if (patch.customButtons != null)  existing.customButtons = patch.customButtons;
            if (patch.status != null)         existing.status = patch.status;
            if (patch.subtitle != null)       existing.subtitle = patch.subtitle;
            if (patch.creatorName != null)    existing.creatorName = patch.creatorName;
            if (patch.creatorUuid != null)    existing.creatorUuid = patch.creatorUuid;
            existing.repeat = patch.repeat;
            existing.updatedAt = Instant.now().toString();

            // ファイル名にタイトルを含むので、タイトル変更時は旧ファイルを削除
            f.delete();
            File newFile = questFile(questsDir, existing);
            MAPPER.writeValue(newFile, existing);

            invalidateCache();
            Quest loaded = findById(questlineId, questId);
            return loaded != null ? loaded : existing;
        } finally {
            lock.writeLock().unlock();
        }
    }

    /** クエストを削除する（map.json からもノードを除去） */
    public boolean delete(String questlineId, String questId) throws IOException {
        lock.writeLock().lock();
        try {
            File questlineDir = findQuestlineDir(questlineId);
            if (questlineDir == null) return false;

            File questsDir = new File(questlineDir, "quests");
            File f = findQuestFile(questsDir, questId);
            if (f == null || !f.delete()) return false;

            // map.json からノードを除去
            removeNodeFromMap(questlineDir, questId);

            invalidateCache();
            buildCommandMap();
            return true;
        } finally {
            lock.writeLock().unlock();
        }
    }

    // ---- マップ更新 ----

    /**
     * クエストラインの map.json を一括更新する（エディタのドラッグ操作後）。
     * nodes の順序がコマンド採番順になる。
     */
    public void updateMap(String questlineId, List<Questline.MapNode> nodes) throws IOException {
        lock.writeLock().lock();
        try {
            File questlineDir = findQuestlineDir(questlineId);
            if (questlineDir == null) throw new IOException("Questline not found: " + questlineId);

            Questline.MapFile mapFile = loadMapFile(questlineDir);
            mapFile.nodes = nodes;
            saveMapFile(questlineDir, mapFile);

            invalidateCache();
            buildCommandMap();
        } finally {
            lock.writeLock().unlock();
        }
    }

    // ---- 内部ヘルパー ----

    private List<Questline> loadQuestlinesFromDisk() {
        File[] dirs = questlinesDir.listFiles(f -> {
            if (!f.isDirectory()) return false;
            return FOLDER_PATTERN.matcher(f.getName()).matches();
        });
        if (dirs == null) return Collections.emptyList();
        Arrays.sort(dirs, Comparator.comparing(File::getName));

        List<Questline> result = new ArrayList<>();
        for (File dir : dirs) {
            Matcher m = FOLDER_PATTERN.matcher(dir.getName());
            if (!m.matches()) continue;

            Questline ql = new Questline();
            ql.order = Integer.parseInt(m.group(1));
            ql.id = m.group(2);
            ql.title = m.group(3);

            // map.json 読み込み
            Questline.MapFile mapFile = loadMapFile(dir);
            ql.icon = mapFile.icon;
            ql.nodes = mapFile.nodes != null ? mapFile.nodes : new ArrayList<>();

            // quests/ フォルダ読み込み
            ql.quests = loadQuestsFromDir(new File(dir, "quests"), ql, mapFile);

            result.add(ql);
        }
        return result;
    }

    private List<Quest> loadQuestsFromDir(File questsDir, Questline ql, Questline.MapFile mapFile) {
        if (!questsDir.exists()) return new ArrayList<>();
        File[] files = questsDir.listFiles(f -> QUEST_FILE_PATTERN.matcher(f.getName()).matches());
        if (files == null) return new ArrayList<>();

        // ファイルをIDでマップ化
        Map<String, Quest> byId = new LinkedHashMap<>();
        for (File f : files) {
            try {
                Quest q = MAPPER.readValue(f, Quest.class);
                q.questlineId = ql.id;
                byId.put(q.id, q);
            } catch (IOException e) {
                // 壊れたファイルはスキップ
            }
        }

        // map.json の nodes 順で mapPosition を設定しながらリストを構築
        List<Quest> ordered = new ArrayList<>();
        Set<String> positioned = new HashSet<>();
        for (Questline.MapNode node : mapFile.nodes) {
            Quest q = byId.get(node.questId);
            if (q != null) {
                Quest.MapPosition pos = new Quest.MapPosition();
                pos.x = node.x;
                pos.y = node.y;
                q.mapPosition = pos;
                ordered.add(q);
                positioned.add(node.questId);
            }
        }
        // map.json に未登録のクエストは末尾に追加
        for (Quest q : byId.values()) {
            if (!positioned.contains(q.id)) {
                ordered.add(q);
            }
        }
        return ordered;
    }

    private Questline.MapFile loadMapFile(File questlineDir) {
        File mapFile = new File(questlineDir, "map.json");
        if (!mapFile.exists()) return new Questline.MapFile();
        try {
            return MAPPER.readValue(mapFile, Questline.MapFile.class);
        } catch (IOException e) {
            return new Questline.MapFile();
        }
    }

    private void saveMapFile(File questlineDir, Questline.MapFile mapFile) throws IOException {
        MAPPER.writeValue(new File(questlineDir, "map.json"), mapFile);
    }

    private void appendNodeToMap(File questlineDir, String questId, double x, double y) throws IOException {
        Questline.MapFile mapFile = loadMapFile(questlineDir);
        Questline.MapNode node = new Questline.MapNode();
        node.questId = questId;
        node.x = x;
        node.y = y;
        mapFile.nodes.add(node);
        saveMapFile(questlineDir, mapFile);
    }

    private void removeNodeFromMap(File questlineDir, String questId) throws IOException {
        Questline.MapFile mapFile = loadMapFile(questlineDir);
        mapFile.nodes.removeIf(n -> questId.equals(n.questId));
        saveMapFile(questlineDir, mapFile);
    }

    private File questFile(File questsDir, Quest q) {
        String safeName = q.title == null ? "quest" : q.title.replaceAll("[\\\\/:*?\"<>|]", "_");
        return new File(questsDir, q.id + "_" + safeName + ".json");
    }

    private File findQuestlineDir(String questlineId) {
        if (!questlinesDir.exists()) return null;
        File[] dirs = questlinesDir.listFiles(f -> {
            if (!f.isDirectory()) return false;
            Matcher m = FOLDER_PATTERN.matcher(f.getName());
            return m.matches() && m.group(2).equals(questlineId);
        });
        return (dirs != null && dirs.length > 0) ? dirs[0] : null;
    }

    private File findQuestFile(File questsDir, String questId) {
        if (!questsDir.exists()) return null;
        File[] files = questsDir.listFiles(f -> {
            Matcher m = QUEST_FILE_PATTERN.matcher(f.getName());
            return m.matches() && m.group(1).equals(questId);
        });
        return (files != null && files.length > 0) ? files[0] : null;
    }

    private Set<String> existingQuestIds(File questsDir) {
        if (!questsDir.exists()) return Collections.emptySet();
        Set<String> ids = new HashSet<>();
        File[] files = questsDir.listFiles(f -> QUEST_FILE_PATTERN.matcher(f.getName()).matches());
        if (files != null) {
            for (File f : files) {
                Matcher m = QUEST_FILE_PATTERN.matcher(f.getName());
                if (m.matches()) ids.add(m.group(1));
            }
        }
        return ids;
    }

    private String generateId(Set<String> existingIds) {
        Random random = new Random();
        for (int attempt = 0; attempt < 1000; attempt++) {
            StringBuilder sb = new StringBuilder(ID_LENGTH);
            for (int i = 0; i < ID_LENGTH; i++) {
                sb.append(ID_CHARS.charAt(random.nextInt(ID_CHARS.length())));
            }
            String id = sb.toString();
            if (!existingIds.contains(id)) return id;
        }
        throw new IllegalStateException("ID 生成に失敗しました（既存ID多数）");
    }

    private void buildCommandMap() {
        Map<Integer, QuestRef> map = new LinkedHashMap<>();
        Map<String, Integer> reverseMap = new HashMap<>();
        int number = 1;
        for (Questline ql : loadAllQuestlines()) {
            for (Quest q : ql.quests) {
                QuestRef ref = new QuestRef(ql.id, q.id);
                map.put(number, ref);
                reverseMap.put(ref.commandKey(), number);
                q.commandNumber = number;
                number++;
            }
        }
        commandMap = Collections.unmodifiableMap(map);
        commandNumberMap = Collections.unmodifiableMap(reverseMap);
    }

    private void invalidateCache() {
        cache = null;
    }

    // ---- 旧フォーマットからのマイグレーション ----

    /**
     * 旧 quests/ フォルダを questlines/01_00000000_メインクエストライン/ に変換する。
     * 変換後は quests/ を quests.bak/ にリネームする。
     */
    private void migrateFromLegacy(File legacyDir) {
        log.info("旧クエストフォルダを新形式にマイグレーション中: " + legacyDir.getPath());

        File[] legacyFiles = legacyDir.listFiles(f -> LEGACY_QUEST_FILE_PATTERN.matcher(f.getName()).matches());
        if (legacyFiles == null || legacyFiles.length == 0) {
            renameLegacyDir(legacyDir);
            return;
        }
        Arrays.sort(legacyFiles);

        // 新クエストラインフォルダを作成
        String newFolderName = "01_00000000_メインクエストライン";
        File newQuestlineDir = new File(questlinesDir, newFolderName);
        File newQuestsDir = new File(newQuestlineDir, "quests");
        newQuestsDir.mkdirs();

        Questline.MapFile mapFile = new Questline.MapFile();

        for (File f : legacyFiles) {
            Matcher m = LEGACY_QUEST_FILE_PATTERN.matcher(f.getName());
            if (!m.matches()) continue;
            int oldIntId = Integer.parseInt(m.group(1));
            String newId = String.valueOf(oldIntId);

            try {
                // 旧ファイルを Map として読み込み（型変換のため）
                @SuppressWarnings("unchecked")
                Map<String, Object> rawQuest = MAPPER.readValue(f, Map.class);

                // ID を文字列に変換
                rawQuest.put("id", newId);

                // prerequisites の整数リストを文字列リストに変換
                Object prereqs = rawQuest.get("prerequisites");
                if (prereqs instanceof List<?> prereqList) {
                    List<String> strPrereqs = prereqList.stream()
                            .map(p -> String.valueOf(((Number) p).intValue()))
                            .collect(Collectors.toList());
                    rawQuest.put("prerequisites", strPrereqs);
                }

                // mapPosition を取り出して map.json 用に保存
                Object posObj = rawQuest.remove("mapPosition");
                if (posObj instanceof Map<?, ?> posMap) {
                    double x = posMap.get("x") instanceof Number n ? n.doubleValue() : 0.0;
                    double y = posMap.get("y") instanceof Number n ? n.doubleValue() : 0.0;
                    Questline.MapNode node = new Questline.MapNode();
                    node.questId = newId;
                    node.x = x;
                    node.y = y;
                    mapFile.nodes.add(node);
                }

                // ランタイムフィールドを除去（念のため）
                rawQuest.remove("questlineId");
                rawQuest.remove("commandNumber");

                // 新ファイル名: {ID}_{タイトル}.json
                String title = rawQuest.get("title") instanceof String s ? s : "quest";
                String safeName = title.replaceAll("[\\\\/:*?\"<>|]", "_");
                File newFile = new File(newQuestsDir, newId + "_" + safeName + ".json");
                MAPPER.writeValue(newFile, rawQuest);

                log.info("  マイグレーション: " + f.getName() + " → " + newFile.getName());
            } catch (Exception e) {
                log.warning("  マイグレーション失敗: " + f.getName() + " (" + e.getMessage() + ")");
            }
        }

        // map.json を保存
        try {
            saveMapFile(newQuestlineDir, mapFile);
        } catch (IOException e) {
            log.warning("map.json の保存に失敗: " + e.getMessage());
        }

        renameLegacyDir(legacyDir);
        log.info("マイグレーション完了。旧フォルダ: " + legacyDir.getPath() + " → quests.bak/");
    }

    private void renameLegacyDir(File legacyDir) {
        File bakDir = new File(dataFolder, "quests.bak");
        if (!legacyDir.renameTo(bakDir)) {
            log.warning("旧クエストフォルダのリネームに失敗: " + legacyDir.getPath());
        }
    }
}
