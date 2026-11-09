"""Moderate the round tree treatment and retain small pines, per user feedback."""
from pathlib import Path
import bpy
import math
from mathutils import Vector

ROOT=Path(r'C:\Users\qiank\Desktop\apprun\3d\mudkip')
scene=bpy.context.scene
L=scene['design_body_length']
if bpy.data.collections.get('Village Small Pines'):
    raise RuntimeError('Balanced tree pass already exists')

def color(hexcode):
    vv=[int(hexcode[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in vv)+(1,)

mat=bpy.data.materials.new('Village natural green foliage')
mat.use_nodes=True;mat.diffuse_color=color('60884F')
nodes=mat.node_tree.nodes;links=mat.node_tree.links
shader=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
shader.inputs['Roughness'].default_value=.94
coord=nodes.new('ShaderNodeTexCoord')
noise=nodes.new('ShaderNodeTexNoise')
noise.inputs['Scale'].default_value=3.5/L
noise.inputs['Detail'].default_value=1.5
ramp=nodes.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].position=.18
ramp.color_ramp.elements[0].color=color('527D4B')
ramp.color_ramp.elements[1].position=.85
ramp.color_ramp.elements[1].color=color('6B9258')
links.new(coord.outputs['Object'],noise.inputs['Vector'])
links.new(noise.outputs['Fac'],ramp.inputs[0])
links.new(ramp.outputs[0],shader.inputs['Base Color'])

collection=bpy.data.collections['Village Soft Garden Trees']
# Blend the overlapping spheres into a single restrained, irregular canopy.
for index in (0,1,3,4,5):
    root=bpy.data.objects['Soft garden tree %02d'%index]
    crowns=[o for o in root.children if o.type=='MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in crowns:o.select_set(True)
    bpy.context.view_layer.objects.active=crowns[0]
    bpy.ops.object.join()
    crown=bpy.context.object
    crown.name='Natural garden tree %02d unified canopy'%index
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    crown.data.materials.clear();crown.data.materials.append(mat)
    for p in crown.data.polygons:p.material_index=0
    remesh=crown.modifiers.new('Blend leaf masses','REMESH')
    choices=[i.identifier for i in remesh.bl_rna.properties['mode'].enum_items]
    if 'VOXEL' in choices:remesh.mode='VOXEL'
    remesh.voxel_size=.052*L
    remesh.use_smooth_shade=True
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    smooth=crown.modifiers.new('Reduce exaggerated lobes','SMOOTH')
    smooth.factor=1;smooth.iterations=7
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    decimate=crown.modifiers.new('Simple organic surface','DECIMATE')
    decimate.ratio=.26
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    for p in crown.data.polygons:p.use_smooth=True
    for o in root.children:
        if o.type=='CURVE':o.data.bevel_depth*=.78
    root['style']='Unified irregular broadleaf crown with restrained natural greens'

# Keep a few small conifers along the outer border.
for index in (2,6,7):
    root=bpy.data.objects['Soft garden tree %02d'%index]
    for obj in [root]+list(root.children):obj.hide_set(True);obj.hide_render=True

pines=bpy.data.collections.new('Village Small Pines')
scene.collection.children.link(pines)
source=bpy.data.objects['Kenney source tree_pineRoundD']
data=source.data.copy();data.name='Kenney small pine with natural palette'
data.materials.clear()
for material in (mat,mat,mat,bpy.data.materials['Soft tree warm bark']):data.materials.append(material)
for poly,original in zip(data.polygons,source.data.polygons):poly.material_index=original.material_index
height=max(v.co.z for v in data.vertices)-min(v.co.z for v in data.vertices)
for index,(x,y,h,rotation) in enumerate([(-4.02,.95,1.35,.2),(4.12,1.15,1.30,1.4),(1.00,6.12,1.75,.8)]):
    obj=bpy.data.objects.new('Village small pine %02d'%index,data)
    pines.objects.link(obj)
    obj.location=Vector((x,y,.025))*L
    obj.scale=(h*L/height,)*3
    obj.rotation_euler.z=rotation
    obj['source']='https://kenney.nl/assets/nature-kit'
    obj['source_file']='tree_pineRoundD.glb';obj['license']='CC0 1.0'

scene['asset_stage']='Village v04: five natural broadleaf crowns and three small pines'
scene['third_party_assets']='Visible small pines use Kenney Nature Kit CC0; broadleaf trees custom modeled. See docs/asset-credits.md'
scene.render.filepath=str(ROOT/'renders/garden-village-overview-v04.png')
bpy.ops.object.select_all(action='DESELECT')
root=bpy.data.objects['Littleroot style cottage'];root.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'mudkip-garden-v04.blend'))
print('BALANCED TREES SAVED: five broadleaf trees and three small pines')
