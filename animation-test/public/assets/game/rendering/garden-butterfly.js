import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const {clamp,damp,smoothstep}=THREE.MathUtils;
const RISE=.54,ORBIT=1.72,LAND=.88,RETURN=1.15;
const RADIUS=.66;

function createFlowers(groundHeight,x,z){
  const parts=[];
  function add(geometry,hex){
    const color=new THREE.Color(hex);
    const colors=new Float32Array(geometry.attributes.position.count*3);
    for(let i=0;i<colors.length;i+=3)color.toArray(colors,i);
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    parts.push(geometry);
  }
  function addFlower(x,z,height,size,petals){
    const y=groundHeight(x,z)??0;
    const stem=new THREE.CylinderGeometry(.012,.016,height,6).translate(x,y+height/2,z);
    add(stem,'#4e8746');
    for(const angle of [.55,3.5]){
      const leaf=new THREE.SphereGeometry(1,8,5).scale(.066,.013,.028).rotateZ(.28).rotateY(-angle);
      add(leaf.translate(x+.052*Math.cos(angle),y+height*.48,z+.052*Math.sin(angle)),'#689e4e');
    }
    for(let i=0;i<5;i++){
      const angle=i*Math.PI*2/5;
      const petal=new THREE.SphereGeometry(1,10,6).scale(.074*size,.021*size,.045*size).rotateY(-angle);
      add(petal.translate(x+.066*size*Math.cos(angle),y+height,z+.066*size*Math.sin(angle)),petals);
    }
    const center=new THREE.SphereGeometry(1,10,6).scale(.047*size,.025*size,.047*size);
    add(center.translate(x,y+height+.014*size,z),'#e8ab49');
    // The body sits just above the raised flower center.
    return new THREE.Vector3(x,y+height+.039*size+.021,z);
  }
  const perch=addFlower(x,z,.23,1,'#fff1c9');
  addFlower(x+.24,z+.05,.15,.72,'#edb1a3');
  addFlower(x+.13,z+.24,.18,.78,'#fff1c9');
  const flower=new THREE.Mesh(mergeGeometries(parts),new THREE.MeshStandardMaterial({name:'Meadow flowers',vertexColors:true}));
  for(const part of parts)part.dispose();
  flower.name='Butterfly landing flowers';
  flower.receiveShadow=true;
  flower.raycast=()=>{};
  return {flower,perch};
}

function createButterfly(){
  const outline=[
    [.008,.011],[.034,.077],[.107,.143],[.184,.168],[.233,.137],[.245,.087],[.211,.031],
    [.165,.004],[.205,-.035],[.202,-.081],[.158,-.116],[.104,-.116],[.058,-.076],[.013,-.039],
  ];
  const vertices=[],colors=[];
  const edge=new THREE.Color('#b96e3c'),gold=new THREE.Color('#f8be57'),cream=new THREE.Color('#fff2aa');
  const fillCenter=[.101,.018];
  const inset=outline.map(([x,z])=>[x*.87+fillCenter[0]*.13,z*.87+fillCenter[1]*.13]);
  function vertex([x,z],y,color){
    vertices.push(x,y,z);
    colors.push(color.r,color.g,color.b);
  }
  for(let i=0;i<outline.length;i++){
    const j=(i+1)%outline.length;
    for(const point of [outline[i],outline[j],inset[i],inset[i],outline[j],inset[j]])vertex(point,0,edge);
    vertex(fillCenter,0,gold);
    vertex(inset[i],0,cream);
    vertex(inset[j],0,cream);
  }
  // A cream fleck on each face reads from both sides as the wings flap.
  for(const y of [-.001,.001]){
    const center=[.171,.104];
    for(let i=0;i<8;i++){
      vertex(center,y,cream);
      for(const angle of [i*Math.PI/4,(i+1)*Math.PI/4]){
        vertex([center[0]+.034*Math.cos(angle),center[1]+.017*Math.sin(angle)],y,new THREE.Color('#fff9dc'));
      }
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const wingMaterial=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide});
  const butterfly=new THREE.Group();
  butterfly.name='Meadow butterfly';
  butterfly.rotation.order='YXZ';
  const right=new THREE.Mesh(geometry,wingMaterial),left=new THREE.Mesh(geometry,wingMaterial);
  right.position.x=.012;
  left.position.x=-.012;
  left.scale.x=-1;
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(.021,.107,3,7).rotateX(Math.PI/2),new THREE.MeshBasicMaterial({color:'#694b39'}));
  butterfly.add(right,left,body);
  for(const mesh of butterfly.children){
    mesh.userData.combatDecoration=true;
    mesh.raycast=()=>{};
  }
  return {butterfly,right,left};
}

