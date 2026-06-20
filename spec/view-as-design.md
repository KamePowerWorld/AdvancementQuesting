# プレイヤー攻略覗き見（view-as）機能 設計方針

## 0. このドキュメントの位置づけ

当初は「管理者向け監査機能」として検討したが、方針転換し
**全プレイヤーに公開するソーシャル機能**として設計する。

> ねらい:「この人この戦法アツいな」が全員に伝わって、攻略の感覚を掴める・真似できる・盛り上がる。

権限ゲートは設けない（全員フルオープン）。プライバシー制限もなし。

### 確定した方針（ユーザー判断）

- **公開範囲**: 全員フルオープン。誰でも他人の進捗・達成を閲覧可。
- **入口**: ランキングのプレイヤー名から、その人の攻略マップへ飛ぶ。
- **最近のアクティビティ**: その人個人の「最近クリアしたクエスト」タイムラインを用意する。
- **トータル獲得報酬**: その人が **これまでに受け取った報酬の合計**（type別の総量）を見せる。
- **報酬→クエスト導線**: 受け取った報酬から、それを **どのクエストで得たか辿れる**ようにする。
- **報酬の集計は「個人ビュー」として作る**（当初の管理者向け全体統計とは別物）。
- **全員分の横断ログ（誰が何をしたかのグローバルフィード）は後回し**。

---

## 1. 現状の調査結果（何が既にあって、何が足りないか）

### 1.1 すでにある基盤

| 既存資産 | 場所 | この機能での使い道 |
|---|---|---|
| `quest_completions`（1クリア=1レコードの追記ログ） | [CompletionDao.java](../src/main/java/com/kamesuta/advquesting/db/CompletionDao.java) | 「いつ達成したか」をマップ上で見せる材料 |
| `player_progress`（進捗・完了・受取状態） | [ProgressDao.java](../src/main/java/com/kamesuta/advquesting/db/ProgressDao.java) | **view-as でマップに描く進捗の取得元** |
| ランキング（プレイヤー名 + UUID を返す） | [RankingRoutes.java](../src/main/java/com/kamesuta/advquesting/api/RankingRoutes.java), [RankingPanel.tsx](../web/src/components/ranking/RankingPanel.tsx) | **view-as の入口（名前クリック）** |
| マップ進捗描画 | [Editor.tsx](../web/src/pages/Editor.tsx):183 `progressApi.list()` | view-as は取得元 UUID を差し替えるだけ |
| スキンアバター表示（mc-heads.net） | [RankingPanel.tsx](../web/src/components/ranking/RankingPanel.tsx):49 | 閲覧バナーのプレイヤー表示 |

### 1.2 足りないもの（本機能で新設する）

1. **任意プレイヤーの進捗を取れる公開 API がない**
   - 現状 [/api/progress](../src/main/java/com/kamesuta/advquesting/api/ProgressRoutes.java):37 は
     `session.playerUuid()` 固定で「自分の進捗」しか返さない。
   - view-as には「指定UUIDの全進捗を返す」エンドポイントが要る（**認証任意・全員閲覧可**）。

2. **マップ描画が「自分の進捗固定」になっている**
   - [Editor.tsx](../web/src/pages/Editor.tsx):183 は `progressApi.list()`（自分）の結果でノード達成状態を描く。
   - 「進捗の取得元 UUID（省略時=自分）」を差し替えられるようにする必要がある。

3. **ランキングのプレイヤー名がクリック導線になっていない**
   - [RankingPanel.tsx](../web/src/components/ranking/RankingPanel.tsx) の行は表示のみ。
     名前/行クリックで view-as へ遷移させる。

4. **報酬受取（claim）のログが存在しない** ★トータル獲得報酬・報酬→クエスト導線に必須
   - [claimReward()](../src/main/java/com/kamesuta/advquesting/data/ProgressManager.java):232 は
     [giveRewards()](../src/main/java/com/kamesuta/advquesting/data/ProgressManager.java):718 を呼ぶだけで、
     **「誰が・いつ・どのクエストで・何を・何個/何ポイント受け取ったか」をどこにも保存していない**。
   - 報酬は付与時に消費されて消えるため、**受け取った瞬間に明細を残す追記ログが必要**。

> admin 権限整備・達成ログ/全体統計画面は本方針では不要なので作らない
> （報酬は「個人ビュー」として view-as の中に出す）。

---

## 2. API 設計

