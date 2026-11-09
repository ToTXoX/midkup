"""Reference-inspired Littleroot cottage and CC0 Kenney woodland for garden v02."""
from pathlib import Path
import bpy
import bmesh
import math
import random
from mathutils import Matrix, Vector

ROOT=Path(r'C:\Users\qiank\Desktop\apprun\3d\mudkip')
scene=bpy.context.scene
L=scene['design_body_length']
rng=random.Random(30258)
if bpy.data.collections.get('Village Cottage'):
    raise RuntimeError('Village already added; avoid duplicate geometry')

def coll(name):
    c=bpy.data.collections.new(name)
    scene.collection.children.link(c)
    return c

house=coll('Village Cottage')
forest=coll('Village Woodland Kenney CC0')
fence=coll('Village Fence and Path')
library=coll('Village Tree Source Assets')

def rgb(value):
    v=[int(value[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in v)+(1,)

def mat(name,hexvalue,rough=.8):
    m=bpy.data.materials.new(name)
    m.use_nodes=True
    m.diffuse_color=rgb(hexvalue)
    s=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    s.inputs['Base Color'].default_value=rgb(hexvalue)
    s.inputs['Roughness'].default_value=rough
    s.inputs['Metallic'].default_value=0
    return m

plaster=mat('Cottage warm cream plaster','E8D6A0')
plaster_side=mat('Cottage shaded cream','D8C28C')
timber=mat('Cottage honey timber','AD793B')
timber_dark=mat('Cottage dark joinery','6C5435')
door_mat=mat('Cottage door boards','A5783D')
door_light=mat('Cottage door board highlights','BD8E4B')
roof_gold=mat('Cottage roof golden ochre','CDA336',.72)
roof_light=mat('Cottage roof sunlit tiles','E2BB4C',.70)
roof_mid=mat('Cottage roof warm tiles','D6AB3B',.73)
roof_dark=mat('Cottage roof tile edges','A37824',.78)
fascia=mat('Cottage olive green eaves','4E6248')
window_mat=mat('Cottage pale blue glass','B6D8DF',.25)
window_dark=mat('Cottage glass shade','709DA7',.32)
window_glint=mat('Cottage window soft reflection','E5F0DF',.3)
sill_mat=mat('Cottage ivory trim','F4E7C1')
foundation_mat=mat('Cottage stone footing','9A9B86')
brass=mat('Cottage handle and mailbox flag','C8A34A',.4)
leaves=[mat('Village foliage deep green','276447'),mat('Village foliage middle green','367D4A'),mat('Village foliage sunlit green','58984F')]
bark=mat('Village woodland bark','785538')
mail_mat=mat('Cottage mailbox warm red','B36452')

def move(obj,name,c,material=None):
    obj.name=name
    for old in list(obj.users_collection):old.objects.unlink(obj)
    c.objects.link(obj)
    if material:obj.data.materials.append(material)
    return obj

def box(name,location,dimensions,material,c=house,r=.015):
    bpy.ops.mesh.primitive_cube_add(size=1,location=Vector(location)*L)
    o=move(bpy.context.object,name,c,material)
    o.dimensions=Vector(dimensions)*L
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if r:
        m=o.modifiers.new('Soft modeled edges','BEVEL');m.width=r*L;m.segments=2
        o.modifiers.new('Surface normals','WEIGHTED_NORMAL')
    return o

def mesh(name,verts,faces,material,c=house):
    d=bpy.data.meshes.new(name)
    d.from_pydata([tuple(Vector(v)*L) for v in verts],[],faces);d.update()
    o=bpy.data.objects.new(name,d);c.objects.link(o)
    d.materials.append(material)
    return o

def curve(name,points,radius,material,c=house,closed=False):
    d=bpy.data.curves.new(name,'CURVE');d.dimensions='3D'
    d.bevel_depth=radius*L;d.bevel_resolution=2
    s=d.splines.new('POLY');s.points.add(len(points)-1)
    for p,v in zip(s.points,points):p.co=(*tuple(Vector(v)*L),1)
    s.use_cyclic_u=closed
    o=bpy.data.objects.new(name,d);c.objects.link(o);d.materials.append(material)
    return o

def ball(name,loc,scale,material,c=house):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=1,location=Vector(loc)*L)
    o=move(bpy.context.object,name,c,material);o.scale=Vector(scale)*L
    for p in o.data.polygons:p.use_smooth=True
    return o

# Grow the far ground, preserving the foreground, basin and pet placement.
for name in ('Garden grass terrain with recessed pond','Garden rounded soil foundation','Garden lower soil band'):
    o=bpy.data.objects[name];inverse=o.matrix_world.inverted()
    for vertex in o.data.vertices:
        world=o.matrix_world@vertex.co
        y=world.y/L
        if y>3.2:
            world.y+=(y-3.2)/(4.5-3.2)*2.0*L
            vertex.co=inverse@world
    o.data.update()

# Preserve v01 components in the working file but replace their visible forms.
for o in bpy.data.collections['Garden Plants'].objects:
    if 'garden tree' in o.name.lower():
        o.hide_render=True;o.hide_set(True)
for o in bpy.data.collections['Garden Props'].objects:
    if o.name.startswith('Fence '):o.hide_render=True;o.hide_set(True)

# The cottage fits behind all three target lanes.
HX,HY=-1.25,4.45
def pos(x,y,z):return (HX+x,HY+y,z)
root=bpy.data.objects.new('Littleroot style cottage',None);house.objects.link(root)
root['design_reference']='User-provided Littleroot Town screenshot; custom modeled cottage'
root['game_role']='background_cottage'
root['footprint_L']='center -1.25,4.45; walls 2.90 x 2.05; roof 3.46 x 2.62'

box('Cottage stone plinth',pos(0,0,.12),(3.02,2.15,.20),foundation_mat,r=.045)
box('Cottage main plaster walls',pos(0,0,.83),(2.90,2.05,1.35),plaster,r=.018)
front=-1.035
for x in (-1.44,1.44):
    box('Cottage front corner post',pos(x,front-.02,.85),(.13,.14,1.45),timber)
    box('Cottage rear corner post',pos(x,1.02,.85),(.12,.12,1.45),timber)
box('Cottage front base beam',pos(0,front-.04,.27),(2.93,.11,.17),timber)
box('Cottage front upper beam',pos(0,front-.04,1.43),(2.96,.13,.14),timber)
for x in (-1.47,1.47):
    box('Cottage side base beam',pos(x,0,.27),(.10,2.08,.17),timber)
    box('Cottage side upper beam',pos(x,0,1.43),(.10,2.08,.12),timber)

# Door boards and surrounding joinery.
box('Cottage doorway dark recess',pos(0,front-.062,.75),(.76,.055,1.08),timber_dark)
for i in range(5):
    box('Cottage door vertical plank %02d'%i,pos(-.28+i*.14,front-.10,.76),(.132,.042,.99),door_mat if i%2 else door_light,r=.006)
for x in (-.38,.38):box('Cottage door jamb',pos(x,front-.13,.77),(.085,.09,1.16),timber)
box('Cottage door lintel',pos(0,front-.14,1.35),(.85,.10,.12),timber)
box('Cottage door lower crosspiece',pos(0,front-.135,.43),(.66,.03,.055),timber_dark,r=.005)
ball('Cottage door brass knob',pos(.225,front-.163,.79),(.027,.025,.027),brass)
box('Cottage doorstep upper',pos(0,front-.23,.145),(.91,.43,.18),foundation_mat,r=.026)
box('Cottage doorstep lower',pos(0,front-.48,.075),(1.05,.30,.085),foundation_mat,r=.022)

def front_window(name,x,z=.86):
    y=front-.09
    box(name+' timber surround',pos(x,y,z),(.70,.07,.61),timber_dark)
    box(name+' ivory inset',pos(x,y-.045,z),(.61,.025,.52),sill_mat,r=.005)
    box(name+' blue panes',pos(x,y-.065,z),(.53,.02,.44),window_mat,r=.005)
    box(name+' middle mullion',pos(x,y-.085,z),(.035,.025,.46),timber,r=.003)
    box(name+' bottom sill',pos(x,y-.105,z-.32),(.79,.17,.07),timber,r=.01)
    for dx in (-.15,.15):
        glint=box(name+' diagonal reflection',pos(x+dx,y-.081,z+.065),(.025,.006,.24),window_glint,r=.001)
        glint.rotation_euler.y=math.radians(-28)

front_window('Cottage left window',-.98)
front_window('Cottage right window',.98)
box('Cottage door transom trim',pos(0,front-.12,1.48),(.43,.06,.15),timber_dark,r=.008)
box('Cottage door transom glass',pos(0,front-.16,1.48),(.34,.025,.08),window_mat,r=.004)

# The right facade is visible from the main camera.
for yy in (-.40,.48):
    box('Cottage side window surround',pos(1.48,yy,.91),(.07,.57,.61),timber_dark)
    box('Cottage side window ivory inset',pos(1.525,yy,.91),(.025,.49,.52),sill_mat,r=.004)
    box('Cottage side blue panes',pos(1.545,yy,.91),(.018,.42,.44),window_dark,r=.003)
    box('Cottage side window mullion',pos(1.565,yy,.91),(.022,.033,.46),timber,r=.003)
    box('Cottage side window sill',pos(1.56,yy,.59),(.17,.67,.07),timber)

# Low hipped roof: broad front slope, narrower horizontal ridge, dark green fascia.
W,D,RIDGE=1.73,1.31,.94
EAVE,TOP=1.53,2.57
v=[pos(-W,-D,EAVE),pos(W,-D,EAVE),pos(W,D,EAVE),pos(-W,D,EAVE),pos(-RIDGE,0,TOP),pos(RIDGE,0,TOP)]
roof=mesh('Cottage hipped roof underlay',v,[(0,1,5,4),(3,4,5,2),(1,2,5),(0,4,3)],roof_dark)
solid=roof.modifiers.new('Roof thickness','SOLIDIFY');solid.thickness=.065*L
for y in (-D,D):box('Cottage green front rear fascia',pos(0,y,EAVE-.04),(W*2+.08,.11,.14),fascia,r=.018)
for x in (-W,W):box('Cottage green side fascia',pos(x,0,EAVE-.04),(.11,D*2,.14),fascia,r=.018)

tile_verts=[];tile_faces=[];tile_mats=[]
def tile_patch(corners,shade):
    # Five subdivisions create a subtle convex tile surface across the width.
    a,b,c,d=[Vector(v) for v in corners]
    start=len(tile_verts)
    for row in range(2):
        left,right=(a,b) if row==0 else (d,c)
        for k in range(6):
            t=k/5
            p=left.lerp(right,t)
            p.z+=.012+.012*math.sin(t*math.pi)
            tile_verts.append(tuple(p))
    for k in range(5):
        tile_faces.append((start+k,start+k+1,start+7+k,start+6+k))
        tile_mats.append(shade)

for side in (-1,1):
    for row in range(8):
        t0=row/8;t1=min(1,(row+1.035)/8)
        s0=W+(RIDGE-W)*t0;s1=W+(RIDGE-W)*t1
        cols=round(2*s0/.23)
        for col in range(cols):
            u0=col/cols;u1=(col+.97)/cols
            a=pos(-s0+2*s0*u0,side*D*(1-t0),EAVE+(TOP-EAVE)*t0)
            b=pos(-s0+2*s0*u1,side*D*(1-t0),EAVE+(TOP-EAVE)*t0)
            c=pos(-s1+2*s1*u1,side*D*(1-t1),EAVE+(TOP-EAVE)*t1)
            d=pos(-s1+2*s1*u0,side*D*(1-t1),EAVE+(TOP-EAVE)*t1)
            tile_patch((a,b,c,d),rng.choices([0,1,2],[.45,.20,.35])[0])
for side in (-1,1):
    for row in range(8):
        t0=row/8;t1=min(.997,(row+1.025)/8)
        y0=D*(1-t0);y1=D*(1-t1)
        xx0=side*(W+(RIDGE-W)*t0);xx1=side*(W+(RIDGE-W)*t1)
        cols=max(1,round(2*y0/.23))
        for col in range(cols):
            u0=col/cols;u1=(col+.97)/cols
            tile_patch((pos(xx0,-y0+2*y0*u0,EAVE+(TOP-EAVE)*t0),pos(xx0,-y0+2*y0*u1,EAVE+(TOP-EAVE)*t0),pos(xx1,-y1+2*y1*u1,EAVE+(TOP-EAVE)*t1),pos(xx1,-y1+2*y1*u0,EAVE+(TOP-EAVE)*t1)),rng.randrange(3))
tiles=mesh('Cottage individually shaped golden roof tiles',tile_verts,tile_faces,roof_gold)
tiles.data.materials.append(roof_light);tiles.data.materials.append(roof_mid)
for p,index in zip(tiles.data.polygons,tile_mats):p.material_index=index;p.use_smooth=True
bm=bmesh.new();bm.from_mesh(tiles.data);bm.normal_update()
bmesh.ops.reverse_faces(bm,faces=[f for f in bm.faces if f.normal.z<0])
bm.to_mesh(tiles.data);bm.free()

# Ridge and hip caps produce a silhouette visible from the gameplay camera.
for i in range(10):
    x=-RIDGE+(i+.5)*2*RIDGE/10
    box('Cottage ridge cap %02d'%i,pos(x,0,TOP+.035),(2*RIDGE/10-.008,.15,.09),roof_mid,r=.025)
for xsign in (-1,1):
    for ysign in (-1,1):
        pts=[pos(xsign*(W+(RIDGE-W)*t),ysign*D*(1-t),EAVE+(TOP-EAVE)*t+.024) for t in [j/16 for j in range(17)]]
        curve('Cottage sloping hip cap',pts,.036,roof_dark)

# A small mailbox and doorstep stone trail make the house feel inhabited.
mx,my=HX+1.90,HY-1.24
box('Cottage mailbox post',(mx,my,.29),(.075,.075,.55),timber,c=fence)
box('Cottage mailbox body',(mx,my,.59),(.24,.27,.22),mail_mat,c=fence,r=.04)
box('Cottage mailbox letter slot',(mx,my-.141,.61),(.14,.012,.025),timber_dark,c=fence,r=.003)
box('Cottage mailbox ivory front',(mx,my-.145,.555),(.16,.012,.075),sill_mat,c=fence,r=.005)
for i,(dx,dy) in enumerate([(0,-1.90),(.06,-2.22),(.17,-2.50)]):
    o=ball('Cottage approach stepping stone %02d'%i,pos(dx,dy,.045),(.19,.13,.032),foundation_mat,c=fence)
    o.rotation_euler.z=rng.uniform(-.2,.2)

# Rebuild the enclosure around the extended plot.
wood=bpy.data.materials['Wood honey']
wood_end=bpy.data.materials['Wood end grain']
fence_points=[(-4.1,-.2),(-4.1,1.35),(-4.1,2.9),(-4.1,4.45),(-4.1,6.0),(-2.73,6.0),(-1.37,6.0),(0,6.0),(1.37,6.0),(2.73,6.0),(4.1,6.0),(4.1,4.4),(4.1,2.8),(4.1,1.2)]
for i,(x,y) in enumerate(fence_points):
    box('Village fence post %02d'%i,(x,y,.36),(.13,.13,.71),wood,c=fence,r=.025)
    box('Village fence cap %02d'%i,(x,y,.73),(.18,.18,.07),wood_end,c=fence,r=.025)
for i,(a,b) in enumerate(zip(fence_points,fence_points[1:])):
    a,b=Vector(a),Vector(b)
    for height in (.25,.53):
        o=box('Village fence rail %02d %.2f'%(i,height),(*((a+b)/2),height),((b-a).length,.065,.105),wood,c=fence,r=.015)
        o.rotation_euler.z=math.atan2(b.y-a.y,b.x-a.x)

# Kenney GLBs are imported locally, normalized once, then linked for efficient reuse.
asset_dir=ROOT/'models/kenney-nature-kit/extracted/Models/GLTF format'
prototypes={}
for name in ('tree_detailed','tree_oak','tree_pineTallA_detailed','tree_pineRoundD'):
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(asset_dir/(name+'.glb')))
    imported=set(bpy.data.objects)-before
    bpy.context.view_layer.update()
    source=next(o for o in imported if o.type=='MESH')
    data=source.data.copy();data.transform(source.matrix_world)
    lower=Vector(tuple(min(v.co[i] for v in data.vertices) for i in range(3)))
    upper=Vector(tuple(max(v.co[i] for v in data.vertices) for i in range(3)))
    data.transform(Matrix.Translation(Vector((-(lower.x+upper.x)/2,-(lower.y+upper.y)/2,-lower.z))))
    original_materials=[m.name.lower() for m in data.materials]
    old_indices=[p.material_index for p in data.polygons]
    data.materials.clear()
    for m in leaves+[bark]:data.materials.append(m)
    data.update()
    for p,index in zip(data.polygons,old_indices):
        is_leaf='leaf' in original_materials[index]
        p.material_index=(2 if p.normal.z>.28 else 1 if p.normal.z>-.2 else 0) if is_leaf else 3
        p.use_smooth=False
    prototype=bpy.data.objects.new('Kenney source '+name,data);library.objects.link(prototype)
    prototype['source']='https://kenney.nl/assets/nature-kit'
    prototype['license']='CC0 1.0'
    prototype['source_file']=name+'.glb'
    prototypes[name]=(prototype,upper.z-lower.z)
    for o in imported:bpy.data.objects.remove(o,do_unlink=True)

