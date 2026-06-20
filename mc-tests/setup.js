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
import { existsSync, copyFileSync, mkdirSync, readdirSync, cpSync } from 'node:fs'
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
// 1. Paper JAR ダウンロード
// ─────────────────────────────────────────────
async function downloadPaper() {
  const paperJar = path.join(RUN_DIR, 'paper.jar')
  mkdirSync(RUN_DIR, { recursive: true })
  if (existsSync(paperJar)) {
    console.log('[setup] paper.jar は既に存在します。スキップ。')
    return
  }

  const buildsUrl = `https://api.papermc.io/v2/projects/paper/versions/${PAPER_MC_VERSION}/builds`
  console.log(`[setup] Paper ${PAPER_MC_VERSION} のビルド一覧を取得中...`)
  const buildsRes = await fetch(buildsUrl)
  if (!buildsRes.ok) throw new Error(`Paper API エラー: ${buildsRes.status}`)
  const buildsData = await buildsRes.json()

  const builds = buildsData.builds
  if (!builds || builds.length === 0) throw new Error('ビルドが見つかりません')
  const build = PAPER_BUILD === 'latest'
    ? builds[builds.length - 1]
    : builds.find(b => b.build === parseInt(PAPER_BUILD))
  if (!build) throw new Error(`ビルド ${PAPER_BUILD} が見つかりません`)

  const fileName = build.downloads.application.name
  const dlUrl = `https://api.papermc.io/v2/projects/paper/versions/${PAPER_MC_VERSION}/builds/${build.build}/downloads/${fileName}`
  console.log(`[setup] Paper ${PAPER_MC_VERSION} build ${build.build} をダウンロード中...`)

  const res = await fetch(dlUrl)
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
    const proc = spawn(
      'node',
      ['--import', 'tsx/esm', '--test', 'tests/*.test.ts'],
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
