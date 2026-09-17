"""Run with KiCad's bundled Python, which provides pcbnew and wx."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile
import wx
import pcbnew as pcb

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'overprint_export'))
from exporter import export_board

APP = wx.App(False)

class ExportTests(unittest.TestCase):
    def board(self):
        board = pcb.BOARD()
        edge = pcb.PCB_SHAPE(board)
        edge.SetShape(pcb.SHAPE_T_RECT)
        edge.SetLayer(pcb.Edge_Cuts)
        edge.SetStart(pcb.VECTOR2I(pcb.FromMM(10), pcb.FromMM(20)))
        edge.SetEnd(pcb.VECTOR2I(pcb.FromMM(50), pcb.FromMM(80)))
        board.Add(edge)
        fp = pcb.FOOTPRINT(board)
        fp.SetReference('J1')
        board.Add(fp)
        pad = pcb.PAD(fp)
        pad.SetNumber('1')
        pad.SetAttribute(pcb.PAD_ATTRIB_PTH)
        pad.SetShape(pcb.PAD_SHAPE_OVAL)
        pad.SetSize(pcb.VECTOR2I(pcb.FromMM(3), pcb.FromMM(2)))
        pad.SetDrillSize(pcb.VECTOR2I(pcb.FromMM(1.5), pcb.FromMM(0.8)))
        pad.SetDrillShape(pcb.PAD_DRILL_SHAPE_OBLONG)
        pad.SetLayerSet(pcb.LSET.AllCuMask())
        pad.SetPosition(pcb.VECTOR2I(pcb.FromMM(15), pcb.FromMM(27)))
        fp.Add(pad)
        return board

    def test_exports_unsaved_geometry_and_both_sides_without_saving_board(self):
        board = self.board()
        with tempfile.TemporaryDirectory() as tmp:
            destination = Path(tmp) / 'test.overprint-board'
            export_board(board, destination)
            self.assertEqual(board.GetFileName(), '')
            with zipfile.ZipFile(destination) as archive:
                manifest = json.loads(archive.read('manifest.json'))
                self.assertEqual(manifest['format'], 'overprint-board')
                self.assertEqual(manifest['version'], 1)
                self.assertEqual(manifest['board']['boundsMm'], {'x': 10.0, 'y': 20.0, 'width': 40.0, 'height': 60.0})
                geometry = json.loads(archive.read('geometry.json'))
                self.assertEqual(len(geometry['pads']), 1)
                self.assertEqual(geometry['pads'][0]['positionMm'], [15.0, 27.0])
                self.assertTrue(geometry['holes'][0]['polygons'])
                for side in ['front', 'back']:
                    self.assertIn(f'layers/{side}-silkscreen.svg', archive.namelist())
                self.assertEqual(manifest['coordinates']['backDisplay'], 'mirror-x-about-board-center')
                self.assertFalse(any(n.endswith('.kicad_pcb') for n in archive.namelist()))

    def test_back_only_pad_and_board_cutout(self):
        board = self.board()
        pad = next(iter(next(iter(board.GetFootprints())).Pads()))
        layers = pcb.LSET()
        layers.AddLayer(pcb.B_Cu)
        pad.SetLayerSet(layers)
        cutout = pcb.PCB_SHAPE(board)
        cutout.SetShape(pcb.SHAPE_T_RECT)
        cutout.SetLayer(pcb.Edge_Cuts)
        cutout.SetStart(pcb.VECTOR2I(pcb.FromMM(30), pcb.FromMM(40)))
        cutout.SetEnd(pcb.VECTOR2I(pcb.FromMM(35), pcb.FromMM(45)))
        board.Add(cutout)
        with tempfile.TemporaryDirectory() as tmp:
            destination = Path(tmp) / 'back.overprint-board'
            export_board(board, destination)
            with zipfile.ZipFile(destination) as archive:
                geometry = json.loads(archive.read('geometry.json'))
                self.assertEqual(set(geometry['pads'][0]['copper']), {'back'})
                self.assertEqual(len(geometry['outlines'][0]['holes']), 1)
                # Back view mirrors the asymmetric point 15 about x=30 to 45.
                self.assertEqual(2 * 10 + 40 - geometry['pads'][0]['positionMm'][0], 45)

    def test_native_fabrication_includes_inner_copper_and_routed_drills(self):
        board = self.board()
        board.SetCopperLayerCount(4)
        original_directory = board.GetPlotOptions().GetOutputDirectory()
        with tempfile.TemporaryDirectory() as tmp:
            destination = Path(tmp) / 'native.overprint-board'
            export_board(board, destination)
            with zipfile.ZipFile(destination) as archive:
                fabrication = json.loads(archive.read('manifest.json'))['fabrication']
                self.assertEqual(fabrication['copperLayers'], 4)
                self.assertEqual(fabrication['originMm'], [0, 0])
                for name in ['F_Cu', 'In1_Cu', 'In2_Cu', 'B_Cu', 'F_Mask', 'B_Mask', 'F_Silkscreen', 'B_Silkscreen', 'Edge_Cuts']:
                    data = archive.read('fabrication/' + name + '.gbr').decode()
                    self.assertIn('%MOMM*%', data)
                    self.assertIn('M02*', data)
                drills = [archive.read(name).decode() for name in fabrication['files'] if name.endswith('.drl')]
                self.assertTrue(drills)
                self.assertTrue(any('M15' in data for data in drills), 'Slotted pad must be routed')
                self.assertTrue(all('M30' in data for data in drills))
            self.assertEqual(board.GetPlotOptions().GetOutputDirectory(), original_directory)

    def test_invalid_outline_does_not_replace_existing_export(self):
        with tempfile.TemporaryDirectory() as tmp:
            destination = Path(tmp) / 'existing.overprint-board'
            destination.write_bytes(b'original')
            with self.assertRaises(ValueError):
                export_board(pcb.BOARD(), destination)
            self.assertEqual(destination.read_bytes(), b'original')

if __name__ == '__main__':
    unittest.main()
