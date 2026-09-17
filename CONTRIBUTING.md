# Contributing

## Start here

Install Bun 1.3.14, Node.js 22.18+ and Python 3, then:

```sh
bun install --frozen-lockfile
bun run dev
```

The app opens at http://127.0.0.1:4317. See [README](README.md) for features and [codebase guide](docs/codebase.md) for the code map.

## Before opening a pull request

Keep changes focused and describe the problem, resulting behavior and validation. Include screenshots for visible changes. Preserve independent PCB designs and artwork; use synthetic fixtures in tests.

```sh
bun run format:check
bun run typecheck
bun run test:server
bun run test:ops
bunx --no-install playwright install chromium
bun run test
```

Lefthook installs during `bun install` in a Git checkout. Pre-commit checks staged Vue formatting; pre-push runs type, server and release-tooling checks. Use `bun run format` to format Vue files. Archives and CI skip hook installation.

For relay/runtime changes, also build and run `bun run test:standalone` and `bun run test:cloudflare`; see [hosting](docs/hosting.md). For plugin changes, run native tests following [the KiCad guide](packages/kicad/README.md).

## Delivery

[DevOps setup](docs/devops.md) explains checks, deployment configuration, releases and rollback. The project is MIT; see [LICENSE](LICENSE) and [asset notices](THIRD_PARTY_NOTICES.md).
