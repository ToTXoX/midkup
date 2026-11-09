"""Prepare the approved garden as clean, static, glTF-friendly game resources."""
from pathlib import Path
from collections import defaultdict
import bpy, json, math
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'game-assets'
for folder in ('environments','props','levels','source'):
    (OUT/folder).mkdir(parents=True,exist_ok=True)
scene = bpy.context.scene
L = scene['design_body_length']
originals = [o for o in scene.objects if o.type in {'MESH','CURVE','FONT'} and o.visible_get() and not o.hide_render and o.name != 'Mudkip' and o.name != 'Presentation ground']
source_names = {o.name:[c.name for c in o.users_collection] for o in originals}
source_lookup = {o.name:o for o in originals}
def world_bounds(o):
    bb=[o.matrix_world@Vector(v) for v in o.bound_box]
    return Vector([min(v[i] for v in bb) for i in range(3)]),Vector([max(v[i] for v in bb) for i in range(3)])
def y_up(v): return [round(v[0],6),round(v[2],6),round(-v[1],6)]

def target_info(prefix):
    pedestal=source_lookup[prefix+' pedestal']
    lo,hi=world_bounds(pedestal)
    pivot=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,0))
    lo,hi=world_bounds(source_lookup[prefix+' wooden disc'])
    return {'pivot':pivot,'hitCenter':y_up((lo+hi)/2-pivot),'hitRadius':(hi.x-lo.x)/2}
target_data={p:target_info(p) for p in ('Normal','Moving','Heavy')}
camera = json.loads((ROOT/'docs/camera-settings-v11.json').read_text(encoding='utf-8'))
layout={'schemaVersion':1,'units':'meters','up':'+Y','forward':'+Z','spawn':{'position':y_up(bpy.data.objects['Mudkip Rig'].location),'yaw':bpy.data.objects['Mudkip Rig'].rotation_euler.z},'camera':{'position':y_up(camera['position']),'target':y_up(Vector(camera['target_L'])*L),'fov':20},'targets':[{'id':p.lower(),'asset':f'props/target-{p.lower()}.glb','position':y_up(d['pivot']),'hit':{'center':d['hitCenter'],'radius':d['hitRadius'],'normal':[0,0,1]}} for p,d in target_data.items()], 'colliders':[]}
lo,hi=world_bounds(source_lookup['Cottage main plaster walls'])
layout['colliders'].append({'id':'cottage','type':'box','min':y_up(Vector((lo.x,hi.y,lo.z))),'max':y_up(Vector((hi.x,lo.y,hi.z)))})
for o in originals:
    if o.name.startswith('Planting ') and not o.name.startswith('Planting understory'):
        lo,hi=world_bounds(o)
        layout['colliders'].append({'id':o.name,'type':'circle','center':[round(o.location.x,6),round(-o.location.y,6)],'radius':round(max(.075,min(.17,(hi.z-lo.z)*.055)),4)})
    if o.name.startswith('Village fence rail'):
        lo,hi=world_bounds(o)
        if hi.z<.4: # one horizontal bar per fence segment
            layout['colliders'].append({'id':o.name,'type':'box','min':y_up(Vector((lo.x,hi.y,0))),'max':y_up(Vector((hi.x,lo.y,.7)))})
lo,hi=world_bounds(source_lookup['Pond water surface'])
layout['colliders'].append({'id':'pond','type':'ellipse','center':[(lo.x+hi.x)/2,-(lo.y+hi.y)/2],'radii':[(hi.x-lo.x)/2,(hi.y-lo.y)/2]})
lo,hi=world_bounds(source_lookup['Garden rounded soil foundation'])
layout['walkableBounds']={'min':[lo.x+.38,-hi.y+.38],'max':[hi.x-.38,-lo.y-.38],'actorRadius':.4,'note':'Ground bounds for the character center are inset by actorRadius and navigation.skin at runtime.'}
layout['navigation']={'actorRadius':.4,'skin':.04,'cellSize':.16,'pondShore':.12}

# Duplicate evaluated visible geometry; preserve original attributes used by terrain masks.
runtime=bpy.data.collections.new('Game Runtime Assets')
scene.collection.children.link(runtime)
dg=bpy.context.evaluated_depsgraph_get()
copies=[]
for original in originals:
    data=bpy.data.meshes.new_from_object(original.evaluated_get(dg),preserve_all_data_layers=True,depsgraph=dg)
    obj=bpy.data.objects.new(original.name+'__runtime',data)
    runtime.objects.link(obj)
    obj.matrix_world=original.matrix_world.copy()
    obj['source_name']=original.name
    copies.append(obj)
for o in list(scene.objects):
    if o not in copies:
        bpy.data.objects.remove(o,do_unlink=True)
for c in list(bpy.data.collections):
    if c != runtime and c.name in scene.collection.children:
        scene.collection.children.unlink(c)

