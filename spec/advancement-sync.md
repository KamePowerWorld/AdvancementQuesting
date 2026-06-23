# Minecraft進捗画面へのクエスト表示

## 概要

ブラウザを開かなくてもMinecraftの進捗（Advancement）画面でクエスト一覧・進捗を確認できる。条件達成はリアルタイムで反映され、報酬/詳細はブラウザに誘導する。

Paper APIの `Bukkit.getUnsafe().loadAdvancement(NamespacedKey, String)` を使い、クエストをカスタム Advancement として動的登録する。

## 制約・仕様

- Advancement の構造（クエスト定義）はプラグイン起動時にロードされ、接続中プレイヤーへの反映は再ログイン後
- プレイヤーの進捗（criterion の award/revoke）はリアルタイムに反映される
- `loadAdvancement()` / `awardCriteria()` は Bukkit main thread から呼ぶ必要がある
- 1.21.11 の icon フォーマット: `{"id": "minecraft:diamond"}`（古い `{"item": ...}` は不可）

## Advancement 構造

**ルートタブ** (`advquesting:root`):
```json
{
  "display": {
    "icon": {"id": "minecraft:map"},
    "title": {"text": "クエスト"},
    "description": {"text": "クエスト一覧 | 詳細はブラウザで確認"},
    "background": "minecraft:textures/gui/advancements/backgrounds/stone.png",
    "frame": "task", "show_toast": false, "announce_to_chat": false
  },
  "criteria": {"root": {"trigger": "minecraft:impossible"}}
}
```

**各クエスト** (`advquesting:q{id}`):
```json
{
  "display": {
    "icon": {"id": "minecraft:{icon}"},
    "title": {"text": "{title}"},
    "description": {"text": "{subtitle}\n全{N}つの条件を達成しよう\n詳細・報酬はブラウザで確認"},
    "frame": "task", "show_toast": false, "announce_to_chat": false, "hidden": false
  },
  "parent": "advquesting:root",
  "criteria": {
    "c_{condId1}": {"trigger": "minecraft:impossible"},
    "c_{condId2}": {"trigger": "minecraft:impossible"}
  },
  "requirements": [["c_{condId1}"], ["c_{condId2}"]]
}
```

- 条件が0個のクエスト → ダミー criterion `"_root"` を1つ追加
- criterion名は `c_` + conditionId（特殊文字は `[^a-zA-Z0-9_-]` → `_` に置換）

## 実装ファイル

### `data/AdvancementSyncManager.java`（新規）

| メソッド | 用途 | スレッド |
|---|---|---|
| `loadAll()` | 起動時に全 public クエストを Advancement 登録 | main |
| `unloadAll()` | プラグイン無効時に全削除 | main |
| `syncQuest(Quest)` | クエスト作成/更新時: remove→再load + 全オンラインプレイヤーの進捗同期 | main |
| `removeQuest(int)` | クエスト削除時: 全プレイヤーの criteria を revoke してから remove | main |
| `syncPlayerQuestProgress(String, Quest, String)` | 条件達成時に criteria を award/revoke。内部で runTask() にラップ | any |
| `syncAllQuestsForPlayer(Player)` | ログイン時に全クエストの進捗を一括同期 | main |

### `listener/PlayerJoinListener.java`（新規）

ログイン 1 秒後（20tick）に `syncAllQuestsForPlayer()` を実行。クライアントの受信準備を待つため遅延させる。

### `data/ProgressManager.java`（修正）

`upsertProgress()` 直後に `advancementSyncManager.syncPlayerQuestProgress()` を追加。
対象: `markConditionComplete`, `updateItemProgress`, `updateStatProgress`, `updateScoreboardProgress`, `updateLocationProgress`, `completeCheckmarkCondition`, `deliverItems`, `setQuestCompleted`

### `AdvancementQuesting.java`（修正）

- onEnable: `AdvancementSyncManager` を生成→ `loadAll()`→ `ProgressManager` に setter で注入
- `PlayerJoinListener` を登録
- onDisable: `unloadAll()`

### `api/QuestRoutes.java`（修正）

POST/PUT の直後: `Bukkit.getScheduler().runTask(plugin, () -> advancementSyncManager.syncQuest(quest))`

DELETE の直後: `Bukkit.getScheduler().runTask(plugin, () -> advancementSyncManager.removeQuest(id))`

## 検証方法

1. サーバー起動後、進捗画面に「クエスト」タブが表示されること
2. 既存クエストがタブ内に並ぶこと
3. advancement条件を達成 → 該当 criterion に即座にチェックが付くこと
4. `/quest_edit uncomplete <player> <id>` → criteria が消えること
5. クエスト削除後に Advancement が消えること（再ログイン後）
