# Plan: コメントブロック機能

## Context

クエストマップ編集者がUE5ブループリントのように、マップ上に囲い枠とタイトルを持つコメントブロックを追加できる機能。クエストのグルーピングや説明注記に使う。コメントブロックはクエストノードとは独立したマップ装飾データなので、クエストJSONとは別に保存する。

> **基本機能（下記 1〜5）は実装・コミット済み（commit ebf9a60）。**
> 続く「## 追補」が今回の作業対象。

---

## 追補: コメントを「まとめて移動」にも使う

### 追補-Context

コメントブロックを単なる注記枠にとどめず、UE5ブループリントのコメント同様
**グループ移動のハンドル**としても使えるようにする。当初検討した「選択モードでの
範囲選択・複数選択削除・削除ツール廃止」は複雑化を避けるため**見送り**、
代わりにコメント枠のドラッグで中身のクエストをまとめて動かす方式にする。

既存コミットで以下は**すでに満たされている**ため変更不要:
- コメントは既存クエストに重ねて配置できる（コメントは z-index:1 でノード背面に描画）
- コメントを削除してもクエストは消えない（DELETE はコメントのみ削除）
- 削除はこれまで通り削除ツールで1つずつ（delete モード維持）

### 追補-1. 唯一の新規挙動: コメントドラッグで内包ノードも一緒に動く

対象ファイル: `web/src/pages/Editor.tsx`（コメントドラッグ処理のみ）

**(a) ドラッグ開始時にメンバーを確定**
`CommentBlockEl` の `onMoveStart`（Editor.tsx 1480 付近）で、現在の `commentDragOffsetRef`
を richer なrefに置き換える。ドラッグ開始時点で「コメント枠内に中心がある `nodes`」を
スナップショットする（`isEditor` のときのみ）:

```ts
// useRef<{ offsetX, offsetY, startX, startY, members: {id,x,y}[] } | null>
commentDragRef.current = {
  offsetX: wx - comment.x, offsetY: wy - comment.y,
  startX: comment.x, startY: comment.y,
  members: isEditor
    ? nodes.filter(n =>
        n.x >= comment.x && n.x <= comment.x + comment.width &&
        n.y >= comment.y && n.y <= comment.y + comment.height)
       .map(n => ({ id: n.id, x: n.x, y: n.y }))
    : [],
}
```
※ ノードは中心アンカー（`-ml-6 -mt-6`）なので `n.x/n.y` がそのまま中心座標。

**(b) 共有ヘルパー `dragCommentTo(wx, wy)`**
コメント新位置 = `(wx-offsetX, wy-offsetY)`、デルタ = 新位置 − `startX/startY`。
コメント位置を更新しつつ、メンバー各ノードを `x0+dx, y0+dy` に更新:

```ts
setComments(prev => prev.map(c => c.id === id ? { ...c, x:newX, y:newY } : c))
if (members.length) setNodes(prev => prev.map(n => {
  const m = membersById.get(n.id); return m ? { ...n, x:m.x+dx, y:m.y+dy } : n
}))
```

**(c) マウス**: `handleMouseMove`（698・716 付近）の既存 `draggingCommentId` ブランチを
`dragCommentTo(wx, wy)` 呼び出しに置換。

**(d) タッチ（現状コメント移動が未対応なので併せて修正）**:
`handleCanvasTouchMove` に `draggingCommentId` / `resizingCommentId` ブランチを追加し、
`dragCommentTo` とリサイズ処理を呼ぶ。`handleCanvasTouchEnd` にコメント移動・リサイズの
確定（API保存＋state クリア）を追加（マウスの `handleMouseUp` 775-791 と同等処理）。

**(e) 確定（保存）**: `handleMouseUp` / `handleCanvasTouchEnd` で**コメント枠は従来通り
即時 API 保存**。**内包ノードの新座標は `nodes` state 更新のみ**で、既存の移動ツール
同様に **💾保存** で永続化する（comment と node で保存タイミングが異なる点は既存仕様に踏襲）。

### 追補-2. テスト

`web/tests/comment-block.spec.ts` に追加（デスクトップ＋モバイル両方で実行される）:
- **C-7 グループ移動**: ノード1を覆うようにコメントを作成（ヘッダー帯はノードの上に来るよう
  開始点をノード上方に取る）→ ノード1の `style` left/top を記録 → select/move モードで
  コメントヘッダーを (+100,+50) ドラッグ → ノード1の left/top が同方向に移動したことを検証。
- **C-8 枠外は不動**: コメント外のノードはドラッグ後も座標が変わらないことを検証。

既存 C-1〜C-6 と editor-tools.spec.ts は無改変で通ること。

### 追補-3. 検証手順

1. `/worktree-build` でビルド成功を確認。
2. `cd web && npm run test:e2e -- tests/comment-block.spec.ts`（C-1〜C-8 全通過）。
3. リグレッション: `npm run test:e2e -- tests/editor-tools.spec.ts`。
4. 手動: コメントを既存クエストに重ねて配置→ヘッダードラッグで中のクエストが追従し、
   枠外クエストは動かないこと。コメント削除でクエストが残ることを確認。

---

## 1. バックエンド（Java）

### 1-1. データクラス `CommentBlock.java`

`src/main/java/com/kamesuta/advquesting/data/CommentBlock.java`

```java
public class CommentBlock {
    public String id;
    public double x, y;
    public double width, height;
    public String title;
    public String color; // "#FF6B6B" 形式
}
```

