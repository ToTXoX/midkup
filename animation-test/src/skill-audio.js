const tau = 2 * Math.PI;

function tone(at, length, from, to, gain, options = {}) {
  return { at, length, from, to, gain, ...options };
}
function noise(at, length, low, high, gain, options = {}) {
  return { at, length, low, high, gain, ...options };
}

const sounds = {
  waterCharge: [
    noise(0, .26, 420, 1800, .11, { flutter: 29 }),
    tone(.015, .11, 275, 510, .10), tone(.075, .12, 420, 760, .11), tone(.145, .125, 570, 1080, .095),
  ],
  waterJet: [
    noise(0, .34, 750, 7300, .34, { attack: .021, release: .085, flutter: 31 }),
    noise(.008, .32, 270, 1900, .19, { attack: .028, release: .072, flutter: 45 }),
    tone(0, .145, 400, 930, .13, { decay: 16, harmonic: .2 }),
  ],
  waterSplash: [
    noise(0, .23, 420, 5100, .31, { decay: 12, flutter: 34 }),
    tone(.018, .13, 540, 238, .11), tone(.045, .11, 820, 310, .075), tone(.095, .11, 660, 416, .055),
  ],
  tackleGather: [
    noise(0, .135, 340, 2700, .16, { decay: 11 }),
    tone(.018, .125, 160, 91, .13, { decay: 9 }),
  ],
  tackleRush: [
    noise(0, .23, 380, 3800, .30, { attack: .035, release: .13 }),
    tone(.012, .17, 190, 470, .105, { attack: .025, decay: 7 }),
  ],
  bodyHit: [
    tone(0, .17, 138, 52, .31, { decay: 13, harmonic: .24 }),
    noise(0, .15, 180, 2550, .22, { decay: 15 }),
  ],
  targetHit: [
    tone(0, .16, 193, 92, .27, { decay: 15, harmonic: .22 }),
    tone(.004, .10, 690, 380, .11, { decay: 25 }),
    noise(0, .084, 540, 5400, .25, { decay: 25 }),
  ],
  landing: [
    tone(0, .135, 115, 59, .23, { decay: 16 }),
    noise(0, .112, 270, 2200, .20, { decay: 18 }),
    tone(.033, .12, 104, 57, .11, { decay: 16 }),
  ],
  skid: [
    noise(0, .205, 370, 3150, .20, { decay: 7, flutter: 43 }),
    tone(0, .105, 122, 61, .13, { decay: 17 }),
  ],
  ironPulse: [
    tone(0, .152, 111, 45, .27, { decay: 15, harmonic: .19 }),
    noise(.005, .082, 460, 1750, .12, { decay: 19 }),
  ],
  ironRush: [
    noise(0, .22, 200, 4400, .37, { attack: .035, release: .145 }),
    tone(.006, .22, 110, 46, .23, { attack: .021, decay: 8, harmonic: .21 }),
    tone(.028, .135, 215, 620, .13, { decay: 7 }),
  ],
  ironHit: [
    tone(0, .25, 119, 37, .44, { decay: 10, harmonic: .25 }),
    noise(.002, .19, 260, 4400, .32, { decay: 15 }),
    tone(.023, .19, 284, 85, .16, { decay: 14 }),
  ],
  mudScrape: [
    noise(0, .16, 380, 3800, .27, { attack: .013, flutter: 41 }),
    tone(.036, .13, 135, 76, .10, { decay: 8 }),
  ],
  mudThrow: [
    noise(0, .17, 240, 2800, .24, { attack: .024, release: .081, flutter: 32 }),
    tone(.017, .14, 228, 560, .14, { decay: 10, harmonic: .28 }),
  ],
  mudSplat: [
    noise(0, .19, 160, 2260, .36, { decay: 13, flutter: 48 }),
    tone(0, .14, 184, 61, .25, { decay: 15, harmonic: .25 }),
    tone(.043, .12, 455, 208, .083, { decay: 15 }),
  ],
  ballBounce: [
    tone(0, .145, 143, 86, .29, { decay: 19, harmonic: .30 }),
    tone(.003, .10, 422, 292, .14, { decay: 26 }),
    noise(0, .064, 660, 3800, .15, { decay: 28 }),
  ],
  ballCatch: [
    noise(0, .103, 420, 3100, .13, { decay: 19 }),
    tone(0, .093, 159, 112, .17, { decay: 19 }),
  ],
  ballThrow: [
    noise(0, .20, 520, 4900, .25, { attack: .027, release: .13 }),
    tone(.022, .17, 330, 710, .095, { attack: .021, decay: 9 }),
  ],
  ballImpact: [
    tone(0, .20, 184, 69, .33, { decay: 14, harmonic: .27 }),
    tone(.008, .10, 615, 272, .14, { decay: 22 }),
    noise(.003, .115, 550, 4500, .19, { decay: 16 }),
  ],
  jumpLift: [
    tone(0, .26, 185, 650, .24, { attack: .018, decay: 5, harmonic: .22, flutter: 19 }),
    noise(0, .17, 440, 4200, .17, { attack: .025, release: .095 }),
    tone(.088, .15, 415, 915, .085, { decay: 8 }),
  ],
  jumpChime: [
    tone(0, .24, 880, 880, .16, { decay: 10, harmonic: .16 }),
    tone(.041, .24, 1319, 1319, .13, { decay: 11 }),
    tone(.088, .24, 1760, 1760, .10, { decay: 13 }),
  ],
  danceStep: [
    tone(0, .127, 216, 108, .19, { decay: 16 }),
    noise(.009, .083, 800, 4600, .15, { decay: 22 }),
  ],
  danceNote: [
    tone(0, .18, 523, 523, .21, { decay: 10, harmonic: .15 }),
    tone(.026, .14, 784, 784, .085, { decay: 13 }),
  ],
  rapGlasses: [
    noise(0, .105, 520, 5400, .20, { decay: 17 }),
    tone(.022, .095, 772, 565, .13, { decay: 20 }),
  ],
};

