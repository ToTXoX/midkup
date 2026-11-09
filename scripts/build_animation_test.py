"""Create and validate a small, independently exportable Mudkip animation rig."""
from pathlib import Path
import bpy, math, json, sys, struct
from mathutils import Vector, Matrix, Quaternion

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'animation-test'
GAME = '--game' in sys.argv
ASSET_OUT = ROOT / 'game-assets/characters/mudkip' if GAME else OUT / 'public/assets'
ASSET_OUT.mkdir(parents=True, exist_ok=True)
(ROOT / 'game-assets/source').mkdir(parents=True, exist_ok=True)
(OUT / 'public/assets').mkdir(parents=True, exist_ok=True)
scene = bpy.context.scene
rig = bpy.data.objects['Mudkip Rig']
mesh = bpy.data.objects['Mudkip']
rig.hide_set(False)
rig.hide_render = False
rig.animation_data_clear()
rig.location = (0, 0, 0)
rig.rotation_euler = (0, 0, 0)
rig.scale = (1, 1, 1)
# A top-level skinned mesh avoids glTF's non-root skinned-node warning.
# The Armature modifier remains linked; both objects have identity transforms.
mesh.parent = None
FPS = 120 if GAME else 30
scene.render.fps = FPS
if GAME:scene.sync_mode='FRAME_DROP'
scene.render.fps_base = 1
scene.frame_start = 1

# A common body root preserves the two independent roots in the source skeleton.
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
root = rig.data.edit_bones.new('MotionRoot')
root.head, root.tail = (0, 0, 0), (0, 0, .12)
for name in ('Hips', 'Spine1'):
    rig.data.edit_bones[name].parent = root
bpy.ops.object.mode_set(mode='OBJECT')
for pb in rig.pose.bones:
    pb.rotation_mode = 'QUATERNION'
rest = {b.name: b.matrix_local.copy() for b in rig.data.bones}
feet = [
    ('LArm', 'LForeArm', 'LHand', 0.0),
    ('RThigh', 'RLeg', 'RFoot', .25),
    ('RArm', 'RForeArm', 'RHand', .5),
    ('LThigh', 'LLeg', 'LFoot', .75),
]
base_feet = {foot: rest[foot].translation.copy() for _, _, foot, _ in feet}
GAITS = {'Walk':{'duration':.4,'stride':.148,'stance':.56},'Run':{'duration':.35,'stride':.173,'stance':.32}}
CELEBRATION={'duration':5,'spin_start':.65,'spin_end':2.75,'steps':24,'settle_step':.07,'happy_start':3.60,'happy_end':4.68}
CELEBRATION_FEET=['LHand','RFoot','RHand','LFoot']
rig['EyeSmile']=0.0

def axis_quat(axis, angle):
    return Quaternion(Vector(axis), angle)

def smooth(a, b, t):
    x = max(0, min(1, (t-a)/(b-a)))
    return x*x*(3-2*x)

def celebration_angle(seconds):
    p=max(0,min(1,(seconds-CELEBRATION['spin_start'])/(CELEBRATION['spin_end']-CELEBRATION['spin_start'])))
    ramp=.1
    if p<ramp:progress=p*p/(2*ramp)
    elif p>1-ramp:progress=1-ramp-(1-p)**2/(2*ramp)
    else:progress=p-ramp/2
    return 2*math.pi*progress/(1-ramp)

def celebration_foot(foot,seconds):
    """A planted world-space mark, followed by one small airborne arc."""
    slot=CELEBRATION_FEET.index(foot)
    step=(CELEBRATION['spin_end']-CELEBRATION['spin_start'])/CELEBRATION['steps']
    planted=0.0
    for index in range(slot,CELEBRATION['steps'],4):
        start=CELEBRATION['spin_start']+index*step;end=start+step
        landing=(celebration_angle(end)+celebration_angle(start+4*step))/2
        if seconds<start:return planted,0
        if seconds<end:
            u=(seconds-start)/step;eased=u*u*(3-2*u)
            return planted+(landing-planted)*eased,.021*math.sin(math.pi*u)**1.4
        planted=landing
    start=CELEBRATION['spin_end']+slot*CELEBRATION['settle_step']
    end=start+CELEBRATION['settle_step']
    if seconds<start:return planted,0
    if seconds<end:
        u=(seconds-start)/(end-start);eased=u*u*(3-2*u)
        return planted+(2*math.pi-planted)*eased,.010*math.sin(math.pi*u)**1.4
    return 2*math.pi,0

def world_rotate(name, axis, angle):
    """Apply an armature-space rotation around the bone's current head."""
    pb = rig.pose.bones[name]
    mat = pb.matrix.copy()
    pb.matrix = Matrix.LocRotScale(mat.translation, axis_quat(axis, angle) @ mat.to_quaternion(), Vector((1, 1, 1)))
    bpy.context.view_layer.update()

