# Plan: WebベースのMinecraftテストコンソール（改訂版）

## Context

スマホ+Chrome 2分割でのテストが大変なので、ブラウザだけで手動テストできる「テストコンソール」を作る。

**方針:**
- MCサーバーと `dev:console`（port 7890）は**常時稼働**前提
- 操作対象は**ベースプロジェクト（main）の `run/` フォルダ**のみ
- worktreeのJARは `POST /api/worktrees/deploy` 時に `run/plugins/` にコピー → autoreload が自動検知
- Claude の Stop フックで `scripts/build.ps1 -Worktree $CLAUDE_PROJECT_DIR` を呼んでビルド + `WORKTREE_INFO.txt` 書き込み

---

## 全体像

```
ブラウザ (port 7890, 常時稼働)
  ├── 上部: <iframe> クエスト Web UI (ベース run/ の Plugin API, port 8090)
  │         ← ワンタップログインでトークン注入
  └── 下部: 操作パネル
        ├── [worktree選択プルダウン] [デプロイ] → JARコピー → autoreload発火 → iframe自動リロード
        ├── ボット接続 / quest-login ボタン
        ├── give / op / gamemode / 任意コマンド
        └── チャットログ (SSE リアルタイム)

Claude Stop フック（worktreeセッション時）:
  scripts/build.ps1 -Worktree $CLAUDE_PROJECT_DIR -SkipTests
  → ビルドのみ (run/ へのコピーなし)
  → target/WORKTREE_INFO.txt にworktreeパスを書き込む
```

---

## 現状の実装（すでに完成済み）

- `mc-tests/test-server.ts` — Express + SSE + プロキシ（port 7890）
- `mc-tests/test-server-bot.ts` — BotManager（connect/disconnect/give/op等）
- `mc-tests/public/test-console.html` — スマホ対応バニラHTML UI
- `mc-tests/start-console.mjs` — 冪等ランチャー（**→ start-console.ts に変換**）
- `.claude/settings.json` — Stop フック（`start-console.ts` を呼ぶ）
- `mc-tests/package.json` — express / http-proxy-middleware 追加済み
- `CLAUDE.md` — テストコンソール・ポート表追記済み

---

## 追加実装（この計画で実施）

### 1. `start-console.mjs` → `start-console.ts` に変換

`.mjs` ではなく TypeScript に統一する（`tsx` で実行可能）。
内容は同じ（冪等ランチャー：ポートが空いていれば `tsx test-server.ts` を detach 起動）。

`.claude/settings.json` のコマンドも `npx tsx start-console.ts` に更新。

### 2. `scripts/build.ps1` の拡張

`-Worktree` パラメータを追加：

**`-Worktree` なし（通常）**: 既存の動作そのまま（ビルド → `run/plugins/` にコピー）

**`-Worktree <path>` あり（worktreeビルド）**:
- ビルドのみ、`run/` へのコピーは**しない**
- `target/WORKTREE_INFO.json` にビルド情報を書き込む
- worktreeプルダウンUIはこのファイルを読んで「何のタスク用か・いつビルドしたか」を表示

**`target/WORKTREE_INFO.json` 形式:**
```json
{
  "worktreePath": "D:/softdata/git/AdvancementQuesting-wt2",
  "branch": "feature/C-6",
  "builtAt": "2026-06-22T14:30:00.000Z"
}
```

```powershell
param(
    [switch]$SkipTests,
    [string]$Worktree = ""
)

# ... 既存のmaven buildは変わらず ...

if ($Worktree) {
    # worktreeモード: run/ へのコピーはしない
    $branch = (git -C $Root rev-parse --abbrev-ref HEAD 2>$null) ?? "unknown"
    $info = @{ worktreePath = $Worktree; branch = $branch; builtAt = (Get-Date -Format 'o') } | ConvertTo-Json
    Set-Content "$Root\target\WORKTREE_INFO.json" $info
    Write-Host "-> Worktree build complete (no deploy). Use test-console to deploy." -ForegroundColor Yellow
} else {
    # 通常モード: 既存のコピー処理（変更なし）
    # ベースもWORKTREE_INFO.jsonを書いてプルダウンに表示できるようにする
    $branch = (git -C $Root rev-parse --abbrev-ref HEAD 2>$null) ?? "main"
    $info = @{ worktreePath = $Root; branch = $branch; builtAt = (Get-Date -Format 'o') } | ConvertTo-Json
    Set-Content "$Root\target\WORKTREE_INFO.json" $info
}
```

