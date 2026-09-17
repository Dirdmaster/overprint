from pathlib import Path

import pcbnew
import wx

from .exporter import export_board


class ExportToOverprint(pcbnew.ActionPlugin):
    def defaults(self):
        self.name = 'Export to Overprint'
        self.category = 'Export'
        self.description = 'Export this board for the Overprint artwork editor'
        self.show_toolbar_button = True
        self.icon_file_name = str(Path(__file__).with_name("icon.png"))
        self.dark_icon_file_name = str(Path(__file__).with_name("icon-dark.png"))

    def Run(self):
        board = pcbnew.GetBoard()
        if board is None:
            wx.MessageBox('Open a PCB first.', 'Overprint', wx.OK | wx.ICON_INFORMATION)
            return
        filename = (Path(board.GetFileName()).stem or 'Untitled') + '.overprint-board'
        with wx.FileDialog(None, 'Export to Overprint', defaultFile=filename,
                wildcard='Overprint board (*.overprint-board)|*.overprint-board',
                style=wx.FD_SAVE | wx.FD_OVERWRITE_PROMPT) as dialog:
            if dialog.ShowModal() != wx.ID_OK:
                return
            destination = Path(dialog.GetPath())
        # Keep the exact chosen path so the native overwrite prompt covers it.
        try:
            with wx.BusyCursor():
                export_board(board, destination)
        except Exception as error:
            wx.MessageBox(str(error), 'Export failed', wx.OK | wx.ICON_ERROR)
            return
        wx.MessageBox(f'Board exported to:\n{destination}', 'Overprint', wx.OK | wx.ICON_INFORMATION)


class ConnectToOverprint(pcbnew.ActionPlugin):
    def defaults(self):
        self.name = 'Overprint Sync'
        self.category = 'Export'
        self.description = 'Show pairing details or stop the automatic local sync server'
        self.show_toolbar_button = False

    def Run(self):
        from .sync_ui import show_sync
        show_sync()
