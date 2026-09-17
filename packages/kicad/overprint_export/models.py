"""Optional component-only GLB export from a private, in-memory board snapshot."""
import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import time

import pcbnew as pcb

MODEL_FILE = 'models/components.glb'
MAX_MODEL_BYTES = 8 * 1024 * 1024
MAX_SNAPSHOT_BYTES = 50 * 1024 * 1024
EXPORT_TIMEOUT = 60


def cli_path():
    """Find the CLI shipped with the running KiCad before using PATH."""
    names = ('kicad-cli.exe', 'kicad-cli') if sys.platform == 'win32' else ('kicad-cli',)
    candidates = [Path(sys.executable).parent, Path(pcb.__file__).parent]
    for parent in Path(pcb.__file__).parents:
        candidates.append(parent / 'bin')
        if parent.name == 'Contents':
            candidates.insert(0, parent / 'MacOS')
        if parent.name.lower() in ('bin', 'kicad'):
            candidates.append(parent)
    for directory in candidates:
        for name in names:
            candidate = directory / name
            if candidate.is_file() and os.access(candidate, os.X_OK):
                return str(candidate)
    return shutil.which(names[0])


def _variables(board, executable):
    values = {}
    if sys.platform == 'darwin':
        config = Path.home() / 'Library/Preferences/kicad/10.0'
    elif sys.platform == 'win32':
        config = Path(os.environ.get('APPDATA', str(Path.home()))) / 'kicad/10.0'
    else:
        config = Path(os.environ.get('XDG_CONFIG_HOME', str(Path.home() / '.config'))) / 'kicad/10.0'
    config = Path(os.environ.get('KICAD_CONFIG_HOME', str(config)))
    def read_object(path):
        try:
            if path.stat().st_size > 1024 * 1024:
                return {}
            value = json.loads(path.read_text())
            return value if isinstance(value, dict) else {}
        except (OSError, ValueError):
            return {}

    environment = read_object(config / 'kicad_common.json').get('environment', {})
    if isinstance(environment, dict):
        configured = environment.get('vars', {})
        if isinstance(configured, dict):
            values.update(configured)
    source = Path(board.GetFileName()) if board.GetFileName() else None
    if source:
        project_variables = read_object(source.with_suffix('.kicad_pro')).get('text_variables', {})
        if isinstance(project_variables, dict):
            values.update(project_variables)
    values.update(os.environ)
    if source:
        values['KIPRJMOD'] = str(source.resolve().parent)
    if 'KICAD10_3DMODEL_DIR' not in values:
        roots = [Path(executable).parent.parent / 'share/kicad/3dmodels', Path('/usr/share/kicad/3dmodels')]
        if sys.platform == 'darwin':
            roots.insert(0, Path(executable).parent.parent / 'SharedSupport/3dmodels')
        for root in roots:
            if root.is_dir():
                values['KICAD10_3DMODEL_DIR'] = str(root)
                break
    return values


def _resolve_model(name, board, values):
    # Avoid passing SWIG project pointers into KiCad's environment resolver: the
    # pointer returned by a standalone LoadBoard can be invalid in KiCad 10.
    candidate = name
    for _ in range(8):
        expanded = re.sub(r'\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z_0-9]*)',
                          lambda m: str(values.get(m.group(1) or m.group(2), m.group(0))), candidate)
        if expanded == candidate:
            break
        candidate = expanded
    if '$' in candidate or candidate.startswith('kicad-embed:'):
        return None
    path = Path(candidate).expanduser()
    if not path.is_absolute():
        if not board.GetFileName():
            return None
        path = Path(board.GetFileName()).resolve().parent / path
    # KiCad's GLB exporter needs a solid CAD model; replace legacy WRL references.
    choices = [path] if path.suffix.lower() in ('.step', '.stp', '.iges', '.igs') else []
    if path.suffix.lower() == '.wrl':
        choices = [path.with_suffix(ext) for ext in ('.step', '.stp', '.iges', '.igs', '.STEP', '.STP')]
    for resolved in choices:
        if resolved.is_file():
            return resolved.resolve()
    return None


def _serialize(board):
    formatter = pcb.STRING_FORMATTER()
    pcb.PCB_IO_KICAD_SEXPR().FormatBoardToFormatter(formatter, board)
    data = formatter.GetString().encode('utf-8')
    if len(data) > MAX_SNAPSHOT_BYTES:
        raise ValueError('Board snapshot exceeds the 50 MB assembled-preview limit.')
    return data


def _run_export(command, output, log_path):
    # Logs stay local and bounded. Never copy CLI diagnostics (which contain file paths)
    # into a downloadable board package.
    with log_path.open('w+b') as log:
        process = subprocess.Popen(command, stdout=log, stderr=log,
                                   creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0)
        deadline = time.monotonic() + EXPORT_TIMEOUT
        try:
            while process.poll() is None:
                if time.monotonic() >= deadline:
                    raise ValueError('Component export exceeded 60 seconds.')
                if output.exists() and output.stat().st_size > MAX_MODEL_BYTES:
                    raise ValueError('Component models exceed the 8 MB assembled-preview limit.')
                if log_path.stat().st_size > 1024 * 1024:
                    raise ValueError('KiCad produced too many model-export diagnostics.')
                time.sleep(0.05)
            if process.returncode:
                raise ValueError('KiCad could not export the component models.')
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()


