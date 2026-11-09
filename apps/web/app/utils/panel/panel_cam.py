"""Build panel fabrication from the Gerbers and drills in saved projects."""
from copy import deepcopy
from dataclasses import replace
from itertools import combinations, pairwise
from math import radians
import re

from gerbonara import ExcellonFile, GerberFile, MM
from gerbonara.apertures import CircleAperture, ExcellonTool
from gerbonara.cam import FileSettings
from gerbonara.graphic_objects import Arc, Flash, Line
from gerbonara import graphic_primitives as primitives
from gerbonara.utils import approximate_arc
from shapely import affinity, build_area, make_valid, set_precision
from shapely.geometry import GeometryCollection, LineString, Point, Polygon, box
from shapely.ops import nearest_points, polygonize_full, unary_union
from shapely.strtree import STRtree

RESOLUTION = .000001
ARC_ERROR = .002
RAIL = 5
TAB_WIDTH = 4
BITE_DIAMETER = .5
BITE_CLEARANCE = .25
SETTINGS = FileSettings(unit=MM, number_format=(4, 6))
PROFILE = "fabrication/Edge_Cuts.gbr"
DRILL_ROLE = re.compile(r"TF\.FileFunction,(NonPlated|Plated),(\d+),(\d+),([A-Za-z]+)")


def profile_shape(layer):
    segments = []
    for obj in layer.objects:
        # KiCad may append auxiliary drill-center flashes to its Gerbers.
        if isinstance(obj, Flash):
            continue
        if not isinstance(obj, (Line, Arc)) or not obj.polarity_dark or obj.unit != MM:
            raise ValueError("Unsupported operation in the PCB outline.")
        lines = obj.approximate(max_error=ARC_ERROR) if isinstance(obj, Arc) else [obj]
        segments.extend(LineString([(line.x1, -line.y1), (line.x2, -line.y2)]) for line in lines)
    segments = [set_precision(line, RESOLUTION) for line in segments]
    polygons, cuts, dangles, invalid = polygonize_full(segments)
    shape = build_area(polygons)
    if not all(g.is_empty for g in (cuts, dangles, invalid)) or shape.geom_type != "Polygon" or not shape.is_valid:
        raise ValueError("The saved Gerber needs one closed PCB outline with valid cutouts.")
    return shape


def primitive_shape(primitive):
    if isinstance(primitive, primitives.Circle):
        return Point(primitive.x, primitive.y).buffer(primitive.r, quad_segs=24)
    if isinstance(primitive, primitives.Line):
        return LineString([(primitive.x1, primitive.y1), (primitive.x2, primitive.y2)]).buffer(primitive.width / 2, quad_segs=24)
    if isinstance(primitive, primitives.Arc):
        points = list(approximate_arc(
            primitive.cx, primitive.cy, primitive.x1, primitive.y1, primitive.x2, primitive.y2,
            primitive.clockwise, max_error=ARC_ERROR))
        return LineString(points).buffer(primitive.width / 2, quad_segs=24)
    if isinstance(primitive, primitives.ArcPoly):
        return make_valid(Polygon(primitive.approximate_arcs(max_error=ARC_ERROR).outline))
    if isinstance(primitive, primitives.Rectangle):
        rect = box(primitive.x - primitive.w / 2, primitive.y - primitive.h / 2,
                   primitive.x + primitive.w / 2, primitive.y + primitive.h / 2)
        return affinity.rotate(rect, primitive.rotation, origin=(primitive.x, primitive.y), use_radians=True)
    raise ValueError("Unsupported Gerber shape in clearance check.")


class ClearanceLayer:
    def __init__(self, objects):
        self.objects = objects
        self.tree = STRtree([box(*lo, *hi) for lo, hi in (obj.bounding_box(MM) for obj in objects)])

    def hits(self, window):
        area = GeometryCollection()
        for index in sorted(self.tree.query(window, predicate="intersects")):
            for primitive in self.objects[index].to_primitives(MM):
                shape = primitive_shape(primitive).intersection(window)
                area = area.union(shape) if primitive.polarity_dark else area.difference(shape)
        return not area.is_empty


