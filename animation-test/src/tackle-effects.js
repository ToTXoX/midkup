import * as THREE from 'three';
import {comicLettering,paintComicTexture} from './comic-texture.js';

const {smoothstep,clamp}=THREE.MathUtils;
const INK='#4f382e';

function burstMap(){
  return paintComicTexture(256,256,ctx=>{
    const rays=[[15,37],[83,72],[84,20],[117,66],[150,29],[154,76],[232,51],[188,98],
      [245,112],[200,134],[230,169],[169,163],[178,221],[135,185],[98,237],[96,184],[38,215],[62,163],[13,159],[53,127],[12,105],[72,98]];
    function shape(points){ctx.beginPath();points.forEach(([x,y])=>ctx.lineTo(x,y));ctx.closePath();}
    ctx.lineJoin='round';ctx.lineWidth=8;ctx.strokeStyle=INK;
    shape(rays.map(([x,y])=>[x*.95+9,y*.95+12]));ctx.fillStyle='#d9894f';ctx.fill();ctx.stroke();
    shape(rays);ctx.fillStyle='#f5bd60';ctx.fill();ctx.stroke();
    shape(rays.map(([x,y])=>[125+(x-125)*.71,128+(y-128)*.72]));ctx.fillStyle='#fff6d5';ctx.fill();
    ctx.strokeStyle='#e2a460';ctx.lineWidth=3;
    for(let i=0;i<3;i++){
      ctx.beginPath();ctx.moveTo(143+i*9,148+i*3);ctx.lineTo(158+i*9,156+i*3);ctx.stroke();
    }
    ctx.lineWidth=6;ctx.strokeStyle=INK;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(198,202);ctx.lineTo(217,217);ctx.moveTo(34,66);ctx.lineTo(23,59);ctx.stroke();
  });
}

function speedLines(){
  const points=[];
  for(const [x,y,z,length,width] of [[-.35,.28,.19,.65,.038],[.35,.28,.24,.71,.043],
    [-.45,.20,.00,.44,.025],[.46,.20,.02,.49,.025],[-.27,.38,-.04,.48,.022],[.25,.35,-.08,.39,.021]]){
    points.push(x-width,y,z,x+width,y+.018,z-.07,x,y,z-length);
  }
  const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  return new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:'#eafff9',side:THREE.DoubleSide,transparent:true,depthWrite:false}));
}

