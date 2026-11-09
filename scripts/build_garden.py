"""First modeled garden for the Mudkip game. Run inside the current Blender scene."""
from pathlib import Path
import bpy
import bmesh
import math
import random
from mathutils import Vector

ROOT = Path(r'C:\Users\qiank\Desktop\apprun\3d\mudkip')
OUT = ROOT / 'mudkip-garden-v01.blend'
rng = random.Random(258)
scene = bpy.context.scene
pet = bpy.data.objects.get('Mudkip')
if pet is None:
    raise RuntimeError('The original Mudkip must be loaded first')
if bpy.data.collections.get('Garden Terrain'):
    raise RuntimeError('Garden already exists; do not duplicate the build')

# Save the current character scene to a separate working file before building.
bpy.ops.wm.save_as_mainfile(filepath=str(OUT))
corners = [pet.matrix_world @ Vector(c) for c in pet.bound_box]
L = max(max(v[i] for v in corners)-min(v[i] for v in corners) for i in (0,1))
H = max(v.z for v in corners)-min(v.z for v in corners)

def collection(name):
    c = bpy.data.collections.new(name)
    scene.collection.children.link(c)
    return c

terrain = collection('Garden Terrain')
pond = collection('Garden Pond')
props = collection('Garden Props')
plants = collection('Garden Plants')
targets = collection('Game Targets')
markers = collection('Game Markers')
lighting = collection('Garden Lighting')
cameras = collection('Garden Cameras')

def put(obj, name, coll, mat=None):
    obj.name = name
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)
    if mat is not None:
        obj.data.materials.append(mat)
    return obj

def color(hexcolor):
    vals = [int(hexcolor[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(v/12.92 if v<=0.04045 else ((v+0.055)/1.055)**2.4 for v in vals)+(1,)

def material(name, hexcolor, roughness=0.8, variation=None):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color(hexcolor)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    shader = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = color(hexcolor)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = 0
    if variation:
        noise = nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = 2.4/L
        noise.inputs['Detail'].default_value = 1.5
        coord = nodes.new('ShaderNodeTexCoord')
        ramp = nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].position = 0.20
        ramp.color_ramp.elements[0].color = color(hexcolor)
        ramp.color_ramp.elements[1].position = 0.85
        ramp.color_ramp.elements[1].color = color(variation)
        mat.node_tree.links.new(coord.outputs['Object'], noise.inputs['Vector'])
        mat.node_tree.links.new(noise.outputs['Fac'], ramp.inputs[0])
        mat.node_tree.links.new(ramp.outputs[0],shader.inputs['Base Color'])
    return mat

grass = material('Grass soft meadow','87B979',.94,'A7CB86')
grass_alt = material('Grass sunlit patches','9CC485',.95,'ACCF91')
earth = material('Earth warm cut edge','B58D66',.9,'C8A07A')
earth_dark = material('Earth lower layer','977657',.92)
sand = material('Pond sand','D8D5AD',.92,'E9E0BB')
path_mat = material('Path soft ochre','D6BA8B',.95,'E3CD9D')
training_mat = material('Training clearing','B5BE88',.96,'C3C597')
stone = material('Stones sage grey','AABBAE',.83,'CBD0BB')
stone_light = material('Stones sunlit','C4CBB9',.85)
wood = material('Wood honey','B58B61',.77,'CCA274')
wood_dark = material('Wood end grain','846649',.88)
cream = material('Target warm ivory','FFF4D9',.72)
blue = material('Target water blue','438BA7',.57)
teal = material('Target teal','55A99F',.62)
ochre = material('Target heavy ochre','DCA65A',.69)
leaf_dark = material('Foliage shaded','649570',.9)
leaf_mid = material('Foliage middle','7FA879',.88)
leaf_light = material('Foliage fresh tips','9ABC83',.9)
trunk_mat = material('Tree bark','977451',.95)
water_mat = material('Pond water turquoise','74CCCE',.17)
water_light = material('Water ripple highlights','C9F1E2',.3)
lily_mat = material('Lily leaves','6CA775',.8)
flower_white = material('Flowers cream','FFF0C5',.8)
flower_yellow = material('Flower centers','E8BA54',.8)
flower_pink = material('Flowers blush','E5B3AB',.85)
fruit_mat = material('Berry warm peach','E8A864',.55)
wicker = material('Basket wicker','CBA572',.82)
wicker_dark = material('Basket shadow weave','A98355',.9)
stage_mat = material('Backdrop pale mint','D3DDD0',.95)

def smooth(obj):
    if obj.type == 'MESH':
        for p in obj.data.polygons:
            p.use_smooth = True

def bevel(obj,width,segments=3):
    mod = obj.modifiers.new('Soft edges','BEVEL')
    mod.width = width*L
    mod.segments = segments
    mod = obj.modifiers.new('Weighted surface normals','WEIGHTED_NORMAL')
    mod.keep_sharp = True

def cube(name,loc,size,mat,coll=props,rounding=.035):
    bpy.ops.mesh.primitive_cube_add(size=1,location=Vector(loc)*L)
    obj = put(bpy.context.object,name,coll,mat)
    obj.dimensions = Vector(size)*L
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if rounding:
        bevel(obj,rounding)
    return obj

def ellipsoid(name,loc,scale,mat,coll=plants,ico=False):
    if ico:
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=Vector(loc)*L)
    else:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,radius=1,location=Vector(loc)*L)
    obj = put(bpy.context.object,name,coll,mat)
    obj.scale = Vector(scale)*L
    smooth(obj)
    return obj

