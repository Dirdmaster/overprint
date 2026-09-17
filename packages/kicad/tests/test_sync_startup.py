"""Automatic listener lifecycle; native smoke uses only a synthetic board."""
import importlib.util
from pathlib import Path
import sys
import threading
import types
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1] / 'overprint_export'
sys.path.insert(0, str(ROOT))
from sync_lifecycle import SyncLifecycle


class LifecycleTests(unittest.TestCase):
    def test_service_is_shared_across_plugin_module_reloads(self):
        import sync_lifecycle
        with patch.dict(sys.modules):
            sys.modules.pop('_overprint_sync_runtime', None)
            factory = Mock()
            first = sync_lifecycle.shared_service(factory)
            importlib.reload(sync_lifecycle)
            self.assertIs(sync_lifecycle.shared_service(factory), first)
            # KiCad can also import the plugin under another package name.
            spec = importlib.util.spec_from_file_location('another_sync_lifecycle', ROOT / 'sync_lifecycle.py')
            alias = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(alias)
            self.assertIs(alias.shared_service(factory), first)
            factory.assert_called_once_with()

    def test_failed_service_startup_can_retry(self):
        from sync_lifecycle import shared_service
        with patch.dict(sys.modules):
            sys.modules.pop('_overprint_sync_runtime', None)
            factory = Mock(side_effect=[RuntimeError('not ready'), object()])
            with self.assertRaises(RuntimeError):
                shared_service(factory)
            service = shared_service(factory)
            self.assertIs(shared_service(factory), service)
            self.assertEqual(factory.call_count, 2)

    def test_waits_for_board_and_reuses_listener_until_board_changes(self):
        factory = Mock(side_effect=lambda selected: Mock(stopped=lambda: False))
        lifecycle = SyncLifecycle(factory)
        self.assertIsNone(lifecycle.refresh(None))
        factory.assert_not_called()
        first = lifecycle.refresh('first-board')
        self.assertIs(first, lifecycle.refresh('first-board'))
        factory.assert_called_once_with('first-board')
        second = lifecycle.refresh('second-board')
        first.stop.assert_called_once()
        self.assertIsNot(first, second)
        lifecycle.refresh(None)
        second.stop.assert_called_once()
        self.assertIsNone(lifecycle.session)

    def test_expiry_renews_but_explicit_stop_stays_stopped(self):
        factory = Mock(side_effect=lambda selected: Mock(stopped=Mock(return_value=False)))
        lifecycle = SyncLifecycle(factory)
        old = lifecycle.refresh('board')
        old.stopped.return_value = True
        new = lifecycle.refresh('board')
        old.stop.assert_called_once()
        self.assertIsNot(old, new)
        lifecycle.stop()
        new.stop.assert_called_once()
        self.assertIsNone(lifecycle.refresh('board'))
        self.assertEqual(factory.call_count, 2)
        lifecycle.enabled = True
        self.assertIsNotNone(lifecycle.refresh('board'))
        lifecycle.stop()

    def test_failed_start_can_retry(self):
        session = Mock(stopped=lambda: False)
        lifecycle = SyncLifecycle(Mock(side_effect=[OSError('socket unavailable'), session]))
        with self.assertRaises(OSError):
            lifecycle.refresh('board')
        self.assertIsNone(lifecycle.session)
        self.assertIs(lifecycle.refresh('board'), session)
        lifecycle.stop()

    def test_native_start_is_silent_idempotent_and_window_close_keeps_listener(self):
        try:
            import test_export as fixture
        except ImportError:
            self.skipTest('Requires KiCad bundled Python and a desktop session.')
        from test_sync import request
        package = types.ModuleType('overprint_startup_test')
        package.__path__ = [str(ROOT)]
        with patch.dict(sys.modules, {'overprint_startup_test': package}):
            spec = importlib.util.spec_from_file_location('overprint_startup_test.sync_ui', ROOT / 'sync_ui.py')
            ui = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(ui)
        board = fixture.ExportTests().board()
        app = fixture.wx.GetApp()
        config = Mock(Read=Mock(return_value='http://127.0.0.1:4317'))
        with patch.object(ui.wx, 'Config', return_value=config), patch.object(ui.pcbnew, 'GetBoard', return_value=board), patch.object(ui, 'export_board') as export, patch.object(ui.wx, 'MessageBox') as message:
            service = ui.start_sync()
            try:
                self.assertIs(ui.start_sync(), service)
                session = service.lifecycle.session
                self.assertIsNotNone(session)
                self.assertIsNone(service.dialog)
                export.assert_not_called()
                message.assert_not_called()
                self.assertEqual(request(session)[0], 200)
                self.assertEqual(request(session, headers={'Authorization': None})[0], 401)
                with patch.object(ui.wx, 'Dialog', side_effect=AssertionError('No approval for configured origin')):
                    for origin in ui.LOCAL_APP_ORIGINS:
                        self.assertTrue(service.approve(origin, ui.board_identity(board), lambda: False))
                        status, _, body = request(session, path='/v1/discover', headers={
                            'Origin': origin, 'Authorization': None, 'X-Overprint-Pairing': '1'})
                        self.assertEqual(status, 200)
                        import json
                        self.assertEqual(json.loads(body)['boardName'], session.board_name)
                        self.assertFalse(json.loads(body)['requiresApproval'])
                    self.assertFalse(service.is_trusted_origin('http://localhost:4318'))
                    self.assertFalse(service.is_trusted_origin('https://localhost:3000'))
                    self.assertFalse(service.is_trusted_origin('http://localhost.attacker.example:3000'))
                    self.assertFalse(service.approve(service.origin, ui.board_identity(board), lambda: True))
                dialog = ui.SyncDialog(service)
                service.dialog = dialog
                service.refresh()
                session.origin = 'https://approved.example'
                service.refresh()
                self.assertEqual(service.origin, 'http://127.0.0.1:4317')
                self.assertIn(session.origin, dialog.origin_label.GetLabel())
                cancelled = threading.Event()
                cancel_timer = fixture.wx.CallLater(50, cancelled.set)
                self.assertFalse(service.approve('https://other.example', ui.board_identity(board), cancelled.is_set))
                self.assertFalse(service.approving)
                cancel_timer.Stop()
                def allow_connection():
                    for window in fixture.wx.GetTopLevelWindows():
                        if window.GetTitle() == 'Connect to Overprint' and window.IsModal():
                            window.EndModal(fixture.wx.ID_YES)
                approve_timer = fixture.wx.CallLater(50, allow_connection)
                self.assertTrue(service.approve('https://other.example', ui.board_identity(board), lambda: False))
                approve_timer.Stop()
                config.Write.assert_called_with('sync/origin', 'https://other.example')
                config.Flush.assert_called_once()
                dialog.close(None)
                self.assertIsNone(service.dialog)
                self.assertEqual(request(session)[0], 200)
                service.lifecycle.stop()
                service.refresh()
                self.assertIsNone(service.lifecycle.session)
            finally:
                service.timer.Stop()
                service.lifecycle.stop()
                sys.modules.pop('_overprint_sync_runtime', None)
