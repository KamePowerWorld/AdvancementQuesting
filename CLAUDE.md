# CLAUDE.md

PaperMC plugin + React SPA. Java: `src/`, Frontend: `web/`.
Temp files → `tmp/`. One-off Playwright → `*.tmp.spec.ts` (gitignored).

## Must Follow

After each implementation unit:
1. `/worktree-build` — confirm pass
2. Playwright E2E + Mineflayer E2E tests
3. Commit to Git

→ [Testing](docs/agents/testing.md) | [Worktree](docs/agents/worktree.md)
