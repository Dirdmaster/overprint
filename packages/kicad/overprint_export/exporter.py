"""Read-only KiCad 10 board export. No GUI or filesystem paths in the package."""
import json
import os
from pathlib import Path
import tempfile
import zipfile

import pcbnew as pcb

try:
    from .fabrication import fabrication_files
    from .models import component_models
except ImportError:
    from fabrication import fabrication_files
    from models import component_models


def mm(value):
    return round(pcb.ToMM(value), 6)


def point(value):
    return [mm(value.x), mm(value.y)]


def polygons(shape):
    def ring(chain):
        return [point(chain.CPoint(i)) for i in range(chain.PointCount())]
    return [dict(outer=ring(shape.Outline(i)), holes=[ring(shape.Hole(i, j))
            for j in range(shape.HoleCount(i))]) for i in range(shape.OutlineCount())]


def svg(shapes, bounds):
    paths = []
    for polygon in shapes:
        loops = []
        for ring in [polygon['outer']] + polygon['holes']:
            if ring:
                loops.append('M' + ' L'.join(f'{x},{y}' for x, y in ring) + ' Z')
        paths.append('<path d="' + ' '.join(loops) + '"/>')
    x, y, w, h = (bounds[k] for k in ('x', 'y', 'width', 'height'))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}mm" height="{h}mm" '
            f'viewBox="{x} {y} {w} {h}"><g fill="black" fill-rule="evenodd">'
            + ''.join(paths) + '</g></svg>')


def export_board(board, destination):
    """Export the supplied in-memory board atomically, without saving or editing it."""
    if not pcb.GetBuildVersion().startswith('10.'):
        raise ValueError('This alpha exporter requires KiCad 10.')
    outline = pcb.SHAPE_POLY_SET()
    if not board.GetBoardPolygonOutlines(outline, False) or not outline.OutlineCount():
        raise ValueError('The board needs a closed, valid Edge.Cuts outline.')
    outlines = polygons(outline)
    vertices = [p for polygon in outlines for p in polygon['outer']]
    xs, ys = zip(*vertices)
    bounds = dict(x=min(xs), y=min(ys), width=round(max(xs)-min(xs), 6), height=round(max(ys)-min(ys), 6))
    if bounds['width'] <= 0 or bounds['height'] <= 0:
        raise ValueError('The board outline has no area.')
    geometry = dict(outlines=outlines, pads=[], holes=[], footprints=[])
    for footprint in board.GetFootprints():
        fid = footprint.m_Uuid.AsString()
        geometry['footprints'].append(dict(id=fid, reference=footprint.GetReference(),
            positionMm=point(footprint.GetPosition()), side='back' if footprint.IsFlipped() else 'front',
            rotationDegrees=footprint.GetOrientationDegrees()))
        for pad in footprint.Pads():
            pid = pad.m_Uuid.AsString()
            copper = {}
            for side, layer in [('front', pcb.F_Cu), ('back', pcb.B_Cu)]:
                if pad.IsOnLayer(layer):
                    copper[side] = polygons(pad.GetEffectivePolygon(layer))
            geometry['pads'].append(dict(id=pid, footprintId=fid, number=pad.GetNumber(),
                positionMm=point(pad.GetPosition()), copper=copper))
            drill = pcb.SHAPE_POLY_SET()
            if pad.TransformHoleToPolygon(drill, 0, pcb.FromMM(0.005)):
                geometry['holes'].append(dict(id=pid, kind='pad', polygons=polygons(drill)))
    # Vias can be buried: only through drills open on both outside faces.
    for track in board.GetTracks():
        if isinstance(track, pcb.PCB_VIA) and track.TopLayer() == pcb.F_Cu and track.BottomLayer() == pcb.B_Cu:
            import math
            cx, cy = point(track.GetPosition())
            radius = mm(track.GetDrillValue()) / 2
            ring = [[round(cx + radius*math.cos(i*math.tau/64), 6),
                     round(cy + radius*math.sin(i*math.tau/64), 6)] for i in range(64)]
            geometry['holes'].append(dict(id=track.m_Uuid.AsString(), kind='via',
                polygons=[dict(outer=ring, holes=[])]))
    files = {'geometry.json': json.dumps(geometry, separators=(',', ':'))}
    for side, layers in [('front', [pcb.F_SilkS, pcb.F_Mask, pcb.F_Cu, pcb.F_Fab]),
                         ('back', [pcb.B_SilkS, pcb.B_Mask, pcb.B_Cu, pcb.B_Fab])]:
        for name, layer in zip(['silkscreen', 'mask', 'copper', 'fabrication'], layers):
            contours = pcb.SHAPE_POLY_SET()
            board.ConvertBrdLayerToPolygonalContours(layer, contours)
            # Merge touching/overlapping artwork polygons before SVG rasterization.
            contours.Simplify()
            files[f'layers/{side}-{name}.svg'] = svg(polygons(contours), bounds)
    files.update(fabrication_files(board))
    model_files, model_report = component_models(board)
    files.update(model_files)
    manifest = dict(format='overprint-board', version=1, models=model_report,
        fabrication=dict(version=1, copperLayers=board.GetCopperLayerCount(), originMm=[0, 0],
                         files=[name for name in files if name.startswith('fabrication/')]),
        board=dict(name=Path(board.GetFileName()).stem or 'Untitled', boundsMm=bounds),
        source=dict(application='KiCad', version=pcb.GetBuildVersion(), state='in-memory'),
        coordinates=dict(units='mm', x='right', y='down', layers='front-coordinate-system',
                         backDisplay='mirror-x-about-board-center'),
        files=list(files), limitations=[
            'Native fabrication files preserve the current board state; DRC and full-color output are not validated.',
            'Assembled preview includes locally resolved component models; missing-model status is recorded separately.',
            'Mask SVGs represent openings. Via filling and tenting require manufacturing verification.',
            'Curves are polygon approximations; through-via drills use 64 segments.',
            'Preview geometry omits blind and buried via drills; native drill files are exported separately.'])
    files['manifest.json'] = json.dumps(manifest, indent=2)
    destination = Path(destination)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=destination.parent, suffix='.tmp', delete=False) as handle:
            temporary = handle.name
        with zipfile.ZipFile(temporary, 'w', zipfile.ZIP_DEFLATED) as archive:
            for name, data in files.items():
                archive.writestr(name, data)
        os.replace(temporary, destination)
    finally:
        if temporary and os.path.exists(temporary):
            os.unlink(temporary)
    return manifest
