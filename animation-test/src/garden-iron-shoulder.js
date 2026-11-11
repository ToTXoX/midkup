import { MathUtils, Quaternion, Vector3 } from 'three';

const chargeEnd = .65;
const dashEnd = .90;
const duration = 1.25;
const range = 1.8;
const cooldownDuration = 5;
const damage = 100;
const beats = [.28, .44, .55];
const up = new Vector3(0, 1, 0);

export const ironShoulderSoundCues = [
  { time: .035, sound: 'tackleGather', rate: .82, volume: .72 },
  ...beats.map((time, i) => ({ time, sound: 'ironPulse', rate: .89 + i * .11, volume: .73 + i * .09 })),
  { time: chargeEnd, sound: 'ironRush' },
];

export function createGardenIronShoulder({ actor, navigation, groundHeight, targetContact, effects, onPhase, onHit }) {
  const origin = new Vector3();
  const direction = new Vector3();
  const destination = new Vector3();
  const dust = new Vector3();
  const startTurn = new Quaternion();
  const shoulderTurn = new Quaternion();
  const endTurn = new Quaternion();
  let phase = 'idle', time = 0, cooldown = 0, hold = 0, travel = 0;
  let stopped = false, hitId = null, blockedBy = null, followThrough = 0;

  function start(point) {
    if (phase !== 'idle' || cooldown > 0 || !navigation.isWalkable(actor.position)) return false;
    actor.getWorldDirection(direction).setY(0).normalize();
    if (point && Math.hypot(point.x - actor.position.x, point.z - actor.position.z) > .02) {
      direction.subVectors(point, actor.position).setY(0).normalize();
    }
    const yaw = Math.atan2(direction.x, direction.z);
    startTurn.copy(actor.quaternion);
    // Dawn's raised shoulder is on model +X.
    shoulderTurn.setFromAxisAngle(up, yaw - Math.PI / 2);
    endTurn.setFromAxisAngle(up, yaw);
    origin.copy(actor.position);
    time = hold = travel = followThrough = 0;
    cooldown = cooldownDuration;
    stopped = false;
    hitId = blockedBy = null;
    phase = 'charge';
    onPhase(phase);
    return true;
  }

  function drive() {
    const progress = MathUtils.clamp((time - chargeEnd) / (dashEnd - chargeEnd), 0, 1);
    const stride = progress * (.45 + .55 * (2 - progress) * progress);
    destination.copy(origin).addScaledVector(direction, stride * range);
    const sweep = navigation.sweep(actor.position, destination);
    const { x, z } = sweep.position;
    actor.position.set(x, (groundHeight(x, z) ?? actor.position.y - .005) + .005, z);
    travel = Math.hypot(x - origin.x, z - origin.z);
    if (!sweep.blockedBy) return;
    blockedBy = sweep.blockedBy;
    stopped = true;
    const id = blockedBy.startsWith('visitor:') ? blockedBy : blockedBy.startsWith('target-') ? blockedBy.slice(7) : null;
    const point = id ? targetContact(id, actor.position, direction) : null;
    if (!point) {
      effects.dust(dust.copy(actor.position).addScaledVector(up, .025), direction, 'blocked');
      onPhase('blocked');
      return;
    }
    hitId = id;
    followThrough = MathUtils.clamp(destination.subVectors(point, actor.position).dot(direction) - .30, 0, .21);
    hold = .055;
    effects.hit(point, direction);
    onHit(id, direction, damage);
  }

  function update(delta) {
    cooldown = Math.max(0, cooldown - delta);
    if (phase === 'idle' || delta <= 0) return;
    if (hold > 0) { hold = Math.max(0, hold - delta); return; }
    const previous = time;
    time = Math.min(duration, time + delta);
    for (let i = 0; i < beats.length; i++) {
      if (previous < beats[i] && time >= beats[i]) effects.pulse(origin, i);
    }
    if (phase === 'charge') {
      actor.quaternion.slerpQuaternions(startTurn, shoulderTurn, MathUtils.smoothstep(time, 0, .20));
      if (time < chargeEnd) return;
      phase = 'dash';
      effects.dust(dust.copy(origin).addScaledVector(up, .025), direction, 'launch');
      onPhase(phase);
    }
    if (phase === 'dash') {
      if (!stopped) drive();
      if (time >= dashEnd) {
        phase = 'recover';
        if (!stopped) effects.dust(dust.copy(actor.position).addScaledVector(up, .025), direction, 'miss');
        if (!hitId && !blockedBy) onPhase('miss');
      }
    }
    if (phase === 'recover') {
      actor.quaternion.slerpQuaternions(shoulderTurn, endTurn, MathUtils.smoothstep(time, 1, duration));
      if (time >= duration) { phase = 'idle'; onPhase(phase); }
    }
  }

  return {
    start, update,
    cancel() { phase = 'idle'; hold = followThrough = 0; },
    get active() { return phase !== 'idle'; },
    get dashing() { return phase === 'dash' && !stopped; },
    get direction() { return direction; },
    get time() { return time; },
    get cooldown() { return cooldown; },
    get cooldownRatio() { return cooldown / cooldownDuration; },
    get ready() { return phase === 'idle' && cooldown <= 0; },
    get lunge() { return followThrough * (1 - MathUtils.smoothstep(time, .88, 1.01)); },
    debug: () => ({ phase, time, cooldown, travel, hitId, blockedBy, damage: hitId ? damage : 0 }),
  };
}
