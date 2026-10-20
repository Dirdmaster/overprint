#!/usr/bin/env bash
# Install prepared files on a dedicated Ubuntu VM. Does not enable/start the service.
set -euo pipefail
if [[ $(id -u) != 0 ]]; then
  echo 'Run with sudo on the dedicated VM.' >&2
  exit 1
fi
for executable in python3 docker git openssl systemctl; do
  command -v "$executable" >/dev/null || { echo "Missing dependency: $executable" >&2; exit 1; }
done
getent group docker >/dev/null || { echo 'Configure the Docker daemon and docker group first.' >&2; exit 1; }
if systemctl is-active --quiet overprint-agent.service; then
  echo 'Stop overprint-agent before replacing its controller files.' >&2
  exit 1
fi
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
if ! id overprint-agent >/dev/null 2>&1; then
  useradd --system --user-group --home-dir /var/lib/overprint-agent --shell /usr/sbin/nologin overprint-agent
fi
usermod -aG docker overprint-agent
install -d -o root -g root -m 0755 /opt/overprint-agent/scripts
install -d -o overprint-agent -g overprint-agent -m 0700 /etc/overprint-agent /var/lib/overprint-agent
python3 - "$source_dir" <<'PY'
from pathlib import Path
import shutil
import sys
source = Path(sys.argv[1])
target = Path('/opt/overprint-agent/scripts/repo_agent')
shutil.copytree(source, target, dirs_exist_ok=True,
                ignore=shutil.ignore_patterns('__pycache__', '*.pyc', 'node_modules'))
for path in target.rglob('*'):
    path.chmod(0o755 if path.is_dir() else 0o644)
PY
if [[ ! -e /etc/overprint-agent/config.json ]]; then
  install -o overprint-agent -g overprint-agent -m 0600 \
    "$source_dir/deploy/config.example.json" /etc/overprint-agent/config.json
fi
if [[ ! -e /etc/overprint-agent/webhook-secret ]]; then
  openssl rand -hex 32 > /etc/overprint-agent/webhook-secret
  chown overprint-agent:overprint-agent /etc/overprint-agent/webhook-secret
  chmod 0600 /etc/overprint-agent/webhook-secret
fi
install -o root -g root -m 0644 "$source_dir/deploy/overprint-agent.service" /etc/systemd/system/overprint-agent.service
systemctl daemon-reload
echo 'Installed; not started. Existing enablement is unchanged. Configure identity, secrets, model and image, then run check.'
