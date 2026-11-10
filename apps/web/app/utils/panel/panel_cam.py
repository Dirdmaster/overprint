"""Build panel fabrication from the Gerbers and drills in saved projects."""
from collections import defaultdict
from copy import deepcopy
from dataclasses import dataclass, replace
from functools import lru_cache
from itertools import combinations, pairwise
from math import ceil, hypot, radians
import re
import warnings

from gerbonara import ExcellonFile, GerberFile, MM
from gerbonara.apertures import CircleAperture, ExcellonTool, PolygonAperture
from gerbonara.cam import FileSettings
from gerbonara.graphic_objects import Arc, Flash, Line
from gerbonara import graphic_primitives as primitives
from gerbonara.utils import UnknownStatementWarning, approximate_arc
from shapely import affinity, build_area, get_coordinates, make_valid, set_precision
from shapely.geometry import GeometryCollection, LineString, MultiLineString, Point, Polygon, box
from shapely.ops import nearest_points, polygonize_full, unary_union
from shapely.strtree import STRtree

RESOLUTION = .000001
ARC_ERROR = .002
OUTLINE_JOIN_TOLERANCE = .01
TAB_WIDTH = 5
BITE_DIAMETER = .60
BITE_PITCH = .95
BITE_MIN_WEB = .30
BITE_OFFSET = .28
BITE_CLEARANCE = .25
SETTINGS = FileSettings(unit=MM, number_format=(4, 6))
PROFILE = "fabrication/Edge_Cuts.gbr"
DRILL_ROLE = re.compile(r"TF\.FileFunction,(NonPlated|Plated),(\d+),(\d+),([A-Za-z]+)")


def join_outline_endpoints(segments):
    endpoints = defaultdict(list)
    for index, points in enumerate(segments):
        if points[0] != points[-1]:
            endpoints[points[0]].append((index, 0))
            endpoints[points[-1]].append((index, -1))
    if any(len(matches) > 2 for matches in endpoints.values()):
        raise ValueError("The saved Gerber outline has an ambiguous junction.")

    # Prefer exact Gerber connections. KiCad arc endpoints may differ from the
    # adjoining line by a few coordinate units after plotting.
    unmatched = [(point, matches[0]) for point, matches in endpoints.items() if len(matches) == 1]
    points = [Point(point) for point, _ in unmatched]
    tree = STRtree(points)
    for i, point in enumerate(points):
        neighbors = [j for j in tree.query(point, predicate="dwithin", distance=OUTLINE_JOIN_TOLERANCE) if j != i]
        if len(neighbors) != 1:
            raise ValueError("The saved Gerber needs a closed, unambiguous PCB outline.")
        j = neighbors[0]
        if j > i:
            midpoint = ((point.x + points[j].x) / 2, (point.y + points[j].y) / 2)
            for endpoint in (i, j):
                segment, position = unmatched[endpoint][1]
                segments[segment][position] = midpoint


def profile_shape(layer):
    segments = []
    for obj in layer.objects:
        # KiCad may append auxiliary drill-center flashes to its Gerbers.
        if isinstance(obj, Flash):
            continue
        if not isinstance(obj, (Line, Arc)) or not obj.polarity_dark or obj.unit != MM:
            raise ValueError("Unsupported operation in the PCB outline.")
        points = [obj.p1, obj.p2]
        if isinstance(obj, Arc):
            # Preserve native endpoints exactly when neighboring arc radii round differently.
            points[1:1] = [line.p2 for line in obj.approximate(max_error=ARC_ERROR)[:-1]]
        segments.append([(x, -y) for x, y in points])
    join_outline_endpoints(segments)
    segments = [set_precision(LineString(points), RESOLUTION) for points in segments]
    _, cuts, dangles, invalid = polygonize_full(segments)
    shape = build_area(MultiLineString([line for line in segments if not line.is_empty]))
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


