import {
  BackSide, CatmullRomCurve3, Group, MathUtils, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, Quaternion, SphereGeometry, TubeGeometry, Vector3,
} from 'three';

const dribbleStart = .27;
const handoff = .625;
const gather = .98;
const spinStart = 1.02;
const spinEnd = 1.57;
const release = 1.875;
const duration = 2.375;
const cooldownDuration = 5;
const range = 4.2;
const gravity = 10;
const radius = .079;
const up = new Vector3(0, 1, 0);
const palm = new Vector3(0, .14, 0);
const { clamp, lerp, smoothstep } = MathUtils;

export const basketballSoundCues = [
  { time: (dribbleStart + handoff) / 2, sound: 'ballBounce', rate: .96, volume: .65 },
  { time: (handoff + gather) / 2, sound: 'ballBounce', rate: 1.08, volume: .61 },
  { time: gather, sound: 'ballCatch', volume: .74 },
  { time: release, sound: 'ballThrow' },
];

function createBall(scene) {
  const ball = new Group();
  ball.name = 'Dawn basketball';
  const geometry = new SphereGeometry(radius, 28, 20);
  const surface = new Mesh(geometry, new MeshStandardMaterial({ color: '#f28837', roughness: .82 }));
  const ink = new MeshBasicMaterial({ color: '#422b2b', toneMapped: false });
  const outline = new Mesh(geometry, new MeshBasicMaterial({ color: '#422b2b', side: BackSide, toneMapped: false }));
  outline.scale.setScalar(1.045);
  ball.add(surface, outline);
  for (const seam of [
    angle => new Vector3(0, Math.cos(angle), Math.sin(angle)),
    angle => new Vector3(Math.cos(angle), Math.sin(angle), 0),
    angle => {
      const latitude = .40 * Math.sin(2 * angle);
      return new Vector3(Math.cos(angle) * Math.cos(latitude), Math.sin(latitude), Math.sin(angle) * Math.cos(latitude));
    },
  ]) {
    const points = Array.from({ length: 32 }, (_, i) => seam(i * Math.PI / 16).multiplyScalar(radius));
    const path = new CatmullRomCurve3(points, true);
    ball.add(new Mesh(new TubeGeometry(path, 48, .0018, 4, true), ink));
  }
  ball.visible = false;
  scene.add(ball);
  return ball;
}

