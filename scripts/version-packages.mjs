import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
const webPath = 'apps/web/package.json'
const pluginPath = 'packages/kicad/package.json'
const metadataPath = 'packages/kicad/metadata.json'
const beforeWeb = readJson(webPath)
const beforePlugin = readJson(pluginPath)
const metadata = readJson(metadataPath)

if (metadata.versions[0].version !== beforePlugin.version) {
  throw new Error('KiCad package and metadata versions must agree before versioning')
}
if (existsSync('.changeset/pre.json')) {
  throw new Error('Use the web alpha policy in docs/release.md instead of workspace-wide prerelease mode')
}
const alpha = /^(\d+\.\d+\.\d+)-alpha\.(\d+)$/.exec(beforeWeb.version)
if (beforeWeb.version.includes('-') && !alpha) {
  throw new Error('Unsupported web prerelease; update the release policy before changing channels')
}
if (!readdirSync('.changeset').some((name) => name.endsWith('.md') && name !== 'README.md')) {
  console.log('No pending changesets.')
  process.exit(0)
}

execFileSync(process.execPath, [fileURLToPath(import.meta.resolve('@changesets/cli/bin.js')), 'version'], {
  stdio: 'inherit',
})

const web = readJson(webPath)
if (alpha && web.version !== beforeWeb.version) {
  // Changesets' prerelease mode affects every package. Keep only the web app
  // on its existing alpha train; the plugin retains normal numeric versions.
  const nextVersion = `${alpha[1]}-alpha.${Number(alpha[2]) + 1}`
  const changelogPath = 'apps/web/CHANGELOG.md'
  const changelog = readFileSync(changelogPath, 'utf8')
  const heading = `\n## ${web.version}\n`
  if (!changelog.includes(heading)) throw new Error('Generated web changelog is missing its version heading')
  writeFileSync(changelogPath, changelog.replace(heading, `\n## ${nextVersion}\n`))
  web.version = nextVersion
  writeJson(webPath, web)
}

const plugin = readJson(pluginPath)
if (plugin.version !== beforePlugin.version) {
  metadata.versions[0].version = plugin.version
  writeJson(metadataPath, metadata)
}

// Update workspace versions in bun.lock without running application lifecycle scripts.
execFileSync('bun', ['install', '--lockfile-only', '--ignore-scripts'], { stdio: 'inherit' })