reach_errors = []
reach_details=[]
def solve_limb(upper_name, lower_name, foot_name, target):
    """Analytical two-link IK; bake the result without runtime constraints."""
    upper, lower, foot = [rig.pose.bones[n] for n in (upper_name, lower_name, foot_name)]
    a, old_b, old_c = upper.head.copy(), lower.head.copy(), foot.head.copy()
    l1 = (rest[lower_name].translation - rest[upper_name].translation).length
    l2 = (rest[foot_name].translation - rest[lower_name].translation).length
    direction = target - a
    distance = direction.length
    direction.normalize()
    d = min(max(distance, abs(l1-l2)+1e-5), l1+l2-1e-5)
    reach_errors.append(max(0, distance - d))
    if distance-d>.0001:reach_details.append({'clip':pose_kind,'t':round(pose_time,4),'foot':foot_name,'error':distance-d})
    # Nearly straight source legs have a very small rest bend. Deriving a
    # pole from that bend while swaying can swivel the knee sideways. Keep
    # elbows/knees in their anatomical front/back bending planes on land.
    pole = Vector((0, 1 if 'Arm' in upper_name else -1, 0)) if pose_kind in {'DanceA','DanceB','DanceC','Walk','Run'} else old_b-a
    if pose_kind=='DanceC':pole=Matrix.Rotation(pose_yaw,3,'Z') @ pole
    pole -= direction * pole.dot(direction)
    if pole.length < 1e-6:
        pole = Vector((0, 1, 0)) - direction * direction.y
    pole.normalize()
    along = (l1*l1 - l2*l2 + d*d) / (2*d)
    knee = a + direction*along + pole*math.sqrt(max(0, l1*l1-along*along))
    actual_target = a + direction*d
    q = (old_b-a).rotation_difference(knee-a)
    upper.matrix = Matrix.LocRotScale(a, q @ upper.matrix.to_quaternion(), Vector((1, 1, 1)))
    bpy.context.view_layer.update()
    q2 = (foot.head-lower.head).rotation_difference(actual_target-lower.head)
    lower.matrix = Matrix.LocRotScale(lower.head.copy(), q2 @ lower.matrix.to_quaternion(), Vector((1, 1, 1)))
    bpy.context.view_layer.update()
    foot.matrix = Matrix.LocRotScale(actual_target, rest[foot_name].to_quaternion(), Vector((1, 1, 1)))
    bpy.context.view_layer.update()