placements=[
 ('tree_detailed',-3.65,2.3,2.6),('tree_oak',-3.7,4.5,3.1),
 ('tree_pineTallA_detailed',-4.02,5.9,3.5),('tree_pineRoundD',-2.9,6.12,2.7),
 ('tree_pineTallA_detailed',-1.8,6.22,3.1),('tree_pineRoundD',-.65,6.2,2.7),
 ('tree_pineTallA_detailed',.35,6.10,3.5),('tree_detailed',1.5,5.8,2.9),
 ('tree_pineTallA_detailed',2.8,6.05,3.4),('tree_oak',3.78,4.95,3.15),
 ('tree_pineRoundD',3.85,3.65,2.7),('tree_detailed',3.95,2.3,2.6),
 ('tree_pineRoundD',-4.08,.65,2.0),('tree_pineRoundD',4.15,1.2,1.8)]
for i,(name,x,y,h) in enumerate(placements):
    prototype,height=prototypes[name]
    o=bpy.data.objects.new('Village tree %02d %s'%(i,name),prototype.data);forest.objects.link(o)
    o.location=Vector((x,y,.025))*L
    o.scale=(h*L/height,)*3
    o.rotation_euler.z=rng.random()*math.tau
    o['source']='Kenney Nature Kit';o['license']='CC0 1.0';o['source_file']=name+'.glb'
