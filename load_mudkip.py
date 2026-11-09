"""Import this original OpenCOLLADA asset into Blender 5, including its skin."""
from pathlib import Path
import math
import xml.etree.ElementTree as ET
import bpy
from mathutils import Matrix, Vector

ROOT = Path(r'C:\Users\qiank\Desktop\apprun\3d\mudkip')
SOURCE = ROOT / 'models/mudkip-original/extracted/Pokemon XY/Mudkip/Mudkip_OpenCollada.DAE'
OUTPUT = ROOT / 'mudkip-original.blend'

doc = ET.parse(SOURCE).getroot()
for element in doc.iter():
    element.tag = element.tag.split('}')[-1]
by_id = {e.get('id'): e for e in doc.iter() if e.get('id')}
unit = float(doc.find('asset/unit').get('meter'))

def values(text):
    return list(map(float, text.split()))

def matrix(text):
    numbers = values(text)
    return Matrix([numbers[i:i+4] for i in range(0, 16, 4)])

def source_data(source):
    array = next(e for e in source if e.tag.endswith('_array'))
    if array.tag == 'Name_array':
        return array.text.split()
    data = values(array.text)
    stride = int(source.find('technique_common/accessor').get('stride', '1'))
    return [data[i:i+stride] for i in range(0, len(data), stride)]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
collection = bpy.data.collections.new('Mudkip Original')
scene.collection.children.link(collection)

materials = {}
for material_xml in doc.findall('library_materials/material'):
    effect = by_id[material_xml.find('instance_effect').get('url')[1:]]
    image_id = effect.find('.//surface/init_from').text
    image_path = SOURCE.parent / by_id[image_id].findtext('init_from')
    material = bpy.data.materials.new('Mudkip Eyes' if 'Eye' in image_id else 'Mudkip Body')
    material.use_nodes = True
    shader = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    shader.inputs['Roughness'].default_value = 0.8
    specular = shader.inputs.get('Specular IOR Level')
    if specular:
        specular.default_value = 0.2
    texture = material.node_tree.nodes.new('ShaderNodeTexImage')
    texture.image = bpy.data.images.load(str(image_path), check_existing=True)
    material.node_tree.links.new(texture.outputs['Color'], shader.inputs['Base Color'])
    texture.location = (-320, 100)
    materials[material_xml.get('id')] = material

controller = doc.find('library_controllers/controller')
skin = controller.find('skin')
mesh_xml = by_id[skin.get('source')[1:]].find('mesh')
sources = {s.get('id'): source_data(s) for s in mesh_xml.findall('source')}
position_id = mesh_xml.find("vertices/input[@semantic='POSITION']").get('source')[1:]
bind_shape = matrix(skin.findtext('bind_shape_matrix'))
positions = [tuple((bind_shape @ Vector(v[:3])) * unit) for v in sources[position_id]]
bindings = {e.get('symbol'): e.get('target')[1:] for e in doc.findall('.//instance_material')}
faces, face_materials, loop_uvs, loop_normals = [], [], [], []
material_ids = list(materials)
for triangles in mesh_xml.findall('triangles'):
    inputs = {e.get('semantic'): (int(e.get('offset')), e.get('source')[1:]) for e in triangles.findall('input')}
    stride = max(v[0] for v in inputs.values()) + 1
    indices = list(map(int, triangles.findtext('p').split()))
    corners = [indices[i:i+stride] for i in range(0, len(indices), stride)]
    for start in range(0, len(corners), 3):
        tri = corners[start:start+3]
        faces.append(tuple(c[inputs['VERTEX'][0]] for c in tri))
        face_materials.append(material_ids.index(bindings[triangles.get('material')]))
        for c in tri:
            uv_offset, uv_source = inputs['TEXCOORD']
            normal_offset, normal_source = inputs['NORMAL']
            loop_uvs.append(sources[uv_source][c[uv_offset]][:2])
            loop_normals.append(sources[normal_source][c[normal_offset]][:3])

mesh = bpy.data.meshes.new('Mudkip Original Mesh')
mesh.from_pydata(positions, [], faces)
mesh.update()
obj = bpy.data.objects.new('Mudkip', mesh)
collection.objects.link(obj)
for mid in material_ids:
    mesh.materials.append(materials[mid])
for poly, index in zip(mesh.polygons, face_materials):
    poly.material_index = index
    poly.use_smooth = True
uv = mesh.uv_layers.new(name='UVMap')
for loop, coord in zip(uv.data, loop_uvs):
    loop.uv = coord
mesh.normals_split_custom_set(loop_normals)

