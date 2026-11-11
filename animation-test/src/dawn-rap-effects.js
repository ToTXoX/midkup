import { MathUtils, Sprite, SpriteMaterial, Vector3 } from 'three';
import { paintComicTexture } from './comic-texture.js';

const ink = '#252137';
const { clamp, smoothstep } = MathUtils;

function wordTexture(word, fill, accent) {
  return paintComicTexture(256, 128, ctx => {
    const outline = [[12, 62], [35, 48], [27, 22], [75, 30], [96, 13], [121, 24],
      [170, 13], [181, 27], [229, 22], [219, 45], [242, 56], [226, 72], [229, 96],
      [198, 91], [170, 111], [148, 101], [83, 112], [74, 98], [24, 101], [37, 79]];
    function burst(x, y, color) {
      ctx.beginPath();
      outline.forEach(([px, py], i) => {
        if (i === 0) ctx.moveTo(px + x, py + y);
        else ctx.lineTo(px + x, py + y);
      });
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.stroke();
    }
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = ink;
    burst(4, 5, accent);
    burst(0, 0, fill);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'italic 900 68px "Arial Black", system-ui, sans-serif';
    ctx.lineWidth = 9;
    ctx.strokeText(word, 129, 66, 186);
    ctx.fillStyle = accent;
    ctx.fillText(word, 129, 66, 186);
    ctx.lineWidth = 6;
    ctx.strokeText(word, 126, 62, 186);
    ctx.fillStyle = '#fff9ed';
    ctx.fillText(word, 126, 62, 186);
  });
}

function noteTexture(color) {
  return paintComicTexture(96, 96, ctx => {
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = ink;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(43, 58);
    ctx.lineTo(43, 24);
    ctx.lineTo(76, 15);
    ctx.lineTo(76, 51);
    ctx.bezierCurveTo(76, 70, 48, 70, 51, 56);
    ctx.bezierCurveTo(53, 50, 59, 47, 66, 47);
    ctx.lineTo(66, 31);
    ctx.lineTo(53, 35);
    ctx.lineTo(53, 63);
    ctx.bezierCurveTo(53, 82, 25, 83, 28, 69);
    ctx.bezierCurveTo(29, 62, 36, 58, 43, 58);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff0af';
    ctx.beginPath();
    ctx.moveTo(18, 20);
    ctx.lineTo(22, 29);
    ctx.lineTo(31, 33);
    ctx.lineTo(22, 37);
    ctx.lineTo(18, 46);
    ctx.lineTo(14, 37);
    ctx.lineTo(5, 33);
    ctx.lineTo(14, 29);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });
}

export function createDawnRapEffects(scene, { start, interval, count, vocals }) {
  const wordMaps = {
    'YO!': wordTexture('YO!', '#bceee9', '#577fc3'),
    'HEY!': wordTexture('HEY!', '#efd9fc', '#a674cd'),
  };
  function makeSprite(name, map, renderOrder) {
    const sprite = new Sprite(new SpriteMaterial({ map, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
    sprite.name = name;
    sprite.visible = false;
    sprite.renderOrder = renderOrder;
    sprite.raycast = () => {};
    scene.add(sprite);
    return sprite;
  }
  const words = [-1, 1].map(side => ({ side, sprite: makeSprite('Dawn rap comic word', wordMaps['YO!'], 7), label: null }));
  const notes = [noteTexture('#81e1e7'), noteTexture('#dbadff')].map(map => makeSprite('Dawn rap music notes', map, 6));
  const anchor = new Vector3(), cameraRight = new Vector3(), cameraUp = new Vector3(), projected = new Vector3();
  let beatIndex = -1;

  function hide() {
    for (const word of words) {
      word.sprite.visible = false;
      word.label = null;
    }
    for (const note of notes) note.visible = false;
    beatIndex = -1;
  }

  function update(model, time, camera, viewportHeight) {
    hide();
    const index = Math.floor((time - start) / interval);
    if (index < 0 || index >= count) return;
    beatIndex = index;
    model.getObjectByName('Head').getWorldPosition(anchor);
    anchor.y += .30;
    camera.updateMatrixWorld();
    const depth = -projected.copy(anchor).applyMatrix4(camera.matrixWorldInverse).z;
    if (depth <= camera.near) return;
    const worldPerPixel = 2 * depth / (camera.projectionMatrix.elements[5] * viewportHeight);
    const viewportWidth = camera.aspect * viewportHeight;
    const screenX = (projected.copy(anchor).project(camera).x + 1) * viewportWidth * .5;
    cameraRight.setFromMatrixColumn(camera.matrixWorld, 0);
    cameraUp.setFromMatrixColumn(camera.matrixWorld, 1);

    function place(sprite, x, y, width, aspect) {
      const half = width * .5 + 8 * worldPerPixel;
      const offset = clamp(x, half - screenX * worldPerPixel, (viewportWidth - screenX) * worldPerPixel - half);
      sprite.position.copy(anchor).addScaledVector(cameraRight, offset).addScaledVector(cameraUp, y);
      sprite.scale.set(width, width * aspect, 1);
      sprite.visible = true;
    }

    const wordWidth = clamp(.56, 74 * worldPerPixel, 162 * worldPerPixel);
    for (const cue of vocals) {
      const age = time - cue.time;
      if (age < 0 || age >= .44) continue;
      const word = words[cue.side < 0 ? 0 : 1];
      const pop = smoothstep(age, 0, .065);
      const settle = smoothstep(age, .065, .20);
      const width = wordWidth * (.58 + .59 * pop - .17 * settle);
      word.label = cue.word;
      word.sprite.material.map = wordMaps[cue.word];
      word.sprite.material.opacity = smoothstep(age, 0, .035) * (1 - smoothstep(age, .26, .44));
      word.sprite.material.rotation = cue.side * (.16 - .07 * settle);
      place(word.sprite, cue.side * (.24 + (.48 + .12 * settle) * wordWidth), .05 + (.19 + .12 * settle) * wordWidth, width, .5);
    }

    const phase = (time - start - index * interval) / interval;
    const noteWidth = clamp(.19, 28 * worldPerPixel, 49 * worldPerPixel);
    notes.forEach((note, i) => {
      const age = phase - i * .20;
      if (age < 0 || age >= .9) return;
      const side = (i + index) % 2 ? 1 : -1;
      note.material.opacity = smoothstep(age, 0, .12) * (1 - smoothstep(age, .45, .9));
      note.material.rotation = side * (.20 - .29 * age);
      place(note, side * (.30 + (.6 + .8 * age) * noteWidth), -.11 + (.15 + .95 * age) * noteWidth,
        noteWidth * (i === 0 ? 1 : .78) * (.60 + .40 * smoothstep(age, 0, .15)), 1);
    });
  }

  return {
    update, hide,
    debug: () => ({ beat: beatIndex, words: words.flatMap(word => word.label ? [word.label] : []), notes: notes.filter(note => note.visible).length }),
  };
}
