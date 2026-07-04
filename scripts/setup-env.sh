#!/usr/bin/env bash
# SessionStart フック: ワークツリー固有の PORT_OFFSET / 各ポート / API_BASE を
# セッション環境へ強制注入（CLAUDE_ENV_FILE）し、同時に tmp/port-env にも書き出す。
#
# 目的: 人やエージェントが PORT_OFFSET=100 ... を手打ちしなくても、直接
#   node --test でテストを走らせても、常に正しいポートへ向くようにする。
#   「間違ったポートへ黙ってリクエストを送り続ける」トークン浪費の根絶。
#
# 二重化: CLAUDE_ENV_FILE 伝播（公式）が効かない環境でも tmp/port-env を
#   helpers.ts / setup.js が読むフォールバックになる。

set -u

# ワークツリーのルート
WT_DIR="${CLAUDE_PROJECT_DIR:-}"
if [ -z "$WT_DIR" ]; then
  WT_DIR="$(git rev-parse --show-toplevel 2>/dev/null)"
fi
if [ -z "$WT_DIR" ]; then
  echo "[env] worktree path 不明のためスキップ"
  exit 0
fi

# main か worktree か判定（git worktree list --porcelain の先頭 = main）
MAIN_PATH="$(git -C "$WT_DIR" worktree list --porcelain 2>/dev/null | awk '/^worktree /{print $2; exit}')"
if [ -z "$MAIN_PATH" ] || [ "$WT_DIR" = "$MAIN_PATH" ]; then
  # main リポジトリは基準ポートのまま（オフセット 0）
  PORT_OFFSET=0
else
  # ワークツリーパスの安定ハッシュ → 1..199（0 を避けて main と衝突しない）
  H="$(printf '%s' "$WT_DIR" | cksum | awk '{print $1}')"
  PORT_OFFSET=$(( (H % 199) + 1 ))
fi

MC_PORT=$(( 25599 + PORT_OFFSET ))
API_PORT=$(( 8090  + PORT_OFFSET ))
RCON_PORT=$(( 25598 + PORT_OFFSET ))
API_BASE="http://localhost:${API_PORT}"

# フォールバック用ファイル（単一参照元）
mkdir -p "$WT_DIR/tmp"
PORT_ENV="$WT_DIR/tmp/port-env"
cat > "$PORT_ENV" <<EOF
PORT_OFFSET=$PORT_OFFSET
MC_PORT=$MC_PORT
API_PORT=$API_PORT
RCON_PORT=$RCON_PORT
API_BASE=$API_BASE
EOF

# セッション環境へ強制注入（公式仕組み: CLAUDE_ENV_FILE）
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  {
    echo "PORT_OFFSET=$PORT_OFFSET"
    echo "MC_PORT=$MC_PORT"
    echo "API_PORT=$API_PORT"
    echo "RCON_PORT=$RCON_PORT"
    echo "API_BASE=$API_BASE"
  } >> "$CLAUDE_ENV_FILE"
fi

# 見える化バナー（毎セッションで解決済みポートを即座に表示）
echo "[env] PORT_OFFSET=$PORT_OFFSET API_BASE=$API_BASE MC=$MC_PORT RCON=$RCON_PORT (worktree=${WT_DIR##*/})"
exit 0
