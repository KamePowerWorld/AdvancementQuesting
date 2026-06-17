# asset-atlas-builder

Minecraft のアイテム・ブロックアイコン表示に必要なアセットを生成するビルドパイプライン。

## 概要

Web UI でアイテムアイコンを表示するために、以下の2種類のテクスチャアトラスを生成する。

| アトラス | ファイル | 内容 |
|---|---|---|
| アイテムアトラス | `public/mc/atlas/items.png` | 平面アイテム（りんご・ダイヤモンド・弓など） |
| ブロックアトラス | `public/mc/atlas/blocks.png` | ブロックのアイソメトリック3Dレンダリング（原木・石・ボタンなど） |

アトラスとはスプライトシートのことで、大量の小画像を1枚の PNG にまとめたもの。
これにより、アイコン1個ずつをHTTPリクエストする方式（880リクエスト）から2リクエストに削減できる。

## 情報源

### misode/mcmeta

[https://github.com/misode/mcmeta](https://github.com/misode/mcmeta)

Minecraft の全バージョンのアセット・データを GitHub ブランチとして公開しているリポジトリ。
バージョンごとにブランチが分かれており、`raw.githubusercontent.com` から直接ファイルを取得できる。

| ブランチ | 内容 | 用途 |
|---|---|---|
| `1.21.11-assets-json` | 言語ファイル (`lang/ja_jp.json` など) | アイテム名の日本語/英語表示 |
| `1.21.11-registries` | アイテム・アドバンスメント等のIDリスト | アイテムピッカーの全件リスト |
| `1.21.11-atlas` | アイテムテクスチャアトラス (`items/atlas.png` + `items/data.json`) | アイテムアトラス本体 |

### @blackblockrocks/minecraft-render

[https://github.com/co3moz/minecraft-render](https://github.com/co3moz/minecraft-render)

Minecraft の `client.jar` からブロックモデル・テクスチャを読み込み、Three.js で3Dレンダリングして PNG に書き出す npm パッケージ。
WebGL が必要なため Linux (WSL) 上で `xvfb-run` と組み合わせて実行する。

## ファイル構成

```
asset-atlas-builder/
  mc-version.ts          # バージョン定数・misode/mcmeta の URL 定義
  download-mc-assets.ts  # Step 1: 言語・レジストリ・アイテムアトラスをダウンロード
  render-blocks.ts       # Step 2: ブロックを3Dレンダリングしてアトラス化
  render-blocks-cache/   # キャッシュ (gitignore済み)
    minecraft.jar        # Minecraft client.jar (自動ダウンロード)
    rendered/            # minecraft-render の出力PNG群

生成物 (gitignore済み):
public/mc/
  lang/
    ja_jp.json           # 日本語言語ファイル
    en_us.json           # 英語言語ファイル
  registry/
    item.json            # 全アイテムIDリスト
    advancement.json     # 全アドバンスメントIDリスト
    custom_stat.json     # カスタム統計IDリスト
  atlas/
    items.png            # アイテムアトラス画像 (misode製)
    items.json           # アイテムアトラス座標マップ (キー: "item/diamond")
    items-size.json      # アイテムアトラスの画像サイズ
    blocks.png           # ブロックアトラス画像 (minecraft-render製)
    blocks.json          # ブロックアトラス座標マップ (キー: "block/oak_log", _metaあり)
```

## 仕組み

### Step 1: download-mc-assets.ts

1. `misode/mcmeta` の `1.21.11-assets-json` ブランチから言語ファイルをダウンロード
2. `1.21.11-registries` ブランチからアイテム・アドバンスメント・カスタム統計のIDリストをダウンロード
3. `1.21.11-atlas` ブランチからアイテムアトラス (`items.png` + `items.json`) をダウンロード
4. `sharp` で `items.png` の実サイズを読み取り `items-size.json` に保存

既にファイルが存在する場合はスキップ（キャッシュとして機能）。

### Step 2: render-blocks.ts

1. Minecraft 1.21.11 の `client.jar` を Mojang の公式 API からダウンロード（キャッシュ済みならスキップ）
2. WSL Ubuntu 上に `@blackblockrocks/minecraft-render` をインストール
3. `xvfb-run` (仮想ディスプレイ) を使って `minecraft-render` を実行し、全ブロックを 128×128px の PNG にレンダリング
4. レンダリング結果を Windows 側にコピー
5. アイテムレジストリ (`item.json`) と照合してマッチした PNG のみ収集
6. `sharp` で全 PNG をグリッド配置して1枚のアトラス PNG に合成
7. 座標マップ (`blocks.json`) を出力（`_meta` にアトラスサイズ・タイルサイズを含む）

レンダリングキャッシュ (`render-blocks-cache/rendered/`) が存在する場合は再レンダリングをスキップ。

### アトラスの利用 (ItemIcon.tsx)

`useMcAtlas()` フックが `items.json` と `blocks.json` をマージして座標マップを提供する。
`ItemIcon` コンポーネントは CSS の `background-image` + `background-position` + `background-size` でスプライト表示する。

- アイテム (`item/diamond` など): `items.png` から等倍表示
- ブロック (`block/oak_log` など): `blocks.png` から 1.6 倍スケールでタイル中央を表示
- どちらにも存在しないアイテム: SVG カラーフォールバック

## 手順

### 前提条件

- Node.js 18以上
- WSL (Ubuntu) がインストールされていること（ブロックレンダリングに必要）
- WSL 内に `xvfb` がインストールされていること（初回は自動インストール）

### 実行方法

```bash
cd web

# アセット全体を生成（download-assets → render-blocks の順に実行）
npm run build:assets

# 個別実行
npm run build:assets  # 内部で以下を順番に呼び出す
#   → asset-atlas-builder: npm run download-assets  (言語・レジストリ・アイテムアトラス)
#   → asset-atlas-builder: npm run render-blocks    (ブロックアトラス)
```

### キャッシュのクリア

```bash
# アイテムアトラス・言語・レジストリを再ダウンロードしたい場合
rm -rf web/public/mc/

# ブロックを再レンダリングしたい場合
rm -rf web/asset-atlas-builder/render-blocks-cache/rendered/

# Minecraft JARも再ダウンロードしたい場合
rm -rf web/asset-atlas-builder/render-blocks-cache/
```

### バージョンアップ

`mc-version.ts` の `MC_VERSION` を変更してキャッシュをクリアしてから再実行する。

```ts
export const MC_VERSION = '1.21.11'  // ここを変更
```
