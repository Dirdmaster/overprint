"""Opt-in, authenticated loopback transport for one selected KiCad board.

This module has no KiCad or wx imports. The action supplies a GUI-thread
dispatcher and snapshot callback; HTTP threads never touch native board state.
"""
from datetime import datetime, timezone
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import secrets
import select
import socket
import tempfile
import threading
import time
from urllib.parse import urlsplit

DEFAULT_ORIGIN = 'http://127.0.0.1:4317'
HOSTED_APP_ORIGIN = 'https://overprint.ink'
# Supported local app entry points: Nuxt development and standalone.
LOCAL_APP_ORIGINS = frozenset(f'http://{host}:{port}'
    for host in ('127.0.0.1', 'localhost') for port in (3000, 4317))
MAX_PACKAGE_BYTES = 25_000_000
SESSION_SECONDS = 30 * 60
REQUEST_SECONDS = 75
DISCOVERY_PORTS = range(43190, 43200)


def is_trusted_origin(origin, configured):
    return origin == configured or origin == HOSTED_APP_ORIGIN or origin in LOCAL_APP_ORIGINS


class SyncError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def normalize_origin(value):
    """Accept one HTTP origin, never a URL path, credentials, or wildcard."""
    value = value.strip()
    try:
        parsed = urlsplit(value)
        port = parsed.port
        if (parsed.scheme not in ('http', 'https') or not parsed.hostname
                or parsed.username is not None or parsed.password is not None
                or parsed.path not in ('', '/') or parsed.query or parsed.fragment
                or '*' in value or any(c.isspace() for c in value)):
            raise ValueError()
        host = parsed.hostname.lower()
        if ':' in host:
            host = f'[{host}]'
        if port is not None and port != {'http': 80, 'https': 443}[parsed.scheme]:
            host += f':{port}'
        return f'{parsed.scheme}://{host}'
    except ValueError:
        raise ValueError('Enter only the Overprint origin, such as http://127.0.0.1:4317, without a page path.') from None


def snapshot_board(get_board, identity, selected, exporter, cancelled):
    """Called on the GUI thread. Export only the still-selected in-memory board."""
    def current_board():
        if cancelled():
            raise SyncError(410, 'This sync request has ended.')
        board = get_board()
        if board is None or identity(board) != selected:
            raise SyncError(409, 'The open PCB changed. Start a new connection in KiCad.')
        return board

    board = current_board()
    with tempfile.TemporaryDirectory(prefix='overprint-sync-') as directory:
        destination = Path(directory) / 'board.overprint-board'
        exporter(board, destination)
        current_board()
        if destination.stat().st_size > MAX_PACKAGE_BYTES:
            raise SyncError(413, 'The board package exceeds the 25 MB sync limit.')
        with destination.open('rb') as source:
            data = source.read(MAX_PACKAGE_BYTES + 1)
        if len(data) > MAX_PACKAGE_BYTES:
            raise SyncError(413, 'The board package exceeds the 25 MB sync limit.')
        return data


class _Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False
    request_queue_size = 4

    def __init__(self, session):
        self.session = session
        self.workers = threading.BoundedSemaphore(4)
        for port in session.ports:
            try:
                super().__init__(('127.0.0.1', port), _Handler)
                break
            except OSError:
                if port == session.ports[-1]:
                    raise

    def process_request(self, request, client_address):
        if not self.workers.acquire(blocking=False):
            request.close()
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self.workers.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.workers.release()

    def handle_error(self, request, client_address):
        # No request details, pairing secrets, board data or local paths in logs.
        pass


