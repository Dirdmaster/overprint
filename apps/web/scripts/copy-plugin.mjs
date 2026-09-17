import { writePcmRepository } from './pcm-repository.mjs'
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
const destination = new URL('../public/downloads/', import.meta.url)
mkdirSync(destination, { recursive: true })
copyFileSync(new URL('../../../packages/kicad/dist/overprint-kicad.zip', import.meta.url), new URL('overprint-kicad.zip', destination))

const release = JSON.parse(readFileSync(new URL('../../../packages/kicad/release.json', import.meta.url), 'utf8'))
writePcmRepository(
  readFileSync(new URL('overprint-kicad.zip', destination)),
  new URL('../public/pcm/', import.meta.url),
  undefined, undefined, release,
)
