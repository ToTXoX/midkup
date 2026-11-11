import { Box3, MathUtils, Vector3 } from 'three';

const down = .52;
const rise = .76;
// Time, tilt, travel, lift, roll toward the bracing side, flail, tuck, brace, push, nod.
const fallPoses = [
  [0,     0,    0,    0,     0,    0,   0,   0,   0,    0],
  [.07,   .12,  .10,  .008,  0,   .75, .14, 0,   0,   -.11],
  [.16,   .43,  .40,  .038, .02, 1,   .54, .02, 0,   -.17],
  [.28,  1.26,  .84,  .015, .04, .62, .68, .09, 0,    .04],
  [.34,  1.58,  .97,  0,    .04, .25, .56, .13, 0,    .19],
  [.40,  1.49, 1,     .012, .04, .13, .38, .17, 0,    .09],
  [down, 1.55, 1,     0,    .05, .04, .25, .18, 0,    .055],
  [.66,  1.55, 1,     0,    .07, .03, .28, .24, 0,    .065],
];
const poses = [
  ...fallPoses,
  [rise, 1.48, 1,     0,    .19, .03, .48, .55, .03,  .13],
  [.94,  1.19, 1,     0,    .52, .02, .83, 1,   .18,  .23],
  [1.10,  .80, 1,     0,    .67, .02, .85, .99, .64,  .24],
  [1.26,  .42, 1,     0,    .64, .02, .57, .74, 1,    .12],
  [1.45,  .10, 1,     0,    .49, 0,   .22, .25, .43, -.06],
  [1.58, -.03, 1,     0,    .28, 0,   .04, .04, .08, -.04],
  [1.72,  0,   1,     0,    0,   0,   0,   0,   0,    0],
];
const quadrupedPoses = [
  ...fallPoses,
  [rise, 1.50, 1, 0,    .13, .02, .50, .34, 0,   .10],
  [.89,  1.18, 1, 0,    .26, .01, .78, .61, 0,   .13],
  [1.00,  .70, 1, 0,    .55, 0,   .93, .92, .06, .10],
  [1.10,  .30, 1, 0,    .80, 0,   .94, 1,   .18, .05],
  [1.20,  .16, 1, 0,    .96, 0,   .91, .96, .34, .08],
  [1.32,  .15, 1, 0,   1,    0,   .76, .76, .68, .10],
  [1.45,  .10, 1, 0,   1,    0,   .47, .47, .93, .04],
  [1.55,  .03, 1, 0,   1,    0,   .25, .31, 1,  -.08],
  [1.68, -.02, 1, 0,    .93, 0,   .07, .11, .45,-.10],
  [1.80,   0,  1, 0,    .84, 0,   .01, .02, .07,-.025],
  [1.90,   0,  1, 0,    .84, 0,   0,   0,   0,   0],
];

// Continuous velocities between poses, with zero velocity at a reversal or a held value.
function poseSlopes(track) {
  return track.map((pose, index) => pose.slice(1).map((value, channel) => {
    if (index === 0 || index === track.length - 1) return 0;
    const previous = track[index - 1];
    const next = track[index + 1];
    const before = (value - previous[channel + 1]) / (pose[0] - previous[0]);
    const after = (next[channel + 1] - value) / (next[0] - pose[0]);
    return before * after > 0 ? 2 * before * after / (before + after) : 0;
  }));
}
const slopes = poseSlopes(poses);
const quadrupedSlopes = poseSlopes(quadrupedPoses);

export function measureKnockdownBody(model) {
  const bounds = new Box3().setFromObject(model, true);
  const center = bounds.getCenter(new Vector3());
  const size = bounds.getSize(new Vector3());
  const points = [];
  let standingRadius = Math.max(size.x, size.z) / 2;
  let centeredRadius = 0;
  let tumbleRadius = standingRadius;
  const vertex = new Vector3();
  model.traverse(mesh => {
    const positions = mesh.geometry?.getAttribute('position');
    if (!mesh.isMesh || !positions) return;
    const stride = Math.max(1, Math.floor(positions.count / 180));
    for (let i = 0; i < positions.count; i += stride) {
      mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld);
      standingRadius = Math.max(standingRadius, Math.hypot(vertex.x, vertex.z));
      vertex.sub(center);
      centeredRadius = Math.max(centeredRadius, Math.hypot(vertex.x, vertex.z));
      tumbleRadius = Math.max(tumbleRadius, vertex.length());
      points.push(vertex.x, vertex.y, vertex.z);
    }
  });
  if (!points.length) throw new Error('访客模型缺少可用网格');
  const centerOffset = Math.hypot(center.x, center.z);
  standingRadius = Math.max(standingRadius + .055, centeredRadius + centerOffset + .025);
  return {
    bounds, center, size, points: new Float32Array(points),
    standingRadius,
    tumbleRadius: Math.max(standingRadius, tumbleRadius + centerOffset + .055),
  };
}

