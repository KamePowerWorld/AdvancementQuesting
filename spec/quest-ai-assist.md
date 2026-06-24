# クエスト作成補助AI（クエスト名・説明の自動提案）

## Context

クエスト作成担当のれいさんは多忙で、説明文が1行程度の質素なものになりがち。市政系ModPack
のようなユーモアあるタイトル＋充実した説明があると、プレイヤーが物語を進める没入感が生まれ、
モチベーションが上がる。そこで、エディタで設定済みの **タスク／報酬** と任意の **ヒント
（チャット）** を文脈に、AIが「クエスト名＋説明文」の候補を3つ提案する機能を追加する。

- **AI呼び出し経路**: Javaバックエンドがプロキシ（APIキーをサーバー側に秘匿、既存の
  editor+ 認証ロールを流用）。
- **モデル**: OpenAI API / `gpt-5.4-nano`（モデル名は config で差し替え可能にする）。
- **UI**: デスクトップは右サイドパネル、モバイルは全画面オーバーレイ。ヘッダーの ✨ ボタンで
  開閉。最初は「生成する」ボタンのみ → 押すと3択カード表示 → カードを選ぶと
  **タイトル＋説明をセットで反映**。「生成する」再押下でリロール。下部チャット欄で
  ヒントを送ると候補を再提案。

## バックエンド（Java / Javalin / Java 21）

### 1. 設定（`src/main/resources/config.yml`）
既存パターン（`getConfig().getString(...)`）に倣い追加:
```yaml
openai-api-key: ""            # 空ならAI機能は無効（503を返す）
openai-model: "gpt-5.4-nano"
```
**重要**: `api/ConfigRoutes.java`（`/api/config` でフロントに公開）には絶対に
`openai-api-key` を含めない。キーはサーバー内のみで使用。

### 2. 新エンドポイント `POST /api/ai/quest-suggest`
新規ファイル `src/main/java/com/kamesuta/advquesting/api/AiRoutes.java` を作成し、
`QuestRoutes` と同様に主プラグインクラスの `register(Javalin app)` 系の箇所へ登録。

- **認証**: `QuestRoutes` と同一パターン
  ```java
  SessionInfo session = AuthMiddleware.requireAuth(ctx, sessionDao);
  if (!session.isEditor()) throw new ForbiddenResponse();
  ```
- **リクエスト**（`ctx.bodyAsClass(...)`, Jackson record）:
  ```java
  record SuggestRequest(
      List<String> tasks,    // 人間可読のタスク要約（フロントの getDisplayText() 出力）
      List<String> rewards,  // 報酬要約
      List<ChatMsg> messages // 任意。{role, content} の会話履歴（リロール/再提案用）
  )
  ```
  ステートレス設計: 履歴はフロントが毎回まとめて送る。
- **OpenAI呼び出し**: `java.net.http.HttpClient`（依存追加不要）で
  `POST https://api.openai.com/v1/chat/completions`。
  - `model` は `getConfig().getString("openai-model", "gpt-5.4-nano")`。
  - system プロンプトで「マイクラのクエスト名＋説明をファンタジー世界観・ユーモアを交えて。
    タスク/報酬の文脈を踏まえる。日本語。」を指示。
  - `response_format` を JSON 指定し、必ず3候補を返させる
    （`{"candidates":[{"title":"...","description":"..."}, x3]}`）。
  - APIキー未設定 → `ctx.status(503).json(...)`。OpenAIエラー → 502 で要約を返す。
- **レスポンス**: `{ "candidates": [{title, description} x3] }` を `ctx.json(...)`。

## フロントエンド（React / TS）

### 3. APIモジュール `web/src/api/ai.ts`（新規）
`web/src/api/client.ts` の `api.post`（Bearerトークン付与済み）を利用:
```ts
export interface QuestCandidate { title: string; description: string }
export interface QuestSuggestBody {
  tasks: string[]; rewards: string[]
  messages: { role: 'user' | 'assistant'; content: string }[]
}
export const aiApi = {
  suggestQuest: (body: QuestSuggestBody) =>
    api.post<{ candidates: QuestCandidate[] }>('/api/ai/quest-suggest', body),
}
```

