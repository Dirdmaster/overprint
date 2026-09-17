import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
// The repository's bun start builds through Turbo before launching this server.
const child = spawn(process.execPath, ['.output/standalone/server/index.mjs'], {
  cwd: root, stdio: 'inherit',
  env: {
    ...process.env,
    NITRO_HOST: process.env.NITRO_HOST || process.env.HOST || '127.0.0.1',
    NITRO_PORT: process.env.NITRO_PORT || process.env.PORT || '4317',
  },
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1) })
