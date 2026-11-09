import bpy, json
from pathlib import Path
rig = bpy.data.objects['Mudkip Rig']
mesh = bpy.data.objects['Mudkip']
def vec(v): return [round(x, 5) for x in v]
info = {
 'file': bpy.data.filepath,
 'rig_transform': {'location': vec(rig.location), 'rotation': vec(rig.rotation_euler), 'scale': vec(rig.scale)},
 'bones': [{'name': b.name, 'parent': b.parent.name if b.parent else None, 'head': vec(b.head_local), 'tail': vec(b.tail_local), 'axes': [vec(b.matrix_local.to_3x3().col[i]) for i in range(3)]} for b in rig.data.bones],
 'weights': {'vertices': len(mesh.data.vertices), 'unweighted': sum(not v.groups for v in mesh.data.vertices), 'min_sum': min(sum(g.weight for g in v.groups) for v in mesh.data.vertices), 'max_sum': max(sum(g.weight for g in v.groups) for v in mesh.data.vertices)},
 'actions': [a.name for a in bpy.data.actions],
 'export_options': {p.identifier: {'type': p.type, 'default': str(getattr(p, 'default', '')), 'items': [i.identifier for i in p.enum_items] if p.type == 'ENUM' else []} for p in bpy.ops.export_scene.gltf.get_rna_type().properties if p.identifier.startswith(('export_animation', 'export_nla', 'export_frame', 'export_force', 'export_armature', 'export_bake', 'export_optimize', 'export_skins', 'use_selection'))}
}
out = Path(bpy.data.filepath).parent / 'docs/animation-rig-inspection.json'
out.write_text(json.dumps(info, indent=2), encoding='utf-8')
print(json.dumps(info, indent=2))
