import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  outputDir: 'output/playwright/test-results',
  webServer: {
    command: 'npm run dev:e2e',
    url: 'http://127.0.0.1:3001',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:3001',
    trace: 'retain-on-failure',
  },
  reporter: [['list']],
})

