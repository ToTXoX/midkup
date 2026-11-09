from pathlib import Path
import bpy,sys,json
ROOT=Path(__file__).resolve().parents[1]
VERSION=sys.argv[sys.argv.index('--version')+1] if '--version' in sys.argv else 'v06'
sys.path.insert(0,str(ROOT/'scripts'))
from toon_character import apply_character_toon
scene=bpy.context.scene;mesh=bpy.data.objects['Mudkip'];rig=bpy.data.objects['Mudkip Rig']
scene.sync_mode='FRAME_DROP'
apply_character_toon(scene,mesh)
scene.render.resolution_x=scene.render.resolution_y=900
scene.render.resolution_percentage=100
scene.camera.data.type='ORTHO';scene.camera.data.ortho_scale=1.6
scene.camera.location=(1.15,-2.8,1.5)
from mathutils import Vector
scene.camera.rotation_euler=(Vector((0,0,.48))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
rig.animation_data.action=bpy.data.actions['Idle'];scene.frame_set(1)
bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);bpy.context.view_layer.objects.active=mesh
for path in [ROOT/'game-assets/source/mudkip-animations.blend',ROOT/f'mudkip-toon-{VERSION}.blend']:
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
for clip,time,name in [('Idle',0,'character'),('WaterCharge',.2,'charge'),('WaterShoot',.4,'shoot'),('Walk',.125,'walk'),('Run',1/6,'run')]:
    frame=round(time*scene.render.fps)+1
    rig.animation_data.action=bpy.data.actions[clip];scene.frame_set(frame)
    scene.render.filepath=str(ROOT/f'renders/toon-{VERSION}-blender-{name}.png');bpy.ops.render.render(write_still=True)
print('TOON_SOURCE_READY',json.dumps({'vertices':len(mesh.data.vertices),'polygons':len(mesh.data.polygons),'bones':len(rig.data.bones),'actions':[a.name for a in bpy.data.actions],'materials':[m.name for m in mesh.data.materials]}))
