/**
 * Playwright globalSetup: テスト用DBを初期化する
 */
import { execSync } from 'child_process'
import { existsSync, rmSync } from 'fs'

const OFFSET = parseInt(process.env.PORT_OFFSET ?? '0', 10)
const TEST_DB = process.env.DB_PATH ?? `./mock-server/db/test${OFFSET || ''}.db`

export default function globalSetup() {
  // 前回のテストDBを削除 (ロック中なら無視)
  if (existsSync(TEST_DB)) {
    try {
      rmSync(TEST_DB)
      try { rmSync(TEST_DB + '-wal') } catch (_) {}
      try { rmSync(TEST_DB + '-shm') } catch (_) {}
    } catch (_) {
      // ロック中の場合はそのまま seed を上書き実行
    }
  }
  execSync('npx tsx mock-server/db/seed.ts', {
    env: { ...process.env, DB_PATH: TEST_DB },
    stdio: 'inherit',
  })
}
