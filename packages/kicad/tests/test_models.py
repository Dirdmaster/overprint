"""Run with KiCad's bundled Python; generates only owned temporary PCB snapshots."""
import json
from pathlib import Path
import shutil
import struct
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import test_export as fixture

pcb = fixture.pcb
from models import component_models, cli_path, _clean_glb, _run_export, _serialize
from exporter import export_board


def glb_document(data):
    length = struct.unpack_from('<I', data, 12)[0]
    return json.loads(data[20:20 + length])


def resistor_model():
    executable = cli_path()
    if not executable:
        return None
    for root in [Path(executable).parent.parent / 'SharedSupport/3dmodels',
                 Path(executable).parent.parent / 'share/kicad/3dmodels', Path('/usr/share/kicad/3dmodels')]:
        candidate = root / 'Resistor_SMD.3dshapes/R_0603_1608Metric.step'
        if candidate.exists():
            return candidate
    return None


class ModelExportTests(unittest.TestCase):
    def with_models(self, directory):
        model = resistor_model()
        if not model:
            self.skipTest('Install KiCad 10 CLI and the official resistor STEP model for this integration test.')
        model_dir = directory / 'parts'
        model_dir.mkdir()
        shutil.copyfile(model, model_dir / 'body.step')
        board = fixture.ExportTests().board()
        board.SetFileName(str(directory / 'source.kicad_pcb'))
        front = next(iter(board.GetFootprints()))
        front.SetReference('R1')
        front.SetPosition(pcb.VECTOR2I(pcb.FromMM(15), pcb.FromMM(27)))
        model = pcb.FP_3DMODEL()
        model.m_Filename = '${KIPRJMOD}/parts/body.wrl'  # STEP substitution, even without a WRL file.
        front.Models().push_back(model)
        back = pcb.FOOTPRINT(board)
        back.SetReference('R2')
        back.SetPosition(pcb.VECTOR2I(pcb.FromMM(36), pcb.FromMM(62)))
        board.Add(back)
        back.SetLayerAndFlip(pcb.B_Cu)
        model = pcb.FP_3DMODEL()
        model.m_Filename = 'parts/body.step'
        back.Models().push_back(model)
        return board

    def test_component_scene_coordinates_paths_and_unsaved_state(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            board = self.with_models(directory)
            source = Path(board.GetFileName())
            source.write_bytes(_serialize(board))
            saved_bytes = source.read_bytes()
            # Export the in-memory position, not the saved board's old position.
            front = next(fp for fp in board.GetFootprints() if fp.GetReference() == 'R1')
            front.SetPosition(pcb.VECTOR2I(pcb.FromMM(17), pcb.FromMM(29)))
            before = _serialize(board)
            files, report = component_models(board)
            self.assertEqual(report['status'], 'ready', report)
            self.assertEqual(report['includedReferences'], ['R1', 'R2'])
            self.assertEqual(report['units'], 'm')
            self.assertEqual(report['coordinates']['z'], 'board-y')
            self.assertEqual(report['boardThicknessMm'], 1.6)
            data = files['models/components.glb']
            document = glb_document(data)
            nodes = {node.get('name'): node for node in document['nodes']}
            self.assertAlmostEqual(nodes['R1']['translation'][0], .017, places=6)
            self.assertAlmostEqual(nodes['R1']['translation'][2], .029, places=6)
            self.assertGreater(nodes['R1']['translation'][1], .0015)
            self.assertAlmostEqual(nodes['R2']['translation'][0], .036, places=6)
            self.assertAlmostEqual(nodes['R2']['translation'][2], .062, places=6)
            self.assertLess(nodes['R2']['translation'][1], .00001)
            self.assertNotIn(str(directory).encode(), data)
            self.assertEqual(source.read_bytes(), saved_bytes)
            self.assertEqual(_serialize(board), before)
            self.assertEqual(front.Models()[0].m_Filename, '${KIPRJMOD}/parts/body.wrl')
            self.assertEqual(set(directory.iterdir()), {source, directory / 'parts'})

    def test_package_carries_models_and_reports_missing_without_paths(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            board = self.with_models(directory)
            missing = pcb.FOOTPRINT(board)
            missing.SetReference('J3')
            board.Add(missing)
            model = pcb.FP_3DMODEL()
            model.m_Filename = str(directory / 'private-missing.step')
            missing.Models().push_back(model)
            output = directory / 'assembled.overprint-board'
            manifest = export_board(board, output)
            self.assertEqual(manifest['models']['status'], 'partial', manifest['models'])
            self.assertEqual(manifest['models']['missing'][0]['reference'], 'J3')
            with zipfile.ZipFile(output) as archive:
                self.assertIn(manifest['models']['file'], archive.namelist())
                self.assertIn('fabrication/F_Cu.gbr', archive.namelist())
                self.assertFalse(any(name.endswith('.kicad_pcb') for name in archive.namelist()))
                self.assertNotIn(str(directory), archive.read('manifest.json').decode())

    def test_malformed_optional_path_configuration_does_not_break_export(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            board = self.with_models(directory)
            config = directory / 'settings'
            config.mkdir()
            settings = config / 'kicad_common.json'
            project = directory / 'source.kicad_pro'
            for contents in ['[]', '{"environment": []}', '{"environment": {"vars": []}}']:
                settings.write_text(contents)
                project.write_text('{"text_variables": []}')
                with patch.dict('models.os.environ', {'KICAD_CONFIG_HOME': str(config)}):
                    files, report = component_models(board)
                self.assertEqual(report['status'], 'ready', report)
                self.assertIn('models/components.glb', files)

    def test_missing_cli_does_not_break_existing_export(self):
        with patch('models.cli_path', return_value=None):
            files, report = component_models(fixture.ExportTests().board())
        self.assertEqual(files, {})
        self.assertEqual(report['status'], 'unavailable')
        self.assertIn('not found', report['warnings'][0])

    def test_size_limit_omits_models_but_retains_board(self):
        with tempfile.TemporaryDirectory() as temporary:
            board = self.with_models(Path(temporary))
            with patch('models.MAX_MODEL_BYTES', 100):
                files, report = component_models(board)
            self.assertFalse(files)
            self.assertEqual(report['status'], 'unavailable')
            self.assertTrue(report['warnings'])

    def test_model_error_does_not_expose_source_paths(self):
        with patch('models._serialize', side_effect=OSError('/private/customer/source.kicad_pcb')):
            files, report = component_models(fixture.ExportTests().board())
        self.assertFalse(files)
        self.assertEqual(report['status'], 'unavailable')
        self.assertNotIn('/private', json.dumps(report))

    def test_cli_timeout_is_terminated(self):
        import sys
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            with patch('models.EXPORT_TIMEOUT', 0.1):
                with self.assertRaisesRegex(ValueError, 'exceeded'):
                    _run_export([sys.executable, '-c', 'import time; time.sleep(10)'], folder / 'none.glb', folder / 'log')

    def test_external_glb_assets_are_rejected(self):
        document = json.dumps({'meshes': [{}], 'buffers': [{'uri': 'https://example.org/private.bin'}]}).encode()
        document += b' ' * (-len(document) % 4)
        data = struct.pack('<4sII', b'glTF', 2, 28 + len(document))
        data += struct.pack('<II', len(document), 0x4E4F534A) + document + struct.pack('<II', 0, 0x004E4942)
        with self.assertRaisesRegex(ValueError, 'external'):
            _clean_glb(data, set())


if __name__ == '__main__':
    unittest.main()