def load_source(data):
    files = data["files"]
    layers, drills = {}, {}
    for name, raw in files.items():
        if name.endswith(".gbr"):
            if "%IPNEG*%" in raw or (name.endswith("_Cu.gbr") and "TF.FilePolarity,Negative" in raw):
                raise ValueError("Negative-polarity Gerber files are unsupported.")
            layers[name] = GerberFile.from_string(raw)
        elif name.endswith(".drl"):
            marker = DRILL_ROLE.search(raw)
            if not marker:
                raise ValueError("A drill file is missing its plating and layer-span attributes.")
            drill = ExcellonFile.from_string(raw)
            for hit in drill.objects:
                hit.aperture = replace(hit.aperture, plated=marker[1] == "Plated")
            drills.setdefault(marker[0], ExcellonFile()).merge(drill)

    profile = profile_shape(layers.pop(PROFILE))
    bounds = data["bounds"]
    expected = (bounds["x"], bounds["y"], bounds["x"] + bounds["width"], bounds["y"] + bounds["height"])
    if any(abs(a - b) > .025 for a, b in zip(profile.bounds, expected)):
        raise ValueError("The saved PCB preview and Gerber outline use different coordinates. Import matching fabrication data.")
    keepouts = [ClearanceLayer(layer.objects) for name, layer in layers.items() if name.endswith("_Cu.gbr")]
    route = affinity.scale(profile.boundary, yfact=-1, origin=(0, 0)).buffer(BITE_CLEARANCE + 2 * ARC_ERROR)
    if any(layer.hits(route) for layer in keepouts):
        raise ValueError("Copper is within 0.25 mm of the routed PCB edge. Move the copper inward or use a separate fabrication workflow for edge plating.")
    keepouts.extend(ClearanceLayer(drill.objects) for drill in drills.values() if drill.objects)
    return (layers, drills, profile, keepouts)


class Placement:
    def __init__(self, source, placement):
        self.x, self.y, self.angle = placement["x"], placement["y"], placement["rotation"]
        self.source = source
        self.name = placement["name"]
        self.shape = affinity.translate(affinity.rotate(source[2], self.angle, origin=(0, 0)), self.x, self.y)

    def transform_cam(self, original):
        cam = deepcopy(original)
        cam.rotate(radians(self.angle), unit=MM)
        cam.offset(self.x, -self.y, unit=MM)
        return cam

    def clear(self, point):
        local = affinity.rotate(affinity.translate(point, -self.x, -self.y), -self.angle, origin=(0, 0))
        # Use the circumscribed clearance to cover the chord approximation error.
        window = Point(local.x, -local.y).buffer(BITE_DIAMETER / 2 + BITE_CLEARANCE + 2 * ARC_ERROR, quad_segs=24)
        return not any(layer.hits(window) for layer in self.source[3])


def tab_candidate(first, second, shapes, placements, clearance, existing_tabs):
    a, b = shapes[first], shapes[second]
    edge = a.exterior
    start = nearest_points(edge, b)[0]
    origin = edge.project(start)
    positions = [origin]
    for distance in range(2, int(edge.length / 2) + 1, 2):
        positions.extend([(origin - distance) % edge.length, (origin + distance) % edge.length])
    for distance in positions:
        start = edge.interpolate(distance)
        end = nearest_points(start, b)[1]
        if start.distance(end) > clearance:
            continue
        tab = LineString([start, end]).buffer(TAB_WIDTH / 2, cap_style="square")
        if any(tab.distance(existing) < 2 for existing in existing_tabs):
            continue
        if any(tab.intersects(shape) for i, shape in enumerate(shapes) if i not in (first, second)):
            continue
        if min(tab.intersection(a).area, tab.intersection(b).area) < 2:
            continue
        holes = []
        for i, point in [(first, start), (second, end)]:
            if i == len(placements):  # The rail side is solid.
                continue
            outline = shapes[i].exterior
            center = outline.project(point)
            bites = [outline.interpolate((center + offset) % outline.length) for offset in (-1, 0, 1)]
            if bites[0].distance(bites[-1]) < 1.98:
                break  # Leave room for a straight break along the board edge.
            if not all(tab.buffer(-.35).covers(bite) and placement.clear(bite) for bite in bites for placement in placements):
                break
            holes.extend(bites)
        else:
            return tab, holes
    return None


