"""Controller-owned Docker execution and strictly bounded source snapshots."""
import io
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import selectors
import subprocess
import tarfile
import threading
import time


LABEL = 'ink.overprint.repo-agent'


def extract_snapshot(archive, destination):
    total = 0
    seen = set()
    with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as source:
        for count, member in enumerate(source):
            path = PurePosixPath(member.name)
            if count > 50000 or path.is_absolute() or '..' in path.parts or len(path.parts) == 0:
                raise ValueError('Unsafe source archive path or file count')
            # GitHub archives have exactly one enclosing directory.
            relative = path.parts[1:]
            if not relative:
                if member.isdir():
                    continue
                raise ValueError('Missing archive root')
            if '.git' in relative or not (member.isfile() or member.isdir()):
                raise ValueError('Source archive contains Git metadata or unsupported links/devices')
            total += member.size
            if member.size > 20 * 1024 * 1024 or total > 200 * 1024 * 1024:
                raise ValueError('Source archive exceeded size limit')
            target = destination.joinpath(*relative)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            if str(target) in seen or target.exists():
                raise ValueError('Duplicate archive path')
            seen.add(str(target))
            target.parent.mkdir(parents=True, exist_ok=True)
            with source.extractfile(member) as stream, target.open('xb') as output:
                shutil.copyfileobj(stream, output)
            target.chmod(0o644)


