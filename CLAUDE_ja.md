# CLAUDE_ja.md

CLAUDE.md の日本語版。このリポジトリで作業する Claude Code 向けのガイドです。

## プロジェクト概要

AdvancementQuesting は PaperMC (Minecraft) プラグインで、Web UI 付きのクエストシステムを提供します。2 つの部分で構成されます。

1. **Java バックエンド** (`src/`) — 組み込み Javalin HTTP サーバーを持つ PaperMC プラグイン
2. **React フロントエンド** (`web/`) — ブラウザで動く TypeScript/React SPA

## 一時ファイル

スクリーンショット・一時的なテスト結果・デバッグ用ファイルは `tmp/` に保存する。

使い捨て Playwright スクリプトは関連するテストディレクトリに `*.tmp.spec.ts` として置く（例: `web/tests/screenshot.tmp.spec.ts`）。gitignore済み。実行は `npx playwright test --headed`。

## 必ず守ること

- 実装が完了したら下記を行ってから次のタスクに進んでください。
  - `/worktree-build` を実行してビルドが通ることを確認する
  - Playwright E2E テストを通す (PC版、スマホ版)
  - Mineflayer E2E テストを通す
  - Gitにコミット

## テスト

Web だけで確認できる機能はフロントエンドテストを、Minecraft サーバーと連携する機能は Java テストを使います。UI 変更・バグ修正のたびにテストを追加すること。

### フロントエンドテスト

- **実行**: `cd web && npm run test:e2e`
- **テストコード**: `web/tests/`

### Java テスト（mc-tests）

- **実行**: `cd mc-tests && npm run test`
- **テストコード**: `mc-tests/tests/`

## テストコンソール（手動テスト用）

ブラウザで手動テストできる Web コンソール。Minecraft サーバーが起動している必要がある。

```powershell
cd mc-tests && npm run dev:console
# → http://localhost:7890/test-console
```

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
