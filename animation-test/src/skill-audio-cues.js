import { basketballSoundCues } from './garden-basketball.js';
import { ironShoulderSoundCues } from './garden-iron-shoulder.js';

const cue = (time, sound, options) => ({ time, sound, ...options });
const rhythm = (times, sound, pitches, volume) =>
  times.map((time, i) => cue(time, sound, { rate: pitches[i % pitches.length], volume }));

function getCues(clip) {
  const event = name => clip.events?.find(marker => marker.event === name)?.time;
  switch (clip.name) {
    case 'WaterCharge':
      return [cue(.07, 'waterCharge')];
    case 'WaterShoot':
      return [cue(.04, 'waterCharge'), cue(event('water_start'), 'waterJet')];
    case 'Basketball':
      return basketballSoundCues;
    case 'IronShoulder':
      return ironShoulderSoundCues;
    case 'Jump':
      return [
        cue(.105, 'tackleGather', { volume: .49, rate: 1.31 }),
        cue(event('jump_takeoff'), 'jumpLift'),
        cue(event('jump_apex'), 'jumpChime'),
        cue(event('jump_land'), 'landing', { volume: .77 }),
      ];
    case 'Rap':
      return [cue(.43, 'rapGlasses', { volume: .75 }), cue(4.40, 'rapGlasses', { volume: .61, rate: 1.21 })];
    case 'DanceA':
      return [
        ...rhythm([.10, .57, 1.07, 1.57, 2.07, 2.57, 3.06], 'danceStep', [1, 1.19, .95, 1.34], .68),
        ...rhythm([.12, 1.10, 2.10, 3.01], 'danceNote', [1, 1.12, 1.26, 1.50], .55),
        cue(event('jump_start'), 'jumpLift', { volume: .63, rate: 1.19 }),
        cue(event('land'), 'landing', { volume: .69 }),
      ];
    case 'DanceB':
      return [
        ...rhythm([.10, .47, .84, 1.61, 1.99, 2.39, 2.74], 'danceStep', [1.10, .97], .64),
        ...rhythm([.14, .50, .90, event('curious_hold'), event('dance_resume'), 2.05, 2.49],
          'danceNote', [1.12, 1.34, 1, 1.68, 1.26, 1.50, 1.12], .58),
      ];
    case 'DanceC':
      return [
        ...rhythm(clip.events.filter(marker => marker.event === 'step').filter((_, i) => i % 2 === 0).map(marker => marker.time),
          'danceStep', [.94, 1.20, 1.42], .51),
        ...rhythm([.33, .98, 1.55, 2.10, 2.70, 3.25], 'danceNote', [1, 1.26, 1.50, 1.26, 1.50, 1.68], .58),
        cue(event('jump_start'), 'jumpLift', { volume: .74, rate: 1.14 }),
        cue(event('land'), 'landing', { volume: .78 }),
        cue(4.06, 'jumpChime', { volume: .69, rate: 1.12 }),
      ];
    default:
      return [];
  }
}

export function createSkillAudioCues(audio) {
  let cues = [], previous = -1;

  return {
    setClip(clip, completed) {
      if (!completed) audio.stop('clip');
      cues = getCues(clip).filter(event => Number.isFinite(event.time)).sort((a, b) => a.time - b.time);
      previous = -1;
    },
    seek(time) { previous = time; },
    update(time, speed = 1) {
      if (time < previous) previous = -1;
      for (const { time: when, sound, rate = 1, volume } of cues) {
        if (when > previous && when <= time) audio.play(sound, { rate: rate * speed, volume, scope: 'clip' });
      }
      previous = time;
    },
    get active() { return cues.length > 0; },
  };
}
