"""Compare camera composition offline; apply the selected gentle perspective without moving meshes."""
from pathlib import Path
import bpy
import math
import json
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

ROOT=Path(r'C:\Users\qiank\Desktop\apprun\3d\mudkip')
scene=bpy.context.scene
L=scene['design_body_length']
apply_live=globals().get('APPLY_CAMERA_TO_LIVE',False)
selected=globals().get('CAMERA_PRESET','gentle')

deps=bpy.context.evaluated_depsgraph_get()
points=[]
for obj in scene.objects:
    if obj.type not in ('MESH','CURVE') or obj.name=='Presentation ground':continue
    if obj.hide_render or not obj.visible_get():continue
    evaluated=obj.evaluated_get(deps)
    points.extend(evaluated.matrix_world@Vector(c) for c in evaluated.bound_box)
if not points:raise RuntimeError('No visible garden geometry to frame')

PRESETS={
    'gentle':{'azimuth':10,'elevation':44,'lens':60},
    'frontal':{'azimuth':0,'elevation':48,'lens':65}
}

def make_camera(key):
    preset=PRESETS[key]
    data=bpy.data.cameras.new('Garden perspective '+key)
    choices=[i.identifier for i in data.bl_rna.properties['type'].enum_items]
    if 'PERSP' not in choices:raise RuntimeError('Perspective camera unavailable')
    data.type='PERSP';data.lens=preset['lens'];data.sensor_width=36
    data.clip_start=.01*L;data.clip_end=500*L
    data.shift_x=0;data.shift_y=0;data.dof.use_dof=False
    camera=bpy.data.objects.new('Camera Garden Perspective '+key,data)
    bpy.data.collections['Garden Cameras'].objects.link(camera)
    azimuth=math.radians(preset['azimuth']);elevation=math.radians(preset['elevation'])
    direction=Vector((math.sin(azimuth)*math.cos(elevation),-math.cos(azimuth)*math.cos(elevation),math.sin(elevation)))
    target=Vector((0,1.2,.35))*L
    def place(distance):
        camera.location=target+direction*distance
        camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
        bpy.context.view_layer.update()
    def fits():
        for point in points:
            p=world_to_camera_view(scene,camera,point)
            if p.z<=0 or p.x<.065 or p.x>.935 or p.y<.065 or p.y>.935:return False
        return True
    low,high=8*L,100*L
    for _ in range(26):
        middle=(low+high)/2;place(middle)
        if fits():high=middle
        else:low=middle
    place(high)
    camera.hide_set(True)
    camera['projection_design']='Gentle perspective, square pixels, level verticals, automatic garden framing'
    return camera,{'preset':key,**preset,'position':list(camera.location),'rotation_euler':list(camera.rotation_euler),'distance_L':high/L,'target_L':[0,1.2,.35]}

scene.render.pixel_aspect_x=1;scene.render.pixel_aspect_y=1
scene.render.resolution_x=1700;scene.render.resolution_y=1450
if apply_live:
    camera,settings=make_camera(selected)
    scene.camera=camera
    scene.render.resolution_percentage=100
    scene.render.filepath=str(ROOT/'renders/garden-perspective-overview-v11.png')
    scene['asset_stage']='Village v11: camera adjusted to gentle perspective; garden models preserved'
    scene['camera_settings']='docs/camera-settings-v11.json'
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                space=area.spaces.active
                space.region_3d.view_rotation=camera.rotation_euler.to_quaternion()
                space.region_3d.view_perspective='CAMERA'
                space.region_3d.view_camera_offset=(0,0)
                space.region_3d.view_camera_zoom=10
    (ROOT/'docs/camera-settings-v11.json').write_text(json.dumps(settings,indent=2)+'\n',encoding='utf-8')
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'mudkip-garden-v11-perspective.blend'))
    print('CAMERA APPLIED',json.dumps(settings))
else:
    scene.render.resolution_percentage=75
    for key in PRESETS:
        camera,settings=make_camera(key);scene.camera=camera
        scene.render.filepath=str(ROOT/('renders/camera-study-'+key+'-v11.png'))
        bpy.ops.render.render(write_still=True)
        print('CAMERA STUDY',json.dumps(settings))
    print('STUDIES ONLY; no blend file changed')
