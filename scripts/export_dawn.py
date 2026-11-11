"""Export Dawn's rig and in-place animation clips from dawn-character.blend."""

from math import cos, pi, radians, sin, tau
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector


scene = bpy.context.scene
rig = bpy.data.objects["Dawn · Pose Rig"]
root = bpy.data.objects["Dawn"]
output = Path(sys.argv[sys.argv.index("--") + 1])
output.parent.mkdir(parents=True, exist_ok=True)

if rig.mode != "OBJECT":
    bpy.ops.object.mode_set(mode="OBJECT")
scene.render.fps = 48
scene.render.fps_base = 1
rig.animation_data_clear()
root.scale = (0.15,) * 3


def translate(name, xyz):
    bone = rig.pose.bones[name]
    bone.location = bone.bone.matrix_local.to_3x3().inverted() @ Vector(xyz)


def rotate(name, axis, angle):
    bone = rig.pose.bones[name]
    local = bone.bone.matrix_local.to_3x3().inverted() @ Vector(axis)
    bone.rotation_quaternion = Quaternion(local, angle)


def aim(name, direction, weight):
    bone = rig.pose.bones[name]
    head = bone.head.copy()
    turn = (bone.tail - head).rotation_difference(Vector(direction))
    transform = Quaternion().slerp(turn, weight).to_matrix().to_4x4()
    bone.matrix = Matrix.Translation(head) @ transform @ Matrix.Translation(-head) @ bone.matrix
    bpy.context.view_layer.update()


def smooth(value):
    value = max(0, min(1, value))
    return value * value * (3 - 2 * value)


def idle(phase):
    time = phase * 3.75
    if .18 <= time <= 2.18:
        wave((time - .18) / 2)
        return
    translate("Pelvis", (0, 0, -.016 * (1 - cos(tau * phase))))
    rotate("Chest", (1, 0, 0), .026 * sin(tau * phase))
    rotate("Head", (0, 1, 0), .034 * sin(tau * phase))


def gait(phase, reach, lift, plant, crouch, swing, bounce=0):
    air = max(0, ((phase % .5) - plant) / (.5 - plant)) if bounce else 0
    height = -crouch + .025 * sin(tau * 2 * phase) + bounce * sin(pi * air)
    translate("Pelvis", (.038 * sin(tau * phase), 0, height))
    rotate("Chest", (0, 0, 1), .08 * cos(tau * phase))
    rotate("Head", (0, 0, 1), -.041 * cos(tau * phase))
    for side, offset in (("L", 0), ("R", .5)):
        t = (phase + offset) % 1
        if t < plant:
            stride = reach * (1 - 2 * t / plant)
            height = 0
            pitch = 0
        else:
            step = (t - plant) / (1 - plant)
            stride = reach * (2 * smooth(step) - 1)
            height = lift * sin(pi * step) ** 1.3
            pitch = -.26 * sin(tau * step) * sin(pi * step)
        translate(f"Foot IK.{side}", (0, -stride, height))
        rotate(f"Foot IK.{side}", (1, 0, 0), pitch)
        rotate(f"Upper Arm.{side}", (1, 0, 0), swing * cos(tau * (phase + offset)))
        rotate(f"Forearm.{side}", (1, 0, 0), .13 + .07 * sin(tau * (phase + offset)))


def wave(phase):
    lift = smooth(phase / .22) * smooth((1 - phase) / .23)
    wag = sin(tau * 3.5 * (phase - .18))
    rotate("Head", (0, 1, 0), -.13 * lift)
    translate("Pelvis", (-.045 * lift, 0, -.043 * lift))
    bpy.context.view_layer.update()
    aim("Upper Arm.L", (.46, -.27, -.13), lift)
    aim("Forearm.L", (.38, -.31, .27), lift)
    aim("Hand.L", (.19 + .12 * wag, -.16, .30 - .07 * wag), lift)