library.hide_render=True;library.hide_viewport=True

# Saturated woodland greens follow the reference while keeping Mudkip readable.
for name,hexvalue in [('Foliage shaded','39784B'),('Foliage middle','568D50'),('Foliage fresh tips','7BA45F')]:
    m=bpy.data.materials[name]
    m.diffuse_color=rgb(hexvalue)
    shader=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value=rgb(hexvalue)
gmat=bpy.data.objects['Garden grass terrain with recessed pond'].data.materials[0]
ramp=next(n for n in gmat.node_tree.nodes if n.type=='VALTORGB')
ramp.color_ramp.elements[0].color=rgb('60995B')
ramp.color_ramp.elements[1].color=rgb('95B96D')

# New path mask bends around the shooting lanes to connect the doorstep.
ground=bpy.data.objects['Garden grass terrain with recessed pond']
pm=ground.data.attributes['path_mask']
polyline=[(-1.25,3.05),(-1.25,2.8),(-2.50,2.7),(-2.78,1.1),(-2.60,-.1)]
def segdist(p,a,b):
    a,b=Vector(a),Vector(b);d=b-a
    return (p-(a+d*max(0,min(1,(p-a).dot(d)/d.length_squared)))).length
for v in ground.data.vertices:
    x,y,z=v.co/L
    d=min(segdist(Vector((x,y)),a,b) for a,b in zip(polyline,polyline[1:]))
    t=max(0,min(1,(d-.23)/.16))
    pm.data[v.index].value=max(pm.data[v.index].value,1-t*t*(3-2*t))

