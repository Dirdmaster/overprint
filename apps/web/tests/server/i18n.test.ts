import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appRoot = resolve(import.meta.dirname, '../../app')
const catalogs = resolve(import.meta.dirname, '../../i18n/locales/en')
const flatten = (value: Record<string, unknown>, prefix = ''): string[] => Object.entries(value).flatMap(([key, entry]) => {
  const path = prefix ? `${prefix}.${key}` : key
  return typeof entry === 'string' ? [path] : flatten(entry as Record<string, unknown>, path)
})
const sources = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const path = resolve(directory, entry.name)
  return entry.isDirectory() ? sources(path) : /\.(vue|ts)$/.test(entry.name) ? [path] : []
})

const validateReferences = (source: string, known: Set<string>, file: string) => {
  // Dynamic keys in typed step definitions are checked by Nuxt/TypeScript.
  const references = [...source.matchAll(/(?:\$?\bt\(\s*['"]([^'"]+)['"]|keypath="([^"]+)")/g)]
  for (const reference of references) {
    const key = reference[1] ?? reference[2]!
    assert.ok(known.has(key), `${file}: unknown translation key ${key}`)
  }
  return references.length
}

test('English message keys are unique and literal UI references resolve', () => {
  const keys = readdirSync(catalogs).flatMap(file => flatten(JSON.parse(readFileSync(resolve(catalogs, file), 'utf8'))))
  assert.equal(keys.length, new Set(keys).size, 'Feature catalogs must not override another catalog’s keys')
  const known = new Set(keys)
  let checked = 0
  for (const file of sources(appRoot)) {
    const source = readFileSync(file, 'utf8')
    checked += validateReferences(source, known, file)
  }
  assert.ok(checked > 0, 'Expected translated UI references')
})

test('rejects unknown keys in the UI translation APIs', () => {
  const known = new Set(['common.importPcb'])
  for (const source of [
    "<button>{{ $t('common.importPcbb') }}</button>",
    "const label = t('common.importPcbb')",
    '<i18n-t keypath="common.importPcbb" />',
  ]) assert.throws(() => validateReferences(source, known, 'fixture.vue'), /unknown translation key common\.importPcbb/)
})
