// Run the browser regression suites directly on the host, without Turbo caching.
import { spawnSync, spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { release } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const directory = resolve(
  root,
  '.scratch/e2e',
  new Date().toISOString().replaceAll(':', '-')
)
mkdirSync(directory, { recursive: true })
const capture = (command, args) =>
  spawnSync(command, args, { cwd: root, encoding: 'utf8' }).stdout?.trim()
writeFileSync(
  resolve(directory, 'environment.json'),
  JSON.stringify(
    {
      startedAt: new Date().toISOString(),
      commit: capture('git', ['rev-parse', 'HEAD']),
      diff: capture('git', ['diff', '--stat']),
      status: capture('git', ['status', '--short']),
      node: process.version,
      bun: capture('bun', ['--version']),
      playwright: capture('bun', [
        'run',
        '--cwd',
        'apps/web',
        'playwright',
        '--version'
      ]),
      platform: process.platform,
      architecture: process.arch,
      osRelease: release(),
      lockfileSha256: createHash('sha256')
        .update(readFileSync(resolve(root, 'bun.lock')))
        .digest('hex'),
      workers: 2,
      retries: 0
    },
    null,
    2
  )
)
console.log(`Local E2E reports: ${directory}`)
let activeChild
const stop = (signal) => {
  if (activeChild?.pid) {
    if (process.platform === 'win32') activeChild.kill(signal)
    else {
      try {
        process.kill(-activeChild.pid, signal)
      } catch (error) {
        if (error.code !== 'ESRCH') throw error
      }
    }
  }
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    stop(signal)
    process.exit(signal === 'SIGINT' ? 130 : 143)
  })
const run = (args, env = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn('bun', args, {
      cwd: root,
      stdio: 'inherit',
      detached: process.platform !== 'win32',
      env: { ...process.env, ...env }
    })
    activeChild = child
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      activeChild = undefined
      resolve(code ?? (signal ? 1 : 0))
    })
  })
// Frozen installation and bundled browser engines keep clean checkouts repeatable.
let code = await run(['install', '--frozen-lockfile'])
if (code) process.exit(code)
code = await run([
  'run',
  '--cwd',
  'apps/web',
  'playwright',
  'install',
  'chromium',
  'webkit'
])
if (code) process.exit(code)
code = await run(['run', '--cwd', 'packages/kicad', 'build'])
if (code) process.exit(code)
code = await run(['run', '--cwd', 'packages/editor', 'build'])
if (code) process.exit(code)
const results = []
for (const [name, cwd] of [
  ['web', 'apps/web'],
  ['editor', 'packages/editor']
]) {
  const output = resolve(directory, name)
  const exitCode = await run(
    ['run', '--cwd', cwd, 'playwright', 'test', ...process.argv.slice(2)],
    {
      OVERPRINT_LOCAL_E2E: '1',
      OVERPRINT_E2E_OUTPUT: output,
      OVERPRINT_TEST_URL: '',
      OVERPRINT_TEST_PORT: '14317'
    }
  )
  results.push({ suite: name, exitCode })
}
writeFileSync(
  resolve(directory, 'summary.json'),
  JSON.stringify(results, null, 2)
)
console.log(`Local E2E reports: ${directory}`)
process.exit(results.some((result) => result.exitCode !== 0) ? 1 : 0)
