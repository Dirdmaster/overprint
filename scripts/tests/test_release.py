"""Portable release checks; native pcbnew coverage is a separate KiCad run."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import package_source
from prepare_release import release_notes, validate_versions


class ReleaseTests(unittest.TestCase):
    def test_private_material_is_excluded_and_required_tooling_included(self):
        for path in ['.scratch/board.svg', 'hardware/private.kicad_pcb',
                     'media/movie.png', '.env', 'apps/web/tests/fixtures/bow.svg',
                     'apps/web/public/guides/jlcpcb/private-reference.png']:
            self.assertFalse(package_source.included(path), path)
        for path in ['lefthook.yml', 'CONTRIBUTING.md', 'docs/devops.md',
                     'apps/web/.prettierrc.json', 'apps/web/i18n/schema.ts',
                     'scripts/install-hooks.mjs', 'SECURITY.md', '.github/workflows/ci.yml',
                     'apps/web/public/guides/kicad/add-repository.png',
                     '.changeset/config.json', '.changeset/example.md',
                     'scripts/version-packages.mjs',
                     *[f'apps/web/public/guides/jlcpcb/{name}.png'
                       for name in ('settings', 'multicolor', 'open-viewer', 'viewer')]]:
            self.assertTrue(package_source.included(path), path)

    def test_versions_and_release_tags(self):
        metadata = {'versions': [{'version': '0.1.6'}]}
        self.assertEqual(validate_versions({'version': '0.2.0-alpha.1'},
                         {'version': '0.1.6'}, metadata, 'v0.2.0-alpha.1'),
                         ('0.2.0-alpha.1', '0.1.6'))
        self.assertEqual(validate_versions({'version': '0.2.0-alpha.1'},
                         {'version': '0.1.6'}, metadata, 'kicad-v0.1.6'),
                         ('0.2.0-alpha.1', '0.1.6'))
        for tag in ['main', 'v0.2.1', 'v0.2.0;echo bad', 'kicad-v0.1.5']:
            with self.assertRaises(ValueError):
                validate_versions({'version': '0.2.0'}, {'version': '0.1.6'}, metadata, tag)
        with self.assertRaises(ValueError):
            validate_versions({'version': '0.2.0'}, {'version': '0.1.5'}, metadata)

    def test_release_notes_only_include_the_tagged_version(self):
        changelog = '# @overprint/web\n\n## 0.1.0-alpha.2\n\n### Patch Changes\n\n- Fix sync.\n\n## 0.1.0-alpha.1\n\n- Old change.\n'
        self.assertEqual(release_notes(changelog, '0.1.0-alpha.2'), '### Patch Changes\n\n- Fix sync.\n')
        with self.assertRaises(ValueError):
            release_notes(changelog, '0.1.0')

    def test_archive_is_deterministic_and_manifest_matches_bytes(self):
        files = {'README.md': b'example', 'apps/web/package.json': b'{}',
                 '.scratch/private.svg': b'private',
                 **{f'apps/web/public/guides/jlcpcb/{name}.png':
                    (package_source.ROOT / f'apps/web/public/guides/jlcpcb/{name}.png').read_bytes()
                    for name in ('settings', 'multicolor', 'open-viewer', 'viewer')}}
        def git(*args):
            if args[0] == 'rev-parse':
                return b'0123456789abcdef\n'
            if args[0] == 'ls-tree':
                return '\0'.join(files).encode() + b'\0'
            return files[args[1].split(':', 1)[1]]
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(package_source, 'ROOT', Path(directory)), patch.object(package_source, 'git', git):
                archive = package_source.build_source()
                first = archive.read_bytes()
                self.assertEqual(first, package_source.build_source().read_bytes())
                with zipfile.ZipFile(archive) as output:
                    manifest = json.loads(output.read('overprint/SOURCE-MANIFEST.json'))
                    self.assertNotIn('overprint/.scratch/private.svg', output.namelist())
                    for name in ('settings', 'multicolor', 'open-viewer', 'viewer'):
                        path = f'apps/web/public/guides/jlcpcb/{name}.png'
                        self.assertEqual(output.read(f'overprint/{path}'), files[path])
                    for name, digest in manifest['files'].items():
                        self.assertEqual(hashlib.sha256(output.read(f'overprint/{name}')).hexdigest(), digest)

    def test_current_plugin_metadata_agrees_with_package_version(self):
        root = package_source.ROOT
        load = lambda name: json.loads((root / name).read_text())
        validate_versions(load('apps/web/package.json'), load('packages/kicad/package.json'),
                          load('packages/kicad/metadata.json'))


if __name__ == '__main__':
    unittest.main()
