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
    if tag and tag not in (f"v{web['version']}", f"kicad-v{plugin_version}"):
        raise ValueError('Release tag must match the web v<version> or plugin kicad-v<version>')
    if tag and not re.fullmatch(r'(?:kicad-)?v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?', tag):
        raise ValueError('Invalid release tag')
    return web['version'], plugin_version


def release_notes(changelog, version):
    """Extract exactly one Changesets version entry, preserving its subsections."""
    match = re.search(r'^## ' + re.escape(version) + r'\s*\n(.*?)(?=^## |\Z)',
                      changelog, re.MULTILINE | re.DOTALL)
    if not match:
        raise ValueError(f'Changelog does not contain release {version}')
    return match.group(1).strip() + '\n'


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
    if tag:
        plugin_release = tag.startswith('kicad-')
        changelog = source / ('packages/kicad/CHANGELOG.md' if plugin_release else 'apps/web/CHANGELOG.md')
        if changelog.exists():
            version = plugin_version if plugin_release else web_version
            (assets / 'RELEASE-NOTES.md').write_text(release_notes(changelog.read_text(), version))
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