export function createMeadowButterfly(groundHeight,centerX,centerZ){
  const {flower,perch}=createFlowers(groundHeight,centerX+.93,centerZ+1.03);
  const {butterfly,right,left}=createButterfly();
  const object=new THREE.Group();
  object.add(flower,butterfly);
  const origin=new THREE.Vector3(),anchor=new THREE.Vector3(),landingStart=new THREE.Vector3();
  const next=new THREE.Vector3(),orbit=new THREE.Vector3();
  let phase='hidden',age=0,wingTime=0,awayTime=0;

  function reset(){
    phase='hidden';
    age=wingTime=awayTime=0;
    butterfly.visible=false;
  }

  function trackActor(actor,delta){
    // Keep the arc on the open side of the cottage if the player runs out of the patch.
    anchor.x=damp(anchor.x,clamp(actor.x,centerX-.63,centerX+.62),9,delta);
    anchor.z=damp(anchor.z,clamp(actor.z,centerZ-.66,centerZ+.65),9,delta);
    anchor.y=damp(anchor.y,actor.y,9,delta);
  }

  function orbitPoint(t){
    const angle=(t-.5)*Math.PI;
    return orbit.set(anchor.x+RADIUS*Math.cos(angle),anchor.y+.78+.065*Math.sin(t*Math.PI),anchor.z+RADIUS*Math.sin(angle));
  }

  function flyTo(point,delta,settle=0){
    const dx=point.x-butterfly.position.x,dz=point.z-butterfly.position.z;
    const horizontal=Math.hypot(dx,dz);
    if(horizontal>.0001){
      const turn=Math.atan2(dx,dz)-butterfly.rotation.y;
      butterfly.rotation.y+=Math.atan2(Math.sin(turn),Math.cos(turn))*(1-Math.exp(-12*delta));
    }
    const pitch=-Math.atan2(point.y-butterfly.position.y,Math.max(horizontal,.001))*.32*(1-settle);
    butterfly.rotation.x=damp(butterfly.rotation.x,pitch,12,delta);
    butterfly.position.copy(point);
  }

  function update(delta,actor,entered,near){
    if(phase==='hidden'){
      if(!entered)return;
      phase='rising';
      age=wingTime=0;
      anchor.set(clamp(actor.x,centerX-.63,centerX+.62),actor.y,clamp(actor.z,centerZ-.66,centerZ+.65));
      const x=anchor.x+.19,z=clamp(anchor.z-.53,centerZ-.72,centerZ+.62);
      origin.set(x,(groundHeight(x,z)??actor.y)+.18,z);
      butterfly.position.copy(origin);
      butterfly.rotation.set(0,Math.PI,0);
      butterfly.visible=true;
    }

    age+=delta;
    wingTime+=delta;
    let flight=1;
    if(phase==='rising'){
      trackActor(actor,delta);
      const t=smoothstep(age,0,RISE);
      next.copy(origin).lerp(orbitPoint(0),t);
      next.y+=.095*Math.sin(Math.PI*t);
      flyTo(next,delta);
      if(age>=RISE){phase='circling';age=0;}
    }else if(phase==='circling'){
      trackActor(actor,delta);
      const t=smoothstep(age,0,ORBIT);
      next.copy(orbitPoint(t));
      next.y+=.052*Math.sin(t*Math.PI*5)*Math.sin(t*Math.PI);
      flyTo(next,delta);
      if(age>=ORBIT){landingStart.copy(next);phase='landing';age=0;}
    }else if(phase==='landing'){
      const t=smoothstep(age,0,LAND);
      next.copy(landingStart).lerp(perch,t);
      next.y+=.16*Math.sin(t*Math.PI);
      flight=1-smoothstep(t,.65,1);
      flyTo(next,delta,1-flight);
      if(age>=LAND){phase='perched';age=awayTime=0;}
    }else if(phase==='perched'){
      flight=0;
      butterfly.rotation.x=damp(butterfly.rotation.x,0,14,delta);
      awayTime=near?0:awayTime+delta;
      if(awayTime>=5){phase='returning';age=0;}
    }else if(phase==='returning'){
      const t=smoothstep(age,0,RETURN);
      next.copy(perch).lerp(origin,t);
      next.y+=.45*Math.sin(t*Math.PI);
      flyTo(next,delta);
      if(age>=RETURN){reset();return;}
    }

    const flutter=.44+.59*Math.sin(wingTime*Math.PI*2*7);
    const resting=.27+.11*Math.sin(wingTime*Math.PI*1.6);
    const flap=THREE.MathUtils.lerp(resting,flutter,flight);
    right.rotation.z=flap;
    left.rotation.z=-flap;
  }

  reset();
  return {object,update,reset,debug:()=>({phase,visible:butterfly.visible,position:butterfly.position.toArray(),perch:perch.toArray()})};
}
