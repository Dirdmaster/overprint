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

    def test_rejects_a_board_isolated_in_the_middle_of_a_panel(self):
        source = ({}, {}, box(0, 0, 20, 20), [])
        placements = [
            Placement(source, {"name": f"Coupon {i+1}", "x": x, "y": y, "rotation": 0})
            for i, (x, y) in enumerate(((0, 0), (0, 100), (100, 0), (100, 100), (50, 50)))]
        with self.assertRaisesRegex(ValueError, r"Coupon 5 cannot reach the frame"):
            make_profile(placements, 2.5, 5)


suite = unittest.defaultTestLoader.loadTestsFromTestCase(PanelCamChecks)
unittest.TextTestRunner().run(suite).wasSuccessful()
