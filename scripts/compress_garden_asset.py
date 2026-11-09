import bpy
import json,struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='DESELECT')
objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
for o in objects:o.hide_set(False);o.select_set(True)
bpy.context.view_layer.objects.active=objects[0]
raw=ROOT/'game-assets/environments/garden.glb'
blob=raw.read_bytes()
document=json.loads(blob[20:20+struct.unpack_from('<I',blob,12)[0]])
if 'EXT_meshopt_compression' not in document.get('extensionsUsed',[]):
    (ROOT/'game-assets/source/garden-uncompressed.glb').write_bytes(blob)
bpy.ops.export_scene.gltf(filepath=str(raw),export_format='GLB',use_selection=True,export_animations=False,export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_meshopt_compression_enable=True,export_meshopt_extension='EXT_meshopt_compression')
print('COMPRESSED_GARDEN_BYTES',raw.stat().st_size)
