import * as THREE from 'three';
import {comicLettering,paintComicTexture} from './comic-texture.js';

const {clamp,smoothstep}=THREE.MathUtils;
const STAIN_LIFE=1.55;

function globGeometry(){
  const geometry=new THREE.SphereGeometry(1,18,12);
  const p=geometry.attributes.position,colors=new Float32Array(p.count*3);
  const dark=new THREE.Color('#673f2a'),ochre=new THREE.Color('#ae693d'),wet=new THREE.Color('#edb877');
  const tint=new THREE.Color();
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    const wobble=1+.10*Math.sin(6*x+4*y)*Math.cos(5*z);
    const head=.82+.18*smoothstep(z,-1,.62);
    p.setXYZ(i,x*wobble*head,y*wobble*head,z*wobble);
    const highlight=(1-smoothstep((x+.32)**2+(z-.28)**2,.025,.23))*smoothstep(y,.31,.84);
    tint.copy(dark).lerp(ochre,smoothstep(y,-.58,.69)).lerp(wet,highlight*.87).toArray(colors,i*3);
  }
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.computeVertexNormals();
  return geometry;
}

function swishGeometry(){
  const vertices=[];
  const edge=(u,side)=>[.05*Math.sin(u*Math.PI),.032+.14*Math.sin(u*Math.PI)+side*.024*Math.sin(u*Math.PI),-.24+.55*u];
  for(let i=0;i<10;i++){
    const a=i/10,b=(i+1)/10;
    vertices.push(...edge(a,1),...edge(a,-1),...edge(b,1),...edge(a,-1),...edge(b,-1),...edge(b,1));
  }
  return new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
}

function stainMap(){
  return paintComicTexture(192,192,ctx=>{
    ctx.beginPath();ctx.moveTo(83,72);
    ctx.bezierCurveTo(76,57,48,58,29,45);ctx.bezierCurveTo(8,29,25,13,49,22);
    ctx.bezierCurveTo(67,28,75,46,92,55);ctx.bezierCurveTo(110,63,111,38,124,25);
    ctx.bezierCurveTo(143,8,165,24,149,45);ctx.bezierCurveTo(140,56,127,65,133,78);
    ctx.bezierCurveTo(144,89,162,81,175,91);ctx.bezierCurveTo(188,105,178,121,157,118);
    ctx.bezierCurveTo(147,116,133,109,129,121);ctx.bezierCurveTo(124,136,148,150,141,166);
    ctx.bezierCurveTo(134,183,111,175,108,154);ctx.bezierCurveTo(106,141,101,133,88,138);
    ctx.bezierCurveTo(76,145,74,165,55,170);ctx.bezierCurveTo(39,173,29,158,44,144);
    ctx.bezierCurveTo(52,136,65,127,59,118);ctx.bezierCurveTo(50,110,28,126,17,113);
    ctx.bezierCurveTo(1,95,23,85,46,88);ctx.bezierCurveTo(60,91,79,84,83,72);ctx.closePath();
    ctx.lineJoin='round';ctx.lineWidth=5;ctx.strokeStyle='#5d3728';ctx.stroke();ctx.fillStyle='#935635';ctx.fill();
    ctx.beginPath();ctx.moveTo(68,98);ctx.bezierCurveTo(71,77,102,71,125,84);
    ctx.bezierCurveTo(139,96,122,119,102,123);ctx.bezierCurveTo(82,130,61,120,68,98);ctx.closePath();
    ctx.fillStyle='#ad6e42';ctx.fill();
    ctx.beginPath();ctx.moveTo(82,93);ctx.bezierCurveTo(92,84,105,83,113,89);
    ctx.bezierCurveTo(102,89,94,91,88,96);ctx.bezierCurveTo(84,98,80,96,82,93);ctx.fillStyle='#d39a64';ctx.fill();
  });
}

