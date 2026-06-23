import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readdirSync, copyFileSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import express, { Request, Response } from 'express'

import { rcon } from './tests/helpers.js'
import { botManager } from './test-server-bot.js'

const PORT_OFFSET = parseInt(process.env.PORT_OFFSET ?? '0', 10)
const PORT = 7890 + PORT_OFFSET
// mc-tests run/ uses 8080 (default); mc-tests test server uses 8090 via run-template override
const API_PORT = parseInt(process.env.API_PORT ?? String(8080 + PORT_OFFSET), 10)

// Set MC/RCON port defaults for the always-on server before helpers.ts reads them
// (mc-tests test runs override these via their own env setup)
if (!process.env.MC_PORT) process.env.MC_PORT = String(25565 + PORT_OFFSET)
if (!process.env.RCON_PORT) process.env.RCON_PORT = String(25575 + PORT_OFFSET)
if (!process.env.RCON_PASS) process.env.RCON_PASS = 'kame'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE_DIR = resolve(__dirname, '..')

const app = express()
app.use(express.json())
app.use(express.static(join(__dirname, 'public')))

// SSE client list
const sseClients: Response[] = []

botManager.on('message', (msg) => {
  const data = JSON.stringify(msg)
  for (const res of [...sseClients]) {
    res.write(`event: message\ndata: ${data}\n\n`)
  }
})

botManager.on('status', (status) => {
  const data = JSON.stringify(status)
  for (const res of [...sseClients]) {
    res.write(`event: status\ndata: ${data}\n\n`)
  }
})

// SSE endpoint
app.get('/api/bot/chat-stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  // Send current status + backlog immediately
  res.write(`event: status\ndata: ${JSON.stringify(botManager.getStatus())}\n\n`)
  for (const msg of botManager.getChatLog()) {
    res.write(`event: message\ndata: ${JSON.stringify(msg)}\n\n`)
  }

  sseClients.push(res)
  req.on('close', () => {
    const idx = sseClients.indexOf(res)
    if (idx !== -1) sseClients.splice(idx, 1)
  })
})

// Bot status
app.get('/api/bot/status', (_req: Request, res: Response) => {
  res.json(botManager.getStatus())
})

// Bot chat log
app.get('/api/bot/chat', (_req: Request, res: Response) => {
  res.json(botManager.getChatLog())
})

