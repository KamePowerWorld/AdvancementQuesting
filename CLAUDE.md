# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AdvancementQuesting is a PaperMC (Minecraft) plugin that provides a quest system with a web-based UI. It consists of two parts:

1. **Java backend** (`src/`) — PaperMC plugin with an embedded Javalin HTTP server
2. **React frontend** (`web/`) — TypeScript/React SPA that runs in the browser

## Must Follow

After completing each implementation unit, do all of the following before moving to the next task:

- Run `./build.ps1` and confirm the build passes.
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
