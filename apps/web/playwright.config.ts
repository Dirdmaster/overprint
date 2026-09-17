import { defineConfig, devices } from '@playwright/test'

const port = process.env.OVERPRINT_TEST_PORT || '4317'
const baseURL = process.env.OVERPRINT_TEST_URL || `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.OVERPRINT_TEST_URL ? undefined : {
    command: `bun run dev --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
})
