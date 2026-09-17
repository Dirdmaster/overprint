import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = fileURLToPath(new URL('../', import.meta.url))
if (process.env.CI !== 'true') {
  const git = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' })
  // Source archives may live inside a different checkout. Never install there.
  if (git.status === 0 && realpathSync(git.stdout.trim()) === realpathSync(root)) {
    const result = spawnSync('lefthook', ['install'], { cwd: root, stdio: 'inherit' })
    if (result.error) throw result.error
    process.exitCode = result.status ?? 1
  } else {
    console.log('Skipping Git hooks: this is a source archive, not the repository root.')
  }
}