export function createMudEffects(environment){
  const object=new THREE.Group();object.name='Garden mud throw effects';environment.add(object);
  const geometry=globGeometry();
  const material=new THREE.MeshToonMaterial({vertexColors:true});
  const glob=new THREE.Mesh(geometry,material);
  const swish=new THREE.Mesh(swishGeometry(),new THREE.MeshBasicMaterial({color:'#f7d39b',transparent:true,side:THREE.DoubleSide,depthWrite:false}));
  const drops=new THREE.InstancedMesh(geometry,material,6);drops.frustumCulled=false;
  drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const lettering=new THREE.Sprite(new THREE.SpriteMaterial({map:comicLettering('啪嗒！'),transparent:true,depthWrite:false,depthTest:false,toneMapped:false}));
  lettering.renderOrder=6;
  const texture=stainMap();
  const stains=Array.from({length:3},()=>{
    const mark=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,
      side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2}));
    mark.renderOrder=3;return {mark,age:STAIN_LIFE,size:0};
  });
  object.add(glob,swish,drops,lettering,...stains.map(({mark})=>mark));
  object.traverse(o=>{o.raycast=()=>{};o.userData.combatDecoration=true;});
  const zAxis=new THREE.Vector3(0,0,1),up=new THREE.Vector3(0,1,0),axis=new THREE.Vector3();
  const source=new THREE.Vector3(),normal=new THREE.Vector3(),tangent=new THREE.Vector3(),side=new THREE.Vector3();
  const frame=new THREE.Matrix4(),cameraRight=new THREE.Vector3(),particle=new THREE.Object3D();
  let mode=null,age=0,swishAge=10,hitTarget=false,stampIndex=0;

  function reset(){
    mode=null;age=0;swishAge=10;hitTarget=false;stampIndex=0;
    glob.visible=swish.visible=drops.visible=lettering.visible=false;
    for(const stain of stains){object.add(stain.mark);stain.mark.visible=false;stain.age=STAIN_LIFE;}
  }
  function placeGlob(point,direction,size,stretch){
    glob.visible=true;glob.position.copy(point);
    glob.quaternion.setFromUnitVectors(zAxis,axis.copy(direction).normalize());
    glob.scale.set(size,size*.91,size*stretch);
  }
  function scrape(point,direction){
    source.copy(point);tangent.copy(direction);side.set(direction.z,0,-direction.x);normal.copy(up);
    mode='scrape';age=0;
  }
  function release(point,velocity){
    mode='flight';age=0;swishAge=0;
    swish.position.copy(point);swish.rotation.y=Math.atan2(velocity.x,velocity.z);
    flight(point,velocity,0);
  }
  function flight(point,velocity,time){
    const stretch=1+.48*(1-smoothstep(time,0,.12))+.23*smoothstep(time,.21,.42);
    placeGlob(point,velocity,.145,stretch);
    source.copy(point);tangent.copy(velocity).normalize();side.crossVectors(up,tangent).normalize();
  }
  function hideGlob(){glob.visible=false;if(mode==='flight')mode=null;}
  function land(contact,velocity){
    hideGlob();mode='impact';age=0;hitTarget=contact.kind==='target';
    source.copy(contact.point);normal.copy(contact.normal);
    tangent.copy(velocity).addScaledVector(normal,-velocity.dot(normal));
    if(tangent.lengthSq()<.0001)tangent.crossVectors(Math.abs(normal.y)<.95?up:zAxis,normal);
    tangent.normalize();side.crossVectors(tangent,normal).normalize();
    if(contact.kind==='water')return;
    const stain=stains[stampIndex++%stains.length],mark=stain.mark;
    object.add(mark);
    frame.makeBasis(side,tangent,normal);
    mark.quaternion.setFromRotationMatrix(frame);
    mark.position.copy(contact.point).addScaledVector(normal,hitTarget?.017:.008);
    mark.scale.setScalar(.15);mark.material.opacity=1;mark.visible=true;
    stain.age=0;stain.size=hitTarget?.51:.60;
    if(contact.attachment)contact.attachment.attach(mark);
  }
  function update(delta){
    if(delta<=0)return;
    age+=delta;swishAge+=delta;
    swish.visible=swishAge<.12;
    if(swish.visible){swish.material.opacity=.79*(1-smoothstep(swishAge,.035,.12));swish.scale.setScalar(.85+swishAge*1.9);}
    for(const stain of stains){
      if(!stain.mark.visible)continue;
      stain.age+=delta;
      stain.mark.visible=stain.age<STAIN_LIFE;
      const spread=smoothstep(stain.age,0,.10),overshoot=Math.sin(spread*Math.PI)*.12;
      stain.mark.scale.setScalar(stain.size*(.31+.69*spread+overshoot));
      stain.mark.material.opacity=.94*(1-smoothstep(stain.age,.96,STAIN_LIFE));
    }
    lettering.visible=mode==='impact'&&hitTarget&&age>.028&&age<.45;
    drops.visible=(mode==='scrape'&&age<.21)||(mode==='impact'&&age<.28)||(mode==='flight'&&glob.visible&&age>.018);
    if(!drops.visible)return;
    drops.count=mode==='flight'?2:mode==='scrape'?3:5;
    for(let i=0;i<drops.count;i++){
      const hand=i%2===0?1:-1;
      let size;
      particle.position.copy(source);
      if(mode==='flight'){
        particle.position.addScaledVector(tangent,-.24-i*.17).addScaledVector(side,hand*(.062+i*.035));
        particle.position.y-=.045+i*.029;
        size=.043-i*.009;
      }else{
        const t=clamp(age/(mode==='scrape'?.21:.28),0,1),large=mode==='impact'&&i<2;
        const spread=mode==='scrape'?.12:large?.36:.46;
        particle.position.addScaledVector(side,hand*spread*t*(.72+.15*i)).addScaledVector(tangent,spread*t*(.30+i*.19));
        particle.position.addScaledVector(normal,(large?.12:.16)*Math.sin(Math.PI*t));
        size=(large?.091:.045+i*.004)*Math.sqrt(1-t);
      }
      particle.quaternion.setFromUnitVectors(zAxis,axis.copy(tangent).normalize());
      particle.scale.set(size,size*.77,size*(i<2?1.48:1.12));
      particle.updateMatrix();drops.setMatrixAt(i,particle.matrix);
    }
    drops.instanceMatrix.needsUpdate=true;
  }
  function prepare(camera){
    if(!lettering.visible)return;
    cameraRight.setFromMatrixColumn(camera.matrixWorld,0);
    const sideSign=tangent.dot(cameraRight)<-.12?-1:1;
    const t=(age-.028)/.422,pop=smoothstep(t,0,.20),size=.86+.55*pop+Math.sin(pop*Math.PI)*.16;
    lettering.position.copy(source).addScaledVector(cameraRight,sideSign*(.48+t*.15));lettering.position.y+=.43+t*.29;
    lettering.scale.set(size,size*(.36+.14*pop),1);lettering.material.rotation=-sideSign*.14;
    lettering.material.opacity=1-smoothstep(t,.56,1);
  }

  reset();
  return {reset,scrape,release,flight,land,hideGlob,update,prepare,
    scoop:(point,direction,t)=>placeGlob(point,direction,.043+.087*t,.87+t*.25),
    debug:()=>({glob:glob.visible,position:glob.visible?glob.position.toArray():null,mode,lettering:lettering.visible,
      stains:stains.filter(s=>s.mark.visible).map(s=>s.mark.getWorldPosition(new THREE.Vector3()).toArray())})};
}
