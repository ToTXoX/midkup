"""Editable Eevee cel materials and a skinned ink hull for the source character."""
import bpy, bmesh, math
from mathutils import Vector

def srgb(hex_value):
    values=[int(hex_value.lstrip('#')[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in values)+(1,)

def cel_material(material,texture=None,base=(1,1,1,1)):
    material.use_nodes=True
    nodes,links=material.node_tree.nodes,material.node_tree.links
    for node in list(nodes):
        if node.name.startswith('Anime '):nodes.remove(node)
    output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
    # Keep the original Principled/map graph as an editable glTF fallback.
    original=next((n for n in nodes if n.type=='BSDF_PRINCIPLED'),None)
    if original:original.label='Original glTF fallback';original.location=(-650,250)
    emission=nodes.new('ShaderNodeEmission');emission.name='Anime Clean Color';emission.location=(460,30)
    # Both atlases include skin; eyes share the head's cel lighting.
    diffuse=nodes.new('ShaderNodeBsdfDiffuse');diffuse.name='Anime Light Probe';diffuse.location=(-650,-160)
    diffuse.inputs['Color'].default_value=(1,1,1,1)
    rgb=nodes.new('ShaderNodeShaderToRGB');rgb.name='Anime Light To Color';rgb.location=(-440,-160)
    value=nodes.new('ShaderNodeRGBToBW');value.name='Anime Light Value';value.location=(-250,-160)
    ramp=nodes.new('ShaderNodeValToRGB');ramp.name='Anime Three Light Bands';ramp.location=(-60,-160)
    ramp.color_ramp.interpolation='CONSTANT'
    elements=ramp.color_ramp.elements
    elements[0].position=0;elements[0].color=(.34,.46,.65,1)
    elements[1].position=.52;elements[1].color=(1,.98,.93,1)
    mid=elements.new(.13);mid.color=(.68,.77,.88,1)
    multiply=nodes.new('ShaderNodeMixRGB');multiply.name='Anime Palette Multiply';multiply.blend_type='MULTIPLY';multiply.location=(240,30)
    multiply.inputs[0].default_value=1;multiply.inputs[1].default_value=base
    links.new(diffuse.outputs[0],rgb.inputs[0]);links.new(rgb.outputs[0],value.inputs[0]);links.new(value.outputs[0],ramp.inputs[0])
    links.new(ramp.outputs['Color'],multiply.inputs[2])
    if texture:links.new(texture.outputs['Color'],multiply.inputs[1]);texture.location=(-450,200)
    links.new(multiply.outputs[0],emission.inputs['Color'])
    links.new(emission.outputs[0],output.inputs['Surface']);output.location=(680,30)
    material['render_style']='anime cel / three bands / no physical specular'
    material.diffuse_color=base

def apply_character_toon(scene,mesh):
    for material in mesh.data.materials:
        texture=next((n for n in material.node_tree.nodes if n.type=='TEX_IMAGE'),None)
        cel_material(material,texture)
    # Smooth shading retains the source's authored split normals and UV edges.
    for polygon in mesh.data.polygons:polygon.use_smooth=True
    old=bpy.data.objects.get('Mudkip Ink Outline')
    if old:bpy.data.objects.remove(old,do_unlink=True)
    hull=mesh.copy();hull.data=mesh.data.copy();scene.collection.objects.link(hull)
    hull.name='Mudkip Ink Outline';hull.animation_data_clear();hull.hide_set(False)
    bm=bmesh.new();bm.from_mesh(hull.data);bmesh.ops.reverse_faces(bm,faces=list(bm.faces));bm.normal_update();bm.to_mesh(hull.data);bm.free()
    hull.data.normals_split_custom_set([(0,0,0)]*len(hull.data.loops))
    ink=bpy.data.materials.get('Anime Ink Deep Blue') or bpy.data.materials.new('Anime Ink Deep Blue')
    ink.use_nodes=True;ink.use_backface_culling=True
    ink.node_tree.nodes.clear()
    output=ink.node_tree.nodes.new('ShaderNodeOutputMaterial');emission=ink.node_tree.nodes.new('ShaderNodeEmission')
    emission.inputs['Color'].default_value=srgb('#294653')
    path=ink.node_tree.nodes.new('ShaderNodeLightPath');transparent=ink.node_tree.nodes.new('ShaderNodeBsdfTransparent');mix=ink.node_tree.nodes.new('ShaderNodeMixShader')
    ink.node_tree.links.new(path.outputs['Is Shadow Ray'],mix.inputs[0]);ink.node_tree.links.new(emission.outputs[0],mix.inputs[1]);ink.node_tree.links.new(transparent.outputs[0],mix.inputs[2]);ink.node_tree.links.new(mix.outputs[0],output.inputs[0])
    hull.data.materials.clear();hull.data.materials.append(ink)
    for p in hull.data.polygons:p.material_index=0
    displacement=hull.modifiers.new('Ink shell width — editable','DISPLACE');displacement.direction='NORMAL';displacement.strength=-.0028;displacement.mid_level=0
    bpy.context.view_layer.objects.active=hull
    bpy.ops.object.modifier_move_to_index(modifier=displacement.name,index=0)
    hull['purpose']='Back-facing skinned outline; preview only, recreated by Three.js OutlineEffect'
    hull['export']=False
    if hasattr(hull,'visible_shadow'):hull.visible_shadow=False
    scene.render.engine='BLENDER_EEVEE'
    scene.render.film_transparent=False
    scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.view_settings.exposure=0;scene.view_settings.gamma=1
    scene.world.use_nodes=True
    background=scene.world.node_tree.nodes.get('Background')
    if background:background.inputs[0].default_value=srgb('#f2f3e4');background.inputs[1].default_value=.18
    for obj in list(scene.objects):
        if obj.type=='LIGHT':obj.hide_render=True
    sun=bpy.data.objects.get('Anime Daylight')
    if not sun:
        data=bpy.data.lights.new('Anime Daylight','SUN');sun=bpy.data.objects.new('Anime Daylight',data);scene.collection.objects.link(sun)
    sun.hide_render=False;sun.location=(-3,-4,5);sun.rotation_euler=(-sun.location).to_track_quat('-Z','Y').to_euler()
    sun.data.energy=2.5;sun.data.angle=math.radians(3);sun.data.color=(1,.97,.91)
    ground=bpy.data.objects.get('Preview Ground — not exported')
    if ground:
        material=bpy.data.materials.get('Anime Warm Paper Ground') or bpy.data.materials.new('Anime Warm Paper Ground')
        cel_material(material,base=srgb('#e9ecd7'));ground.data.materials.clear();ground.data.materials.append(material)
    scene['art_direction']='Japanese animation / clean three-band cel colors / deep blue ink / cool shadows'
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':area.spaces.active.shading.type='RENDERED'
    return hull
