# パフォーマンス問題調査レポート: QuestManager.loadAll() の毎イベント呼び出し

## 概要

Spark プロファイラー (`tmp/Pj8XdFn8WS.sparkprofile`) の解析により、サーバーが重い原因が特定された。

**根本原因: `QuestManager.loadAll()` がサーバーメインスレッドのイベントハンドラから毎回ディスクI/Oを伴って呼ばれている。**

---

## プロファイルから確認できたホットパス

プロファイルのスタックトレースに以下のコールチェーンが繰り返し登場する（計4回以上検出）:

```
PlayerStatisticIncrementEvent / PlayerMoveEvent
  → StatProgressListener.onStatistic() / LocationProgressListener.onMove()
    → ProgressManager.onStat() / ProgressManager.onPlayerMove()
      → QuestManager.loadAll()
        → ObjectMapper.readValue(File, Class)   ← ★ ここでディスク読み込み
          → FileInputStream (open / read / close)
```

### 発火するイベントの種類と頻度

| イベント | 発火タイミング | 頻度 |
|---|---|---|
| `PlayerStatisticIncrementEvent` | ブロック破壊・アイテム使用・エンティティ討伐など統計が変わるたび | 非常に高頻度 |
| `PlayerMoveEvent` | プレイヤーが1ブロック移動するたび (ブロック変化フィルタ済みだが歩行中は毎tick) | 高頻度 |

---

## 問題のあるコード箇所

### `ProgressManager` の各 `on*` メソッド (全5箇所)

[src/main/java/com/kamesuta/advquesting/data/ProgressManager.java](../src/main/java/com/kamesuta/advquesting/data/ProgressManager.java)

```java
// onAdvancement (L63), onItemPickup (L90), onStat (L118), onScoreChange (L142), onPlayerMove (L164)
for (Quest quest : questManager.loadAll()) {   // ← 毎回ディスクI/O
    ...
}
```

`loadAll()` は毎回ファイルシステムを走査 (`listFiles`) → 全JSONファイルを `ObjectMapper.readValue(File, ...)` で読み込んでいる。

### `QuestManager.loadAll()` の実装

[src/main/java/com/kamesuta/advquesting/data/QuestManager.java#L36-L54](../src/main/java/com/kamesuta/advquesting/data/QuestManager.java)

```java
public List<Quest> loadAll() {
    lock.readLock().lock();
    try {
        File[] files = questsDir.listFiles(...);   // ディレクトリ走査
        for (File f : files) {
            result.add(MAPPER.readValue(f, Quest.class));  // JSONファイル読み込み
        }
        return result;
    } finally {
        lock.readLock().unlock();
    }
}
```

クエスト数が増えるほど、1回のイベントで発生するI/O量が線形に増加する。

---

## 影響の大きさ

- `PlayerStatisticIncrementEvent` はブロックを1つ掘るだけでも複数回発火する (採掘統計・使用統計など)
- `PlayerMoveEvent` はプレイヤーが歩くだけで毎tick発火する
- 複数プレイヤーが同時にいる場合、全員分が重なる
- クエスト数が多いほどファイルI/Oが増加 (例: 20クエスト → 20ファイル読み込み/イベント)

---

## 修正方針

### 推奨: クエスト一覧をメモリにキャッシュする

`QuestManager` にオンメモリキャッシュを持たせ、更新時のみ再読込みする。

```java
// QuestManager に追加
private volatile List<Quest> cache = null;

public List<Quest> loadAll() {
    if (cache != null) return cache;
    lock.readLock().lock();
    try {
        if (cache != null) return cache;  // double-checked
        cache = loadFromDisk();
        return cache;
    } finally {
        lock.readLock().unlock();
    }
}

// create / update / delete 後にキャッシュを無効化
private void invalidateCache() {
    cache = null;
}
```

### 代替案: イベントハンドラ側でクエスト一覧を事前フィルタ

`ProgressManager` 初期化時やクエスト更新時に「どの条件タイプが存在するか」のインデックスを構築し、関係ないイベントは早期リターンする。

---

## サーバー環境情報 (プロファイルより)

| 項目 | 値 |
|---|---|
| サーバー | Paper 1.21.1 (1-69-94d0c97) |
| Java | Eclipse Adoptium Temurin 21.0.11 |
| CPU | AMD Ryzen 7 3700X 8-Core |
| OS | Ubuntu 26.04 LTS |
| JVM Flags | `-Xms128M -Xmx4G` |
| プレイヤー | Kamesuta (UUID: 4f2a2943-2d95-4959-b53e-60cd86edd245) |

---

## まとめ

サーバーが重い原因は **`ProgressManager` の全 `on*` メソッドが `QuestManager.loadAll()` を呼ぶたびにディスクI/Oが発生している** こと。
イベントは高頻度で発火するため、クエストファイルをメモリにキャッシュするだけで大幅な改善が見込まれる。
