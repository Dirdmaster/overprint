import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const target = process.argv[2] ?? 'standalone'
if (!['standalone', 'cloudflare'].includes(target)) throw new Error(`Unknown build target: ${target}`)

for (const [command, args] of [
  [process.execPath, ['scripts/copy-plugin.mjs']],
  [process.execPath, ['scripts/copy-integrations.mjs']],
  ['nuxt', ['build']],
]) {
  const result = spawnSync(command, args, {
    cwd: root, stdio: 'inherit',
    env: { ...process.env, OVERPRINT_BUILD_TARGET: target, NITRO_PRESET: target === 'cloudflare' ? 'cloudflare_pages' : 'node-server' },
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