### 2.1 任意プレイヤーの進捗取得（view-as の中核）

```
GET /api/players/{uuid}/progress
```

指定プレイヤーの全 `player_progress` を返す。
**認証不要・全員閲覧可**（ランキングAPIと同じ「公開情報」ポリシー）。

- レスポンス形は既存 [/api/progress](../src/main/java/com/kamesuta/advquesting/api/ProgressRoutes.java):37 と**同形**にする。
  → フロントのマップ描画ロジックをそのまま再利用できる。

```json
[
  { "id": 1, "playerUuid": "...", "questId": 1, "progress": [...],
    "completed": true, "rewardClaimed": true,
    "startedAt": "...", "completedAt": "...", "completedCount": 1, "pendingRewards": 0 }
]
```

> 既存 `/api/progress`（自分の進捗）はそのまま残す。本エンドポイントは「他人を見る」専用の追加。

### 2.2 最近のアクティビティ（個人タイムライン・無限スクロール）

```
GET /api/players/{uuid}/activity?limit=20&before=<completionId>
```

指定プレイヤーの **最近クリアしたクエスト** を新しい順で返す。
`quest_completions` を `player_uuid` で引き、`completed_at DESC, id DESC` で並べる。
**認証不要・全員閲覧可**。

#### ページング（無限スクロール）

UI のスクロールで「どんどん読み込む」ため、**カーソルベースのページング**にする。
offset ではなくカーソル（直近に取得した最古レコードの `id`）方式にする理由:
新しいクリアが随時 INSERT されても重複・取りこぼしが起きにくいため。

- `limit`: 1ページ件数（デフォルト 20）。
- `before`: このページの起点。前ページ末尾の `id` を渡すと「それより古いもの」を返す。
  初回は省略（最新から）。
- レスポンスの `nextCursor` が `null` なら末尾（これ以上ない）。

```json
{
  "playerUuid": "...",
  "playerName": "Steve",
  "items": [
    { "id": 9001, "questId": 3, "questTitle": "ダイヤの輝き", "completedAt": "2026-06-20T10:00:00Z" },
    { "id": 8800, "questId": 2, "questTitle": "石器時代",     "completedAt": "2026-06-19T22:14:00Z" }
  ],
  "nextCursor": 8800
}
```

- 各 item に `quest_completions.id` を含める（次ページの `before` カーソルに使う）。
- `questTitle` は `quest_completions` に列が無いので、サーバ側で QuestManager から解決して付加する
  （本番はクエストJSON管理のため SQL JOIN 不可）。クエストが削除済みなら ID のみ or プレースホルダ。
- 繰り返しクエストは同じ questId が複数回出る（クリアのたび1レコードなので「何回攻めたか」も自然に見える）。
- SQL 概略: `WHERE player_uuid=? AND (? IS NULL OR id < ?) ORDER BY id DESC LIMIT ?+1`
  （1件多く取って次ページ有無を判定し、超過分の `id` を `nextCursor` にする）。
- **新規インデックスが必要**: 現状 `quest_completions` には `quest_id` 起点のインデックスしか無い
  （[ranking-design.md](./ranking-design.md) 参照）。`player_uuid, id` の複合インデックスを追加する
  （`id` は AUTOINCREMENT で時系列順なので `completed_at` 代わりにカーソルとして使える）:
  ```sql
  CREATE INDEX idx_completions_player_id ON quest_completions (player_uuid, id);
  ```
  本番 [DatabaseManager.java](../src/main/java/com/kamesuta/advquesting/db/DatabaseManager.java) と
  Mock スキーマ（[schema.ts](../web/mock-server/db/schema.ts)）の両方に追加（冪等）。

### 2.3 トータル獲得報酬 + 報酬→クエスト導線

#### 中核設計: 報酬受取ログ（reward_claims）

報酬は claim 時に消費されて消えるため、**受け取った瞬間に明細をスナップショットして残す**追記ログを新設する。
クエスト定義（JSON）は後から編集・削除されうるので、付与時の内容を非正規化して焼き込む。