def footprint(obj):
    # A hole within an aperture is transparent, so flashing it over copper
    # cannot erase a previous object. Resolve internal polarity before plotting.
    shape = GeometryCollection()
    for primitive in obj.to_primitives(MM):
        area = primitive_shape(primitive)
        shape = shape.union(area) if primitive.polarity_dark == obj.polarity_dark else shape.difference(area)
    return shape


class ClearanceLayer:
    def __init__(self, objects):
        self.shapes = [footprint(obj) for obj in objects]
        self.polarities = [obj.polarity_dark for obj in objects]
        # Index the actual shape. Gerbonara can underbound a rotated macro rectangle.
        self.tree = STRtree(self.shapes)

    def hits(self, window):
        area = GeometryCollection()
        for index in sorted(self.tree.query(window, predicate="intersects")):
            shape = self.shapes[index].intersection(window)
            area = area.union(shape) if self.polarities[index] else area.difference(shape)
        return not area.is_empty


def read_gerber(name, raw):
    if "%IPNEG*%" in raw or (name.endswith("_Cu.gbr") and "TF.FilePolarity,Negative" in raw):
        raise ValueError(f"{name}: negative image polarity is unsupported.")
    with warnings.catch_warnings():
        warnings.simplefilter("error", UnknownStatementWarning)
        warnings.filterwarnings("error", message=".*IF include statement", category=ResourceWarning)
        try:
            return GerberFile.from_string(raw)
        except (UnknownStatementWarning, ResourceWarning, SyntaxError) as error:
            raise ValueError(f"{name}: unsupported Gerber instruction. Export fresh fabrication files from KiCad.") from error


def load_source(data):
    files = data["files"]
    layers, drills = {}, {}
    for name, raw in files.items():
        if name.endswith(".gbr"):
            layers[name] = read_gerber(name, raw)
        elif name.endswith(".drl"):
            marker = DRILL_ROLE.search(raw)
            if not marker:
                raise ValueError("A drill file is missing its plating and layer-span attributes.")
            try:
                drill = ExcellonFile.from_string(raw)
            except SyntaxError as error:
                raise ValueError(f"{name}: unsupported drill instruction. Export fresh drill files from KiCad.") from error
            for hit in drill.objects:
                hit.aperture = replace(hit.aperture, plated=marker[1] == "Plated")
            drills.setdefault(marker[0], ExcellonFile()).merge(drill)

    profile = profile_shape(layers.pop(PROFILE))
    bounds = data["bounds"]
    expected = (bounds["x"], bounds["y"], bounds["x"] + bounds["width"], bounds["y"] + bounds["height"])
    if any(abs(a - b) > .025 for a, b in zip(profile.bounds, expected)):
        raise ValueError("The saved PCB preview and Gerber outline use different coordinates. Import matching fabrication data.")
    copper = [ClearanceLayer(layer.objects) for name, layer in layers.items() if name.endswith("_Cu.gbr")]
    drill_clearance = [ClearanceLayer(drill.objects) for drill in drills.values() if drill.objects]
    native_shape = affinity.scale(profile, yfact=-1, origin=(0, 0))
    # Gerber clears act on the whole merged layer. Keep a source clear within
    # its half of the minimum 2 mm gap so it cannot erase its neighbor.
    clear_limit = native_shape.buffer(.9)
    for name, layer in layers.items():
        if any(not obj.polarity_dark and not clear_limit.covers(footprint(obj)) for obj in layer.objects):
            raise ValueError(f"{name}: a Gerber clear extends beyond the source PCB.")
    # Include disconnected features outside the saved outline in the check.
    extents = [native_shape.bounds, *(shape.bounds for layer in (*copper, *drill_clearance)
                                      for shape in layer.shapes if not shape.is_empty)]
    x0, y0, x1, y1 = zip(*extents)
    workspace = box(min(x0), min(y0), max(x1), max(y1)).buffer(1)
    copper_route = workspace.difference(native_shape.buffer(-BITE_CLEARANCE - 2 * ARC_ERROR))
    if any(layer.hits(copper_route) for layer in copper):
        raise ValueError("Copper crosses or is within 0.25 mm of the routed PCB edge. Move the copper inward.")
    drill_route = workspace.difference(native_shape.buffer(-2 * ARC_ERROR))
    if any(layer.hits(drill_route) for layer in drill_clearance):
        raise ValueError("A saved drill or slot touches a routed PCB edge. Edge-drilled boards require a separate fabrication workflow.")
    return layers, drills, profile, [*copper, *drill_clearance]


