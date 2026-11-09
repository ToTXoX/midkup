from pathlib import Path
import bpy,json
ROOT=Path(__file__).resolve().parents[1]
scene=bpy.context.scene
material=bpy.data.materials['Mudkip Body'];nodes=material.node_tree.nodes;links=material.node_tree.links
links.new(nodes['Anime Light To Color'].outputs[0],nodes['Anime Clean Color'].inputs['Color'])
for enabled in (True,False):
    bpy.data.objects['Mudkip Ink Outline'].hide_render=not enabled
    scene.render.resolution_x=scene.render.resolution_y=640
    scene.render.filepath=str(ROOT/f'renders/toon-lightprobe-hull-{enabled}.png');bpy.ops.render.render(write_still=True)
print('LIGHTS',json.dumps([{'name':o.name,'hidden':o.hide_render,'type':o.data.type,'energy':o.data.energy,'direction':list(o.matrix_world.to_3x3()@__import__('mathutils').Vector((0,0,-1)))} for o in scene.objects if o.type=='LIGHT']))
