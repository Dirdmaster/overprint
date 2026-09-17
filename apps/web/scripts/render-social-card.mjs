import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'

// Run from any directory: node apps/web/scripts/render-social-card.mjs
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
  await page.goto(new URL('../assets/social/card.html', import.meta.url).href)
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: fileURLToPath(new URL('../public/brand/social-card.png', import.meta.url)) })
} finally {
  await browser.close()
}