class SyncSession:
    def __init__(self, origin, board_name, capture, dispatch, *, ttl=SESSION_SECONDS, request_timeout=REQUEST_SECONDS, approve=None, trusted=None, ports=(0,)):
        self.ports = tuple(ports)
        if not self.ports:
            raise ValueError("At least one listening port is required.")
        self.approve = approve
        self.trusted = trusted or (lambda origin: False)
        self.pair_lock = threading.Lock()
        self.next_pair_at = 0
        self.origin = normalize_origin(origin)
        self.board_name = board_name
        self.capture = capture
        self.dispatch = dispatch
        self.request_timeout = request_timeout
        self.token = secrets.token_urlsafe(32)
        self.board_id = secrets.token_urlsafe(16)
        self.expires_at = datetime.fromtimestamp(time.time() + ttl, timezone.utc).isoformat()
        self.deadline = time.monotonic() + ttl
        self.closed = threading.Event()
        self.export_lock = threading.Lock()
        self.server = _Server(self)
        self.host = f'127.0.0.1:{self.server.server_port}'
        self.url = f'http://{self.host}'
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={'poll_interval': 0.1}, daemon=True)
        self.thread.start()
        self.timer = threading.Timer(ttl, self.stop)
        self.timer.daemon = True
        self.timer.start()

    def pairing_code(self):
        return json.dumps(dict(version=1, url=self.url, token=self.token, origin=self.origin), separators=(',', ':'))

    def stopped(self):
        return self.closed.is_set() or time.monotonic() >= self.deadline

    def stop(self):
        if self.closed.is_set():
            return
        self.closed.set()
        self.timer.cancel()
        self.server.shutdown()
        self.server.server_close()

    def pair(self, origin, disconnected=lambda: False):
        if self.approve is None:
            raise SyncError(404, 'Update the Overprint plugin to connect automatically.')
        if not self.pair_lock.acquire(blocking=False):
            raise SyncError(409, 'A connection request is already waiting in KiCad.')
        done, cancelled = threading.Event(), threading.Event()
        result = {}
        dispatched = False

        def is_cancelled():
            return cancelled.is_set() or self.stopped() or disconnected()

        def work():
            try:
                if not is_cancelled():
                    result['approved'] = bool(self.approve(origin, is_cancelled))
            except Exception:
                result['approved'] = False
            finally:
                # Keep the lock until the native dialog is actually closed.
                self.pair_lock.release()
                done.set()

        try:
            if time.monotonic() < self.next_pair_at:
                raise SyncError(429, 'Wait a few seconds before requesting another connection.')
            self.next_pair_at = time.monotonic() + 5
            self.dispatch(work)
            dispatched = True
            deadline = time.monotonic() + self.request_timeout
            while not done.wait(0.05):
                if is_cancelled() or time.monotonic() >= deadline:
                    raise SyncError(408, 'Connection approval timed out. Try Sync again.')
            if is_cancelled():
                raise SyncError(410, 'The KiCad session ended. Try Sync again.')
            if not result.get('approved'):
                raise SyncError(403, 'The connection was declined in KiCad.')
            # Only an explicit native approval can grant another website access.
            if self.origin != origin:
                self.origin = origin
                self.token = secrets.token_urlsafe(32)
            return self.pairing_code().encode()
        finally:
            cancelled.set()
            if not dispatched:
                self.pair_lock.release()

    def snapshot(self):
        if self.stopped():
            raise SyncError(410, 'This connection expired. Start a new connection in KiCad.')
        if not self.export_lock.acquire(blocking=False):
            raise SyncError(409, 'KiCad is already exporting a board. Wait for it to finish.')
        done = threading.Event()
        cancelled = threading.Event()
        result = {}

        def is_cancelled():
            return cancelled.is_set() or self.stopped()

        def work():
            try:
                if is_cancelled():
                    return
                data = self.capture(is_cancelled)
                if len(data) > MAX_PACKAGE_BYTES:
                    raise SyncError(413, 'The board package exceeds the 25 MB sync limit.')
                if not is_cancelled():
                    result['data'] = data
            except SyncError as error:
                result['error'] = error
            except Exception:
                result['error'] = SyncError(500, 'KiCad could not export the board. Try Export to Overprint in KiCad for details.')
            finally:
                self.export_lock.release()
                done.set()

        try:
            self.dispatch(work)
        except Exception:
            self.export_lock.release()
            raise SyncError(500, 'KiCad could not schedule this export.') from None
        deadline = time.monotonic() + self.request_timeout
        while not done.wait(0.05):
            if self.stopped() or time.monotonic() >= deadline:
                cancelled.set()
                status = 410 if self.stopped() else 504
                raise SyncError(status, 'This sync request ended. KiCad may still be finishing its export.')
        if self.stopped():
            raise SyncError(410, 'This connection has ended.')
        if 'error' in result:
            raise result['error']
        if 'data' not in result:
            raise SyncError(410, 'This sync request has ended.')
        return result['data']


