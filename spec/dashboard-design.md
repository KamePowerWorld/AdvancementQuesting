# D-1: 統計ダッシュボード（JIRA風 D&D ウィジェット）

## Context

AdvancementQuestingにサーバー全体の統計を閲覧・競えるダッシュボードを追加する。
エディター権限ユーザーがWebUI上でJIRAライクなD&Dでウィジェットを自由配置でき、レイアウトはJSONでサーバーに永続保存。プレイヤーは閲覧のみ。

既存データ（`quest_completions`・`reward_claims`テーブル）を集計する新規APIを追加し、フロントエンドにタブ型ダッシュボードページを実装する。

---

## 1. 新規ライブラリ

```
web/package.json に追加:
  "recharts": "^2.x"              — 時系列・棒グラフ
  "react-grid-layout": "^1.4.x"  — D&Dグリッド
  "@types/react-grid-layout"      — devDependency
```

`web/src/main.tsx` にCSSインポート追加:
```ts
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
```

---

## 2. DB変更

### mock-server schema (`web/mock-server/db/schema.ts`)
テーブルを末尾に追加:
```ts
export const dashboardConfigs = sqliteTable('dashboard_configs', {
  key: text('key').primaryKey(),
  configJson: text('config_json').notNull().default('{"widgets":[]}'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})
```
→ `npm run db:generate` でマイグレーション自動生成 (`0006_*.sql`)

### Java (`src/main/java/.../db/DatabaseManager.java`)
`migrate()` 内の CREATE TABLE ブロックに追加:
```java
st.execute("""
    CREATE TABLE IF NOT EXISTS dashboard_configs (
        key TEXT PRIMARY KEY,
        config_json TEXT NOT NULL DEFAULT '{"widgets":[]}',
        updated_at TEXT NOT NULL
    )""");
```

---

## 3. TypeScript型定義（新規ファイル）

### `web/src/types/dashboard.ts`
```ts
export type WidgetType = 'leaderboard' | 'timeseries' | 'rewards' | 'quests' | 'activity'
export interface DashboardWidget {
  id: string
  type: WidgetType
  config: Record<string, unknown>
  layout: { x: number; y: number; w: number; h: number }
}
export interface DashboardConfig { widgets: DashboardWidget[] }
```

### `web/src/types/stats.ts`
```ts
export interface LeaderboardEntry { rank: number; playerUuid: string; playerName: string; value: number }
export interface LeaderboardResponse { metric: string; entries: LeaderboardEntry[] }
export interface TimeseriesPoint { date: string; value: number }
export interface TimeseriesResponse { metric: string; days: number; data: TimeseriesPoint[] }
export interface RewardAggEntry { rewardType: string; rewardLabel: string | null; totalAmount: number; claimCount: number }
export type RewardsStatsResponse = RewardAggEntry[]
export interface QuestStatEntry { questId: number; questTitle: string; questIcon: string; completionCount: number; uniquePlayers: number }
export type QuestsStatsResponse = QuestStatEntry[]
export interface GlobalActivityItem { id: number; playerUuid: string; playerName: string; questId: number; questTitle: string; questIcon: string; completedAt: string }
export type GlobalActivityResponse = GlobalActivityItem[]
```

---

## 4. APIクライアント（新規ファイル）

### `web/src/api/stats.ts`
パターン: `web/src/api/ranking.ts` を踏襲（`api.get<T>` を使用）
- `statsApi.leaderboard(metric, limit)` → `GET /api/stats/leaderboard`
- `statsApi.timeseries(metric, days)` → `GET /api/stats/timeseries`
- `statsApi.rewards()` → `GET /api/stats/rewards`
- `statsApi.quests(sort, limit)` → `GET /api/stats/quests`
- `statsApi.activity(limit)` → `GET /api/stats/activity`

### `web/src/api/dashboard.ts`
- `dashboardApi.get()` → `GET /api/dashboard`
- `dashboardApi.put(config)` → `PUT /api/dashboard`（エディター認証必須）

---

## 5. mock-server新規ルート

