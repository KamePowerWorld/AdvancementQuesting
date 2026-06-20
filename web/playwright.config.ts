import { defineConfig, devices } from '@playwright/test'

// worktree 並列開発用ポートオフセット
// 例: PORT_OFFSET=100 で mock=3101, vite=5274
const OFFSET = parseInt(process.env.PORT_OFFSET ?? '0', 10)
// globalSetup でも同じ値を使えるよう環境変数に書き戻す
process.env.PORT_OFFSET = String(OFFSET)
const MOCK_PORT = 3001 + OFFSET
const VITE_PORT = 5174 + OFFSET
const TEST_DB = `./mock-server/db/test${OFFSET || ''}.db`

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  globalSetup: './tests/setup-test-db.ts',
  use: {
    baseURL: `http://localhost:${VITE_PORT}`,
    trace: 'on-first-retry',
    video: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /(?<!mobile)\.spec\.ts$/,
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone SE'], defaultBrowserType: 'chromium' },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: `cross-env DB_PATH=${TEST_DB} MOCK_PORT=${MOCK_PORT} npm run mock`,
      url: `http://localhost:${MOCK_PORT}/api/quests`,
      reuseExistingServer: false,
      timeout: 15_000,
      env: { DB_PATH: TEST_DB, MOCK_PORT: String(MOCK_PORT) },
    },
    {
      command: `cross-env VITE_API_BASE_URL=http://localhost:${MOCK_PORT} npx vite --port ${VITE_PORT}`,
      url: `http://localhost:${VITE_PORT}`,
      reuseExistingServer: false,
      timeout: 15_000,
      env: { VITE_API_BASE_URL: `http://localhost:${MOCK_PORT}` },
    },
  ],
})
