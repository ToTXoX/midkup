from pathlib import Path
import bpy
root=Path(r'C:\Users\qiank\Desktop\apprun\3d\mudkip')
s=bpy.context.scene
s.render.resolution_percentage=100
s.render.resolution_x=1700;s.render.resolution_y=1450
s.camera=bpy.data.objects['Camera Garden Overview']
s.render.filepath=str(root/'renders/garden-quaternius-A-overview-v05.png')
bpy.ops.render.render(write_still=True)
s.render.resolution_x=1500;s.render.resolution_y=1200
s.camera=bpy.data.objects['Camera Littleroot Cottage']
s.render.filepath=str(root/'renders/garden-quaternius-A-closeup-v05.png')
bpy.ops.render.render(write_still=True)
print('OPTION A PREVIEWS COMPLETE')