def pose(kind, t):
    global pose_kind,pose_time,pose_yaw
    pose_kind,pose_time,pose_yaw=kind,t,0.0
    rig['EyeSmile']=0.0
    for pb in rig.pose.bones:
        pb.matrix_basis.identity()
    bpy.context.view_layer.update()
    targets = {name: pos.copy() for name, pos in base_feet.items()}
    toe_pitch = {}
    foot_yaw = {}
    tau = 2*math.pi*t
    # The source's rest pose is open-mouthed. About -0.37 rad closes the
    # weighted lower lip without pushing its white underside through the face.
    closed_jaw = -.37 if GAME else -.04
    jaw = closed_jaw
    if kind == 'Idle':
        rise = .0025 * (1-math.cos(tau))
        rig.pose.bones['MotionRoot'].matrix = Matrix.Translation((0, 0, -.005 + rise)) @ rest['MotionRoot']
        bpy.context.view_layer.update()
        world_rotate('Spine2', (1, 0, 0), .004*math.sin(tau))
        world_rotate('Head', (0, 1, 0), .016*math.sin(tau))
        world_rotate('Tail1', (0, 0, 1), .045*math.sin(tau))
        world_rotate('Tail2', (0, 0, 1), .025*math.sin(tau-.3))
        world_rotate('Feeler1', (0, 1, 0), .012*math.sin(tau-.4))
    elif GAME and kind in {'Walk','Run'}:
        running=kind=='Run'
        gait=GAITS[kind];stride,stance=gait['stride'],gait['stance']
        hop=0
        if running:
            half=t%.5
            if half<stance:
                height=-.032-.006*math.sin(math.pi*half/stance)**2
            else:
                flight=(half-stance)/(.5-stance)
                hop=.032*4*flight*(1-flight)
                height=-.032+hop
        else:
            height=-.024-.002*math.cos(2*tau)
        rig.pose.bones['MotionRoot'].matrix=Matrix.Translation((0,0,height))@rest['MotionRoot']
        bpy.context.view_layer.update()
        body_pitch=(.025+.004*math.sin(2*tau)) if running else .010
        world_rotate('MotionRoot',(1,0,0),body_pitch)
        world_rotate('MotionRoot',(0,1,0),(.010 if running else .012)*math.sin(tau))
        world_rotate('Head',(1,0,0),-.6*body_pitch+(.018 if running else .012)*math.sin(2*tau-.65))
        world_rotate('Head',(0,1,0),-.010*math.sin(tau-.2))
        world_rotate('Tail1',(0,0,1),(.13 if running else .10)*math.sin(tau-.45))
        world_rotate('Tail2',(0,0,1),(.07 if running else .05)*math.sin(tau-.95))
        world_rotate('Tail1',(1,0,0),(.045 if running else .025)+(.025 if running else .015)*math.sin(2*tau-.7))
        world_rotate('Feeler1',(1,0,0),(.045 if running else .025)*math.sin(2*tau-.95))
        world_rotate('Feeler1',(0,1,0),(.025 if running else .020)*math.sin(tau-.5))
        world_rotate('Feeler2',(1,0,0),(.025 if running else .015)*math.sin(2*tau-1.25))
        for upper,_,name,phase in feet:
            if running:phase=0 if name in {'LHand','RFoot'} else .5
            p=(t+phase)%1
            # Centre the stride below the shoulder/hip instead of reaching
            # past the short leg's range and compensating with a deep crouch.
            targets[name].y+=rest[upper].translation.y-base_feet[name].y
            targets[name].z+=hop
            if p<stance:
                targets[name].y+=stride*(p/stance-.5)
            else:
                u=(p-stance)/(1-stance)
                eased=u*u*(3-2*u)
                targets[name].y+=stride*(.5-eased)
                targets[name].z+=(.020 if running else .025)*math.sin(math.pi*u)**1.4
            # Paws stay flat and travel front/back, without lateral scooping.
    elif kind in {'Walk', 'Run'}:
        running = kind == 'Run'
        rig.pose.bones['MotionRoot'].matrix = Matrix.Translation((0, 0, (-.032 if running else -.023) + .003*math.cos(2*tau))) @ rest['MotionRoot']
        bpy.context.view_layer.update()
        world_rotate('Spine2', (0, 1, 0), .012*math.sin(tau))
        world_rotate('Head', (1, 0, 0), .012*math.sin(2*tau))
        world_rotate('Tail1', (0, 0, 1), .075*math.sin(tau))
        world_rotate('Tail2', (0, 0, 1), .035*math.sin(tau-.4))
        world_rotate('Feeler1', (0, 1, 0), .025*math.sin(tau-.5))
        for _, _, name, phase in feet:
            if running:
                phase = 0 if name in {'LHand','RFoot'} else .5
            p = (t + phase) % 1
            stride, stance = (.145, .5) if running else (.13, .62)
            if p < stance:
                targets[name].y += stride * (p/stance-.5)
            else:
                u = (p-stance)/(1-stance)
                eased = u*u*(3-2*u)
                targets[name].y += stride * (.5-eased)
                targets[name].z += (.045 if running else .032)*math.sin(math.pi*u)**1.5
    elif kind in {'Swim','SwimIdle'}:
        moving=kind=='Swim'
        # Lean into propulsion, with no walking bounce. Runtime owns buoyancy.
        swim_transform=Matrix.Rotation(.18 if moving else .10,4,'X')
        rig.pose.bones['MotionRoot'].matrix = swim_transform @ rest['MotionRoot']
        bpy.context.view_layer.update()
        world_rotate('Spine2',(0,1,0),.012*math.sin(tau))
        world_rotate('Head',(1,0,0),(-.12 if moving else -.07)+.008*math.sin(2*tau-.4))
        world_rotate('Tail1',(0,0,1),(.16 if moving else .055)*math.sin(tau-.4))
        world_rotate('Tail2',(0,0,1),(.10 if moving else .035)*math.sin(tau-1.0))
        world_rotate('Tail1',(1,0,0),-.32 if moving else -.24)
        world_rotate('Feeler1',(0,1,0),.018*math.sin(tau-.7))
        world_rotate('Feeler2',(1,0,0),.012*math.sin(tau-1.1))
        for upper,lower,foot,phase in feet:
            side=1 if foot.startswith('L') else -1
            p=(t+(0 if side==1 else .5)+(.25 if 'Foot' in foot else 0))%1
            # A quick submerged pull, then a slower tucked recovery. IK keeps
            # the paw moving backwards through water instead of windmilling.
            pull=p<.42;u=p/.42 if pull else (p-.42)/.58;u=u*u*(3-2*u)
            target=base_feet[foot].copy()
            target.y+=(.060 if moving else .020)*(-1+2*u if pull else 1-2*u)
            target.z+=.047+(0 if pull else .025*math.sin(math.pi*u))
            target.x+=side*.010*math.sin(math.pi*u)
            targets[foot]=swim_transform @ target
            toe_pitch[foot]=(-.14 if pull else .10)*math.sin(math.pi*u)
    elif kind == 'DanceA':
        # Eight beats at 120 BPM. Keep support paws planted while the body
        # shifts over them; only the active stepping paws leave the floor.
        seconds = t * 4
        def pulse(start, peak, end, time=seconds):
            return smooth(start, peak, time) * (1-smooth(peak, end, time))
        def sway(time):
            return pulse(0, .25, .50, time)-pulse(.50, .75, 1, time)
        envelope = smooth(0, .12, seconds)*(1-smooth(3.84, 4, seconds))
        weight = sway(seconds)
        step_width = .019
        side_step = step_width*(smooth(2.02, 2.48, seconds)-smooth(2.52, 2.98, seconds))
        nod = pulse(1, 1.23, 1.5)+.70*pulse(1.5, 1.73, 2)
        crouch = pulse(3, 3.22, 3.33)
        landing = pulse(3.72, 3.80, 3.94)
        flight = max(0, min(1, (seconds-3.30)/.42))
        jump_height = .082
        jump = jump_height*4*flight*(1-flight)
        height = -.005-.006*envelope-.003*nod-.007*crouch-.004*landing+jump
        roll = -.044*weight-.020*math.sin(math.pi*(seconds-2))*pulse(2, 2.5, 3)
        body = (Matrix.Translation((.019*weight+side_step, 0, height))
                @ Matrix.Translation((0, 0, .19)) @ Matrix.Rotation(roll, 4, 'Y')
                @ Matrix.Translation((0, 0, -.19)))
        rig.pose.bones['MotionRoot'].matrix = body @ rest['MotionRoot']
        bpy.context.view_layer.update()
        world_rotate('Spine2', (0, 0, 1), .025*weight)
        world_rotate('Head', (0, 1, 0), -.048*sway(seconds-.055))
        world_rotate('Head', (1, 0, 0), .106*nod+.037*crouch-.062*(jump/jump_height)+.030*landing)
        # Secondary motion follows the beat instead of moving every part in sync.
        tail = .19*math.sin(2*math.pi*(seconds-.07))*envelope
        world_rotate('Tail1', (0, 0, 1), tail-.25*side_step)
        world_rotate('Tail2', (0, 0, 1), .115*math.sin(2*math.pi*(seconds-.14))*envelope)
        world_rotate('Tail1', (1, 0, 0), .07*crouch-.05*(jump/jump_height))
        world_rotate('Feeler1', (0, 1, 0), .040*sway(seconds-.075))
        world_rotate('Feeler1', (1, 0, 0), -.035*math.sin(2*math.pi*(seconds-.09))*envelope)
        world_rotate('Feeler2', (1, 0, 0), -.022*math.sin(2*math.pi*(seconds-.14))*envelope)
        for _, _, foot, _ in feet:
            target = targets[foot]
            if foot == 'RHand': target.z += .015*pulse(.03, .24, .48)
            if foot == 'LHand': target.z += .015*pulse(.53, .74, .98)
            first_pair = foot in {'LHand', 'RFoot'}
            start = 2.04 if first_pair else 2.28
            back = 2.52 if first_pair else 2.76
            target.x += step_width*(smooth(start, start+.20, seconds)-smooth(back, back+.20, seconds))
            lift = pulse(start, start+.10, start+.20)+pulse(back, back+.10, back+.20)
            target.z += .015*lift+jump
            # Flat paws, with no extra toe rotation or tucked ankle on the hop.
    elif kind == 'DanceB':
        # Six beats at 120 BPM: two gentle wiggles, a curious head-tilt
        # hold, then another pair. The front paws never leave their marks.
        seconds=t*3
        def pulse(start, peak, end, time=seconds):
            return smooth(start,peak,time)*(1-smooth(peak,end,time))
        def wiggle(time):
            return (pulse(.10,.38,.72,time)-pulse(.60,.88,1.18,time)
                    +.85*pulse(1.58,1.86,2.18,time)-.85*pulse(2.06,2.36,2.70,time))
        envelope=smooth(0,.15,seconds)*(1-smooth(2.78,3,seconds))
        sway=wiggle(seconds)
        peek=smooth(1.08,1.24,seconds)*(1-smooth(1.55,1.76,seconds))
        body=(Matrix.Translation((.004*sway,0,-.005-.008*envelope-.0015*abs(sway)))
              @ Matrix.Translation((0,0,.19)) @ Matrix.Rotation(-.017*sway,4,'Y')
              @ Matrix.Translation((0,0,-.19)))
        rig.pose.bones['MotionRoot'].matrix=body @ rest['MotionRoot']
        bpy.context.view_layer.update()
        hips=rig.pose.bones['Hips']
        hips.matrix=Matrix.Translation((.018*sway,0,0)) @ hips.matrix
        bpy.context.view_layer.update()
        world_rotate('Hips',(0,0,1),.078*sway)
        world_rotate('Spine2',(0,0,1),-.010*sway)
        world_rotate('Head',(0,1,0),-.033*wiggle(seconds-.06)+.150*peek)
        world_rotate('Head',(0,0,1),-.045*peek)
        world_rotate('Head',(1,0,0),-.025*peek)
        world_rotate('Tail1',(0,0,1),.30*wiggle(seconds-.075))
        world_rotate('Tail2',(0,0,1),.175*wiggle(seconds-.16))
        world_rotate('Tail1',(1,0,0),.045*envelope+.025*abs(wiggle(seconds-.09)))
        world_rotate('Tail2',(1,0,0),.025*wiggle(seconds-.13))
        world_rotate('Feeler1',(0,1,0),.018*wiggle(seconds-.10))
        world_rotate('Feeler1',(1,0,0),-.018*peek)
        world_rotate('Feeler2',(0,1,0),.012*wiggle(seconds-.16))
        targets['RFoot'].z+=.010*(pulse(.25,.40,.55)+pulse(1.65,1.80,1.95))
        targets['LFoot'].z+=.010*(pulse(.72,.85,.98)+pulse(2.16,2.31,2.46))
    elif kind == 'DanceC':
        seconds=t*CELEBRATION['duration']
        def pulse(start,peak,end,time=seconds):
            return smooth(start,peak,time)*(1-smooth(peak,end,time))
        tap_right=pulse(.08,.21,.33);tap_left=pulse(.34,.48,.62)
        tap=tap_right+tap_left;lean=tap_right-tap_left
        envelope=smooth(0,.15,seconds)*(1-smooth(4.60,5,seconds))
        turning=smooth(.55,.78,seconds)*(1-smooth(2.80,3.16,seconds))
        wobble=pulse(2.95,3.06,3.18)-.55*pulse(3.10,3.22,3.35)
        crouch=pulse(3.35,3.46,3.52);land=pulse(3.90,3.97,4.10)
        flight=max(0,min(1,(seconds-3.52)/.38))
        hop_height=.072;hop=hop_height*4*flight*(1-flight)
        happy=smooth(3.58,3.94,seconds)*(1-smooth(4.60,5,seconds))
        pose_yaw=celebration_angle(seconds)
        stride_phase=pose_yaw*6
        height=-.005-.006*envelope-.017*turning-.009*crouch-.006*land+hop+.002*math.sin(stride_phase)*turning
        rig.pose.bones['MotionRoot'].matrix=(Matrix.Translation((.008*lean+.004*wobble,0,height))
                                            @ Matrix.Rotation(pose_yaw,4,'Z') @ rest['MotionRoot'])
        bpy.context.view_layer.update()
        world_rotate('MotionRoot',(0,1,0),-.026*lean+.053*wobble)
        right=(math.cos(pose_yaw),math.sin(pose_yaw),0)
        side=(-math.sin(pose_yaw),math.cos(pose_yaw),0)
        world_rotate('Head',(0,0,1),.025*turning)
        world_rotate('Head',right,.033*tap-.120*happy-.026*(hop/hop_height))
        world_rotate('Head',side,-.032*wobble+.028*happy)
        wag=.09*math.sin(stride_phase-.4)*turning+.165*math.sin((seconds-3.94)*11)*happy
        world_rotate('Tail1',(0,0,1),wag)
        world_rotate('Tail2',(0,0,1),.55*wag)
        world_rotate('Tail1',right,.035*turning+.060*happy)
        world_rotate('Feeler1',right,.025*math.sin(stride_phase-.7)*turning-.030*happy+.025*land)
        world_rotate('Feeler2',right,.015*math.sin(stride_phase-1.0)*turning-.018*happy)
        for foot in targets:
            angle,lift=celebration_foot(foot,seconds)
            targets[foot]=Matrix.Rotation(angle,3,'Z') @ base_feet[foot]
            targets[foot].z+=lift+hop
            foot_yaw[foot]=angle
        targets['RHand'].z+=.016*tap_right;targets['LHand'].z+=.016*tap_left
        rig['EyeSmile']=float(CELEBRATION['happy_start']<=seconds<CELEBRATION['happy_end'])
    elif kind == 'PetReaction':
        envelope = math.sin(math.pi*t)**2
        rig.pose.bones['MotionRoot'].matrix = Matrix.Translation((0, 0, -.005-.014*envelope)) @ rest['MotionRoot']
        bpy.context.view_layer.update()
        world_rotate('Head', (1, 0, 0), -.12*envelope)
        world_rotate('Head', (0, 1, 0), .10*math.sin(tau)*envelope)
        world_rotate('Tail1', (0, 0, 1), .24*math.sin(4*tau)*envelope)
        world_rotate('Tail2', (0, 0, 1), .12*math.sin(4*tau-.3)*envelope)
        world_rotate('Feeler1', (1, 0, 0), .04*math.sin(2*tau)*envelope)
        if GAME: jaw = closed_jaw + .18*envelope
    elif kind == 'Eat':
        seconds=t*2.6
        def pulse(start,peak,end):
            return smooth(start,peak,seconds)*(1-smooth(peak,end,seconds))
        reach=smooth(.12,.48,seconds)*(1-smooth(1.65,2.1,seconds))
        bite=pulse(.34,.55,.72)
        chew=pulse(.80,.90,1.03)+.82*pulse(1.05,1.16,1.32)+.55*pulse(1.34,1.48,1.66)
        swallow=pulse(1.67,1.83,2.02)
        happy=smooth(1.95,2.12,seconds)*(1-smooth(2.3,2.6,seconds))
        rig.pose.bones['MotionRoot'].matrix = Matrix.Translation((0,0,-.005-.018*reach-.004*swallow+.002*happy)) @ rest['MotionRoot']
        bpy.context.view_layer.update()
        world_rotate('Neck',(1,0,0),.035*reach+.025*swallow)
        world_rotate('Head',(1,0,0),.11*reach+.016*chew+.045*swallow-.095*happy)
        world_rotate('Head',(0,1,0),.045*happy)
        world_rotate('Tail1',(0,0,1),.19*math.sin((seconds-1.95)*16)*happy)
        world_rotate('Tail2',(0,0,1),.11*math.sin((seconds-1.95)*16-.45)*happy)
        world_rotate('Feeler1',(1,0,0),.016*chew-.035*happy)
        world_rotate('Feeler2',(1,0,0),.012*chew-.02*happy)
        jaw = closed_jaw+.31*bite+.115*chew
    elif kind == 'WaterCharge':
        rig.pose.bones['MotionRoot'].matrix = Matrix.Translation((0,0,-.018+.0015*(1-math.cos(tau)))) @ rest['MotionRoot']
        bpy.context.view_layer.update()
        world_rotate('Head',(1,0,0),.025+.008*math.sin(tau))
        world_rotate('Tail1',(1,0,0),.11)
        world_rotate('Feeler1',(1,0,0),.05+.012*math.sin(tau))
        jaw = closed_jaw-.01
    elif kind == 'WaterShoot':
        # 0-.23 closed preparation, .23-.33 opening, .33-.66 emission,
        # .68-.90 closing. The one-second clip returns to the closed Idle pose.
        gather = smooth(0,.18,t) * (1-smooth(.64,.95,t))
        opening = smooth(.23,.33,t) * (1-smooth(.68,.90,t))
        recoil = math.exp(-((t-.37)/.075)**2)
        rig.pose.bones['MotionRoot'].matrix = Matrix.Translation((0,0,-.005-.013*gather-.006*recoil)) @ rest['MotionRoot']
        bpy.context.view_layer.update()
        world_rotate('Head',(1,0,0),.025*gather-.065*recoil)
        world_rotate('Tail1',(1,0,0),.11*gather-.045*recoil)
        world_rotate('Feeler1',(1,0,0),.05*gather+.035*recoil)
        jaw = closed_jaw-.01*gather + .34*opening
    jaw_axis=(1,0,0)
    if GAME and kind in {'Eat', 'DanceA', 'DanceB', 'DanceC', 'Walk', 'Run'}:
        # Closing must follow the head's right axis when it tilts in delight.
        jaw_axis=(rig.pose.bones['Head'].matrix.to_quaternion() @ rest['Head'].to_quaternion().inverted()) @ Vector((1,0,0))
    world_rotate('Jaw', jaw_axis, jaw)
    for upper, lower, foot, _ in feet:
        solve_limb(upper, lower, foot, targets[foot])
        if foot in foot_yaw:world_rotate(foot,(0,0,1),foot_yaw[foot])
        if foot in toe_pitch:world_rotate(foot,(1,0,0),toe_pitch[foot])