skin_sources = {s.get('id'): source_data(s) for s in skin.findall('source')}
joint_source = skin.find("joints/input[@semantic='JOINT']").get('source')[1:]
bind_source = skin.find("joints/input[@semantic='INV_BIND_MATRIX']").get('source')[1:]
joint_ids = skin_sources[joint_source]
joint_nodes = {e.get('sid'): e for e in doc.findall('.//visual_scene//node') if e.get('sid') in joint_ids}
parents = {child: parent for parent in doc.iter() for child in parent}
names = {sid: joint_nodes[sid].get('name') for sid in joint_ids}
armature = bpy.data.armatures.new('Mudkip Original Skeleton')
rig = bpy.data.objects.new('Mudkip Rig', armature)
collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for sid, inverse_data in zip(joint_ids, skin_sources[bind_source]):
    rest = Matrix([inverse_data[i:i+4] for i in range(0, 16, 4)]).inverted()
    rest.translation *= unit
    bone = armature.edit_bones.new(names[sid])
    bone.head = rest.translation
    bone.tail = bone.head + rest.to_3x3().col[0].normalized() * 0.04
    bone.align_roll(rest.to_3x3().col[2])
for sid in joint_ids:
    ancestor = parents.get(joint_nodes[sid])
    while ancestor is not None:
        ancestor_sid = ancestor.get('sid')
        if ancestor_sid in names:
            armature.edit_bones[names[sid]].parent = armature.edit_bones[names[ancestor_sid]]
            break
        ancestor = parents.get(ancestor)
bpy.ops.object.mode_set(mode='OBJECT')

vertex_weights = skin.find('vertex_weights')
weight_inputs = {e.get('semantic'): (int(e.get('offset')), e.get('source')[1:]) for e in vertex_weights.findall('input')}
weight_values = skin_sources[weight_inputs['WEIGHT'][1]]
counts = list(map(int, vertex_weights.findtext('vcount').split()))
indices = list(map(int, vertex_weights.findtext('v').split()))
stride = max(v[0] for v in weight_inputs.values()) + 1
groups = [obj.vertex_groups.new(name=names[sid]) for sid in joint_ids]
cursor = 0
for vertex, count in enumerate(counts):
    for _ in range(count):
        joint = indices[cursor + weight_inputs['JOINT'][0]]
        weight = weight_values[indices[cursor + weight_inputs['WEIGHT'][0]]][0]
        if joint >= 0 and weight > 0:
            groups[joint].add([vertex], weight, 'REPLACE')
        cursor += stride
modifier = obj.modifiers.new('Original Skin', 'ARMATURE')
modifier.object = rig
obj.parent = rig
rig.show_in_front = False
rig.hide_set(True)
obj['source'] = str(SOURCE)
obj['credit'] = 'Nintendo / Game Freak / Creatures Inc.; ripped by Random Talking Bush; The Models Resource'
scene.unit_settings.system = 'METRIC'

# Save a useful opening view, and a separate preview camera for verification.
lower = Vector(tuple(min(v[i] for v in positions) for i in range(3)))
upper = Vector(tuple(max(v[i] for v in positions) for i in range(3)))
center = (lower + upper) / 2
extent = max(upper - lower)
direction = Vector((1.1, -2.1, 0.85)).normalized()
rotation = direction.to_track_quat('Z', 'Y')
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            space = area.spaces.active
            space.shading.type = 'MATERIAL'
            space.overlay.show_extras = False
            space.region_3d.view_location = center
            space.region_3d.view_rotation = rotation
            space.region_3d.view_distance = extent * 2.1
            space.clip_start = 0.001

preview = bpy.data.collections.new('Preview Lighting')
scene.collection.children.link(preview)
camera_data = bpy.data.cameras.new('Preview Camera')
camera = bpy.data.objects.new('Preview Camera', camera_data)
preview.objects.link(camera)
camera.location = center + direction * extent * 2.8
camera.rotation_euler = rotation.to_euler()
camera_data.type = 'ORTHO'
camera_data.ortho_scale = extent * 1.35
camera_data.clip_start = 0.001
scene.camera = camera
for name, offset, energy, size in [('Key', (1,-2,3), 110, 2.5), ('Fill', (-2,-1,1), 65, 2), ('Rim', (1,2,2), 90, 1.5)]:
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = energy
    data.shape = 'DISK'
    data.size = size
    light = bpy.data.objects.new(name, data)
    preview.objects.link(light)
    light.location = center + Vector(offset) * extent
    light.rotation_euler = (center-light.location).to_track_quat('-Z','Y').to_euler()
    light.hide_set(True)
camera.hide_set(True)
scene.world = bpy.data.worlds.new('Preview World')
scene.world.use_nodes = True
background = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
background.inputs[0].default_value = (0.12,0.12,0.12,1)
background.inputs[1].default_value = 0.5
scene.render.resolution_x = 700
scene.render.resolution_y = 700
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(ROOT / 'mudkip-preview.png')
scene.view_settings.view_transform = 'Standard'
bpy.ops.object.select_all(action='DESELECT')
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT))
print('IMPORTED', len(mesh.vertices), 'vertices;', len(mesh.polygons), 'triangles;', len(armature.bones), 'bones')
print('BOUNDS', tuple(lower), tuple(upper))
print('SAVED', OUTPUT)
bpy.ops.render.render(write_still=True)
