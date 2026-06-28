# ランキング機能 設計方針

## 1. 概要

クエスト画面にランキングを表示する。2種類のランキングを提供する:

1. **クリア順ランキング** — そのクエストを「誰が何番目にクリアしたか」を時刻順で表示する（早い者勝ち）。
2. **クリア回数ランキング** — 繰り返しクエストで「誰が何回クリアしたか」を回数順で表示する。

どちらもクエスト詳細モーダル内の **専用タブ「ランキング」** に表示する。

### 表示ポリシー

- **上位 N 位（デフォルト 10）** を常に表示する。
- ログイン中プレイヤーが圏外なら、**自分の周辺 ±M 位（デフォルト ±2）** を区切り線付きで追加表示する。
- 「詳細を見る」ボタンで全件をスクロール表示するフルランキングを開ける。

---

## 2. 中心となる設計判断: クリアログ（1クリア=1レコード）

### 課題

現状の `player_progress` は `(player_uuid, quest_id)` で **1行に upsert** される。
繰り返しクエストでは `completed_count` をインクリメントするのみで、
「いつ・何回目のクリアか」という**個々のクリアイベントの履歴**を保持していない。

### 方針: 追記専用のクリアログテーブルを新設する

クリアのたびに 1 レコードを追記する `quest_completions` テーブルを新設する。
これにより両ランキングが自然に導出できる:

- **クリア順ランキング** = そのクエストの最初のクリアレコードを `completed_at ASC` で並べる
  （プレイヤーごとに最古の1件＝初回クリア時刻を採用）。
- **クリア回数ランキング** = そのクエストのレコードを `player_uuid` で `COUNT(*)`、降順。

> 「1クリア1レコード」案（ユーザー要望）を採用する。`player_progress` の
> `completed_count` カラムは引き続き「未受取報酬の管理」用に残すが、ランキングの
> 真実のソースは `quest_completions` とする（カウントの二重管理を避けるため、
> 回数ランキングは常にログから集計する）。

### スキーマ

```sql
CREATE TABLE quest_completions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    player_uuid  TEXT NOT NULL,
    player_name  TEXT NOT NULL,         -- 表示用に非正規化して保持（後述）
    quest_id     INTEGER NOT NULL,
    completed_at TEXT NOT NULL          -- ISO 8601
);
CREATE INDEX idx_completions_quest      ON quest_completions (quest_id);
CREATE INDEX idx_completions_quest_time ON quest_completions (quest_id, completed_at);
CREATE INDEX idx_completions_quest_player ON quest_completions (quest_id, player_uuid);
```

#### player_name を非正規化して持つ理由

`player_progress` は `player_uuid` しか持たず、本番では名前解決に
`Bukkit.getOfflinePlayer(uuid).getName()` が必要だが、これは
**ブロッキング（初回は Mojang API 問い合わせ）** になりうる。
ランキング表示のたびに全 UUID を解決するのは重いため、**クリア時点の名前を
ログに焼き込む**。改名時は古い名前が残るが、ランキング用途では許容する。
（最新名が必要なら将来 `players(uuid, name, updated_at)` キャッシュテーブルを足す。）

---

## 3. データの書き込み（バックエンド）

### 単一の挿入ポイント

すべてのクエスト完了は `ProgressManager.notifyQuestComplete(playerUuid, quest)`
（[ProgressManager.java](../src/main/java/com/kamesuta/advquesting/data/ProgressManager.java) 659行目付近）
を必ず通る。advancement / item / checkmark / delivery / 繰り返しの各完了がここに集約される。
ここで `quest_completions` に 1 レコード追記する。

```java
// notifyQuestComplete 内、incrementCompletedCount の直後あたり
completionDao.insert(playerUuid, playerUuidToName(playerUuid), quest.id, Instant.now().toString());
```

- `playerUuidToName` は現状オフライン時に UUID をそのまま返すため、
  **`Bukkit.getOfflinePlayer(uuid).getName()` フォールバックを追加**して名前を取りこぼさないようにする。
- 繰り返しクエストでは完了のたびに `notifyQuestComplete` が呼ばれるので、
  クリア回数分のレコードが自然に積まれる。

### 新規 DAO: `CompletionDao`

| メソッド | 用途 | SQL 概略 |
|---|---|---|
| `insert(uuid, name, questId, completedAt)` | クリアログ追記 | `INSERT INTO quest_completions ...` |
| `firstClearRanking(questId)` | クリア順ランキング | プレイヤーごとに `MIN(completed_at)` を取り `ASC` で並べる |
| `countRanking(questId)` | クリア回数ランキング | `GROUP BY player_uuid` の `COUNT(*) DESC, MIN(completed_at) ASC` |

