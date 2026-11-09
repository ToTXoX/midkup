import * as THREE from 'three';
import assert from 'node:assert/strict';
import { createWaterGunEffect } from '../src/water-gun-effect.js';
for(const normal of [new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,-1)]){
  const scene=new THREE.Scene();
  const source=new THREE.Vector3(0,.35,0),forward=new THREE.Vector3(0,0,1);
  const fx=createWaterGunEffect({scene,resolveImpact:()=>({time:.27,point:new THREE.Vector3(0,0,1.3),normal})});
  fx.begin(source,forward);
  const mouthRotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.75);
  for(let t=0;t<1.6;t+=.017){
    fx.update(t,source,forward,mouthRotation);
    scene.updateMatrixWorld(true);
    scene.traverse((o)=>{
      if(!o.isMesh||!o.visible)return;
      assert(o.matrixWorld.elements.every(Number.isFinite));
      for(const attribute of Object.values(o.geometry.attributes))assert(attribute.array.every(Number.isFinite));
    });
  }
  const actual=new THREE.Vector3(0,1,0).applyQuaternion(scene.getObjectByName('Water impact').quaternion);
  assert(actual.dot(normal)>.9999,'impact crown must align with the actual surface normal');
  fx.begin(source,forward);fx.update(.45,source,forward,mouthRotation);
  const stream=scene.getObjectByName('White wave stream').geometry.attributes;
  const root=new THREE.Vector3().fromBufferAttribute(stream.position,0);
  const lipCenter=new THREE.Vector3(0,-.024,-.047).applyQuaternion(mouthRotation).add(source);
  assert(root.distanceTo(lipCenter)<.00001&&stream.aAperture.getX(0)===1,'the visible stream starts inside the lip plane');
  assert.deepEqual(fx.debug().launchOrigin,source.toArray(),'the visual lip fit must preserve the ballistic origin');
  fx.cancel();assert.equal(fx.debug().active,false);
  fx.begin(source,forward);fx.update(.65,source,forward);fx.finish();fx.updateTail(.2);
  assert(fx.debug().tail&&fx.debug().active,'natural action completion must keep the residual effect');
  fx.updateTail(2);assert.equal(fx.debug().active,false);
  fx.dispose();assert.equal(scene.children.length,0);
}
console.log('PASS finite geometry, ground and wall normals, tail lifetime, cancellation and disposal');
