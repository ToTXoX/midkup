import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const {smoothstep}=THREE.MathUtils;
const BREEZE_INTERVAL=5.6;
const SWAY_DURATION=1.24;
const IDLE_SHINE=.035;

function makeHook(){
  const parts=[
    new THREE.CylinderGeometry(.025,.022,.014,12).translate(0,-.003,0),
    new THREE.TorusGeometry(.015,.0045,6,14).translate(0,-.024,0),
  ];
  const geometry=mergeGeometries(parts);
  for(const part of parts)part.dispose();
  return new THREE.Mesh(geometry,new THREE.MeshToonMaterial({color:'#8f6840'}));
}

function tintVertices(geometry,paint){
  const positions=geometry.attributes.position;
  const colors=new Float32Array(positions.count*3);
  const point=new THREE.Vector3(),color=new THREE.Color();
  for(let i=0;i<positions.count;i++){
    paint(point.fromBufferAttribute(positions,i),color);
    color.toArray(colors,i*3);
  }
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  return geometry;
}

function makeCeramicBell(){
  const profile=[
    [0,-.221],[.056,-.231],[.083,-.267],[.093,-.301],[.105,-.308],[.113,-.303],
    [.116,-.293],[.117,-.281],[.116,-.270],[.112,-.246],[.101,-.217],[.083,-.186],
    [.058,-.155],[.034,-.137],[.015,-.131],[0,-.13],
  ].map(([radius,height])=>new THREE.Vector2(radius,height));
  const clay=new THREE.Color('#d9be93'),ivory=new THREE.Color('#fff5dd'),ink=new THREE.Color('#5d8084');
  const geometry=tintVertices(new THREE.LatheGeometry(profile,32),({y},color)=>{
    const band=smoothstep(y,-.307,-.296)*(1-smoothstep(y,-.283,-.271));
    color.copy(clay).lerp(ivory,smoothstep(y,-.303,-.160)).lerp(ink,.89*band);
  });
  return new THREE.Mesh(geometry,new THREE.MeshToonMaterial({vertexColors:true,emissive:'#ffe1aa',emissiveIntensity:IDLE_SHINE}));
}

function makePaper(){
  const coral=new THREE.Color('#c87966'),peach=new THREE.Color('#efa990'),ivory=new THREE.Color('#fff0d8');
  const geometry=tintVertices(new THREE.PlaneGeometry(.103,.249,4,12),({x,y},color)=>{
    const trim=smoothstep(-y,.075,.091)*(1-smoothstep(-y,.102,.116));
    color.copy(coral).lerp(peach,.46+.24*smoothstep(y,-.10,.11)-.22*smoothstep(x,-.018,.04)).lerp(ivory,.88*trim);
  });
  const points=geometry.attributes.position;
  for(let i=0;i<points.count;i++){
    const x=points.getX(i),y=points.getY(i);
    const tip=1-smoothstep(y,-.123,.085);
    points.setXYZ(i,x*(1-.17*tip),y+tip*.012*smoothstep(Math.abs(x),.032,.0515),.026*tip+.007*Math.abs(x)/.052);
  }
  geometry.computeVertexNormals();
  geometry.translate(0,-.232,0);
  return new THREE.Mesh(geometry,new THREE.MeshToonMaterial({vertexColors:true,side:THREE.DoubleSide}));
}

function makeGlint(){
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=64;
  const ctx=canvas.getContext('2d');
  ctx.beginPath();
  for(const [x,y] of [[32,3],[38,24],[58,32],[38,40],[32,61],[26,40],[6,32],[26,24]])ctx.lineTo(x,y);
  ctx.closePath();
  ctx.lineWidth=3;ctx.lineJoin='round';ctx.strokeStyle='#d6a85a';ctx.stroke();
  ctx.fillStyle='#fff9da';ctx.fill();
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  const glint=new THREE.Sprite(new THREE.SpriteMaterial({map,transparent:true,depthWrite:false,toneMapped:false}));
  glint.position.set(.105,-.219,.082);
  return glint;
}

