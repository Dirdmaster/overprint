// Keep Bun as the task runner, but use Node for the local HTTP server.
// Repeated large browser uploads can stall in Bun's HTTP request handling.
if (process.versions.bun) throw new Error('Run the dev server with Node.js: node scripts/dev.mjs')
process.argv.splice(2, 0, 'dev', '--host', '127.0.0.1', '--port', '4317')
await import(new URL('./bin/nuxt.mjs', import.meta.resolve('nuxt/package.json')).href)