def make_profile(placements, gap):
    boards = [p.shape for p in placements]
    pairs = [(a.distance(b), i, j) for (i, a), (j, b) in combinations(enumerate(boards), 2)]
    for distance, i, j in pairs:
        if distance + ARC_ERROR * 2 < gap:
            raise ValueError(f"{placements[i].name} and {placements[j].name} overlap or leave less than {gap:g} mm for routing.")
    x0, y0, x1, y1 = unary_union(boards).bounds
    inner = box(x0 - gap, y0 - gap, x1 + gap, y1 + gap)
    frame = inner.buffer(RAIL, join_style="mitre").difference(inner)
    frame_id = len(boards)
    shapes = [*boards, frame]
    pairs.extend((board.distance(frame), i, frame_id) for i, board in enumerate(boards))
    groups = list(range(len(shapes)))
    tabs, holes = [], []
    connections = [0] * len(shapes)
    pairs.sort()
    for distance, i, j in pairs:
        if groups[i] == groups[j] or distance > gap * 2 + 4:
            continue
        candidate = tab_candidate(i, j, shapes, placements, gap * 2 + 4, tabs)
        if candidate:
            tab, bites = candidate
            tabs.append(tab)
            holes.extend(bites)
            connections[i] += 1
            connections[j] += 1
            group = groups[j]
            groups = [groups[i] if value == group else value for value in groups]
    for distance, i, j in pairs:
        if distance > gap * 2 + 4 or (connections[i] >= 2 and (j == frame_id or connections[j] >= 2)):
            continue
        candidate = tab_candidate(i, j, shapes, placements, gap * 2 + 4, tabs)
        if candidate:
            tab, bites = candidate
            tabs.append(tab)
            holes.extend(bites)
            connections[i] += 1
            connections[j] += 1
    detached = [p.name for i, p in enumerate(placements) if groups[i] != groups[frame_id] or connections[i] < 2]
    if detached:
        raise ValueError(f'{", ".join(detached)} cannot reach the frame with two safe breakaway tabs. Adjust spacing or placement.')
    substrate = set_precision(unary_union([*shapes, *tabs]), RESOLUTION)
    if substrate.geom_type != "Polygon" or not substrate.is_valid :
        raise ValueError("A PCB copy cannot reach the frame with safe breakaway tabs. Adjust spacing or placement.")
    return substrate, holes


def rings(polygon):
    return [[list(p) for p in ring.coords] for ring in [polygon.exterior, *polygon.interiors]]


def write_gerber(layer):
    return layer.write_to_bytes(SETTINGS).decode().replace("\nG75\n", "\nG75*\n", 1) + "\n"


def build_panel(job):
    sources = []
    for data in job["sources"]:
        try:
            sources.append(load_source(data))
        except Exception as error:
            raise ValueError(f'{data["name"]}: {error}') from error
    placements = [
        Placement(sources[p["source"]], {**p, "name": f'{job["sources"][p["source"]]["name"]} (copy {i + 1})'})
        for i, p in enumerate(job["placements"])]
    outline, bites = make_profile(placements, job["gap"])
    layers, drills = {}, {}
    for index, placement in enumerate(placements):
        for name, data in placement.source[0].items():
            transformed = placement.transform_cam(data)
            transformed.file_attrs = {key: value for key, value in transformed.file_attrs.items()
                                      if key in (".FileFunction", ".FilePolarity")}
            if name in layers:
                layers[name].merge(transformed)
            else:
                layers[name] = transformed
        for role, drill in placement.source[1].items():
            drills.setdefault(role, ExcellonFile()).merge(placement.transform_cam(drill))

    outline_rings = rings(outline)
    aperture = CircleAperture(.05, unit=MM)
    layers[PROFILE] = GerberFile(
        objects=[Line(x, -y, tx, -ty, aperture, unit=MM)
                 for ring in outline_rings for (x, y), (tx, ty) in pairwise(ring)],
        file_attrs={".FileFunction": ["Profile", "NP"]})
    bite_tool = ExcellonTool(BITE_DIAMETER, plated=False, unit=MM)
    role = f'TF.FileFunction,NonPlated,1,{job["copperLayers"]},NPTH'
    drills.setdefault(role, ExcellonFile()).objects.extend(
        Flash(p.x, -p.y, bite_tool, unit=MM) for p in bites)

    files = {name: write_gerber(layer) for name, layer in layers.items()}
    for index, (role, drill) in enumerate(drills.items()):
        files[f"fabrication/drill-{index}.drl"] = (
            f"; #@! {role}\n" + drill.write_to_bytes(SETTINGS).decode() + "\n")
    return {
        "outline": outline_rings,
        "bites": [list(p.coords[0]) for p in bites],
        "localOutlines": [rings(source[2]) for source in sources],
        "boardOutlines": [rings(p.shape) for p in placements],
        "bounds": list(outline.bounds),
        "files": files,
    }