def cyl(name,loc,radius,depth,mat,coll=props,rotation=None,vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius*L,depth=depth*L,location=Vector(loc)*L)
    obj = put(bpy.context.object,name,coll,mat)
    if rotation:
        obj.rotation_euler = rotation
    bevel(obj,min(.012,radius*.12),2)
    smooth(obj)
    return obj

def line(name,points,radius,mat,coll=props,cyclic=False):
    data = bpy.data.curves.new(name,'CURVE')
    data.dimensions = '3D'
    data.bevel_depth = radius*L
    data.bevel_resolution = 3
    spline = data.splines.new('POLY')
    spline.points.add(len(points)-1)
    for p,co in zip(spline.points,points):
        p.co = (*tuple(Vector(co)*L),1)
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name,data)
    coll.objects.link(obj)
    data.materials.append(mat)
    return obj

def branch(name,a,b,radius,mat,coll=plants):
    a,b = Vector(a),Vector(b)
    obj = cyl(name,(a+b)/2,radius,(b-a).length,mat,coll)
    obj.rotation_euler = (b-a).to_track_quat('Z','Y').to_euler()
    return obj

def mesh_object(name,verts,faces,mat,coll):
    data = bpy.data.meshes.new(name)
    data.from_pydata([tuple(Vector(v)*L) for v in verts],[],faces)
    data.update()
    obj = bpy.data.objects.new(name,data)
    coll.objects.link(obj)
    data.materials.append(mat)
    return obj

def root_empty(name,loc,coll,kind):
    obj = bpy.data.objects.new(name,None)
    coll.objects.link(obj)
    obj.location = Vector(loc)*L
    obj.empty_display_size = .18*L
    obj['game_role'] = kind
    return obj

def parent_keep(obj,parent):
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = world

# Original model and skin remain intact; all placement lives on its root rig.
rig = pet.parent or pet
rig.location = (0,-1.2*L,.02*L-min(v.z for v in corners))
rig.rotation_euler.z = math.radians(20)
for mat in pet.data.materials:
    node = next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
    if node:
        node.inputs['Roughness'].default_value = .25 if 'Eyes' in mat.name else .73
        node.inputs['Metallic'].default_value = 0

# Disable the original isolated preview rig without removing it.
old = bpy.data.collections.get('Preview Lighting')
if old:
    old.hide_render = True
    old.hide_viewport = True

cube('Garden rounded soil foundation',(0,.25,-.22),(9,8.5,.44),earth,terrain,.18)
cube('Garden lower soil band',(0,.25,-.39),(8.94,8.44,.12),earth_dark,terrain,.15)

