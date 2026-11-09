from pathlib import Path
import bpy,json
ROOT=Path(__file__).resolve().parents[1]
scene=bpy.context.scene;mesh=bpy.data.objects['Mudkip'];hull=bpy.data.objects['Mudkip Ink Outline'];rig=bpy.data.objects['Mudkip Rig']
assert len(mesh.data.vertices)==1676 and len(mesh.data.polygons)==3344
assert len(rig.data.bones)==25 and len(bpy.data.actions)==7
assert scene.render.engine=='BLENDER_EEVEE'
assert next(m for m in hull.modifiers if m.type=='ARMATURE').object==rig
assert len(mesh.data.uv_layers)==1
for material in mesh.data.materials:
    nodes=material.node_tree.nodes
    assert nodes['Anime Three Light Bands'].color_ramp.interpolation=='CONSTANT'
    assert len(nodes['Anime Three Light Bands'].color_ramp.elements)==3
    output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
    assert output.inputs['Surface'].links[0].from_node.name=='Anime Clean Color'
samples=[]
for clip,frame in [('Idle',1),('Run',5),('Eat',18),('WaterCharge',8),('WaterShoot',13)]:
    rig.animation_data.action=bpy.data.actions[clip];scene.frame_set(frame)
    dg=bpy.context.evaluated_depsgraph_get()
    body=mesh.evaluated_get(dg).data;outline=hull.evaluated_get(dg).data
    assert len(body.vertices)==len(outline.vertices)
    difference=max((a.co-b.co).length for a,b in zip(body.vertices,outline.vertices))
    assert 0<difference<.004, (clip,difference)
    samples.append({'clip':clip,'frame':frame,'maximumOutlineOffsetMeters':difference})
result={'source':bpy.data.filepath,'engine':scene.render.engine,'vertices':len(mesh.data.vertices),'triangles':len(mesh.data.polygons),'bones':len(rig.data.bones),'actions':[a.name for a in bpy.data.actions],'unchangedTopology':True,'toonBands':3,'outlineSamples':samples,'textures':[{'name':i.name,'packed':bool(i.packed_file)} for i in bpy.data.images if i.source=='FILE']}
assert all(i['packed'] for i in result['textures'])
(ROOT/'docs/toon-source-validation.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print('PASS editable source materials, preserved topology/UV, packed textures, seven actions and skinned outline',json.dumps(result))
