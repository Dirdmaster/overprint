import { defineConfig, devices } from '@playwright/test'
const local = process.env.OVERPRINT_LOCAL_E2E === '1'
const output = process.env.OVERPRINT_E2E_OUTPUT
const port = local ? 14346 : 43746
const baseURL = `http://127.0.0.1:${port}`
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  workers: local ? 2 : undefined,
  retries: 0,
  forbidOnly: local || !!process.env.CI,
  outputDir: output ? `${output}/results` : 'test-results',
  reporter: output
    ? [
        ['list'],
        ['html', { outputFolder: `${output}/report`, open: 'never' }],
        ['json', { outputFile: `${output}/results.json` }]
      ]
    : [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-US',
    timezoneId: 'Europe/Zurich'
  },
  webServer: {
    command: `vite --host 127.0.0.1 --port ${port} --strictPort`,
    url: `${baseURL}/tests/index.html`,
    reuseExistingServer: false
  }
})