# Remove foundation volume beneath the pond, so the basin is actually hollow.
bpy.ops.mesh.primitive_cylinder_add(vertices=80,radius=1,depth=.70*L,location=(3.35*L,-.3*L,0))
cutter=bpy.context.object
cutter.name='Temporary pond excavation'
cutter.scale=(.95*L,1.35*L,1)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
foundation=bpy.data.objects['Garden rounded soil foundation']
boolean=foundation.modifiers.new('Pond excavation','BOOLEAN')
solvers=[i.identifier for i in boolean.bl_rna.properties['solver'].enum_items]
if 'EXACT' in solvers:
    boolean.solver='EXACT'
boolean.object=cutter
bpy.context.view_layer.objects.active=foundation
bpy.ops.object.modifier_apply(modifier=boolean.name)
bpy.data.objects.remove(cutter,do_unlink=True)

POND = Vector((3.35,-.3,0))
def pond_radius(x,y):
    return math.sqrt(((x-POND.x)/.79)**2+((y-POND.y)/1.12)**2)

def ground_z(x,y):
    q = pond_radius(x,y)
    t = max(0,min(1,(q-.48)/.70))
    return .02-.235*(1-t*t*(3-2*t))

def segment_distance(x,y,a,b):
    v = Vector((x-a[0],y-a[1]))
    w = Vector((b[0]-a[0],b[1]-a[1]))
    t = max(0,min(1,v.dot(w)/w.length_squared))
    return (v-w*t).length

path_points = [(-.8,-4),(-.85,-3.2),(.25,-2.8),(1.65,-2.45),(2.4,-1.6),(2.6,-.55)]
nx,ny = 125,119
verts=[]
for j in range(ny+1):
    for i in range(nx+1):
        x = -4.48+8.96*i/nx
        y = -3.98+8.46*j/ny
        # Round only the corners of the terrain surface.
        cx = max(-4.03,min(4.03,x))
        cy = max(-3.53,min(4.03,y))
        delta = Vector((x-cx,y-cy))
        if delta.length>.45:
            delta.normalize()
            x,y = cx+delta.x*.45,cy+delta.y*.45
        verts.append((x,y,ground_z(x,y)))
faces=[]
for j in range(ny):
    for i in range(nx):
        a=j*(nx+1)+i
        faces.append((a,a+1,a+nx+2,a+nx+1))
ground=mesh_object('Garden grass terrain with recessed pond',verts,faces,grass,terrain)
for mat in (grass_alt,sand,path_mat,training_mat,earth):
    ground.data.materials.append(mat)
for poly in ground.data.polygons:
    x,y,_ = [sum(verts[v][k] for v in poly.vertices)/len(poly.vertices) for k in range(3)]
    q=pond_radius(x,y)
    d=min(segment_distance(x,y,a,b) for a,b in zip(path_points,path_points[1:]))
    if q<1.22:
        poly.material_index=2
    elif d<.31+.035*math.sin(12*x+7*y):
        poly.material_index=3
    elif (x/2.65)**2+((y-1.95)/1.55)**2 < 1+.035*math.sin(x*9+y*4):
        poly.material_index=4
    elif math.sin(x*.9+y*.4)+math.cos(y*1.3-x*.5)>1.25:
        poly.material_index=1
    poly.use_smooth=True
bm=bmesh.new()
bm.from_mesh(ground.data)
bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0001*L)
bm.to_mesh(ground.data)
bm.free()
solid=ground.modifiers.new('Ground edge thickness','SOLIDIFY')
solid.thickness=.10*L
solid.material_offset_rim=5
ground['game_role']='walkable_ground'

# A true depression in the terrain underlies this water surface.
verts=[(POND.x,POND.y,-.038)]
for i in range(96):
    t=2*math.pi*i/96
    verts.append((POND.x+.79*.97*math.cos(t),POND.y+1.12*.97*math.sin(t),-.038))
