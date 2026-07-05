---
name: git-rebase
description: Run `git rebase -i` non-interactively (squash/fixup/reword/reorder/drop commits) to rewrite branch history from a terminal that has no interactive editor. ALWAYS use this to rewrite history — never `git reset` to squash/reorder commits.
---

# git-rebase skill

`git rebase -i` is blocked in this environment because it opens an interactive
editor. This skill drives it non-interactively by feeding the todo list and
commit messages from files via `GIT_SEQUENCE_EDITOR` / `GIT_EDITOR`.

## Steps

1. **Check state.** Make sure the working tree is clean (`git status`) and note
   the base ref (usually `main`). List the commits:

   ```bash
   git log --reverse --format='pick %h %s' <base>..HEAD > tmp/todo.txt
   ```

   `tmp/todo.txt` now holds the default todo in apply order (oldest first).

2. **Edit `tmp/todo.txt`** into the plan. Same verbs as interactive rebase:
   - `pick`   — keep the commit as-is
   - `fixup`  — merge into the previous kept commit, **discard** this message
   - `squash` — merge into the previous kept commit, **combine** messages (asks for a message)
   - `reword` — keep the commit, change its message (asks for a message)
   - `drop`   — remove the commit entirely
   - reorder by moving lines

   To make "spec became A, then changed to B" history disappear: keep the final
   (B) commit as `pick`/`reword` and mark the superseded (A) commits `fixup` (or
   `drop` if the change was fully reverted).

3. **(Optional) messages file** — only if the plan has any `reword` or `squash`.
   Write `tmp/msgs.txt` with one message per `reword`/`squash`, in the order git
   asks (top-to-bottom), separated by a lone `====` line:

   ```
   refactor: NamespacedIdへ全面移行

   本文...
   ====
   fix: 次のメッセージ
   ```

   Pure `pick`/`fixup`/`drop` plans need **no** messages file.

4. **Run it** (PowerShell / pwsh — works on Windows and macOS):

   ```powershell
   & "${CLAUDE_SKILL_DIR}/scripts/git-rebase-plan.ps1" -Base <base> -Todo tmp/todo.txt [-Messages tmp/msgs.txt]
   ```

5. **Verify** with `git log --oneline <base>..HEAD` and show the user the new
   history. If anything looks wrong, `git rebase --abort` (mid-rebase) or
   `git reset --hard <original-sha>` restores the branch — capture the original
   HEAD sha before starting so recovery is trivial.

## Notes

- The rebase can still stop on a **merge conflict**. It is not interactive then —
  resolve files, `git add`, then continue with the editor suppressed:
  `$env:GIT_EDITOR='true'; git rebase --continue`.
- `fixup` never triggers the message editor; prefer it over `squash` when you
  just want to drop the absorbed commit's message — no messages file required.
- Everything goes through `tmp/` per project convention (gitignored).