// Connect bot
app.post('/api/bot/connect', async (req: Request, res: Response) => {
  const username: string = req.body.username ?? 'TestConsoleBot'
  try {
    await botManager.connect(username)
    res.json({ ok: true, status: botManager.getStatus() })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

// Disconnect bot
app.post('/api/bot/disconnect', async (_req: Request, res: Response) => {
  try {
    await botManager.disconnect()
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

// Send chat / command
app.post('/api/bot/chat', (req: Request, res: Response) => {
  const { text } = req.body as { text: string }
  try {
    botManager.sendChat(text)
    res.json({ ok: true })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

// One-tap login: get quest code via bot and return it
app.post('/api/bot/quest-login', async (_req: Request, res: Response) => {
  try {
    const code = await botManager.getQuestCode()
    res.json({ code })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

// RCON: raw command
app.post('/api/rcon', async (req: Request, res: Response) => {
  const { cmd } = req.body as { cmd: string }
  try {
    const result = await rcon(cmd)
    res.json({ result })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

// RCON shortcuts
app.post('/api/bot/give', async (req: Request, res: Response) => {
  const { player, item, count = 1 } = req.body as { player: string; item: string; count?: number }
  try {
    const result = await rcon(`give ${player} ${item} ${count}`)
    res.json({ result })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

app.post('/api/bot/op', async (req: Request, res: Response) => {
  const { player } = req.body as { player: string }
  try {
    const result = await rcon(`op ${player}`)
    res.json({ result })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

app.post('/api/bot/gamemode', async (req: Request, res: Response) => {
  const { mode, player } = req.body as { mode: string; player: string }
  try {
    const result = await rcon(`gamemode ${mode} ${player}`)
    res.json({ result })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

// ---- Minecraft server management ----
const MC_RUN_DIR = resolve(BASE_DIR, 'run')
const mcConsoleClients: Response[] = []
const mcConsoleLog: string[] = []
let mcProc: ChildProcess | null = null

interface McStatusInfo { status: 'running' | 'stopped'; external: boolean }

async function mcStatusInfo(): Promise<McStatusInfo> {
  if (mcProc) return { status: 'running', external: false }
  const reachable = await isMcApiReachable()
  return { status: reachable ? 'running' : 'stopped', external: reachable }
}

function pushMcLog(line: string) {
  mcConsoleLog.push(line)
  if (mcConsoleLog.length > 500) mcConsoleLog.shift()
  for (const res of [...mcConsoleClients]) {
    res.write(`data: ${JSON.stringify(line)}\n\n`)
  }
}

// SSE: MC console stream
app.get('/api/mc/console-stream', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
  // send backlog
  for (const line of mcConsoleLog) res.write(`data: ${JSON.stringify(line)}\n\n`)
  const info = await mcStatusInfo()
  res.write(`event: status\ndata: ${JSON.stringify(info)}\n\n`)
  mcConsoleClients.push(res)
  req.on('close', () => {
    const i = mcConsoleClients.indexOf(res)
    if (i !== -1) mcConsoleClients.splice(i, 1)
  })
})

async function broadcastMcStatus() {
  const info = await mcStatusInfo()
  const data = JSON.stringify(info)
  for (const res of [...mcConsoleClients]) res.write(`event: status\ndata: ${data}\n\n`)
}

app.get('/api/mc/status', async (_req: Request, res: Response) => {
  const info = await mcStatusInfo()
  res.json({ ...info, apiPort: API_PORT })
})

async function isMcApiReachable(): Promise<boolean> {
  try {
    const r = await fetch(`http://localhost:${API_PORT}/`, { signal: AbortSignal.timeout(2000) })
    return r.status < 500
  } catch { return false }
}

app.post('/api/mc/start', async (_req: Request, res: Response) => {
  if (mcProc) { res.json({ ok: true, already: true }); return }
  // Server might already be running from a previous session
  if (await isMcApiReachable()) {
    void broadcastMcStatus()
    res.json({ ok: true, already: true })
    return
  }
  if (!existsSync(join(MC_RUN_DIR, 'paper.jar'))) {
    res.json({ ok: false, error: 'run/paper.jar が見つかりません' })
    return
  }

  const proc = spawn('java', [
    '-Xms512m', '-Xmx512m', '-XX:+UseG1GC',
    '-DIReallyKnowWhatIAmDoingISwear=true',
    '-jar', 'paper.jar', '--nogui',
  ], { cwd: MC_RUN_DIR, stdio: ['pipe', 'pipe', 'pipe'] })
  mcProc = proc

  let resolved = false
  const startPromise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('起動タイムアウト (120秒)')), 120_000)
    const onData = (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean)
      for (const line of lines) pushMcLog(line)
      if (!resolved && lines.some(l => l.includes('Done (') || l.includes('For help, type'))) {
        resolved = true
        clearTimeout(timeout)
        resolve()
      }
    }
    proc.stdout?.on('data', onData)
    proc.stderr?.on('data', onData)
    proc.on('error', (e) => { clearTimeout(timeout); reject(e) })
    proc.on('exit', (code) => {
      clearTimeout(timeout)
      mcProc = null
      void broadcastMcStatus()
      if (!resolved) reject(new Error(`サーバーが起動前に終了 (code=${code})`))
    })
  })
  void broadcastMcStatus()

  try {
    await startPromise
    void broadcastMcStatus()
    // Tell clients to reload the quest iframe now that the plugin API is up
    for (const c of [...mcConsoleClients]) c.write(`event: reload-iframe\ndata: {}\n\n`)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
})

app.post('/api/mc/stop', async (_req: Request, res: Response) => {
  if (mcProc) {
    mcProc.stdin?.write('stop\n')
    res.json({ ok: true })
  } else {
    // Externally-started server: stop via RCON
    try {
      await rcon('stop')
      res.json({ ok: true })
    } catch {
      res.status(500).json({ ok: false, error: 'RCON接続失敗。サーバーコンソールで stop を実行してください。' })
    }
  }
})

app.post('/api/mc/kill', async (_req: Request, res: Response) => {
  if (mcProc) {
    mcProc.kill('SIGKILL')
    res.json({ ok: true })
    return
  }
  // External server: find java process whose command line references MC_RUN_DIR and kill it
  try {
    const scriptsDir = join(dirname(fileURLToPath(import.meta.url)), 'scripts')
    if (process.platform === 'win32') {
      execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${join(scriptsDir, 'kill-mc-server.ps1')}" -RunDir "${MC_RUN_DIR}"`, { encoding: 'utf8' })
    } else {
      execSync(`sh "${join(scriptsDir, 'kill-mc-server.sh')}" "${MC_RUN_DIR}"`, { encoding: 'utf8' })
    }
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

app.post('/api/mc/command', async (req: Request, res: Response) => {
  const { cmd } = req.body as { cmd: string }
  if (mcProc) {
    mcProc.stdin?.write(cmd + '\n')
    res.json({ ok: true })
  } else {
    // Externally-started server: send via RCON
    try {
      const result = await rcon(cmd)
      res.json({ ok: true, result })
    } catch {
      res.status(500).json({ error: 'RCON接続失敗' })
    }
  }
})

// ---- Worktree API ----

interface WorktreeEntry {
  path: string
  branch: string
  builtAt: string | null
  taskName: string | null
  verified: boolean
  isBase: boolean
}

function listWorktrees(): WorktreeEntry[] {
  let raw: string
  try {
    raw = execSync('git worktree list --porcelain', { cwd: BASE_DIR, encoding: 'utf8' })
  } catch {
    return []
  }

  const entries: WorktreeEntry[] = []
  let currentPath = ''
  let currentBranch = ''

  for (const line of raw.split('\n')) {
    if (line.startsWith('worktree ')) {
      currentPath = line.slice('worktree '.length).trim()
      currentBranch = ''
    } else if (line.startsWith('branch ')) {
      currentBranch = line.slice('branch '.length).trim().replace(/^refs\/heads\//, '')
    } else if (line === '') {
      if (currentPath) {
        const infoPath = join(currentPath, 'target', 'WORKTREE_INFO.json')
        let builtAt: string | null = null
        let taskName: string | null = null
        let verified = false
        try {
          const info = JSON.parse(readFileSync(infoPath, 'utf8'))
          builtAt = info.builtAt ?? null
          taskName = info.taskName ?? null
          verified = info.verified === true
        } catch { /* no WORKTREE_INFO.json */ }

        entries.push({
          path: currentPath,
          branch: currentBranch || 'HEAD',
          builtAt,
          taskName,
          verified,
          isBase: resolve(currentPath) === resolve(BASE_DIR),
        })
      }
      currentPath = ''
      currentBranch = ''
    }
  }

  // Sort: entries with builtAt first (newest first), then unbuilt
  return entries.sort((a, b) => {
    if (a.builtAt && b.builtAt) return new Date(b.builtAt).getTime() - new Date(a.builtAt).getTime()
    if (a.builtAt) return -1
    if (b.builtAt) return 1
    return 0
  })
}

app.get('/api/worktrees', (_req: Request, res: Response) => {
  res.json(listWorktrees())
})

app.post('/api/worktrees/deploy', (req: Request, res: Response) => {
  const { path: worktreePath } = req.body as { path: string }
  if (!worktreePath) {
    res.status(400).json({ error: 'path is required' })
    return
  }

  const targetDir = join(worktreePath, 'target')
  if (!existsSync(targetDir)) {
    res.status(404).json({ error: `target/ not found in ${worktreePath}` })
    return
  }

  const jars = readdirSync(targetDir).filter(
    f => f.endsWith('.jar') && !f.startsWith('original-') && f.includes('AdvancementQuesting')
  )
  if (jars.length === 0) {
    res.status(404).json({ error: 'No AdvancementQuesting JAR found in target/' })
    return
  }

  const jar = jars[0]
  // Normalize: remove -1.0-SNAPSHOT or similar version suffixes
  const pluginName = jar.replace(/-[\d.]+(-SNAPSHOT)?\.jar$/, '').replace(/\.jar$/, '')
  const src = join(targetDir, jar)
  const destDir = join(BASE_DIR, 'run', 'plugins')
  const dest = join(destDir, `${pluginName}.jar`)

  try {
    if (!existsSync(destDir)) {
      res.status(500).json({ error: `run/plugins/ not found at ${destDir}` })
      return
    }
    copyFileSync(src, dest)
    const now = new Date()
    utimesSync(dest, now, now)
    res.json({ ok: true, deployedFrom: worktreePath, jar, dest })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

app.post('/api/worktrees/verify', (req: Request, res: Response) => {
  const { path: worktreePath } = req.body as { path: string }
  if (!worktreePath) { res.status(400).json({ error: 'path is required' }); return }
  const infoPath = join(worktreePath, 'target', 'WORKTREE_INFO.json')
  try {
    const info = JSON.parse(readFileSync(infoPath, 'utf8'))
    info.verified = true
    writeFileSync(infoPath, JSON.stringify(info, null, 2), 'utf8')
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})


// /test-console → serve the console HTML (all paths are relative / proxied, so same-origin)
app.get('/test-console', (_req: Request, res: Response) => {
  res.sendFile(join(__dirname, 'public', 'test-console.html'))
})

const TAILSCALE_HOST = process.env.TAILSCALE_HOST ?? 'kamesuta-pc.tail2dfeb3.ts.net'

const server = createServer(app)
server.listen(PORT, () => {
  console.log('')
  console.log('='.repeat(60))
  console.log(`  Test Console (local):     http://localhost:${PORT}/test-console`)
  console.log(`  Test Console (Tailscale): http://${TAILSCALE_HOST}:${PORT}/test-console`)
  console.log('='.repeat(60))
  console.log('')
})

// Graceful shutdown
async function shutdown() {
  await botManager.disconnect().catch(() => {})
  if (mcProc) {
    mcProc.stdin?.write('stop\n')
    await new Promise<void>(resolve => mcProc!.on('exit', () => resolve()))
      .catch(() => mcProc?.kill())
  }
  server.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
