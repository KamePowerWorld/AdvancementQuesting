---
name: new-worktree
description: Create a new git worktree with all required setup (symlink, npm install). Use when the user says "worktreeを作って", "新しいworktree", "new worktree", or names a branch to work on in parallel.
---

# new-worktree skill

Creates a new git worktree and sets it up for development.

## Steps

1. Ask the user for the branch name if not already provided (e.g. `feature/C-6`).

2. Run:

```powershell
& "scripts\new-worktree.ps1" -Branch "feature/xxx"
```

3. Tell the user the worktree path shown in the output.
