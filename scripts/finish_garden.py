"""Refine terrain blending, palette and opening composition after the base build."""
import bpy
import math
from mathutils import Vector

scene=bpy.context.scene
L=scene['design_body_length']
ground=bpy.data.objects['Garden grass terrain with recessed pond']

def linear_hex(value):
    vv=[int(value[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in vv)+(1,)

def smoothstep(a,b,value):
    t=max(0,min(1,(value-a)/(b-a)))
    return t*t*(3-2*t)

def distance(x,y,a,b):
    v=Vector((x-a[0],y-a[1]))
    w=Vector((b[0]-a[0],b[1]-a[1]))
    return (v-w*max(0,min(1,v.dot(w)/w.length_squared))).length

points=[(-.8,-4),(-.85,-3.2),(.25,-2.8),(1.65,-2.45),(2.4,-1.6),(2.6,-.55)]
masks={name:ground.data.attributes.get(name) or ground.data.attributes.new(name,'FLOAT','POINT') for name in ['path_mask','sand_mask','training_mask']}
for v in ground.data.vertices:
    x,y,z=v.co/L
    q=math.sqrt(((x-3.35)/.79)**2+((y+.3)/1.12)**2)
    d=min(distance(x,y,a,b) for a,b in zip(points,points[1:]))
    edge=.025*math.sin(x*7+y*8)+.013*math.sin(y*21-x*6)
    masks['path_mask'].data[v.index].value=1-smoothstep(.26,.40,d+edge)
    masks['sand_mask'].data[v.index].value=1-smoothstep(1.13,1.34,q+edge*.5)
    r=math.sqrt((x/2.65)**2+((y-1.95)/1.55)**2)
    masks['training_mask'].data[v.index].value=1-smoothstep(.89,1.10,r+edge*.4)

mat=bpy.data.materials['Grass soft meadow'].copy()
mat.name='Terrain blended grass sand and path'
nodes=mat.node_tree.nodes
links=mat.node_tree.links
shader=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
previous=shader.inputs['Base Color'].links[0].from_socket
for attribute,hexcolor in [('training_mask','AEB982'),('path_mask','D6BA8B'),('sand_mask','D8D5AD')]:
    attr=nodes.new('ShaderNodeAttribute')
    attr.attribute_name=attribute
    mix=nodes.new('ShaderNodeMixRGB')
    links.new(attr.outputs['Fac'],mix.inputs[0])
    links.new(previous,mix.inputs[1])
    mix.inputs[2].default_value=linear_hex(hexcolor)
    previous=mix.outputs[0]
links.new(previous,shader.inputs['Base Color'])
ground.data.materials[0]=mat
for face in ground.data.polygons:
    face.material_index=0

scene.view_settings.exposure=-.35
bpy.data.lights['Morning broad key'].energy=1400
bpy.data.lights['Morning broad key'].size=3.2*L
bpy.data.lights['Soft sky fill'].energy=350
bpy.data.lights['Far garden rim'].energy=450
bg=next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND')
bg.inputs[1].default_value=.27
if hasattr(scene,'eevee'):
    scene.eevee.use_shadows=True
    scene.eevee.use_fast_gi=True
    scene.eevee.taa_render_samples=96
    scene.eevee.shadow_ray_count=3

ws=next(n for n in bpy.data.materials['Pond water turquoise'].node_tree.nodes if n.type=='BSDF_PRINCIPLED')
ws.inputs['Base Color'].default_value=linear_hex('42B7C5')
ws.inputs['Roughness'].default_value=.22
ws.inputs['Alpha'].default_value=.74

close=bpy.data.objects['Camera Pet Closeup']
close.location=Vector((3.8,-7,4))*L
close.rotation_euler=(Vector((.20,-1.20,.45))*L-close.location).to_track_quat('-Z','Y').to_euler()
close.data.ortho_scale=3.75*L

# Keep the overall scene visible on opening. Gameplay framing is separately selectable.
scene.camera=bpy.data.objects['Camera Garden Overview']
scene.render.resolution_x=1600
scene.render.resolution_y=1250
scene.render.resolution_percentage=100
scene['modeling_complete']='Terrain with blended path, hollow pond, three target assets, fence, two trees, shrubs, flowers, berry basket, three cameras and soft morning lighting'
print('Garden refinement complete')
