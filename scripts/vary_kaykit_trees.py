"""Mix original flat and round KayKit canopies while retaining the existing pines."""
from pathlib import Path
import bpy
from mathutils import Vector,Matrix

ROOT=Path(r'C:\Users\qiank\Desktop\apprun\3d\mudkip')
ASSETS=ROOT/'models/kaykit-forest/extracted/KayKit_Forest_Nature_Pack_1.0_FREE/Assets/gltf'
scene=bpy.context.scene
L=scene['design_body_length']
if bpy.data.collections.get('Village KayKit Mixed Trees'):
    raise RuntimeError('Mixed tree layout already exists')
sources=bpy.data.collections['KayKit B Source Trees']
prototypes={}
for name in ('Tree_3_A_Color1','Tree_3_C_Color1'):
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(ASSETS/(name+'.gltf')))
    imported=set(bpy.data.objects)-before
    bpy.context.view_layer.update()
    original=next(o for o in imported if o.type=='MESH')
    data=original.data.copy()
    data.name='KayKit '+name+' original mesh'
    data.transform(original.matrix_world)
    low=Vector(tuple(min(v.co[i] for v in data.vertices) for i in range(3)))
    high=Vector(tuple(max(v.co[i] for v in data.vertices) for i in range(3)))
    base=[v.co for v in data.vertices if v.co.z<low.z+(high.z-low.z)*.025]
    origin=Vector((sum(v.x for v in base)/len(base),sum(v.y for v in base)/len(base),low.z))
    data.transform(Matrix.Translation(-origin))
    prototype=bpy.data.objects.new('KayKit B source '+name,data)
    sources.objects.link(prototype)
    prototype['source']='https://kaylousberg.itch.io/kaykit-forest'
    prototype['source_file']=name+'.gltf';prototype['license']='CC0 1.0'
    prototypes[name]=(data,high.z-low.z,max(high.x-low.x,high.y-low.y))
    for obj in imported:bpy.data.objects.remove(obj,do_unlink=True)

for name in ('Tree_1_A_Color1','Tree_1_B_Color1'):
    data=bpy.data.objects['KayKit B source '+name].data
    low=Vector(tuple(min(v.co[i] for v in data.vertices) for i in range(3)))
    high=Vector(tuple(max(v.co[i] for v in data.vertices) for i in range(3)))
    prototypes[name]=(data,high.z-low.z,max(high.x-low.x,high.y-low.y))

mixed=bpy.data.collections.new('Village KayKit Mixed Trees')
scene.collection.children.link(mixed)
placements=[
    ('Tree_3_A_Color1',-3.72,3.52,1.83,.35),
    ('Tree_1_B_Color1',-3.50,5.75,2.35,1.10),
    ('Tree_3_C_Color1',3.52,5.30,2.15,-.48),
    ('Tree_1_A_Color1',3.95,3.15,1.78,2.35)]
for i,(name,x,y,height,angle) in enumerate(placements):
    data,source_height,source_width=prototypes[name]
    obj=bpy.data.objects.new('Village varied tree %02d %s'%(i,name),data)
    mixed.objects.link(obj)
    obj.location=Vector((x,y,.025))*L
    factor=min(height*L/source_height,2.25*L/source_width)
    obj.scale=(factor,)*3
    obj.rotation_euler.z=angle
    obj['source']='https://kaylousberg.itch.io/kaykit-forest'
    obj['source_file']=name+'.gltf';obj['license']='CC0 1.0'
    obj['canopy_style']='flat rounded' if name.startswith('Tree_3_') else 'rounded'
    obj['modifications']='Uniform scaling, placement and rotation only; original mesh, materials and gradient atlas retained'

old=bpy.data.collections['Village KayKit B Round Trees']
old.hide_viewport=True;old.hide_render=True
scene['asset_stage']='Village v07: two flat rounded KayKit trees, two round KayKit trees and three retained small pines'
scene.camera=bpy.data.objects['Camera Garden Overview']
scene.render.filepath=str(ROOT/'renders/garden-kaykit-mixed-overview-v07.png')
bpy.ops.object.select_all(action='DESELECT')
root=bpy.data.objects['Littleroot style cottage'];root.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'mudkip-garden-v07-mixed.blend'))
print('MIXED TREES SAVED',len(mixed.objects),'KayKit trees; existing small pines retained')