export function createKnockdownMotion(body, direction, offset, rig, compact = false) {
  const { center, size } = body;
  const quadruped = Boolean(rig?.groundRecovery);
  const track = quadruped ? quadrupedPoses : poses;
  const tangents = quadruped ? quadrupedSlopes : slopes;
  const duration = track.at(-1)[0];
  const heading = Math.atan2(direction.x, direction.z);
  const supportSide = direction.x < -.05 ? -1 : 1;
  const towardSupport = MathUtils.euclideanModulo(supportSide * .30 - heading + Math.PI, 2 * Math.PI) - Math.PI;
  const axis = new Vector3();
  const rotatedCenter = new Vector3();
  const sample = new Float32Array(poses[0].length - 1);
  const palm = new Vector3();
  const plantedPalm = new Vector3();
  let hasPlant = false;
  let age = 0;

  function update(pivot, delta) {
    age = Math.min(duration, age + delta);
    if (age === duration) return false;
    const next = track.findIndex(pose => pose[0] > age);
    const a = track[next - 1];
    const b = track[next];
    const step = b[0] - a[0];
    const t = (age - a[0]) / step;
    const ease = t * t * (3 - 2 * t);
    for (let i = 0; i < sample.length; i++) {
      const blend = t * (1 - t) * step * ((1 - t) * tangents[next - 1][i] - t * tangents[next][i]);
      sample[i] = MathUtils.lerp(a[i + 1], b[i + 1], ease) + blend;
    }
    const [tilt, travel, lift, roll, flail, tuck, brace, push, nod] = sample;
    const angle = compact ? tilt * .38 : tilt;
    const tiltHeading = heading + towardSupport * roll;
    const alongX = Math.sin(tiltHeading);
    const alongZ = Math.cos(tiltHeading);
    axis.set(alongZ, 0, -alongX);
    const points = rig?.pose({ age, axis, supportSide, flail: compact ? flail * .55 : flail, tuck, brace, push, nod, quadruped }) ?? body.points;
    const sine = Math.sin(angle);
    const cosine = Math.cos(angle);
    pivot.quaternion.setFromAxisAngle(axis, angle);
    const weightShift = quadruped ? center.y * .84 * sine * MathUtils.smoothstep(age, .79, 1.07) : 0;
    function place(support) {
      let low = Infinity;
      // Rest the lowest point of the posed silhouette on the ground.
      for (let i = 0; i < support.length; i += 3) {
        const along = support[i] * alongX + support[i + 2] * alongZ;
        low = Math.min(low, support[i + 1] * cosine - along * sine);
      }
      rotatedCenter.copy(center).applyQuaternion(pivot.quaternion);
      const clearance = size.y * .003 * Math.abs(sine);
      pivot.position.set(center.x + offset.x * travel + alongX * weightShift,
        body.bounds.min.y + offset.y * travel + lift * size.y + clearance - low,
        center.z + offset.z * travel + alongZ * weightShift).sub(rotatedCenter);
    }
    place(points);
    if (quadruped && age >= 1.01) {
      const load = MathUtils.smoothstep(age, 1.02, 1.22) * (1 - MathUtils.smoothstep(age, 1.38, 1.64));
      pivot.position.y -= size.y * .063 * load;
      rig.groundRecovery(age, supportSide, offset, place);
    } else if (!quadruped && !compact && age >= .75 && age < 1.18 && rig?.palmPosition(supportSide, palm)) {
      if (age < .86 || !hasPlant) {
        plantedPalm.copy(palm);
        hasPlant = true;
      } else {
        const hold = MathUtils.smoothstep(age, .86, .93) * (1 - MathUtils.smoothstep(age, 1.02, 1.18));
        palm.x = MathUtils.lerp(palm.x, plantedPalm.x, hold);
        palm.z = MathUtils.lerp(palm.z, plantedPalm.z, hold);
        const braced = rig.bracePalm(supportSide, palm);
        if (braced) place(braced);
      }
    }
    return true;
  }

  return {
    update,
    get phase() { return age < down ? 'falling' : age < rise ? 'down' : 'getting-up'; },
  };
}