class _Handler(BaseHTTPRequestHandler):
    server_version = 'OverprintSync/1'
    sys_version = ''

    def setup(self):
        self.request.settimeout(3)
        super().setup()

    def log_message(self, format, *args):
        pass

    def _reply(self, status, data, content_type='application/json', headers=None):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Connection', 'close')
        self.send_header('X-Content-Type-Options', 'nosniff')
        cors_origin = getattr(self, 'cors_origin', None)
        if cors_origin:
            self.send_header('Access-Control-Allow-Origin', cors_origin)
            self.send_header('Vary', 'Origin')
            self.send_header('Access-Control-Expose-Headers', 'X-Overprint-Board-Id, X-Overprint-Sha256')
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(data)
        self.close_connection = True

    def _error(self, error):
        self._reply(error.status, json.dumps({'error': str(error)}).encode())

    def _check(self, authenticate=True, bootstrap=False):
        session = self.server.session
        for name in ['Host', 'Origin', 'Authorization', 'Content-Length', 'Transfer-Encoding', 'X-Overprint-Pairing']:
            if len(self.headers.get_all(name, [])) > 1:
                raise SyncError(400, 'Duplicate request headers are not accepted.')
        if self.headers.get('Host') != session.host:
            raise SyncError(403, 'This request host is not allowed.')
        origin = self.headers.get('Origin', '')
        if bootstrap:
            try:
                if normalize_origin(origin) != origin:
                    raise ValueError()
            except ValueError:
                raise SyncError(403, 'A valid browser origin is required.') from None
        elif origin != session.origin:
            raise SyncError(403, 'This browser origin is not paired.')
        self.cors_origin = origin
        if bootstrap and self.command != 'OPTIONS' and self.headers.get('X-Overprint-Pairing') != '1':
            raise SyncError(403, 'Use Overprint to request a connection.')
        if session.stopped():
            raise SyncError(410, 'This connection has ended.')
        if authenticate and not hmac.compare_digest(self.headers.get('Authorization', '').encode('utf-8'), f'Bearer {session.token}'.encode('ascii')):
            raise SyncError(401, 'This pairing code is invalid.')
        if self.headers.get('Transfer-Encoding') or self.headers.get('Content-Length', '0') != '0':
            raise SyncError(400, 'Sync requests must have an empty body.')

    def do_OPTIONS(self):
        try:
            self._check(authenticate=False, bootstrap=self.path in ('/v1/discover', '/v1/pair'))
            method = self.headers.get('Access-Control-Request-Method')
            allowed = {'/v1/status': 'GET', '/v1/snapshot': 'POST', '/v1/discover': 'GET', '/v1/pair': 'POST'}
            requested_headers = {h.strip().lower() for h in self.headers.get('Access-Control-Request-Headers', '').split(',') if h.strip()}
            if allowed.get(self.path) != method or not requested_headers <= {'authorization', 'content-type', 'x-overprint-pairing'}:
                raise SyncError(403, 'This sync preflight is not allowed.')
            self._reply(204, b'', headers={
                'Access-Control-Allow-Methods': method,
                'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Overprint-Pairing',
                'Access-Control-Allow-Private-Network': 'true',
                'Access-Control-Max-Age': '60',
            })
        except SyncError as error:
            self._error(error)

    def do_GET(self):
        try:
            if self.path == '/v1/discover':
                self._check(authenticate=False, bootstrap=True)
                if self.server.session.approve is None:
                    raise SyncError(404, 'Automatic connection is not available.')
                session = self.server.session
                trusted = session.trusted(self.headers['Origin'])
                details = dict(service='overprint-sync', version=3, requiresApproval=not trusted)
                if trusted:
                    details['boardName'] = session.board_name
                    details['boardId'] = session.board_id
                self._reply(200, json.dumps(details).encode())
                return
            self._check()
            if self.path != '/v1/status':
                raise SyncError(404, 'Unknown sync endpoint.')
            session = self.server.session
            self._reply(200, json.dumps(dict(version=1, boardId=session.board_id, boardName=session.board_name, expiresAt=session.expires_at)).encode())
        except SyncError as error:
            self._error(error)

    def _client_disconnected(self):
        # Pairing has no request body. EOF means the browser aborted its fetch.
        try:
            readable, _, _ = select.select([self.connection], [], [], 0)
            return bool(readable) and self.connection.recv(1, socket.MSG_PEEK) == b''
        except OSError:
            return True

    def do_POST(self):
        try:
            if self.path == '/v1/pair':
                self._check(authenticate=False, bootstrap=True)
                self._reply(200, self.server.session.pair(self.headers['Origin'], self._client_disconnected))
                return
            self._check()
            if self.path != '/v1/snapshot':
                raise SyncError(404, 'Unknown sync endpoint.')
            data = self.server.session.snapshot()
            self._reply(200, data, 'application/zip', {
                'X-Overprint-Board-Id': self.server.session.board_id,
                'X-Overprint-Sha256': hashlib.sha256(data).hexdigest(),
            })
        except SyncError as error:
            self._error(error)
