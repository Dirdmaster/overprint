"""Automatic loopback startup, explicit pairing, and GUI-thread board capture."""
import atexit
from pathlib import Path

import pcbnew
import wx

from .exporter import export_board
from .sync import DEFAULT_ORIGIN, LOCAL_APP_ORIGINS, DISCOVERY_PORTS, SyncSession, is_trusted_origin, normalize_origin, snapshot_board
from .sync_lifecycle import SyncLifecycle, shared_service


def board_identity(board):
    # Never retain/dereference a SWIG board after the editor may have closed it.
    pointer = board.this
    while hasattr(pointer, 'this'):
        pointer = pointer.this
    return (int(pointer), board.m_Uuid.AsString(), board.GetFileName())


class SyncService(wx.EvtHandler):
    def __init__(self):
        super().__init__()
        self.config = wx.Config('Overprint')
        try:
            self.origin = normalize_origin(self.config.Read('sync/origin', DEFAULT_ORIGIN))
        except ValueError:
            self.origin = DEFAULT_ORIGIN
        self.dialog = None
        self.approving = False
        self.lifecycle = SyncLifecycle(self.create_session)
        self.timer = wx.Timer(self)
        self.Bind(wx.EVT_TIMER, self.refresh, self.timer)
        self.timer.Start(1000)
        atexit.register(self.lifecycle.stop)
        self.refresh()

    def create_session(self, identity):
        name = Path(identity[2]).stem or 'Untitled'
        return SyncSession(self.origin, name,
            lambda cancelled: snapshot_board(pcbnew.GetBoard, board_identity, identity, export_board, cancelled), wx.CallAfter,
            ports=DISCOVERY_PORTS, trusted=self.is_trusted_origin, approve=lambda origin, cancelled: self.approve(origin, identity, cancelled))

    def is_trusted_origin(self, origin):
        return is_trusted_origin(origin, self.origin)

    def approve(self, origin, selected, cancelled):
        def still_current():
            board = pcbnew.GetBoard()
            return not cancelled() and board is not None and board_identity(board) == selected
        if self.approving or not still_current():
            return False
        if self.is_trusted_origin(origin):
            return True
        name = Path(selected[2]).stem or 'Untitled'
        # Use a wx dialog: macOS native MessageDialog does not reliably pump
        # wx timers while modal, so it cannot dismiss on browser cancellation.
        with wx.Dialog(None, title='Connect to Overprint') as dialog:
            layout = wx.BoxSizer(wx.VERTICAL)
            text = wx.StaticText(dialog, label=f'{origin} wants to sync PCB “{name}” with Overprint.\n\n'
                'Allow it to read board geometry, fabrication files and available 3D models?\n'
                'This address will be remembered for future connections.\n'
                'Your KiCad board will not be changed.')
            text.Wrap(500)
            layout.Add(text, 0, wx.ALL, 16)
            buttons = wx.BoxSizer(wx.HORIZONTAL)
            deny = wx.Button(dialog, wx.ID_CANCEL, label='Decline')
            allow = wx.Button(dialog, wx.ID_YES, label='Allow connection')
            buttons.Add(deny, 0, wx.RIGHT, 8)
            buttons.Add(allow)
            layout.Add(buttons, 0, wx.ALIGN_RIGHT | wx.ALL, 16)
            dialog.SetSizerAndFit(layout)
            deny.SetDefault()
            deny.SetFocus()
            allow.Bind(wx.EVT_BUTTON, lambda event: dialog.EndModal(wx.ID_YES))
            timer = wx.Timer(dialog)
            def check_cancelled(event):
                if not still_current() and dialog.IsModal():
                    dialog.EndModal(wx.ID_CANCEL)
            dialog.Bind(wx.EVT_TIMER, check_cancelled, timer)
            self.approving = True
            timer.Start(100)
            try:
                approved = dialog.ShowModal() == wx.ID_YES
            finally:
                timer.Stop()
                self.approving = False
        if approved and still_current():
            self.remember_origin(origin)
            return True
        return False

    def remember_origin(self, origin):
        self.config.Write('sync/origin', origin)
        self.config.Flush()
        self.origin = origin

    def refresh(self, event=None):
        try:
            board = pcbnew.GetBoard()
            identity = board_identity(board) if board is not None else None
            session = self.lifecycle.refresh(identity)
            message = 'Ready. You can close this window; sync stays available.' if session else 'Open a PCB to connect.'
            if not self.lifecycle.enabled:
                message = 'Sync stopped. Reopen Overprint Sync to enable it.'
        except Exception:
            # Startup can precede the editor/board becoming ready. Retry quietly.
            self.lifecycle.clear()
            session = None
            message = 'Waiting for KiCad. The local connection will retry automatically.'
        if self.dialog:
            self.dialog.update_session(session, message)
        return session


