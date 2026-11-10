import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createWaterGunEffect } from './water-gun-effect.js';
import { solveWaterAim, WATER_SPEED, WATER_GRAVITY } from './water-aim.js';
import { createTargetFeedback } from './target-feedback.js';
import { createPondWater } from './pond-water.js';
import { createFruitModels, createGardenFruit } from './garden-fruit.js';
import { createCottageMeadow } from './garden-meadow.js';
import { createGardenWindChime } from './garden-wind-chime.js';

export async function loadResourcePreviewAssets(root, track) {
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const getJSON=async(path)=>{const r=await fetch(root+path);if(!r.ok)throw new Error(`资源读取失败：${path}`);return r.json();};
  const loadModel = (path) => loader.loadAsync(root + path);
  const manifest = await track(getJSON('manifest.json'));
  const level = getJSON(manifest.level);
  const [[layout, fruitLayout], garden, [berry, targets]] = await Promise.all([
    track(Promise.all([level, manifest.fruitLevel ? getJSON(manifest.fruitLevel) : null])),
    track(loadModel(manifest.environment)),
    track(Promise.all([
      loadModel(manifest.props.berry),
      level.then(layout => Promise.all(layout.targets.map(target => loadModel(target.asset)))),
    ])),
  ]);
  return { layout, fruitLayout, garden, berry, targets };
}

