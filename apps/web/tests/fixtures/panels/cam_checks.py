import json
import unittest


def layer(*statements):
    return "\n".join(("%FSLAX46Y46*%", "%MOMM*%", "G75*", "%LPD*%", *statements, "M02*"))


class PanelCamChecks(unittest.TestCase):
    def test_negative_macro_angle_keeps_clearance_candidates(self):
        gerber = read_gerber("macro.gbr", layer(
            "%AMROT*21,1,1,4,0,0,-45*%", "%ADD10ROT*%", "D10*", "X10000000Y10000000D03*"))
        self.assertTrue(ClearanceLayer(gerber.objects).hits(box(11.5, 10.6, 11.9, 11.3)))

    def test_transparent_aperture_center_does_not_clear_earlier_copper(self):
        gerber = read_gerber("holes.gbr", layer(
            "%ADD10C,0.3*%", "%ADD11C,3X2*%", "D10*", "X10000000Y10000000D03*",
            "D11*", "X10000000Y10000000D03*"))
        self.assertTrue(ClearanceLayer(gerber.objects).hits(box(9.5, 9.5, 10.5, 10.5)))

    def test_polygon_flash_rotates_with_its_placement(self):
        gerber = read_gerber("polygon.gbr", layer("%ADD10P,4X3*%", "D10*", "X10000000Y10000000D03*"))
        placement = Placement(({}, {}, box(0, 0, 20, 20), []),
                              {"name": "coupon", "x": 3, "y": 4, "rotation": 90})
        result = read_gerber("rotated.gbr", write_gerber(placement.transform_cam(gerber)))
        expected = affinity.translate(affinity.rotate(footprint(gerber.objects[0]), -90, origin=(0, 0)), 3, -4)
        self.assertLess(footprint(result.objects[0]).symmetric_difference(expected).area, 0.00001)

    def test_routed_profile_preserves_a_circular_cutout(self):
        gerber = read_gerber("curves.gbr", layer(
            "%ADD10C,0.05*%", "D10*", "X0Y0D02*", "X20000000Y0D01*", "X20000000Y-20000000D01*",
            "X0Y-20000000D01*", "X0Y0D01*", "X12000000Y-10000000D02*",
            "G03X12000000Y-10000000I-2000000J0D01*"))
        shape = profile_shape(gerber)
        self.assertEqual(len(shape.interiors), 1)
        self.assertAlmostEqual(Polygon(shape.interiors[0]).area, 12.566, delta=0.03)

    def test_repairs_only_unambiguous_saved_outline_gaps(self):
        raw = layer(
            "%ADD10C,0.05*%", "D10*", "X0Y0D02*", "X20000000Y0D01*", "X20000000Y-20000000D01*",
            "X0Y-20000000D01*", "X0Y-4000D01*")
        self.assertAlmostEqual(profile_shape(read_gerber("small-gap.gbr", raw)).area, 400, delta=0.05)
        with self.assertRaisesRegex(ValueError, "closed, unambiguous PCB outline"):
            profile_shape(read_gerber("open.gbr", raw.replace("Y-4000", "Y-40000")))

    def test_slot_round_trips_with_its_tool_and_rotation(self):
        raw = "M48\nMETRIC\nT01C0.8\n%\nT01\nX10.0Y-10.0G85X12.0Y-10.0\nM30\n"
        drill = ExcellonFile.from_string(raw)
        placement = Placement(({}, {}, box(0, 0, 20, 20), []),
                              {"name": "coupon", "x": 3, "y": 4, "rotation": 90})
        slot, = ExcellonFile.from_string(placement.transform_cam(drill).write_to_bytes(SETTINGS).decode()).objects
        self.assertIsInstance(slot, Line)
        self.assertEqual((slot.x1, slot.y1, slot.x2, slot.y2), (-7, -14, -7, -16))
        self.assertEqual(slot.aperture.diameter, 0.8)

    def test_rejects_an_unsupported_gerber_command(self):
        with self.assertRaisesRegex(ValueError, r"bad.gbr: unsupported Gerber instruction"):
            read_gerber("bad.gbr", layer("G999*"))

    def test_rejects_edge_drill_and_names_its_source(self):
        board = json.loads(fixture_data)["board"]
        files = board["fabrication"]["files"]
        files["fabrication/drill-1.drl"] = files["fabrication/drill-1.drl"].replace("X16.0Y-27.0", "X10.0Y-27.0")
        with self.assertRaisesRegex(ValueError, r"Edge coupon: A saved drill or slot touches"):
            build_panel({"sources": [{"name": "Edge coupon", "files": files, "bounds": board["bounds"]}]})

    def test_breakaway_tabs_use_five_clear_holes_each(self):
        source = ({}, {}, box(0, 0, 20, 20), [])
        placement = Placement(source, {"name": "Coupon", "x": 0, "y": 0, "rotation": 0})
        substrate, bites = make_profile([placement], 2.5, 5)
        self.assertEqual(len(bites), 10)
        self.assertTrue(all(substrate.contains(bite) and not placement.shape.covers(bite) for bite in bites))
        for row in (bites[:5], bites[5:]):
            self.assertTrue(all(abs(a.distance(b) - .95) < .001 for a, b in pairwise(row)))

    def test_rejects_a_board_isolated_in_the_middle_of_a_panel(self):
        source = ({}, {}, box(0, 0, 20, 20), [])
        placements = [
            Placement(source, {"name": f"Coupon {i+1}", "x": x, "y": y, "rotation": 0})
            for i, (x, y) in enumerate(((0, 0), (0, 100), (100, 0), (100, 100), (50, 50)))]
        with self.assertRaisesRegex(ValueError, r"Coupon 5 cannot reach the frame"):
            make_profile(placements, 2.5, 5)

    def test_controlled_edges_and_exclusions_follow_rotation(self):
        source = ({}, {}, box(0, 0, 30, 24), [])
        board = Placement(source, {"name": "Connector board", "x": 24, "y": 0, "rotation": 90,
                                   "tabEdges": ["left", "right"]})
        _, bites = make_profile([board], 2.5, 5, {"edges": ["top", "bottom"], "count": 2})
        self.assertEqual(len(bites), 20)
        self.assertEqual({round(bite.y, 2) for bite in bites}, {-.28, 30.28})
        self.assertEqual({round(bite.x, 2) for bite in bites}, {
            6.1, 7.05, 8, 8.95, 9.9, 14.1, 15.05, 16, 16.95, 17.9,
        })

    def test_controlled_tab_reports_the_copy_and_edge_when_rows_are_unsafe(self):
        source = ({}, {}, box(0, 0, 8, 8), [])
        board = Placement(source, {"name": "Small board", "x": 0, "y": 0, "rotation": 0})
        with self.assertRaisesRegex(ValueError, r"Small board: cannot place right tab 1 safely"):
            make_profile([board], 2.5, 5, {"edges": ["right"], "count": 4})

    def test_controlled_tab_caps_do_not_extend_past_the_opposite_edge(self):
        source = ({}, {}, box(0, 0, 2, 30), [])
        board = Placement(source, {"name": "Narrow board", "x": 0, "y": 0, "rotation": 0})
        outline, bites = make_profile([board], 2.5, 5, {"edges": ["right"], "count": 2})
        self.assertEqual(len(bites), 10)
        self.assertFalse(outline.covers(Point(-.25, 10)))

    def test_controlled_tabs_preserve_routing_clearance_to_a_neighbor(self):
        profiles = [
            box(0, 0, 15, 30), box(23, 0, 38, 30),
            box(0, -20, 38, -2).union(box(17, -3, 21, 7.4)),
        ]
        boards = [Placement(({}, {}, shape, []), {
            "name": f"Board {i + 1}", "x": 0, "y": 0, "rotation": 0,
            "tabEdges": ["top"] if i == 2 else ["left", "right"],
        }) for i, shape in enumerate(profiles)]
        with self.assertRaisesRegex(ValueError, r"Board 1: cannot place right tab 1 safely"):
            make_profile(boards, 2, 5, {"edges": [], "count": 2})

    def test_controlled_tabs_preserve_routing_clearance_to_their_own_board(self):
        profile = box(0, 0, 20, 30).union(box(19, 12.6, 23, 17.4))
        board = Placement(({}, {}, profile, []), {"name": "Stepped board", "x": 0, "y": 0, "rotation": 0})
        with self.assertRaisesRegex(ValueError, r"Stepped board: cannot place right tab 1 safely"):
            make_profile([board], 2.5, 5, {"edges": ["right"], "count": 2})

    def test_rounds_tab_shoulders_without_changing_native_cutouts(self):
        slot = box(8, 8, 12, 8.8)
        source = ({}, {}, box(0, 0, 20, 20).difference(slot), [])
        board = Placement(source, {"name": "Slotted board", "x": 0, "y": 0, "rotation": 0})
        square, bites = make_profile([board], 2, 5, {"edges": ["left", "right"], "count": 1})
        rounded = round_routing_corners(square, [board], 1)
        self.assertTrue(rounded.is_valid)
        self.assertEqual(rounded.bounds, square.bounds)
        self.assertEqual(len(rounded.interiors), len(square.interiors))
        self.assertTrue(any(Polygon(ring).equals(slot) for ring in rounded.interiors))
        self.assertTrue(rounded.covers(board.shape))
        self.assertTrue(all(rounded.covers(bite) for bite in bites))
        shoulder = Point(-.1, 7.45)
        self.assertFalse(square.covers(shoulder))
        self.assertTrue(rounded.covers(shoulder))
        self.assertFalse(rounded.covers(Point(-1, 5)))

    def test_rounding_rejects_a_route_that_would_split_at_a_pinch(self):
        opening = box(2, 2, 6, 6).union(box(6, 3, 8, 4)).union(box(8, 2, 12, 6))
        outline = box(0, 0, 14, 8).difference(opening)
        with self.assertRaisesRegex(ValueError, "routing radius is too large"):
            round_routing_corners(outline, [], 1)

    def test_optimized_tabs_share_one_bridge_and_use_opposing_supports(self):
        source = ({}, {}, box(0, 0, 25, 44), [])
        boards = [Placement(source, {"name": f"Board {i}", "x": x, "y": 0, "rotation": 0})
                  for i, x in enumerate((0, 27.5))]
        outline, bites = make_profile(boards, 2.5, 5, {"mode": "optimized", "edges": ["left", "right"]})
        self.assertEqual(len(bites), 20)
        self.assertEqual({round(bite.x, 2) for bite in bites}, {-.28, 25.28, 27.22, 52.78})
        self.assertEqual({round(bite.y, 2) for bite in bites}, {20.1, 21.05, 22, 22.95, 23.9})
        self.assertEqual(len(outline.interiors), 2)

    def test_optimized_tabs_check_routing_between_exposed_bridges(self):
        source = ({}, {}, box(0, 0, 9, 9), [])
        board = Placement(source, {"name": "Small board", "x": 0, "y": 0, "rotation": 0})
        _, bites = make_profile([board], 2.5, 5, {"mode": "optimized", "edges": ["top", "left"]})
        self.assertEqual(sum(bite.x < 0 for bite in bites), 5)
        self.assertEqual(sum(bite.y < 0 for bite in bites), 5)

    def test_optimized_tabs_move_when_a_drill_blocks_the_midpoint(self):
        drill = ExcellonTool(.6, plated=False, unit=MM)
        keepout = ClearanceLayer([Flash(.31, -15.5, drill, unit=MM)])
        source = ({}, {}, box(0, 0, 25, 31), [keepout])
        board = Placement(source, {"name": "Board", "x": 0, "y": 0, "rotation": 0})
        _, bites = make_profile([board], 2.5, 5, {"mode": "optimized", "edges": ["left", "right"]})
        left = [bite for bite in bites if bite.x < 0]
        self.assertEqual(len(bites), 10)
        self.assertEqual(len(left), 5)
        self.assertTrue(all(bite.distance(Point(.31, 15.5)) >= .85 for bite in left))
        self.assertNotAlmostEqual(sum(bite.y for bite in left) / 5, 15.5)

    def test_excluding_the_connector_edge_keeps_its_drill_clear_of_mouse_bites(self):
        board = json.loads(fixture_data)["board"]
        files = board["fabrication"]["files"]
        files["fabrication/drill-0.drl"] = (
            "M48\n; #@! TF.FileFunction,NonPlated,1,2,NPTH\n"
            "METRIC\nT1C0.6\n%\nT1\nX18.333333Y-50.690000\nM30\n"
        )
        job = {
            "sources": [{"name": "Connector board", "files": files, "bounds": board["bounds"]}],
            "placements": [{"source": 0, "x": 0, "y": 0, "rotation": 0}],
            "gap": 2.5, "rail": 5, "copperLayers": 2, "tabs": {"edges": ["left", "right"], "count": 2},
        }
        result = build_panel(job)
        self.assertEqual(len(result["bites"]), 20)
        self.assertTrue(all(y < 50 for _, y in result["bites"]))
        job["tabs"]["edges"] = ["top", "bottom"]
        with self.assertRaisesRegex(ValueError, r"Connector board .* cannot place bottom tab 1 safely"):
            build_panel(job)


suite = unittest.defaultTestLoader.loadTestsFromTestCase(PanelCamChecks)
unittest.TextTestRunner().run(suite).wasSuccessful()
