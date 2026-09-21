"""Signed event boundary and durable job lifecycle. No agent or Docker access here."""
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
import hashlib
import hmac
import json
from pathlib import Path
import sqlite3
import uuid


@dataclass(frozen=True)
class Policy:
    repository_id: int
    installation_id: int
    owner_id: int
    assignee_id: int

    def __post_init__(self):
        if any(type(value) is not int or value <= 0 for value in self.__dict__.values()):
            raise ValueError('Policy requires positive numeric GitHub IDs')
        if self.owner_id == self.assignee_id:
            raise ValueError('Owner and bot assignee must be distinct identities')


class Controller:
    def __init__(self, database: Path, policy: Policy, webhook_secret: bytes):
        if not webhook_secret:
            raise ValueError('Webhook secret is required')
        self.database = database
        self.policy = policy
        self.secret = webhook_secret
        database.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with self._db() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS deliveries (id TEXT PRIMARY KEY, digest TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS issues (id INTEGER PRIMARY KEY, watermark TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY, delivery TEXT UNIQUE NOT NULL, issue_id INTEGER NOT NULL,
                    issue_number INTEGER NOT NULL, assigned_at TEXT NOT NULL,
                    status TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            ''')
        database.chmod(0o600)

    @contextmanager
    def _db(self):
        db = sqlite3.connect(self.database, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def receive(self, headers, body):
        headers = {key.lower(): value for key, value in headers.items()}
        expected = 'sha256=' + hmac.new(self.secret, body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, headers.get('x-hub-signature-256', '')):
            return 401, 'Invalid signature'
        if len(body) > 1024 * 1024:
            return 413, 'Payload too large'
        try:
            delivery = str(uuid.UUID(headers.get('x-github-delivery', '')))
            payload = json.loads(body)
            if not isinstance(payload, dict):
                raise ValueError('Expected an object')
        except (ValueError, TypeError):
            return 400, 'Invalid delivery'
        if headers.get('x-github-event') != 'issues':
            return 202, 'Ignored event'
        try:
            repo = payload['repository']['id']
            installation = payload['installation']['id']
            issue = payload['issue']
            issue_id, number = issue['id'], issue['number']
            action = payload['action']
            actor = payload['sender']['id']
            stamp = issue['updated_at']
            datetime.strptime(stamp, '%Y-%m-%dT%H:%M:%SZ')
            if any(type(x) is not int or x <= 0 for x in (repo, installation, issue_id, number, actor)):
                raise ValueError('Invalid ID')
            if 'pull_request' in issue:
                return 202, 'Ignored pull request'
        except (KeyError, TypeError, ValueError):
            return 400, 'Invalid issue event'
        if (repo, installation) != (self.policy.repository_id, self.policy.installation_id):
            return 202, 'Ignored repository or installation'
        assignee = payload.get('assignee') or {}
        if not isinstance(assignee, dict):
            return 400, 'Invalid assignee'
        if action not in ('assigned', 'unassigned', 'closed'):
            return 202, 'Ignored action'
        if action != 'closed' and assignee.get('id') != self.policy.assignee_id:
            return 202, 'Ignored assignee'
        authorized = (action == 'assigned' and actor == self.policy.owner_id and issue.get('state') == 'open')
        digest = hashlib.sha256(body).hexdigest()
        with self._db() as db:
            db.execute('BEGIN IMMEDIATE')
            previous = db.execute('SELECT digest FROM deliveries WHERE id=?', (delivery,)).fetchone()
            if previous:
                return (202, 'Duplicate') if previous['digest'] == digest else (409, 'Delivery ID conflict')
            db.execute('INSERT INTO deliveries VALUES (?,?)', (delivery, digest))
            latest = db.execute('SELECT watermark FROM issues WHERE id=?', (issue_id,)).fetchone()
            # Reject stale assignments and ambiguous same-second reassignment. Revocations
            # at the same timestamp win. A later owner reassignment can authorize a new run.
            if latest and (stamp < latest['watermark'] or (authorized and stamp == latest['watermark'])):
                return 202, 'Stale event'
            db.execute('INSERT INTO issues VALUES (?,?) ON CONFLICT(id) DO UPDATE SET watermark=excluded.watermark',
                       (issue_id, stamp))
            db.execute("UPDATE jobs SET status='cancelled', detail='Assignment revoked or replaced' "
                       "WHERE issue_id=? AND status IN ('queued','running')", (issue_id,))
            if authorized:
                db.execute('INSERT INTO jobs(id,delivery,issue_id,issue_number,assigned_at,status) VALUES (?,?,?,?,?,?)',
                           (uuid.uuid4().hex, delivery, issue_id, number, stamp, 'queued'))
        return 202, 'Queued' if authorized else 'No work authorized'

    def jobs(self):
        with self._db() as db:
            return [dict(row) for row in db.execute('SELECT * FROM jobs ORDER BY rowid')]

    def claim(self):
        with self._db() as db:
            db.execute('BEGIN IMMEDIATE')
            if db.execute("SELECT 1 FROM jobs WHERE status='running'").fetchone():
                return None
            row = db.execute("SELECT * FROM jobs WHERE status='queued' ORDER BY rowid LIMIT 1").fetchone()
            if not row:
                return None
            db.execute("UPDATE jobs SET status='running' WHERE id=?", (row['id'],))
            return {**dict(row), 'status': 'running'}

    def active(self, job_id):
        with self._db() as db:
            row = db.execute('SELECT status FROM jobs WHERE id=?', (job_id,)).fetchone()
            return bool(row and row['status'] == 'running')

    def finish(self, job_id, status, detail=''):
        if status not in ('completed', 'failed', 'cancelled'):
            raise ValueError('Invalid terminal state')
        with self._db() as db:
            db.execute("UPDATE jobs SET status=?,detail=? WHERE id=? AND status='running'", (status, detail[:500], job_id))

    def recover(self):
        """Interrupted tasks require a fresh owner assignment, never automatic replay."""
        with self._db() as db:
            db.execute("UPDATE jobs SET status='failed',detail='Service interrupted; reassign to retry' WHERE status='running'")
