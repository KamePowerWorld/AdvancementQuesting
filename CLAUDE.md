# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AdvancementQuesting is a PaperMC (Minecraft) plugin that provides a quest system with a web-based UI. It consists of two parts:

1. **Java backend** (`src/`) — PaperMC plugin with an embedded Javalin HTTP server
2. **React frontend** (`web/`) — TypeScript/React SPA that runs in the browser

## Temporary Files

Save screenshots, transient test results, and debug files to `tmp/`.

One-off Playwright scripts go alongside the relevant test directory as `*.tmp.spec.ts` (e.g. `web/tests/screenshot.tmp.spec.ts`) — these are gitignored. Run with `npx playwright test --headed`.

## Must Follow

After completing each implementation unit, do all of the following before moving to the next task:

- Run `/worktree-build` and confirm the build passes.
- Run Playwright E2E tests (desktop and mobile).
- Run Mineflayer E2E tests.
- Commit to Git.

## Testing

Use frontend tests for anything verifiable in the browser alone; use Java tests for anything that requires a live Minecraft server. Add a test for every UI change and every bug fix.

### Frontend Tests

- **Run**: `cd web && npm run test:e2e`
- **Test code**: `web/tests/`

### Java Tests (mc-tests)

- **Run**: `cd mc-tests && npm run test`
- **Test code**: `mc-tests/tests/`

## Test Console (Manual Testing)

Browser-based console for manual testing. Requires Minecraft server running.

```powershell
cd mc-tests && npm run dev:console
# → http://localhost:7890/test-console
```

## Parallel Development with git worktree

Use `/new-worktree` to create a new worktree (handles symlinks and npm install automatically).

`PORT_OFFSET` shifts all port numbers so multiple worktrees can run simultaneously.

| Service | main (offset=0) | wt2 (offset=100) |
|---|---|---|
| Mock backend (API) | 3001 | 3101 |
| Vite frontend | 5174 | 5274 |
| Minecraft server | 25599 | 25699 |
| Plugin API (Web UI) | 8090 | 8190 |
| RCON | 25598 | 25698 |
| Test Console | 7890 | 7990 |

The test SQLite DB is also isolated automatically (`test.db` vs `test100.db`).

## Worktree Build & Deploy

In a worktree session, after completing a task, call `/worktree-build`.
