import mineflayer, { Bot } from 'mineflayer'
import net from 'node:net'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// SessionStart フック(scripts/setup-env.sh)が tmp/port-env に書き出す値のフォールバック読み込み。
// CLAUDE_ENV_FILE によるセッション env 注入が効かない環境（直接 node --test 実行など）でも
// 正しいポートへ向くようにする。
function loadPortEnv(): Record<string, string> {
  const envFile = path.resolve(__dirname, '..', '..', 'tmp', 'port-env')
  if (!existsSync(envFile)) return {}
  const out: Record<string, string> = {}
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}
const portEnv = loadPortEnv()
/** process.env を優先し、無ければ tmp/port-env を見る */
function env(key: string): string | undefined {
  return process.env[key] ?? portEnv[key]
}

// API_BASE を優先度順に解決。
// process.env（明示指定・CLAUDE_ENV_FILE 注入）を常に最優先し、tmp/port-env は
// そのフォールバック。セットで「API_BASE > API_PORT > PORT_OFFSET > 8090」の順。
// （setup.js 経由でも直接 node --test でも、常に正しいポートへ向くように）
function resolveApiBase(): string {
  // 1) process.env を最優先（明示指定を尊重）
  if (process.env.API_BASE) return process.env.API_BASE
  if (process.env.API_PORT) return `http://localhost:${process.env.API_PORT}`
  const envOffset = process.env.PORT_OFFSET
  if (envOffset && /^\d+$/.test(envOffset)) return `http://localhost:${8090 + parseInt(envOffset, 10)}`
  // 2) tmp/port-env フォールバック（CLAUDE_ENV_FILE 非伝播環境用）
  if (portEnv.API_BASE) return portEnv.API_BASE
  if (portEnv.API_PORT) return `http://localhost:${portEnv.API_PORT}`
  const fOffset = portEnv.PORT_OFFSET
  if (fOffset && /^\d+$/.test(fOffset)) return `http://localhost:${8090 + parseInt(fOffset, 10)}`
  return 'http://localhost:8090'
}

export const API_BASE = resolveApiBase()
// 初回リクエスト時に解決済み API_BASE を1行ログ出力（ポート不一致の即検知用）
let apiBaseLogged = false

// Read connection settings lazily so callers can override process.env before importing
function getMcHost() { return env('MC_HOST') ?? 'localhost' }
function getMcPort() { return parseInt(env('MC_PORT') ?? '25599', 10) }
function getRconPort() { return parseInt(env('RCON_PORT') ?? '25598', 10) }
function getRconPass() { return env('RCON_PASS') ?? 'testpass' }

/** Mineflayer ボットを作成してスポーンするまで待つ */
export function createBot(username: string): Promise<Bot> {
  return new Promise((resolve, reject) => {
    const bot = mineflayer.createBot({
      host: getMcHost(),
      port: getMcPort(),
      username,
      version: '1.21.11',
      auth: 'offline',
    })
    bot.once('spawn', () => resolve(bot))
    bot.once('error', reject)
    bot.once('kicked', (reason: string) => reject(new Error(`kicked: ${reason}`)))
    setTimeout(() => reject(new Error('spawn timeout')), 15_000)
  })
}

/** ボットを切断して終了 */
export function quitBot(bot: Bot): Promise<void> {
  return new Promise((resolve) => {
    bot.once('end', () => resolve())
    bot.quit()
  })
}

/**
 * チャットメッセージを待ち受ける。
 * predicate が true を返した最初のメッセージを resolve する。
 */
export function waitForChat(bot: Bot, predicate: (text: string) => boolean, timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      bot.removeListener('message', handler)
      reject(new Error(`waitForChat timeout (${timeoutMs}ms)`))
    }, timeoutMs)

    function handler(jsonMsg: { toString(): string }) {
      const text = jsonMsg.toString()
      if (predicate(text)) {
        clearTimeout(timer)
        bot.removeListener('message', handler)
        resolve(text)
      }
    }
    bot.on('message', handler)
  })
}

interface ApiRequestOptions {
  body?: unknown
  token?: string
}

interface ApiResponse<T = unknown> {
  status: number
  body: T
}

/** HTTP リクエストヘルパー */
export async function apiRequest<T = unknown>(
  method: string,
  path: string,
  { body, token }: ApiRequestOptions = {},
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (!apiBaseLogged) {
    apiBaseLogged = true
    console.log(`[apiRequest] API_BASE resolved to ${API_BASE}`)
  }
  const url = `${API_BASE}${path}`
  const res = await fetch(url, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json: T
  try { json = JSON.parse(text) as T } catch { json = text as unknown as T }
  return { status: res.status, body: json }
}

/** RCON でコンソールコマンドを実行する (OP権限相当) */
export function rcon(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const sock = net.connect(getRconPort(), getMcHost())
    let buf = Buffer.alloc(0)
    const send = (id: number, type: number, body: string) => {
      const payload = Buffer.from(body + '\0\0', 'ascii')
      const pkt = Buffer.alloc(4 + payload.length + 8)
      pkt.writeInt32LE(pkt.length - 4, 0)
      pkt.writeInt32LE(id, 4)
      pkt.writeInt32LE(type, 8)
      payload.copy(pkt, 12)
      sock.write(pkt)
    }
    let authed = false
    sock.on('connect', () => send(1, 3, getRconPass()))
    sock.on('data', (d: Buffer) => {
      buf = Buffer.concat([buf, d])
      while (buf.length >= 4 && buf.length >= buf.readInt32LE(0) + 4) {
        const len = buf.readInt32LE(0)
        const pkt = buf.subarray(4, 4 + len)
        buf = buf.subarray(4 + len)
        const body = pkt.subarray(8, pkt.length - 2).toString('utf8')
        if (!authed) { authed = true; send(2, 2, cmd) }
        else { sock.end(); resolve(body) }
      }
    })
    sock.on('error', reject)
    setTimeout(() => { sock.destroy(); reject(new Error('rcon timeout')) }, 5000)
  })
}
