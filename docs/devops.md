# Development and delivery

Bun manages dependencies, Turbo orders workspace tasks, Lefthook runs local hooks, and GitHub Actions validates changes. Cloudflare Pages currently builds from Git; GitHub Actions independently validates the same commits. Releases are drafts until a maintainer publishes them.

## Local checks

`bun install --frozen-lockfile` installs Git hooks when run at the checkout root. `bun run hooks:install` reinstalls them. Source archives and CI skip hook installation.

- Pre-commit: check formatting of staged Vue files.
- Pre-push: type checking, server tests and release-tooling tests.
- CI: Vue formatting, types, server tests, browser tests, release-tooling tests and plugin Python compilation. It builds an extracted source candidate, then tests standalone Bun/Node and Cloudflare workerd runtimes.

Native KiCad API tests still require KiCad 10 and must be run for plugin changes.

Actions are pinned by commit. Dependabot proposes weekly action updates. Bun dependencies use the committed lockfile and frozen installs; review dependency updates before committing their lockfile changes.

## Current deployment

The `Dirdmaster/overprint` repository is connected to Cloudflare Pages. Pushes to `main` build and deploy `overprint.ink` using the settings in [hosting](hosting.md). GitHub Actions runs verification separately. `DEPLOY_ENABLED=false` keeps the Actions deployment job disabled.

The two systems are independent: a successful Pages deployment does not mean CI passed. Prefer pull requests with required checks before merging. To switch to deploying only verified artifacts, disable Pages automatic Git deployments before enabling the alternative below.

## Optional: deploy verified artifacts through Actions

1. Create or select your GitHub repository and push the reviewed code.
2. Enable GitHub Actions. Protect `main`: require pull requests and the verification job before merging; select the actual check name after the first run.
3. Create a Cloudflare Pages Direct Upload project. If using an existing Git-integrated project, disable its automatic deployments so it cannot deploy before these checks pass.
4. Create a GitHub environment named `production`. Add environment secrets `CLOUDFLARE_API_TOKEN` (scoped to Pages Edit on the target account) and `CLOUDFLARE_ACCOUNT_ID`. Add environment variable `CLOUDFLARE_PAGES_PROJECT` with the exact project name. Configure reviewers if desired and restrict deployments to `main`.
5. Set the **repository variable** `DEPLOY_ENABLED=true` when ready to enable deployment. Leave it unset to run checks only.

With this optional configuration enabled, pushes to `main` and manual CI runs on `main` deploy only after verification succeeds. Pull requests never deploy. Deployment downloads the verified Pages artifact; it does not rebuild it. Production runs are serialized. No Cloudflare credentials are needed for the verification job.

The build comes from the committed-source allowlist, excluding local reference media. It includes the matching source ZIP in the website. [Release preparation](release.md) covers packaging; [hosting](hosting.md) covers runtime configuration and production smoke checks.

## Draft a release

Update `apps/web/package.json` to the release version. If the plugin changes, update both `packages/kicad/package.json` and `packages/kicad/metadata.json` to the same plugin version. Web and plugin versions may differ.

After the version changes are reviewed, committed and merged, create and push a matching tag, for example:

```sh
git tag -a v0.1.0 -m 'Overprint 0.1.0'
git push origin v0.1.0
```

The tag workflow reruns verification, rejects mismatched versions, and creates a **draft GitHub release** containing:

- Curated source ZIP with its commit/hash manifest.
- Versioned KiCad PCM plugin ZIP.
- Release metadata and SHA-256 checksums.

Tags with a prerelease suffix produce prerelease drafts. Review generated notes and limitations before publishing. Tagging does not deploy the website; `main` controls deployment. A workflow retry does not overwrite an existing release: inspect the existing draft first.

To prepare the same assets locally without publishing:

```sh
python3 scripts/prepare_release.py --directory /tmp/overprint-candidate
```

Use a new or empty directory. Only committed HEAD is packaged; uncommitted edits are excluded. Add `--tag v0.1.0` to validate a proposed tag. Assets are in `assets/`, and the buildable tree is in `overprint/` inside that directory.

## Rollback and troubleshooting

For the current Git integration, pause automatic deployments in Cloudflare Pages. For the optional Actions deployment, set repository variable `DEPLOY_ENABLED=false`. Use Cloudflare Pages' deployment history to roll back production, then revert the offending commit through a pull request so the next deployment preserves the fix. A rollback does not change users' browser-stored projects.

CI keeps Pages artifacts for 7 days, release assets for 14 days and failed browser traces for 7 days. Download traces from the failed run for diagnosis. Do not upload real customer boards to CI to reproduce failures.

Reference: [Cloudflare Direct Upload with CI](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/).
