# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AdvancementQuesting is a PaperMC (Minecraft) plugin that provides a quest system with a web-based UI. It consists of two parts:

1. **Java backend** (`src/`) — PaperMC plugin with an embedded Javalin HTTP server
2. **React frontend** (`web/`) — TypeScript/React SPA that runs in the browser

## Temporary Files

Save all screenshots, transient test results, and debug files to `tmp/`. This directory is excluded via `.gitignore`.

One-off Playwright scripts for visual verification should also live in `tmp/` (e.g. `tmp/screenshot.spec.ts`), not in `web/tests/`. Run them with `npx playwright test ../../tmp/screenshot.spec.ts --headed`.

## Must Follow

After completing each implementation unit, do all of the following before moving to the next task:

- Run `/worktree-build` and confirm the build passes.
- Run Playwright E2E tests (desktop and mobile).
- Run Mineflayer E2E tests.
- Commit to Git.

## Testing

Use frontend tests for anything verifiable in the browser alone; use Java tests for anything that requires a live Minecraft server.

### Frontend Tests

Playwright E2E tests. The mock server and Vite start automatically — no manual setup needed.

- **Run**: `cd web && npm run test:e2e` (UI mode: `npm run test:e2e:ui`)
- **Test code**: `web/tests/`
- **Add a test here for every UI change.**
- **Add a test for every bug fix.** A bug fix with no test reproducing the scenario is not "done".
- Use `--headed` when debugging flaky or visually-dependent tests.

Ports:

| Service | Port |
|---|---|
| Mock backend (API) | 3001 |
| Vite frontend | 5174 |

### Java Tests (mc-tests)

A real Paper server starts, a Mineflayer bot logs in, and Playwright verifies that the Web UI correctly reflects in-game actions.

- **Run**: `cd mc-tests && npm run test`
- **Test code**: `mc-tests/tests/`
- **Add a test here for every Minecraft-side code change.**
- Setup code (Paper JAR download, server start/stop) is in `mc-tests/setup.js`.

Ports:

| Service | Port |
|---|---|
| Minecraft server | 25599 |
| Plugin API (Web UI) | 8090 |
| RCON | 25598 |

## Test Console (Manual Testing)

Browser-based console for manual testing. Requires Minecraft server running.

```powershell
cd mc-tests && npm run dev:console
# → http://localhost:7890/test-console
```

Ports:

| Service | main (offset=0) | wt2 (offset=100) |
|---|---|---|
| Test Console | 7890 | 7990 |

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
