"""Explicit machine-local configuration; credentials never come from issue content."""
from dataclasses import dataclass
import json
from pathlib import Path
import re

from .controller import Policy


def secret(path):
    path = Path(path)
    if path.is_symlink() or not path.is_file() or path.stat().st_mode & 0o077:
        raise ValueError(f'Secret must be a regular owner-only file: {path}')
    value = path.read_text().strip()
    if not value:
        raise ValueError(f'Empty secret: {path}')
    return value


@dataclass(frozen=True)
class Config:
    repository: str
    repository_id: int
    installation_id: int
    owner_id: int
    assignee_id: int
    app_id: int
    app_key_file: str
    webhook_secret_file: str
    codex_key_file: str
    state_dir: str
    worker_image: str
    model: str
    port: int = 8787
    timeout_seconds: int = 900

    @property
    def policy(self):
        return Policy(self.repository_id, self.installation_id, self.owner_id, self.assignee_id)

    @classmethod
    def load(cls, path):
        config = cls(**json.loads(Path(path).read_text()))
        config.validate()
        return config

    def validate(self):
        self.policy
        if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', self.repository):
            raise ValueError('Invalid repository name')
        if type(self.app_id) is not int or self.app_id <= 0:
            raise ValueError('Configure a positive App ID')
        if not 1024 <= self.port <= 65535 or not 30 <= self.timeout_seconds <= 3600:
            raise ValueError('Invalid port or deadline')
        for name in ('app_key_file', 'webhook_secret_file', 'codex_key_file', 'state_dir'):
            if not Path(getattr(self, name)).is_absolute():
                raise ValueError(f'{name} must be an absolute path')
        if not re.fullmatch(r'sha256:[a-f0-9]{64}', self.worker_image):
            raise ValueError('Pin worker_image to the local immutable Docker image ID (sha256:...)')
        if not self.model or not re.fullmatch(r'[A-Za-z0-9._-]+', self.model):
            raise ValueError('Configure an explicit available Codex model')
