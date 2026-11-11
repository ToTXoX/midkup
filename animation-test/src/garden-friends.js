import { AnimationMixer, Group, LoopOnce, Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createKnockdownMotion, measureKnockdownBody } from './garden-knockdown.js';
import { createKnockdownRig } from './garden-knockdown-rig.js';

const targetPrefix = 'visitor:';
const reactions = {
  water: { duration: .53, tilt: .26, slide: .074, hop: .052, message: '被水花吓了一跳！' },
  mud: { duration: .46, tilt: .19, slide: .052, hop: .038, message: '被泥团弄脏啦！' },
  iron: { duration: .55, tilt: .37, slide: 0, hop: .09, message: '被击退！' },
};
const pushDuration = .24;

export function createGardenFriends({ scene, characters, playerId, host, actor, camera, preview, navigation, loadCharacter, portrait, feedback, onOpen, onLeave, onControl }) {
  const controls = document.getElementById('garden-friends');
  const toggle = document.getElementById('garden-invite');
  const panel = document.getElementById('garden-invite-panel');
  const list = document.getElementById('garden-invite-list');
  const status = document.getElementById('garden-invite-status');
  const party = document.getElementById('garden-party');
  const reserves = document.getElementById('garden-reserves');
  const group = new Group();
  group.name = 'Garden visitors';
  group.visible = false;
  scene.add(group);
  const guests = new Map();
  const targets = new Map();
  const bodies = new WeakMap();
  let controlled = playerId;
  let visitNumber = 0;
  const spawn = new Vector3().fromArray(preview.layout.spawn.position);
  const up = new Vector3(0, 1, 0);
  const colliderGeometry = new SphereGeometry(1, 16, 12);
  const colliderMaterial = new MeshBasicMaterial({ visible: false });
  const playerRadius = navigation.settings.actorRadius;

  function syncParty() {
    const multiple = guests.size > 1;
    party.toggleAttribute('data-multiple', multiple);
    reserves.hidden = !multiple;
    const focused = document.activeElement;
    let movedFocus = false;
    for (const guest of guests.values()) {
      const active = guest.id === controlled;
      guest.avatar.setAttribute('aria-pressed', String(active));
      const slot = active ? party : reserves;
      if (guest.avatar.parentNode !== slot) {
        slot.append(guest.avatar);
        if (guest.avatar === focused) movedFocus = true;
      }
    }
    if (movedFocus) focused.focus({ preventScroll: true });
  }

  function inactiveTarget(id) {
    const guest = targets.get(id);
    return guest?.id === controlled ? null : guest;
  }

  function syncColliders() {
    const inactive = [...guests.values()].filter(guest => guest.id !== controlled);
    navigation.setVisitorColliders(inactive.map(guest => {
      const push = guest.reaction?.push;
      if (push) return { id: guest.targetId, type: 'capsule', start: [push.start.x, push.start.z], end: [push.end.x, push.end.z], radius: guest.radius };
      const position = guest.knockdown?.landing ?? guest.object.position;
      return { id: guest.targetId, type: 'circle', center: [position.x, position.z], radius: guest.knockdown?.footprint ?? guest.radius };
    }));
  }

  function findSpot(radius, aroundSpawn = false) {
    const player = group.visible ? actor.position : spawn;
    const occupied = [player, spawn];
    const gap = navigation.settings.actorRadius + navigation.settings.skin + radius + .09;
    for (const center of aroundSpawn ? [spawn] : [player, spawn]) {
      for (const offset of [1.1, 1.65, 2.2]) {
        for (let step = 0; step < 8; step++) {
          const angle = step * Math.PI / 4;
          const x = center.x + offset * Math.cos(angle);
          const z = center.z + offset * Math.sin(angle);
          if (occupied.some(p => Math.hypot(x - p.x, z - p.z) < gap) || !navigation.canFitVisitor([x, z], radius)) continue;
          const height = preview.groundHeight(x, z);
          if (height !== null) return new Vector3(x, height + .005, z);
        }
      }
    }
    return null;
  }

  function arrive(id, asset, guest, body, position) {
    const { gltf } = asset;
    const targetId = `${targetPrefix}${id}:${++visitNumber}`;
    const object = new Group();
    object.name = `Visitor_${id}`;
    object.visible = id !== controlled;
    object.position.copy(position);
    object.rotation.y = Math.atan2(camera.position.x - position.x, camera.position.z - position.z);
    const pivot = new Group();
    pivot.add(guest);
    object.add(pivot);
    const { bounds, center, size, standingRadius } = body;
    const knockdownRig = createKnockdownRig(guest, pivot, center, { quadruped: id === 'mudkip' });
    const aim = center.clone();
    aim.y = bounds.min.y + size.y * .58;
    const colliders = [];
    for (const [height, width, length, depth] of [[.70, .49, .29, .46], [.29, .43, .29, .43]]) {
      const hitbox = new Mesh(colliderGeometry, colliderMaterial);
      hitbox.position.set(center.x, bounds.min.y + size.y * height, center.z);
      hitbox.scale.set(size.x * width, size.y * length, size.z * depth);
      hitbox.userData.visitorId = targetId;
      hitbox.visible = false;
      pivot.add(hitbox);
      colliders.push(hitbox);
    }
    const mixer = new AnimationMixer(guest);
    const idleClip = gltf.animations.find(clip => clip.name === 'Idle');
    const waveClip = gltf.animations.find(clip => clip.name === (id === playerId ? 'PetReaction' : 'Wave'));
    const idle = idleClip && mixer.clipAction(idleClip);
    const wave = waveClip && mixer.clipAction(waveClip).setLoop(LoopOnce, 1);
    let action = idle;
    function play(next) {
      if (!next) return;
      action?.stop();
      action = next.reset().play();
    }
    if (wave) {
      wave.clampWhenFinished = true;
      mixer.addEventListener('finished', event => {
        if (event.action === wave) play(idle);
      });
    }
    if (object.visible) {
      play(wave || idle);
      mixer.update(0);
    }
    const avatar = document.createElement('button');
    const name = characters[id].name;
    avatar.type = 'button';
    avatar.className = 'buddy-stamp';
    avatar.setAttribute('aria-label', `操控 ${name}`);
    avatar.title = `操控 ${name}`;
    avatar.append(portrait(id) ?? name);
    avatar.addEventListener('click', () => onControl(id));
    const visitor = {
      id, asset, avatar, object, guest, pivot, mixer, colliders, aim, body, targetId, name,
      radius: id === playerId ? playerRadius : Math.max(standingRadius, playerRadius),
      reaction: null, knockdown: null, knockdownRig, hits: 0, lastHit: null,
      greet() { if (action !== wave || !wave?.isRunning()) play(wave); },
      idle() { if (action !== idle) play(idle); },
      rest() { action?.stop(); action = null; },
      get action() { return action?.getClip().name; },
    };
    guests.set(id, visitor);
    targets.set(targetId, visitor);
    group.add(object);
    syncParty();
    if (object.visible) syncColliders();
  }

  const hostModel = clone(host.gltf.scene);
  arrive(playerId, host, hostModel, measureKnockdownBody(hostModel), spawn);

  function savePlayer() {
    const { object } = guests.get(controlled);
    object.position.copy(actor.position);
    object.quaternion.copy(actor.quaternion);
  }

  function restorePlayer() {
    const { object } = guests.get(controlled);
    if (guests.size < 2 || !navigation.isWalkable(object.position)) return false;
    actor.position.copy(object.position);
    actor.quaternion.copy(object.quaternion);
    return true;
  }

  function knockDown(guest, direction) {
    const origin = guest.object.position;
    const away = new Vector3().subVectors(origin, actor.position).setY(0);
    if (away.lengthSq() < 1e-6) away.copy(direction).setY(0);
    away.normalize();
    const fall = findFallSpace(guest, away);
    const landing = fall?.landing ?? origin.clone();
    const footprint = fall ? guest.body.tumbleRadius : guest.radius;
    const localYaw = -guest.object.rotation.y;
    const offset = landing.clone().sub(origin).applyAxisAngle(up, localYaw);
    const localDirection = (fall?.direction ?? away).applyAxisAngle(up, localYaw);
    guest.knockdownRig?.begin();
    guest.rest();
    guest.reaction = null;
    const motion = createKnockdownMotion(guest.body, localDirection, offset, guest.knockdownRig, !fall);
    guest.knockdown = { landing, footprint, motion };
    syncColliders();
  }

  function findFallSpace(guest, away) {
    const origin = guest.object.position;
    const footprint = guest.body.tumbleRadius;
    const clearance = footprint + playerRadius + navigation.settings.skin;
    for (const turn of [0, -.60, .60, -1.20, 1.20]) {
      const direction = away.clone().applyAxisAngle(up, turn);
      const landing = origin.clone().addScaledVector(direction, footprint - guest.radius + .002);
      if (Math.hypot(actor.position.x - landing.x, actor.position.z - landing.z) < clearance) continue;
      if (!navigation.canFitVisitor(landing, footprint, guest.targetId)) continue;
      if (navigation.sweepVisitor(origin, landing, guest.radius, guest.targetId).blockedBy) continue;
      const ground = preview.groundHeight(landing.x, landing.z);
      if (ground !== null) {
        landing.y = ground + .005;
        return { landing, direction };
      }
    }
    return null;
  }

  function knockBack(guest, direction) {
    const start = guest.object.position.clone();
    const sweep = navigation.sweepVisitor(start, start.clone().addScaledVector(direction, .70), guest.radius, guest.targetId);
    const { x, z } = sweep.position;
    if (Math.hypot(x - start.x, z - start.z) < .01) return null;
    return { start, end: new Vector3(x, (preview.groundHeight(x, z) ?? start.y - .005) + .005, z) };
  }

  function leave(id) {
    if (id === controlled) {
      onControl(playerId);
      if (id === controlled) return false;
    }
    const { object, guest, mixer, targetId, avatar } = guests.get(id);
    mixer.stopAllAction();
    mixer.uncacheRoot(guest);
    const skeletons = new Set();
    guest.traverse(node => { if (node.isSkinnedMesh) skeletons.add(node.skeleton); });
    for (const skeleton of skeletons) skeleton.dispose();
    object.removeFromParent();
    avatar.remove();
    guests.delete(id);
    targets.delete(targetId);
    syncColliders();
    syncParty();
    onLeave(targetId);
    return true;
  }

  function close(restoreFocus = false) {
    if (panel.hidden) return false;
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus) toggle.focus();
    return true;
  }

  for (const [id, character] of Object.entries(characters)) {
    if (id === playerId) continue;
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'garden-friend-option';
    const name = document.createElement('span');
    name.textContent = character.name;
    const action = document.createElement('span');
    action.className = 'garden-friend-action';
    button.append(portrait(id) ?? document.createElement('span'), name, action);
    item.append(button);
    list.append(item);
    let loading = false;

    function syncButton() {
      const visiting = guests.has(id);
      action.textContent = loading ? '邀请中…' : visiting ? '送别' : '邀请';
      button.setAttribute('aria-label', `${visiting ? '送别' : '邀请'} ${character.name}`);
      button.setAttribute('aria-disabled', String(loading));
      button.toggleAttribute('data-visiting', visiting);
    }

    function reportFailure(message) {
      if (group.visible && panel.hidden) feedback(message);
      else status.textContent = message;
    }

    syncButton();
    button.addEventListener('click', async () => {
      if (loading || !group.visible) return;
      if (guests.has(id)) {
        if (!leave(id)) return;
        syncButton();
        status.textContent = '';
        feedback(`和 ${character.name} 说再见啦。`);
        return;
      }
      loading = true;
      status.textContent = '';
      syncButton();
      try {
        const asset = await loadCharacter(id);
        const { gltf } = asset;
        const guest = clone(gltf.scene);
        let body = bodies.get(gltf.scene);
        if (!body) {
          body = measureKnockdownBody(guest);
          bodies.set(gltf.scene, body);
        }
        const position = findSpot(Math.max(body.standingRadius, playerRadius));
        if (position) {
          arrive(id, asset, guest, body, position);
          if (group.visible) feedback(`${character.name} 来庭院做客啦！`);
        } else {
          reportFailure('附近没有空地，换个位置再邀请。');
        }
      } catch (error) {
        reportFailure(`${character.name} 暂时没能到访，请再试一次。`);
        console.warn(error);
      } finally {
        loading = false;
        syncButton();
      }
    });
  }

  if (!list.childElementCount) status.textContent = '目前没有可邀请的角色。';
  toggle.addEventListener('click', () => {
    if (close()) return;
    onOpen();
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
  });
  document.addEventListener('pointerdown', event => {
    if (!controls.contains(event.target)) close();
  });

  return {
    close,
    setView(garden) {
      if (!garden && group.visible && navigation.isWalkable(actor.position)) savePlayer();
      group.visible = garden;
      if (!garden) close();
    },
    get controlled() { return controlled; },
    get controlledName() { return guests.get(controlled).name; },
    restorePlayer,
    resetPoint() { return navigation.isWalkable(spawn) ? spawn : findSpot(playerRadius, true); },
    control(id, prepare) {
      const incoming = guests.get(id);
      if (!group.visible || !incoming || id === controlled) return false;
      if (incoming.knockdown) { feedback(`${incoming.name} 还在爬起来，等一下再切换。`); return false; }
      const outgoing = guests.get(controlled);
      const position = incoming.object.position;
      const gap = outgoing.radius + playerRadius + navigation.settings.skin;
      if (Math.hypot(actor.position.x - position.x, actor.position.z - position.z) < gap - .0001) {
        feedback('先走开一点，再切换角色。');
        return false;
      }
      prepare(incoming.asset);
      savePlayer();
      outgoing.object.visible = true;
      outgoing.idle();
      outgoing.mixer.update(0);
      incoming.object.visible = false;
      incoming.rest();
      incoming.reaction = null;
      incoming.pivot.position.set(0, 0, 0);
      incoming.pivot.quaternion.identity();
      actor.position.copy(position);
      actor.quaternion.copy(incoming.object.quaternion);
      controlled = id;
      syncColliders();
      syncParty();
      return true;
    },
    targetPoint(id) {
      const guest = inactiveTarget(id);
      if (!group.visible || !guest) return null;
      const anchor = guest.knockdown ? guest.pivot : guest.object;
      return anchor.localToWorld(guest.aim.clone());
    },
    targetName(id) {
      return inactiveTarget(id)?.name ?? null;
    },
    boundaryPoint(id, from) {
      const guest = inactiveTarget(id);
      if (!group.visible || !guest) return null;
      const center = guest.knockdown?.landing ?? guest.object.position;
      const radius = guest.knockdown?.footprint ?? guest.radius;
      const point = new Vector3(from.x - center.x, 0, from.z - center.z).normalize()
        .multiplyScalar(radius - .035).add(center);
      point.y = (guest.knockdown ? guest.pivot : guest.object).localToWorld(guest.aim.clone()).y;
      return point;
    },
    intersect(raycaster, id) {
      if (!group.visible) return null;
      const candidates = id ? [inactiveTarget(id)].filter(Boolean) : guests.values();
      let nearest = null;
      for (const guest of candidates) {
        if (guest.id === controlled) continue;
        guest.pivot.updateWorldMatrix(true, false);
        for (const hitbox of guest.colliders) hitbox.updateWorldMatrix(false, false);
        const [hit] = raycaster.intersectObjects(guest.colliders, false);
        if (hit && (!nearest || hit.distance < nearest.distance)) nearest = hit;
      }
      return nearest;
    },
    greet(id) {
      const guest = inactiveTarget(id);
      if (guest && !guest.reaction && !guest.knockdown) guest.greet();
    },
    hit(id, skill, direction) {
      const guest = inactiveTarget(id);
      if (!group.visible || !guest) return null;
      guest.hits++;
      guest.lastHit = skill;
      if (guest.knockdown) return `${guest.name} 还在爬起来。`;
      const wasPushed = !!guest.reaction?.push;
      if (skill === 'tackle' || skill === 'basketball') {
        knockDown(guest, direction);
        return skill === 'basketball' ? `篮球命中，${guest.name} 倒地了！` : `${guest.name} 被撞倒了！`;
      }
      const pushDirection = direction.clone().setY(0).normalize();
      const impulse = pushDirection.clone().applyAxisAngle(up, -guest.object.rotation.y);
      guest.idle();
      const push = skill === 'iron' ? knockBack(guest, pushDirection) : null;
      guest.reaction = { age: 0, profile: reactions[skill], impulse, push };
      if (wasPushed || push) syncColliders();
      if (skill === 'iron' && !push) return `${guest.name} 挡住了冲势！`;
      return `${guest.name} ${reactions[skill].message}`;
    },
    update(delta) {
      let footprintChanged = false;
      for (const guest of guests.values()) {
        if (guest.id === controlled) continue;
        if (guest.knockdown) {
          const { motion, landing } = guest.knockdown;
          if (!motion.update(guest.pivot, delta)) {
            guest.knockdownRig?.reset();
            guest.object.position.copy(landing);
            guest.pivot.position.set(0, 0, 0);
            guest.pivot.quaternion.identity();
            guest.pivot.scale.setScalar(1);
            guest.knockdown = null;
            guest.idle();
            guest.mixer.update(0);
            footprintChanged = true;
          }
          continue;
        }
        guest.mixer.update(delta);
        const reaction = guest.reaction;
        if (!reaction) continue;
        const { profile, impulse } = reaction;
        reaction.age += delta;
        if (reaction.push) {
          const travel = Math.min(1, reaction.age / pushDuration);
          guest.object.position.lerpVectors(reaction.push.start, reaction.push.end, 1 - (1 - travel) ** 2);
          if (travel === 1) { reaction.push = null; footprintChanged = true; }
        }
        const t = Math.min(1, reaction.age / profile.duration);
        const spring = Math.sin(Math.PI * t) * (1 - t);
        const shake = Math.sin(Math.PI * 3 * t) * (1 - t);
        const push = t < 1 ? spring * 1.9 : 0;
        const tilt = t < 1 ? profile.tilt * shake : 0;
        guest.pivot.position.copy(impulse).multiplyScalar(profile.slide * push);
        guest.pivot.position.y = profile.hop * push;
        guest.pivot.rotation.set(impulse.z * tilt, 0, -impulse.x * tilt);
        if (t === 1) guest.reaction = null;
      }
      if (footprintChanged) syncColliders();
    },
    debug() {
      return { visible: group.visible, visitors: [...guests.values()].filter(guest => guest.id !== playerId).map(guest => ({
        id: guest.id, targetId: guest.targetId, position: (guest.id === controlled ? actor.position : guest.object.position).toArray(), radius: guest.radius, action: guest.action,
        hits: guest.hits, lastHit: guest.lastHit, reacting: !!(guest.reaction || guest.knockdown),
        knockdown: guest.knockdown?.motion.phase ?? null,
        tilt: 2 * Math.acos(Math.min(1, Math.abs(guest.pivot.quaternion.w))),
      })) };
    },
  };
}
