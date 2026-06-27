# Worktree

## Setup

When starting a session in a worktree, run `/setup-worktree` first. It symlinks `web/public` and runs `npm install`. Safe to run multiple times.

At the end of a session, run `/worktree-build` to build without deploying to `run/`.

## Port Offsets

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
