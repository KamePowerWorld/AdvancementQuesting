import { EventEmitter } from 'node:events'
import { Bot } from 'mineflayer'
import { createBot, quitBot, waitForChat } from './tests/helpers.js'

export type BotState = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface ChatMessage {
  ts: string
  text: string
}

export interface BotStatus {
  state: BotState
  username: string | null
  position: { x: number; y: number; z: number } | null
  error: string | null
}

const MAX_CHAT_LOG = 50

export class BotManager extends EventEmitter {
  private bot: Bot | null = null
  private state: BotState = 'disconnected'
  private username: string | null = null
  private errorMsg: string | null = null
  private chatLog: ChatMessage[] = []

  getStatus(): BotStatus {
    const pos = this.bot?.entity?.position
    return {
      state: this.state,
      username: this.username,
      position: pos ? { x: Math.round(pos.x), y: Math.round(pos.y), z: Math.round(pos.z) } : null,
      error: this.errorMsg,
    }
  }

  getChatLog(): ChatMessage[] {
    return [...this.chatLog]
  }

  async connect(username: string): Promise<void> {
    if (this.state === 'connecting' || this.state === 'connected') {
      throw new Error('Already connected or connecting')
    }
    this.state = 'connecting'
    this.username = username
    this.errorMsg = null
    this.emit('status', this.getStatus())

    try {
      const bot = await createBot(username)
      this.bot = bot
      this.state = 'connected'
      this.emit('status', this.getStatus())

      bot.on('message', (jsonMsg: { toString(): string }) => {
        const text = jsonMsg.toString()
        const msg: ChatMessage = {
          ts: new Date().toLocaleTimeString('ja-JP', { hour12: false }),
          text,
        }
        this.chatLog.push(msg)
        if (this.chatLog.length > MAX_CHAT_LOG) this.chatLog.shift()
        this.emit('message', msg)
      })

      bot.on('end', () => {
        this.bot = null
        this.state = 'disconnected'
        this.emit('status', this.getStatus())
      })

      bot.on('error', (err: Error) => {
        this.errorMsg = err.message
        this.state = 'error'
        this.bot = null
        this.emit('status', this.getStatus())
      })
    } catch (err) {
      this.errorMsg = err instanceof Error ? err.message : String(err)
      this.state = 'error'
      this.bot = null
      this.emit('status', this.getStatus())
      throw err
    }
  }

  async disconnect(): Promise<void> {
    if (!this.bot) return
    await quitBot(this.bot)
    this.bot = null
    this.state = 'disconnected'
    this.emit('status', this.getStatus())
  }

  sendChat(text: string): void {
    if (!this.bot || this.state !== 'connected') throw new Error('Bot not connected')
    this.bot.chat(text)
  }

  async getQuestCode(): Promise<string> {
    if (!this.bot || this.state !== 'connected') throw new Error('Bot not connected')
    const chatPromise = waitForChat(this.bot, (t) => /\d{6}/.test(t), 8000)
    this.bot.chat('/quest code')
    const msg = await chatPromise
    const match = msg.match(/(\d{6})/)
    if (!match) throw new Error('Could not extract code from: ' + msg)
    return match[1]
  }
}

export const botManager = new BotManager()
