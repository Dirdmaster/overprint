"""Regenerate the synthetic PCB and native polygon oracle using KiCad 10 Python."""
import json
from pathlib import Path
import sys
import tempfile
import wx
import pcbnew as pcb

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / 'packages/kicad/overprint_export'))
from exporter import polygons

app = wx.App(False)
board = pcb.BOARD()
def layers(*values):
    result = pcb.LSET()
    for value in values: result.AddLayer(value)
    return result

vec = lambda x, y: pcb.VECTOR2I(pcb.FromMM(x), pcb.FromMM(y))

def rect(layer, a, b):
    shape = pcb.PCB_SHAPE(board)
    shape.SetShape(pcb.SHAPE_T_RECT)
    shape.SetLayer(layer)
    shape.SetStart(vec(*a)); shape.SetEnd(vec(*b))
    shape.SetWidth(pcb.FromMM(.15))
    board.Add(shape)
    return shape

rect(pcb.Edge_Cuts, (10, 20), (70, 60))
rect(pcb.Edge_Cuts, (35, 35), (40, 40))
rect(pcb.F_SilkS, (14, 24), (28, 30))
rect(pcb.B_SilkS, (50, 45), (63, 52))
for layer, label, xy in [(pcb.F_SilkS, 'Front 123', (28, 50)), (pcb.B_SilkS, 'Back', (52, 30))]:
    text = pcb.PCB_TEXT(board)
    text.SetText(label); text.SetLayer(layer); text.SetPosition(vec(*xy))
    text.SetTextSize(vec(1, 1)); text.SetTextThickness(pcb.FromMM(.15))
    text.SetMirrored(layer == pcb.B_SilkS)
    board.Add(text)

for name, xy, angle, back in [('J1', (20, 38), 90, False), ('U1', (52, 38), 30, True)]:
    fp = pcb.FOOTPRINT(board); fp.SetReference(name); fp.Reference().SetVisible(True); fp.Value().SetVisible(False)
    board.Add(fp)
    for index, shape in enumerate([pcb.PAD_SHAPE_OVAL, pcb.PAD_SHAPE_ROUNDRECT, pcb.PAD_SHAPE_CIRCLE]):
        pad = pcb.PAD(fp); fp.Add(pad)
        pad.SetNumber(str(index + 1)); pad.SetShape(shape)
        pad.SetSize(vec(3 if index < 2 else 2, 2)); pad.SetPosition(vec(index * 5, 0))
        if index == 0:
            pad.SetAttribute(pcb.PAD_ATTRIB_PTH); pad.SetLayerSet(layers(pcb.F_Cu, pcb.B_Cu, pcb.F_Mask, pcb.B_Mask))
            pad.SetDrillShape(pcb.PAD_DRILL_SHAPE_OBLONG); pad.SetDrillSize(vec(1.5, .8)); pad.SetOffset(vec(.2, .1))
        else:
            pad.SetAttribute(pcb.PAD_ATTRIB_SMD); pad.SetLayerSet(layers(pcb.F_Cu, pcb.F_Mask, pcb.F_Paste))
        pad.SetLocalSolderMaskMargin(pcb.FromMM(.1))
    fp.SetPosition(vec(*xy)); fp.SetOrientationDegrees(angle)
    if back: fp.Flip(fp.GetPosition(), pcb.FLIP_DIRECTION_LEFT_RIGHT)

with tempfile.TemporaryDirectory() as directory:
    board.SetFileName(str(Path(directory) / 'browser-import.kicad_pcb'))
    pcb.SaveBoard(board.GetFileName(), board)
    Path(__file__).with_name('browser-import.kicad_pcb').write_bytes(Path(board.GetFileName()).read_bytes())
output = {}
for name, layer in [('front-silkscreen', pcb.F_SilkS), ('back-silkscreen', pcb.B_SilkS), ('front-mask', pcb.F_Mask), ('back-mask', pcb.B_Mask), ('front-copper', pcb.F_Cu), ('back-copper', pcb.B_Cu)]:
    contours = pcb.SHAPE_POLY_SET(); board.ConvertBrdLayerToPolygonalContours(layer, contours); contours.Simplify()
    output[name] = polygons(contours)
output['holes'] = []
for footprint in board.GetFootprints():
    for pad in footprint.Pads():
        contours = pcb.SHAPE_POLY_SET()
        if pad.TransformHoleToPolygon(contours, 0, pcb.FromMM(.005)):
            output['holes'].extend(polygons(contours))
Path(__file__).with_name('browser-import-native.json').write_text(json.dumps(output, separators=(',', ':')) + '\n')
