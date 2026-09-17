"""Loopback HTTP security and private snapshot tests. No open user PCB is touched."""
import hashlib
import http.client
import json
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
import zipfile
from io import BytesIO

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'overprint_export'))
from sync import LOCAL_APP_ORIGINS, is_trusted_origin, DEFAULT_ORIGIN, SyncError, SyncSession, normalize_origin, snapshot_board


def dispatch_thread(work):
    threading.Thread(target=work, daemon=True).start()


def request(session, method='GET', path='/v1/status', headers=None, body=None):
    connection = http.client.HTTPConnection('127.0.0.1', session.server.server_port, timeout=3)
    values = {'Origin': session.origin, 'Authorization': f'Bearer {session.token}'}
    values.update(headers or {})
    values = {name: value for name, value in values.items() if value is not None}
    try:
        connection.request(method, path, body=body, headers=values)
        response = connection.getresponse()
        return response.status, dict(response.getheaders()), response.read()
    finally:
        connection.close()


class SyncTests(unittest.TestCase):
    def session(self, capture=lambda cancelled: b'PK-synthetic-package', **options):
        session = SyncSession('http://127.0.0.1:4317', 'Synthetic PCB', capture, dispatch_thread, **options)
        self.addCleanup(session.stop)
        return session

    def test_local_app_addresses_need_no_native_approval(self):
        for origin in LOCAL_APP_ORIGINS:
            self.assertTrue(is_trusted_origin(origin, 'https://configured.example'))
        self.assertTrue(is_trusted_origin('https://configured.example', 'https://configured.example'))
        for origin in ['http://localhost:4318', 'https://localhost:3000',
                       'http://localhost.attacker.example:3000', 'https://other.example']:
            self.assertFalse(is_trusted_origin(origin, DEFAULT_ORIGIN))

    def test_hosted_app_trust_is_limited_to_exact_https_origin(self):
        self.assertTrue(is_trusted_origin('https://overprint.ink', DEFAULT_ORIGIN))
        for origin in ['http://overprint.ink', 'https://www.overprint.ink',
                       'https://overprint.ink.attacker.example', 'https://overprint.ink:8443']:
            self.assertFalse(is_trusted_origin(origin, DEFAULT_ORIGIN))

    def test_authorized_session_and_snapshot_have_bounded_contract(self):
        session = self.session()
        self.assertEqual(session.server.server_address[0], '127.0.0.1')
        code = json.loads(session.pairing_code())
        self.assertEqual(code['version'], 1)
        self.assertEqual(code['url'], session.url)
        self.assertNotIn(session.token, session.url)
        status, headers, body = request(session)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)['boardName'], 'Synthetic PCB')
        self.assertEqual(json.loads(body)['boardId'], session.board_id)
        self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertEqual(headers['Access-Control-Allow-Origin'], session.origin)
        status, headers, data = request(session, 'POST', '/v1/snapshot')
        self.assertEqual(status, 200)
        self.assertEqual(data, b'PK-synthetic-package')
        self.assertEqual(headers['X-Overprint-Sha256'], hashlib.sha256(data).hexdigest())
        self.assertEqual(headers['X-Overprint-Board-Id'], session.board_id)

    def test_discovery_and_native_approval_connect_without_a_copied_code(self):
        approvals, exports = [], []
        session = self.session(lambda cancelled: exports.append(True) or b'board',
            approve=lambda origin, cancelled: approvals.append(origin) or True)
        browser = 'https://overprint.example'
        headers = {'Origin': browser, 'Authorization': None, 'X-Overprint-Pairing': '1'}
        status, _, body = request(session, path='/v1/discover', headers=headers)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), {'service': 'overprint-sync', 'version': 3, 'requiresApproval': True})
        self.assertNotIn(session.token.encode(), body)
        self.assertEqual(approvals, [])
        status, response_headers, body = request(session, 'POST', '/v1/pair', headers=headers)
        self.assertEqual(status, 200)
        pairing = json.loads(body)
        self.assertEqual(pairing['origin'], browser)
        self.assertEqual(pairing['token'], session.token)
        self.assertEqual(response_headers['Access-Control-Allow-Origin'], browser)
        self.assertEqual(approvals, [browser])
        self.assertEqual(exports, [])
        self.assertEqual(request(session)[0], 200)

    def test_only_configured_origin_can_discover_board_names(self):
        session = self.session(approve=lambda origin, cancelled: True,
                               trusted=lambda origin: origin == DEFAULT_ORIGIN)
        headers = {'Authorization': None, 'X-Overprint-Pairing': '1'}
        status, _, body = request(session, path='/v1/discover', headers=headers)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)['boardName'], 'Synthetic PCB')
        self.assertFalse(json.loads(body)['requiresApproval'])
        self.assertNotIn(session.token.encode(), body)
        for origin in ['https://other.example', 'http://127.0.0.1:4318']:
            _, _, body = request(session, path='/v1/discover', headers={**headers, 'Origin': origin})
            self.assertNotIn('boardName', json.loads(body))
            self.assertTrue(json.loads(body)['requiresApproval'])

    def test_pairing_requires_preflight_header_valid_origin_and_explicit_approval(self):
        approvals = []
        session = self.session(approve=lambda origin, cancelled: approvals.append(origin) or False)
        headers = {'Authorization': None, 'X-Overprint-Pairing': '1'}
        for changes, expected in [({'X-Overprint-Pairing': None}, 403),
                ({'Origin': 'null'}, 403), ({'Origin': 'file:///private/board'}, 403),
                ({'Host': 'attacker.example'}, 403), ({'Content-Length': '1'}, 400)]:
            self.assertEqual(request(session, 'POST', '/v1/pair', {**headers, **changes})[0], expected)
        self.assertEqual(approvals, [])
        preflight = {**headers, 'Origin': 'https://new.example', 'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'x-overprint-pairing'}
        self.assertEqual(request(session, 'OPTIONS', '/v1/pair', preflight)[0], 204)
        status, _, body = request(session, 'POST', '/v1/pair', headers)
        self.assertEqual(status, 403)
        self.assertNotIn(session.token.encode(), body)
        self.assertEqual(request(session, 'POST', '/v1/pair', headers)[0], 429)
        self.assertEqual(len(approvals), 1)

    def test_expired_approval_cannot_issue_token_or_open_another_prompt(self):
        started, release = threading.Event(), threading.Event()
        def approve(origin, cancelled):
            started.set()
            release.wait(2)
            return True
        session = self.session(approve=approve, request_timeout=0.1)
        headers = {'Authorization': None, 'X-Overprint-Pairing': '1', 'Origin': 'https://new.example'}
        outcome = []
        worker = threading.Thread(target=lambda: outcome.append(request(session, 'POST', '/v1/pair', headers)))
        worker.start()
        self.assertTrue(started.wait(1))
        self.assertEqual(request(session, 'POST', '/v1/pair', headers)[0], 409)
        worker.join(1)
        self.assertEqual(outcome[0][0], 408)
        self.assertNotIn(session.token.encode(), outcome[0][2])
        self.assertEqual(session.origin, DEFAULT_ORIGIN)
        # Native dialog still open: a timeout must not allow another dialog.
        self.assertEqual(request(session, 'POST', '/v1/pair', headers)[0], 409)
        release.set()

    def test_board_session_stop_during_approval_does_not_grant_access(self):
        started, release = threading.Event(), threading.Event()
        def approve(origin, cancelled):
            started.set()
            release.wait(2)
            return True
        session = self.session(approve=approve)
        headers = {'Authorization': None, 'X-Overprint-Pairing': '1'}
        outcome = []
        worker = threading.Thread(target=lambda: outcome.append(request(session, 'POST', '/v1/pair', headers)))
        worker.start()
        self.assertTrue(started.wait(1))
        session.stop()
        release.set()
        worker.join(1)
        self.assertIn(outcome[0][0], (408, 410))
        self.assertNotIn(session.token.encode(), outcome[0][2])

    def test_disconnecting_browser_cancels_pending_native_approval(self):
        started, dismissed = threading.Event(), threading.Event()
        def approve(origin, cancelled):
            started.set()
            until = time.monotonic() + 2
            while not cancelled() and time.monotonic() < until:
                time.sleep(0.01)
            if cancelled():
                dismissed.set()
            return True  # Even a late approval must not rebind the origin.
        session = self.session(approve=approve)
        previous = session.token
        connection = http.client.HTTPConnection('127.0.0.1', session.server.server_port, timeout=3)
        connection.request('POST', '/v1/pair', headers={
            'Origin': 'https://new.example', 'X-Overprint-Pairing': '1'})
        self.assertTrue(started.wait(1))
        connection.close()
        self.assertTrue(dismissed.wait(1))
        self.assertEqual(session.origin, DEFAULT_ORIGIN)
        self.assertEqual(session.token, previous)

    def test_listener_uses_next_port_when_one_is_occupied(self):
        first = self.session()
        second = self.session(ports=(first.server.server_port, 0))
        self.assertNotEqual(first.server.server_port, second.server.server_port)
        self.assertEqual(request(second)[0], 200)

    def test_origin_host_and_secret_are_all_required(self):
        session = self.session()
        for headers, expected in [
            ({'Origin': None}, 403), ({'Origin': 'null'}, 403),
            ({'Origin': 'https://unpaired.example'}, 403),
            ({'Origin': session.origin + '.attacker.example'}, 403),
            ({'Host': f'localhost:{session.server.server_port}'}, 403),
            ({'Host': 'attacker.example'}, 403),
            ({'Authorization': None}, 401), ({'Authorization': 'Bearer wrong'}, 401),
            ({'Authorization': 'Bearer é'}, 401),
        ]:
            with self.subTest(headers=headers):
                status, response_headers, _ = request(session, headers=headers)
                self.assertEqual(status, expected)
                if headers.get('Origin', session.origin) != session.origin:
                    self.assertNotIn('Access-Control-Allow-Origin', response_headers)

    def test_duplicate_security_headers_and_request_bodies_are_rejected(self):
        session = self.session()
        connection = http.client.HTTPConnection('127.0.0.1', session.server.server_port, timeout=3)
        connection.putrequest('GET', '/v1/status', skip_host=True)
        connection.putheader('Host', session.host)
        connection.putheader('Origin', session.origin)
        connection.putheader('Origin', session.origin)
        connection.putheader('Authorization', f'Bearer {session.token}')
        connection.endheaders()
        self.assertEqual(connection.getresponse().status, 400)
        connection.close()
        for headers in [{'Content-Length': '10000000'}, {'Transfer-Encoding': 'chunked'}]:
            self.assertEqual(request(session, 'POST', '/v1/snapshot', headers=headers)[0], 400)
        self.assertEqual(request(session, 'POST', '/v1/snapshot', body=b'x')[0], 400)
        for path in ['/v1/snapshot?path=/etc/passwd', '/../../etc/passwd', f'/v1/status?token={session.token}']:
            self.assertEqual(request(session, path=path)[0], 404)

    def test_cors_preflight_accepts_only_paired_origin_and_fixed_routes(self):
        session = self.session()
        headers = {'Authorization': None, 'Access-Control-Request-Method': 'POST',
                   'Access-Control-Request-Headers': 'authorization, content-type',
                   'Access-Control-Request-Private-Network': 'true'}
        status, response_headers, body = request(session, 'OPTIONS', '/v1/snapshot', headers)
        self.assertEqual(status, 204)
        self.assertEqual(body, b'')
        self.assertEqual(response_headers['Access-Control-Allow-Private-Network'], 'true')
        self.assertNotIn(session.token, str(response_headers))
        for changes in [{'Origin': 'https://other.example'}, {'Access-Control-Request-Method': 'DELETE'},
                        {'Access-Control-Request-Headers': 'x-shell-command'}]:
            self.assertEqual(request(session, 'OPTIONS', '/v1/snapshot', {**headers, **changes})[0], 403)

    def test_timeout_does_not_permit_overlapping_native_exports(self):
        started, release, finished = threading.Event(), threading.Event(), threading.Event()
        def capture(cancelled):
            started.set()
            release.wait(2)
            finished.set()
            return b'not sent after timeout'
        session = self.session(capture, request_timeout=0.1)
        outcome = []
        worker = threading.Thread(target=lambda: outcome.append(request(session, 'POST', '/v1/snapshot')))
        worker.start()
        self.assertTrue(started.wait(1))
        self.assertEqual(request(session, 'POST', '/v1/snapshot')[0], 409)
        worker.join(1)
        self.assertEqual(outcome[0][0], 504)
        self.assertNotIn(b'not sent', outcome[0][2])
        self.assertEqual(request(session, 'POST', '/v1/snapshot')[0], 409)
        release.set()
        self.assertTrue(finished.wait(1))

    def test_stop_and_expiry_revoke_connection_and_tokens_rotate(self):
        session = self.session(ttl=0.1)
        self.assertTrue(session.closed.wait(1))
        session.thread.join(1)
        with self.assertRaises(OSError):
            request(session)
        second = self.session()
        self.assertNotEqual(second.token, session.token)
        second.stop()
        with self.assertRaises(OSError):
            request(second)

    def test_queued_work_does_not_read_board_after_timeout_or_stop(self):
        callbacks, reads = [], []
        session = SyncSession('http://127.0.0.1:4317', 'Queue test', lambda cancelled: reads.append(True) or b'board', callbacks.append, request_timeout=0.05)
        self.addCleanup(session.stop)
        self.assertEqual(request(session, 'POST', '/v1/snapshot')[0], 504)
        self.assertEqual(len(callbacks), 1)
        session.stop()
        callbacks[0]()
        self.assertEqual(reads, [])

    def test_export_failure_does_not_disclose_native_paths(self):
        def failed(cancelled):
            raise ValueError('/private/customer/secret.kicad_pcb')
        session = self.session(failed)
        status, _, body = request(session, 'POST', '/v1/snapshot')
        self.assertEqual(status, 500)
        self.assertNotIn(b'/private', body)

    def test_stop_cancels_pending_reply_and_package_size_is_enforced(self):
        started, release = threading.Event(), threading.Event()
        def capture(cancelled):
            started.set()
            release.wait(2)
            return b'private board'
        session = self.session(capture)
        outcome = []
        worker = threading.Thread(target=lambda: outcome.append(request(session, 'POST', '/v1/snapshot')))
        worker.start()
        self.assertTrue(started.wait(1))
        session.stop()
        worker.join(1)
        self.assertEqual(outcome[0][0], 410)
        self.assertNotIn(b'private board', outcome[0][2])
        release.set()
        second = self.session()
        with patch('sync.MAX_PACKAGE_BYTES', 4):
            self.assertEqual(request(second, 'POST', '/v1/snapshot')[0], 413)

    def test_board_switch_and_size_errors_remove_private_temporary_files(self):
        current, paths = [object()], []
        selected = current[0]
        def export(board, path):
            paths.append(path)
            path.write_bytes(b'package')
        capture = lambda: snapshot_board(lambda: current[0], id, id(selected), export, lambda: False)
        self.assertEqual(capture(), b'package')
        self.assertFalse(paths[0].parent.exists())
        current[0] = object()
        with self.assertRaisesRegex(SyncError, 'open PCB changed'):
            capture()
        self.assertEqual(len(paths), 1)
        current[0] = selected
        def switch_during_export(board, path):
            export(board, path)
            current[0] = object()
        with self.assertRaisesRegex(SyncError, 'open PCB changed'):
            snapshot_board(lambda: current[0], id, id(selected), switch_during_export, lambda: False)
        self.assertFalse(paths[-1].parent.exists())
        current[0] = selected
        with patch('sync.MAX_PACKAGE_BYTES', 4):
            with self.assertRaisesRegex(SyncError, '25 MB'):
                capture()
        self.assertFalse(paths[-1].parent.exists())

    def test_origin_configuration_is_one_exact_origin(self):
        self.assertEqual(normalize_origin('https://Example.org:443/'), 'https://example.org')
        for value in ['*', 'null', 'file:///tmp/board', 'https://user:pass@example.org',
                      'https://example.org/page', 'https://example.org?token=x', 'https://example.org#x', 'https://example.org:bad']:
            with self.assertRaises(ValueError):
                normalize_origin(value)

    def test_unsaved_board_snapshot_runs_on_gui_thread_without_saving_source(self):
        try:
            import test_export as fixture
        except ImportError:
            self.skipTest('Run with KiCad bundled Python for the native GUI-thread snapshot test.')
        pcb, wx = fixture.pcb, fixture.wx
        from models import _serialize
        board = fixture.ExportTests().board()
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'source.kicad_pcb'
            board.SetFileName(str(source))
            source.write_bytes(_serialize(board))
            saved = source.read_bytes()
            pad = next(iter(next(iter(board.GetFootprints())).Pads()))
            pad.SetPosition(pcb.VECTOR2I(pcb.FromMM(19), pcb.FromMM(31)))
            unsaved = _serialize(board)
            calls = []
            def capture(cancelled):
                calls.append(wx.IsMainThread())
                return snapshot_board(lambda: board, lambda b: b.m_Uuid.AsString(), board.m_Uuid.AsString(), fixture.export_board, cancelled)
            session = SyncSession('http://127.0.0.1:4317', 'Native test', capture, wx.CallAfter)
            self.addCleanup(session.stop)
            outcome = []
            worker = threading.Thread(target=lambda: outcome.append(request(session, 'POST', '/v1/snapshot')))
            worker.start()
            deadline = time.monotonic() + 5
            while worker.is_alive() and time.monotonic() < deadline:
                wx.GetApp().Yield()
                time.sleep(0.005)
            worker.join(1)
            self.assertFalse(worker.is_alive())
            self.assertEqual(calls, [True])
            self.assertEqual(outcome[0][0], 200)
            with zipfile.ZipFile(BytesIO(outcome[0][2])) as archive:
                geometry = json.loads(archive.read('geometry.json'))
                self.assertEqual(geometry['pads'][0]['positionMm'], [19.0, 31.0])
            self.assertEqual(source.read_bytes(), saved)
            self.assertEqual(_serialize(board), unsaved)


if __name__ == '__main__':
    unittest.main()
