// 簡易 RCON クライアント: 引数のコマンドを実行して結果を出力する
import net from 'node:net'

const HOST = 'localhost', PORT = 25575, PASS = 'kame'
const command = process.argv.slice(2).join(' ')
if (!command) { console.error('usage: node rcon-cmd.mjs <command>'); process.exit(1) }

function rcon(cmd) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(PORT, HOST)
    let buf = Buffer.alloc(0)
    const send = (id, type, body) => {
      const payload = Buffer.from(body + '\0\0', 'ascii')
      const pkt = Buffer.alloc(4 + payload.length + 8)
      pkt.writeInt32LE(pkt.length - 4, 0)
      pkt.writeInt32LE(id, 4)
      pkt.writeInt32LE(type, 8)
      payload.copy(pkt, 12)
      sock.write(pkt)
    }
    let authed = false
    sock.on('connect', () => send(1, 3, PASS))
    sock.on('data', (d) => {
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
    setTimeout(() => { sock.destroy(); reject(new Error('timeout')) }, 5000)
  })
}

console.log(await rcon(command))