export function createTackleEffects(environment){
  const object=new THREE.Group();object.name='Tackle comic effects';environment.add(object);
  const streaks=speedLines();
  const burst=new THREE.Sprite(new THREE.SpriteMaterial({map:burstMap(),transparent:true,depthWrite:false,toneMapped:false}));
  const lettering=new THREE.Sprite(new THREE.SpriteMaterial({map:comicLettering('砰！'),transparent:true,depthWrite:false,depthTest:false,toneMapped:false}));
  const dust=new THREE.InstancedMesh(new THREE.SphereGeometry(1,7,4),new THREE.MeshBasicMaterial({color:'#e1c19a',transparent:true,depthWrite:false}),6);
  const pulseRing=new THREE.Mesh(new THREE.RingGeometry(.80,1,40),new THREE.MeshBasicMaterial({color:'#ffd087',side:THREE.DoubleSide,transparent:true,depthWrite:false}));
  pulseRing.rotation.x=-Math.PI/2;
  dust.instanceMatrix.setUsage(THREE.DynamicDrawUsage);dust.frustumCulled=false;
  burst.renderOrder=5;lettering.renderOrder=6;
  object.add(streaks,dust,burst,lettering,pulseRing);
  object.traverse(o=>{o.raycast=()=>{};o.userData.combatDecoration=true;});
  const dustOrigin=new THREE.Vector3(),dustDirection=new THREE.Vector3(),dustSide=new THREE.Vector3();
  const impact=new THREE.Vector3(),impactDirection=new THREE.Vector3();
  const cameraSide=new THREE.Vector3(),towardCamera=new THREE.Vector3(),particle=new THREE.Object3D();
  let dustAge=10,impactAge=10,pulseAge=10,pulseSize=1,dustKind=null,screenSide=1,audio;

  function reset(){dustAge=impactAge=pulseAge=10;dustKind=null;streaks.visible=dust.visible=burst.visible=lettering.visible=pulseRing.visible=false;}
  function enableBeatSound(){
    if(!globalThis.AudioContext)return;
    try { audio??=new AudioContext(); } catch { return; }
    if(audio.state==='suspended')audio.resume().catch(()=>{});
  }
  function pulse(point,beat){
    pulseAge=0;pulseSize=.66+.12*beat;
    pulseRing.position.copy(point);pulseRing.position.y+=.015;
    if(audio?.state!=='running')return;
    const drum=audio.createOscillator(),gain=audio.createGain(),now=audio.currentTime;
    drum.frequency.setValueAtTime(112-8*beat,now);
    drum.frequency.exponentialRampToValueAtTime(49,now+.115);
    gain.gain.setValueAtTime(.075+.012*beat,now);
    gain.gain.exponentialRampToValueAtTime(.001,now+.14);
    drum.connect(gain).connect(audio.destination);drum.start(now);drum.stop(now+.14);
    drum.onended=()=>{drum.disconnect();gain.disconnect();};
  }
  function emitDust(point,direction,kind){
    dustOrigin.copy(point);dustDirection.copy(direction);dustSide.set(direction.z,0,-direction.x);
    dustAge=0;dustKind=kind;
  }
  function hit(point,direction){impact.copy(point);impactDirection.copy(direction);impactAge=0;}
  function update(delta,position,direction,dashing,height=0){
    if(delta<=0)return;
    dustAge+=delta;impactAge+=delta;pulseAge+=delta;
    pulseRing.visible=pulseAge<.23;
    if(pulseRing.visible){
      pulseRing.scale.setScalar(pulseSize*(.46+.85*pulseAge/.23));
      pulseRing.material.opacity=.70*(1-smoothstep(pulseAge,.015,.23));
    }
    streaks.visible=dashing;
    if(dashing){streaks.position.copy(position);streaks.position.y+=height;streaks.rotation.y=Math.atan2(direction.x,direction.z);streaks.material.opacity=.65;}
    const t=dustAge/.31;
    dust.visible=t<1;
    if(dust.visible){
      dust.count=dustKind==='blocked'||dustKind==='landing'?4:6;
      dust.material.opacity=.76*(1-smoothstep(t,.20,1));
      const skid=dustKind==='miss';
      for(let i=0;i<dust.count;i++){
        const side=(i-(dust.count-1)/2),spread=.044+(.049+.012*(i%2))*t;
        const depth=(skid?-.39:-.15)*t*(.74+.12*(i%3))-.022*(i%3);
        const size=(.047+.014*(i%3))*(.76+.82*t);
        particle.position.copy(dustOrigin).addScaledVector(dustSide,side*spread).addScaledVector(dustDirection,depth);
        particle.position.y+=(skid?.019:.065)*Math.sin(Math.PI*t);
        particle.rotation.y=Math.atan2(dustDirection.x,dustDirection.z);
        particle.scale.set(size,size*(skid?.38:.65),size*(skid?1.65:1.10));
        particle.updateMatrix();dust.setMatrixAt(i,particle.matrix);
      }
      dust.instanceMatrix.needsUpdate=true;
    }
    burst.visible=impactAge<.19;
    lettering.visible=impactAge>.025&&impactAge<.46;
  }
  function prepare(camera){
    if(!burst.visible&&!lettering.visible)return;
    camera.updateMatrixWorld();
    cameraSide.setFromMatrixColumn(camera.matrixWorld,0);
    towardCamera.subVectors(camera.position,impact).normalize();
    const horizontal=impactDirection.dot(cameraSide);
    screenSide=horizontal<-.15?-1:1;
    if(burst.visible){
      const pop=smoothstep(impactAge,0,.047),fade=1-smoothstep(impactAge,.09,.19);
      burst.position.copy(impact).addScaledVector(towardCamera,.21).addScaledVector(impactDirection,.065*pop);burst.position.y+=.065;
      burst.scale.setScalar((.58+.37*pop)*(.81+.19*fade));
      burst.material.rotation=screenSide*.22;
      burst.material.opacity=fade;
    }
    if(lettering.visible){
      const t=clamp((impactAge-.025)/.435,0,1),pop=smoothstep(t,0,.23),overshoot=Math.sin(pop*Math.PI)*.19;
      const size=.87+.45*pop+overshoot;
      lettering.position.copy(impact).addScaledVector(cameraSide,screenSide*(.42+t*.18));lettering.position.y+=.45+t*.31;
      lettering.scale.set(size,size*(.40+.14*pop),1);
      lettering.material.rotation=-screenSide*.17;
      lettering.material.opacity=1-smoothstep(t,.58,1);
    }
  }

  reset();
  return {reset,dust:emitDust,hit,pulse,enableBeatSound,update,prepare,debug:()=>({burst:burst.visible,lettering:lettering.visible,streaks:streaks.visible,dust:dustKind&&dust.visible?dustKind:null})};
}