```sql
CREATE TABLE reward_claims (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    player_uuid   TEXT NOT NULL,
    player_name   TEXT NOT NULL,      -- 受取時点の名前を焼き込む（ランキングと同方針）
    quest_id      INTEGER NOT NULL,
    quest_title   TEXT NOT NULL,      -- クエストが消えても辿れるよう非正規化
    reward_type   TEXT NOT NULL,      -- item | experience | command | point
    reward_label  TEXT,               -- 表示名（"木のツルハシ" 等）
    item_type     TEXT,               -- type=item のとき material 名
    amount        INTEGER NOT NULL DEFAULT 1, -- item:個数 / experience:exp / point:ポイント / command:1
    claimed_at    TEXT NOT NULL,      -- ISO 8601
    source        TEXT NOT NULL DEFAULT 'claim' -- claim（実受取） | migrated（既存からの遡及）
);
CREATE INDEX idx_claims_player ON reward_claims (player_uuid);
CREATE INDEX idx_claims_quest  ON reward_claims (quest_id);
```

`source` カラムで「実際の受取」と「遡及移行ぶん」を区別する（後で集計から除外したくなった場合の保険）。

amount のセマンティクス（type別）:

| reward_type | amount の意味 |
|---|---|
| `item` | アイテム個数 |
| `experience` | 経験値量 |
| `point` | ポイント数 |
| `command` | 常に 1（実行回数） |

**書き込みポイント**: [claimReward()](../src/main/java/com/kamesuta/advquesting/data/ProgressManager.java):257 の
報酬付与ループ（`for i<times { giveRewards }`）内で `RewardClaimDao.insert(source='claim')` を呼ぶ。
繰り返し claim は周回数ぶんループするので明細も周回数ぶん積まれる。

#### 既存データの移行（遡及）

機能リリース前に「クリア済み＆受取済み」だったプレイヤーも、報酬を受け取ったものとして
`reward_claims` に記録する（[ranking-design.md](./ranking-design.md) の completion 移行と同方針）。

- **対象**: `player_progress` で **`completed=1 AND reward_claimed=1`** のレコード。
  - `completed=1 AND reward_claimed=0`（未受取）は対象外。まだ受け取っていないため。
- **展開**: 各対象について、そのクエストの **`rewards` 配列を読み、報酬1項目=1レコード**に展開して挿入する
  （`amount` / `reward_type` / `reward_label` / `item_type` は付与時ロジック＝
  [giveRewards()](../src/main/java/com/kamesuta/advquesting/data/ProgressManager.java):718 と同じ解釈で抽出）。
  本番はクエスト定義が JSON なので QuestManager から rewards を取る。
- **回数の扱い**: 過去の正確な claim 回数は復元できないため、**1回ぶん（初回受取）のみ**移行する
  （繰り返しの周回数は遡及しない。completion 移行の「初回1クリアのみ」と揃える）。
- **claimed_at**: `player_progress.completed_at` を流用（無ければ現在時刻）。
- **source**: `'migrated'` で記録。
- **冪等**: `source='migrated'` のレコードが既にある (player_uuid, quest_id) はスキップ
  （`NOT EXISTS` サブクエリ。再起動しても二重移行しない）。
- **実行タイミング**: 本番は [onEnable](../src/main/java/com/kamesuta/advquesting/AdvancementQuesting.java):63 で
  既存のランキング移行と並べて1回実行。Mock は起動時 + テストフック
  （ranking の `migrateCompletionsFromProgress` と同じ流儀。[index.ts](../web/mock-server/index.ts):206 参照）。

> クエストが削除済み等で rewards を解決できない対象はスキップ（quest_title も取れないため）。

#### API: トータル獲得報酬

```
GET /api/players/{uuid}/rewards
```

その人がこれまでに受け取った報酬を返す。**type別の合計**と、**報酬→クエストを辿るための明細**の両方を含む。
**認証不要・全員閲覧可**。

```json
{
  "playerUuid": "...",
  "playerName": "Steve",
  "totalsByType": { "point": 580, "experience": 12000, "item": 96, "command": 3 },
  "items": [
    { "questId": 3, "questTitle": "ダイヤの輝き", "rewardType": "point",
      "rewardLabel": "達成ポイント", "amount": 100, "claimedAt": "2026-06-20T10:01:00Z" },
    { "questId": 3, "questTitle": "ダイヤの輝き", "rewardType": "item",
      "rewardLabel": "ダイヤ", "itemType": "diamond", "amount": 3, "claimedAt": "2026-06-20T10:01:00Z" }
  ]
}
```

- `totalsByType`: トータル獲得報酬の集計（**「この人ぜんぶでこれだけ稼いだ」**）。
  同種アイテムをまとめた item 別内訳が欲しくなれば将来 `byItemType` を足せる。