clips = [('Idle', 90, True), ('Walk', 24, True), ('PetReaction', 48, False)]
if GAME:
    clips = [(name,round(duration*FPS),loop) for name,duration,loop in [('Idle',3,True),('Walk',GAITS['Walk']['duration'],True),('Run',GAITS['Run']['duration'],True),('PetReaction',1.6,False),('Eat',2.6,False),('WaterCharge',1,True),('WaterShoot',1,False),('Swim',.72,True),('SwimIdle',2.4,True),('DanceA',4,True),('DanceB',3,True),('DanceC',CELEBRATION['duration'],False)]]
validation = {'fps': FPS, 'original_bones': 24, 'export_bones': 25, 'clips': [], 'walk_stance_travel_m': GAITS['Walk']['stride'] if GAME else .13, 'walk_stance_fraction': GAITS['Walk']['stance'] if GAME else .62, 'walk_speed_mps': GAITS['Walk']['stride']/(GAITS['Walk']['duration']*GAITS['Walk']['stance']) if GAME else .13/(.8*.62)}
for name, intervals, loop in clips:
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = action
    previous_quaternions={}
    for step in range(intervals+1):
        scene.frame_set(step+1)
        pose(name, step/intervals)
        for pb in rig.pose.bones:
            q=pb.rotation_quaternion.copy()
            if pb.name in previous_quaternions and q.dot(previous_quaternions[pb.name])<0:
                q.negate();pb.rotation_quaternion=q
            previous_quaternions[pb.name]=q.copy()
            pb.keyframe_insert('location', frame=step+1, group=pb.name)
            pb.keyframe_insert('rotation_quaternion', frame=step+1, group=pb.name)
        rig.keyframe_insert(data_path='["EyeSmile"]',frame=step+1,group='Expressions')
    action.use_frame_range = True
    action.frame_start, action.frame_end = 1, intervals+1
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:
                        key.interpolation = 'CONSTANT' if curve.data_path=='["EyeSmile"]' else 'LINEAR'
    scene.frame_set(1)
    dg = bpy.context.evaluated_depsgraph_get()
    first = [v.co.copy() for v in mesh.evaluated_get(dg).data.vertices]
    scene.frame_set(intervals+1)
    last = [v.co.copy() for v in mesh.evaluated_get(dg).data.vertices]
    seam = max((a-b).length for a, b in zip(first,last))
    validation['clips'].append({'name': name, 'duration_s': intervals/FPS, 'frames': intervals+1, 'loop': loop, 'end_vertex_delta': seam})
    if GAME and name in {*GAITS,'DanceA','DanceB','DanceC'}:
        lowest=[]
        for frame in range(1,intervals+2):
            scene.frame_set(frame)
            lowest.append(min(v.co.z for v in mesh.evaluated_get(dg).data.vertices))
        validation['clips'][-1].update({'minimum_vertex_z':min(lowest),'maximum_lowest_vertex_z':max(lowest),'airborne_frames':sum(z>.007 for z in lowest)})
        if min(lowest)<-.006:
            raise RuntimeError(f'{name} mesh penetrates the ground: {min(lowest):.6f} m')