### 1-2. `CommentManager.java`

`src/main/java/com/kamesuta/advquesting/data/CommentManager.java`

- `QuestManager.java` のパターンを流用（Jackson ObjectMapper）
- 保存先: `plugins/AdvancementQuesting/comments.json`（リスト形式）
- `load()` / `save()` / `getAll()` / `upsert(block)` / `delete(id)` を実装

### 1-3. `CommentRoutes.java`

`src/main/java/com/kamesuta/advquesting/api/CommentRoutes.java`

- `GET  /api/comments` → 全件返す
- `POST /api/comments` → 新規作成（id は UUID 生成）
- `PUT  /api/comments/{id}` → 更新
- `DELETE /api/comments/{id}` → 削除
- 書き込み系は `AuthMiddleware.requireAuth` + `session.isEditor()` で保護

### 1-4. 登録

`AdvancementQuesting.java` の `onEnable()` に `new CommentRoutes(commentManager).register(app);` を追加

---

## 2. フロントエンド

### 2-1. 型定義

`web/src/components/editor/types.ts` に追加:

```ts
export type EditorComment = {
  id: string
  x: number
  y: number
  width: number
  height: number
  title: string
  color: string  // 16進カラー
}
```

`ToolMode` に `'add_comment'` を追加。

### 2-2. API層

`web/src/api/comments.ts` を新規作成（`quests.ts` と同じパターン）:
- `getComments()` / `createComment(body)` / `updateComment(id, body)` / `deleteComment(id)`

### 2-3. Editor.tsx の変更

**状態追加:**
```ts
const [comments, setComments] = useState<EditorComment[]>([])
const [commentDraft, setCommentDraft] = useState<{x:number,y:number,w:number,h:number}|null>(null)
const [editingCommentId, setEditingCommentId] = useState<string|null>(null)
```

**データ取得:** `useEffect` で `getComments()` を呼び初期ロード。

**`add_comment` モード:**
- `handleCanvasMouseDown`: ドラッグ開始点を記録
- `handleMouseMove`: ドラッグ中に `commentDraft` を更新（矩形プレビュー表示）
- `handleMouseUp`: ドラッグ終了時に `createComment` API呼び出し → `comments` 更新

**`move`/`select` モード:**
- コメントブロックのヘッダーをドラッグ → 位置更新 → `updateComment` API呼び出し

**`delete` モード:**
- コメントブロッククリック → `deleteComment` API呼び出し

**ツールバー:**
- `MessageSquare` アイコン（lucide-react）で `add_comment` ボタンを追加
- エディタ権限ユーザーのみ表示（`showAddNode` と同条件）

### 2-4. `CommentBlockEl` コンポーネント

`web/src/components/editor/CommentBlockEl.tsx` を新規作成:

```
┌─────────────────────────────┐  ← 薄い背景色（color 20%透明度）
│ ■ タイトルテキスト          │  ← ヘッダー（ドラッグハンドル）
│                             │
│                             │  ← 本体（ノードより背面 z-index 低）
│                           ↘ │  ← リサイズハンドル（右下角）
└─────────────────────────────┘
```

- `z-index: 0` (ノードは `z-index: 10` 想定) → コメントがノードの後ろに描画
- タイトルはダブルクリックでインライン編集（`<input>` に切替）
- カラーピッカー: プリセット6色ボタン（赤・青・緑・黄・紫・白）
- リサイズハンドル: `mousedown` でリサイズドラッグ開始

### 2-5. レンダリング順序

ノードのDOMより前（＝上位の`<div>`）にコメントブロックをレンダリングすることでノードの背面に表示:
```tsx
{/* コメントブロック（ノードより先に描画） */}
{comments.map(c => <CommentBlockEl ... />)}
{/* クエストノード */}
{allNodes.map(n => <NodeEl ... />)}
```

---

## 3. プリセットカラー

| 色名 | HEX |
|------|-----|
| グレー（デフォルト） | `#4A4A4A` |
| 赤 | `#8B2020` |
| 青 | `#1A3A6B` |
| 緑 | `#1A5C2A` |
| 黄 | `#6B5B00` |
| 紫 | `#4A1A6B` |

背景は `color + "33"` (20%透明), ボーダー・ヘッダーは `color` を使用。

---

## 4. 変更ファイル一覧

**新規作成:**
- `src/main/java/com/kamesuta/advquesting/data/CommentBlock.java`
- `src/main/java/com/kamesuta/advquesting/data/CommentManager.java`
- `src/main/java/com/kamesuta/advquesting/api/CommentRoutes.java`
- `web/src/api/comments.ts`
- `web/src/components/editor/CommentBlockEl.tsx`

**編集:**
- `src/main/java/com/kamesuta/advquesting/AdvancementQuesting.java` — CommentRoutes登録
- `web/src/components/editor/types.ts` — EditorComment型, ToolMode追加
- `web/src/pages/Editor.tsx` — 状態・モード・レンダリング・ツールバー追加

---

## 5. 検証

1. `/worktree-build` でビルド確認
2. Playwright E2E テスト追加:
   - `add_comment` モードでドラッグ → ブロック生成確認
   - タイトルダブルクリック → インライン編集確認
   - リサイズハンドルドラッグ → サイズ変更確認
   - `delete` モードでクリック → ブロック削除確認
   - ページリロード後もブロックが残ること（API永続化確認）
