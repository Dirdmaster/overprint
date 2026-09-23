import { cpSync, existsSync, rmSync } from 'node:fs'

const source = new URL('../../editor-workbench/dist/', import.meta.url)
const destination = new URL('../public/integrations/', import.meta.url)
if (!existsSync(new URL('index.html', source)) || !existsSync(new URL('iframe.html', source))) {
  throw new Error('Build the editor workbench before building the website: bun run build')
}
rmSync(destination, { recursive: true, force: true })
cpSync(source, destination, { recursive: true })
