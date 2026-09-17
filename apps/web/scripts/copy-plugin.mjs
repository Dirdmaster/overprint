import { writePcmRepository } from './pcm-repository.mjs'
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
const destination = new URL('../public/downloads/', import.meta.url)
mkdirSync(destination, { recursive: true })
copyFileSync(new URL('../../../packages/kicad/dist/overprint-kicad.zip', import.meta.url), new URL('overprint-kicad.zip', destination))

writePcmRepository(readFileSync(new URL('overprint-kicad.zip', destination)), new URL('../public/pcm/', import.meta.url))