# Bake shader base colors (terrain masks, noise, graded tree atlases) to vertex colors.
# This keeps the approved palette without unsupported runtime shader graphs.
materials={m for o in copies for m in o.data.materials if m}
links_backup=[]
for material in materials:
    shader=next((n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
    if not shader: continue
    output=next(n for n in material.node_tree.nodes if n.type=='OUTPUT_MATERIAL')
    emission=material.node_tree.nodes.new('ShaderNodeEmission')
    base=shader.inputs['Base Color']
    if base.is_linked: material.node_tree.links.new(base.links[0].from_socket,emission.inputs['Color'])
    else: emission.inputs['Color'].default_value=base.default_value
    material.node_tree.links.new(emission.outputs[0],output.inputs['Surface'])
    links_backup.append((material,shader,output,emission))

scene.render.engine='CYCLES'
scene.cycles.samples=1
scene.cycles.max_bounces=0
scene.render.bake.target='VERTEX_COLORS'
scene.render.bake.use_clear=True
scene.render.bake.margin=0
bpy.ops.object.select_all(action='DESELECT')
for o in copies:
    attr=o.data.color_attributes.new(name='GameColor',type='FLOAT_COLOR',domain='CORNER')
    o.data.color_attributes.active_color=attr
    o.select_set(True)
bpy.context.view_layer.objects.active=copies[0]
print('BAKING_VERTEX_COLORS',len(copies),flush=True)
bpy.ops.object.bake(type='EMIT')
print('BAKE_COMPLETE',flush=True)

for material,shader,output,emission in links_backup:
    material.node_tree.links.new(shader.outputs['BSDF'],output.inputs['Surface'])
    material.node_tree.nodes.remove(emission)
    for link in list(shader.inputs['Base Color'].links): material.node_tree.links.remove(link)
    color=material.node_tree.nodes.new('ShaderNodeVertexColor')
    color.layer_name='GameColor'
    material.node_tree.links.new(color.outputs['Color'],shader.inputs['Base Color'])
    for input_name in ('Normal','Coat Normal'):
        for link in list(shader.inputs[input_name].links):material.node_tree.links.remove(link)
    shader.inputs['Transmission Weight'].default_value=0
    if material.name=='Pond water turquoise':
        shader.inputs['Roughness'].default_value=.28
        shader.inputs['Alpha'].default_value=.86

def export(path, objects):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_yup=True,export_extras=True,export_cameras=False,export_lights=False)

# Separate target prototypes; pivots sit at ground level under the pedestal.
for prefix,info in target_data.items():
    objects=[o for o in copies if o['source_name'].startswith(prefix+' ') and o['source_name']!='Moving target rail']
    for o in objects:o.matrix_world=Matrix.Translation(-info['pivot']) @ o.matrix_world
    export(OUT/f'props/target-{prefix.lower()}.glb',objects)
    for o in objects: copies.remove(o);bpy.data.objects.remove(o,do_unlink=True)

# A reusable berry, independent of the decorative basket berries.
berry=[]
for o in copies:
    if o['source_name'] in {'Basket berry 00','Berry leaf 00'}:
        new=o.copy();new.data=o.data.copy();runtime.objects.link(new);berry.append(new)
bb=[v for o in berry for v in [*world_bounds(o)]]
center=Vector(((min(v.x for v in bb)+max(v.x for v in bb))/2,(min(v.y for v in bb)+max(v.y for v in bb))/2,min(v.z for v in bb)))
for o in berry:o.matrix_world=Matrix.Translation(-center)@o.matrix_world
export(OUT/'props/berry.glb',berry)
for o in berry:bpy.data.objects.remove(o,do_unlink=True)

def group_key(o):
    name=o['source_name']
    col=source_names[name]
    if name=='Garden grass terrain with recessed pond':return 'NAV_Ground'
    if name=='Pond water surface':return 'Pond_Water'
    if 'Village Cottage' in col:return 'Cottage'
    if 'Village Fence and Path' in col:return 'Fence_Path'
    if 'Garden Terrain' in col:return 'Terrain_Base'
    if 'Garden Designed Planting v08' in col:return 'Planting'
    if 'Garden Pond' in col:return 'Pond_Details'
    if 'Garden Props' in col:return 'Basket'
    if name=='Moving target rail':return 'Target_Rail'
    return 'Flowers_Grass'
groups=defaultdict(list)
for o in copies:groups[group_key(o)].append(o)
joined=[]
for name,objects in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.join()
    obj=bpy.context.object
    obj.name=name
    # Apply all transforms, then put category origins at the shared level origin.
    obj.data.transform(obj.matrix_world)
    obj.matrix_world.identity()
    for key in list(obj.keys()):del obj[key]
    obj['category']=name
    joined.append(obj)
export(OUT/'environments/garden.glb',joined)
(OUT/'levels/garden.json').write_text(json.dumps(layout,ensure_ascii=False,indent=2),encoding='utf-8')

# A clean source file contains only game meshes, rather than hidden visual variants.
bpy.ops.outliner.orphans_purge(do_recursive=True)
scene['game_asset_stage']='Static runtime garden; vertex base colors baked; targets and character exported separately'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'source/garden-runtime.blend'))
report={'source':'mudkip-garden-v11-perspective.blend','source_visible_objects':len(originals),'export_groups':len(joined),'vertices':sum(len(o.data.vertices) for o in joined),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in joined),'color_layers':{o.name:len(o.data.color_attributes) for o in joined},'colliders':len(layout['colliders']),'objects':[o.name for o in joined]}
(ROOT/'docs/garden-export-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('GARDEN_READY',json.dumps(report),flush=True)
