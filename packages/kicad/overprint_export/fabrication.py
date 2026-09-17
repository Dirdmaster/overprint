"""Native KiCad fabrication outputs; reference polygons are never used here."""
from pathlib import Path
import tempfile
import pcbnew as pcb


def fabrication_files(board):
    files = {}
    with tempfile.TemporaryDirectory(prefix='overprint-fab-') as directory:
        plotter = pcb.PLOT_CONTROLLER(board)
        options = plotter.GetPlotOptions()
        options.SetOutputDirectory(directory)
        options.SetPlotFrameRef(False)
        options.SetUseAuxOrigin(False)
        options.SetMirror(False)
        options.SetScale(1)
        options.SetAutoScale(False)
        options.SetUseGerberX2format(True)
        options.SetUseGerberProtelExtensions(False)
        options.SetSubtractMaskFromSilk(True)
        options.SetPlotReference(True)
        options.SetPlotValue(True)
        layers = list(board.GetEnabledLayers().CuStack()) + [pcb.F_Mask, pcb.B_Mask, pcb.F_SilkS, pcb.B_SilkS, pcb.Edge_Cuts]
        try:
            for layer in layers:
                name = pcb.LayerName(layer).replace('.', '_')
                plotter.SetLayer(layer)
                if not plotter.OpenPlotfile(name, pcb.PLOT_FORMAT_GERBER) or not plotter.PlotLayer():
                    raise ValueError('KiCad could not plot ' + name)
                path = Path(plotter.GetPlotFileName())
                plotter.ClosePlot()
                files['fabrication/' + name + '.gbr'] = path.read_bytes()
        finally:
            plotter.ClosePlot()
        drill = pcb.EXCELLON_WRITER(board)
        drill.SetFormat(True)
        drill.SetOptions(False, False, pcb.VECTOR2I(0, 0), False)
        drill.SetRouteModeForOvalHoles(True)
        if not drill.CreateDrillandMapFilesSet(directory, True, False):
            raise ValueError('KiCad could not export drill files.')
        for index, path in enumerate(sorted(Path(directory).glob('*.drl'))):
            files[f'fabrication/drill-{index}.drl'] = path.read_bytes()
    return files