クリア順ランキング SQL（プレイヤーごと初回のみ）:

```sql
SELECT player_uuid, player_name, MIN(completed_at) AS first_at
FROM quest_completions
WHERE quest_id = ?
GROUP BY player_uuid
ORDER BY first_at ASC;
```

回数ランキング SQL:

```sql
SELECT player_uuid, player_name, COUNT(*) AS clears, MIN(completed_at) AS first_at
FROM quest_completions
WHERE quest_id = ?
GROUP BY player_uuid
ORDER BY clears DESC, first_at ASC;   -- 同数は初回が早い方が上位
```

順位（rank）はアプリ側で連番付与する（同数同着の扱いは「先着優先」で単純連番）。

---

## 4. API 設計

### GET /api/quests/:questId/ranking

クエストのランキングを返す。クリア順・回数の両方を1レスポンスにまとめる。

**権限:** 認証不要（未ログインでも閲覧可。ただし `me` 区画はログイン時のみ埋まる）

**クエリパラメータ:**

| パラメータ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `type` | `first \| count` | `first` | ランキング種別。`first`=クリア順、`count`=回数 |
| `limit` | number | 10 | 上位何位まで返すか |
| `around` | number | 2 | 自分の周辺 ±何位を返すか（ログイン時のみ有効） |
| `full` | `true` | - | 指定時は全件返す（「詳細を見る」用、`limit`/`around` を無視） |

**レスポンス 200:**

```json
{
  "type": "first",
  "questId": 1,
  "totalPlayers": 42,
  "top": [
    { "rank": 1, "playerUuid": "...", "playerName": "Steve", "completedAt": "2026-06-19T10:00:00.000Z", "clears": 1 },
    { "rank": 2, "playerUuid": "...", "playerName": "Alex",  "completedAt": "2026-06-19T10:05:00.000Z", "clears": 1 }
  ],
  "around": [
    { "rank": 17, "playerUuid": "...", "playerName": "Foo", "completedAt": "...", "clears": 1 },
    { "rank": 18, "playerUuid": "<me>", "playerName": "Me", "completedAt": "...", "clears": 1, "isMe": true },
    { "rank": 19, "playerUuid": "...", "playerName": "Bar", "completedAt": "...", "clears": 1 }
  ],
  "me": { "rank": 18, "clears": 1, "completedAt": "..." }
}
```

- `top`: 上位 `limit` 件。
- `around`: 自分が `top` に含まれない場合のみ、自分を中心に ±`around` 件を返す。`top` 圏内なら空配列。
- `me`: ログイン中プレイヤーの順位サマリ。未クリア／未ログインなら `null`。
- `clears` フィールドは `type` に関わらず常に含める（UI で両方表示できるように）。
- `completedAt` は `first` では初回クリア時刻、`count` では初回クリア時刻（同数タイブレーク表示用）。

### Mock サーバー

`web/mock-server/` に上記エンドポイントを Drizzle で実装する。
`quest_completions` テーブルを追加し、`/api/test/set-progress` 系のテストフックで
クリアログを投入できるようにする（後述のテスト用フック）。

---

## 5. フロントエンド設計

### 5.1 型

`web/src/types/ranking.ts`（新規）:

```ts
export type RankingType = 'first' | 'count'

export interface RankingEntry {
  rank: number
  playerUuid: string
  playerName: string
  completedAt: string
  clears: number
  isMe?: boolean
}

export interface RankingResponse {
  type: RankingType
  questId: number
  totalPlayers: number
  top: RankingEntry[]
  around: RankingEntry[]
  me: { rank: number; clears: number; completedAt: string } | null
}
```

### 5.2 API クライアント

`web/src/api/ranking.ts`（新規）:

```ts
rankingApi.get(questId, { type, limit, around, full })
```

React Query で `['ranking', questId, type]` をキャッシュ。
SSE の `quest_complete` / `repeat_reset` 受信時に `invalidateQueries(['ranking'])` で更新する
（[App.tsx](../web/src/App.tsx) の既存ハンドラに追記）。

### 5.3 UI: モーダル内の専用タブ「ランキング」

[QuestEditorModal.tsx](../web/src/components/editor/modals/QuestEditorModal.tsx) に
「タスク / 報酬 / ランキング」のタブ切り替えを追加する。

- **デスクトップ**: 現状は左右2カラム（タスク・報酬）。下部 or ヘッダー付近に
  タブ的な切り替えを置き、「ランキング」選択時にランキング表を表示する。
- **モバイル**: 既に縦スクロール1画面構成。「ランキング」セクションを最下部に追加するか、
  上部にセグメント切替を置く。スマホのキーボード再マウント問題（既知）を避けるため、
  ランキング表は**インライン JSX（入れ子コンポーネント化しない）**で描画する。

