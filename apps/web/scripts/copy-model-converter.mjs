import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const source = dirname(fileURLToPath(import.meta.resolve('occt-import-js')))
const target = fileURLToPath(new URL('../public/model-converter/', import.meta.url))
mkdirSync(target, { recursive: true })
for (const name of ['occt-import-js.wasm', 'license.occt.txt', 'license.occt-import-js.txt']) copyFileSync(join(source, name), join(target, name))
// Preserve the upstream loader, exposing its factory to our module worker.
writeFileSync(join(target, 'occt-import-js.mjs'), readFileSync(join(source, 'occt-import-js.js'), 'utf8') + '\nexport default occtimportjs;\n')