validation['maximum_unreachable_foot_error_m'] = max(reach_errors)
if GAME and max(reach_errors)>.0005:
    print('REACH_DETAILS',json.dumps(sorted(reach_details,key=lambda d:d['error'],reverse=True)[:8]))
    raise RuntimeError(f'Gait exceeds limb reach: {max(reach_errors):.6f} m')

if GAME:
    # A bone-parented Empty exports as an ordinary node, not a skin joint.
    rig.animation_data.action = None
    for pb in rig.pose.bones: pb.matrix_basis.identity()
    bpy.context.view_layer.update()
    socket = bpy.data.objects.new('Socket_Mouth',None)
    scene.collection.objects.link(socket)
    socket.empty_display_type = 'ARROWS'
    socket.empty_display_size = .08
    socket.parent = rig
    socket.parent_type = 'BONE'
    socket.parent_bone = 'Head'
    world = Matrix.Translation((0,-.406,.350)) @ Matrix.Rotation(math.pi/2,4,'X')
    socket.matrix_basis = Matrix.Translation((0,-rig.data.bones['Head'].length,0)) @ rest['Head'].inverted() @ world
    socket['purpose'] = 'Water emitter; local +Z points out of mouth'
    socket.select_set(True)

# Export only the skinned character. All images are embedded in the binary GLB.
for material in mesh.data.materials:
    shader = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    shader.inputs['Roughness'].default_value = .7 if 'Body' in material.name else .28