### `web/mock-server/routes/stats.ts`
パターン: `web/mock-server/routes/ranking.ts`（`Router` export、`db.$client.prepare(sql)` で生SQL）

主なSQLクエリ:

**leaderboard?metric=points:**
```sql
SELECT player_uuid, MAX(player_name) AS player_name, SUM(amount) AS total
FROM reward_claims WHERE reward_type = 'point'
GROUP BY player_uuid ORDER BY total DESC LIMIT ?
```

**leaderboard?metric=completions:**
```sql
SELECT player_uuid, MAX(player_name) AS player_name, COUNT(*) AS total
FROM quest_completions GROUP BY player_uuid ORDER BY total DESC LIMIT ?
```

**timeseries?metric=completions:**
```sql
SELECT strftime('%Y-%m-%d', completed_at) AS date, COUNT(*) AS value
FROM quest_completions
WHERE completed_at >= datetime('now', '-' || ? || ' days')
GROUP BY date ORDER BY date ASC
```

**timeseries?metric=points:** `reward_claims` の `claimed_at` と `SUM(amount)` で同様

**rewards:** `GROUP BY reward_type, reward_label` で `SUM(amount)` と `COUNT(*)`

**quests:** `quest_completions` を `GROUP BY quest_id` → `quests` テーブルでタイトル・アイコン補完

**activity:** `quest_completions` を `ORDER BY id DESC LIMIT ?` → クエスト情報補完

### `web/mock-server/routes/dashboard.ts`
パターン: `web/mock-server/routes/config.ts`
- `GET /api/dashboard` — 認証不要、`dashboard_configs WHERE key='default'` を返す（未存在なら `{"widgets":[]}` のデフォルト）
- `PUT /api/dashboard` — エディター認証必須、upsert

### `web/mock-server/index.ts` に追記
```ts
import statsRoutes from './routes/stats.js'
import dashboardRoutes from './routes/dashboard.js'
// ...
app.use('/api/stats', statsRoutes)
app.use('/api/dashboard', dashboardRoutes)
```

---

## 6. Java バックエンド新規クラス

### `StatsDao.java` (`src/main/java/.../db/`)
パターン: `CompletionDao.java`（`DatabaseManager` 注入、`PreparedStatement`）
上記5と同等のSQLをJavaで実装。record型で結果を返す。

### `DashboardConfigDao.java` (`src/main/java/.../db/`)
`getConfigJson()` — SELECT + なければデフォルト返却
`setConfigJson(String json)` — INSERT OR REPLACE

### `StatsRoutes.java` (`src/main/java/.../api/`)
パターン: `RankingRoutes.java`（コンストラクタでDAO受取、`register(Javalin app)` メソッド）
5つのエンドポイントを登録。クエスト情報補完は `QuestManager` から。

### `DashboardRoutes.java` (`src/main/java/.../api/`)
パターン: `ConfigRoutes.java`
GET は認証不要、PUT はエディター認証必須（`AuthMiddleware.requireRole("editor")`）

### `AdvancementQuesting.java` に追記
`onEnable()` 内で `StatsDao`・`DashboardConfigDao` をインスタンス化し、`StatsRoutes`・`DashboardRoutes` を登録する。

---

## 7. フロントエンド構成

### `web/src/pages/Editor.tsx` の変更
`mainTab` state を追加（`'map' | 'stats'`、初期値 `'map'`）:
- view-as バナーと `flex-1 relative flex overflow-hidden min-h-0` div の間にタブバーを挿入
- Minecraftスタイルのタブボタン（既存NavBarボタンと同じ `borderTopColor: 'white'` パターン）
- `mainTab === 'stats'` のときキャンバス全体を `<DashboardPage />` に差し替え

```tsx
// タブバー挿入位置: view-asバナーの直後
<div className="shrink-0 flex border-b-2 border-black" style={{ backgroundColor: '#8B8B8B', fontFamily: '"Courier New",...' }}>
  <button onClick={() => setMainTab('map')} style={mainTab === 'map' ? activeStyle : inactiveStyle}>🗺 マップ</button>
  <button onClick={() => setMainTab('stats')} style={mainTab === 'stats' ? activeStyle : inactiveStyle}>📊 統計</button>
</div>
```

