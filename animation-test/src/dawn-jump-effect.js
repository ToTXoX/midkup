import { MathUtils, Sprite, SpriteMaterial, Vector3 } from 'three';
import { comicLettering } from './comic-texture.js';

export function createDawnJumpEffect(scene) {
  const lettering = new Sprite(new SpriteMaterial({
    map: comicLettering('太美'),
    transparent: true,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  }));
  lettering.name = 'Dawn jump lettering';
  lettering.visible = false;
  lettering.renderOrder = 6;
  scene.add(lettering);
  const cameraUp = new Vector3();
  const viewPoint = new Vector3();

  return {
    update(model, time, apex, camera, viewportHeight) {
      const age = time - apex;
      lettering.visible = age >= -.10 && age < .32;
      if (!lettering.visible) return;
      const { clamp, smoothstep } = MathUtils;
      const pop = smoothstep(age, -.10, -.01);
      const settle = smoothstep(age, -.01, .14);
      const fade = 1 - smoothstep(age, .16, .32);
      model.getObjectByName('Head').getWorldPosition(lettering.position);
      lettering.position.y += .45;
      camera.updateMatrixWorld();
      const depth = -viewPoint.copy(lettering.position).applyMatrix4(camera.matrixWorldInverse).z;
      const worldPerPixel = 2 * Math.max(depth, camera.near) / (camera.projectionMatrix.elements[5] * viewportHeight);
      const width = clamp(.66, 58 * worldPerPixel, 188 * worldPerPixel) * (.62 + .54 * pop - .16 * settle);
      cameraUp.setFromMatrixColumn(camera.matrixWorld, 1);
      lettering.position.addScaledVector(cameraUp, width * .21 + (4 + 5 * settle) * worldPerPixel);
      lettering.scale.set(width, width * .5, 1);
      lettering.material.opacity = smoothstep(age, -.10, -.045) * fade;
      lettering.material.rotation = -.12 + .075 * settle;
    },
    hide() { lettering.visible = false; },
    debug: () => lettering.visible ? lettering.position.toArray() : null,
  };
}
