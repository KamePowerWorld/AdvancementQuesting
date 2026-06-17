# CLAUDE_ja.md

CLAUDE.md の日本語版。このリポジトリで作業する Claude Code 向けのガイドです。

## プロジェクト概要

AdvancementQuesting は PaperMC (Minecraft) プラグインで、Web UI 付きのクエストシステムを提供します。2 つの部分で構成されます。

1. **Java バックエンド** (`src/`) — 組み込み Javalin HTTP サーバーを持つ PaperMC プラグイン
2. **React フロントエンド** (`web/`) — ブラウザで動く TypeScript/React SPA

## 必ず守ること

- 実装が完了したら下記を行ってから次のタスクに進んでください。
  - `./build.ps1` を実行してビルドが通ることを確認する
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
