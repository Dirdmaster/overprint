# Release preparation

See [DevOps setup](devops.md) for tagged draft releases and CI deployment. `scripts/prepare_release.py` automates the clean extraction and matching source/plugin assets described below.

## Versioning and changelogs

Changesets collects release notes committed with each change. Run `bun run changeset`
and select the affected package and patch/minor/major intent. Use an empty changeset
for maintenance with no user-visible release. Private packages remain private to npm;
both the web app and KiCad plugin are versioned for our own delivery channels.

Run `bun run version:packages` to prepare versions. This wraps Changesets, updates
the plugin's PCM metadata and refreshes `bun.lock`. It consumes pending notes and
generates a `CHANGELOG.md` in each affected workspace. Repeating it without new
notes does nothing. Commit generated files together and review them before tagging.

While the web version is `X.Y.Z-alpha.N`, each version batch advances only `N`.
Patch/minor/major intent still groups the changelog entries. The plugin keeps normal
numeric semantic versions. Workspace-wide `changeset pre` mode is intentionally
unsupported because it would put the plugin into the web prerelease channel.
Promoting the web app to a stable version is a separate, reviewed release decision:
update its version and lockfile and add a matching changelog entry consolidating
the alpha notes. Once stable, ordinary Changesets semantic versioning applies.

Web releases use `v<web-version>`. Plugin-only releases use `kicad-v<plugin-version>`.
Each tag must match its package version. Both retain the verified source/plugin
asset bundle. Tagged drafts use the corresponding package's changelog entry;
legacy versions with no changelog retain GitHub's generated notes. When a changelog
exists but the tagged version is missing, preparation fails rather than using stale notes.

## Build a source candidate

```sh
python3 scripts/package_source.py
```

The script packages the **committed HEAD**, ignoring uncommitted work. Output is `dist/overprint-source-<commit>.zip`. File order, ZIP timestamps and permissions are fixed; the same commit produces the same archive. `SOURCE-MANIFEST.json` records the commit and SHA-256 hashes.

Included: application and relay source, KiCad plugin source/icons, original test fixtures, required configuration, selected documentation, license and notices. Excluded: Git history, `.scratch`, private board/artwork references, generated models, and environment files. The four JLCPCB guide screenshots are included.

Unzip into a clean directory, then run the README build/check commands. `bun run build` also builds `apps/web/public/downloads/overprint-kicad.zip`.

## Website and plugin delivery

Production uses Cloudflare Pages Git integration at `https://overprint.ink`. GitHub Actions verifies commits independently; the alternative Actions deployment is disabled. See [DevOps](devops.md).

The website build publishes the custom PCM feed at `https://overprint.ink/pcm/repository.json`. Before each plugin release, bump both plugin version files and validate the generated feed and ZIP. Users refresh PCM to receive updates; manual ZIP installation remains available.

After publishing a plugin ZIP on GitHub Releases, update `packages/kicad/release.json` with its version, download URL and SHA-256. The PCM feed uses GitHub when the built ZIP matches that checksum. Unreleased or modified builds keep their local download, so development and standalone builds work without a GitHub release.

## Build the hosted alpha from the source candidate

Build from a fresh extraction to verify the packaged source and guide images.
After running `python3 scripts/package_source.py`, substitute its exact archive
name below and choose a new empty extraction directory:

```sh
unzip dist/overprint-source-<commit>.zip -d /tmp/overprint-alpha-<commit>
mkdir -p /tmp/overprint-alpha-<commit>/overprint/apps/web/public/downloads
cp dist/overprint-source-<commit>.zip /tmp/overprint-alpha-<commit>/overprint/apps/web/public/downloads/overprint-source.zip
cd /tmp/overprint-alpha-<commit>/overprint
bun install --frozen-lockfile
bun run build:cloudflare
bun run build
bun run test:cloudflare
bun run test:standalone
```

The source archive must be copied **before** building. Nuxt detects its presence
and enables the footer's Source download. This includes the matching source in the website download. Verify the served
ZIP's SHA-256 against the package script's output. Rebuild from a new candidate
when application code changes; do not combine a new binary with an old archive.

Use `apps/web/.output/cloudflare` from this extracted directory for Pages deployment.
The standalone output also includes the same source download. The guide screenshots are included in both outputs.
