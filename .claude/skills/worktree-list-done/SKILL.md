---
name: worktree-list-done
description: List worktrees marked as verified (動作確認完了) in WORKTREE_INFO.json. Use when the user says "動作確認完了のworktreeを列挙", "マージ準備完了", "worktree-list-done", or asks which worktrees are ready to merge.
---

# worktree-list-done skill

Lists all worktrees where `verified: true` is set in `target/WORKTREE_INFO.json`.

## Steps

Run:

```powershell
& "${CLAUDE_SKILL_DIR}/scripts/worktree-list-done.ps1"
```

Report the results to the user in a clear list. If none are found, say so.