- `items`: 明細。各行に `questId` / `questTitle` があるので **報酬からクエストを辿れる**（行クリックでそのクエストへ）。

### 2.4 プレイヤー表示名の解決

ランキング行は `playerUuid` + `playerName` を持つので、view-as 遷移にはそれを使えば十分。
URL に UUID を載せて遷移し、表示名はランキング側から渡す（activity / rewards レスポンスにも `playerName` を添える）。
別途プレイヤー名簿APIは今回作らない（入口がランキング限定のため）。

### 2.5 Mock サーバー

`web/mock-server/` に下記を Drizzle で実装:
- `GET /api/players/:uuid/progress`（`player_progress` を UUID で引く）
- `GET /api/players/:uuid/activity`（`quest_completions` を UUID で時系列）
- `GET /api/players/:uuid/rewards`（`reward_claims` を UUID で集計 + 明細）

`reward_claims` テーブルを Mock スキーマ（[schema.ts](../web/mock-server/db/schema.ts)）にも追加。
テスト用フック:
- 進捗投入は既存 `POST /api/test/set-progress`（`playerUuid` 指定可）を流用。
- クリアログ投入は既存 `POST /api/test/add-completion` を流用（activity 用）。
- 報酬明細投入は `POST /api/test/add-reward-claim` を新設。

---

## 3. フロントエンド設計

### 3.1 view-as の状態管理

「いま誰の視点でマップを見ているか」を表すグローバル状態を1つ持つ:

```ts
// null = 自分。値があれば「その人として閲覧中」
viewAs: { playerUuid: string; playerName: string } | null
```

- URL に反映する（例 `?viewAs=<uuid>` または `#view-<uuid>`）。
  → リロード・共有でも同じ視点が復元でき、ランキング機能の URL ハッシュ実装
  （[url-hash.spec.ts](../web/tests/url-hash.spec.ts) 参照）と同じ流儀。
- マップの進捗取得を分岐:
  - `viewAs == null` → 既存 `progressApi.list()`（自分）
  - `viewAs != null` → `GET /api/players/{uuid}/progress`

### 3.2 マップ描画の改修

[Editor.tsx](../web/src/pages/Editor.tsx):183 の進捗取得を、取得元 UUID で切り替えられるようにする。
React Query のキー `['progress', viewAsUuid ?? 'me']` でキャッシュ。

**閲覧中は読み取り専用**にする:
- 編集ボタン・保存・claim・条件完了・納品などの**操作系UIを全部隠す**。
- モーダルもランキングと達成状況の表示のみ（自分のときの claim ボタン等は出さない）。

### 3.3 入口: ランキングの名前クリック

[RankingPanel.tsx](../web/src/components/ranking/RankingPanel.tsx) の各行（名前 or アバター）を
クリック可能にし、`onSelectPlayer(playerUuid, playerName)` を発火 → view-as 開始。

- 自分の行（`isMe`）は「自分視点に戻る」or 何もしない（クリック無効でよい）。
- ホバーで「👁 この人の攻略を見る」ヒントを出すと親切。

### 3.4 閲覧バナー（view-as 中の常時表示）

画面上部に固定バナー:

```
 👁 Steve の攻略を見ています   [自分に戻る]
```

- アバター + 名前 + 「自分に戻る」ボタン。
- 誤操作防止と「今は他人視点」という明示。
- バナーの「自分に戻る」or モーダルを閉じる動線で `viewAs = null` に戻す。

### 3.5 最近のアクティビティ（個人タイムライン）

view-as 中、その人の「最近クリアしたクエスト」を時系列で見せる。
「この人いま何にハマってるか・どう攻めてるか」が一目で伝わる中心的な体験。

- 配置: view-as の閲覧バナー直下のパネル、またはサイドパネルに「最近のアクティビティ」リスト。
  ランキングパネルのフローティング表示（[QuestEditorModal.tsx](../web/src/components/editor/modals/QuestEditorModal.tsx) の右パネル）と同じ流儀の見た目に揃える。
- 各行: クエストアイコン + タイトル + 相対時刻（"3時間前" / "6/19 22:14"）。
- 行クリックでそのクエストのモーダルを開く（view-as 視点のまま＝その人の達成状況で表示）。
- **無限スクロール**: リスト下端までスクロールすると次ページを追加読み込みする。
  React Query の `useInfiniteQuery`（キー `['activity', uuid]`）でカーソルページング（2.2 の `before`/`nextCursor`）を扱う。
  `nextCursor == null` で「これ以上ない」を表示。下端検知は IntersectionObserver（番兵要素）か
  スクロールイベントで `fetchNextPage()` を呼ぶ。読込中はスピナー行を出す。
