import * as THREE from 'three';

const CAPACITY=16;
const WET_STEPS=5;
const APPEARANCE={
  grass:{color:new THREE.Color('#3b6a40'),opacity:.29,life:1.6},
  earth:{color:new THREE.Color('#98583e'),opacity:.53,life:2.2},
  wet:{color:new THREE.Color('#306f79'),opacity:.62,life:2.0},
};

function makePawTexture(){
  const canvas=document.createElement('canvas');
  canvas.width=32;canvas.height=32;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#ffffff';
  ctx.beginPath();
  ctx.moveTo(7,16);
  ctx.bezierCurveTo(4,11,8,7,12,11);
  ctx.bezierCurveTo(12,5,20,5,20,11);
  ctx.bezierCurveTo(24,7,28,11,25,16);
  ctx.bezierCurveTo(24,18,25,19,25,21);
  ctx.bezierCurveTo(25,28,7,28,7,21);
  ctx.bezierCurveTo(7,19,8,18,7,16);
  ctx.closePath();
  ctx.fill();
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}

export function createGardenFootprints({scene,actor,model,clips,sampleSurface,isWater}){
  const bones={LFoot:model.getObjectByName('LFoot'),RFoot:model.getObjectByName('RFoot')};
  const events=new Map(clips.filter(clip=>clip.name==='Walk'||clip.name==='Run').map(clip=>[
    clip.name,{duration:clip.duration,steps:clip.events.flatMap(event=>{
      const paw=event.feet?.find(name=>bones[name])??event.foot;
      return event.event==='step'&&bones[paw]?[{time:event.time,paw}]:[];
    })},
  ]));
  const lastPawPrint=new Map();
  const geometry=new THREE.PlaneGeometry(1,1);
  const timing=new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY*3),3);
  timing.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('instanceTiming',timing);
  const clock={value:0};
  const material=new THREE.MeshBasicMaterial({
    map:makePawTexture(),transparent:true,alphaTest:.008,depthWrite:false,
    polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2,toneMapped:false,
  });
  material.userData.outlineParameters={visible:false};
  material.onBeforeCompile=shader=>{
    shader.uniforms.footprintClock=clock;
    shader.vertexShader=shader.vertexShader
      .replace('#include <common>','#include <common>\nattribute vec3 instanceTiming; uniform float footprintClock; varying float vPrintOpacity;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nfloat age = max(0.0, footprintClock - instanceTiming.x);\nvPrintOpacity = instanceTiming.z * (1.0 - smoothstep(instanceTiming.y * 0.24, instanceTiming.y, age));');
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <common>','#include <common>\nvarying float vPrintOpacity;')
      .replace('#include <alphatest_fragment>','diffuseColor.a *= vPrintOpacity;\n#include <alphatest_fragment>');
  };
  const mesh=new THREE.InstancedMesh(geometry,material,CAPACITY);
  mesh.name='Garden paw prints';mesh.frustumCulled=false;mesh.visible=false;mesh.renderOrder=2;mesh.count=0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
  const pool=Array(CAPACITY).fill(null);
  const point=new THREE.Vector3(),forward=new THREE.Vector3(),tangent=new THREE.Vector3(),side=new THREE.Vector3();
  const matrix=new THREE.Matrix4(),size=new THREE.Vector3(.152,.172,1);
  let previousTime=0,previousAction=null,total=0,latestExpiry=0,wetUntil=0,wetSteps=0;

  function stamp(paw,groundHit){
    actor.getWorldDirection(forward).setY(0).normalize();
    bones[paw].getWorldPosition(point).addScaledVector(forward,.018);
    if(isWater(point))return;
    const last=lastPawPrint.get(paw);
    if(last&&Math.hypot(point.x-last.x,point.z-last.z)<.077)return;
    // Use the walker's existing ground ray, never cast another one for a print.
    const surface=sampleSurface(groundHit);
    if(!surface||surface.normal.y<.92)return;
    const wet=clock.value<wetUntil&&wetSteps>0;
    const style=APPEARANCE[wet?'wet':surface.kind];
    const {normal}=surface;
    tangent.copy(forward).addScaledVector(normal,-forward.dot(normal)).normalize();
    side.crossVectors(tangent,normal).normalize();
    const ground=groundHit.point;
    point.y=ground.y+(normal.x*(ground.x-point.x)+normal.z*(ground.z-point.z))/normal.y;
    point.addScaledVector(normal,.006);
    matrix.makeBasis(side,tangent,normal).scale(size).setPosition(point);
    const slot=total%CAPACITY;
    mesh.setMatrixAt(slot,matrix);mesh.setColorAt(slot,style.color);
    mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;
    const strength=wet?style.opacity*(.70+.30*wetSteps/WET_STEPS):style.opacity;
    if(wet)wetSteps--;
    timing.setXYZ(slot,clock.value,style.life,strength);timing.needsUpdate=true;
    pool[slot]={paw,kind:wet?'wet':surface.kind,point:point.toArray(),born:clock.value,life:style.life,strength};
    lastPawPrint.set(paw,point.clone());
    latestExpiry=Math.max(latestExpiry,clock.value+style.life);
    total++;mesh.count=Math.min(total,CAPACITY);mesh.visible=true;
  }

  function step({name,time,action,distance,groundHit}){
    const gait=events.get(name);
    if(!gait)return;
    if(action===previousAction&&distance>.001&&groundHit){
      const end=time<previousTime?time+gait.duration:time;
      if(end-previousTime>1e-7){
        for(const event of gait.steps){
          const contact=event.time<=previousTime?event.time+gait.duration:event.time;
          if(contact<=end+1e-7)stamp(event.paw,groundHit);
        }
      }
    }
    previousTime=time;previousAction=action;
  }
  function update(delta){
    clock.value+=delta;
    if(clock.value>=latestExpiry)mesh.visible=false;
  }
  return {
    update,step,
    stop(){previousAction=null;},
    wet(){wetSteps=WET_STEPS;wetUntil=clock.value+5;},
    reset(){
      pool.fill(null);mesh.visible=false;mesh.count=0;
      lastPawPrint.clear();total=0;previousAction=null;wetUntil=0;wetSteps=0;latestExpiry=0;clock.value=0;
    },
    debug:()=>({total,capacity:CAPACITY,wetTime:Math.max(0,wetUntil-clock.value),marks:pool.flatMap(print=>{
      if(!print)return [];
      const age=clock.value-print.born;
      if(age>=print.life)return [];
      return [{...print,age,opacity:print.strength*(1-THREE.MathUtils.smoothstep(age,print.life*.24,print.life))}];
    })}),
  };
}
