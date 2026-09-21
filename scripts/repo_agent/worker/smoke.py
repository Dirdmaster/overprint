"""No model calls: exercise the same Sandcastle lifecycle and Docker boundary."""
import json
import os
from pathlib import Path
import subprocess
import sys

sys.stdin.read()
assert not Path('/var/run/docker.sock').exists()
assert not Path('/run/secrets/codex-key').exists()
assert not any(k in os.environ for k in ('GH_TOKEN', 'GITHUB_TOKEN', 'GITHUB_APP_PRIVATE_KEY', 'CODEX_API_KEY'))
for path in ('/workspace/escape', '/opt/worker/escape', '/etc/escape'):
    try:
        Path(path).write_text('must fail')
    except OSError:
        pass
    else:
        raise AssertionError(f'Unexpected writable path: {path}')
subprocess.run(['/opt/worker/node_modules/.bin/codex', 'exec', '--sandbox', 'read-only',
                '--ephemeral', '--ignore-user-config', '--ignore-rules', '--help'],
               check=True, stdout=subprocess.DEVNULL)
# Outer /output is writable, so this tests the inner Codex policy independently.
probe = """from pathlib import Path
try:
    Path('/output/inner-probe').write_text('must fail')
except OSError:
    pass
else:
    raise SystemExit('Codex sandbox unexpectedly allowed output writes')
"""
subprocess.run(['/opt/worker/node_modules/.bin/codex', 'sandbox', '--enable', 'use_legacy_landlock',
                '-c', 'sandbox_mode="read-only"', '--', 'python3', '-c', probe], check=True)
Path('/output/report.md').write_text('Docker isolation, Codex read-only sandbox, and Sandcastle lifecycle smoke passed. No model call.\n')
print(json.dumps({'type': 'thread.started', 'thread_id': 'smoke'}))
print(json.dumps({'type': 'turn.completed', 'usage': {'input_tokens': 0, 'cached_input_tokens': 0, 'output_tokens': 0}}))
