"""Prepare a clean, committed-source candidate and release assets. Never publishes."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import zipfile

from package_source import build_source


def validate_versions(web, plugin, metadata, tag=''):
    plugin_version = metadata['versions'][0]['version']
    if plugin['version'] != plugin_version:
        raise ValueError('KiCad package.json and metadata.json versions must match')
    if tag and (not re.fullmatch(r'v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?', tag)
                or tag != f"v{web['version']}"):
        raise ValueError('Release tag must be v followed by apps/web/package.json version')
    return web['version'], plugin_version


def prepare(directory, tag=''):
    directory = Path(directory).resolve()
    if directory.exists() and any(directory.iterdir()):
        raise ValueError('Use an empty candidate directory to avoid mixing revisions')
    archive_path = build_source()
    with zipfile.ZipFile(archive_path) as archive:
        read = lambda name: json.loads(archive.read(f'overprint/{name}'))
        web_version, plugin_version = validate_versions(
            read('apps/web/package.json'), read('packages/kicad/package.json'),
            read('packages/kicad/metadata.json'), tag)
        revision = read('SOURCE-MANIFEST.json')['commit']
        archive.extractall(directory)
    source = directory / 'overprint'
    assets = directory / 'assets'
    assets.mkdir()
    shutil.copy2(archive_path, assets / archive_path.name)
    downloads = source / 'apps/web/public/downloads'
    downloads.mkdir(parents=True, exist_ok=True)
    shutil.copy2(archive_path, downloads / 'overprint-source.zip')
    plugin_name = f'overprint-kicad-{plugin_version}.zip'
    subprocess.run([sys.executable, str(source / 'packages/kicad/build.py'),
                    '--output', str(assets / plugin_name)], check=True)
    manifest = {'commit': revision, 'webVersion': web_version,
                'pluginVersion': plugin_version, 'tag': tag or None}
    (assets / 'RELEASE-METADATA.json').write_text(json.dumps(manifest, indent=2) + '\n')
    sums = ''.join(f'{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n'
                   for path in sorted(assets.iterdir()))
    (assets / 'SHA256SUMS').write_text(sums)
    return source


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, required=True)
    parser.add_argument('--tag', default='')
    args = parser.parse_args()
    print(prepare(args.directory, args.tag))


if __name__ == '__main__':
    main()
