"""Run with KiCad 10 Python. Original synthetic geometry, no third-party board assets."""
import base64, ctypes, ctypes.util, hashlib, json, re, subprocess, tempfile
from pathlib import Path
import wx
app = wx.App(False)
import pcbnew as pcb
HERE = Path(__file__).resolve().parent
CLI = '/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli'
vec = lambda x,y: pcb.VECTOR2I(pcb.FromMM(x), pcb.FromMM(y))
def board(points, thickness):
    b=pcb.BOARD(); b.GetDesignSettings().SetBoardThickness(pcb.FromMM(thickness))
    for a,c in zip(points,points[1:]+points[:1]):
        s=pcb.PCB_SHAPE(b); s.SetShape(pcb.SHAPE_T_SEGMENT); s.SetLayer(pcb.Edge_Cuts)
        s.SetStart(vec(*a)); s.SetEnd(vec(*c)); s.SetWidth(pcb.FromMM(.05)); b.Add(s)
    return b
with tempfile.TemporaryDirectory() as tmp:
    tmp=Path(tmp); src=tmp/'body.kicad_pcb'; step=tmp/'body.step'
    pcb.SaveBoard(str(src),board([(0,0),(4,0),(4,1),(1,3),(0,3)],1))
    subprocess.run([CLI,'pcb','export','step','--force','--board-only','--user-origin','0x0mm','-o',str(step),str(src)],check=True)
    normalized=re.sub(r"FILE_NAME\('body.step','[^']+'", "FILE_NAME('body.step','2000-01-01T00:00:00'", step.read_text())
    model=('\n'.join(line.rstrip() for line in normalized.splitlines())+'\n').encode()
    step.write_bytes(model); (HERE/'embedded-body.step').write_bytes(model)
    b=board([(10,10),(60,10),(60,50),(10,50)],1.6)
    for ref,pos,angle,back,rot,scale,offset in [('U1',(20,20),30,False,(15,25,35),(1,1.5,.75),(.5,-.3,.2)),('U2',(40,35),120,True,(10,20,30),(1.2,.8,1.1),(.2,.4,.6))]:
        fp=pcb.FOOTPRINT(b); fp.SetReference(ref); fp.Value().SetVisible(False); fp.Reference().SetVisible(False); b.Add(fp)
        fp.SetPosition(vec(*pos))
        if back: fp.Flip(fp.GetPosition(),False)
        fp.SetOrientationDegrees(angle)
        m=pcb.FP_3DMODEL(); m.m_Filename=str(step); m.m_Rotation=pcb.VECTOR3D(*rot); m.m_Scale=pcb.VECTOR3D(*scale); m.m_Offset=pcb.VECTOR3D(*offset); fp.Models().push_back(m)
    local=tmp/'assembly.kicad_pcb'; pcb.SaveBoard(str(local),b)
    # Native component-only GLB is the independent placement oracle.
    subprocess.run([CLI,'pcb','export','glb','--force','--no-board-body','--user-origin','0x0mm','-o',str(HERE/'embedded-native.glb'),str(local)],check=True)
    z=ctypes.CDLL(ctypes.util.find_library('zstd') or '/opt/homebrew/lib/libzstd.dylib')
    z.ZSTD_compressBound.argtypes=[ctypes.c_size_t]; z.ZSTD_compressBound.restype=ctypes.c_size_t
    z.ZSTD_compress.argtypes=[ctypes.c_void_p,ctypes.c_size_t,ctypes.c_void_p,ctypes.c_size_t,ctypes.c_int]; z.ZSTD_compress.restype=ctypes.c_size_t
    out=ctypes.create_string_buffer(z.ZSTD_compressBound(len(model))); size=z.ZSTD_compress(out,len(out),model,len(model),15)
    payload=base64.b64encode(out.raw[:size]).decode()
    # SHA256 is a native-supported embedded checksum (KiCad also reads Murmur128).
    entry=f'(embedded_files (file (name "body.step") (type model) (data |{payload}|) (checksum "{hashlib.sha256(model).hexdigest()}")))'
    text=local.read_text().replace(str(step),'kicad-embed://body.step')
    target=HERE/'embedded-models.kicad_pcb'; target.write_text(text.rstrip()[:-1]+entry+'\n)\n')
    # Verify native KiCad can resolve our embedded payload and export it too.
    subprocess.run([CLI,'pcb','export','glb','--force','--no-board-body','--user-origin','0x0mm','-o',str(tmp/'embedded.glb'),str(target)],check=True)