rig.animation_data.action = bpy.data.actions['Idle']
scene.frame_set(1)
rig.select_set(True)
mesh.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=str(ASSET_OUT / 'mudkip.glb'), export_format='GLB',
    use_selection=True, export_animations=True, export_animation_mode='ACTIONS',
    export_anim_slide_to_zero=True,
    export_frame_range=False, export_force_sampling=True, export_skins=True,
    export_yup=True, export_cameras=False, export_lights=False,
    export_optimize_animation_size=True,
    export_extras=GAME,
)
if GAME:
    # Normalize the exported bone-parented emitter node against glTF's rest
    # coordinate frame. Bone-parented empties carry a different axis basis
    # than ordinary glTF objects; consumers can then use local +Z directly.
    glb_path=ASSET_OUT/'mudkip.glb'
    binary=glb_path.read_bytes()
    json_length=struct.unpack_from('<I',binary,12)[0]
    document=json.loads(binary[20:20+json_length])
    nodes=document['nodes']
    parents={child:i for i,node in enumerate(nodes) for child in node.get('children',[])}
    socket_index=next(i for i,node in enumerate(nodes) if node.get('name')=='Socket_Mouth')
    def world_rotation(index):
        node=nodes[index]
        xyzw=node.get('rotation',[0,0,0,1])
        q=Quaternion((xyzw[3],*xyzw[:3]))
        return world_rotation(parents[index]) @ q if index in parents else q
    rotation=world_rotation(parents[socket_index]).inverted()
    nodes[socket_index]['rotation']=[rotation.x,rotation.y,rotation.z,rotation.w]
    encoded=json.dumps(document,separators=(',',':')).encode('utf-8')
    encoded+=b' '*((-len(encoded))%4)
    tail=binary[20+json_length:]
    glb_path.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(encoded)+len(tail))+struct.pack('<I4s',len(encoded),b'JSON')+encoded+tail)
    events = {'Walk':[{'time':time,'event':'step','foot':foot} for time,foot in [(0,'LHand'),(.125,'LFoot'),(.25,'RHand'),(.375,'RFoot')]], 'Run':[{'time':0,'event':'step','feet':['LHand','RFoot']},{'time':.2,'event':'step','feet':['RHand','LFoot']}], 'Eat':[{'time':.36,'event':'food_attach'},{'time':.70,'event':'food_consume'},{'time':.90,'event':'chew'},{'time':1.16,'event':'chew'},{'time':1.48,'event':'chew'},{'time':1.72,'event':'swallow'},{'time':2.02,'event':'satisfied'}], 'WaterShoot':[{'time':.33,'event':'water_start'},{'time':.66,'event':'water_stop'}]}
    events['Walk']=[{'time':i*GAITS['Walk']['duration']/4,'event':'step','foot':foot} for i,foot in enumerate(['LHand','LFoot','RHand','RFoot'])]
    events['Run']=[{'time':i*GAITS['Run']['duration']/2,'event':'step','feet':pair} for i,pair in enumerate([['LHand','RFoot'],['RHand','LFoot']])]
    meta = {'schemaVersion':1,'samplingFPS':FPS,'units':'meters','up':'+Y','forward':'+Z','socket':{'mouth':'Socket_Mouth','forwardAxis':'+Z'},'defaultTransition':.22,'locomotionTransition':.12,'clips':[{'name':name,'duration':n/FPS,'loop':loop,'next':None if loop else 'Idle','events':events.get(name,[])} for name,n,loop in clips],'locomotion':{name:{'speed':g['stride']/(g['duration']*g['stance']),'stanceFraction':g['stance'],'stanceTravel':g['stride'],'acceleration':10 if name=='Run' else 5,'deceleration':9 if name=='Run' else 5} for name,g in GAITS.items()}}
    dance = next(clip for clip in meta['clips'] if clip['name']=='DanceA')
    dance.update({'label':'摇摇踏踏舞', 'bpm':120, 'beats':8,
                  'events':[{'time':3.30,'event':'jump_start'},{'time':3.72,'event':'land'}]})
    tail_dance=next(clip for clip in meta['clips'] if clip['name']=='DanceB')
    tail_dance.update({'label':'扭扭尾巴舞','bpm':120,'beats':6,
                       'events':[{'time':1.24,'event':'curious_hold'},{'time':1.58,'event':'dance_resume'}]})
    celebration=next(clip for clip in meta['clips'] if clip['name']=='DanceC')
    celebration.update({'label':'转圈庆祝舞','events':[{'time':.33,'event':'step','foot':'RHand'},{'time':.62,'event':'step','foot':'LHand'}
      ]+[{'time':CELEBRATION['spin_start']+(i+1)*(CELEBRATION['spin_end']-CELEBRATION['spin_start'])/CELEBRATION['steps'],'event':'step','foot':CELEBRATION_FEET[i%4]} for i in range(CELEBRATION['steps'])
      ]+[{'time':CELEBRATION['spin_end']+(i+1)*CELEBRATION['settle_step'],'event':'step','foot':foot} for i,foot in enumerate(CELEBRATION_FEET)
      ]+[{'time':3.52,'event':'jump_start'},{'time':3.90,'event':'land'}]})
    meta['expressions']={'material':'Mudkip Eyes','states':{'open':{'uvOffset':[0,0]},'happy':{'uvOffset':[.5,.25]}},
                         'tracks':{'DanceC':[{'start':CELEBRATION['happy_start'],'end':CELEBRATION['happy_end'],'state':'happy'}]}}
    (ASSET_OUT/'animations.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')