- 自分のマップ（view-as でない通常時）でも、自分の activity を出してよい（任意）。

### 3.6 トータル獲得報酬 + 報酬→クエスト導線

view-as 中（および自分のとき）、その人の **これまでの獲得報酬の合計**を見せる。

- **サマリ**: `totalsByType` を type別チップ/カードで表示（例: `🪙 580pt ｜ ✨ 12,000exp ｜ 📦 96個`）。
  「この人ぜんぶでこれだけ稼いだ」が一目で分かる。
- **明細リスト**: `items` を新しい順で。各行 = 報酬ラベル + amount + 取得元クエスト名 + 時刻。
- **報酬→クエスト導線**: 明細行クリックで `questId` のクエストモーダルを開く
  （view-as 視点のまま）。「この報酬どこで取ったの？」→ クリックでそのクエストへ。
- 配置: 最近のアクティビティ（3.5）と並ぶパネル/タブ。アクティビティ=「何をクリアしたか」、
  報酬=「何をもらったか」で対になる。
- データ: `GET /api/players/{uuid}/rewards`（2.3）。React Query キー `['rewards', uuid]`。

### 3.7 「いつ達成したか」の見せ方（任意・余裕があれば）

view-as 中、達成済みノードに**達成日時**を出すと「この人この順でこう攻めた」が伝わる。
データは `player_progress.completedAt`（既存）で取れる。MVP では省略可
（最近のアクティビティ 3.5 でタイムラインは別途見せられるため）。

### 3.8 型・API クライアント

- [progress.ts](../web/src/api/progress.ts) に `getPlayerProgress(uuid)` を追加。
- アクティビティ用に `web/src/api/activity.ts` + `web/src/types/activity.ts`（新規,
  `getPlayerActivity(uuid, { limit, before })` → `{ items, nextCursor }`。`useInfiniteQuery` で消費）。
- 報酬用に `web/src/api/rewards.ts` + `web/src/types/rewards.ts`（新規, `getPlayerRewards(uuid)`）。
- view-as 状態は Context かルーター state で保持（既存 AuthContext と並べる軽量なものでよい）。

---

## 4. 本番（プラグイン）side のまとめ

1. [ProgressRoutes.java](../src/main/java/com/kamesuta/advquesting/api/ProgressRoutes.java) に
   `GET /api/players/{uuid}/progress`（**認証任意・全員閲覧可**）を追加。
   - 既存 `toMap` をそのまま使って同形レスポンスを返す。
2. アクティビティ用に `GET /api/players/{uuid}/activity` を追加（CompletionDao に
   `recentByPlayer(uuid, limit, beforeId)` を追加してカーソルページング）。
3. [DatabaseManager.java](../src/main/java/com/kamesuta/advquesting/db/DatabaseManager.java) に
   `idx_completions_player_id` インデックスを追加（冪等）。
4. 報酬獲得（2.3）: `reward_claims` テーブル + `RewardClaimDao`（insert / `byPlayer(uuid)` 集計）
   + [claimReward()](../src/main/java/com/kamesuta/advquesting/data/ProgressManager.java):257 での明細追記
   + `GET /api/players/{uuid}/rewards`。
5. **報酬の遡及移行**: `RewardClaimDao.migrateFromProgress`（`completed=1 AND reward_claimed=1` を
   rewards 展開して `source='migrated'` で挿入・冪等）を
   [onEnable](../src/main/java/com/kamesuta/advquesting/AdvancementQuesting.java):63 で
   既存のランキング移行と並べて実行。
6. 権限ゲートは付けない（全員フルオープン）。

---

## 5. テスト方針

### フロント E2E（`web/tests/view-as.spec.ts` 新規）

既存 `POST /api/test/set-progress` / `add-completion` / 新設 `add-reward-claim` でデータを作り:

