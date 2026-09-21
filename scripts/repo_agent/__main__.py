"""Run with python3 -m scripts.repo_agent --help."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import tempfile
import threading
from types import SimpleNamespace
import uuid

from .config import Config, secret
from .controller import Controller
from .github import GitHub
from .server import WebhookServer
from .worker import DockerRunner, Worker, initialize_snapshot


def smoke(image):
    if not re.fullmatch(r'sha256:[a-f0-9]{64}', image):
        raise ValueError('Pass the immutable local image ID to --image')
    config = SimpleNamespace(worker_image=image, model='smoke-only', timeout_seconds=90)
    with tempfile.TemporaryDirectory(prefix='overprint-agent-smoke-') as temporary:
        folder = Path(temporary)
        for name in ('source', 'input'):
            (folder / name).mkdir()
        (folder / 'source' / 'README.md').write_text('Synthetic smoke fixture\n')
        initialize_snapshot(folder / 'source')
        (folder / 'input' / 'context.json').write_text('{}')
        print(DockerRunner(config).run({'id': uuid.uuid4().hex}, folder, lambda: True, smoke=True))


def serve(config, controller, github):
    state = Path(config.state_dir)
    with (state / 'service.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        secret(config.codex_key_file)
        github.preflight()
        runner = DockerRunner(config)
        runner.cleanup()
        controller.recover()
        # Remove interrupted scratch data; completed private reports are retained.
        import shutil
        for folder in (state / 'jobs').glob('*') if (state / 'jobs').exists() else []:
            for name in ('source', 'input', 'output'):
                shutil.rmtree(folder / name, ignore_errors=True)
        stopping = threading.Event()
        worker = Worker(config, controller, github, runner)
        def loop():
            while not stopping.is_set():
                try:
                    if not worker.run_once(stopping.is_set):
                        stopping.wait(2)
                except Exception:
                    # A controller-level failure must stop accepting new assignments.
                    stopping.set()
                    server.shutdown()
        with WebhookServer(('127.0.0.1', config.port), controller) as server:
            def stop(signum, frame):
                stopping.set()
                threading.Thread(target=server.shutdown, daemon=True).start()
            signal.signal(signal.SIGTERM, stop)
            signal.signal(signal.SIGINT, stop)
            thread = threading.Thread(target=loop, daemon=True)
            thread.start()
            try:
                server.serve_forever()
            finally:
                stopping.set()
                thread.join(timeout=35)
                runner.cleanup()


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description='Owner-assigned private repository analysis')
    parser.add_argument('command', choices=['serve', 'status', 'check', 'smoke'])
    parser.add_argument('--config', default='/etc/overprint-agent/config.json')
    parser.add_argument('--image', help='Immutable local image ID for no-model smoke test')
    args = parser.parse_args()
    if args.command == 'smoke':
        smoke(args.image or '')
        return
    config = Config.load(args.config)
    state = Path(config.state_dir)
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    state.chmod(0o700)
    controller = Controller(state / 'queue.db', config.policy, secret(config.webhook_secret_file).encode())
    github = GitHub(config)
    if args.command == 'status':
        print(json.dumps(controller.jobs(), indent=2))
    elif args.command == 'check':
        secret(config.codex_key_file)
        subprocess.run(['docker', 'image', 'inspect', config.worker_image],
                       stdout=subprocess.DEVNULL, check=True, timeout=15)
        print(json.dumps(github.preflight(), indent=2))
        print('Read-only GitHub/identity/image checks passed. Run smoke next; no inference was tested.')
    else:
        serve(config, controller, github)


if __name__ == '__main__':
    main()