faces=[(0,i+1,(i+1)%96+1) for i in range(96)]
water=mesh_object('Pond water surface',verts,faces,water_mat,pond)
ws=next(n for n in water_mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
ws.inputs['Transmission Weight'].default_value=.20
ws.inputs['IOR'].default_value=1.333
ws.inputs['Alpha'].default_value=.78
render_methods=[i.identifier for i in water_mat.bl_rna.properties['surface_render_method'].enum_items]
if 'DITHERED' in render_methods:
    water_mat.surface_render_method='DITHERED'
noise=water_mat.node_tree.nodes.new('ShaderNodeTexNoise')
noise.inputs['Scale'].default_value=6/L
noise.inputs['Detail'].default_value=1
bump=water_mat.node_tree.nodes.new('ShaderNodeBump')
bump.inputs['Strength'].default_value=.12
bump.inputs['Distance'].default_value=.018*L
water_mat.node_tree.links.new(noise.outputs['Fac'],bump.inputs['Height'])
water_mat.node_tree.links.new(bump.outputs['Normal'],ws.inputs['Normal'])
water['game_role']='pond_surface'

for i in range(11):
    t=2*math.pi*i/11+.10
    x=POND.x+.94*math.cos(t)
    y=POND.y+1.27*math.sin(t)
    obj=ellipsoid('Pond shore stone %02d'%i,(x,y,.035),(.20*rng.uniform(.85,1.2),.16*rng.uniform(.9,1.2),.105),stone if i%3 else stone_light,pond,True)
    obj.rotation_euler.z=t+rng.uniform(-.3,.3)
for i,(dx,dy,s) in enumerate([(-.2,-.3,.13),(.25,.4,.16),(-.25,.55,.10)]):
    ellipsoid('Pond submerged pebble %02d'%i,(POND.x+dx,POND.y+dy,-.12),(s,s*.65,.045),stone_light,pond,True)
for i,(cx,cy,rx,ry) in enumerate([(3.12,-.6,.23,.13),(3.62,.03,.20,.12),(3.24,.42,.13,.08)]):
    points=[(cx+rx*math.cos(t),cy+ry*math.sin(t),-.032) for t in [j*math.pi/22 for j in range(37)]]
    line('Pond gentle ripple %02d'%i,points,.006,water_light,pond)

# Leaves with a notch, rather than full circular disks.
for idx,(cx,cy,r) in enumerate([(3.68,.25,.16),(3.02,-.79,.12)]):
    vertices=[(cx,cy,-.028)]
    for j in range(35):
        t=.20+(2*math.pi-.40)*j/34
        vertices.append((cx+r*math.cos(t),cy+r*.8*math.sin(t),-.027))
    leaf=mesh_object('Pond lily leaf %02d'%idx,vertices,[(0,j+1,j+2) for j in range(34)],lily_mat,pond)

# Low wooden fence around the far edge and short side returns.
def fence_segment(a,b,index):
    a,b=Vector(a),Vector(b)
    for height in (.25,.53):
        beam=cube('Fence rail %02d %.2f'%(index,height),(*((a+b)/2),height),((b-a).length,.065,.105),wood,props,.015)
        beam.rotation_euler.z=math.atan2(b.y-a.y,b.x-a.x)

fence_points=[(-4.1,-.2),(-4.1,1.15),(-4.1,2.5),(-4.1,3.8),(-2.73,3.8),(-1.37,3.8),(0,3.8),(1.37,3.8),(2.73,3.8),(4.1,3.8),(4.1,2.45),(4.1,1.1)]
for i,(x,y) in enumerate(fence_points):
    cube('Fence post %02d'%i,(x,y,.36),(.13,.13,.71),wood,props,.025)
    cube('Fence cap %02d'%i,(x,y,.73),(.18,.18,.07),wood_dark,props,.025)
    ellipsoid('Fence peg %02d'%i,(x,y-.073,.52),(.018,.01,.018),wood_dark,props)
for i,(a,b) in enumerate(zip(fence_points,fence_points[1:])):
    fence_segment(a,b,i)

# Root objects keep each target an independent asset for later interaction.
face_rotation=(math.pi/2,0,0)
def target(kind,x,y,radius,center,mat):
    existing=set(bpy.data.objects)
    root=root_empty('Target '+kind,(x,y,0),targets,'target_'+kind.lower())
    cyl(kind+' pedestal',(x,y,.07),.23,.10,wood_dark,targets)
    cube(kind+' pedestal inset',(x,y,.105),(.30,.24,.08),wood,targets,.03)
    cyl(kind+' upright',(x,y,center/2),.044,center,wood,targets,vertices=16)
    cyl(kind+' wooden disc',(x,y,center),radius,.085,wood,targets,face_rotation,48)
    cyl(kind+' painted outer ring',(x,y-.047,center),radius*.89,.014,mat,targets,face_rotation,48)
    cyl(kind+' cream ring',(x,y-.057,center),radius*.68,.014,cream,targets,face_rotation,48)
    cyl(kind+' inner ring',(x,y-.067,center),radius*.47,.014,mat,targets,face_rotation,48)
    cyl(kind+' bullseye',(x,y-.078,center),radius*.23,.014,cream,targets,face_rotation,40)
    if kind=='Moving':
        for sign in (-1,1):
            fin=ellipsoid('Moving target side fin',(x+sign*(radius+.085),y+.01,center),(.13,.035,.075),teal,targets)
            fin.rotation_euler.y=sign*math.radians(-25)
        line('Moving target rail',[(x-.5,y,.04),(x+.5,y,.04)],.022,stone,targets)
    if kind=='Heavy':
        for sign in (-1,1):
            cube('Heavy target support',(x+sign*.12,y+.05,.19),(.075,.16,.31),wood_dark,targets,.015)
        # Small shield badge hangs below the target, leaving the aim point clear.
        vv=[(x-.09,y-.09,center-radius-.025),(x+.09,y-.09,center-radius-.025),(x+.075,y-.09,center-radius-.12),(x,y-.09,center-radius-.17),(x-.075,y-.09,center-radius-.12)]
        mesh_object('Heavy target shield badge',vv,[(0,1,2,3,4)],ochre,targets)
    bpy.context.view_layer.update()
    for obj in set(bpy.data.objects)-existing:
        if obj!=root:
            parent_keep(obj,root)
    root['points']={'Normal':10,'Moving':20,'Heavy':30}[kind]
    root['requires_full_charge']=kind=='Heavy'
    root['target_radius']=radius*L
    return root

target('Normal',-1.65,1.55,.275,.55*H/L,blue)
target('Moving',0,2.50,.25,.65*H/L,teal)
target('Heavy',1.55,1.75,.35,.60*H/L,ochre)

# Basket body with separate horizontal weave and vertical ribs.
bx,by=-3.15,-1.9
cyl('Basket bottom',(bx,by,.045),.205,.055,wicker_dark,props,vertices=32)
for j in range(7):
    z=.065+j*.027
    radius=.19+.035*j/6
    pts=[(bx+radius*math.cos(t),by+radius*.78*math.sin(t),z) for t in [2*math.pi*k/48 for k in range(48)]]
    line('Basket horizontal weave %02d'%j,pts,.014,wicker,props,True)
for j in range(16):
    t=2*math.pi*j/16
    pts=[(bx+(.19+.035*k/5)*math.cos(t),by+(.19+.035*k/5)*.78*math.sin(t),.06+.033*k) for k in range(6)]
    line('Basket vertical weave %02d'%j,pts,.008,wicker_dark,props)
pts=[(bx+.22*math.cos(t),by,.23+.18*math.sin(t)) for t in [math.pi*k/32 for k in range(33)]]
line('Basket curved handle',pts,.018,wicker,props)
for i in range(5):
    t=i*2.4
    x=bx+.105*math.cos(t)
    y=by+.075*math.sin(t)
    ellipsoid('Basket berry %02d'%i,(x,y,.22+(.045 if i==4 else 0)),(.069,.062,.072),fruit_mat,props)
    ellipsoid('Berry leaf %02d'%i,(x+.025,y,.289+(.045 if i==4 else 0)),(.04,.018,.008),leaf_mid,props)

# Rounded trees, shrubs and sparse flowers live outside the clear play area.
def tree(name,x,y,height=2.2):
    branch(name+' trunk',(x,y,.03),(x+.08,y,height*.67),.105,trunk_mat)
    branch(name+' left branch',(x+.03,y,.8),(x-.34,y+.08,1.42),.055,trunk_mat)
    branch(name+' right branch',(x+.05,y,1),(x+.38,y-.04,1.58),.05,trunk_mat)
    for i,(dx,dy,z,s) in enumerate([(-.34,.04,height-.55,.52),(.34,.05,height-.43,.50),(0,.12,height-.11,.55),(0,-.24,height-.35,.48)]):
        obj=ellipsoid(name+' crown %02d'%i,(x+dx,y+dy,z),(s,s*.88,s*.88),[leaf_mid,leaf_dark,leaf_light,leaf_mid][i],plants,True)
        # A small irregularity gives the crown a modeled rather than perfect-ball outline.
        for v in obj.data.vertices:
            v.co*=1+rng.uniform(-.045,.045)

tree('Left garden tree',-3.48,2.7,2.1)
tree('Right garden tree',3.25,3.05,2.05)

for idx,(x,y,s) in enumerate([(-3.9,2,.5),(-3.55,.7,.40),(-3.7,-.4,.36),(-2.7,3.5,.4),(-1.7,3.6,.35),(.7,3.65,.32),(2,3.65,.40),(3.8,2.4,.42),(4,.6,.32),(-3.9,-2.8,.32),(3.75,-2.75,.36)]):
    for j,(dx,dy,scale) in enumerate([(-.22,.03,.85),(.18,.05,.74),(0,-.06,1)]):
        obj=ellipsoid('Shrub %02d lobe %02d'%(idx,j),(x+dx*s,y+dy,s*.48),(.55*s*scale,.45*s*scale,.62*s*scale),[leaf_mid,leaf_light,leaf_dark][(idx+j)%3],plants,True)
        for v in obj.data.vertices:
            v.co*=1+rng.uniform(-.04,.04)

grass_verts=[]
grass_faces=[]
for i in range(125):
    if i<75:
        side=rng.choice((-1,1))
        x=side*rng.uniform(2.95,4.15)
        y=rng.uniform(-3.4,3.5)
    else:
        x=rng.uniform(-3.9,3.9)
        y=rng.choice((rng.uniform(-3.7,-3.0),rng.uniform(3.15,3.6)))
    if pond_radius(x,y)<1.40 or min(segment_distance(x,y,a,b) for a,b in zip(path_points,path_points[1:]))<.42:
        continue
    for j in range(rng.randint(3,5)):
        t=rng.random()*math.tau
        dx,dy=math.cos(t),math.sin(t)
        width=rng.uniform(.012,.022)
        height=rng.uniform(.08,.18)
        base=Vector((x+rng.uniform(-.04,.04),y+rng.uniform(-.04,.04),.021))
        tangent=Vector((-dy*width,dx*width,0))
        middle=base+Vector((dx*.018,dy*.018,height*.55))
        tip=base+Vector((dx*.06,dy*.06,height))
        n=len(grass_verts)
        grass_verts.extend((base-tangent,base+tangent,middle+tangent*.55,middle-tangent*.55,tip))
        grass_faces.extend(((n,n+1,n+2,n+3),(n+3,n+2,n+4)))
mesh_object('Meadow grass clumps',grass_verts,grass_faces,leaf_mid,plants)

for cluster,(x,y) in enumerate([(-3.5,-2.65),(-3.65,.85),(-2.4,3.25),(3.85,-1.75),(3.65,2.15),(2.8,-3.0)]):
    for j in range(3):
        cx,cy=x+rng.uniform(-.20,.20),y+rng.uniform(-.15,.15)
        h=rng.uniform(.12,.20)
        branch('Flower stem',(cx,cy,.025),(cx,cy,h),.008,leaf_dark)
        for k in range(5):
            t=math.tau*k/5
            petal=ellipsoid('Flower petal',(cx+.039*math.cos(t),cy+.039*math.sin(t),h),(.037,.024,.012),flower_white if cluster%3 else flower_pink,plants)
            petal.rotation_euler.z=t
        ellipsoid('Flower golden center',(cx,cy,h+.01),(.021,.021,.015),flower_yellow,plants)

# Flat stepping stones make the entrance read at the front of the diorama.
for i,(x,y) in enumerate([(-.80,-3.68),(-.77,-3.21),(-.40,-2.88)]):
    obj=ellipsoid('Path stepping stone %02d'%i,(x,y,.038),(.22,.15,.035),stone_light,terrain,True)
    obj.rotation_euler.z=rng.uniform(-.35,.35)

for name,loc,kind in [('Spawn Pet',(0,-1.2,.03),'spawn'),('Stand Shooting',(0,-1.8,.03),'shooting_stand'),('Pond Interaction',(3.35,-.3,-.038),'pond')]:
    root_empty(name,loc,markers,kind)
markers.hide_render=True

# Studio ground is only a presentation support; the garden itself is independent.
cube('Presentation ground',(0,0,-.59),(200,200,.12),stage_mat,terrain,.02)

def area(name,loc,power,size,hexcolor,target=(0,0,0)):
    data=bpy.data.lights.new(name,'AREA')
    data.energy=power
    data.shape='DISK'
    data.size=size*L
    data.color=color(hexcolor)[:3]
    obj=bpy.data.objects.new(name,data)
    lighting.objects.link(obj)
    obj.location=Vector(loc)*L
    obj.rotation_euler=(Vector(target)*L-obj.location).to_track_quat('-Z','Y').to_euler()
    obj.hide_set(False)
    return obj

area('Morning broad key',(-3.5,-4.8,7),1800,5.0,'FFF0D9')
area('Soft sky fill',(4,-1,6),900,6.0,'DFEEFF')
area('Far garden rim',(1,5,5),1000,4.0,'F1FAFF')
world=bpy.data.worlds.new('Garden pale blue sky')
world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
bg.inputs[0].default_value=color('DCE9E9')
bg.inputs[1].default_value=.45
scene.world=world

def camera(name,loc,look_at,width):
    data=bpy.data.cameras.new(name)
    choices=[i.identifier for i in data.bl_rna.properties['type'].enum_items]
    if 'ORTHO' in choices:
        data.type='ORTHO'
    data.ortho_scale=width*L
    data.clip_start=.01*L
    data.clip_end=500*L
    data.lens=50
    obj=bpy.data.objects.new(name,data)
    cameras.objects.link(obj)
    obj.location=Vector(loc)*L
    obj.rotation_euler=(Vector(look_at)*L-obj.location).to_track_quat('-Z','Y').to_euler()
    obj.hide_set(True)
    return obj

overview=camera('Camera Garden Overview',(9,-14,12),(0,.30,.25),12.3)
game_cam=camera('Camera Gameplay',(6,-16,12),(0,.2,.25),10.0)
close_cam=camera('Camera Pet Closeup',(3.8,-7,4.0),(.35,-1.0,.45),4.25)
scene.camera=overview
scene.render.resolution_x=1600
scene.render.resolution_y=1250
scene.render.resolution_percentage=75
scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(ROOT/'renders/garden-overview-v01.png')
scene.render.film_transparent=False
scene.view_settings.exposure=0
scene.view_settings.gamma=1
try:
    scene.view_settings.view_transform='AgX'
except TypeError:
    pass
scene.render.fps=30
scene['design_document']='docs/mudkip-game-design-v1.md'
scene['asset_stage']='Garden modeling v01; gameplay and skill animation are not implemented'
scene['design_body_length']=L
scene['design_body_height']=H
scene['garden_bounds_L']='X -4.5..4.5 Y -4..4.5'

# A clean opening camera view uses actual scene lights.
for screen in bpy.data.screens:
    for a in screen.areas:
        if a.type=='VIEW_3D':
            sp=a.spaces.active
            sp.overlay.show_overlays=False
            sp.shading.type='MATERIAL'
            sp.shading.use_scene_world=True
            sp.shading.use_scene_lights=True
            sp.region_3d.view_perspective='CAMERA'
            sp.region_3d.view_camera_zoom=5
            sp.clip_start=.005*L
            sp.clip_end=500*L
bpy.ops.object.select_all(action='DESELECT')
pet.select_set(True)
bpy.context.view_layer.objects.active=pet
(ROOT/'renders').mkdir(exist_ok=True)
refinement=ROOT/'scripts/finish_garden.py'
exec(compile(refinement.read_text(encoding='utf-8'),str(refinement),'exec'))
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT))
print('GARDEN SAVED',OUT)
print('SCALE L',L,'H',H)
print('OBJECTS',len(scene.objects),'MESHES',sum(o.type=='MESH' for o in scene.objects))
