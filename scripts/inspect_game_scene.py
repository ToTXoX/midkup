import bpy, json
from pathlib import Path
from mathutils import Vector
scene = bpy.context.scene
objects = [o for o in scene.objects if o.type in {'MESH','CURVE','FONT'} and o.visible_get() and not o.hide_render]
info = {'file': bpy.data.filepath, 'length': scene.get('design_body_length'), 'objects': [], 'materials': []}
for o in objects:
    bounds = [o.matrix_world @ Vector(v) for v in o.bound_box]
    info['objects'].append({'name': o.name, 'type': o.type, 'collections': [c.name for c in o.users_collection], 'vertices': len(o.data.vertices) if o.type=='MESH' else 0, 'bounds': [[round(min(v[i] for v in bounds),3) for i in range(3)],[round(max(v[i] for v in bounds),3) for i in range(3)]], 'materials': [m.name for m in o.data.materials if m]})
used = {m for o in objects for m in o.data.materials if m}
for m in used:
    shader = next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None) if m.use_nodes else None
    info['materials'].append({'name':m.name,'color':list(m.diffuse_color),'nodes': [{'name':n.name,'type':n.type, 'image': n.image.name if n.type=='TEX_IMAGE' and n.image else None, 'inputs': {s.name:list(s.default_value) if hasattr(s.default_value,'__len__') else s.default_value for s in n.inputs if hasattr(s,'default_value') and s.type in {'RGBA','VALUE','VECTOR'}}, 'attribute':getattr(n,'attribute_name',None)} for n in m.node_tree.nodes] if m.use_nodes else [], 'base_linked':shader.inputs['Base Color'].is_linked if shader else False})
out=Path(__file__).resolve().parents[1]/'docs/game-scene-inspection.json'
out.write_text(json.dumps(info,indent=2),encoding='utf-8')
print('VISIBLE',len(objects),'MATERIALS',len(used),'VERTICES',sum(o['vertices'] for o in info['objects']))
print('COLLECTIONS',sorted({c for o in info['objects'] for c in o['collections']}))
print('LINKED_MATERIALS',[(m['name'],[n['type'] for n in m['nodes']]) for m in info['materials'] if m['base_linked']])
print('BOUNDS_SPECIAL',[(o['name'],o['bounds']) for o in info['objects'] if o['vertices']>4000 or any(c in ['Garden Terrain','Game Markers','Game Targets'] for c in o['collections'])])
