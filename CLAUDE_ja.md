# CLAUDE_ja.md

CLAUDE.md の日本語版。このリポジトリで作業する Claude Code 向けのガイドです。

## プロジェクト概要

AdvancementQuesting は PaperMC (Minecraft) プラグインで、Web UI 付きのクエストシステムを提供します。2 つの部分で構成されます。

1. **Java バックエンド** (`src/`) — 組み込み Javalin HTTP サーバーを持つ PaperMC プラグイン
2. **React フロントエンド** (`web/`) — ブラウザで動く TypeScript/React SPA

## 一時ファイル

スクリーンショット・一時的なテスト結果・デバッグ用ファイルはすべて `tmp/` に保存する。このディレクトリは `.gitignore` で除外されている。

目視確認用の使い捨てPlaywrightスクリプトも `web/tests/` ではなく `tmp/` に置く（例: `tmp/screenshot.spec.ts`）。実行は `npx playwright test ../../tmp/screenshot.spec.ts --headed`。

## 必ず守ること

- 実装が完了したら下記を行ってから次のタスクに進んでください。
  - `/worktree-build` を実行してビルドが通ることを確認する
  - Playwright E2E テストを通す (PC版、スマホ版)
  - Mineflayer E2E テストを通す
  - Gitにコミット

## テスト

Web だけで確認できる機能はフロントエンドテストを、Minecraft サーバーと連携する機能は Java テストを使います。

### フロントエンドテスト

Playwright を使った E2E テスト。モックサーバーと Vite が自動起動し、ブラウザで操作する形でテストが走ります。

- **実行**: `cd web && npm run test:e2e`（UI モード: `npm run test:e2e:ui`）
- **テストコード**: `web/tests/`
- **UI 修正の際にはここにテストを追加すること**
- **バグ修正のたびにテストを追加する**。再現シナリオのテストがないバグ修正は「完了」とみなさない。
- 視覚的に確認が必要・不安定なテストのデバッグには `--headed` を使う

使用ポート:

| 用途 | ポート |
|---|---|
| モックバックエンド（API） | 3001 |
| Vite フロントエンド | 5174 |

### Java テスト（mc-tests）

Java マイクラサーバーが起動し、Mineflayer の Bot がログインして、Playwright で Web UI との連携が正しく機能しているか調べるテスト。

- **実行**: `cd mc-tests && npm run test`
- **テストコード**: `mc-tests/tests/`
- **マイクラのコードを書いたらここにテストを追加すること**
- セットアップコード（Paper JAR ダウンロード・サーバー起動・停止）は `mc-tests/setup.js`

使用ポート:

| 用途 | ポート |
|---|---|
| Minecraft サーバー | 25599 |
| プラグイン API（Web UI） | 8090 |
| RCON | 25598 |

## テストコンソール（手動テスト用）

スマホ1台でブラウザだけで手動テストできる Web コンソール。Mineflayer ボット操作・チャット監視・コマンド送信・クエスト Web UI の確認を1ページで完結できる。クエスト UI は `<iframe>` で埋め込み、認証コードをワンタップで取得してログインできる。

前提: Minecraft サーバーが起動していること（`cd mc-tests && npm run test:no-build` などで別途起動、または通常テスト実行中）。

```powershell
cd mc-tests && npm run dev:console
# → http://localhost:7890/test-console をスマホ/PCのブラウザで開く（Tailscale 経由も可）
```

- **コード**: `mc-tests/test-server.ts` (Express + SSE)、`mc-tests/test-server-bot.ts` (BotManager)、`mc-tests/public/test-console.html` (UI)
- iframe はプラグイン API（ポート 8080）に直接向ける（プロキシなし）

使用ポート:

| サービス | main (offset=0) | wt2 (offset=100) |
|---|---|---|
| テストコンソール | 7890 | 7990 |

## git worktree による並列開発

新しい worktree は `/new-worktree` で作成する（シンボリックリンクと npm install を自動で実行）。

`PORT_OFFSET` でポート番号をずらすことで、複数の worktree を同時起動できる。

| サービス | main (offset=0) | wt2 (offset=100) |
|---|---|---|
| モックバックエンド（API） | 3001 | 3101 |
| Vite フロントエンド | 5174 | 5274 |
| Minecraft サーバー | 25599 | 25699 |
| プラグイン API（Web UI） | 8090 | 8190 |
| RCON | 25598 | 25698 |
| テストコンソール | 7890 | 7990 |

テスト用 SQLite DB も自動で分離される (`test.db` vs `test100.db`)。

## Worktree ビルド＆デプロイ

worktree セッションでタスクが完了したら `/worktree-build` を実行する。
