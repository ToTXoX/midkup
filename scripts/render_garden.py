from pathlib import Path
import bpy

root=Path(r'C:\Users\qiank\Desktop\apprun\3d\mudkip')
scene=bpy.context.scene
scene.render.resolution_percentage=100
scene.render.resolution_x=1600
scene.render.resolution_y=1250
scene.camera=bpy.data.objects['Camera Garden Overview']
scene.render.filepath=str(root/'renders/garden-overview-v01.png')
bpy.ops.render.render(write_still=True)
scene.camera=bpy.data.objects['Camera Pet Closeup']
scene.render.resolution_x=1500
scene.render.resolution_y=1000
scene.render.filepath=str(root/'renders/garden-closeup-v01.png')
bpy.ops.render.render(write_still=True)
print('GARDEN PREVIEWS COMPLETE')