class Placement:
    def __init__(self, source, placement):
        self.x, self.y, self.angle = placement["x"], placement["y"], placement["rotation"]
        self.source = source
        self.name = placement["name"]
        self.tab_edges = placement.get("tabEdges")
        self.shape = affinity.translate(affinity.rotate(source[2], self.angle, origin=(0, 0)), self.x, self.y)
        self.bounds = self.shape.bounds

    def transform_cam(self, original):
        cam = deepcopy(original)
        angle = radians(self.angle)
        if isinstance(cam, GerberFile) and angle:
            # Gerbonara rotates object coordinates clockwise. Its regular
            # polygon aperture rotation is counterclockwise.
            cam.map_apertures(lambda aperture: aperture.rotated(
                -angle if isinstance(aperture, PolygonAperture) else angle))
            for obj in cam.objects:
                obj.rotate(angle, unit=MM)
        else:
            cam.rotate(angle, unit=MM)
        cam.offset(self.x, -self.y, unit=MM)
        return cam

    def clear(self, point, extra=0):
        radius = BITE_DIAMETER / 2 + BITE_CLEARANCE + extra + 2 * ARC_ERROR
        x0, y0, x1, y1 = self.bounds
        # The source validation already confines copper and drills to the board.
        if max(x0 - point.x, point.x - x1, y0 - point.y, point.y - y1) > radius:
            return True
        local = affinity.rotate(affinity.translate(point, -self.x, -self.y), -self.angle, origin=(0, 0))
        window = Point(local.x, -local.y).buffer(radius, quad_segs=24)
        return not any(layer.hits(window) for layer in self.source[3])


def validate_tab(first, second, shapes, placements, existing_tabs, start, end, routing_gap=None):
    a, b = shapes[first], shapes[second]
    length = start.distance(end)
    if not length:
        return None
    centerline = LineString([start, end])
    tab = centerline.buffer(TAB_WIDTH / 2, cap_style="square")
    minimum_gap = 2 if routing_gap is None else routing_gap - 2 * ARC_ERROR
    if routing_gap is not None:
        bridge = centerline.buffer(TAB_WIDTH / 2, cap_style="flat")
        endpoints = a.union(b)
        # Flat ends leave the intended connections alone while checking the
        # router channel beside both exposed sides of the tab.
        flanks = centerline.buffer(TAB_WIDTH / 2 + minimum_gap, cap_style="flat").difference(bridge)
        if flanks.intersection(endpoints).area > ARC_ERROR * length:
            return None
        tab = bridge.union(tab.intersection(endpoints))
    if any(tab.distance(existing) < minimum_gap for existing in existing_tabs):
        return None
    for i, shape in enumerate(shapes):
        if i not in (first, second) and (tab.intersects(shape) or
                (routing_gap is not None and tab.distance(shape) < minimum_gap)):
            return None
    if min(tab.intersection(a).area, tab.intersection(b).area) < 2:
        return None
    holes = []
    dx, dy = (end.x - start.x) / length, (end.y - start.y) / length
    for i, point, direction in [(first, start, 1), (second, end, -1)]:
        if i == len(placements):  # The rail side is solid.
            continue
        outline = shapes[i].exterior
        center = outline.project(point)
        shoulders = [outline.interpolate((center + offset) % outline.length)
                     for offset in (-TAB_WIDTH / 2, TAB_WIDTH / 2)]
        if shoulders[0].distance(shoulders[1]) < TAB_WIDTH - .05:
            break  # The full tab must meet one edge without wrapping around a corner.
        edge_points = [outline.interpolate((center + offset * BITE_PITCH) % outline.length)
                       for offset in range(-2, 3)]
        # Put the row just into the sacrificial tab to retain clearance
        # from copper near the finished PCB edge.
        bites = [affinity.translate(edge_point, direction * dx * BITE_OFFSET, direction * dy * BITE_OFFSET)
                 for edge_point in edge_points]
        safe_tab = tab.buffer(-.35)
        if any(shapes[i].covers(bite) or not safe_tab.covers(bite) for bite in bites):
            break
        if not all(placement.clear(bite) for bite in bites for placement in placements):
            break
        holes.extend(bites)
    else:
        if any(a.distance(b) < BITE_DIAMETER + BITE_MIN_WEB + RESOLUTION
               for a, b in combinations(holes, 2)):
            return None
        return tab, holes
    return None


