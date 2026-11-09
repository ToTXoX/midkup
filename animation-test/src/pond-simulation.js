import * as THREE from 'three';
import {waveFragment,normalFragment,dropFragment,compoundFragment} from './vendor/water-reference.js';

// Adaptation of Evan Wallace / Yong Su's MIT heightfield pipeline. The original
// shader strings are retained in vendor/, including the upstream license.
export function createPondSimulation(renderer,{center,radii,size=96}){
  const options={type:THREE.HalfFloatType,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:false,stencilBuffer:false};
  let read=new THREE.WebGLRenderTarget(size,size,options),write=read.clone();
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1),scene=new THREE.Scene();
  const vertexShader='varying vec2 coord;void main(){coord=uv;gl_Position=vec4(position.xy,0.,1.);}';
  const common=()=>({tInput:{value:null},poolWidth:{value:radii[0]},poolLength:{value:radii[1]},delta:{value:new THREE.Vector2(1/size,1/size)}});
  // Physical time is fixed at 120 Hz; adapt the rectangular demo to a small
  // elliptical shore with an absorbing bank and a bounded displacement.
  const updateSource=waveFragment.replace('info.g += 0.5 * stabilityScale','info.g += '+(.5*(size/96)**2).toFixed(6)+' * stabilityScale')
    .replace('info.g *= 0.995;','info.g *= 0.982;')
    .replace('gl_FragColor = info;',`float shore=1.-smoothstep(.82,1.,length(coord*2.-1.));
      info.r=clamp(info.r,-.012,.012);info.rg*=shore;gl_FragColor=info;`);
  const materials={
    step:new THREE.ShaderMaterial({vertexShader,fragmentShader:updateSource,uniforms:common()}),
    normal:new THREE.ShaderMaterial({vertexShader,fragmentShader:normalFragment,uniforms:common()}),
    drop:new THREE.ShaderMaterial({vertexShader,fragmentShader:dropFragment,uniforms:{...common(),center:{value:new THREE.Vector2()},radius:{value:.04},strength:{value:.008}}}),
    move:new THREE.ShaderMaterial({vertexShader,fragmentShader:compoundFragment.replaceAll('[120]','[6]').replace('i < 120','i < 6'),uniforms:{...common(),oldCenters:{value:Array.from({length:6},()=>new THREE.Vector3())},newCenters:{value:Array.from({length:6},()=>new THREE.Vector3())},radii:{value:[.28,.28,.085,.085,.08,.08]},sphereCount:{value:6},displacementScale:{value:.055}}}),
  };
  const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),materials.step);scene.add(quad);
  let accumulator=0,steps=0,displacements=0,hasPrevious=false;
  const previousPoints=Array.from({length:6},()=>new THREE.Vector3()),interpolated=previousPoints.map(()=>new THREE.Vector3());
  function pass(material){
    material.uniforms.tInput.value=read.texture;quad.material=material;
    const target=renderer.getRenderTarget(),autoClear=renderer.autoClear;
    renderer.autoClear=true;renderer.setRenderTarget(write);renderer.render(scene,camera);renderer.setRenderTarget(target);renderer.autoClear=autoClear;
    [read,write]=[write,read];
  }
  function clear(){
    const target=renderer.getRenderTarget(),color=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha();
    renderer.setClearColor(0,0);for(const rt of [read,write]){renderer.setRenderTarget(rt);renderer.clear();}
    renderer.setRenderTarget(target);renderer.setClearColor(color,alpha);accumulator=0;hasPrevious=false;
  }
  clear();
  function move(points){
    const u=materials.move.uniforms;let moved=false;
    points.slice(0,6).forEach((p,i)=>{
      u.oldCenters.value[i].copy(u.newCenters.value[i]);u.newCenters.value[i].set(p.x-center[0],p.y,p.z-center[1]);
      if(u.newCenters.value[i].distanceToSquared(u.oldCenters.value[i])>1e-8)moved=true;
    });
    if(hasPrevious&&moved){pass(materials.move);displacements++;}hasPrevious=true;
  }
  function drop(point,strength=.008,radius=.10){
    const u=materials.drop.uniforms;u.center.value.set((point.x-center[0])/radii[0],(point.z-center[1])/radii[1]);
    u.strength.value=strength;u.radius.value=radius/(2*radii[1]);pass(materials.drop);
  }
  function update(delta,points){
    if(delta<=0)return;
    accumulator+=Math.min(delta,.1);
    const count=Math.floor((accumulator+1e-8)*120),hadPrevious=hasPrevious;
    if(points&&!hadPrevious){points.forEach((p,i)=>previousPoints[i].copy(p));move(points);}
    if(!points)hasPrevious=false;
    for(let i=1;i<=count;i++){
      // Sweep moving volumes through every fixed step, even on slow frames.
      // This prevents frame-sized footprints and keeps wakes consistent at 30/60 Hz.
      if(points){points.forEach((p,j)=>interpolated[j].lerpVectors(previousPoints[j],p,i/count));move(interpolated);}
      pass(materials.step);steps++;accumulator-=1/120;
    }
    if(points)points.forEach((p,i)=>previousPoints[i].copy(p));
    pass(materials.normal);
  }
  // Only used by QA; ordinary rendering never reads GPU pixels back to the CPU.
  function sample(){
    const data=new Uint16Array(size*size*4);renderer.readRenderTargetPixels(read,0,0,size,size,data);
    let peak=0,energy=0,active=0;for(let i=0;i<data.length;i+=4){const h=THREE.DataUtils.fromHalfFloat(data[i]);peak=Math.max(peak,Math.abs(h));energy+=h*h;if(Math.abs(h)>.00002)active++;}
    return {peak,energy,active,finite:Number.isFinite(energy)};
  }
  return {update,drop,reset:clear,get texture(){return read.texture;},sample,debug:()=>({size,steps,displacements,renderTargets:2,method:'heightfield-ping-pong',fixedStep:1/120})};
}