def iron_shoulder(phase):
    time = phase * 1.25
    stance = smooth(time / .21) * (1 - smooth((time - .94) / .28))
    charge = smooth((time - .09) / .25) * (1 - smooth((time - .63) / .14))
    thrust = smooth((time - .62) / .125) * (1 - smooth((time - .89) / .30))
    tilt = smooth((time - .035) / .155) * (1 - smooth((time - .88) / .29))
    tremor = smooth((time - .145) / .07) * (1 - smooth((time - .62) / .045))
    t = max(0, time - .145)
    shake = tremor * sin(tau * (4.0 * t + 6.5 * t * t))
    step = sin(pi * smooth((time - .66) / .26))
    translate("Pelvis", (-.11 * charge + .29 * thrust, -.062 * charge, -.18 * stance + .075 * thrust))
    rotate("Spine", (1, 0, 0), .15 * charge - .07 * thrust)
    rotate("Chest", (0, 1, 0), -.30 * tilt - .09 * thrust)
    rotate("Head", (0, 0, 1), .29 * tilt + .18 * thrust)
    # The character's left shoulder is the high shoulder and leads the lateral hit.
    translate("Shoulder.L", (.09 * thrust, .05 * shake, .14 * tilt + .13 * shake + .09 * thrust))
    rotate("Shoulder.L", (0, 1, 0), -.15 * shake)
    translate("Shoulder.R", (0, 0, -.065 * tilt))
    for side, sign in (("L", 1), ("R", -1)):
        translate(f"Foot IK.{side}", (sign * .30 * stance + (.24 if sign > 0 else .07) * thrust,
                                       sign * .14 * stance, (.145 if sign > 0 else .04) * step))
        rotate(f"Foot IK.{side}", (0, 0, 1), -sign * .18 * stance)
    bpy.context.view_layer.update()
    for side, sign in (("L", 1), ("R", -1)):
        aim(f"Upper Arm.{side}", (sign * (.10 + .14 * thrust), -.21 + .15 * thrust,
                                  -.35 if sign > 0 else -.47), .82 * stance)
        aim(f"Forearm.{side}", (-sign * .18, -.31 + .18 * thrust, .13 - .19 * thrust), .89 * stance)


def reset_pose():
    for bone in rig.pose.bones:
        bone.rotation_mode = "QUATERNION"
        bone.rotation_quaternion = Quaternion()
        bone.location = (0, 0, 0)
        bone.scale = (1, 1, 1)


def make_action(name, duration, animate, moving):
    frame_count = round(duration * scene.render.fps)
    animation = rig.animation_data_create()
    action = bpy.data.actions.new(name)
    animation.action = action
    for i in range(frame_count + 1):
        frame = i + 1
        scene.frame_set(frame)
        reset_pose()
        animate(i / frame_count)
        for name in moving:
            bone = rig.pose.bones[name]
            bone.keyframe_insert("location", frame=frame, group=name)
            bone.keyframe_insert("rotation_quaternion", frame=frame, group=name)
    animation.action = None
    return action


gait_bones = ["Pelvis", "Chest", "Head"] + [
    f"{part}.{side}" for side in ("L", "R") for part in ("Foot IK", "Upper Arm", "Forearm")
]
actions = [
    make_action("Idle", 3.75, idle, ("Pelvis", "Chest", "Head", "Upper Arm.L", "Forearm.L", "Hand.L")),
    make_action("Walk", .5, lambda phase: gait(phase, .56, .15, .51, .275, .42), gait_bones),
    make_action("Run", 1 / 3, lambda phase: gait(phase, .56, .38, .27, .28, .67, .12), gait_bones),
    make_action("IronShoulder", 1.25, iron_shoulder, ("Pelvis", "Spine", "Chest", "Head") + tuple(
        f"{part}.{side}" for side in ("L", "R") for part in ("Shoulder", "Foot IK", "Upper Arm", "Forearm")
    )),
]
for action in actions:
    track = rig.animation_data.nla_tracks.new()
    track.name = action.name
    track.strips.new(action.name, 1, action)
scene.frame_set(1)
reset_pose()

# Export only the playable model. Leave the Blender source and studio intact.
parts = [obj for obj in bpy.data.collections["DAWN"].all_objects
         if obj.type in {"MESH", "CURVE"} and not obj.hide_render]
for obj in parts:
    if obj.type != "MESH":
        continue
    skinned = any(mod.type == "ARMATURE" for mod in obj.modifiers)
    if skinned:
        world = obj.matrix_world.copy()
        obj.parent = rig
        obj.matrix_world = world
    if len(obj.data.polygons) < 700:
        continue
    bpy.context.view_layer.objects.active = obj
    decimate = obj.modifiers.new("Runtime mesh reduction", "DECIMATE")
    decimate.ratio = .42
    decimate.use_collapse_triangulate = True
    if skinned:
        bpy.ops.object.modifier_move_up(modifier=decimate.name)
    bpy.ops.object.modifier_apply(modifier=decimate.name)

bpy.ops.object.select_all(action="DESELECT")
for obj in [root, rig, *parts]:
    obj.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(
    filepath=str(output), export_format="GLB", use_selection=True,
    export_animations=True, export_animation_mode="NLA_TRACKS", export_force_sampling=True,
    export_anim_slide_to_zero=True, export_texcoords=False, export_yup=True,
)
