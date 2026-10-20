"""Trusted invocation wrapper, independent of repository-controlled configuration."""
import os
from pathlib import Path

key = Path('/run/secrets/codex-key').read_text().strip()
if not key:
    raise ValueError('Missing Codex API key')
os.environ['CODEX_API_KEY'] = key
os.execv('/opt/worker/node_modules/.bin/codex', [
    'codex', 'exec', '--enable', 'use_legacy_landlock', '--json', '--sandbox', 'read-only', '--ephemeral',
    '--ignore-user-config', '--ignore-rules',
    '-c', 'project_doc_max_bytes=0',
    '-c', 'projects."/workspace".trust_level="untrusted"',
    '-c', 'approval_policy="never"',
    '-c', 'web_search="disabled"',
    '--model', os.environ['AGENT_MODEL'], '--output-last-message', '/output/report.md', '-',
])