### 3. `test-server.ts` に worktree API を追加

```
GET  /api/worktrees            → worktree一覧
POST /api/worktrees/deploy     { path: string } → JARをrun/plugins/にコピー
```

**`GET /api/worktrees` の実装:**
```typescript
// git worktree list --porcelain を実行してパース
// 各worktreeに対して target/WORKTREE_INFO.json の有無を確認
// 返却形式: [{ path, branch, builtAt, label, hasJar, isBase }]
// label: branch名
// builtAt: WORKTREE_INFO.json の builtAt (ISO8601)
// 並び順: builtAt 降順（最近のビルドが上）
```

UI表示（プルダウン各行）:
```
feature/C-6  [14:30 · 3分前]
main ★       [13:05 · 1時間前]
feature/C-7  [未ビルド]
```

**`POST /api/worktrees/deploy` の実装:**
```typescript
// 1. {path}/target/ から AdvancementQuesting-*.jar を検索
// 2. PluginName から -1.0-SNAPSHOT 等のバージョン suffix を除去 → "AdvancementQuesting"
// 3. $BASE_DIR/run/plugins/AdvancementQuesting.jar に上書きコピー
// 4. autoreload が自動検知 → リロード（API呼び出し不要）
// 5. { ok: true, deployedFrom: path } を返す
```

JARファイル名の正規化: `-1.0-SNAPSHOT` などのバージョン suffix を除去して `AdvancementQuesting.jar` に統一。
```typescript
// "AdvancementQuesting-1.0-SNAPSHOT.jar" → "AdvancementQuesting"
const pluginName = jar.replace(/-[\d.]+(-SNAPSHOT)?\.jar$/, '').replace(/-[a-zA-Z]+-?\d*\.jar$/, '')
```

### 4. `test-console.html` に worktree プルダウン追加

現在の HTML の操作パネル上部に追加：

```
WORKTREE  [main (現在) / feature/C-6 (タスクXXX) ▼]  [デプロイ]
```

- 展開時: `GET /api/worktrees` で取得
- ベースプロジェクトは `★` マーク
- `WORKTREE_INFO.txt` がある worktree はラベルを表示
- デプロイ後: 3秒待ってから iframe をリロード（autoreload の時間）

### 5. `.claude/settings.json` Stop フック更新

**start-console の自動起動は不要**（つけっぱなし想定）。
Stop フックは `scripts/build.ps1 -Worktree` の呼び出しのみ：

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "powershell -File \"$CLAUDE_PROJECT_DIR/scripts/build.ps1\" -SkipTests -Worktree \"$CLAUDE_PROJECT_DIR\"",
            "async": true,
            "statusMessage": "Worktree ビルド中…"
          }
        ]
      }
    ]
  }
}
```

ベースプロジェクトでも worktreeでも同じフックが発火する。
`scripts/build.ps1` は `-Worktree` の有無ではなく「そのパスがベースかworktreeか」で動作を変える：
- ベース（`$Root == $Worktree`）: 既存の `run/` コピー + WORKTREE_INFO.json 書き込み
- worktree（`$Root != $Worktree`）: ビルドのみ + WORKTREE_INFO.json 書き込み（`run/` コピーなし）

---

## 実装順序

1. `start-console.mjs` を `start-console.ts` に変換（内容は同じ、拡張子だけ変更）
2. `scripts/build.ps1` に `-Worktree` パラメータ + `WORKTREE_INFO.txt` 書き込みを追加
3. `test-server.ts` に `/api/worktrees` + `/api/worktrees/deploy` を追加
4. `test-console.html` に worktree プルダウン UI を追加
5. `.claude/settings.json` の Stop フックを更新（start-console.ts + scripts/build.ps1 呼び出し）
6. `CLAUDE.md` 更新（worktree Stop フックの説明）
7. 型チェック確認

---

## 検証方法

1. `cd mc-tests && npm run dev:console` でサーバー起動 → `http://localhost:7890/test-console`
2. worktreeプルダウンに `main` が表示されることを確認
3. worktreeを作成: `git worktree add ../AQ-wt2 -b feature/test`
4. Claude Stop フック発火で `scripts/build.ps1 -Worktree ../AQ-wt2 -SkipTests` が実行される
5. プルダウンに `feature/test` が現れ、デプロイボタン → JARコピー → autoreload → iframe更新