export function createGardenBasketball({ scene, actor, groundHeight, resolveTarget, trace, onPhase, onContact }) {
  const ball = createBall(scene);
  const direction = new Vector3(), forward = new Vector3();
  const fromTurn = new Quaternion(), toTurn = new Quaternion();
  const left = new Vector3(), right = new Vector3(), position = new Vector3();
  const origin = new Vector3(), destination = new Vector3(), velocity = new Vector3();
  const previous = new Vector3(), next = new Vector3(), tangent = new Vector3();
  const previewOrigin = new Vector3();
  let targetId = null, contact = null, age = 0, cooldown = 0, flight = 0;
  let playing = false, flying = false, previewReleased = false, lockedOutOfRange = false;
  let phase = 'idle';

  function show(point, spin, scale = 1) {
    ball.visible = true;
    ball.position.copy(point);
    ball.rotation.set(.45 + spin, .55, -.28);
    ball.scale.setScalar(scale);
  }

  function showHeld(model, time, floorAt) {
    const turn = -2 * Math.PI * smoothstep(time, spinStart, spinEnd);
    forward.set(0, 0, 1).applyQuaternion(actor.quaternion).applyAxisAngle(up, turn);
    model.getObjectByName('HandR').localToWorld(right.copy(palm));
    model.getObjectByName('HandL').localToWorld(left.copy(palm));
    position.copy(right).addScaledVector(forward, .074);
    if (time >= dribbleStart && time < gather) {
      const second = time >= handoff;
      const t = second ? (time - handoff) / (gather - handoff) : (time - dribbleStart) / (handoff - dribbleStart);
      const across = smoothstep(t, 0, 1);
      position.lerpVectors(right, left, second ? 1 - across : across).addScaledVector(forward, .074 + .085 * Math.sin(Math.PI * t));
      const floor = floorAt(position.x, position.z);
      position.y = lerp(floor + radius, position.y, 1 - (1 - Math.abs(2 * t - 1)) ** 2);
    } else if (time >= gather) {
      const carry = smoothstep(time, gather, 1.16) * (1 - smoothstep(time, 1.64, release));
      position.addScaledVector(forward, .037 * carry + .020 * smoothstep(time, 1.74, release));
      position.y += .018 * carry + .031 * smoothstep(time, 1.74, release);
    }
    show(position, 8 * time, lerp(.58, 1, smoothstep(time, 0, .16)));
  }

  function setPhase(nextPhase) {
    phase = nextPhase;
    onPhase(phase);
  }

  function start(point, id) {
    if (playing || flying || cooldown > 0) return false;
    direction.set(0, 0, 1).applyQuaternion(actor.quaternion).setY(0);
    if (point && Math.hypot(point.x - actor.position.x, point.z - actor.position.z) > .02) {
      direction.subVectors(point, actor.position).setY(0);
    }
    direction.normalize();
    fromTurn.copy(actor.quaternion);
    toTurn.setFromAxisAngle(up, Math.atan2(direction.x, direction.z));
    targetId = id;
    contact = null;
    age = flight = 0;
    playing = true;
    cooldown = cooldownDuration;
    setPhase('dribble');
    return true;
  }

  const gardenFloor = (x, z) => groundHeight(x, z) ?? actor.position.y - .005;
  function launch() {
    origin.copy(ball.position);
    previous.copy(origin);
    const aim = targetId ? resolveTarget(targetId) : null;
    const aimDistance = aim ? Math.hypot(aim.x - actor.position.x, aim.z - actor.position.z) : 0;
    lockedOutOfRange = aimDistance > range;
    if (aim && !lockedOutOfRange) destination.copy(aim);
    else {
      destination.copy(actor.position).addScaledVector(direction, range);
      destination.y = gardenFloor(destination.x, destination.z);
    }
    const distance = Math.hypot(destination.x - origin.x, destination.z - origin.z);
    const travelTime = clamp(.39 + .095 * distance, .43, .79);
    velocity.subVectors(destination, origin).divideScalar(travelTime);
    velocity.y += .5 * gravity * travelTime;
    flying = true;
    setPhase('flight');
  }

  function advanceFlight(delta) {
    flight += delta;
    next.copy(origin).addScaledVector(velocity, flight);
    next.y -= .5 * gravity * flight ** 2;
    let hit = trace(previous, next);
    if (!hit && flight < 1.05) {
      show(next, 8 * release + 14 * flight);
      previous.copy(next);
      return;
    }
    hit ??= { kind: 'miss', targetId: null, point: next };
    tangent.copy(velocity);
    tangent.y -= gravity * flight;
    contact = { kind: hit.kind, targetId: hit.targetId, point: hit.point.toArray() };
    flying = ball.visible = false;
    setPhase('recover');
    onContact(hit, tangent, lockedOutOfRange);
  }

  function update(delta, model, samplePose, onFinish) {
    cooldown = Math.max(0, cooldown - delta);
    if (playing) {
      const before = age;
      age = Math.min(duration, age + delta);
      actor.quaternion.slerpQuaternions(fromTurn, toTurn, smoothstep(age, 0, dribbleStart));
      if (before < spinStart && age >= spinStart) setPhase('turn');
      if (before < spinEnd && age >= spinEnd) setPhase('shoot');
      if (before < release && age >= release) {
        samplePose(release);
        showHeld(model, release, gardenFloor);
        launch();
        if (age > release) advanceFlight(age - release);
      } else if (flying) advanceFlight(delta);
      samplePose(Math.min(age, duration - 1e-6));
      if (age < release) showHeld(model, age, gardenFloor);
      if (age >= duration) {
        playing = false;
        onFinish();
      }
    } else if (flying) advanceFlight(delta);
    if (!playing && !flying && phase !== 'idle') setPhase('idle');
  }

  function preview(model, time, floor, samplePose) {
    if (time < release) {
      previewReleased = false;
      showHeld(model, time, () => floor);
      return;
    }
    if (!previewReleased) {
      samplePose(release);
      showHeld(model, release, () => floor);
      previewOrigin.copy(ball.position);
      samplePose(time);
      previewReleased = true;
    }
    const elapsed = time - release;
    next.copy(previewOrigin).addScaledVector(forward.set(0, 0, 1).applyQuaternion(actor.quaternion), elapsed * 1.9);
    next.y = Math.max(floor + radius, previewOrigin.y + 1.85 * elapsed - .5 * gravity * elapsed ** 2);
    show(next, 8 * release + 14 * elapsed);
  }

  function hide() {
    ball.visible = false;
    previewReleased = false;
  }

  return {
    start, update, preview, hide,
    cancel() { playing = flying = false; phase = 'idle'; hide(); },
    get active() { return playing || flying; },
    get playing() { return playing; },
    get ready() { return !playing && !flying && cooldown <= 0; },
    get cooldown() { return cooldown; },
    get cooldownRatio() { return cooldown / cooldownDuration; },
    get phase() { return phase; },
    debug: () => ({
      phase, age, flight, cooldown, contact,
      bounces: Number(age >= (dribbleStart + handoff) / 2) + Number(age >= (handoff + gather) / 2),
      ball: ball.visible ? ball.position.toArray() : null,
    }),
  };
}
