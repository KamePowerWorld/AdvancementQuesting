/**
 * mc-tests セットアップ & サーバー起動スクリプト
 *
 * 実行順:
 *  1. Paper JAR をダウンロード (run/paper.jar がなければ)
 *  2. run-template/ の内容を run/ に毎回上書きコピー
 *  3. プラグイン JAR をビルド (--no-build でスキップ)
 *  4. プラグイン JAR を run/plugins/ にコピー
 *  5. Minecraft サーバーを起動して Done が出るまで待つ
 *  6. テストを実行
 *  7. サーバーを停止
 *
 * 使い方:
 *   node setup.js [--no-build]
 */

import { execSync, spawn } from 'node:child_process'
import { existsSync, copyFileSync, mkdirSync, readdirSync, cpSync, readFileSync, writeFileSync } from 'node:fs'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT       = path.resolve(__dirname, '..')
const TEMPLATE   = path.join(__dirname, 'run-template')
const RUN_DIR    = path.join(__dirname, 'run')
const PLUGINS_DIR = path.join(RUN_DIR, 'plugins')

// Paper バージョン設定
const PAPER_MC_VERSION = '1.21.11'
const PAPER_BUILD = 'latest'  // 'latest' または具体的なビルド番号

// worktree 並列開発用ポートオフセット (例: PORT_OFFSET=100)
const PORT_OFFSET = parseInt(process.env.PORT_OFFSET ?? '0', 10)
const MC_PORT   = process.env.MC_PORT   ?? String(25599 + PORT_OFFSET)
const API_PORT  = process.env.API_PORT  ?? String(8090  + PORT_OFFSET)
const RCON_PORT = process.env.RCON_PORT ?? String(25598 + PORT_OFFSET)
const RCON_PASS = process.env.RCON_PASS ?? 'testpass'

const noBuild = process.argv.includes('--no-build')

// ─────────────────────────────────────────────
// 1. Paper JAR ダウンロード (Fill API v3)
// ─────────────────────────────────────────────
async function downloadPaper() {
  const paperJar = path.join(RUN_DIR, 'paper.jar')
  mkdirSync(RUN_DIR, { recursive: true })
  if (existsSync(paperJar)) {
    console.log('[setup] paper.jar は既に存在します。スキップ。')
    return
  }

  // Fill API v3 は User-Agent が必須（generic なものは拒否される）
  const headers = {
    'User-Agent': 'advancement-questing-mc-tests/setup.js (https://github.com/Kamesuta/AdvancementQuesting)',
  }

  const buildsUrl = `https://fill.papermc.io/v3/projects/paper/versions/${PAPER_MC_VERSION}/builds`
  console.log(`[setup] Paper ${PAPER_MC_VERSION} のビルド一覧を取得中 (Fill API v3)...`)
  const buildsRes = await fetch(buildsUrl, { headers })
  if (!buildsRes.ok) {
    const err = await buildsRes.text()
    throw new Error(`Paper API エラー (${buildsRes.status}): ${err}`)
  }

  // 新しいAPIは配列形式（channel でフィルタ可能）
  const builds = await buildsRes.json()
  if (!Array.isArray(builds) || builds.length === 0) throw new Error('ビルドが見つかりません')

  // STABLE チャンネルの最新ビルドを探す
  const stableBuild = builds.find(b => b.channel === 'STABLE')
  if (!stableBuild) throw new Error(`${PAPER_MC_VERSION} の安定版ビルドが見つかりません`)

  const build = PAPER_BUILD === 'latest'
    ? stableBuild
    : builds.find(b => b.channel === 'STABLE' && b.id === parseInt(PAPER_BUILD))
  if (!build) throw new Error(`安定版ビルド ${PAPER_BUILD} が見つかりません`)

  const dlUrl = build.downloads['server:default'].url
  console.log(`[setup] Paper ${PAPER_MC_VERSION} build ${build.name || build.id} をダウンロード中...`)

  const res = await fetch(dlUrl, { headers })
  if (!res.ok) throw new Error(`ダウンロードエラー: ${res.status}`)
  await pipeline(res.body, createWriteStream(paperJar))
  console.log('[setup] paper.jar をダウンロードしました。')
}