#### ランキング種別の切り替え

繰り返しクエスト（`node.repeat?.type !== 'none'`）のときのみ
「クリア順 / クリア回数」のセグメントを出す。
非繰り返しクエストは「クリア順」のみ表示する（回数は常に1なので無意味）。

#### 行の表示要素

```
 #1  [skin] Steve        2026/06/19 10:00     （クリア順: 時刻）
 #1  [skin] Steve        12回                  （回数: 回数）
 ─────────────────────────────────────
 #18 [skin] あなた         …    ← isMe はハイライト
```

- スキンアイコンは既存と同様 `https://mc-heads.net/avatar/<playerName>/<size>`。
- 1〜3位は 🥇🥈🥉 を付ける。
- `isMe` の行は黄色系でハイライト。
- `around` は区切り線（`…`）を挟んで表示。

#### 「詳細を見る」

ボタンで `full=true` を取得し、全件スクロールのサブビュー/モーダルを開く。

### 5.4 readOnly / 編集モードでの扱い

ランキングは閲覧専用情報なので、**readOnly・編集モード問わず常に表示**する
（編集者がプレビューとして見られる）。新規作成中（まだ保存されていない）ノードは
`questId` が数値でない（`node-<timestamp>` 等）ため、ランキングタブは非表示にする。

---

## 6. 本番（プラグイン）側のスキーマ追加

[DatabaseManager.java](../src/main/java/com/kamesuta/advquesting/db/DatabaseManager.java) に
`quest_completions` の `CREATE TABLE IF NOT EXISTS` とインデックスを追加する
（既存の player_progress 等と同じ初期化箇所）。マイグレーションは
他テーブル同様 `CREATE TABLE IF NOT EXISTS` で冪等に行う。

[AdvancementQuesting.java](../src/main/java/com/kamesuta/advquesting/AdvancementQuesting.java) で
`CompletionDao` を生成し `ProgressManager` と新 `RankingRoutes` に注入する。

---

## 7. テスト方針

### フロントエンド E2E（`web/tests/ranking.spec.ts` 新規）

Mock にクリアログ投入フック（例: `POST /api/test/add-completion`）を追加し、以下を検証:

- **RK-1**: モーダルに「ランキング」タブが表示され、切り替えるとクリア順ランキングが出る。
- **RK-2**: 上位 N 位が順位付きで表示される（🥇🥈🥉 含む）。
- **RK-3**: 自分が圏外のとき、区切り線付きで自分の周辺順位が表示され `isMe` がハイライトされる。
- **RK-4**: 繰り返しクエストで「クリア回数」セグメントが出て、回数降順で並ぶ。
- **RK-5**: 非繰り返しクエストでは回数セグメントが出ない。
- **RK-6**: 「詳細を見る」で全件表示に切り替わる。
- **RK-7（モバイル, `mobile.spec.ts`）**: スマホでもランキングが表示・スクロールできる。

### Minecraft E2E（`mc-tests/tests/ranking.test.ts` 新規）

- **MC-RK-1**: Mineflayer ボットでクエストをクリア → `GET /api/quests/:id/ranking` の
  `first` に自分が rank 1 で出る。
- **MC-RK-2**: 繰り返しクエストを2回クリア → `count` ランキングで `clears=2` になる。
- **MC-RK-3**: 2体のボットで順にクリア → クリア順が時刻通り（先にクリアした方が上位）になる。

---

## 8. 実装ステップ（順序）

1. **バックエンド DB**: `quest_completions` テーブル追加（DatabaseManager） + `CompletionDao` 実装。
2. **バックエンド書込**: `notifyQuestComplete` でログ追記 + `playerUuidToName` のオフライン名前解決。
3. **バックエンド API**: `RankingRoutes`（`GET /api/quests/:questId/ranking`） + 配線。
4. **Mock**: スキーマ・マイグレーション・ランキング route・テスト用フック。
5. **フロント**: 型・API クライアント・ランキングタブ UI・SSE 連動。
6. **テスト**: フロント E2E（RK-1〜7） → mc-tests（MC-RK-1〜3）。
7. ステップごとに `./scripts/build.ps1` → フロント E2E → mc-tests → コミット（CLAUDE.md 準拠）。

---

## 9. 未決事項 / 将来拡張

- `limit` / `around` のデフォルト値（10 / 2）は実装後に UI を見て調整可能。
- 全クエスト横断の「総合クリア数ランキング」は今回スコープ外（要望は「クエストごと」）。
  将来欲しくなったら `quest_completions` 全体の `GroupBy player` で容易に追加可能。
- 改名追従が必要になったら `players` 名前キャッシュテーブルを導入する。