overview=bpy.data.objects['Camera Garden Overview']
overview.location=Vector((9,-18,17))*L
overview.rotation_euler=(Vector((0,1.3,.55))*L-overview.location).to_track_quat('-Z','Y').to_euler()
overview.data.ortho_scale=14.8*L
data=bpy.data.cameras.new('Camera Littleroot Cottage')
choices=[i.identifier for i in data.bl_rna.properties['type'].enum_items]
if 'ORTHO' in choices:data.type='ORTHO'
data.ortho_scale=6.7*L;data.clip_start=.01*L
camera=bpy.data.objects.new('Camera Littleroot Cottage',data)
bpy.data.collections['Garden Cameras'].objects.link(camera)
camera.location=Vector((5,-5,8))*L
camera.rotation_euler=(Vector((-1.1,4.25,1.15))*L-camera.location).to_track_quat('-Z','Y').to_euler()
camera.hide_set(True)
scene.camera=overview
scene.render.resolution_x=1700;scene.render.resolution_y=1450;scene.render.resolution_percentage=100
scene.render.filepath=str(ROOT/'renders/garden-village-overview-v02.png')
scene['asset_stage']='Village garden v02: custom Littleroot-inspired cottage and Kenney CC0 woodland'
scene['third_party_assets']='Kenney Nature Kit 2.1, CC0 1.0; see docs/asset-credits.md'
scene['garden_bounds_L']='X -4.5..4.5 Y -4..6.5'
bpy.context.view_layer.update()
root.location=Vector((HX,HY,0))*L
bpy.context.view_layer.update()
for o in house.objects:
    if o!=root:
        world=o.matrix_world.copy();o.parent=root;o.matrix_world=world
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            sp=area.spaces.active
            sp.overlay.show_overlays=False
            sp.shading.type='MATERIAL';sp.shading.use_scene_lights=True;sp.shading.use_scene_world=True
            sp.region_3d.view_perspective='CAMERA';sp.region_3d.view_camera_zoom=0
bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active=root
root.select_set(True)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'mudkip-garden-v02.blend'))
print('VILLAGE SAVED',len(house.objects),'cottage parts;',len(forest.objects),'CC0 tree instances')
