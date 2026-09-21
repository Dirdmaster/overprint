"""Worker boundary: source extraction, capability limits, and lifecycle."""
import io
from pathlib import Path
import sys
import tarfile
import tempfile
from types import SimpleNamespace
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from repo_agent.worker import extract_snapshot, docker_command, Worker
from repo_agent.controller import Controller, Policy
from repo_agent.github import GitHub, SafeRedirect
from repo_agent.config import Config, secret
import test_repo_agent as assignment


class SnapshotTests(unittest.TestCase):
    def archive(self, name, kind=tarfile.REGTYPE):
        data = io.BytesIO()
        with tarfile.open(fileobj=data, mode='w:gz') as archive:
            entry = tarfile.TarInfo(name)
            entry.type = kind
            if kind == tarfile.REGTYPE:
                entry.size = 5
                archive.addfile(entry, io.BytesIO(b'hello'))
            else:
                entry.linkname = '/etc/passwd'
                archive.addfile(entry)
        return data.getvalue()

    def test_snapshot_extracts_only_regular_source_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            extract_snapshot(self.archive('repo-sha/README.md'), root)
            self.assertEqual((root / 'README.md').read_text(), 'hello')

    def test_archive_cannot_escape_or_supply_git_configuration(self):
        for name, kind in [('repo-sha/../../escape', tarfile.REGTYPE),
                           ('/absolute', tarfile.REGTYPE), ('repo-sha/link', tarfile.SYMTYPE),
                           ('repo-sha/.git/config', tarfile.REGTYPE)]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                with self.assertRaises(ValueError):
                    extract_snapshot(self.archive(name, kind), Path(directory))


class WorkerTests(unittest.TestCase):
    setUp = assignment.AssignmentTests.setUp
    event = assignment.AssignmentTests.event
    deliver = assignment.AssignmentTests.deliver

    def config(self):
        return SimpleNamespace(state_dir=self.tmp.name, repository='example/project',
                               worker_image='sha256:' + 'a' * 64, model='test-model',
                               codex_key_file='/etc/agent/model-key', timeout_seconds=30)

    def test_docker_has_no_host_control_or_write_token_and_bounds_resources(self):
        command = docker_command(self.config(), {'id': 'abc'}, Path('/tmp/job'))
        joined = ' '.join(command)
        for expected in ('--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
                         '--pids-limit=128', '--memory=2g', '--cpus=2',
                         'dst=/workspace,readonly', '/output:rw,nosuid,nodev,noexec,size=33554432'):
            self.assertIn(expected, joined)
        for forbidden in ('docker.sock', 'GH_TOKEN', 'GITHUB_TOKEN', '--privileged', '/root', '--network=host'):
            self.assertNotIn(forbidden, joined)
        self.assertEqual(command[-1], 'sha256:' + 'a' * 64)

    def test_worker_rechecks_authorization_and_saves_private_commit_linked_report(self):
        self.deliver(self.event())
        fixture = SnapshotTests().archive('repo/file.txt')
        github = SimpleNamespace(authorized_issue=lambda job: {}, context=lambda job: {'issue': {}},
                                 source=lambda: ('b' * 40, fixture))
        runner = SimpleNamespace(run=lambda job, folder, active: 'Evidence from file.txt' if active() else '')
        worker = Worker(self.config(), self.controller, github, runner)
        self.assertTrue(worker.run_once())
        job = self.controller.jobs()[0]
        self.assertEqual(job['status'], 'completed')
        report = (Path(self.tmp.name) / job['detail']).read_text()
        self.assertIn('b' * 40, report)
        self.assertIn('Evidence from file.txt', report)
        self.assertFalse((Path(self.tmp.name) / 'jobs' / job['id'] / 'source').exists())
        self.assertFalse(worker.run_once())

    def test_revocation_during_run_prevents_completed_report(self):
        self.deliver(self.event())
        fixture = SnapshotTests().archive('repo/file.txt')
        github = SimpleNamespace(authorized_issue=lambda job: {}, context=lambda job: {},
                                 source=lambda: ('b' * 40, fixture))
        def run(job, folder, active):
            self.deliver(self.event(action='unassigned', stamp='2026-09-21T12:00:01Z'))
            self.assertFalse(active())
            return 'Must not complete'
        Worker(self.config(), self.controller, github, SimpleNamespace(run=run)).run_once()
        job = self.controller.jobs()[0]
        self.assertEqual(job['status'], 'cancelled')
        self.assertFalse((Path(self.tmp.name) / 'jobs' / job['id'] / 'report.md').exists())

    def test_lost_assignment_or_api_failure_never_reaches_runner(self):
        self.deliver(self.event())
        def revoked(job):
            raise ValueError('No longer assigned')
        def run(*args):
            self.fail('Unauthorized job reached Docker')
        Worker(self.config(), self.controller, SimpleNamespace(authorized_issue=revoked),
               SimpleNamespace(run=run)).run_once()
        self.assertEqual(self.controller.jobs()[0]['status'], 'failed')


class ProvenanceTests(unittest.TestCase):
    def test_current_assignee_does_not_replace_owner_provenance(self):
        config = SimpleNamespace(assignee_id=999, owner_id=789)
        api = GitHub(config)
        issue = {'id': 1001, 'state': 'open', 'assignees': [{'id': 999}]}
        event = {'id': 11, 'event': 'assigned', 'actor': {'id': 789},
                 'assignee': {'id': 999}, 'created_at': '2026-09-21T12:00:00Z'}
        api.get = lambda suffix: issue
        api.pages = lambda suffix: [event]
        job = {'issue_id': 1001, 'issue_number': 42, 'assigned_at': '2026-09-21T12:00:00Z'}
        self.assertEqual(api.authorized_issue(job), issue)
        event['actor']['id'] = 2
        with self.assertRaises(ValueError):
            api.authorized_issue(job)
        event['actor']['id'] = 789
        event['created_at'] = '2026-09-21T12:00:01Z'
        with self.assertRaises(ValueError):
            api.authorized_issue(job)
        api.pages = lambda suffix: []
        with self.assertRaises(ValueError):
            api.authorized_issue(job)

    def test_archive_redirect_never_forwards_installation_token(self):
        from urllib.request import Request
        redirect = SafeRedirect()
        req = Request('https://api.github.com/repos/x/y/tarball/sha', headers={'Authorization': 'Bearer secret'})
        result = redirect.redirect_request(req, None, 302, '', {}, 'https://codeload.github.com/x/y/legacy.tar.gz/sha')
        self.assertIsNone(result.get_header('Authorization'))
        with self.assertRaises(ValueError):
            redirect.redirect_request(req, None, 302, '', {}, 'https://attacker.invalid/')


class DeploymentTests(unittest.TestCase):
    def test_example_is_disabled_until_configured(self):
        example = Path(__file__).resolve().parents[1] / 'repo_agent/deploy/config.example.json'
        with self.assertRaises(ValueError):
            Config.load(example)

    def test_secrets_must_be_owner_only_regular_files(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'key'
            path.write_text('synthetic-test-key')
            path.chmod(0o644)
            with self.assertRaises(ValueError):
                secret(path)
            path.chmod(0o600)
            self.assertEqual(secret(path), 'synthetic-test-key')
            link = Path(directory) / 'link'
            link.symlink_to(path)
            with self.assertRaises(ValueError):
                secret(link)


if __name__ == '__main__':
    unittest.main()
