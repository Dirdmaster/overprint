# Release preparation

See [DevOps setup](devops.md) for tagged draft releases and CI deployment. `scripts/prepare_release.py` automates the clean extraction and matching source/plugin assets described below.

## Build a source candidate

```sh
python3 scripts/package_source.py
```

The script packages the **committed HEAD**, ignoring uncommitted work. Output is `dist/overprint-source-<commit>.zip`. File order, ZIP timestamps and permissions are fixed; the same commit produces the same archive. `SOURCE-MANIFEST.json` records the commit and SHA-256 hashes.

Included: application and relay source, KiCad plugin source/icons, original test fixtures, required configuration, selected documentation, license and notices. Excluded: Git history, `.scratch`, private board/artwork references, generated models, environment files and third-party JLCPCB guide screenshots. The source-build guide uses original SVG diagrams when screenshots are absent.

Unzip into a clean directory, then run the README build/check commands. `bun run build` also builds `apps/web/public/downloads/overprint-kicad.zip`.

## Website and plugin delivery

Production uses Cloudflare Pages Git integration at `https://overprint.ink`. GitHub Actions verifies commits independently; the alternative Actions deployment is disabled. See [DevOps](devops.md).

The website build publishes the custom PCM feed at `https://overprint.ink/pcm/repository.json`. Before each plugin release, bump both plugin version files and validate the generated feed and ZIP. Users refresh PCM to receive updates; manual ZIP installation remains available.

## Build the hosted alpha from the source candidate

Build from a fresh extraction, not the working directory: the latter contains
local guide screenshots which are intentionally excluded from redistribution.
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
The standalone output also includes the same source download. The original
instruction diagrams are used because this extraction has no JLC screenshots.