export async function createResourcePreview({renderer,scene,actor,model,root,assets,metadata,stageColliders,toon,heartTexture,mobileGraphics,onWaterContact=()=>{}}) {
  const { layout, fruitLayout, garden, berry, targets } = assets;
  const environment=new THREE.Group();
  environment.name='Garden Resources';
  environment.add(garden.scene);
  const targetRecords=layout.targets.map((t,i)=>{const object=targets[i].scene;object.name=`Target_${t.id}`;object.position.fromArray(t.position);object.userData.targetId=t.id;object.traverse(o=>{if(o.isMesh){o.userData.aimTarget=t.id;if(/disc|ring|bullseye/i.test(o.name))o.userData.waterTarget=t.id;}});environment.add(object);return {...t,object};});
  environment.traverse((o)=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.geometry.computeBoundingBox();}});
  environment.visible=false;
  scene.add(environment);
  environment.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(environment);
  const fitValues=[],fitVertex=new THREE.Vector3();
  environment.traverse((o)=>{if(o.isMesh){const positions=o.geometry.attributes.position;for(let i=0;i<positions.count;i++){fitVertex.fromBufferAttribute(positions,i).applyMatrix4(o.matrixWorld);fitValues.push(fitVertex.x,fitVertex.y,fitVertex.z);}}});
  const fitPoints=new Float32Array(fitValues);
  const groundRoot=garden.scene.getObjectByName('NAV_Ground');
  if(!groundRoot)throw new Error('庭院缺少可行走地面');
  const groundMeshes=[];
  groundRoot.traverse((o)=>{if(o.isMesh&&[].concat(o.material).some(m=>/Terrain with/.test(m.name)))groundMeshes.push(o);});
  const groundRay=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,-1,0),0,12);
  function hitGround(x,z){
    groundRay.ray.origin.set(x,8,z);
    return groundRay.intersectObjects(groundMeshes,false).find(h=>h.face.normal.y>.5);
  }
  function groundHeight(x,z){return hitGround(x,z)?.point.y??null;}
  const meadow=createCottageMeadow(groundHeight);
  environment.add(meadow);
  const groundColor=new THREE.Vector3(),groundNormalMatrix=new THREE.Matrix3();
  function footprintSurface(hit){
    if(!hit)return null;
    const colors=hit.object.geometry.attributes.color;
    let kind='grass';
    if(colors&&hit.barycoord){
      const {a,b,c}=hit.face;
      THREE.Triangle.getInterpolatedAttribute(colors,a,b,c,hit.barycoord,groundColor);
      if(groundColor.x>=groundColor.y&&groundColor.x>.48)kind='earth';
    }
    groundNormalMatrix.getNormalMatrix(hit.object.matrixWorld);
    const normal=hit.face.normal.clone().applyMatrix3(groundNormalMatrix).normalize();
    return {normal,kind};
  }
  const extraColliders=[];
  const basket=garden.scene.getObjectByName('Basket');
  let basketInfo=null,foodSource=null,pickedFruitId=null,basketBite=false,basketIndex=0;
  if(basket){const box=new THREE.Box3().setFromObject(basket),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());basketInfo={center:center.toArray(),radius:Math.max(size.x,size.z)/2,food:center.toArray()};extraColliders.push({id:'berry-basket',type:'circle',center:[center.x,center.z],radius:basketInfo.radius});}
  const models=createFruitModels(berry.scene);
  const foodRecords=new Map(Object.entries(models).map(([type,object])=>{
    const bounds=new THREE.Box3().setFromObject(object);
    return [type,{object,center:bounds.getCenter(new THREE.Vector3()),size:bounds.getSize(new THREE.Vector3())}];
  }));
  const basketTypes=fruitLayout?.basket?.length?fruitLayout.basket:['berry'];
  if(basket&&fruitLayout){
    // The original basket and handle are separate from its decorative fruit primitives.
    for(const mesh of [...basket.children]){
      if(/Berry warm peach|Foliage middle/.test(mesh.material?.name))basket.remove(mesh);
    }
    const offsets=[[-.085,.185,.055],[.091,.203,.068],[-.095,.187,-.085],[.073,.194,-.096]];
    const [x,,z]=basketInfo.center;
    basketTypes.forEach((type,i)=>{
      const item=models[type].clone();
      const [dx,y,dz]=offsets[i];
      item.position.set(x+dx,y,z+dz);item.scale.setScalar(.90);
      item.rotation.y=i*1.8;
      item.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.basketFruit=true;}});
      basket.add(item);
    });
  }
  const orchard=createGardenFruit({layout:fruitLayout,environment,models,groundHeight});
  let foodType='berry',food=berry.scene,foodCenter=foodRecords.get('berry').center,foodSize=foodRecords.get('berry').size;
  let foodScale=1;
  function selectFood(type,scale=1){
    food.visible=false;
    foodType=type;foodScale=scale;
    ({object:food,center:foodCenter,size:foodSize}=foodRecords.get(type));
  }
  function beginGardenMeal(fruitId=null){
    const picked=orchard.groundFruit(fruitId);
    if(fruitId&&(!picked||!orchard.take(fruitId)))return false;
    pickedFruitId=fruitId;
    basketBite=!fruitId;
    selectFood(picked?.type??basketTypes[basketIndex],picked?.scale);
    foodSource=new THREE.Vector3().fromArray(picked?.center??basketInfo.food);
    return true;
  }
  function endGardenMeal(){
    orchard.finish(pickedFruitId,false);
    pickedFruitId=null;
    basketBite=false;
    foodSource=null;
    selectFood('berry');
  }
  const characterMeshes=[];model.traverse(o=>{if(o.isSkinnedMesh)characterMeshes.push(o);});
  const foodVertex=new THREE.Vector3(),foodStart=new THREE.Vector3(),foodDestination=new THREE.Vector3(),foodOffset=new THREE.Vector3();
  function characterFront(mouth,forward){
    let front=-Infinity;
    for(const mesh of characterMeshes){
      mesh.skeleton.update();
      const vertices=mesh.geometry.attributes.position;
      for(let i=0;i<vertices.count;i++){
        foodVertex.fromBufferAttribute(vertices,i);mesh.applyBoneTransform(i,foodVertex);foodVertex.applyMatrix4(mesh.matrixWorld).sub(mouth);
        front=Math.max(front,foodVertex.dot(forward));
      }
    }
    return front;
  }
  toon?.apply(environment,'environment');
  const windChime=createGardenWindChime(layout.colliders.find(c=>c.id==='cottage'&&c.type==='box'));
  if(windChime)environment.add(windChime.object);
  for(const object of Object.values(models)){
    object.visible=false;
    scene.add(object);
    toon?.apply(object,'prop');
  }
  const pondWater=await createPondWater({environment,collider:layout.colliders.find(c=>c.id==='pond'),renderer,scene,groundHeight,mobileGraphics,atlasURL:root+'fx/textures/cartoon-splash-v14.png'});
  const contactBones=['Hips','Head','LHand','RHand','LFoot','RFoot'].map(name=>model.getObjectByName(name));
  const contactPoints=contactBones.map(()=>new THREE.Vector3());
  function swimContacts(){
    actor.updateMatrixWorld(true);
    contactBones.forEach((bone,i)=>{bone.getWorldPosition(contactPoints[i]);contactPoints[i].y=THREE.MathUtils.clamp(contactPoints[i].y-pondWater.info.height,-.035,.12);});
    return contactPoints;
  }
  const targetFeedback=createTargetFeedback(targetRecords);
  const socket=model.getObjectByName(metadata.socket.mouth);
  if(!socket)throw new Error('角色缺少嘴部发射挂点');
  let view='stage';
  let currentAction;
  let gameShot=null,contactSent=false;
  const collisionRay=new THREE.Raycaster();
  const a=new THREE.Vector3(),b=new THREE.Vector3(),segment=new THREE.Vector3();
  function isSceneHit(hit){
    for(let o=hit.object;o&&o!==environment;o=o.parent){
      if(!o.visible||o.userData.combatDecoration)return false;
    }
    return true;
  }
  function projectileContact(from,to,objects){
    segment.subVectors(to,from);
    const length=segment.length();
    if(length<1e-8)return null;
    collisionRay.set(from,segment.normalize());collisionRay.near=0;collisionRay.far=length;
    return collisionRay.intersectObjects(objects,true).find(hit=>{
      const fruit=hit.object.userData.gardenFruit;
      return isSceneHit(hit)&&(!fruit||orchard.isHanging(fruit));
    })??null;
  }
  function surfaceNormal(contact){
    return contact.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(contact.object.matrixWorld)).normalize();
  }
  function traceMud(from,to){
    environment.updateWorldMatrix(true,true);
    const hit=projectileContact(from,to,[environment]);
    if(!hit)return null;
    const normal=surfaceNormal(hit);
    if(normal.dot(segment)>0)normal.negate();
    const targetId=hit.object.userData.waterTarget??null;
    const kind=hit.object.material.name==='Heightfield cartoon pond'?'water':targetId?'target':normal.y>.55?'ground':'surface';
    return {point:hit.point,normal,kind,targetId,attachment:targetId?hit.object.parent:null};
  }
  function resolveImpact(origin,velocity,gravity){
    scene.updateMatrixWorld(true);
    const objects=view==='garden'?[environment,...stageColliders.slice(1)]:stageColliders;
    a.copy(origin);
    for(let i=1;i<=45;i++){
      const t=i*.02;
      b.copy(origin).addScaledVector(velocity,t);b.y-=.5*gravity*t*t;
      const contact=projectileContact(a,b,objects);
      if(contact){
        const {waterTarget,fruitTree,gardenFruit}=contact.object.userData;
        const tree=fruitTree??orchard.treeAt(gardenFruit);
        const targetId=waterTarget??(orchard.aimPoint(tree)?tree:null);
        return {time:(i-1)*.02+.02*contact.distance/a.distanceTo(b),point:contact.point,normal:surfaceNormal(contact),targetId};
      }
      a.copy(b);
    }
    const ground=view==='garden'?0:-.035;
    const t=(velocity.y+Math.sqrt(velocity.y**2+2*gravity*Math.max(0,origin.y-ground)))/gravity;
    const point=origin.clone().addScaledVector(velocity,t);point.y=ground;
    return {time:t,point,normal:new THREE.Vector3(0,1,0)};
  }
  const clips=new Map(metadata.clips.map((c)=>[c.name,c]));
  const eat=clips.get('Eat'),eatEvent=(name,fallback)=>eat.events.find(e=>e.event===name)?.time??fallback;
  const consumeTime=eatEvent('food_consume',.7),happyTime=eatEvent('satisfied',2.02);
  const foodFX=new THREE.Group();foodFX.name='Eating crumbs and satisfied hearts';scene.add(foodFX);foodFX.visible=false;
  const crumbGeometry=new THREE.IcosahedronGeometry(.009,0),crumbMaterial=new THREE.MeshBasicMaterial({color:'#f5d29a',transparent:true,depthWrite:false,toneMapped:false});
  const crumbs=Array.from({length:3},()=>{const crumb=new THREE.Mesh(crumbGeometry,crumbMaterial);foodFX.add(crumb);return crumb;});
  const happyHearts=heartTexture?Array.from({length:2},()=>{const heart=new THREE.Sprite(new THREE.SpriteMaterial({map:heartTexture,transparent:true,depthWrite:false,toneMapped:false}));foodFX.add(heart);return heart;}):[];
  const head=model.getObjectByName('Head'),headPosition=new THREE.Vector3(),crumbOrigin=new THREE.Vector3(),crumbMotion=new THREE.Vector3();
  let eatPhase=null;
  const shoot=clips.get('WaterShoot');
  const water=createWaterGunEffect({scene,resolveImpact,start:shoot.events.find((e)=>e.event==='water_start').time,stop:shoot.events.find((e)=>e.event==='water_stop').time,
    actionDuration:shoot.duration,speed:WATER_SPEED,gravity:WATER_GRAVITY});
  const position=new THREE.Vector3(),direction=new THREE.Vector3(),quaternion=new THREE.Quaternion(),stageWaterPoint=new THREE.Vector3();
  function update(name,time,{delta=0,paused=false}={}){
    if(view==='garden'&&!paused)orchard.update(delta);
    actor.updateMatrixWorld(true);
    socket.getWorldPosition(position);
    socket.getWorldQuaternion(quaternion);
    direction.set(0,0,1).applyQuaternion(quaternion).normalize();
    if(gameShot)direction.copy(solveWaterAim(position,gameShot.point).direction);
    food.visible=name==='Eat'&&time<consumeTime;
    if(name==='Eat'&&time>=consumeTime){
      if(pickedFruitId){orchard.finish(pickedFruitId,true);pickedFruitId=null;}
      if(basketBite){basketIndex=(basketIndex+1)%basketTypes.length;basketBite=false;}
    }
    if(food.visible){
      const attach=clips.get('Eat').events.find((e)=>e.event==='food_attach').time;
      // Hold the fruit at full size while the jaw closes; remove it on the bite.
      const scale=foodScale;
      const front=characterFront(position,direction),radius=foodSize.z*.5*scale,gap=.004;
      if(foodSource)foodStart.copy(foodSource);else foodStart.set(0,.12,.65).applyQuaternion(actor.quaternion).add(actor.position);
      // Socket_Mouth is an emitter point, not the center of an edible object.
      // Keep the fruit's rear surface outside the current skinned silhouette.
      foodDestination.copy(position).addScaledVector(direction,front+radius+gap);
      food.position.copy(foodStart).lerp(foodDestination,THREE.MathUtils.smoothstep(time,0,attach));
      const projected=foodOffset.subVectors(food.position,position).dot(direction);
      if(projected<front+radius+gap)food.position.addScaledVector(direction,front+radius+gap-projected);
      food.quaternion.copy(quaternion);food.scale.setScalar(scale);
      food.position.sub(foodOffset.copy(foodCenter).multiplyScalar(scale).applyQuaternion(quaternion));
      food.updateMatrixWorld(true);
    }
    foodFX.visible=name==='Eat';
    eatPhase=name==='Eat'?(time<.34?'approach':time<consumeTime?'bite':time<1.67?'chew':time<happyTime?'swallow':'satisfied'):null;
    crumbs.forEach(crumb=>crumb.visible=false);happyHearts.forEach(heart=>heart.visible=false);
    if(name==='Eat'){
      const age=time-consumeTime;
      if(age>=0&&age<.30){
        crumbOrigin.copy(position).addScaledVector(direction,characterFront(position,direction)+.015);
        crumbs.forEach((crumb,i)=>{
          crumbMotion.set((i-1)*.16,.22+i*.045,.10).applyQuaternion(quaternion);
          crumb.position.copy(crumbOrigin).addScaledVector(crumbMotion,age);crumb.position.y-=2*age*age;
          crumb.rotation.set(age*8+i,age*5,age*9);crumb.scale.setScalar(1-age/.3);crumb.visible=true;
        });
        crumbMaterial.opacity=1-age/.3;
      }
      head.getWorldPosition(headPosition);
      happyHearts.forEach((heart,i)=>{
        const age=time-happyTime-i*.13;if(age<0||age>.42)return;
        const offset=new THREE.Vector3(i?-.13:.12,.35+age*.20,.02).applyQuaternion(actor.quaternion);
        heart.position.copy(headPosition).add(offset);heart.scale.setScalar(.075*Math.min(1,age/.07));heart.material.opacity=1-THREE.MathUtils.smoothstep(age,.22,.42);heart.visible=true;
      });
    }
    if(name==='WaterShoot')water.update(time,position,direction,quaternion);
    else water.updateTail(paused?0:delta);
    const effect=water.debug();
    if(gameShot&&!contactSent&&effect.active&&effect.time>=effect.firstImpact){
      contactSent=true;const point=new THREE.Vector3().fromArray(effect.impactPoint);
      const p=pondWater.info;
      if(view==='garden'&&((point.x-p.center[0])/p.radii[0])**2+((point.z-p.center[1])/p.radii[1])**2<1&&Math.abs(point.y-p.height)<.06)pondWater.ripple(point,1);
      onWaterContact({shotId:gameShot.id,targetId:effect.targetId,point,time:effect.time,direction:effect.launchDirection});
    }
    targetFeedback.update(paused?0:delta);
  }
  function onActionChange(name,{completed=false,gameShot:shot=null}={}){
    if(name!=='Eat')endGardenMeal();
    foodFX.visible=false;food.visible=false;eatPhase=null;
    if(name==='WaterShoot'){
      gameShot=shot;contactSent=false;
      actor.updateMatrixWorld(true);socket.getWorldPosition(position);socket.getWorldQuaternion(quaternion);
      direction.set(0,0,1).applyQuaternion(quaternion).normalize();
      if(view==='stage'){
        stageWaterPoint.copy(position).addScaledVector(direction.setY(0).normalize(),1.95);stageWaterPoint.y=-.035;
        direction.copy(solveWaterAim(position,stageWaterPoint).direction);
      }
      water.begin(position,direction,{defer:!!shot});
    }
    else if(currentAction==='WaterShoot'&&completed)water.finish();
    else {water.cancel();gameShot=null;contactSent=false;}
    currentAction=name;
  }
  function setView(value){view=value;environment.visible=value==='garden';water.cancel();pondWater.reset();gameShot=null;endGardenMeal();}
  const stats={groups:garden.scene.children.length,renderMeshes:0,vertexColorMeshes:0,proceduralWaterMeshes:0,targets:targets.length,colliders:layout.colliders.length};
  garden.scene.traverse((o)=>{if(o.isMesh&&!o.userData.basketFruit){stats.renderMeshes++;if(o.geometry.attributes.color)stats.vertexColorMeshes++;else if(o.material.isShaderMaterial)stats.proceduralWaterMeshes++;}});
  function targetPoint(id){const record=targetRecords.find(t=>t.id===id);return record?record.object.localToWorld(new THREE.Vector3().fromArray(record.hit.center).add(new THREE.Vector3(0,0,.09))):orchard.aimPoint(id);}
  function tackleTargetContact(id,position,direction){
    const record=targetRecords.find(target=>target.id===id);
    const origin=position.clone().add(new THREE.Vector3(0,.43,0));
    const side=new THREE.Vector3(direction.z,0,-direction.x);
    const ray=new THREE.Raycaster(origin,direction,0,.82);
    record.object.updateWorldMatrix(true,true);
    let nearest;
    for(const offset of [0,-.15,.15]){
      ray.ray.origin.copy(origin).addScaledVector(side,offset);
      const hit=ray.intersectObject(record.object,true).find(isSceneHit);
      if(hit&&(!nearest||hit.distance<nearest.distance))nearest=hit;
    }
    return nearest?.point??null;
  }
  function pickAim(ray,{touch=false}={}){
    const hit=ray.intersectObject(environment,true).find(isSceneHit);
    if(!hit)return null;
    if(groundMeshes.includes(hit.object)){
      const nearby=orchard.nearbyGroundFruit(ray.ray,hit.distance+.10,touch ? .29 : .24);
      if(nearby)return nearby;
    }
    const {aimTarget,fruitTree,gardenFruit}=hit.object.userData;
    const fallen=orchard.groundFruit(gardenFruit);
    const hanging=orchard.isHanging(gardenFruit);
    const tree=orchard.aimPoint(fruitTree);
    let isBasket=false;
    for(let o=hit.object;o;o=o.parent)if(o===basket)isBasket=true;
    return {
      point:aimTarget?targetPoint(aimTarget):hanging?orchard.point(gardenFruit):tree??hit.point,
      targetId:aimTarget??(hanging?orchard.treeAt(gardenFruit):tree?fruitTree:null),
      fruit:fallen,basket:isBasket,distance:hit.distance,
    };
  }
  function foodContact(){
    if(!food.visible)return {visible:false};
    let rear=Infinity;
    food.traverse(mesh=>{if(mesh.isMesh){const vertices=mesh.geometry.attributes.position;for(let i=0;i<vertices.count;i++){foodVertex.fromBufferAttribute(vertices,i).applyMatrix4(mesh.matrixWorld).sub(position);rear=Math.min(rear,foodVertex.dot(direction));}}});
    const front=characterFront(position,direction);
    return {visible:true,separation:rear-front,scale:food.scale.x,position:food.position.toArray()};
  }
  return {layout,stats,bounds,fitPoints,extraColliders,groundHeight,hitGround,footprintSurface,meadow,windChime,pondWater,swimContacts,pickDestination:(ray)=>ray.intersectObject(environment,true).find(isSceneHit)?.point??null,
    pickAim,targetPoint,tackleTargetContact,traceMud,targetFeedback,foodContact,basketInfo,beginGardenMeal,orchard,get foodType(){return foodType;},traceWater:(origin,forward)=>resolveImpact(origin,forward.clone().multiplyScalar(WATER_SPEED),WATER_GRAVITY),
    setView,get view(){return view;},update,onActionChange,debug:()=>({view,pond:pondWater.debug(),mouth:position.toArray(),direction:direction.toArray(),food:food.visible,eating:{phase:eatPhase,crumbs:foodFX.visible?crumbs.filter(o=>o.visible).length:0,hearts:foodFX.visible?happyHearts.filter(o=>o.visible).length:0},orb:false,water:water.debug().stream,waterEffect:water.debug()}),environment};
}