- **VA-1**: ランキングの他人の名前をクリックすると view-as が始まり、閲覧バナーが出る。
- **VA-2**: view-as 中はマップがその人の進捗（達成済みノード）で描画される。
- **VA-3**: view-as 中は操作系UI（claim・編集・保存）が出ない（読み取り専用）。
- **VA-4**: 「自分に戻る」で自分視点のマップに戻る。
- **VA-5**: `?viewAs=<uuid>` 直リンク/リロードで視点が復元される。
- **VA-6**: 自分の行（isMe）クリックでは view-as に入らない（or 自分に戻る）。
- **VA-7**: 最近のアクティビティに、その人のクリアが新しい順で並ぶ。行クリックでクエストモーダルが開く。
- **VA-8**: アクティビティを下端までスクロールすると次ページが追加読み込みされる（無限スクロール）。
  末尾まで読むと `nextCursor` 枯渇でそれ以上増えない。
- **VA-9**: トータル獲得報酬の type別合計が出る。明細行クリックで取得元クエストへ辿れる。

### Minecraft E2E（`mc-tests/tests/view-as.test.ts` 新規）

- **MC-VA-1**: ボットAがクエストをクリア → 別視点から
  `GET /api/players/{A-uuid}/progress` を叩くと A の完了済み進捗が返る。
- **MC-VA-2**: 未クリアのクエストは completed=false で返る（取り違えがない）。
- **MC-VA-3**: ボットがクエストをクリア → `/api/players/{uuid}/activity` に出る（カーソルページング動作）。
- **MC-VA-4**: ボットがクリア→claim すると `reward_claims` に `source='claim'` 明細が積まれ、
  `/api/players/{uuid}/rewards` の `totalsByType` に point/exp/item の amount が正しく出る。

### 報酬移行テスト（フロント `web/tests/view-as.spec.ts` に同梱）

- **VA-MIG-1**: `completed=1 AND reward_claimed=1` の既存進捗を作り移行を実行 →
  `/api/players/{uuid}/rewards` にそのクエストの報酬が `source='migrated'` で出る。
- **VA-MIG-2**: `completed=1 AND reward_claimed=0`（未受取）は移行されない。
- **VA-MIG-3**: 移行を2回実行しても二重に積まれない（冪等）。

---

## 6. 実装ステップ（順序）

各ステップ末で `./build.ps1` → フロント E2E → mc-tests → コミット（CLAUDE.md 準拠）。

1. **view-as 基盤**: `GET /api/players/{uuid}/progress`（本番 + Mock）+ フロント取得層
   `progressApi.getPlayerProgress(uuid)` + view-as 状態（URL同期）。
2. **マップ描画分岐 + 入口**: 進捗取得元の差し替え + 閲覧時の操作系UI非表示 + 閲覧バナー
   + ランキング名クリックで view-as 開始。（VA-1〜6 / MC-VA-1〜2）
3. **最近のアクティビティ**: `GET /api/players/{uuid}/activity`（本番 + Mock + インデックス追加）
   + UIパネル。（VA-7 / MC-VA-3）
4. **トータル獲得報酬**: `reward_claims` テーブル + `RewardClaimDao` + `claimReward` 追記
   + 既存データの遡及移行（`source='migrated'`）+ `GET /api/players/{uuid}/rewards`
   （本番 + Mock + テストフック）+ UIパネル（報酬→クエスト導線）。
   （VA-9 / VA-MIG-1〜3 / MC-VA-4）

---

## 7. 未決事項 / 将来拡張

- **全員分の横断ログ（グローバルフィード）**: 「誰が何をしたか」の全体タイムラインは**後回し**
  （要望どおり）。`quest_completions` / `reward_claims` 全体を時系列で引けば容易に追加できる。
- **達成日時のノード表示**（3.7）: MVP では省略可。好評なら攻略タイムライン表示へ拡張。
- **報酬のアイテム別内訳**: 現状 `totalsByType` は type 別合計のみ。
  「ダイヤ合計何個」等が欲しくなれば `byItemType` 集計を足す。
- **過去 claim の遡及**: `completed=1 AND reward_claimed=1` を「初回1回ぶん受取済み」として
  `source='migrated'` で移行する（2.3）。繰り返しの過去周回数や未受取ぶんは遡及しない。
- **オフライン名解決**: ランキング経由で名前が手に入るので当面は不要。
  入口を増やす（プレイヤー一覧ページ等）なら名簿APIを検討。
- **代理操作（書き込み view-as）**: スコープ外。view-as は読み取り専用に限る。
- **プライバシー設定**: 現状フルオープン。将来「進捗を隠す」要望が出たら
  player_progress に公開フラグを足してオプトアウト制にできる。
```