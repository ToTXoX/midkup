"""Try option A, the original Quaternius Stylized Tree Pack, in the existing garden."""
from pathlib import Path
import bpy
import math
from mathutils import Vector, Matrix

ROOT=Path(r'C:\Users\qiank\Desktop\apprun\3d\mudkip')
ASSETS=ROOT/'models/quaternius-stylized-trees/extracted/Textured Stylized Trees - May 2020'
scene=bpy.context.scene
L=scene['design_body_length']
if bpy.data.collections.get('Village Quaternius A Trees'):
    raise RuntimeError('Option A already placed')

# Native .blend library loading does not execute embedded scripts.
source_collection=bpy.data.collections.get('Quaternius A Source Trees')
if source_collection is None:
    source_collection=bpy.data.collections.new('Quaternius A Source Trees')
    scene.collection.children.link(source_collection)
for name in ('Tree_1','Tree_3','Tree_5','Tree_7'):
    if bpy.data.objects.get('Quaternius A source '+name) is None:
        with bpy.data.libraries.load(str(ASSETS/'Blends'/(name+'.blend')),link=False) as (src,dst):
            dst.objects=[name]
        obj=dst.objects[0]
        source_collection.objects.link(obj)
        obj.name='Quaternius A source '+name
source_collection.hide_render=True
source_collection.hide_viewport=True

# The old source blend files refer to pre-release texture filenames.
# Relink to the matching published textures while preserving the original shaders and UVs.
leaf_image=bpy.data.images.load(str(ASSETS/'Textures/Tree_Leaves.png'),check_existing=True)
bark_image=bpy.data.images.load(str(ASSETS/'Textures/Tree_Bark.jpg'),check_existing=True)
print('TEXTURES',leaf_image.name,tuple(leaf_image.size),bark_image.name,tuple(bark_image.size))
unused_images=set()
for obj in source_collection.objects:
    for material in obj.data.materials:
        for node in material.node_tree.nodes:
            if node.type=='TEX_IMAGE':
                old=node.image
                node.image=leaf_image if 'Leaves' in material.name else bark_image
                if old and old not in (leaf_image,bark_image):unused_images.add(old)
        if 'Leaves' in material.name:
            methods=[i.identifier for i in material.bl_rna.properties['surface_render_method'].enum_items]
            if 'DITHERED' in methods:material.surface_render_method='DITHERED'
        material.use_backface_culling=False
for image in unused_images:
    if image.users==0:bpy.data.images.remove(image)

visible=bpy.data.collections.new('Village Quaternius A Trees')
scene.collection.children.link(visible)
bpy.context.view_layer.update()
prototypes={}
for name in ('Tree_1','Tree_3','Tree_5','Tree_7'):
    source=bpy.data.objects['Quaternius A source '+name]
    mesh=source.data.copy()
    mesh.name='Quaternius '+name+' original mesh'
    mesh.transform(source.matrix_world)
    zmin=min(v.co.z for v in mesh.vertices)
    zmax=max(v.co.z for v in mesh.vertices)
    base=[v.co for v in mesh.vertices if v.co.z<zmin+(zmax-zmin)*.02]
    origin=Vector((sum(v.x for v in base)/len(base),sum(v.y for v in base)/len(base),zmin))
    mesh.transform(Matrix.Translation(-origin))
    prototypes[name]=(source,mesh,zmax-zmin)

# Match the established composition; two repeated species use shared mesh data.
placements=[
    ('Tree_1',-3.62,3.65,2.35,.30),
    ('Tree_3',-3.50,5.75,2.45,1.20),
    ('Tree_7',1.65,5.85,2.35,-.40),
    ('Tree_5',3.65,5.30,2.40,2.00),
    ('Tree_1',3.95,3.15,2.05,-.80)]
for i,(name,x,y,height,rotation) in enumerate(placements):
    source,mesh,source_height=prototypes[name]
    obj=source.copy()
    obj.data=mesh
    obj.name='Village A tree %02d %s'%(i,name)
    visible.objects.link(obj)
    obj.matrix_world=Matrix.Identity(4)
    obj.location=Vector((x,y,.025))*L
    obj.scale=(height*L/source_height,)*3
    obj.rotation_euler.z=rotation
    obj.hide_render=False
    obj.hide_set(False)
    obj['source']='https://quaternius.com/packs/stylizedtree.html'
    obj['download_source']='https://opengameart.org/content/lowpoly-textured-trees'
    obj['license']='CC0 1.0'
    obj['source_file']=name+'.blend'
    obj['modifications']='Uniform scale, translation and rotation; original geometry, UVs and published textures retained'

for name in ('Village Soft Garden Trees','Village Woodland Kenney CC0'):
    collection=bpy.data.collections.get(name)
    if collection:collection.hide_render=True;collection.hide_viewport=True

scene['asset_stage']='Village v05 option A: Quaternius Stylized Tree Pack broadleaf trees; three small pines retained'
scene['third_party_assets']='Quaternius Stylized Tree Pack CC0; Kenney small pines CC0; see docs/asset-credits.md'
scene.camera=bpy.data.objects['Camera Garden Overview']
scene.render.filepath=str(ROOT/'renders/garden-quaternius-A-overview-v05.png')
scene.render.resolution_percentage=100
bpy.ops.object.select_all(action='DESELECT')
root=bpy.data.objects['Littleroot style cottage']
root.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'mudkip-garden-v05-A.blend'))
print('OPTION A SAVED',len(visible.objects),'broadleaf trees; small pines unchanged')