export function createGardenWindChime(cottage){
  if(!cottage)return null;
  const front=cottage.max[2];
  const object=new THREE.Group();
  object.name='Cottage window wind chime';
  object.position.set(cottage.max[0]-.025,cottage.max[1]-.09,front+.321);
  const pivot=new THREE.Group();pivot.position.y=-.039;
  const bell=makeCeramicBell(),glint=makeGlint(),paper=makePaper();
  const threadMaterial=new THREE.MeshToonMaterial({color:'#7c5b47'});
  const cord=new THREE.Mesh(new THREE.CylinderGeometry(.006,.006,.137,6).translate(0,-.0685,0),threadMaterial);
  const hanger=new THREE.Group();hanger.position.y=-.261;
  const lowerCord=new THREE.Mesh(new THREE.CylinderGeometry(.0045,.0045,.118,6).translate(0,-.059,0),threadMaterial);
  const clapper=new THREE.Mesh(new THREE.SphereGeometry(.021,10,6).scale(.77,1,.77).translate(0,-.057,0),threadMaterial);
  hanger.add(lowerCord,clapper,paper);
  pivot.add(cord,bell,hanger,glint);
  object.add(makeHook(),pivot);
  // The hanging decoration should not intercept movement or the water gun.
  object.traverse(child=>{child.raycast=()=>{};});

  let time,age,nextBreeze,near,pendingApproach,strength,cause,plays;
  function reset(){
    time=0;age=SWAY_DURATION;nextBreeze=1.95;near=false;pendingApproach=false;strength=0;cause=null;plays=0;
    pivot.rotation.set(0,0,0);hanger.rotation.set(0,0,0);paper.rotation.y=-.12;
    bell.material.emissiveIntensity=IDLE_SHINE;glint.visible=false;
  }
  function update(delta,actor){
    if(delta<=0)return;
    time+=delta;
    const distance=Math.hypot(actor.x-object.position.x,actor.z-front-.45);
    const inFront=actor.z>front+.30;
    const isNear=inFront&&distance<(near?1.24:.99);
    const approached=isNear&&!near;
    near=isNear;
    if(approached){
      nextBreeze=time+BREEZE_INTERVAL;
      // Use the upcoming flash, or wait for the previous swing to settle.
      if(age<=.55){strength=1;cause='approach';}
      else pendingApproach=true;
    }
    if(!near)pendingApproach=false;
    if(age>=SWAY_DURATION){
      if(!pendingApproach&&time<nextBreeze)return;
      age=0;plays++;
      strength=pendingApproach?1:.78;
      cause=pendingApproach?'approach':'breeze';
      pendingApproach=false;
      nextBreeze=time+BREEZE_INTERVAL;
    }
    age=Math.min(SWAY_DURATION,age+delta);
    const fade=1-smoothstep(age,.21,SWAY_DURATION);
    pivot.rotation.z=.25*strength*Math.sin(age*11.1)*fade;
    pivot.rotation.x=.072*strength*Math.sin(age*9.4)*fade;
    hanger.rotation.z=.29*strength*Math.sin(age*11.1-.72)*fade*smoothstep(age,0,.14);
    paper.rotation.y=-.12+.25*Math.sin(age*10.1)*fade;

    const flash=smoothstep(age,.40,.53)*(1-smoothstep(age,.59,.85));
    glint.visible=flash>.002;
    glint.material.opacity=flash*strength;
    glint.scale.setScalar(.058+flash*.118);
    bell.material.emissiveIntensity=IDLE_SHINE+.32*flash*strength;
  }

  reset();
  return {object,reset,update,debug:()=>({
    anchor:object.position.clone().add(pivot.position).toArray(),age,cause,plays,near,
    sway:pivot.rotation.z,glint:glint.visible,shine:bell.material.emissiveIntensity,
  })};
}