def initialize_snapshot(path):
    # Never inherit developer Git configuration, hooks, signing or credential helpers.
    environment = {'PATH': os.environ.get('PATH', '/usr/bin:/bin'), 'HOME': str(path),
                   'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': '/dev/null'}
    for args in [('init', '-b', 'snapshot'), ('add', '--all'),
                 ('-c', 'user.name=Overprint snapshot', '-c', 'user.email=agent@localhost',
                  '-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '--allow-empty', '-m', 'Analysis snapshot')]:
        subprocess.run(['git', '-C', str(path), *args], env=environment,
                       check=True, capture_output=True, timeout=30)


def docker_command(config, job, folder, smoke=False):
    name = f'overprint-agent-{job["id"]}'
    args = ['docker', 'run', '--name', name, '--rm', '--init', '--pull=never',
            '--label', f'{LABEL}=true', '--read-only', '--cap-drop=ALL',
            '--security-opt=no-new-privileges', '--pids-limit=128', '--memory=2g', '--cpus=2',
            '--user', f'{os.getuid()}:{os.getgid()}',
            '--log-driver=local', '--log-opt', 'max-size=10m', '--log-opt', 'max-file=2',
            '--tmpfs', '/tmp:rw,nosuid,nodev,size=536870912,mode=1777',
            '--mount', f'type=bind,src={folder / "source"},dst=/workspace,readonly',
            '--mount', f'type=bind,src={folder / "input"},dst=/input,readonly',
            '--tmpfs', '/output:rw,nosuid,nodev,noexec,size=33554432,mode=1777',
            '--env', 'HOME=/tmp/home', '--env', 'CODEX_HOME=/tmp/codex',
            '--env', 'GIT_OPTIONAL_LOCKS=0', '--env', f'AGENT_MODEL={config.model}']
    if smoke:
        args += ['--network=none', '--env', 'AGENT_SMOKE=1']
    else:
        args += ['--mount', f'type=bind,src={config.codex_key_file},dst=/run/secrets/codex-key,readonly']
    return args + [config.worker_image]


class DockerRunner:
    def __init__(self, config):
        self.config = config

    def cleanup(self):
        result = subprocess.run(['docker', 'ps', '-aq', '--filter', f'label={LABEL}=true'],
                                capture_output=True, text=True, check=True, timeout=15)
        for ident in result.stdout.split():
            subprocess.run(['docker', 'rm', '-f', ident], capture_output=True, check=True, timeout=15)

    def run(self, job, folder, active, smoke=False, verify=None):
        name = f'overprint-agent-{job["id"]}'
        command = docker_command(self.config, job, folder, smoke)
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        deadline = time.monotonic() + self.config.timeout_seconds
        stop_verifying = threading.Event()
        verification_failed = threading.Event()
        def verifier():
            while not stop_verifying.is_set():
                try:
                    verify()
                except Exception:
                    verification_failed.set()
                    return
                stop_verifying.wait(15)
        if verify is not None:
            threading.Thread(target=verifier, daemon=True).start()
        output = bytearray()
        errors = bytearray()
        poller = selectors.DefaultSelector()
        poller.register(process.stdout, selectors.EVENT_READ, output)
        poller.register(process.stderr, selectors.EVENT_READ, errors)
        try:
            while poller.get_map():
                if not active() or verification_failed.is_set():
                    raise ValueError('Job authorization revoked or could not be verified')
                if time.monotonic() >= deadline:
                    raise TimeoutError('Analysis deadline exceeded')
                for key, _ in poller.select(timeout=1):
                    chunk = key.fileobj.read1(65536)
                    if not chunk:
                        poller.unregister(key.fileobj)
                    else:
                        key.data.extend(chunk)
                        if len(output) + len(errors) > 2 * 1024 * 1024:
                            raise ValueError('Worker output exceeded size limit')
            process.wait(timeout=5)
            if process.returncode:
                raise RuntimeError('Worker container failed: ' + errors.decode(errors='replace')[-4000:])
            if not active() or verification_failed.is_set():
                raise ValueError('Job authorization revoked or could not be verified')
            lines = output.decode().splitlines()
            if not lines or not lines[-1].startswith('OVERPRINT_REPORT_JSON='):
                raise ValueError('Missing worker report')
            report = json.loads(lines[-1].split('=', 1)[1])['report']
            if not isinstance(report, str) or not 0 < len(report.encode()) <= 1024 * 1024:
                raise ValueError('Invalid worker report')
            return report
        finally:
            stop_verifying.set()
            poller.close()
            process.stdout.close()
            process.stderr.close()
            if errors:
                (folder / 'diagnostics.txt').write_text(errors.decode(errors='replace')[-64000:])
            subprocess.run(['docker', 'rm', '-f', name], capture_output=True, timeout=15)
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()


class Worker:
    def __init__(self, config, controller, github, runner):
        self.config, self.controller, self.github, self.runner = config, controller, github, runner

    def run_once(self, stopping=lambda: False):
        job = self.controller.claim()
        if job is None:
            return False
        folder = Path(self.config.state_dir) / 'jobs' / job['id']
        folder.mkdir(parents=True, mode=0o700)
        def active():
            return not stopping() and self.controller.active(job['id'])
        def verify():
            return self.github.authorized_issue(job)
        try:
            if not active():
                raise ValueError('Job cancelled')
            context = self.github.context(job)
            commit, archive = self.github.source()
            for name in ('source', 'input', 'output'):
                (folder / name).mkdir(mode=0o700)
            extract_snapshot(archive, folder / 'source')
            initialize_snapshot(folder / 'source')
            context.update({'repository': self.config.repository, 'source_commit': commit})
            encoded = json.dumps(context, ensure_ascii=False, indent=2)
            if len(encoded.encode()) > 512 * 1024:
                raise ValueError('Issue context too large for this worker')
            (folder / 'input' / 'context.json').write_text(encoded)
            if not active():
                raise ValueError('Job cancelled during preparation')
            verify()
            report = self.runner.run(job, folder, active, verify=verify)
            self.github.authorized_issue(job)
            if not active():
                raise ValueError('Job cancelled before completion')
            # Copy the untrusted output into a controller-owned final report.
            (folder / 'report.md').write_text(f'# Issue #{job["issue_number"]}\n\nSource: {commit}\n\n' + report)
            self.controller.finish(job['id'], 'completed', f'jobs/{job["id"]}/report.md')
        except Exception as exc:
            # Error categories are enough for status; secrets never enter exception logs.
            self.controller.finish(job['id'], 'failed', f'{type(exc).__name__}: analysis stopped; reassign to retry')
        finally:
            # Cancelled and failed outputs are not published as completed reports.
            if not any(j['id'] == job['id'] and j['status'] == 'completed' for j in self.controller.jobs()):
                (folder / 'report.md').unlink(missing_ok=True)
            for name in ('source', 'input', 'output'):
                shutil.rmtree(folder / name, ignore_errors=True)
        return True
