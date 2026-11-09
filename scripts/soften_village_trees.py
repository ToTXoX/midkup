"""Replace angular woodland with shorter, rounded garden trees after user feedback."""
from pathlib import Path
import bpy
import math
import random
from mathutils import Vector

ROOT=Path(r'C:\Users\qiank\Desktop\apprun\3d\mudkip')
scene=bpy.context.scene
L=scene['design_body_length']
rng=random.Random(25803)
old=bpy.data.collections.get('Village Woodland Kenney CC0')
if old:
    old.hide_render=True
    old.hide_viewport=True
if bpy.data.collections.get('Village Soft Garden Trees'):
    raise RuntimeError('Rounded trees already exist')
trees=bpy.data.collections.new('Village Soft Garden Trees')
scene.collection.children.link(trees)

def color(hexcode):
    v=[int(hexcode[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in v)+(1,)

def material(name,hexcode):
    m=bpy.data.materials.new(name)
    m.use_nodes=True;m.diffuse_color=color(hexcode)
    shader=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value=color(hexcode)
    shader.inputs['Roughness'].default_value=.9
    return m

leaf_base=material('Soft tree leaves fresh green','78A362')
leaf_sun=material('Soft tree leaves sunlit tips','91B474')
leaf_shade=material('Soft tree leaves gentle shade','689456')
wood=material('Soft tree warm bark','A17E52')

def branch(name,points,radius):
    data=bpy.data.curves.new(name,'CURVE')
    data.dimensions='3D';data.bevel_depth=radius*L;data.bevel_resolution=3
    sp=data.splines.new('BEZIER');sp.bezier_points.add(len(points)-1)
    for i,(p,co) in enumerate(zip(sp.bezier_points,points)):
        p.co=Vector(co)*L;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
        p.radius=1-i*.14
    obj=bpy.data.objects.new(name,data);trees.objects.link(obj);data.materials.append(wood)
    return obj

def foliage(name,loc,size,mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=16,radius=1,location=Vector(loc)*L)
    obj=bpy.context.object;obj.name=name
    for c in list(obj.users_collection):c.objects.unlink(obj)
    trees.objects.link(obj)
    # Very small broad undulations soften the silhouette without making sharp spikes.
    for v in obj.data.vertices:
        co=v.co
        factor=1+.025*math.sin(co.x*5+co.y*2)*math.cos(co.z*4)
        co*=factor
    obj.scale=Vector(size)*L
    obj.data.materials.append(mat)
    for p in obj.data.polygons:p.use_smooth=True
    return obj

placements=[
    (-3.62,3.65,2.35),(-3.5,5.75,2.45),
    (-.10,6.05,2.15),(1.65,5.85,2.35),(3.65,5.3,2.4),
    (3.95,3.15,2.05),(-4.02,.95,1.65),(4.12,1.15,1.40)]

for index,(x,y,h) in enumerate(placements):
    root=bpy.data.objects.new('Soft garden tree %02d'%index,None)
    trees.objects.link(root)
    root['game_role']='decorative_tree'
    root['style']='Rounded layered canopy; custom modeled; no pointed pine or cube foliage'
    created=[]
    created.append(branch('Soft tree %02d curved trunk'%index,[(x,y,.025),(x-.035,y,h*.29),(x+.025,y+.015,h*.57),(x-.015,y,h*.73)],.062*h))
    for sign in (-1,1):
        created.append(branch('Soft tree %02d hidden canopy branch'%index,[(x,y,h*.42),(x+sign*.12*h,y,h*.57),(x+sign*.22*h,y+.015,h*.69)],.027*h))
    # Broad overlapping lobes, all smooth and close in color.
    blobs=[
        (0,.01,.78,.26,.24,.24,leaf_base),
        (-.19,.00,.74,.21,.21,.205,leaf_base),
        (.19,.025,.75,.205,.20,.205,leaf_shade),
        (-.10,-.12,.67,.21,.19,.19,leaf_base),
        (.12,-.13,.68,.205,.185,.18,leaf_base),
        (-.07,.05,.91,.20,.19,.17,leaf_sun),
        (.115,.075,.88,.18,.18,.17,leaf_sun)]
    for n,(dx,dy,z,sx,sy,sz,mat) in enumerate(blobs):
        created.append(foliage('Soft tree %02d rounded crown %02d'%(index,n),(x+dx*h,y+dy*h,z*h),(sx*h,sy*h,sz*h),mat))
    bpy.context.view_layer.update()
    root.location=Vector((x,y,0))*L
    bpy.context.view_layer.update()
    for obj in created:
        world=obj.matrix_world.copy();obj.parent=root;obj.matrix_world=world

scene.camera=bpy.data.objects['Camera Garden Overview']
scene.camera.data.ortho_scale=14.2*L
scene['asset_stage']='Village garden v03: Littleroot cottage with rounded, shorter, sparse custom garden trees'
scene['third_party_assets']='Kenney CC0 trees retained in hidden archive only; visible trees are custom modeled. See docs/asset-credits.md'
scene.render.filepath=str(ROOT/'renders/garden-village-overview-v03.png')
bpy.ops.object.select_all(action='DESELECT')
root=bpy.data.objects['Littleroot style cottage'];root.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'mudkip-garden-v03.blend'))
print('ROUNDED TREES SAVED',len(placements),'shorter garden trees')
