"""Build a reproducible, dependency-free PCM archive."""
from pathlib import Path
import zipfile
import json
import argparse

root = Path(__file__).resolve().parent
version = json.loads((root / 'metadata.json').read_text())['versions'][0]['version']
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, help='Destination ZIP (default: dist/versioned ZIP)')
args = parser.parse_args()
output = args.output or root.parents[1] / 'dist' / f'overprint-kicad-{version}.zip'
output.parent.mkdir(parents=True, exist_ok=True)
files = {'metadata.json': root / 'metadata.json', 'plugins/LICENSE': root.parents[1] / 'LICENSE'}
files.update({f'plugins/{path.name}': path for path in (root / 'overprint_export').glob('*.py')})
files.update({f'plugins/{name}': root / 'overprint_export' / name for name in ['icon.png', 'icon-dark.png']})
files['resources/icon.png'] = root / 'resources/icon.png'
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name, path in sorted(files.items()):
        info = zipfile.ZipInfo(name, date_time=(2026, 9, 15, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, path.read_bytes())
print(output)
