# Minecraft アセット・データ取得設計

アイテム一覧・実績(Advancement)・統計(Statistics) をテクスチャ付き・日本語名付きで Web に表示するためのデータ取得方針。

---

## 方針まとめ

- **データソースは misode/mcmeta に一本化する**
- 実績 JSON・アイテム ID などの「ゲームデータ」は本番では Minecraft サーバーから直接取得できるため、mcmeta のデータは**モックサーバー専用**として使う
- テクスチャ・言語ファイルなどの「表示用アセット」は本番でもモックでも同じく mcmeta から取得する
- アセットは **`npm run build` 時にスクリプトで自動ダウンロード**し `public/mc/` に配置する。Git には含めない

---

## データの責務分担

| データ種別 | 本番 (プラグイン) | モック (mock-server) |
|-----------|----------------|-------------------|
| アイテム ID・一覧 | プラグインが Java API から取得して `/api/items` で返す | mcmeta `assets-json` の `registries/item/data.json` を使う |
| 実績 (Advancement) 定義 | プラグインが `server/world/advancements/` から読む | mcmeta `data` ブランチの `advancement/` を使う |
| 統計 (Statistics) キー | プラグインが内部 API から取得 | mcmeta `assets-json` の registry 情報を使う |
| 言語ファイル (`ja_jp.json`) | ビルド時に mcmeta から取得（本番・モック共通） | 同左 |
| テクスチャ PNG | ビルド時に mcmeta から取得（本番・モック共通） | 同左 |

---

## データソース: misode/mcmeta

https://github.com/misode/mcmeta

Mojang が配布するリソースパック・データパックを自動処理して GitHub に公開しているリポジトリ。バージョンごとにタグ (`1.21.4-assets` など) が付いており、特定バージョンのファイルを raw URL で直接取得できる。

使用するブランチ:

| ブランチ | 内容 | 用途 |
|---------|------|------|
| `assets` | テクスチャ PNG・言語 JSON・モデルなど | テクスチャ・言語ファイル取得 |
| `assets-json` | テクスチャ・音声を除いた JSON のみ | アイテムレジストリ・言語ファイル (軽量) |
| `data` | データパック形式 (Advancement・レシピ等) | モック用 Advancement 定義 |

---

## 取得対象ファイルと用途

### 表示用アセット（本番・モック共通）

ビルド時に取得し `public/mc/` に配置する。

| ファイル | mcmeta パス | サイズ感 | 用途 |
|---------|-----------|---------|------|
| `ja_jp.json` | `assets/minecraft/lang/ja_jp.json` | 〜500 KB | 全 ID の日本語名引き |
| `en_us.json` | `assets/minecraft/lang/en_us.json` | 〜500 KB | フォールバック用 |
| アイテムテクスチャ | `assets/minecraft/textures/item/*.png` | 〜5 MB | アイテムアイコン表示 |
| ブロックテクスチャ | `assets/minecraft/textures/block/*.png` | 〜10 MB | ブロックアイコン表示 |

テクスチャが多い場合は全件取得せず、アイテム一覧 API のレスポンスに含まれる ID だけを選択的に取得する方式も検討する。

### モック専用ゲームデータ

mock-server の初期化時 (`seed.ts` または `mock-server/mc-data/`) に取得・キャッシュする。

| データ | mcmeta パス | 用途 |
|--------|-----------|------|
| アイテムレジストリ | `assets-json` ブランチ `registries/item/data.json` | `/api/items` のレスポンス生成 |
| Advancement 定義 | `data` ブランチ `data/minecraft/advancement/**/*.json` | `/api/advancements` のレスポンス生成 |

---

## 言語ファイルのキー体系

`ja_jp.json` のキーと対応するゲーム要素:

| 種別 | キー形式 | 例 |
|------|---------|---|
| アイテム | `item.minecraft.<id>` | `item.minecraft.diamond_sword` → `ダイヤモンドの剣` |
| ブロック | `block.minecraft.<id>` | `block.minecraft.oak_log` → `オークの原木` |
| 実績タイトル | `advancements.<category>.<id>.title` | `advancements.story.mine_wood.title` → `木の切り出し` |
| 実績説明 | `advancements.<category>.<id>.description` | |
| 統計タイプ | `stat.minecraft.<type>` | `stat.minecraft.mined` → `採掘したブロック数` |
| エンティティ | `entity.minecraft.<id>` | `entity.minecraft.zombie` → `ゾンビ` |

アイテムとしてもブロックとしても存在するもの (原木など) は `item.minecraft.<id>` を優先し、なければ `block.minecraft.<id>` にフォールバックする。

---

## 実装: ビルドスクリプト

`web/scripts/download-mc-assets.ts` を新設し、`npm run build` のプリフックとして実行する。

```
npm run build
  └─ prebuild フック
       └─ tsx scripts/download-mc-assets.ts
            ├─ ja_jp.json, en_us.json をダウンロード
            └─ テクスチャ PNG をダウンロード
```

**バージョン定数** (`web/scripts/mc-version.ts`):

```ts
export const MC_VERSION = '1.21.4'

// ブランチ名はタグ形式: <version>-<branch>
export const MCMETA_ASSETS =
  `https://raw.githubusercontent.com/misode/mcmeta/${MC_VERSION}-assets`
export const MCMETA_ASSETS_JSON =
  `https://raw.githubusercontent.com/misode/mcmeta/${MC_VERSION}-assets-json`
export const MCMETA_DATA =
  `https://raw.githubusercontent.com/misode/mcmeta/${MC_VERSION}-data`
```

サーバーのバージョンを上げる際は `MC_VERSION` を変更して再ビルドするだけでよい。

**出力先:**

```
web/public/mc/          ← .gitignore 対象
  lang/
    ja_jp.json
    en_us.json
  textures/
    item/
      oak_log.png
      diamond_sword.png
      ...
    block/
      stone.png
      ...
```

---

## フロントエンドでの使い方

```ts
// 言語ファイルをロード (TanStack Query でキャッシュ)
const { data: lang } = useQuery({
  queryKey: ['mc-lang'],
  queryFn: () => fetch('/mc/lang/ja_jp.json').then(r => r.json()),
  staleTime: Infinity,
})

// アイテムの日本語名を引く
function getItemName(id: string): string {
  return lang?.[`item.minecraft.${id}`]
    ?? lang?.[`block.minecraft.${id}`]
    ?? id
}

// テクスチャ URL を組み立てる
function getItemTexture(id: string): string {
  return `/mc/textures/item/${id}.png`
  // ブロックは /mc/textures/block/${id}.png
}
```

---

## ライセンス

- Mojang のアセットは EULA により再配布が制限される
- `public/mc/` はビルド成果物として各自がダウンロードする形にし、Git リポジトリには含めない
- mcmeta はコミュニティリソースであり、配布元は Mojang ではなくコミュニティが管理している

---

## 参考 URL

| 用途 | URL |
|------|-----|
| mcmeta リポジトリ | https://github.com/misode/mcmeta |
| Minecraft Wiki - Advancement JSON | https://minecraft.wiki/w/Advancement/JSON_format |
| Minecraft Wiki - Statistics | https://minecraft.wiki/w/Statistics |
| Minecraft Wiki - Texture atlas | https://minecraft.wiki/w/Texture_atlas |
| Minecraft EULA | https://www.minecraft.net/en-us/eula |
