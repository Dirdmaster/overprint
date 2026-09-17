"""Validate a built PCM ZIP: python validate_package.py ARCHIVE KICAD_SCHEMA.

Requires the development-only jsonschema package. The installed plugin has no
third-party Python dependencies. Use the schema shipped by the target KiCad.
"""
import json
import sys
import zipfile

from jsonschema import Draft7Validator

with open(sys.argv[2]) as handle:
    schema = json.load(handle)
with zipfile.ZipFile(sys.argv[1]) as archive:
    metadata = json.loads(archive.read('metadata.json'))
    errors = list(Draft7Validator(schema).iter_errors(metadata))
    for error in errors:
        print(f'{list(error.absolute_path)}: {error.message}')
    if errors:
        raise SystemExit(1)
    assert {'plugins/__init__.py', 'plugins/action.py', 'plugins/exporter.py'} <= set(archive.namelist())
    assert not any(key.startswith('download_') for version in metadata['versions'] for key in version)
print('PCM package schema and required plugin files passed')
