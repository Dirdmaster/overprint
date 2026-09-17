"""GUI-thread lifecycle, independent of the pairing window and native bindings."""

import sys
from types import ModuleType

_RUNTIME_MODULE = '_overprint_sync_runtime'


def shared_service(create_service):
    """Keep the GUI service alive across module reloads and wx.GetApp wrappers."""
    runtime = sys.modules.setdefault(_RUNTIME_MODULE, ModuleType(_RUNTIME_MODULE))
    if not hasattr(runtime, 'service'):
        runtime.service = create_service()
    return runtime.service


class SyncLifecycle:
    def __init__(self, create_session):
        self.create_session = create_session
        self.session = None
        self.selected = None
        self.enabled = True

    def refresh(self, selected):
        if not self.enabled:
            return None
        if self.session and (selected != self.selected or self.session.stopped()):
            self.clear()
        if selected is None:
            return None
        if self.session is None:
            self.session = self.create_session(selected)
            self.selected = selected
        return self.session

    def clear(self):
        if self.session:
            self.session.stop()
        self.session = None
        self.selected = None

    def stop(self):
        self.enabled = False
        self.clear()
