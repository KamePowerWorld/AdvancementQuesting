---
name: worktree-build
description: Build the worktree JAR (Maven, no deploy). Use when the user says "ビルドして", "worktreeビルド", or at the end of a task.
---

# worktree-build skill

Builds the JAR for the current worktree and records the task name in `target/WORKTREE_INFO.json`.
Does NOT copy to `run/` — deploy via the test-console UI.

## Steps

1. Determine the task name: a one-line Japanese description of what was implemented (e.g. `"ホバーで報酬表示"`, `"タブ機能追加"`). Derive it from the user's request if not explicitly stated.

2. Run:

```powershell
& "${CLAUDE_SKILL_DIR}/scripts/worktree-build.ps1" -TaskName "タスク名（日本語）"
```

3. On success, tell the user: "ビルド完了。test-console のデプロイドロップダウンから反映できます。"
