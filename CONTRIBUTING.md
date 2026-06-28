# 開発環境セットアップガイド

## 目次

- [必要なツール](#必要なツール)
- [リポジトリのクローン](#リポジトリのクローン)
- [Java バックエンドのビルド](#java-バックエンドのビルド)
- [フロントエンドのセットアップ](#フロントエンドのセットアップ)
- [テクスチャアトラスの生成](#テクスチャアトラスの生成)
- [開発サーバーの起動](#開発サーバーの起動)
- [テストの実行](#テストの実行)

---

## 必要なツール

以下のツールをインストールしてください。

| ツール | バージョン | 用途 |
|---|---|---|
| JDK | 21 以上 | Java バックエンドのビルド |
| Maven | 3.x | Java ビルドツール |
| Node.js | 22 以上 | フロントエンド・テスト |
| PowerShell | 7.x | ビルドスクリプト実行 |

### Windows の場合

- **JDK**: [Adoptium Temurin 21](https://adoptium.net/) などからインストール
- **Maven**: [公式サイト](https://maven.apache.org/download.cgi) からダウンロードするか `winget install Apache.Maven`
- **Node.js**: [公式サイト](https://nodejs.org/) からインストール
- **PowerShell 7**: Microsoft Store または [GitHub Releases](https://github.com/PowerShell/PowerShell/releases) からインストール
- **WSL (Ubuntu)**: ブロックテクスチャアトラスの生成に必要

  ```powershell
  wsl --install -d Ubuntu
  ```

### macOS の場合

- **JDK**: `brew install temurin@21` または [Adoptium](https://adoptium.net/) から `.pkg` をインストール
- **Maven**: `brew install maven`
- **Node.js**: `brew install node@22`
- **PowerShell 7**: [公式 .pkg インストーラー](https://github.com/PowerShell/PowerShell/releases) からインストール（Homebrew は非推奨）
- **ブロックレンダリング用ライブラリ**: ブロックテクスチャアトラスの生成に必要

  ```sh
  brew install pkg-config cairo pango libpng jpeg giflib librsvg pixman
  ```

---

## リポジトリのクローン

```sh
git clone https://github.com/Kamesuta/AdvancementQuesting.git
cd AdvancementQuesting
```

---

## Java バックエンドのビルド

```sh
mvn clean package -DskipTests
```

ビルド成果物は `target/*.jar` に出力されます。

Minecraft サーバーへのデプロイも含めてビルドする場合は PowerShell スクリプトを使用します。

```powershell
pwsh scripts/build.ps1
```

---

## フロントエンドのセットアップ

```sh
cd web
npm install
```

---

## テクスチャアトラスの生成

クエスト UI でアイテム・ブロックのアイコンを表示するために、Minecraft のテクスチャアトラスを生成します。
アトラスは `web/public/mc/` に出力されます（gitignore 済み）。

```sh
cd web
npm run build:assets
```

このコマンドは以下を自動で行います：

1. 言語ファイル・レジストリ・アイテムアトラスをダウンロード
2. Minecraft クライアント JAR をダウンロード
3. 全ブロックを 3D レンダリングしてアトラス画像を生成

### Windows の場合

WSL (Ubuntu) を使ってレンダリングします。事前に `wsl --install -d Ubuntu` で Ubuntu をセットアップしてください。

### macOS の場合

ネイティブでレンダリングします。事前に以下のライブラリをインストールしてください（canvas・gl のビルドに必要）。

```sh
brew install pkg-config cairo pango libpng jpeg giflib librsvg pixman
```

---

## 開発サーバーの起動

モックバックエンドと Vite フロントエンドを同時に起動します。

```sh
cd web
npm run dev
```

| サービス | URL |
|---|---|
| フロントエンド | http://localhost:5173/ |
| モック API | http://localhost:3000/ |

> **注意**: この状態ではモックデータを使用します。実際の Minecraft サーバーと連携する場合は後述の mc-tests を参照してください。

---

## テストの実行

### フロントエンド E2E テスト（Playwright）

```sh
cd web
npm run test:e2e
```

### Java E2E テスト（mc-tests / Mineflayer）

Minecraft サーバーを自動で起動してテストします（初回は Paper JAR のダウンロードに時間がかかります）。

```sh
cd mc-tests
npm install
npm run test
```

---

## 並列開発（git worktree）

複数の機能を並行して開発する場合、`git worktree` を使って複数の作業ツリーを同時起動できます。
Claude Code で開発する場合は `/setup-worktree` スキルと `/worktree-build` スキルを使用します。

各 worktree は `PORT_OFFSET` 環境変数でポートをずらして共存できます。

| サービス | main (offset=0) | wt2 (offset=100) |
|---|---|---|
| モック API | 3001 | 3101 |
| Vite フロントエンド | 5174 | 5274 |
| Minecraft サーバー | 25599 | 25699 |
| プラグイン API | 8090 | 8190 |
| RCON | 25598 | 25698 |
| テストコンソール | 7890 | 7990 |
