import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const converter = require('opentype.js')
const woff = readFileSync(new URL('../../../../node_modules/@fontsource/inter/files/inter-latin-400-normal.woff', import.meta.url))
export const geistFixtureFont = Buffer.from((() => { const font = converter.parse(woff.buffer.slice(woff.byteOffset, woff.byteOffset + woff.byteLength)); delete font.tables.gsub; delete font.tables.gpos; return font.toArrayBuffer() })())
const boldWoff = readFileSync(new URL('../../../../node_modules/@fontsource/inter/files/inter-latin-700-normal.woff', import.meta.url))
export const geistFixtureBoldFont = Buffer.from((() => { const font = converter.parse(boldWoff.buffer.slice(boldWoff.byteOffset, boldWoff.byteOffset + boldWoff.byteLength)); delete font.tables.gsub; delete font.tables.gpos; return font.toArrayBuffer() })())
export const geistFixtureFamily = { family: 'Geist', category: 'sans-serif', version: 'v1', variants: [{ variant: 'regular', id: '9'.repeat(64) }, { variant: '700', id: '8'.repeat(64) }] }

export const routeGeist = async (page: Page) => {
  await page.route('**/api/fonts/catalog?*', route =>
    new URL(route.request().url()).searchParams.get('q') === 'Geist'
      ? route.fulfill({ json: { families: [geistFixtureFamily], total: 1, offset: 0 } })
      : route.fallback()
  )
  await page.route('**/api/fonts/file?*', route =>
    new URL(route.request().url()).searchParams.get('family') === 'Geist'
      ? route.fulfill({ contentType: 'font/ttf', body: new URL(route.request().url()).searchParams.get('variant') === '700' ? geistFixtureBoldFont : geistFixtureFont })
      : route.fallback()
  )
}