def _clean_glb(data, references):
    if len(data) > MAX_MODEL_BYTES:
        raise ValueError('Component models exceed the 8 MB assembled-preview limit.')
    if len(data) < 28 or struct.unpack_from('<4sII', data) != (b'glTF', 2, len(data)):
        raise ValueError('KiCad returned an invalid component GLB.')
    chunks = []
    offset = 12
    while offset < len(data):
        if offset + 8 > len(data):
            raise ValueError('Truncated component GLB.')
        length, kind = struct.unpack_from('<II', data, offset)
        offset += 8
        if length % 4 or offset + length > len(data):
            raise ValueError('Truncated component GLB.')
        chunks.append((kind, data[offset:offset + length]))
        offset += length
    if len(chunks) != 2 or chunks[0][0] != 0x4E4F534A or chunks[1][0] != 0x004E4942:
        raise ValueError('Component GLB must contain embedded geometry.')
    document = json.loads(chunks[0][1])
    if not document.get('meshes'):
        raise ValueError('KiCad did not export any component geometry.')
    nodes = document.get('nodes', [])
    included = sorted({node['name'] for node in nodes if node.get('name') in references
                       and ('mesh' in node or node.get('children'))})

    def clean(value):
        if isinstance(value, dict):
            if 'uri' in value:
                raise ValueError('Component GLB contains an external asset reference.')
            # Source filenames, model names and other CAD metadata are not needed.
            value.pop('extras', None)
            if 'name' in value and value['name'] not in references:
                value.pop('name')
            for child in value.values():
                clean(child)
        elif isinstance(value, list):
            for child in value:
                clean(child)
    clean(document)
    payload = json.dumps(document, separators=(',', ':')).encode('utf-8')
    payload += b' ' * (-len(payload) % 4)
    binary = chunks[1][1]
    result = struct.pack('<4sII', b'glTF', 2, 28 + len(payload) + len(binary))
    result += struct.pack('<II', len(payload), chunks[0][0]) + payload
    result += struct.pack('<II', len(binary), chunks[1][0]) + binary
    return result, included


def component_models(board):
    """Return optional files and status. Model failure never prevents 2D/fab export."""
    report = dict(version=1, status='empty', units='m',
                  coordinates=dict(x='board-x', y='toward-front', z='board-y', origin='board-origin-at-back-surface'),
                  boardThicknessMm=round(pcb.ToMM(board.GetDesignSettings().GetBoardThickness()), 6),
                  includedReferences=[], missing=[], warnings=[])
    executable = cli_path()
    if not executable:
        report.update(status='unavailable', warnings=['KiCad CLI was not found. Component preview is unavailable.'])
        return {}, report
    try:
        with tempfile.TemporaryDirectory(prefix='overprint-models-') as temporary:
            folder = Path(temporary)
            snapshot = folder / 'snapshot.kicad_pcb'
            snapshot.write_bytes(_serialize(board))
            # The low-level reader does not replace the live application's project.
            copied = pcb.PCB_IO_KICAD_SEXPR().LoadBoard(str(snapshot), None)
            variables = _variables(board, executable)
            candidates = set()
            for footprint in copied.GetFootprints():
                reference = footprint.GetReference()
                models = footprint.Models()
                visible = [(index, model) for index, model in enumerate(models) if model.m_Show]
                if not visible:
                    report['missing'].append(dict(reference=reference, reason='No visible 3D model is assigned.'))
                for index, model in visible:
                    resolved = _resolve_model(model.m_Filename, board, variables)
                    if resolved:
                        model.m_Filename = str(resolved)
                        candidates.add(reference)
                    else:
                        model.m_Show = False
                        report['missing'].append(dict(reference=reference, reason='A 3D model could not be resolved to a local STEP or IGES file.'))
                    # SWIG vector iteration returns values; write the edited copy back.
                    models[index] = model
            if not candidates:
                if report['missing']:
                    report['status'] = 'unavailable'
                return {}, report
            snapshot.write_bytes(_serialize(copied))
            output = folder / 'components.glb'
            command = [executable, 'pcb', 'export', 'glb', '--no-board-body', '--subst-models',
                       '--user-origin', '0x0mm', '--output', str(output), str(snapshot)]
            _run_export(command, output, folder / 'export.log')
            if not output.exists() or output.stat().st_size > MAX_MODEL_BYTES:
                raise ValueError('Component export is missing or exceeds the 8 MB assembled-preview limit.')
            data, included = _clean_glb(output.read_bytes(), candidates)
            for reference in sorted(candidates - set(included)):
                report['missing'].append(dict(reference=reference, reason='KiCad did not produce geometry for this component.'))
            report.update(status='partial' if report['missing'] else 'ready', file=MODEL_FILE, includedReferences=included)
            return {MODEL_FILE: data}, report
    except (OSError, RuntimeError, ValueError, TypeError, KeyError, struct.error) as error:
        report['status'] = 'unavailable'
        # Only our fixed diagnostics are safe to include; library exceptions can contain paths.
        safe = str(error) if isinstance(error, ValueError) and str(error).startswith(('Component ', 'KiCad ', 'Board snapshot ', 'Truncated ')) else 'Component preview could not be generated.'
        report['warnings'].append(safe)
        return {}, report
