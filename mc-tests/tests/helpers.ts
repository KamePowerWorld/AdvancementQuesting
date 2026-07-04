import mineflayer, { Bot } from 'mineflayer'
import net from 'node:net'

export const API_BASE = process.env.API_BASE ?? 'http://localhost:8090'

// Read connection settings lazily so callers can override process.env before importing
function getMcHost() { return process.env.MC_HOST ?? 'localhost' }
function getMcPort() { return parseInt(process.env.MC_PORT ?? '25599', 10) }
function getRconPort() { return parseInt(process.env.RCON_PORT ?? '25598', 10) }
function getRconPass() { return process.env.RCON_PASS ?? 'testpass' }

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
