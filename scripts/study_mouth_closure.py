from pathlib import Path
import bpy,json
from mathutils import Matrix,Vector,Quaternion
ROOT=Path(__file__).resolve().parents[1]
rig=bpy.data.objects['Mudkip Rig']
mesh=bpy.data.objects['Mudkip']
rig.animation_data_clear()
rig.hide_set(False)
for pb in rig.pose.bones:pb.matrix_basis.identity()
bpy.context.view_layer.update()
scene=bpy.context.scene
scene.cycles.samples=16
scene.render.resolution_x=scene.render.resolution_y=640
scene.render.resolution_percentage=100
scene.camera.location=(1.0,-2.8,1.2)
scene.camera.rotation_euler=(Vector((0,0,.48))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
baseline=rig.pose.bones['Jaw'].matrix.copy()
for angle in (-.34,-.37,-.40):
    rig.pose.bones['Jaw'].matrix=Matrix.LocRotScale(baseline.translation,Quaternion(Vector((1,0,0)),angle)@baseline.to_quaternion(),Vector((1,1,1)))
    bpy.context.view_layer.update()
    scene.render.filepath=str(ROOT/f'renders/mouth-study-{round(-angle*100):02d}.png')
    bpy.ops.render.render(write_still=True)
group=mesh.vertex_groups['Jaw'].index
vertices=[v.co for v in mesh.data.vertices if any(g.group==group and g.weight>.5 for g in v.groups)]
print('JAW_VERTICES',len(vertices),'BOUNDS',[min(v[i] for v in vertices) for i in range(3)],[max(v[i] for v in vertices) for i in range(3)])
