import {
  BoxGeometry, CapsuleGeometry, CatmullRomCurve3, ExtrudeGeometry, Group, MathUtils,
  Mesh, MeshBasicMaterial, MeshToonMaterial, Shape, ShapeGeometry, TubeGeometry, Vector3,
} from 'three';
import { createDawnRapEffects } from './dawn-rap-effects.js';

const tau = 2 * Math.PI;
const bass = [55, 55, 65.4, 49, 55, 55, 73.4, 65.4];
const rhythm = {
  start: .5, interval: .5, count: bass.length,
  vocals: [
    { time: .54, length: .21, pitch: 234, word: 'YO!', side: 1 },
    { time: 1.27, length: .17, pitch: 208, word: 'HEY!', side: -1 },
    { time: 1.53, length: .20, pitch: 255, word: 'YO!', side: 1 },
    { time: 2.55, length: .19, pitch: 246, word: 'YO!', side: -1 },
    { time: 3.28, length: .17, pitch: 220, word: 'HEY!', side: 1 },
    { time: 3.55, length: .23, pitch: 268, word: 'YO!', side: -1 },
  ],
};

function createGlasses() {
  const glasses = new Group();
  glasses.name = 'Dawn rap sunglasses';
  glasses.visible = false;
  const material = color => new MeshBasicMaterial({ color, toneMapped: false });
  const frame = material('#191823');
  const tint = material('#33334a');
  const reflection = material('#7e83a6');
  for (const entry of [frame, tint, reflection]) entry.userData.outlineParameters = { visible: false };
  const shape = new Shape();
  shape.moveTo(-.084, .064);
  shape.quadraticCurveTo(-.099, .064, -.096, .044);
  shape.lineTo(-.078, -.044);
  shape.quadraticCurveTo(-.074, -.067, -.047, -.067);
  shape.lineTo(.047, -.067);
  shape.quadraticCurveTo(.074, -.067, .078, -.044);
  shape.lineTo(.096, .044);
  shape.quadraticCurveTo(.099, .064, .084, .064);
  shape.closePath();
  const rimGeometry = new ExtrudeGeometry(shape, { depth: .008, bevelEnabled: false, curveSegments: 8 });
  const lensGeometry = new ShapeGeometry(shape, 8);
  const stripe = new Shape();
  stripe.moveTo(-.052, .038);stripe.lineTo(-.026, .038);stripe.lineTo(.012, -.043);stripe.lineTo(-.012, -.043);stripe.closePath();
  const stripeGeometry = new ShapeGeometry(stripe);
  for (const sign of [-1, 1]) {
    const lens = new Group();
    lens.position.x = sign * .096;
    lens.rotation.y = sign * .17;
    lens.add(new Mesh(rimGeometry, frame));
    const glass = new Mesh(lensGeometry, tint);
    glass.position.z = .0084;
    glass.scale.set(.86, .81, 1);
    lens.add(glass);
    const shine = new Mesh(stripeGeometry, reflection);
    shine.position.set(.011, .001, .009);
    lens.add(shine);
    const temple = new CatmullRomCurve3([
      new Vector3(sign * .183, .042, -.007),
      new Vector3(sign * .208, .034, -.063),
      new Vector3(sign * .211, .024, -.129),
    ]);
    glasses.add(lens, new Mesh(new TubeGeometry(temple, 10, .006, 6, false), frame));
  }
  const bridge = new Mesh(new BoxGeometry(.041, .014, .012), frame);
  bridge.position.set(0, .025, .002);
  glasses.add(bridge);
  glasses.traverse(node => { if (node.isMesh) node.raycast = () => {}; });
  return glasses;
}

