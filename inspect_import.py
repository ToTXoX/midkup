import bpy
from pathlib import Path

root = Path(r'C:\Users\qiank\Desktop\apprun\3d\mudkip')
source = root / 'models/mudkip-original/extracted/Pokemon XY/Mudkip/Mudkip.FBX'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(source))
for obj in bpy.data.objects:
    print('OBJECT', obj.name, obj.type, tuple(obj.dimensions))
for mat in bpy.data.materials:
    print('MATERIAL', mat.name)
    if mat.node_tree:
        for node in mat.node_tree.nodes:
            print(' NODE', node.type, getattr(getattr(node, 'image', None), 'filepath', ''))
for img in bpy.data.images:
    print('IMAGE', img.name, img.filepath)