def start_sync():
    app = wx.GetApp()
    if app is None:
        return None
    # wx.GetApp() may return a new Python wrapper for the same native app.
    # A process-owned registry survives those wrappers and plugin reloads.
    return shared_service(SyncService)


class SyncDialog(wx.Dialog):
    def __init__(self, service):
        super().__init__(None, title='Overprint connection', style=wx.DEFAULT_DIALOG_STYLE | wx.RESIZE_BORDER)
        self.service = service
        layout = wx.BoxSizer(wx.VERTICAL)
        self.board_label = wx.StaticText(self, label='')
        layout.Add(self.board_label, 0, wx.ALL, 12)
        self.origin_label = wx.StaticText(self, label='Pairing details')
        layout.Add(self.origin_label, 0, wx.LEFT | wx.RIGHT | wx.BOTTOM, 12)
        self.code = wx.TextCtrl(self, style=wx.TE_MULTILINE | wx.TE_READONLY)
        self.code.SetMinSize((500, 85))
        layout.Add(self.code, 1, wx.EXPAND | wx.LEFT | wx.RIGHT, 12)
        self.status = wx.StaticText(self, label='')
        layout.Add(self.status, 0, wx.ALL, 12)
        buttons = wx.BoxSizer(wx.HORIZONTAL)
        self.copy = wx.Button(self, label='Copy pairing code')
        stop = wx.Button(self, label='Stop sync')
        close = wx.Button(self, wx.ID_CLOSE, label='Close')
        for button in [self.copy, stop, close]:
            buttons.Add(button, 0, wx.RIGHT, 8)
        layout.Add(buttons, 0, wx.ALIGN_RIGHT | wx.ALL, 12)
        self.SetSizerAndFit(layout)
        self.SetMinSize(self.GetSize())
        self.copy.Bind(wx.EVT_BUTTON, self.copy_code)
        stop.Bind(wx.EVT_BUTTON, self.stop)
        close.Bind(wx.EVT_BUTTON, self.close)
        self.Bind(wx.EVT_CLOSE, self.close)

    def update_session(self, session, message):
        self.origin_label.SetLabel(f'Only {session.origin} may request this PCB.\nEach code expires in 30 minutes.' if session else 'No website is connected.')
        self.origin_label.Wrap(500)
        self.board_label.SetLabel(f'PCB: {session.board_name}' if session else 'No active connection')
        code = session.pairing_code() if session else ''
        if self.code.GetValue() != code:
            self.code.SetValue(code)
        self.copy.Enable(session is not None)
        self.status.SetLabel(message)
        self.Layout()

    def copy_code(self, event):
        session = self.service.refresh()
        if session and wx.TheClipboard.Open():
            try:
                wx.TheClipboard.SetData(wx.TextDataObject(session.pairing_code()))
            finally:
                wx.TheClipboard.Close()

    def stop(self, event):
        self.service.lifecycle.stop()
        self.service.refresh()

    def close(self, event):
        self.service.dialog = None
        self.Destroy()


def show_sync():
    service = start_sync()
    if service is None:
        return
    if service.dialog:
        service.dialog.Show()
        service.dialog.Raise()
        return
    with wx.TextEntryDialog(None,
            'The sync server starts automatically. Allow this app origin to read the PCB\nwhen you click Sync. Nothing is exported automatically.',
            'Overprint Sync', value=service.origin) as prompt:
        if prompt.ShowModal() != wx.ID_OK:
            return
        try:
            origin = normalize_origin(prompt.GetValue())
        except ValueError as error:
            wx.MessageBox(str(error), 'Invalid Overprint origin', wx.OK | wx.ICON_ERROR)
            return
    if origin != service.origin:
        service.lifecycle.clear()
        service.remember_origin(origin)
    service.lifecycle.enabled = True
    service.dialog = SyncDialog(service)
    service.refresh()
    service.dialog.Show()
