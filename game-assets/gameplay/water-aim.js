import * as THREE from 'three';

export const WATER_SPEED=13.5;
export const WATER_GRAVITY=20;
export const WATER_RANGE=4.4;

// Low ballistic arc, using the same launch speed and gravity as the visible jet.
export function solveWaterAim(origin,point){
  const offset=new THREE.Vector3().subVectors(point,origin);
  const range=Math.hypot(offset.x,offset.z),height=offset.y;
  const aimRange=Math.min(range,WATER_RANGE);
  const aimHeight=range>WATER_RANGE?-Math.max(0,origin.y):height;
  const speed2=WATER_SPEED**2;
  const discriminant=speed2**2-WATER_GRAVITY*(WATER_GRAVITY*aimRange**2+2*aimHeight*speed2);
  const reachable=range>.06&&range<=WATER_RANGE&&discriminant>=0;
  const angle=aimRange>.06&&discriminant>=0?Math.atan((speed2-Math.sqrt(discriminant))/(WATER_GRAVITY*aimRange)):
    THREE.MathUtils.clamp(Math.atan2(height,Math.max(range,.01))+.25,-.5,.65);
  const direction=new THREE.Vector3(offset.x,0,offset.z);
  if(range<.00001)direction.set(0,0,1);else direction.divideScalar(range);
  direction.multiplyScalar(Math.cos(angle));direction.y=Math.sin(angle);
  return {reachable,direction,angle,range,time:range/(WATER_SPEED*Math.cos(angle))};
}
