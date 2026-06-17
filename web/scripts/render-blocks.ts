/**
 * ブロックアトラス生成スクリプト
 *
 * WSL 上で @blackblockrocks/minecraft-render を使い Minecraft の全ブロックを
 * 64x64 PNG にレンダリングし、アイテムレジストリとマッチしたものを
 * 1枚のアトラス PNG に合成して public/mc/atlas/blocks.png と
 * blocks.json (座標マップ) を出力する。
 *
 * 前提:
 *   - WSL (Ubuntu 等) がインストールされていること
 *   - WSL 内に xvfb が入っていること (sudo apt install xvfb)
 *   - Minecraft client.jar を scripts/render-blocks-cache/minecraft.jar に配置するか
 *     MC_JAR 環境変数で指定すること（未指定の場合は自動ダウンロード）
 *
 * 使用方法:
 *   npm run render-blocks
 */

import { execSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_MC = join(__dirname, '..', 'public', 'mc')
const ATLAS_DIR = join(PUBLIC_MC, 'atlas')
const CACHE_DIR = join(__dirname, 'render-blocks-cache')
const JAR_PATH = process.env['MC_JAR'] ?? join(CACHE_DIR, 'minecraft.jar')

// WSL 内の作業ディレクトリ（WSL パスで指定）
const WSL_WORK_DIR = '/tmp/mc-render-atlas'
const TILE_SIZE = 128

function toWslPath(winPath: string): string {
  // D:\foo\bar → /mnt/d/foo/bar
  return winPath.replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`).replace(/\\/g, '/')
}

function wsl(cmd: string): string {
  const result = spawnSync('wsl', ['-d', 'Ubuntu', 'bash', '-c', cmd], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error) throw result.error
  return (result.stdout + result.stderr).trim()
}

async function downloadJar(): Promise<void> {
  if (existsSync(JAR_PATH)) {
    console.log(`  JARキャッシュ済み: ${JAR_PATH}`)
    return
  }
  console.log('  Minecraft 1.21.11 client.jar をダウンロード中 (~28MB)...')
  mkdirSync(CACHE_DIR, { recursive: true })
  const manifestUrl = 'https://launchermeta.mojang.com/mc/game/version_manifest.json'
  const manifest = await fetch(manifestUrl).then(r => r.json()) as { versions: { id: string; url: string }[] }
  const ver = manifest.versions.find(v => v.id === '1.21.11')
  if (!ver) throw new Error('1.21.11 が見つかりません')
  const meta = await fetch(ver.url).then(r => r.json()) as { downloads: { client: { url: string } } }
  const jarUrl = meta.downloads.client.url
  const buf = await fetch(jarUrl).then(r => r.arrayBuffer())
  writeFileSync(JAR_PATH, Buffer.from(buf))
  console.log('  ダウンロード完了')
}

function setupWsl(): void {
  console.log('\n[WSL セットアップ]')
  // xvfb の有無確認
  const xvfb = wsl('which xvfb-run 2>/dev/null || echo ""')
  if (!xvfb) {
    console.log('  xvfb をインストール中...')
    wsl('sudo apt-get install -y xvfb 2>&1 | tail -2')
  } else {
    console.log('  xvfb: OK')
  }
  // 作業ディレクトリと npm パッケージの準備
  wsl(`mkdir -p ${WSL_WORK_DIR}`)
  const pkgExists = wsl(`[ -d ${WSL_WORK_DIR}/node_modules/@blackblockrocks ] && echo yes || echo no`)
  if (pkgExists.includes('no')) {
    console.log('  @blackblockrocks/minecraft-render をインストール中...')
    wsl(`cd ${WSL_WORK_DIR} && npm install @blackblockrocks/minecraft-render 2>&1 | tail -3`)
    console.log('  インストール完了')
  } else {
    console.log('  @blackblockrocks/minecraft-render: OK')
  }
}

function renderBlocks(): string {
  console.log('\n[ブロックレンダリング]')
  const wslJar = toWslPath(JAR_PATH)
  const outDir = `${WSL_WORK_DIR}/out`
  wsl(`mkdir -p ${outDir}/block '${outDir}/minecraft:block' '${outDir}/minecraft:item'`)

  // minecraft-render を xvfb-run で実行
  console.log('  レンダリング実行中（数秒かかります）...')
  const log = wsl(
    `cd ${WSL_WORK_DIR} && ` +
    `xvfb-run --auto-servernum ` +
    `./node_modules/.bin/minecraft-render ${wslJar} ${outDir}/ ` +
    `--no-animation --width ${TILE_SIZE} --height ${TILE_SIZE} 2>&1`
  )

  const rendered = (log.match(/\[\d+ \/ \d+\] .+ rendered/g) || []).length
  const skipped = (log.match(/skipped due to/g) || []).length
  console.log(`  完了: ${rendered} 枚レンダリング, ${skipped} 件スキップ`)
  return outDir
}

function copyRenderedToWindows(wslOutDir: string): string {
  // WSL の出力ディレクトリを Windows 側にコピー
  const winOutDir = join(CACHE_DIR, 'rendered')
  mkdirSync(winOutDir, { recursive: true })
  const wslWinOutDir = toWslPath(winOutDir)
  wsl(`cp -r ${wslOutDir}/. ${wslWinOutDir}/`)
  return winOutDir
}

function collectPngs(outDir: string, itemIds: Set<string>): Map<string, string> {
  // アイテムID → PNGファイルパス のマップを構築
  // minecraft-render の出力は "blockName.png" 形式
  // blockName は "minecraft:block/oak_log" → ファイルは "out/minecraft:block/oak_log.png"
  const result = new Map<string, string>()

  function scanDir(dir: string) {
    if (!existsSync(dir)) return
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      if (f.isDirectory()) {
        scanDir(join(dir, f.name))
      } else if (f.name.endsWith('.png')) {
        const baseName = f.name.replace('.png', '')
        // baseName がアイテムIDと一致するか確認
        if (itemIds.has(baseName)) {
          result.set(baseName, join(dir, f.name))
        }
      }
    }
  }

  scanDir(outDir)
  return result
}

async function buildAtlas(pngMap: Map<string, string>): Promise<{ atlasPath: string; jsonPath: string }> {
  console.log('\n[アトラス合成]')
  const entries = [...pngMap.entries()]
  const count = entries.length
  const cols = Math.ceil(Math.sqrt(count))
  const rows = Math.ceil(count / cols)
  const atlasW = cols * TILE_SIZE
  const atlasH = rows * TILE_SIZE

  console.log(`  ${count} 枚 → ${cols}x${rows} グリッド (${atlasW}x${atlasH}px)`)

  // 各タイルを trim → TILE_SIZE にリサイズして composites として配置
  const composites: sharp.OverlayOptions[] = []
  const coordMap: Record<string, [number, number, number, number]> = {}

  for (let i = 0; i < entries.length; i++) {
    const [id, filePath] = entries[i]!
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = col * TILE_SIZE
    const y = row * TILE_SIZE

    composites.push({ input: filePath, left: x, top: y })
    coordMap[`block/${id}`] = [x, y, TILE_SIZE, TILE_SIZE]
  }

  mkdirSync(ATLAS_DIR, { recursive: true })
  const atlasPath = join(ATLAS_DIR, 'blocks.png')
  const jsonPath = join(ATLAS_DIR, 'blocks.json')

  await sharp({
    create: { width: atlasW, height: atlasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(composites)
    .png()
    .toFile(atlasPath)

  // メタ情報を先頭に付与（ItemIcon の backgroundSize 計算用）
  const output = { _meta: { atlasW, atlasH, tileSize: TILE_SIZE }, ...coordMap }
  writeFileSync(jsonPath, JSON.stringify(output, null, 2))
  console.log(`  → ${atlasPath}`)
  console.log(`  → ${jsonPath}`)

  return { atlasPath, jsonPath }
}

async function main() {
  console.log('ブロックアトラス生成を開始します...')

  // アイテムレジストリを読み込む
  const registryPath = join(PUBLIC_MC, 'registry', 'item.json')
  if (!existsSync(registryPath)) {
    throw new Error(`item.json が見つかりません。先に "npm run download-assets" を実行してください: ${registryPath}`)
  }
  const itemIds: string[] = JSON.parse(readFileSync(registryPath, 'utf8'))
  const itemIdSet = new Set(itemIds)

  // キャッシュ済みの rendered ディレクトリがあればスキップ
  const cachedOutDir = join(CACHE_DIR, 'rendered')
  let outDir: string

  if (existsSync(cachedOutDir) && readdirSync(cachedOutDir).length > 0) {
    console.log(`\n  レンダリングキャッシュ使用: ${cachedOutDir}`)
    console.log('  再レンダリングする場合は scripts/render-blocks-cache/rendered/ を削除してください')
    outDir = cachedOutDir
  } else {
    await downloadJar()
    setupWsl()
    const wslOutDir = renderBlocks()
    outDir = copyRenderedToWindows(wslOutDir)
  }

  // PNG を収集してアトラス化
  const pngMap = collectPngs(outDir, itemIdSet)
  console.log(`\n  アイテムIDとマッチした PNG: ${pngMap.size} / ${itemIds.length}`)

  const { atlasPath, jsonPath } = await buildAtlas(pngMap)

  const stat = (await import('node:fs/promises')).stat
  const atlasSize = ((await stat(atlasPath)).size / 1024).toFixed(0)
  console.log(`\n完了! ブロックアトラス: ${atlasSize} KB`)
  console.log(`  カバー率: ${pngMap.size}/${itemIds.length} アイテム`)
}

main().catch(e => {
  console.error('エラー:', e.message)
  process.exit(1)
})
