"""Option B: original rounded KayKit Forest Nature trees, retaining the small pines."""
from pathlib import Path
import bpy
from mathutils import Vector,Matrix

ROOT=Path(r'C:\Users\qiank\Desktop\apprun\3d\mudkip')
ASSETS=ROOT/'models/kaykit-forest/extracted/KayKit_Forest_Nature_Pack_1.0_FREE/Assets/gltf'
scene=bpy.context.scene
L=scene['design_body_length']
if bpy.data.collections.get('Village KayKit B Round Trees'):
    raise RuntimeError('Option B is already placed')

sources=bpy.data.collections.new('KayKit B Source Trees')
visible=bpy.data.collections.new('Village KayKit B Round Trees')
scene.collection.children.link(sources)
scene.collection.children.link(visible)
prototypes={}
for name in ('Tree_1_A_Color1','Tree_1_B_Color1','Tree_1_C_Color1'):
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(ASSETS/(name+'.gltf')))
    added=set(bpy.data.objects)-before
    bpy.context.view_layer.update()
    original=next(o for o in added if o.type=='MESH')
    data=original.data.copy()
    data.name='KayKit '+name+' original mesh'
    data.transform(original.matrix_world)
    zmin=min(v.co.z for v in data.vertices)
    zmax=max(v.co.z for v in data.vertices)
    base=[v.co for v in data.vertices if v.co.z<zmin+(zmax-zmin)*.025]
    origin=Vector((sum(v.x for v in base)/len(base),sum(v.y for v in base)/len(base),zmin))
    data.transform(Matrix.Translation(-origin))
    prototype=bpy.data.objects.new('KayKit B source '+name,data)
    sources.objects.link(prototype)
    prototype['source']='https://kaylousberg.itch.io/kaykit-forest'
    prototype['source_file']=name+'.gltf'
    prototype['license']='CC0 1.0'
    prototypes[name]=(data,zmax-zmin)
    for obj in added:bpy.data.objects.remove(obj,do_unlink=True)

placements=[
    ('Tree_1_A_Color1',-3.62,3.65,2.10,.35),
    ('Tree_1_B_Color1',-3.50,5.75,2.35,1.10),
    ('Tree_1_C_Color1',3.55,5.30,2.30,-.55),
    ('Tree_1_A_Color1',3.95,3.15,1.95,2.2)]
for i,(name,x,y,height,angle) in enumerate(placements):
    data,original_height=prototypes[name]
    obj=bpy.data.objects.new('Village B round tree %02d %s'%(i,name),data)
    visible.objects.link(obj)
    obj.location=Vector((x,y,.025))*L
    obj.scale=(height*L/original_height,)*3
    obj.rotation_euler.z=angle
    obj['source']='https://kaylousberg.itch.io/kaykit-forest'
    obj['source_file']=name+'.gltf'
    obj['license']='CC0 1.0'
    obj['modifications']='Uniform scaling, placement and rotation only; original geometry, UVs and gradient texture retained'
sources.hide_render=True
sources.hide_viewport=True

for name in ('Village Quaternius A Trees','Village Soft Garden Trees','Village Woodland Kenney CC0'):
    old=bpy.data.collections.get(name)
    if old:old.hide_render=True;old.hide_viewport=True

scene['asset_stage']='Village v06 option B: four rounded KayKit trees with three retained small pines'
scene['third_party_assets']='KayKit Forest Nature Pack 1.0 FREE CC0; Kenney small pines CC0. See docs/asset-credits.md'
scene.camera=bpy.data.objects['Camera Garden Overview']
scene.render.filepath=str(ROOT/'renders/garden-kaykit-B-overview-v06.png')
scene.render.resolution_percentage=100
bpy.ops.object.select_all(action='DESELECT')
root=bpy.data.objects['Littleroot style cottage']
root.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'mudkip-garden-v06-B.blend'))
print('OPTION B SAVED',len(visible.objects),'round trees; small pines retained')
