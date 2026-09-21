"""Run with python3 -m scripts.repo_agent --help."""
import argparse
import json
from pathlib import Path

from .config import Config, secret
from .controller import Controller
from .server import WebhookServer


def main():
    parser = argparse.ArgumentParser(description='Owner-assigned private repository analysis')
    parser.add_argument('command', choices=['listen', 'status'])
    parser.add_argument('--config', default='/etc/overprint-agent/config.json')
    args = parser.parse_args()
    config = Config.load(args.config)
    controller = Controller(Path(config.state_dir) / 'queue.db', config.policy,
                            secret(config.webhook_secret_file).encode())
    if args.command == 'status':
        print(json.dumps(controller.jobs(), indent=2))
    else:
        with WebhookServer(('127.0.0.1', config.port), controller) as server:
            server.serve_forever()


if __name__ == '__main__':
    main()
