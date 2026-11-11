import { Box3, MathUtils, Vector3 } from 'three';

const down = .52;
const rise = .76;
// Time, tilt, travel, squash, lift, roll toward the bracing side, flail, tuck, brace, push, nod.
const poses = [
  [0,     0,     0,   1,    0,     0,    0,   0,   0,   0,    0],
  [.07,   .12,  .10,  .97,  .008,  0,   .75, .14, 0,   0,   -.11],
  [.16,   .43,  .40,  1,    .038, .02, 1,   .54, .02, 0,   -.17],
  [.28,  1.26,  .84,  1,    .015, .04, .62, .68, .09, 0,    .04],
  [.34,  1.58,  .97,  .95,  0,    .04, .25, .56, .13, 0,    .19],
  [.40,  1.49, 1,     .99,  .012, .04, .13, .38, .17, 0,    .09],
  [down, 1.55, 1,    1,     0,    .05, .04, .25, .18, 0,    .055],
  [.66,  1.55, 1,    1,     0,    .07, .03, .28, .24, 0,    .065],
  [rise, 1.48, 1,     .97,  0,    .19, .03, .48, .55, .03,  .13],
  [.94,  1.19, 1,     .91,  0,    .52, .02, .83, 1,   .18,  .23],
  [1.10,  .80, 1,     .88,  0,    .67, .02, .85, .99, .64,  .24],
  [1.26,  .42, 1,     .91,  0,    .64, .02, .57, .74, 1,    .12],
  [1.45,  .10, 1,     .98,  0,    .49, 0,   .22, .25, .43, -.06],
  [1.58, -.03, 1,    1.02,  0,    .28, 0,   .04, .04, .08, -.04],
  [1.72,  0,   1,    1,     0,    0,   0,   0,   0,   0,    0],
];
const duration = poses.at(-1)[0];

// Continuous velocities between poses, with zero velocity at a reversal or a held value.
const slopes = poses.map((pose, index) => pose.slice(1).map((value, channel) => {
  if (index === 0 || index === poses.length - 1) return 0;
  const previous = poses[index - 1];
  const next = poses[index + 1];
  const before = (value - previous[channel + 1]) / (pose[0] - previous[0]);
  const after = (next[channel + 1] - value) / (next[0] - pose[0]);
  return before * after > 0 ? 2 * before * after / (before + after) : 0;
}));

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

export function createKnockdownMotion(body, direction, offset, footprint, rig) {
  const { center, size } = body;
  const heading = Math.atan2(direction.x, direction.z);
  const supportSide = direction.x < -.05 ? -1 : 1;
  const towardSupport = MathUtils.euclideanModulo(supportSide * .30 - heading + Math.PI, 2 * Math.PI) - Math.PI;
  const axis = new Vector3();
  const centerOffset = Math.hypot(center.x, center.z);
  const distance = Math.hypot(offset.x, offset.z);
  const rotatedCenter = new Vector3();
  const sample = new Float32Array(poses[0].length - 1);
  const palm = new Vector3();
  const plantedPalm = new Vector3();
  let hasPlant = false;
  let age = 0;

  function update(pivot, delta) {
    age = Math.min(duration, age + delta);
    if (age === duration) return false;
    const next = poses.findIndex(pose => pose[0] > age);
    const a = poses[next - 1];
    const b = poses[next];
    const step = b[0] - a[0];
    const t = (age - a[0]) / step;
    const ease = t * t * (3 - 2 * t);
    for (let i = 0; i < sample.length; i++) {
      const blend = t * (1 - t) * step * ((1 - t) * slopes[next - 1][i] - t * slopes[next][i]);
      sample[i] = MathUtils.lerp(a[i + 1], b[i + 1], ease) + blend;
    }
    const [angle, travel, squash, lift, roll, flail, tuck, brace, push, nod] = sample;
    const tiltHeading = heading + towardSupport * roll;
    const alongX = Math.sin(tiltHeading);
    const alongZ = Math.cos(tiltHeading);
    axis.set(alongZ, 0, -alongX);
    const points = rig?.pose({ age, axis, supportSide, flail, tuck, brace, push, nod }) ?? body.points;
    const width = 1 / Math.sqrt(squash);
    const sine = Math.sin(angle);
    const cosine = Math.cos(angle);
    const available = footprint - centerOffset - distance * (1 - travel) - .015;
    pivot.quaternion.setFromAxisAngle(axis, angle);
    function place(support) {
      let low = Infinity;
      let reach = 0;
      // Use the posed silhouette for floor contact and the visitor's reserved footprint.
      for (let i = 0; i < support.length; i += 3) {
        const along = (support[i] * alongX + support[i + 2] * alongZ) * width;
        const across = (support[i] * alongZ - support[i + 2] * alongX) * width;
        const height = support[i + 1] * squash;
        const forward = along * cosine + height * sine;
        low = Math.min(low, height * cosine - along * sine);
        reach = Math.max(reach, forward ** 2 + across ** 2);
      }
      const scale = Math.min(1, Math.max(.01, available) / Math.sqrt(reach));
      pivot.scale.set(width * scale, squash * scale, width * scale);
      rotatedCenter.copy(center).multiply(pivot.scale).applyQuaternion(pivot.quaternion);
      const clearance = size.y * .003 * Math.abs(sine);
      pivot.position.set(center.x + offset.x * travel, body.bounds.min.y + offset.y * travel + lift * size.y + clearance - low * scale,
        center.z + offset.z * travel).sub(rotatedCenter);
    }
    place(points);
    if (age >= .75 && age < 1.18 && rig?.palmPosition(supportSide, palm)) {
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