// ─────────────────────────────────────────────
// 2. run-template/ → run/ に上書きコピー
// ─────────────────────────────────────────────
function applyTemplate() {
  console.log('[setup] run-template/ → run/ に設定ファイルを上書きコピー中...')
  cpSync(TEMPLATE, RUN_DIR, { recursive: true, force: true })
  console.log('[setup] テンプレート適用完了。')
}

// PORT_OFFSET を server.properties / config.yml に反映
function patchPorts() {
  if (PORT_OFFSET === 0) return
  const serverProps = path.join(RUN_DIR, 'server.properties')
  if (existsSync(serverProps)) {
    const text = readFileSync(serverProps, 'utf8')
    const replaced = text
      .replace(/^server-port=.*$/m, `server-port=${MC_PORT}`)
      .replace(/^rcon\.port=.*$/m, `rcon.port=${RCON_PORT}`)
      .replace(/^query\.port=.*$/m, `query.port=${MC_PORT}`)
    writeFileSync(serverProps, replaced)
  }
  const pluginCfg = path.join(RUN_DIR, 'plugins', 'AdvancementQuesting', 'config.yml')
  if (existsSync(pluginCfg)) {
    const text = readFileSync(pluginCfg, 'utf8')
    const replaced = text
      .replace(/^web-port:.*$/m, `web-port: ${API_PORT}`)
      .replace(/^web-url:.*$/m, `web-url: "http://localhost:${API_PORT}"`)
    writeFileSync(pluginCfg, replaced)
  }
  console.log(`[setup] PORT_OFFSET=${PORT_OFFSET} を反映 (MC=${MC_PORT}, API=${API_PORT}, RCON=${RCON_PORT})`)
}

// ─────────────────────────────────────────────
// DB/quests クリーンアップ (flaky対策)
// ─────────────────────────────────────────────
async function cleanupDB() {
  const pluginDataDir = path.join(RUN_DIR, 'plugins', 'AdvancementQuesting')
  const questDb = path.join(pluginDataDir, 'quest.db')
  const questsDir = path.join(pluginDataDir, 'quests')

  let cleaned = false
  if (existsSync(questDb)) {
    const { unlinkSync } = await import('node:fs')
    unlinkSync(questDb)
    console.log('[setup] quest.db を削除しました (DB蓄積flaky対策)')
    cleaned = true
  }

  if (existsSync(questsDir)) {
    const { readdirSync, unlinkSync } = await import('node:fs')
    const questFiles = readdirSync(questsDir).filter(f => f.endsWith('.json'))
    for (const f of questFiles) {
      unlinkSync(path.join(questsDir, f))
    }
    if (questFiles.length > 0) {
      console.log(`[setup] quests/*.json を ${questFiles.length} 件削除しました (DB蓄積flaky対策)`)
      cleaned = true
    }
  }

  if (!cleaned) {
    console.log('[setup] DB/quests は既にクリーンです。')
  }
}

// ─────────────────────────────────────────────
// 3. プラグイン JAR をビルド
// ─────────────────────────────────────────────
function buildPlugin() {
  if (noBuild) {
    console.log('[setup] --no-build: ビルドをスキップします。')
    return
  }
  const targetDir = path.join(ROOT, 'target')
  const hasJar = existsSync(targetDir) &&
    readdirSync(targetDir).some(f => f.startsWith('AdvancementQuesting') && f.endsWith('.jar') && !f.includes('original'))

  if (hasJar) {
    console.log('[setup] target/ に JAR が存在します。ビルドをスキップ。(再ビルドするには target/ を削除してください)')
  } else {
    console.log('[setup] Maven ビルドを実行中...')
    execSync('mvn package -DskipTests -q', { cwd: ROOT, stdio: 'inherit' })
    console.log('[setup] ビルド完了。')
  }
}

// ─────────────────────────────────────────────
// 4. プラグイン JAR をコピー
// ─────────────────────────────────────────────
function copyPlugin() {
  mkdirSync(PLUGINS_DIR, { recursive: true })

  const targetDir = path.join(ROOT, 'target')
  const jarFile = readdirSync(targetDir)
    .find(f => f.startsWith('AdvancementQuesting') && f.endsWith('.jar') && !f.includes('original'))
  if (!jarFile) throw new Error('AdvancementQuesting JAR が target/ に見つかりません。先にビルドしてください。')

  const src = path.join(targetDir, jarFile)
  const dst = path.join(PLUGINS_DIR, 'AdvancementQuesting.jar')
  copyFileSync(src, dst)
  console.log(`[setup] ${jarFile} → run/plugins/AdvancementQuesting.jar`)
}

