import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function releaseChannel(tag, version) {
  if (tag !== `editor-v${version}`) {
    throw new Error(`Release tag must match the editor package version: editor-v${version}`)
  }
  return version.includes('-') ? 'next' : 'latest'
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { version } = JSON.parse(readFileSync(new URL('../packages/editor/package.json', import.meta.url), 'utf8'))
  console.log(`channel=${releaseChannel(process.env.RELEASE_TAG, version)}`)
}