def tab_candidate(first, second, shapes, placements, clearance, existing_tabs):
    edge = shapes[first].exterior
    origin = edge.project(nearest_points(edge, shapes[second])[0])
    positions = [origin]
    for distance in range(2, int(edge.length / 2) + 1, 2):
        positions.extend([(origin - distance) % edge.length, (origin + distance) % edge.length])
    for distance in positions:
        start = edge.interpolate(distance)
        end = nearest_points(start, shapes[second])[1]
        if start.distance(end) <= clearance:
            candidate = validate_tab(first, second, shapes, placements, existing_tabs, start, end)
            if candidate:
                return candidate
    return None


TAB_EDGES = ("top", "right", "bottom", "left")


def tab_lanes(shape, edge, count):
    x0, y0, x1, y1 = shape.bounds
    lo, hi = (x0, x1) if edge % 2 == 0 else (y0, y1)
    return [lo + (hi - lo) * i / (count + 1) for i in range(1, count + 1)]


def facing_edges(placements, settings):
    selected = []
    for placement in placements:
        edges = placement.tab_edges if placement.tab_edges is not None else settings["edges"]
        selected.append({(TAB_EDGES.index(edge) + placement.angle // 90) % 4: edge for edge in edges})
    return selected


def facing_connection(i, edge, lane, shapes, reach):
    x0, y0, x1, y1 = shapes[i].bounds
    vertical = edge % 2 == 0
    axis = 1 if vertical else 0
    sign = 1 if edge in (1, 2) else -1
    ray = LineString([(lane, y0), (lane, y1)] if vertical else [(x0, lane), (x1, lane)])
    points = get_coordinates(shapes[i].exterior.intersection(ray))
    if not len(points):
        return None
    start = Point(max(points, key=lambda xy: sign * xy[axis]))
    destination = Point(start.x, start.y + sign * reach) if vertical else Point(start.x + sign * reach, start.y)
    outward = LineString([start, destination])
    targets = []
    ray_left, ray_top, ray_right, ray_bottom = outward.bounds
    for j, shape in enumerate(shapes):
        if j == i:
            continue
        left, top, right, bottom = shape.bounds
        if ray_left > right or ray_right < left or ray_top > bottom or ray_bottom < top:
            continue
        hit = outward.intersection(shape.boundary)
        if not hit.is_empty:
            end = nearest_points(start, hit)[1]
            targets.append((start.distance(end), j, end))
    if targets:
        _, j, end = min(targets, key=lambda target: (target[0], target[1]))
        return j, start, end
    return None


def controlled_tabs(placements, shapes, gap, settings):
    count = settings["count"]
    selected = facing_edges(placements, settings)
    tabs, bites, connections = [], [], []
    for i, placement in enumerate(placements):
        for edge, local_edge in sorted(selected[i].items()):
            for row, lane in enumerate(tab_lanes(shapes[i], edge, count), 1):
                error = f"{placement.name}: cannot place {local_edge} tab {row} safely. Change the tab edges, count, or spacing."
                connection = facing_connection(i, edge, lane, shapes, gap * 2 + 4)
                if not connection:
                    raise ValueError(error)
                j, start, end = connection
                opposite = (edge + 2) % 4
                if j < len(placements) and (
                    opposite not in selected[j] or
                    not any(abs(other - lane) <= ARC_ERROR for other in tab_lanes(shapes[j], opposite, count))
                ):
                    raise ValueError(error)
                pair = frozenset((i, j))
                if any(pair == previous and tab.covers(start) for previous, tab in zip(connections, tabs)):
                    continue
                candidate = validate_tab(i, j, shapes, placements, tabs, start, end, routing_gap=gap)
                if not candidate:
                    raise ValueError(error)
                tab, holes = candidate
                tabs.append(tab)
                bites.extend(holes)
                connections.append(pair)
    for i, placement in enumerate(placements):
        if sum(i in pair for pair in connections) < 2:
            raise ValueError(f"{placement.name} needs at least two safe breakaway tabs.")
    return tabs, bites


MAX_SUPPORT_SPAN = 55
TAB_SEARCH_WIDTH = 16


@dataclass(frozen=True)
class TabOption:
    boards: tuple[int, int]
    points: tuple[Point, Point]
    tab: Polygon
    exposed: Polygon
    holes: list[Point]
    length: float
    extra_clearance: bool


def tab_options(placements, shapes, gap, settings):
    selected = facing_edges(placements, settings)
    reach = gap * 2 + 4
    options = []
    seen = set()
    for i, edges in enumerate(selected):
        x0, y0, x1, y1 = shapes[i].bounds
        for edge in sorted(edges):
            span = x1 - x0 if edge % 2 == 0 else y1 - y0
            # Include the midpoint and sample either side on the actual profile.
            count = min(127, 2 * ceil(span / 4) + 1)
            for lane in tab_lanes(shapes[i], edge, count):
                connection = facing_connection(i, edge, lane, shapes, reach)
                if not connection:
                    continue
                j, start, end = connection
                if j < len(placements):
                    opposite = (edge + 2) % 4
                    if opposite not in selected[j]:
                        continue
                    reverse = facing_connection(j, opposite, lane, shapes, reach)
                    if not reverse or reverse[0] != i or reverse[1].distance(end) > ARC_ERROR:
                        continue
                canonical_edge = edge if i < j else (edge + 2) % 4
                key = (min(i, j), max(i, j), canonical_edge, round(lane, 6))
                if key in seen:
                    continue
                seen.add(key)
                candidate = validate_tab(i, j, shapes, placements, [], start, end, routing_gap=gap)
                if candidate:
                    tab, holes = candidate
                    extra_clearance = all(
                        placement.clear(hole, extra=.25) for hole in holes for placement in placements
                    )
                    exposed = tab.difference(shapes[i]).difference(shapes[j])
                    options.append(TabOption((i, j), (start, end), tab, exposed, holes,
                                             start.distance(end), extra_clearance))
    return options


def support_quality(bounds, points):
    x0, y0, x1, y1 = bounds
    gaps = []
    for low, high, coords in ((x0, x1, [p.x for p in points]), (y0, y1, [p.y for p in points])):
        gaps.extend(b - a for a, b in pairwise([low, *sorted(coords), high]))
    excess = sum(max(0, gap - MAX_SUPPORT_SPAN) for gap in gaps)
    vectors = []
    off_center = 0
    for p in points:
        x = (2 * p.x - x0 - x1) / (x1 - x0)
        y = (2 * p.y - y0 - y1) / (y1 - y0)
        off_center += min(abs(x), abs(y))
        length = hypot(x, y)
        if length:
            vectors.append((x / length, y / length))
    # Opposing contacts balance around the board center. The largest projected
    # span is a tie-breaker and also bounds unsupported runs on larger boards.
    balance = hypot(sum(x for x, _ in vectors), sum(y for _, y in vectors)) / max(1, len(vectors))
    return max(0, 2 - len(points)), excess, balance, max(gaps), off_center


@dataclass(frozen=True)
class TabLayout:
    indices: tuple[int, ...]
    rank: tuple
    deficits: list[int]
    disconnected: list[int]
    groups: list[int]
    frame_deficit: int


def evaluate_tabs(indices, options, bounds):
    frame = len(bounds)
    points = [[] for _ in bounds]
    groups = list(range(frame + 1))
    for index in indices:
        option = options[index]
        i, j = option.boards
        points[i].append(option.points[0])
        if j != frame:
            points[j].append(option.points[1])
        source, destination = groups[i], groups[j]
        groups = [source if group == destination else group for group in groups]
    support = [support_quality(box_bounds, contacts) for box_bounds, contacts in zip(bounds, points)]
    deficits = [i for i, (count, excess, _, _, _) in enumerate(support) if count or excess > ARC_ERROR]
    disconnected = [i for i in range(frame) if groups[i] != groups[frame]]
    frame_deficit = max(0, 2 - sum(frame in options[i].boards for i in indices))
    rank = (
        len(set(groups)),
        sum(item[0] for item in support),
        round(sum(item[1] for item in support), 6),
        frame_deficit,
        round(sum(item[2] for item in support), 6),
        sum(not options[i].extra_clearance for i in indices),
        round(sum(item[3] for item in support), 6),
        round(sum(item[4] for item in support), 6),
        round(sum(options[i].length for i in indices), 6),
        indices,
    )
    return TabLayout(indices, rank, deficits, disconnected, groups, frame_deficit)


def optimized_tabs(placements, shapes, gap, settings):
    options = tab_options(placements, shapes, gap, settings)
    bounds = [placement.bounds for placement in placements]
    by_board = [[] for _ in shapes]
    for index, option in enumerate(options):
        for board in option.boards:
            by_board[board].append(index)
    # Explore by total bridge count. Keep a bounded set of the best partial
    # layouts so the search remains practical on the browser fabrication worker.
    frontier = [evaluate_tabs((), options, bounds)]
    extra_support = sum(ceil(max(x1 - x0, y1 - y0) / MAX_SUPPORT_SPAN) for x0, y0, x1, y1 in bounds)
    minimum_gap = gap - 2 * ARC_ERROR

    @lru_cache(maxsize=32_768)
    def conflicts(first, second):
        return options[first].exposed.distance(options[second].exposed) < minimum_gap

    for _ in range(2 * len(placements) + extra_support):
        next_layouts = {}
        for layout in frontier:
            if layout.deficits:
                candidates = by_board[min(layout.deficits, key=lambda board: len(by_board[board]))]
            elif layout.disconnected:
                candidates = {
                    i for board in layout.disconnected for i in by_board[board]
                    if layout.groups[options[i].boards[0]] != layout.groups[options[i].boards[1]]
                }
            else:
                candidates = by_board[-1]
            for index in candidates:
                selection = tuple(sorted((*layout.indices, index)))
                if selection in next_layouts or any(
                    conflicts(min(index, other), max(index, other)) for other in layout.indices
                ):
                    continue
                next_layouts[selection] = evaluate_tabs(selection, options, bounds)
        if not next_layouts:
            break
        frontier = sorted(next_layouts.values(), key=lambda entry: entry.rank)[:TAB_SEARCH_WIDTH]
        complete = [entry for entry in next_layouts.values()
                    if not (entry.deficits or entry.disconnected or entry.frame_deficit)]
        if complete:
            indices = min(complete, key=lambda entry: entry.rank).indices
            return [options[i].tab for i in indices], [hole for i in indices for hole in options[i].holes]
    raise ValueError("Could not find a supported tab layout. Allow more edges, change the spacing, or place tabs by count.")


def make_profile(placements, gap, rail, settings=None):
    boards = [p.shape for p in placements]
    pairs = [(a.distance(b), i, j) for (i, a), (j, b) in combinations(enumerate(boards), 2)]
    for distance, i, j in pairs:
        if distance + ARC_ERROR * 2 < gap:
            raise ValueError(f"{placements[i].name} and {placements[j].name} overlap or leave less than {gap:g} mm for routing.")
    x0, y0, x1, y1 = unary_union(boards).bounds
    inner = box(x0 - gap, y0 - gap, x1 + gap, y1 + gap)
    frame = inner.buffer(rail, join_style="mitre").difference(inner)
    frame_id = len(boards)
    shapes = [*boards, frame]
    if settings is not None:
        place_tabs = optimized_tabs if settings.get("mode") == "optimized" else controlled_tabs
        tabs, holes = place_tabs(placements, shapes, gap, settings)
        return checked_substrate(shapes, tabs), holes
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
    return checked_substrate(shapes, tabs), holes


def checked_substrate(shapes, tabs):
    substrate = set_precision(unary_union([*shapes, *tabs]), RESOLUTION)
    if substrate.geom_type != "Polygon" or not substrate.is_valid :
        raise ValueError("A PCB copy cannot reach the frame with safe breakaway tabs. Adjust spacing or placement.")
    return substrate


def round_routing_corners(outline, placements, radius):
    native_cutouts = STRtree([
        Polygon(ring) for placement in placements for ring in placement.shape.interiors
    ])
    openings = []
    for ring in outline.interiors:
        opening = Polygon(ring)
        if len(native_cutouts.query(opening.representative_point(), predicate="within")):
            openings.append(ring)
            continue
        # Sweep a circular cutter over its reachable center path. Keep a small
        # tolerance so it can travel along a channel exactly one tool wide.
        center_path = opening.buffer(-radius + min(ARC_ERROR, radius / 2), quad_segs=32)
        if center_path.is_empty or center_path.geom_type != "Polygon":
            raise ValueError("The routing radius is too large for a panel channel. Reduce the radius or increase spacing.")
        swept = set_precision(opening.intersection(center_path.buffer(radius, quad_segs=32)), RESOLUTION)
        if swept.geom_type != "Polygon" or swept.is_empty or swept.interiors:
            raise ValueError("The routing radius is too large for a panel channel. Reduce the radius or increase spacing.")
        openings.append(swept.exterior)
    return Polygon(outline.exterior, openings)


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
    outline, bites = make_profile(placements, job["gap"], job["rail"], job.get("tabs"))
    routing_radius = job.get("routingRadius", 0)
    if routing_radius:
        outline = round_routing_corners(outline, placements, routing_radius)
    layers, drills = {}, {}
    for index, placement in enumerate(placements):
        for name, data in placement.source[0].items():
            transformed = placement.transform_cam(data)
            transformed.file_attrs = {key: value for key, value in transformed.file_attrs.items()
                                      if key in (".FileFunction", ".FilePolarity")}
            if name in layers:
                previous_attrs = layers[name].file_attrs
                if any(previous_attrs[attr] != value for attr, value in transformed.file_attrs.items() if attr in previous_attrs):
                    raise ValueError(f"{placement.name}: {name} has a different layer role or polarity.")
                previous_attrs.update(transformed.file_attrs)
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
        "biteDiameter": BITE_DIAMETER,
        "bites": [list(p.coords[0]) for p in bites],
        "localOutlines": [rings(source[2]) for source in sources],
        "boardOutlines": [rings(p.shape) for p in placements],
        "bounds": list(outline.bounds),
        "files": files,
    }
