"""Create a reproducible source release from committed files only."""
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args])


def included(name):
    roots = {'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'CONTEXT.md',
             'package.json', 'bun.lock', 'nuxt.config.ts', 'wrangler.jsonc',
             'turbo.json', '.gitignore', 'lefthook.yml', 'CONTRIBUTING.md', 'SECURITY.md', 'docs/devops.md',
             'docs/codebase.md', 'docs/export.md', 'docs/live-paint.md', 'docs/layers.md', 'docs/hosting.md', 'docs/privacy.md', 'docs/release.md', 'docs/assets/jlcpcb-guide.md'}
    prefixes = ('apps/web/', 'packages/kicad/', 'scripts/', '.github/', '.changeset/')
    guide_images = {'apps/web/public/guides/kicad/add-repository.png',
                    *{f'apps/web/public/guides/jlcpcb/{step}.png'
                      for step in ('settings', 'multicolor', 'open-viewer', 'viewer')}}
    return (name in roots or name.startswith(prefixes)) and name not in {'apps/web/tests/fixtures/bow.svg'} and (not name.startswith('apps/web/public/guides/') or name in guide_images)


def build_source():
    revision = git('rev-parse', 'HEAD').decode().strip()
    paths = git('ls-tree', '-rz', '--name-only', revision).decode().split('\0')
    files = {name: git('show', f'{revision}:{name}') for name in sorted(paths) if name and included(name)}
    manifest = {
        'commit': revision,
        'files': {name: hashlib.sha256(data).hexdigest() for name, data in files.items()},
        'excluded': ['Git history', 'private .scratch material', 'unreviewed bow artwork', 'credentials and generated build output'],
    }
    files['SOURCE-MANIFEST.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    files['RELEASE-CANDIDATE.md'] = b'''# Source release

This archive contains the buildable source for the identified release.
The manifest identifies the exact commit and SHA-256 of every source file.

Run bun install --frozen-lockfile and bun start for standalone use.
Development and Cloudflare Pages instructions are in README.md and docs/hosting.md.
Python 3 is required to build the downloadable KiCad plugin.

See docs/export.md for export limits and supported platforms.
'''
    output = ROOT / 'dist' / f'overprint-source-{revision[:12]}.zip'
    output.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(output, 'w') as archive:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(f'overprint/{name}', date_time=(2026, 9, 16, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, data)
    return output


def main():
    output = build_source()
    print(output)
    print(f'SHA-256: {hashlib.sha256(output.read_bytes()).hexdigest()}')


if __name__ == '__main__':
    main()
