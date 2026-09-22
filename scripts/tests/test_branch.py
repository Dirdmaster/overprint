"""Naming policy and actual Git/Lefthook pre-push regression checks."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from check_branch import pushed_branches, valid_branch


class BranchNamesTests(unittest.TestCase):
    def test_names(self):
        for name in ['feat/15-pcb-import', 'fix/2-bug', 'chore/123-tools',
                     'docs/4-guide', 'refactor/5-extract', 'main', 'chore/release-versions']:
            self.assertTrue(valid_branch(name), name)
        for name in ['', 'codex/15-feature', 'feature/15-test', 'fix/no-issue',
                     'fix/0-bug', 'fix/01-bug', 'fix/15-', 'fix/15-Bug',
                     'fix/15-two--dashes', 'fix/15-extra/path', 'fix/15-bug\n',
                     'chore/release-versions-other']:
            self.assertFalse(valid_branch(name), name)

    def test_refspecs_deletions_and_tags(self):
        oid, zero = 'a' * 40, '0' * 40
        lines = [f'refs/heads/fix/15-local {oid} refs/heads/codex/remote {zero}',
                 f'HEAD {oid} refs/heads/feat/15-detached {zero}',
                 f'(delete) {zero} refs/heads/codex/old {oid}',
                 f'refs/tags/v1.0 {oid} refs/tags/v1.0 {zero}']
        self.assertEqual(list(pushed_branches(lines)),
                         ['fix/15-local', 'codex/remote', 'feat/15-detached'])
        with self.assertRaises(ValueError):
            list(pushed_branches(['malformed']))

    def test_ci_uses_environment_without_shell_interpolation(self):
        for name, success in [('feat/15-valid', True), ('codex/invalid', False), ('', False)]:
            result = subprocess.run(['python3', str(ROOT / 'scripts/check_branch.py')],
                                    env={**os.environ, 'BRANCH_NAME': name}, capture_output=True)
            self.assertEqual(result.returncode == 0, success)

    def test_real_lefthook_push_checks_refs_before_quality_commands(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            local_vars = subprocess.check_output(['git', 'rev-parse', '--local-env-vars'], text=True).splitlines()
            env = {key: value for key, value in os.environ.items() if key not in local_vars}
            env.update(LEFTHOOK='1', CI='false')
            def run(*args):
                return subprocess.run(args, cwd=root, env=env, text=True, capture_output=True)
            def ok(*args):
                result = run(*args)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                return result
            ok('git', 'init', '-b', 'chore/15-branch-rules')
            ok('git', 'config', 'user.name', 'Fixture')
            ok('git', 'config', 'user.email', 'fixture@example.invalid')
            (root / 'scripts').mkdir()
            shutil.copy(ROOT / 'scripts/check_branch.py', root / 'scripts/check_branch.py')
            shutil.copy(ROOT / 'lefthook.yml', root / 'lefthook.yml')
            ok('git', 'add', '.')
            ok('git', '-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'Fixture')
            remote = root / 'remote.git'
            ok('git', 'init', '--bare', str(remote))
            ok('git', 'remote', 'add', 'origin', str(remote))
            # Stub expensive quality commands, but run the real hook and naming guard.
            binaries = root / 'bin'
            binaries.mkdir()
            stub = binaries / 'bun'
            stub.write_text('#!/bin/sh\necho quality >> quality-ran\n')
            stub.chmod(0o755)
            env['PATH'] = str(binaries) + os.pathsep + env['PATH']
            lefthook = str(ROOT / 'node_modules/.bin/lefthook')
            ok(lefthook, 'install')
            for ref in ['HEAD:refs/heads/codex/invalid', 'HEAD:refs/heads/fix/no-issue']:
                result = run('git', 'push', 'origin', ref)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('Branch naming check failed', result.stdout + result.stderr)
                self.assertFalse((root / 'quality-ran').exists())
            result = run('git', 'push', 'origin',
                         'HEAD:refs/heads/fix/15-valid', 'HEAD:refs/heads/codex/invalid')
            self.assertNotEqual(result.returncode, 0)
            self.assertNotEqual(run('git', 'ls-remote', '--exit-code', 'origin',
                                    'refs/heads/fix/15-valid').returncode, 0)
            ok('git', 'branch', 'codex/source')
            result = run('git', 'push', 'origin', 'codex/source:refs/heads/fix/15-valid')
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((root / 'quality-ran').exists())
            ok('git', 'push', 'origin', 'HEAD:refs/heads/chore/15-branch-rules')
            self.assertTrue((root / 'quality-ran').exists())
            ok('git', 'checkout', '--detach')
            ok('git', 'push', 'origin', 'HEAD:refs/heads/fix/15-detached')
            ok('git', 'tag', 'v1.0')
            ok('git', 'push', 'origin', 'refs/tags/v1.0')
            ok('git', 'push', 'origin', ':refs/heads/fix/15-detached')
