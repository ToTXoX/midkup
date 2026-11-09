from pathlib import Path
import bpy
from mathutils import Vector,Matrix
ROOT=Path(r'C:\Users\qiank\Desktop\apprun\3d\mudkip')
ASSETS=ROOT/'models/kaykit-forest/extracted/KayKit_Forest_Nature_Pack_1.0_FREE/Assets/gltf'
bpy.ops.wm.read_factory_settings(use_empty=True)
s=bpy.context.scene
for i,name in enumerate(('Tree_1_A_Color1','Tree_2_A_Color1','Tree_3_A_Color1','Tree_4_A_Color1')):
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(ASSETS/(name+'.gltf')))
    added=set(bpy.data.objects)-before
    bpy.context.view_layer.update()
    obj=next(o for o in added if o.type=='MESH')
    data=obj.data.copy();data.transform(obj.matrix_world)
    zmin=min(v.co.z for v in data.vertices);zmax=max(v.co.z for v in data.vertices)
    base=[v.co for v in data.vertices if v.co.z<zmin+.10]
    origin=Vector((sum(v.x for v in base)/len(base),sum(v.y for v in base)/len(base),zmin))
    data.transform(Matrix.Translation(-origin))
    tree=bpy.data.objects.new(name,data);s.collection.objects.link(tree)
    tree.location=((i-1.5)*3,0,0);tree.scale=(2.5/(zmax-zmin),)*3
    for o in added:bpy.data.objects.remove(o,do_unlink=True)
    text=bpy.data.curves.new(name+' label','FONT');text.body=name.replace('_Color1','');text.size=.29;text.align_x='CENTER'
    label=bpy.data.objects.new(name+' label',text);s.collection.objects.link(label)
    label.location=((i-1.5)*3,-.5,-.30);label.rotation_euler=(1.5708,0,0)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.34))
mat=bpy.data.materials.new('Preview grey');mat.use_nodes=True
node=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
node.inputs['Base Color'].default_value=(.16,.18,.17,1)
bpy.context.object.data.materials.append(mat)
world=bpy.data.worlds.new('Preview World');world.use_nodes=True
next(n for n in world.node_tree.nodes if n.type=='BACKGROUND').inputs[1].default_value=.45;s.world=world
for name,loc,energy,size in [('Key',(-4,-6,8),1500,5),('Fill',(5,-2,5),700,5)]:
    d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.size=size
    o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=loc;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.cameras.new('Catalog');d.type='ORTHO';d.ortho_scale=13
camera=bpy.data.objects.new('Catalog',d);s.collection.objects.link(camera)
camera.location=(1,-16,6);camera.rotation_euler=(Vector((0,0,1))-camera.location).to_track_quat('-Z','Y').to_euler();s.camera=camera
s.render.resolution_x=1400;s.render.resolution_y=650;s.render.resolution_percentage=100
s.render.image_settings.file_format='PNG';s.render.filepath=str(ROOT/'renders/kaykit-tree-selection.png')
bpy.ops.render.render(write_still=True)