// ─────────────────────────────────────────────
// 5. サーバー起動 & "Done" 待ち
// ─────────────────────────────────────────────
function startServer() {
  return new Promise((resolve, reject) => {
    console.log('[setup] Minecraft サーバーを起動中...')

    const javaArgs = [
      '-Xms512m', '-Xmx512m',
      '-XX:+UseG1GC',
      '-DIReallyKnowWhatIAmDoingISwear=true',
      '-jar', 'paper.jar',
      '--nogui',
    ]

    const proc = spawn('java', javaArgs, {
      cwd: RUN_DIR,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let doneResolved = false
    const timeout = setTimeout(() => {
      if (!doneResolved) {
        proc.kill('SIGKILL')
        reject(new Error('サーバー起動タイムアウト (120秒)'))
      }
    }, 120_000)

    const onData = (data) => {
      const line = data.toString()
      process.stdout.write(`[MC] ${line}`)
      if (!doneResolved && (line.includes('Done (') || line.includes('For help, type'))) {
        doneResolved = true
        clearTimeout(timeout)
        console.log('[setup] サーバー起動完了！')
        resolve(proc)
      }
    }

    proc.stdout.on('data', onData)
    proc.stderr.on('data', onData)
    proc.on('error', (err) => { clearTimeout(timeout); reject(err) })
    proc.on('exit', (code) => {
      if (!doneResolved) {
        clearTimeout(timeout)
        reject(new Error(`サーバーが起動前に終了 (code=${code})`))
      }
    })
  })
}

// ─────────────────────────────────────────────
// 6. テスト実行
// ─────────────────────────────────────────────
function runTests() {
  return new Promise((resolve) => {
    console.log('\n[setup] テストを実行中...\n')
    // node --test はテストファイルごとにサブプロセスを起動し、親が IPC パイプ経由で
    // 結果をデシリアライズする。負荷/timingによって親が "Unable to deserialize cloned
    // data due to invalid or unsupported version." を投げてファイル全体を fail させる
    // 既知のバグがあるため、Node 22+ では単一プロセスで全ファイルを実行して IPC を
    // 経由しないようにする (CI の mc-tests を安定化)。
    const nodeArgs = ['--import', 'tsx/esm']
    const nodeMajor = parseInt(process.versions.node.split('.')[0], 10)
    if (nodeMajor >= 22) nodeArgs.push('--experimental-test-isolation=none')
    nodeArgs.push('--test', ...(process.env.TEST_GLOB ?? 'tests/*.test.ts').split(' '))
    const proc = spawn(
      'node',
      nodeArgs,
      {
        cwd: __dirname,
        stdio: 'inherit',
        env: {
          ...process.env,
          MC_HOST: 'localhost',
          MC_PORT,
          API_BASE: `http://localhost:${API_PORT}`,
          RCON_PORT,
          RCON_PASS,
        },
        shell: true,
      },
    )
    proc.on('exit', (code) => resolve(code ?? 0))
    proc.on('error', () => resolve(1))
  })
}

// ─────────────────────────────────────────────
// 7. サーバー停止
// ─────────────────────────────────────────────
async function stopServer(proc) {
  console.log('\n[setup] サーバーを停止中...')
  return new Promise((resolve) => {
    proc.stdin.write('stop\n')
    const timeout = setTimeout(() => {
      proc.kill('SIGKILL')
      resolve()
    }, 30_000)
    proc.on('exit', () => {
      clearTimeout(timeout)
      console.log('[setup] サーバー停止完了。')
      resolve()
    })
  })
}

// ─────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────
async function main() {
  let serverProc = null
  let exitCode = 0

  try {
    await downloadPaper()
    applyTemplate()
    await cleanupDB()  // DB/quests を毎回クリーンナップ (flaky対策)
    patchPorts()
    buildPlugin()
    copyPlugin()
    serverProc = await startServer()

    // プラグイン初期化が終わるまで少し待つ
    await new Promise(r => setTimeout(r, 3000))

    exitCode = await runTests()
  } catch (err) {
    console.error('[setup] エラー:', err.message)
    exitCode = 1
  } finally {
    if (serverProc) await stopServer(serverProc)
  }

  process.exit(exitCode)
}

main()
