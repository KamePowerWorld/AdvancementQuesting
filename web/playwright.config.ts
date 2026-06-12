import { defineConfig, devices } from '@playwright/test'

const TEST_DB = './mock-server/db/test.db'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  globalSetup: './tests/setup-test-db.ts',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
    video: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /editor\.spec\.ts/,
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone SE'], defaultBrowserType: 'chromium' },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: `cross-env DB_PATH=${TEST_DB} MOCK_PORT=3001 npm run mock`,
      url: 'http://localhost:3001/api/quests',
      reuseExistingServer: false,
      timeout: 15_000,
      env: { DB_PATH: TEST_DB, MOCK_PORT: '3001' },
    },
    {
      command: 'cross-env VITE_API_BASE_URL=http://localhost:3001 npx vite --port 5174',
      url: 'http://localhost:5174',
      reuseExistingServer: false,
      timeout: 15_000,
      env: { VITE_API_BASE_URL: 'http://localhost:3001' },
    },
  ],
})
