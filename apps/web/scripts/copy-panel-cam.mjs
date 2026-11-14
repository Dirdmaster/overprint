import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const runtime = dirname(fileURLToPath(import.meta.resolve('pyodide')))
const vendor = fileURLToPath(new URL('../vendor/panel-cam/', import.meta.url))
const target = fileURLToPath(new URL('../public/panel-cam/', import.meta.url))
mkdirSync(target, { recursive: true })
for (const name of ['pyodide.mjs', 'pyodide.asm.js', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']) {
  copyFileSync(join(runtime, name), join(target, name))
}
for (const name of readdirSync(vendor)) copyFileSync(join(vendor, name), join(target, name))
