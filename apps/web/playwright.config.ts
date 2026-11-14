import { defineConfig, devices } from '@playwright/test'

const port = process.env.OVERPRINT_TEST_PORT || '4317'
const baseURL = process.env.OVERPRINT_TEST_URL || `http://127.0.0.1:${port}`

const local = process.env.OVERPRINT_LOCAL_E2E === '1'
const output = process.env.OVERPRINT_E2E_OUTPUT

export default defineConfig({
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
  testDir: './tests/e2e',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-US',
    timezoneId: 'Europe/Zurich',
    viewport: { width: 1280, height: 720 }
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ...(local ? [{ name: 'webkit-thin-artwork', testMatch: ['thin-paint.spec.ts', 'paint-both-sides.spec.ts', 'artboard-layers.spec.ts', 'libraries.spec.ts', 'library-drawing.spec.ts', 'inspector-panels.spec.ts', 'selection-colors.spec.ts', 'legacy-color-compat.spec.ts', 'paint-saved-colors.spec.ts'], use: { ...devices['Desktop Safari'] } }] : [])
  ],
  webServer: process.env.OVERPRINT_TEST_URL
    ? undefined
    : {
        command: `bun run dev --port ${port}`,
        url: baseURL,
        timeout: 120_000,
        reuseExistingServer: !local && !process.env.CI
      }
})
