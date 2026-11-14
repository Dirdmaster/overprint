"""Exercise the installed Changesets CLI through Overprint's version command."""
import json
import os
from pathlib import Path
import shlex
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class ChangesetsTests(unittest.TestCase):
    def setUp(self):
        # Git hooks export repository-local settings. Fixture commands, including
        # Changesets' own git subprocesses, must target the temporary repository.
        local_vars = subprocess.check_output(
            ['git', 'rev-parse', '--local-env-vars'], cwd=ROOT, text=True).splitlines()
        self.env = {key: value for key, value in os.environ.items() if key not in local_vars}
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.write_json('package.json', {
            'name': 'release-fixture', 'private': True,
            'packageManager': 'bun@1.3.14', 'workspaces': ['apps/*', 'packages/*'],
            'scripts': {'version:packages': 'node ' + shlex.quote(str(ROOT / 'scripts/version-packages.mjs'))}})
        self.write_json('apps/web/package.json', {
            'name': '@overprint/web', 'private': True, 'version': '0.1.0-alpha.1',
            'devDependencies': {'@overprint/kicad': 'workspace:*'}})
        self.write_json('packages/kicad/package.json', {
            'name': '@overprint/kicad', 'private': True, 'version': '0.1.12'})
        self.write_json('packages/kicad/metadata.json', {
            'name': 'Overprint', 'versions': [{'version': '0.1.12', 'status': 'development'}]})
        self.write_json('packages/editor/package.json', {
            'name': '@overprint/editor', 'version': '0.2.0'})
        self.write_json('.changeset/config.json', json.loads((ROOT / '.changeset/config.json').read_text()))
        (self.root / '.changeset/README.md').write_text('Changeset notes\n')
        (self.root / 'node_modules').symlink_to(ROOT / 'node_modules', target_is_directory=True)
        self.run_command('bun', 'install', '--lockfile-only', '--ignore-scripts')
        self.run_command('git', 'init', '-b', 'main')
        self.run_command('git', 'config', 'user.email', 'fixture@example.invalid')
        self.run_command('git', 'config', 'user.name', 'Release fixture')
        self.run_command('git', 'add', '.')
        self.run_command('git', 'commit', '-m', 'Initial fixture')

    def write_json(self, name, value):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, indent=2) + '\n')

    def read_json(self, name):
        return json.loads((self.root / name).read_text())

    def run_command(self, *args):
        result = subprocess.run(args, cwd=self.root, env=self.env, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return result.stdout

    def changeset(self, packages, filename='fix-import.md'):
        declarations = '\n'.join(f'"{name}": {bump}' for name, bump in packages.items())
        (self.root / '.changeset' / filename).write_text(
            f'---\n{declarations}\n---\n\nPreserve artwork when syncing a PCB.\n')
        self.run_command('git', 'add', '.changeset')
        self.run_command('git', 'commit', '-m', 'Add release note (#42)')

    def version(self):
        return self.run_command('node', str(ROOT / 'scripts/version-packages.mjs'))

    def release_pr_files(self):
        output = self.root / '.git' / 'workflow-output'
        self.env['GITHUB_OUTPUT'] = str(output)
        self.run_command('bash', str(ROOT / 'scripts/prepare-release-pr.sh'))
        start, *paths, end = output.read_text().splitlines()
        self.assertEqual(start, f'paths<<{end}')
        # create-pull-request accepts both line breaks and commas as separators.
        self.run_command('git', 'add', '--', *[part for path in paths for part in path.split(',')])
        return self.run_command('git', 'diff', '--cached', '--name-only').splitlines()

    def test_release_pr_stages_a_web_only_release_without_a_kicad_changelog(self):
        self.changeset({'@overprint/web': 'patch'}, 'fix,import.md')
        (self.root / 'apps/web/draft.txt').write_text('Unrelated file')
        self.assertCountEqual(self.release_pr_files(), [
            '.changeset/fix,import.md', 'apps/web/CHANGELOG.md', 'apps/web/package.json'])

    def test_release_pr_stages_a_kicad_only_release_without_a_web_changelog(self):
        self.changeset({'@overprint/kicad': 'patch'})
        self.assertCountEqual(self.release_pr_files(), [
            '.changeset/fix-import.md', 'packages/kicad/CHANGELOG.md',
            'packages/kicad/metadata.json', 'packages/kicad/package.json'])

    def test_release_pr_stages_editor_only_versions_and_notes(self):
        self.changeset({'@overprint/editor': 'patch'})
        self.assertCountEqual(self.release_pr_files(), [
            '.changeset/fix-import.md', 'packages/editor/CHANGELOG.md', 'packages/editor/package.json'])

    def test_empty_changeset_keeps_the_release_pr_worktree_clean(self):
        self.changeset({})
        self.assertEqual(self.release_pr_files(), [])
        self.assertEqual(self.run_command('git', 'status', '--short'), '')

    def test_web_change_keeps_alpha_and_does_not_bump_plugin(self):
        self.changeset({'@overprint/web': 'patch'})
        self.version()
        self.assertEqual(self.read_json('apps/web/package.json')['version'], '0.1.0-alpha.2')
        self.assertEqual(self.read_json('packages/kicad/package.json')['version'], '0.1.12')
        notes = (self.root / 'apps/web/CHANGELOG.md').read_text()
        self.assertIn('## 0.1.0-alpha.2', notes)
        self.assertIn('Preserve artwork when syncing a PCB.', notes)
        self.assertFalse((self.root / '.changeset/fix-import.md').exists())
        self.run_command('bun', 'install', '--frozen-lockfile', '--lockfile-only', '--ignore-scripts')
        self.version()
        self.assertEqual(self.read_json('apps/web/package.json')['version'], '0.1.0-alpha.2')
        self.assertEqual((self.root / 'apps/web/CHANGELOG.md').read_text(), notes)

    def test_plugin_only_change_syncs_metadata_without_bumping_web(self):
        self.changeset({'@overprint/kicad': 'patch'})
        self.version()
        self.assertEqual(self.read_json('packages/kicad/package.json')['version'], '0.1.13')
        self.assertEqual(self.read_json('packages/kicad/metadata.json')['versions'][0]['version'], '0.1.13')
        self.assertEqual(self.read_json('apps/web/package.json')['version'], '0.1.0-alpha.1')
        self.assertIn('## 0.1.13', (self.root / 'packages/kicad/CHANGELOG.md').read_text())
        self.assertFalse((self.root / 'apps/web/CHANGELOG.md').exists())
        self.run_command('bun', 'install', '--frozen-lockfile', '--lockfile-only', '--ignore-scripts')

    def test_combined_minor_change_keeps_independent_versions(self):
        self.changeset({'@overprint/web': 'minor', '@overprint/kicad': 'minor'})
        self.version()
        self.assertEqual(self.read_json('apps/web/package.json')['version'], '0.1.0-alpha.2')
        self.assertEqual(self.read_json('packages/kicad/package.json')['version'], '0.2.0')
        self.assertEqual(self.read_json('packages/kicad/metadata.json')['versions'][0]['version'], '0.2.0')
        self.assertIn('Minor Changes', (self.root / 'apps/web/CHANGELOG.md').read_text())

    def test_empty_changeset_does_not_create_a_release(self):
        self.changeset({})
        self.version()
        self.assertEqual(self.read_json('apps/web/package.json')['version'], '0.1.0-alpha.1')
        self.assertEqual(self.read_json('packages/kicad/package.json')['version'], '0.1.12')
        self.assertFalse((self.root / 'apps/web/CHANGELOG.md').exists())
        self.assertFalse((self.root / 'packages/kicad/CHANGELOG.md').exists())
        self.assertFalse((self.root / '.changeset/fix-import.md').exists())

    def test_stable_web_uses_normal_semver(self):
        web = self.read_json('apps/web/package.json')
        web['version'] = '1.0.0'
        self.write_json('apps/web/package.json', web)
        self.changeset({'@overprint/web': 'minor'})
        self.version()
        self.assertEqual(self.read_json('apps/web/package.json')['version'], '1.1.0')
        self.assertIn('## 1.1.0', (self.root / 'apps/web/CHANGELOG.md').read_text())