### 4. パネルコンポーネント `web/src/components/editor/modals/AiAssistPanel.tsx`（新規）
- **Props**: `tasks`, `rewards`（文脈用）, `onAdopt(title, description)`, `onClose`。
- **State**: `messages`（チャット履歴）, `candidates`, `loading`。
- **初期表示**: 「✨生成する」ボタンのみ。
- **生成/リロール**: ボタン押下で `aiApi.suggestQuest({ tasks, rewards, messages })` を呼び、
  3択カードを表示。再押下で再生成（リロール）。
- **カード**: 各カードに「この案を使う」→ `onAdopt(c.title, c.description)`（タイトル＋説明を
  セット反映）してパネルを閉じる。
- **下部チャット欄**: 入力テキストを `messages` に push して再リクエスト → 新しい3択。
- 文脈の `tasks`/`rewards` 文字列は既存 `web/src/components/editor/utils.ts` の
  `getDisplayText()` を使って生成（例「アイテム: Apple ×5」「採掘: Diamond ×100」）。
- UI文言は周辺コンポーネントに倣いハードコードの日本語（「生成する」「この案を使う」等）。

### 5. `web/src/components/editor/modals/QuestEditorModal.tsx` への統合
- ヘッダーに ✨ トグルボタンを追加し `showAiPanel` state を切替。
- **デスクトップ**: 既存の ranking サイドバー（`w-[280px] h-[650px]` 兄弟要素）と同じ階層に
  `AiAssistPanel` を `w-[300px] h-[650px]` の右サイドパネルとして条件表示。
- **モバイル**: 全画面モーダル内で、✨押下時に `absolute inset-0` のオーバーレイとして
  `AiAssistPanel` を被せる（× で閉じる）。
- `onAdopt` は既存の `updateNode()` で `title` と `description`（subtitle/詳細）を更新。

### 6. モックバックエンド（Playwright用）`web/mock-server/`
- `web/mock-server/routes/ai.ts`（新規）で `POST /api/ai/quest-suggest` を実装。実APIは呼ばず、
  タスク要約から決定的なダミー3候補（例「マナ理論の覚醒」等）を返す。`messages` 長で内容を
  変えてリロール/再提案を検証可能にする。`web/mock-server/middleware/auth.ts` の editor 判定を流用。
- `web/mock-server/index.ts` に `app.use('/api/ai', aiRoutes)` を追加。

## テスト

- **Playwright（`web/tests/`、desktop + mobile）**: エディタを開く → ✨でパネル表示 →
  「生成する」→ 3カード表示を assert → 「この案を使う」→ タイトル/説明欄に反映されることを
  assert → チャット欄送信で候補が変わることを assert。モバイルはオーバーレイ表示と×閉じも確認。
- **Java/mc-tests（任意）**: 実OpenAI呼び出しは行わない。`openai-api-key` 未設定時に 503、
  非editorで 403 を返すことを確認できれば十分（live呼び出しはスキップ）。

## 検証手順（end-to-end）

1. `/worktree-build` でビルド成功を確認。
2. `cd web && npm run test:e2e`（desktop/mobile）で上記E2Eが通ることを確認。
3. 手動: 実サーバーに `openai-api-key` を設定し、エディタで実際に3候補が生成・反映される
   ことを確認（任意・キーが用意できる場合）。
4. `mc-tests` のE2E（該当範囲）を実行。
5. CLAUDE.md の「Must Follow」に従い Git コミット。

## 影響ファイル一覧

- 新規: `src/main/java/com/kamesuta/advquesting/api/AiRoutes.java`
- 編集: `src/main/resources/config.yml`、主プラグインクラスのルート登録箇所、`api/ConfigRoutes.java`（キー非公開の確認）
- 新規: `web/src/api/ai.ts`、`web/src/components/editor/modals/AiAssistPanel.tsx`
- 編集: `web/src/components/editor/modals/QuestEditorModal.tsx`
- 新規: `web/mock-server/routes/ai.ts`、編集: `web/mock-server/index.ts`
- 新規: `web/tests/ai-assist.spec.ts`（desktop/mobile）
