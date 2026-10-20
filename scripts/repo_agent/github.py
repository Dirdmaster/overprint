"""Read-scoped installation access. App credentials stay on the controller."""
import base64
import json
import re
import subprocess
import time
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, HTTPRedirectHandler, build_opener

from .config import secret


class SafeRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Source archives redirect to codeload. Never forward App authorization.
        if not newurl.startswith('https://codeload.github.com/'):
            raise ValueError('Unexpected GitHub redirect')
        return Request(newurl, headers={'User-Agent': 'overprint-repo-agent'})


class GitHub:
    def __init__(self, config):
        self.config = config
        self.token = None
        self.expires = 0
        self.http = build_opener(SafeRedirect())

    def _request(self, path, token, data=None, limit=5 * 1024 * 1024, binary=False, deadline=None):
        deadline = deadline or time.monotonic() + 30
        if time.monotonic() >= deadline:
            raise TimeoutError('GitHub operation deadline exceeded')
        request = Request('https://api.github.com/' + path, data=None if data is None else json.dumps(data).encode(),
                          headers={'Authorization': f'Bearer {token}', 'Accept': 'application/vnd.github+json',
                                   'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28',
                                   'User-Agent': 'overprint-repo-agent'})
        try:
            with self.http.open(request, timeout=min(10, max(0.1, deadline - time.monotonic()))) as response:
                chunks = bytearray()
                while len(chunks) <= limit:
                    if time.monotonic() >= deadline:
                        raise TimeoutError('GitHub operation deadline exceeded')
                    chunk = response.read1(min(65536, limit + 1 - len(chunks)))
                    if not chunk:
                        break
                    chunks.extend(chunk)
                raw = bytes(chunks)
                if len(raw) > limit:
                    raise ValueError('GitHub response exceeded size limit')
                return raw if binary else json.loads(raw)
        except HTTPError as exc:
            # Avoid echoing request headers or response payloads into logs.
            raise RuntimeError(f'GitHub request failed: HTTP {exc.code}') from None

    def _jwt(self):
        secret(self.config.app_key_file)  # Validate ownership permissions before openssl reads it.
        def encode(value):
            return base64.urlsafe_b64encode(value).rstrip(b'=')
        now = int(time.time())
        payload = encode(b'{"alg":"RS256","typ":"JWT"}') + b'.' + encode(json.dumps(
            {'iat': now - 60, 'exp': now + 540, 'iss': str(self.config.app_id)}).encode())
        signature = subprocess.run(['openssl', 'dgst', '-sha256', '-sign', self.config.app_key_file],
                                   input=payload, capture_output=True, check=True, timeout=10).stdout
        return (payload + b'.' + encode(signature)).decode()

    def access_token(self, deadline=None):
        if not self.token or time.time() >= self.expires:
            result = self._request(f'app/installations/{self.config.installation_id}/access_tokens', self._jwt(),
                                   {'repository_ids': [self.config.repository_id],
                                    'permissions': {'contents': 'read', 'issues': 'read'}}, deadline=deadline)
            self.token = result['token']
            self.expires = time.time() + 3000
        return self.token

    def get(self, suffix, deadline=None):
        return self._request(f'repos/{self.config.repository}/{suffix}', self.access_token(deadline), deadline=deadline)

    def pages(self, suffix, max_pages=20, deadline=None):
        deadline = deadline or time.monotonic() + 30
        result = []
        for page in range(1, max_pages + 1):
            rows = self.get(f'{suffix}?per_page=100&page={page}', deadline=deadline)
            if not isinstance(rows, list):
                raise ValueError('Expected GitHub list')
            result.extend(rows)
            if len(rows) < 100:
                return result
        raise ValueError('Issue history exceeds configured pagination limit')

    def authorized_issue(self, job):
        deadline = time.monotonic() + 20
        issue = self.get(f'issues/{job["issue_number"]}', deadline=deadline)
        if (issue.get('id') != job['issue_id'] or issue.get('state') != 'open' or
                'pull_request' in issue or self.config.assignee_id not in [x['id'] for x in issue.get('assignees', [])]):
            raise ValueError('Issue assignment is no longer authorized')
        # Verify the actor behind the latest assignment, not just the current assignee.
        # This also catches missed revocation webhooks and non-owner reassignment.
        events = self.pages(f'issues/{job["issue_number"]}/events', deadline=deadline)
        relevant = [event for event in events if event.get('event') in ('assigned', 'unassigned') and
                    (event.get('assignee') or {}).get('id') == self.config.assignee_id]
        if not relevant:
            raise ValueError('Cannot establish assignment provenance')
        latest = max(relevant, key=lambda event: event['id'])
        closed_after_assignment = any(event.get('event') == 'closed' and event['id'] > latest['id'] for event in events)
        if (closed_after_assignment or latest['event'] != 'assigned' or (latest.get('actor') or {}).get('id') != self.config.owner_id or
                latest.get('created_at') != job['assigned_at']):
            raise ValueError('Assignment provenance changed; reassign to retry')
        return issue

    def context(self, job):
        issue = self.authorized_issue(job)
        comments = self.pages(f'issues/{job["issue_number"]}/comments')
        return {'issue': {'number': issue['number'], 'title': issue['title'], 'body': issue.get('body') or '',
                          'url': issue['html_url']},
                'comments': [{'author': row['user']['login'], 'body': row.get('body') or ''} for row in comments]}

    def source(self):
        repo = self._request(f'repos/{self.config.repository}', self.access_token())
        if repo['id'] != self.config.repository_id:
            raise ValueError('Repository ID does not match configuration')
        commit = self.get('commits/' + quote(repo['default_branch'], safe=''))['sha']
        if not re.fullmatch(r'[a-f0-9]{40}', commit):
            raise ValueError('Unexpected source revision')
        archive = self._request(f'repos/{self.config.repository}/tarball/{commit}', self.access_token(),
                                limit=50 * 1024 * 1024, binary=True)
        return commit, archive

    def preflight(self):
        repo = self._request(f'repos/{self.config.repository}', self.access_token())
        if repo['id'] != self.config.repository_id:
            raise ValueError('Repository identity mismatch')
        identities = {}
        for role, ident in [('owner', self.config.owner_id), ('assignee', self.config.assignee_id)]:
            user = self._request(f'user/{ident}', self.access_token())
            if user['id'] != ident:
                raise ValueError('GitHub identity mismatch')
            identities[role] = user['login']
        # 204 returns an empty response. Request it directly rather than decode JSON.
        self._request(f'repos/{self.config.repository}/assignees/{quote(identities["assignee"], safe="")}',
                      self.access_token(), binary=True)
        return {'repository': repo['full_name'], **identities, 'assignable': True}
