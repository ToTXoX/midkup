import { MathUtils, Matrix4, Quaternion, Vector3 } from 'three';

const horizontal = new Vector3(1, 0, 0);
const boneKey = name => name.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^mixamorig/, '');

export function createKnockdownRig(model, pivot, center, { quadruped = false } = {}) {
  const bones = new Map();
  const sampleMeshes = [];
  const facing = pivot.getWorldQuaternion(new Quaternion());
  const worldRotation = new Quaternion();
  let pointCount = 0;
  model.traverse(node => {
    if (node.isBone) {
      bones.set(boneKey(node.name), {
        node, position: node.position.clone(), rotation: node.quaternion.clone(), scale: node.scale.clone(),
        frame: node.getWorldQuaternion(worldRotation).invert().multiply(facing).clone(),
        fromPosition: new Vector3(), fromRotation: new Quaternion(), fromScale: new Vector3(),
      });
    }
    if (!node.isMesh) return;
    const count = node.geometry.getAttribute('position')?.count ?? 0;
    const stride = Math.max(1, Math.floor(count / (quadruped ? 360 : 84)));
    sampleMeshes.push({ node, count, stride });
    pointCount += Math.ceil(count / stride);
  });
  if (!bones.size) return null;

  const joints = [...bones.values()];
  const sides = [[1, 'l', 'left'], [-1, 'r', 'right']].map(([sign, short, long]) => {
    const limb = (...names) => names.map(name => bones.get(name + short) ?? bones.get(short + name) ?? bones.get(long + name)).find(Boolean);
    return {
      sign, upper: limb('upperarm', 'arm'), elbow: limb('forearm', 'lowerarm'), hand: limb('hand', 'wrist'),
      thigh: limb('thigh', 'upleg', 'upperleg'), shin: limb('shin', 'leg', 'lowerleg'), foot: limb('boot', 'foot'),
    };
  });
  const chest = bones.get('chest') ?? bones.get('spine2');
  const head = bones.get('head');
  const tail = bones.get('tail1');
  const tailTip = bones.get('tail2');
  const restFacing = facing.clone().invert();
  const paws = quadruped ? sides.flatMap(({ sign, upper, elbow, hand, thigh, shin, foot }) => [
    { sign, fore: true, start: upper, joint: elbow, end: hand },
    { sign, fore: false, start: thigh, joint: shin, end: foot },
  ]).filter(({ start, joint, end }) => start && joint?.node.parent === start.node && end?.node.parent === joint.node)
    .map(paw => ({
      ...paw,
      rest: pivot.worldToLocal(paw.end.node.getWorldPosition(new Vector3())),
      restRotation: restFacing.clone().multiply(paw.end.node.getWorldQuaternion(new Quaternion())),
      target: new Vector3(), contact: 0,
    })) : [];
  const rotation = new Quaternion();
  const blendRotation = new Quaternion();
  const localAxis = new Vector3();
  const current = new Vector3();
  const target = new Vector3();
  const points = new Float32Array(pointCount * 3);
  const vertex = new Vector3();
  const relative = new Matrix4();
  const inversePivot = new Matrix4();
  const shoulderPoint = new Vector3();
  const elbowPoint = new Vector3();
  const wristPoint = new Vector3();
  const towardWrist = new Vector3();
  const elbowPlane = new Vector3();
  const pawRotation = new Quaternion();

  function reset() {
    for (const bone of joints) {
      bone.node.position.copy(bone.position);
      bone.node.quaternion.copy(bone.rotation);
      bone.node.scale.copy(bone.scale);
    }
  }

  function rotate(bone, axis, angle) {
    if (!bone) return;
    localAxis.copy(axis).applyQuaternion(bone.frame);
    bone.node.quaternion.multiply(rotation.setFromAxisAngle(localAxis, angle));
  }

  function steer(bone, next, weight) {
    current.copy(next.node.position).applyQuaternion(bone.node.quaternion).normalize();
    rotation.setFromUnitVectors(current, target.normalize());
    bone.node.quaternion.premultiply(blendRotation.identity().slerp(rotation, weight));
  }

  function reach(bone, next, x, y, z, weight) {
    if (!bone || !next || next.node.parent !== bone.node) return;
    bone.node.parent.getWorldQuaternion(worldRotation).invert().multiply(facing);
    target.set(x, y, z).applyQuaternion(worldRotation);
    steer(bone, next, weight);
  }

  function aimAt(bone, next, point) {
    bone.node.parent.updateWorldMatrix(true, false);
    relative.copy(bone.node.parent.matrixWorld).invert().multiply(pivot.matrixWorld);
    target.copy(point).applyMatrix4(relative).sub(bone.node.position);
    steer(bone, next, 1);
  }

  function supportPoints() {
    pivot.updateMatrixWorld(true);
    inversePivot.copy(pivot.matrixWorld).invert();
    let index = 0;
    for (const { node, count, stride } of sampleMeshes) {
      relative.multiplyMatrices(inversePivot, node.matrixWorld);
      for (let i = 0; i < count; i += stride) {
        node.getVertexPosition(i, vertex).applyMatrix4(relative).sub(center).toArray(points, index);
        index += 3;
      }
    }
    return points;
  }

  function solveLimb(upper, elbow, hand, point) {
    pivot.updateWorldMatrix(true, false);
    inversePivot.copy(pivot.matrixWorld).invert();
    upper.node.getWorldPosition(shoulderPoint).applyMatrix4(inversePivot);
    elbow.node.getWorldPosition(elbowPoint).applyMatrix4(inversePivot);
    hand.node.getWorldPosition(wristPoint).applyMatrix4(inversePivot);
    const upperLength = elbowPoint.distanceTo(shoulderPoint);
    const forearmLength = wristPoint.distanceTo(elbowPoint);
    towardWrist.copy(point).applyMatrix4(inversePivot.copy(pivot.matrix).invert()).sub(shoulderPoint);
    const reach = towardWrist.length();
    if (reach < 1e-6 || upperLength < 1e-6 || forearmLength < 1e-6) return false;
    const span = MathUtils.clamp(reach, Math.abs(upperLength - forearmLength) + .00001, .999 * (upperLength + forearmLength));
    towardWrist.divideScalar(reach);
    elbowPlane.subVectors(elbowPoint, shoulderPoint);
    elbowPlane.addScaledVector(towardWrist, -elbowPlane.dot(towardWrist));
    if (elbowPlane.lengthSq() < 1e-9) return false;
    const along = (upperLength ** 2 - forearmLength ** 2 + span ** 2) / (2 * span);
    const bend = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
    elbowPoint.copy(shoulderPoint).addScaledVector(towardWrist, along).addScaledVector(elbowPlane.normalize(), bend);
    wristPoint.copy(shoulderPoint).addScaledVector(towardWrist, span);
    aimAt(upper, elbow, elbowPoint);
    aimAt(elbow, hand, wristPoint);
    return true;
  }

  function groundRecovery(age, supportSide, offset, place) {
    for (const paw of paws) {
      const near = paw.sign === supportSide;
      const land = paw.fore ? (near ? 1.01 : 1.13) : (near ? 1.26 : 1.39);
      const weight = MathUtils.smoothstep(age, land, land + .17);
      const position = pivot.parent.worldToLocal(paw.end.node.getWorldPosition(paw.target));
      target.copy(paw.rest).add(offset);
      position.lerp(target, weight);
      if (!paw.fore) position.y += .028 * Math.sin(Math.PI * weight);
      const clearance = position.y - target.y;
      paw.contact = Math.max(weight, 1 - MathUtils.smoothstep(clearance, 0, .025));
      position.y = Math.max(position.y, target.y);
    }
    // Fitting the silhouette to the floor can move the hips. Reapply the same paw targets afterward.
    for (let pass = 0; pass < 2; pass++) {
      for (const paw of paws) {
        if (!paw.contact || !solveLimb(paw.start, paw.joint, paw.end, paw.target)) continue;
        paw.end.node.parent.getWorldQuaternion(worldRotation).invert().multiply(facing);
        pawRotation.copy(worldRotation).multiply(paw.restRotation);
        paw.end.node.quaternion.slerp(pawRotation, paw.contact);
      }
      if (pass === 0) place(supportPoints());
    }
  }

  return {
    begin() {
      pivot.parent.getWorldQuaternion(facing);
      for (const bone of joints) {
        bone.fromPosition.copy(bone.node.position);
        bone.fromRotation.copy(bone.node.quaternion);
        bone.fromScale.copy(bone.node.scale);
      }
    },
    reset,
    groundRecovery: paws.length === 4 ? groundRecovery : null,
    palmPosition(side, result) {
      const hand = sides[side > 0 ? 0 : 1].hand;
      return hand ? pivot.parent.worldToLocal(hand.node.getWorldPosition(result)) : null;
    },
    bracePalm(side, palm) {
      const { upper, elbow, hand } = sides[side > 0 ? 0 : 1];
      if (!upper || !elbow || !hand || elbow.node.parent !== upper.node || hand.node.parent !== elbow.node) return null;
      return solveLimb(upper, elbow, hand, palm) ? supportPoints() : null;
    },
    pose({ age, axis, supportSide, flail, tuck, brace, push, nod, quadruped }) {
      pivot.position.set(0, 0, 0);
      pivot.quaternion.identity();
      pivot.scale.setScalar(1);
      pivot.updateWorldMatrix(true, false);
      reset();
      rotate(chest, horizontal, .21 * brace - .09 * flail);
      rotate(head, horizontal, nod);
      rotate(head, axis, -.19 * flail + .12 * tuck - .12 * push);
      if (quadruped) {
        const roll = MathUtils.smoothstep(age, .71, 1.03) * (1 - MathUtils.smoothstep(age, 1.40, 1.82));
        rotate(tail, horizontal, .23 * roll - .045 * push);
        rotate(tailTip, horizontal, .19 * roll);
        rotate(chest, horizontal, .12 * brace - .11 * push);
      }
      for (const { sign, upper, elbow, hand, thigh, shin, foot } of sides) {
        const near = sign === supportSide;
        const legBend = tuck * (near ? .85 : 1.14);
        rotate(thigh, horizontal, -.72 * legBend);
        rotate(shin, horizontal, 1.08 * legBend);
        rotate(foot, horizontal, -.48 * legBend + .12 * flail * sign);
        const weight = Math.min(1, .88 * flail + (near ? .98 : .72) * brace + .14 * tuck);
        reach(upper, elbow, sign * (near ? .48 + .36 * brace : .56 + .33 * flail - .32 * brace),
          -.61 + (near ? .43 : .82) * flail + .16 * brace, .20 + .38 * flail + .32 * brace, weight);
        reach(elbow, hand, sign * (near ? .27 + .40 * brace : .24 - .41 * brace),
          -.39 + (near ? .66 : 1.00) * flail - .33 * push, .39 + .39 * brace, weight);
      }
      const entry = 1 - MathUtils.smoothstep(age, 0, .115);
      if (entry > 0) {
        for (const bone of joints) {
          bone.node.position.lerp(bone.fromPosition, entry);
          bone.node.quaternion.slerp(bone.fromRotation, entry);
          bone.node.scale.lerp(bone.fromScale, entry);
        }
      }
      return supportPoints();
    },
  };
}
