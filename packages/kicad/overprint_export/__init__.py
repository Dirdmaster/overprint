from .action import ConnectToOverprint, ExportToOverprint

ExportToOverprint().register()
ConnectToOverprint().register()

# Defer until KiCad returns to its GUI event loop. No dialog or export on startup.
import wx
from .sync_ui import start_sync

wx.CallAfter(start_sync)
