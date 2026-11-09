"""Study the planting plan offline by default; apply only when APPLY_PLANTING_TO_LIVE is true."""
from pathlib import Path
import json
import math
import bpy
from mathutils import Vector,Matrix

ROOT=Path(r'C:\Users\qiank\Desktop\apprun\3d\mudkip')
ASSETS=ROOT/'models/kaykit-forest/extracted/KayKit_Forest_Nature_Pack_1.0_FREE/Assets/gltf'
PLAN=json.loads((ROOT/'docs/planting-plan-v08.json').read_text(encoding='utf-8'))
scene=bpy.context.scene
L=scene['design_body_length']
apply_live=globals().get('APPLY_PLANTING_TO_LIVE',False)
if bpy.data.collections.get('Garden Designed Planting v08'):
    raise RuntimeError('Designed planting already present')

def collection(name):
    c=bpy.data.collections.new(name);scene.collection.children.link(c);return c

visible=collection('Garden Designed Planting v08')
sources=collection('Designed Planting Source Assets')
sources.hide_render=True;sources.hide_viewport=True
prototypes={}
material_cache={}

def plant_material(original):
    if original in material_cache:return material_cache[original]
    mat=original.copy();mat.name='Planting unified '+original.name
    if mat.node_tree:
        nodes=mat.node_tree.nodes;links=mat.node_tree.links
        shader=next((n for n in nodes if n.type=='BSDF_PRINCIPLED'),None)
        if shader and shader.inputs['Base Color'].links:
            previous=shader.inputs['Base Color'].links[0].from_socket
            grade=nodes.new('ShaderNodeHueSaturation')
            grade.label='Quiet greens and warm bark'
            grade.inputs['Saturation'].default_value=PLAN['material_saturation']
            grade.inputs['Value'].default_value=PLAN['material_value']
            links.new(previous,grade.inputs['Color'])
            links.new(grade.outputs['Color'],shader.inputs['Base Color'])
            shader.inputs['Roughness'].default_value=.88
            spec=shader.inputs.get('Specular IOR Level')
            if spec:spec.default_value=.20
    material_cache[original]=mat
    return mat

def prototype(name):
    if name in prototypes:return prototypes[name]
    if name=='Kenney_PineRoundD':
        data=bpy.data.objects['Kenney source tree_pineRoundD'].data.copy()
        indices=[p.material_index for p in data.polygons]
        def linear_color(hexcode):
            values=[int(hexcode[i:i+2],16)/255 for i in (0,2,4)]
            return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in values)+(1,)
        leaf=bpy.data.materials.get('Planting compact pine green')
        if leaf is None:
            leaf=bpy.data.materials.new('Planting compact pine green');leaf.use_nodes=True
            nodes=leaf.node_tree.nodes;links=leaf.node_tree.links
            shader=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');shader.inputs['Roughness'].default_value=.9
            coord=nodes.new('ShaderNodeTexCoord');separate=nodes.new('ShaderNodeSeparateXYZ');ramp=nodes.new('ShaderNodeValToRGB')
            ramp.color_ramp.elements[0].color=linear_color('587D43');ramp.color_ramp.elements[1].color=linear_color('86A965')
            links.new(coord.outputs['Generated'],separate.inputs[0]);links.new(separate.outputs['Z'],ramp.inputs[0]);links.new(ramp.outputs[0],shader.inputs['Base Color'])
        bark=bpy.data.materials.get('Planting compact pine warm bark')
        if bark is None:
            bark=bpy.data.materials.new('Planting compact pine warm bark');bark.use_nodes=True
            shader=next(n for n in bark.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
            shader.inputs['Base Color'].default_value=linear_color('9E754C');shader.inputs['Roughness'].default_value=.9
        data.materials.clear()
        for m in (leaf,leaf,leaf,bark):data.materials.append(m)
        for p,i in zip(data.polygons,indices):p.material_index=i
        low=Vector(tuple(min(v.co[i] for v in data.vertices) for i in range(3)));high=Vector(tuple(max(v.co[i] for v in data.vertices) for i in range(3)))
        obj=bpy.data.objects.new('Planting source '+name,data);sources.objects.link(obj)
        obj['source']='https://kenney.nl/assets/nature-kit';obj['license']='CC0 1.0';obj['source_file']='tree_pineRoundD.glb'
        prototypes[name]=(data,high-low)
        return prototypes[name]
    existing=bpy.data.objects.get('KayKit B source '+name)
    if existing:
        data=existing.data.copy()
    else:
        before=set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(ASSETS/(name+'.gltf')))
        added=set(bpy.data.objects)-before
        bpy.context.view_layer.update()
        original=next(o for o in added if o.type=='MESH')
        data=original.data.copy();data.transform(original.matrix_world)
        low=min(v.co.z for v in data.vertices);high=max(v.co.z for v in data.vertices)
        base=[v.co for v in data.vertices if v.co.z<low+(high-low)*.025]
        origin=Vector((sum(v.x for v in base)/len(base),sum(v.y for v in base)/len(base),low))
        data.transform(Matrix.Translation(-origin))
        for obj in added:bpy.data.objects.remove(obj,do_unlink=True)
    data.name='Designed planting '+name
    for i,mat in enumerate(list(data.materials)):
        if mat:data.materials[i]=plant_material(mat)
    low=Vector(tuple(min(v.co[i] for v in data.vertices) for i in range(3)))
    high=Vector(tuple(max(v.co[i] for v in data.vertices) for i in range(3)))
    obj=bpy.data.objects.new('Planting source '+name,data);sources.objects.link(obj)
    obj['source']='https://kaylousberg.itch.io/kaykit-forest';obj['license']='CC0 1.0';obj['source_file']=name+'.gltf'
    prototypes[name]=(data,high-low)
    return prototypes[name]

