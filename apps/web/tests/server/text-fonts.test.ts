import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
const require = createRequire(import.meta.url)
const { parse } = require('opentype.js')

test('pinned font assets outline Latin lettering locally and retain distribution licenses', () => {
  const expected = ['b3f9725f946d712db8a411a4ec1bbac766ce87baac703d4a8dcb9f38a89b2cfc', 'e350cb15ec4815e79304c64eaf799192e574ec314c5ca681ed3257288a45f038']
  for (const [index, weight] of [400, 700].entries()) {
    const bytes = readFileSync(new URL(`../../app/assets/text-fonts/geist-latin-${weight}-normal.woff`, import.meta.url))
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected[index])
    const font = parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
    const path = font.getPath('Overprint 123', 0, 0, 3)
    assert.ok(path.commands.length > 40)
    assert.ok(path.getBoundingBox().x2 > 10)
    assert.equal(font.charToGlyphIndex('🛠'), 0)
  }
  for (const location of ['../../public/text-fonts/LICENSES.txt', '../../../../packages/editor/THIRD_PARTY_NOTICES.txt']) {
    const notice = readFileSync(new URL(location, import.meta.url), 'utf8')
    assert.match(notice, /SIL OPEN FONT LICENSE/)
    assert.match(notice, /Frederik De Bleser/)
  }
})