function makeBeat(audio, duration) {
  const rate = audio.sampleRate;
  const buffer = audio.createBuffer(1, Math.ceil(rate * duration), rate);
  const mix = buffer.getChannelData(0);
  let seed = 1749;
  function noise() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2147483648 - 1;
  }
  function add(start, length, sample) {
    const offset = Math.round(start * rate);
    const count = Math.min(mix.length - offset, Math.round(length * rate));
    for (let i = 0; i < count; i++) mix[offset + i] += sample(i / rate);
  }

  for (let i = 0; i < bass.length; i++) {
    const time = rhythm.start + i * rhythm.interval;
    if (i % 2 === 0) add(time, .23, t =>
      .32 * Math.sin(tau * (51 * t + 105 * (1 - Math.exp(-36 * t)) / 36)) * Math.exp(-17 * t));
    else add(time, .15, t => (.13 * noise() + .065 * Math.sin(tau * 182 * t)) * Math.exp(-29 * t));
    add(time + .023, .31, t =>
      .105 * Math.sin(tau * bass[i] * t) * Math.min(1, 60 * t) * Math.exp(-6 * t));
    for (const [offset, strength] of [[0, .048], [.25, .031]]) {
      let previous = 0;
      add(time + offset, .069, t => {
        const sample = noise();
        const tick = strength * (sample - previous) * Math.exp(-54 * t);
        previous = sample;
        return tick;
      });
    }
  }

  // Short pitched "yo" and "hey" syllables, shaped with two vowel formants.
  for (const { time, length, pitch, word } of rhythm.vocals) {
    const open = word === 'HEY!';
    add(time, length, t => {
      const blend = MathUtils.smoothstep(t, .012, length * .65);
      const first = MathUtils.lerp(290, open ? 585 : 455, blend);
      const second = MathUtils.lerp(open ? 1800 : 1550, open ? 1470 : 920, blend);
      const fundamental = pitch - 58 * t / length;
      const phase = tau * (pitch * t - 29 * t * t / length);
      let voice = 0;
      for (let i = 1; i <= 11; i++) {
        const frequency = fundamental * i;
        const weight = Math.exp(-(((frequency - first) / 165) ** 2))
          + .47 * Math.exp(-(((frequency - second) / 240) ** 2));
        voice += weight * Math.sin(i * phase) / Math.sqrt(i);
      }
      const envelope = Math.min(1, t / .024) * (1 - t / length) ** 1.6;
      return .135 * voice * envelope;
    });
  }
  return buffer;
}

export function createDawnRap(scene) {
  const effects = createDawnRapEffects(scene, rhythm);
  const glasses = createGlasses();
  const finger = new Mesh(new CapsuleGeometry(.075, .245, 4, 8), new MeshToonMaterial({ color: '#ffd574' }));
  finger.name = 'Dawn rap pointing finger';
  finger.raycast = () => {};
  let audio, beatTrack, source;
  let startedAt = 0, offset = 0;

  function stopSound() {
    if (!source) return;
    source.stop();
    source.disconnect();
    source = null;
  }

  function syncSound(time, duration, paused) {
    if (paused || !audio || audio.state !== 'running') {
      stopSound();
      return;
    }
    if (source && Math.abs(offset + audio.currentTime - startedAt - time) < .18) return;
    stopSound();
    beatTrack ??= makeBeat(audio, duration);
    source = audio.createBufferSource();
    source.buffer = beatTrack;
    source.connect(audio.destination);
    startedAt = audio.currentTime;
    offset = time;
    source.start(startedAt, time);
  }

  return {
    enableSound() {
      if (!globalThis.AudioContext) return;
      try { audio ??= new AudioContext(); } catch { return; }
      if (audio.state !== 'running') audio.resume().catch(() => {});
    },
    update(model, time, duration, paused, camera, viewportHeight) {
      const on = MathUtils.smoothstep(time, .13, .45);
      const off = MathUtils.smoothstep(time, 4.19, 4.54);
      glasses.visible = on > 0 && off < 1;
      if (glasses.visible) {
        const head = model.getObjectByName('Head');
        if (glasses.parent !== head) head.add(glasses);
        glasses.position.set(0, 1.66 + .66 * (1 - on) + .35 * off, 1.67 + .23 * (1 - on) + .18 * off);
        glasses.rotation.set(.19 * (1 - on) - .18 * off, 0, -.18 * (1 - on) + .19 * off);
        glasses.scale.setScalar((.79 + .21 * on - .19 * off) / .15);
      }
      const point = MathUtils.smoothstep(time, .36, .59) * (1 - MathUtils.smoothstep(time, 4.19, 4.52));
      finger.visible = point > 0;
      if (finger.visible) {
        const hand = model.getObjectByName('HandR');
        if (finger.parent !== hand) {
          const glove = model.getObjectByName('Sleeve_&_mittenL_3');
          if (glove) finger.material = glove.material;
          hand.add(finger);
        }
        finger.position.set(-.065, .32 + .18 * point, .025);
        finger.scale.y = point;
      }
      syncSound(time, duration, paused);
      effects.update(model, time, camera, viewportHeight);
    },
    hide() {
      glasses.visible = false;
      glasses.removeFromParent();
      finger.visible = false;
      finger.removeFromParent();
      stopSound();
      effects.hide();
    },
    debug: () => ({ glasses: glasses.visible, pointing: finger.visible, sound: !!source, effects: effects.debug() }),
  };
}