for tree in PLAN['trees']:
    data,size=prototype(tree['model'])
    factor=min(tree['height']*L/size.z,tree['max_width']*L/max(size.x,size.y))
    obj=bpy.data.objects.new('Planting '+tree['id']+' '+tree['role'],data);visible.objects.link(obj)
    obj.location=Vector((tree['x'],tree['y'],.025))*L
    obj.scale=(factor,)*3;obj.rotation_euler.z=tree['rotation']
    obj['planting_role']=tree['role'];obj['source_file']='tree_pineRoundD.glb' if tree['model']=='Kenney_PineRoundD' else tree['model']+'.gltf'
    obj['source']='https://kenney.nl/assets/nature-kit' if tree['model']=='Kenney_PineRoundD' else 'https://kaylousberg.itch.io/kaykit-forest'
    obj['license']='CC0 1.0'

for i,shrub in enumerate(PLAN['shrubs']):
    data,size=prototype(shrub['model'])
    obj=bpy.data.objects.new('Planting understory %02d'%i,data);visible.objects.link(obj)
    factor=shrub['width']*L/max(size.x,size.y)
    obj.scale=(factor,)*3
    obj.location=Vector((shrub['x'],shrub['y'],.025))*L
    obj.rotation_euler.z=shrub['rotation']
    obj['planting_role']='understory';obj['source_file']=shrub['model']+'.gltf'
    obj['source']='https://kaylousberg.itch.io/kaykit-forest';obj['license']='CC0 1.0'

for name in ('Village KayKit Mixed Trees','Village KayKit B Round Trees','Village Quaternius A Trees','Village Woodland Kenney CC0','Village Soft Garden Trees','Village Small Pines'):
    old=bpy.data.collections.get(name)
    if old:old.hide_viewport=True;old.hide_render=True
for obj in bpy.data.collections['Garden Plants'].objects:
    if obj.name.startswith('Shrub '):obj.hide_render=True;obj.hide_set(True)

# A subtle ground tint joins planting groups to the terrain without separate planter disks.
ground=bpy.data.objects['Garden grass terrain with recessed pond']
mask=ground.data.attributes.get('planting_mask') or ground.data.attributes.new('planting_mask','FLOAT','POINT')
def falloff(radius):
    t=max(0,min(1,(radius-.60)/.65))
    return 1-t*t*(3-2*t)
for v in ground.data.vertices:
    x,y,z=v.co/L
    fields=[]
    for cx,cy,rx,ry in [(-3.70,4.50,.68,1.85),(3.02,5.25,1.02,.85),(3.15,1.85,.48,.62)]:
        radius=math.sqrt(((x-cx)/rx)**2+((y-cy)/ry)**2)
        fields.append(falloff(radius))
    mask.data[v.index].value=max(fields)*.35

mat=ground.data.materials[0].copy();mat.name='Terrain with planted grove transitions'
nodes=mat.node_tree.nodes;links=mat.node_tree.links
shader=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
previous=shader.inputs['Base Color'].links[0].from_socket
attr=nodes.new('ShaderNodeAttribute');attr.attribute_name='planting_mask'
mix=nodes.new('ShaderNodeMixRGB')
hexcode='648C58';rgb=[int(hexcode[i:i+2],16)/255 for i in (0,2,4)]
linear=tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb)+(1,)
links.new(attr.outputs['Fac'],mix.inputs[0]);links.new(previous,mix.inputs[1]);mix.inputs[2].default_value=linear
links.new(mix.outputs[0],shader.inputs['Base Color']);ground.data.materials[0]=mat

scene.camera=bpy.data.objects['Camera Garden Overview']
scene['asset_stage']='Village v08: designed asymmetric planting, left broadleaf hierarchy, right pine group and low waterside flat canopy'
scene['planting_plan']='docs/planting-plan-v08.json'
scene['third_party_assets']='Broadleaf trees and understory: KayKit CC0; compact pine trees: Kenney CC0. See docs/asset-credits.md'
bpy.ops.object.select_all(action='DESELECT')
root=bpy.data.objects['Littleroot style cottage'];root.select_set(True);bpy.context.view_layer.objects.active=root
scene.render.resolution_x=1700;scene.render.resolution_y=1450;scene.render.resolution_percentage=100
if apply_live:
    scene.render.filepath=str(ROOT/'renders/garden-planting-overview-v08.png')
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'mudkip-garden-v08-designed.blend'))
    print('DESIGNED PLANTING SAVED',len(PLAN['trees']),'trees;',len(PLAN['shrubs']),'understory pieces')
else:
    scene.render.resolution_percentage=80
    scene.render.filepath=str(ROOT/'renders/planting-composition-study-v08.png')
    bpy.ops.render.render(write_still=True)
    print('COMPOSITION STUDY ONLY; no blend file written')
