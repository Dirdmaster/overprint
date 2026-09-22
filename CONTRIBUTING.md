# Contributing

## Start here

Install Bun 1.3.14, Node.js 22.18+ and Python 3, then:

```sh
bun install --frozen-lockfile
bun run dev
```

The app opens at http://127.0.0.1:4317. See [README](README.md) for features and [codebase guide](docs/codebase.md) for the code map.

## Issues and branches

Track work in [GitHub Issues](https://github.com/Dirdmaster/overprint/issues).
For substantial features, use a parent issue for scope and acceptance criteria,
then linked implementation issues with explicit blockers. Incoming reports are
triaged before implementation; agreed implementation tickets are ready to work.

Create focused branches named `feat/42-description`, `fix/43-description`,
`chore/44-description`, `docs/45-description`, or `refactor/46-description`.
The number identifies the issue. The automated release PR uses the persistent
`chore/release-versions` branch. Keep commits independently reviewable and mention
the issue, for example `fix(import): preserve SVG colors (#42)`.

Lefthook rejects pushes whose source or destination branch does not follow this
format, before running quality checks. Use a positive issue number and a lowercase,
hyphen-separated description. Names such as `codex/my-task`, `feature/42-task`,
and `fix/no-issue` are rejected. Rename a branch with
`git branch -m fix/42-description`. `main` and `chore/release-versions` are the
only exceptions; tags and branch deletions remain allowed.

Required CI checks the PR branch name with the same validator, including when
local hooks were skipped. Check a name manually with
`python3 scripts/check_branch.py --branch fix/42-description`.

Open a PR against `main` with `Closes #42` when it completes an issue, or `Refs #42`
for partial work. Include validation and wait for required checks and maintainer
review. Issues close when the completing PR merges; publication is tracked separately.
Private boards, credentials, raw research, and local experiments stay out of issues,
commits, and CI fixtures.

## Before opening a pull request

Keep changes focused and describe the problem, resulting behavior and validation. Include screenshots for visible changes. Preserve independent PCB designs and artwork; use synthetic fixtures in tests.

For user-visible changes, run `bun run changeset`, select the affected package(s),
choose the version bump, and write a short note for users. Commit that note with
the implementation. Use `bun run changeset add --empty` when no release is needed.
CI checks that changed packages have a changeset; review checks that it describes
the change and selects the right packages. Branch and commit names do not determine
Changesets version bumps.

```sh
bun run format:check
bun run typecheck
bun run test:server
bun run test:ops
bunx --no-install playwright install chromium
bun run test
```

Lefthook installs during `bun install` in a Git checkout. Pre-commit checks staged Vue formatting; pre-push validates branch names before running type, server and release-tooling checks. Use `bun run format` to format Vue files. Archives and CI skip hook installation.

For relay/runtime changes, also build and run `bun run test:standalone` and `bun run test:cloudflare`; see [hosting](docs/hosting.md). For plugin changes, run native tests following [the KiCad guide](packages/kicad/README.md).

## Delivery

[DevOps setup](docs/devops.md) explains checks, deployment configuration, releases and rollback. The project is MIT; see [LICENSE](LICENSE) and [asset notices](THIRD_PARTY_NOTICES.md).
