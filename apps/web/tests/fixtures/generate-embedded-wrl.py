"""Generate an original embedded WRL fixture and native KiCad VRML placement oracle."""
import base64, ctypes, ctypes.util, hashlib, re, subprocess, tempfile
from pathlib import Path
HERE=Path(__file__).resolve().parent
CLI='/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli'
z=ctypes.CDLL(ctypes.util.find_library('zstd') or '/opt/homebrew/lib/libzstd.dylib')
z.ZSTD_compressBound.argtypes=[ctypes.c_size_t]; z.ZSTD_compressBound.restype=ctypes.c_size_t
z.ZSTD_compress.argtypes=[ctypes.c_void_p,ctypes.c_size_t,ctypes.c_void_p,ctypes.c_size_t,ctypes.c_int]; z.ZSTD_compress.restype=ctypes.c_size_t
model=(HERE/'embedded-body.wrl').read_bytes(); out=ctypes.create_string_buffer(z.ZSTD_compressBound(len(model))); size=z.ZSTD_compress(out,len(out),model,len(model),15)
payload=base64.b64encode(out.raw[:size]).decode()
entry=f'(file (name "body.wrl") (type model) (data |{payload}|) (checksum "{hashlib.sha256(model).hexdigest()}"))'
text=(HERE/'embedded-models.kicad_pcb').read_text().replace('(embedded_files ', '(embedded_files '+entry+' ')
# Mixed fixture has one STEP component and one WRL component.
(HERE/'embedded-mixed.kicad_pcb').write_text(text.replace('kicad-embed://body.step','kicad-embed://body.wrl',1))
(HERE/'embedded-wrl.kicad_pcb').write_text(text.replace('kicad-embed://body.step','kicad-embed://body.wrl'))
subprocess.run([CLI,'pcb','export','vrml','--force','--units','mm','--user-origin','0x0mm','-o',str(HERE/'embedded-native.wrl'),str(HERE/'embedded-wrl.kicad_pcb')],check=True)
