// Idempotent launcher for the Test Console server.
// - Exits quietly if the console port is already in use (already running).
// - Otherwise spawns `tsx test-server.ts` detached so it survives the hook process.
// Intended to be called from a Claude Code Stop hook.
import { spawn } from 'node:child_process'
import { createConnection } from 'node:net'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { openSync, writeFileSync, statSync } from 'node:fs'

const PORT_OFFSET = parseInt(process.env.PORT_OFFSET ?? '0', 10)
const PORT = 7890 + PORT_OFFSET
const __dirname = dirname(fileURLToPath(import.meta.url))
const lockFile = join(__dirname, `.console-${PORT}.lock`)
// A fresh lock (< 15s old) means another invocation is mid-startup; tsx
// takes a few seconds to bind the port, so the port check alone can race.
const LOCK_TTL_MS = 15_000

function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = createConnection({ port, host: '127.0.0.1' })
    sock.setTimeout(800)
    sock.on('connect', () => { sock.destroy(); resolve(true) })
    sock.on('timeout', () => { sock.destroy(); resolve(false) })
    sock.on('error', () => resolve(false))
  })
}

if (await isPortOpen(PORT)) {
  console.log(`Test Console already running: http://localhost:${PORT}/test-console`)
  process.exit(0)
}

// Port not yet open — but another invocation may be starting up. Honor a recent lock.
try {
  const age = Date.now() - statSync(lockFile).mtimeMs
  if (age < LOCK_TTL_MS) {
    console.log(`Test Console is starting (lock held ${Math.round(age / 1000)}s ago): http://localhost:${PORT}/test-console`)
    process.exit(0)
  }
} catch { /* no lock file — proceed */ }
writeFileSync(lockFile, String(process.pid))

const logFile = join(__dirname, 'test-console.log')
const out = openSync(logFile, 'a')
const child = spawn('npx', ['tsx', join(__dirname, 'test-server.ts')], {
  cwd: __dirname,
  detached: true,
  stdio: ['ignore', out, out],
  shell: process.platform === 'win32',
  env: process.env,
})
child.unref()
console.log(`Test Console starting: http://localhost:${PORT}/test-console (log: ${logFile})`)