function renderSound(context, layers) {
  const rate = context.sampleRate;
  const length = Math.max(...layers.map(layer => layer.at + layer.length));
  const buffer = context.createBuffer(1, Math.ceil(rate * length), rate);
  const samples = buffer.getChannelData(0);
  let seed = 0x729a;
  for (const layer of layers) {
    const { at, length, from, to, gain, low = 0, high = 0, attack = .006, release = .045, decay = 8, harmonic = 0, flutter = 0 } = layer;
    const offset = Math.round(at * rate);
    const frames = Math.min(samples.length - offset, Math.round(length * rate));
    const lowFilter = 1 - Math.exp(-tau * low / rate);
    const highFilter = 1 - Math.exp(-tau * high / rate);
    let phase = 0, belowLow = 0, belowHigh = 0;
    for (let i = 0; i < frames; i++) {
      const time = i / rate;
      const fade = Math.min(1, time / attack, (length - time) / release);
      let signal;
      if (from === undefined) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const white = seed / 2147483648 - 1;
        belowLow += (white - belowLow) * lowFilter;
        belowHigh += (white - belowHigh) * highFilter;
        signal = belowHigh - belowLow;
      } else {
        phase += tau * from * (to / from) ** (time / length) / rate;
        signal = Math.sin(phase) + harmonic * Math.sin(2 * phase);
      }
      const tremolo = flutter ? .78 + .22 * Math.sin(tau * flutter * time) : 1;
      samples[offset + i] += signal * gain * fade * Math.exp(-decay * time) * tremolo;
    }
  }
  return buffer;
}

export function createSkillAudio() {
  const buffers = new Map();
  const playing = new Map();
  let context, output, paused = false;

  function enable() {
    const Audio = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Audio || navigator.userActivation?.hasBeenActive === false) return;
    if (!context) {
      try { context = new Audio(); } catch { return; }
      output = context.createDynamicsCompressor();
      output.threshold.value = -11;
      output.ratio.value = 4;
      const master = context.createGain();
      master.gain.value = .78;
      output.connect(master);
      master.connect(context.destination);
    }
    if (context.state !== 'running') context.resume().catch(() => {});
  }

  function stop(scope) {
    for (const [source, event] of playing) {
      if (scope && event.scope !== scope) continue;
      source.stop();
      event.cleanUp();
    }
  }

  return {
    enable, stop,
    get context() { return context; },
    get output() { return output; },
    setPaused(value) {
      paused = value;
      if (paused) stop();
    },
    play(name, { rate = 1, volume = 1, scope = 'skill' } = {}) {
      if (paused || !context) return;
      if (!buffers.has(name)) buffers.set(name, renderSound(context, sounds[name]));
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffers.get(name);
      source.playbackRate.value = rate;
      gain.gain.value = volume;
      source.connect(gain);
      gain.connect(output);
      function cleanUp() {
        source.onended = null;
        source.disconnect();
        gain.disconnect();
        playing.delete(source);
      }
      source.onended = cleanUp;
      playing.set(source, { name, scope, cleanUp });
      source.start();
    },
    debug: () => [...playing.values()].map(event => event.name),
  };
}