### `web/src/pages/Dashboard.tsx`（新規）
- `useQuery(['dashboard'], dashboardApi.get)` でレイアウト取得
- `useMutation(dashboardApi.put)` でレイアウト保存（800ms debounce）
- `useAuth()` で `isEditor && viewMode === 'edit'` を `canEdit` として渡す
- `<AddWidgetBar>` と `<DashboardGrid>` を描画

### `web/src/components/dashboard/DashboardGrid.tsx`（新規）
- `react-grid-layout/legacy` の `ReactGridLayout` を使用（v2 旧API互換レイヤー）
- `isDraggable={canEdit}` / `isResizable={canEdit}` でエディター限定D&D
- `cols={12}` / `rowHeight={60}`
- `onLayoutChange` で新レイアウトをwidgetsにマージしてコールバック

### `web/src/components/dashboard/widgets/`（新規ディレクトリ）

| ファイル | 担当 | データ取得 |
|---------|------|-----------|
| `WidgetWrapper.tsx` | 共通外枠（ヘッダー、ギアアイコン、×ボタン） | — |
| `LeaderboardWidget.tsx` | プレイヤーランキングリスト | `statsApi.leaderboard` |
| `TimeseriesWidget.tsx` | 折れ線・棒グラフ（recharts `BarChart`） | `statsApi.timeseries` |
| `RewardsWidget.tsx` | 水平棒グラフ（recharts `layout="vertical"`） | `statsApi.rewards` |
| `QuestsWidget.tsx` | クエスト人気/難関ランキング | `statsApi.quests` |
| `ActivityWidget.tsx` | 全体アクティビティフィード | `statsApi.activity` |

各widgetは自律的に `useQuery` を持つ（`staleTime: 5 * 60 * 1000`）

### `web/src/components/dashboard/WidgetConfigModal.tsx`（新規）
パターン: `web/src/components/editor/modals/QuestEditorModal.tsx`（`createPortal` + dark overlay）
ウィジェット種別ごとに適切なフォームを描画し、Saveで `onSave(newConfig)` コールバック

### `web/src/components/dashboard/AddWidgetBar.tsx`（新規）
ウィジェット種別ボタン群。クリックで `crypto.randomUUID()` のIDと既定configでwidgetを末尾追加

---

## 8. 実装順序

1. DBマイグレーション（schema.ts 変更 → `db:generate`、Java DDL 追記）
2. TypeScript型定義（`types/dashboard.ts`, `types/stats.ts`）
3. mock-serverルート（`routes/stats.ts`, `routes/dashboard.ts`, `index.ts` 追記）
4. APIクライアント（`api/stats.ts`, `api/dashboard.ts`）
5. Javaバックエンド（`StatsDao`, `DashboardConfigDao`, `StatsRoutes`, `DashboardRoutes`, `AdvancementQuesting.java` 更新）
6. `Editor.tsx` にタブバー追加（骨格のみ、`DashboardPage` はスタブ）
7. 個別ウィジェット（LeaderboardWidget → ActivityWidget → QuestsWidget → RewardsWidget → TimeseriesWidget の順）
8. `DashboardGrid`（react-grid-layout D&D、canEdit制御）
9. `WidgetConfigModal` と `AddWidgetBar`
10. debounced PUT保存フロー

---

## 9. 検証方法

- mock-server: `npm run dev` でモックサーバー起動後、`/api/stats/leaderboard` 等をcURLで確認
- フロントエンド: `npm run dev` でVite起動 → 統計タブを開いてウィジェット表示確認
- エディターでD&D後にリロードしてレイアウトが保存されていることを確認
- プレイヤーセッションではD&Dが無効（ドラッグ不可）なことを確認
- Playwright E2Eテスト: `web/tests/dashboard.spec.ts`（DB-1〜DB-7）
- Java: `/worktree-build` でビルド通過確認