# A neutral preview stage stays out of the exported character asset.
for obj in list(bpy.data.objects):
    if obj.type in {'CAMERA', 'LIGHT'}:
        obj.hide_set(False)
        obj.hide_render = False
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.resolution_x = 720
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False
scene.view_settings.view_transform = 'AgX'
background = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
background.inputs[0].default_value = (.65, .76, .79, 1)
background.inputs[1].default_value = .5
cam = scene.camera
cam.data.type = 'PERSP'
cam.data.lens = 55
cam.location = (1.35, -2.7, 1.55)
cam.rotation_euler = (Vector((0, 0, .47))-cam.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.mesh.primitive_plane_add(size=200, location=(0,0,-.005))
ground = bpy.context.object
ground.name = 'Preview Ground — not exported'
mat = bpy.data.materials.new('Preview Sage')
mat.diffuse_color = (.46,.62,.53,1)
ground.data.materials.append(mat)
for material in mesh.data.materials:
    shader = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    shader.inputs['Roughness'].default_value = .7 if 'Body' in material.name else .28

scene.frame_end = FPS*3+1
rig.animation_data.action = bpy.data.actions['Idle']
scene.frame_set(1)
bpy.ops.object.select_all(action='DESELECT')
mesh.select_set(True)
bpy.context.view_layer.objects.active = mesh
rig.hide_set(True)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_perspective = 'CAMERA'
            area.spaces.active.camera = cam
            area.spaces.active.overlay.show_extras = False
            area.spaces.active.shading.type = 'MATERIAL'
bpy.ops.file.pack_all()
if GAME:
    sys.path.insert(0,str(ROOT/'scripts'))
    from toon_character import apply_character_toon
    apply_character_toon(scene,mesh)
    # Use the existing smiling-eye atlas cell in the editable Blender file.
    # Three.js samples the equivalent expression timeline from animations.json.
    eye_material=next(material for material in mesh.data.materials if 'eye' in material.name.lower())
    texture=next(node for node in eye_material.node_tree.nodes if node.type=='TEX_IMAGE')
    coordinates=eye_material.node_tree.nodes.new('ShaderNodeTexCoord')
    mapping=eye_material.node_tree.nodes.new('ShaderNodeMapping');mapping.name='Eye Expression Atlas'
    eye_material.node_tree.links.new(coordinates.outputs['UV'],mapping.inputs['Vector'])
    eye_material.node_tree.links.new(mapping.outputs['Vector'],texture.inputs['Vector'])
    for axis,factor in [(0,.5),(1,-.25)]:
        driver=mapping.inputs['Location'].driver_add('default_value',axis).driver
        variable=driver.variables.new();variable.name='smile';variable.type='SINGLE_PROP'
        variable.targets[0].id=rig;variable.targets[0].data_path='["EyeSmile"]'
        driver.expression=f'{factor} * smile'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'game-assets/source/mudkip-animations.blend' if GAME else ROOT / 'mudkip-animation-test.blend'))
(ROOT / ('docs/game-animation-validation.json' if GAME else 'docs/animation-build-validation.json')).write_text(json.dumps(validation, indent=2), encoding='utf-8')
previews = [(name,round(seconds*FPS)+1,label) for name,seconds,label in [('Run',1/6,'game-run'),('Eat',.8667,'game-eat'),('WaterCharge',.4667,'game-charge'),('WaterShoot',.4,'game-shoot')]] if GAME else [('Idle',1,'idle'),('Walk',8,'walk'),('PetReaction',24,'pet')]
for name, frame, label in ([] if '--skip-renders' in sys.argv else previews):
    rig.animation_data.action = bpy.data.actions[name]
    scene.frame_set(frame)
    scene.render.filepath = str(ROOT / f'renders/animation-{label}.png')
    bpy.ops.render.render(write_still=True)
print('ANIMATION_VALIDATION', json.dumps(validation))
