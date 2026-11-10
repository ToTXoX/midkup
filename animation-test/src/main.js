import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';
import './anime-ui.css';
import { createResourcePreview, loadResourcePreviewAssets } from './resource-preview.js';
import { createToonStyle } from './toon-style.js';
import { createGardenNavigation,createGardenWalker } from './garden-navigation.js';
import { createDestinationMarker } from './destination-marker.js';
import { createGardenCombat } from './garden-combat.js';
import { createGardenTackle } from './garden-tackle.js';
import { createTackleEffects } from './tackle-effects.js';
import { createGardenMud } from './garden-mud.js';
import { createMudEffects } from './mud-effects.js';
import { createWaterSkillInput } from './water-skill-input.js';
import { createGardenSwimming } from './garden-swimming.js';
import { createGardenFootprints } from './garden-footprints.js';
import { preventGameSelection } from './game-selection.js';
import { createEyeExpressions } from './eye-expressions.js';

preventGameSelection(document.getElementById('app'));

const $ = (id) => document.getElementById(id);
const resourceMode = document.body.dataset.pack === 'game';
const resourceRoot = `${import.meta.env.BASE_URL}assets/game/`;
const gardenLoading = $('garden-loading');
function advanceGardenLoading() {
  const progress = $('garden-load-progress');
  progress.value += 1;
  $('garden-load-percent').textContent = `${Math.round(100 * progress.position)}%`;
}
async function trackGardenLoad(promise) {
  const result = await promise;
  advanceGardenLoading();
  return result;
}
function hideGardenLoading() {
  if (gardenLoading) {
    gardenLoading.hidden = true;
    $('app').inert = false;
  }
}
function showLoadError(error) {
  hideGardenLoading();
  $('error').hidden = false;
  $('error').textContent = `加载失败：${error.message}。请刷新页面重试。`;
  $('status').textContent = '加载失败';
}
const defaultMetadata = { clips: [{name:'Idle',loop:true},{name:'Walk',loop:true},{name:'PetReaction',loop:false}], locomotion:{Walk:{speed:.13/(.8*.62)}} };
let metadata = defaultMetadata;
let clipSettings = new Map(metadata.clips.map((c)=>[c.name,c]));
const locomotion = (name) => metadata.locomotion[name];
let resourcePreview;
let navigation,gardenWalker,combat,skillInput,skillAimBefore,swimming,footprints;
let tackle,tackleEffects,mud,mudEffects;
const groundSkillActive=()=>!!(tackle?.active||mud?.active);
let gardenMeal=null,mealsEaten=0;
const gardenDances=['DanceA','DanceB','DanceC'];
let danceBag=[],lastGardenDance=null,pendingGardenDance=null,completedGardenDances=0;
const danceCounts={DanceA:0,DanceB:0,DanceC:0};
let waterFramed = false;
let tailDanceFramed = false;
let eyeExpressions=null;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#e6eee6');
scene.fog = new THREE.Fog('#e6eee6', 5, 12);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
} catch (error) {
  showLoadError(error);
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
$('scene').appendChild(renderer.domElement);
renderer.domElement.tabIndex=0;
renderer.domElement.draggable=false;
renderer.domElement.setAttribute('aria-label','庭院：点击 zuzu 跳舞，点击草地移动，右下角水枪键喷水，拖动技能键瞄准');

const STAGE_FOV=36;
const camera = new THREE.PerspectiveCamera(STAGE_FOV, 1, .05, 40);
const halfFovTan=fov=>Math.tan(THREE.MathUtils.degToRad(fov/2));
const lensDistanceScale=()=>halfFovTan(STAGE_FOV)/halfFovTan(camera.fov);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 1.9;
controls.maxDistance = 6;
controls.minPolarAngle = .25;
controls.maxPolarAngle = Math.PI / 2 - .04;
function resetView() {
  skillInput?.cancel();
  controls.enabled=true;
  const garden=resourcePreview?.view==='garden';
  camera.fov=garden?(resourcePreview.layout.camera.fov??STAGE_FOV):STAGE_FOV;
  camera.near=.05;
  camera.far=40;
  camera.clearViewOffset();
  if (garden) {
    const dock = $('garden-dock').getBoundingClientRect();
    const compact = dock.width > 0;
    const sideInset = compact ? 12 : Math.min(48,innerWidth*.06);
    const desktopInset=THREE.MathUtils.lerp(72,36,THREE.MathUtils.smoothstep(innerHeight,650,1000));
    const verticalInset = Math.min(desktopInset, innerHeight * .13);
    let rightEdge = innerWidth - sideInset;
    let topEdge = verticalInset;
    let bottomEdge = innerHeight - verticalInset;
    if (compact) {
      const topControls = ['garden-score', 'garden-music', 'garden-menu-toggle', 'view-hint'];
      topEdge = Math.max(...topControls.map(id => $(id).getBoundingClientRect().bottom)) + 12;
      if (innerWidth > innerHeight && innerHeight <= 500) {
        rightEdge = dock.left - 12;
        bottomEdge = innerHeight - 12;
      } else {
        bottomEdge = dock.top - 12;
      }
    }
    const width = Math.max(1, rightEdge - sideInset);
    const height = Math.max(1, bottomEdge - topEdge);
    const frameX = sideInset + width / 2;
    const frameY = topEdge + height / 2;
    const direction = new THREE.Vector3().fromArray(resourcePreview.layout.camera.position)
      .sub(new THREE.Vector3().fromArray(resourcePreview.layout.camera.target));
    direction.y *= .73;
    direction.normalize();
    const right=new THREE.Vector3().crossVectors(camera.up,direction).normalize(),up=new THREE.Vector3().crossVectors(direction,right);
    const box=resourcePreview.bounds,center=box.getCenter(new THREE.Vector3());
    const source=resourcePreview.fitPoints,coordinates=new Float32Array(source.length),p=new THREE.Vector3();
    let near=0;
    for(let i=0;i<source.length;i+=3){p.set(source[i],source[i+1],source[i+2]).sub(center);coordinates[i]=p.dot(right);coordinates[i+1]=p.dot(up);coordinates[i+2]=p.dot(direction);near=Math.max(near,coordinates[i+2]+.1);}
    const scale=innerHeight/(2*halfFovTan(camera.fov));
    const diagonal=box.getSize(new THREE.Vector3()).length();
    let far=near+diagonal*scale/Math.min(width,height);
    const projected=(distance)=>{
      let left=Infinity,right=-Infinity,bottom=Infinity,top=-Infinity;
      for(let i=0;i<coordinates.length;i+=3){const depth=distance-coordinates[i+2],x=coordinates[i]/depth,y=coordinates[i+1]/depth;left=Math.min(left,x);right=Math.max(right,x);bottom=Math.min(bottom,y);top=Math.max(top,y);}
      return {width:(right-left)*scale,height:(top-bottom)*scale,centerX:innerWidth/2+(left+right)*scale/2,centerY:innerHeight/2-(bottom+top)*scale/2};
    };
    for(let i=0;i<15;i++){const middle=(near+far)/2,view=projected(middle);if(view.width>width||view.height>height)near=middle;else far=middle;}
    const distance=far*1.02,view=projected(distance);
    // The longer lens needs more room while keeping the same usable zoom range.
    const lensScale=lensDistanceScale();
    controls.minDistance=5*lensScale;
    controls.maxDistance=Math.max(80*lensScale,distance*1.15);
    camera.near=.05*lensScale;
    camera.far=controls.maxDistance+Math.max(20,diagonal*1.5);
    scene.fog.near=camera.far;
    scene.fog.far=camera.far+50*lensScale;
    controls.target.copy(center);camera.position.copy(center).addScaledVector(direction,distance);
    camera.setViewOffset(innerWidth,innerHeight,view.centerX-frameX,view.centerY-frameY,innerWidth,innerHeight);
    controls.update();
    return;
  }
  controls.minDistance=1.9;
  const mobile = innerWidth < 700;
  if(resourceMode){scene.fog.near=5;scene.fog.far=12;controls.maxDistance=6;}
  if(resourceMode && waterFramed){
    camera.position.set(mobile?6.1:3.8,mobile?2.5:2.0,mobile?6.4:4.65);
    controls.target.set(mobile?0:-.22,mobile?-1.0:.32,mobile?1.05:.90);
    controls.maxDistance=10;
    if(mobile){
      const top=document.querySelector('.view-hint').getBoundingClientRect().bottom+10;
      const bottom=document.querySelector('.controls').getBoundingClientRect().top-12;
      const points=[[-.36,.13,-.46],[.36,.13,-.46],[0,.91,0],[0,.16,.40],[-.24,-.035,2.49],[.24,-.035,2.49]];
      function waterFrame(){
        camera.lookAt(controls.target);camera.updateMatrixWorld();
        let left=Infinity,right=-Infinity,upper=Infinity,lower=-Infinity;
        for(const point of points){
          const p=new THREE.Vector3().fromArray(point).project(camera);
          const x=(1+p.x)*innerWidth/2,y=(1-p.y)*innerHeight/2;
          left=Math.min(left,x);right=Math.max(right,x);upper=Math.min(upper,y);lower=Math.max(lower,y);
        }
        return {left,right,upper,lower};
      }
      const initial=waterFrame();
      const distanceScale=Math.max(1,(initial.right-initial.left)/Math.max(1,innerWidth-32),
        (initial.lower-initial.upper)/Math.max(68,bottom-top));
      camera.position.sub(controls.target).multiplyScalar(distanceScale).add(controls.target);
      controls.maxDistance=Math.max(10,camera.position.distanceTo(controls.target)*1.1);
      const {left,right,upper,lower}=waterFrame();
      camera.setViewOffset(innerWidth,innerHeight,(left+right-innerWidth)/2,(upper+lower-top-bottom)/2,innerWidth,innerHeight);
    }else{
      const distanceScale=Math.max(1,570/(innerWidth-440));
      camera.position.sub(controls.target).multiplyScalar(distanceScale).add(controls.target);
      camera.setViewOffset(innerWidth,innerHeight,-210,0,innerWidth,innerHeight);
    }
    controls.update();
    return;
  }
  if(resourceMode&&mobile){
    const top=document.querySelector('.view-hint').getBoundingClientRect().bottom+12;
    const bottom=document.querySelector('.controls').getBoundingClientRect().top-12;
    const available=Math.max(120,bottom-top);
    const distance=innerHeight*.95/(2*halfFovTan(camera.fov)*available);
    controls.target.set(0,.43,0);
    camera.position.copy(controls.target).addScaledVector((tailDanceFramed?new THREE.Vector3(2.45,.85,2.55):new THREE.Vector3(1.55,.85,3.25)).normalize(),distance);
    camera.setViewOffset(innerWidth,innerHeight,0,innerHeight/2-(top+bottom)/2,innerWidth,innerHeight);
    controls.maxDistance=Math.max(10,distance*1.5);
    scene.fog.near=Math.max(5,distance+1.5);scene.fog.far=scene.fog.near+7;
    controls.update();
    return;
  }
  if(resourceMode&&tailDanceFramed){
    camera.position.set(2.45,1.25,2.55);controls.target.set(-.30,.43,0);controls.update();return;
  }
  camera.position.set(mobile ? (resourceMode?1.8:1.5) : 1.55, mobile ? (resourceMode?1.25:1.4) : 1.35, mobile ? (resourceMode?4.6:3.8) : 3.25);
  controls.target.set(mobile ? 0 : -.30, mobile ? (resourceMode?-.30:.05) : .45, 0);
  controls.update();
}
resetView();
$('reset-view').addEventListener('click', resetView);

const ambient = new THREE.HemisphereLight('#eef9ff', '#b5c498', 2.5);
scene.add(ambient);
const key = new THREE.DirectionalLight('#fff1d9', 3.1);
key.position.set(-2.5, 4.5, 3);
key.castShadow = true;
Object.assign(key.shadow.camera, { left: -2.3, right: 2.3, top: 2.3, bottom: -2.3, near: .1, far: 10 });
key.shadow.mapSize.set(2048, 2048);
key.shadow.normalBias = .012;
key.shadow.bias = -.00015;
key.shadow.radius = 3;
scene.add(key);
const fill = new THREE.DirectionalLight('#e1efff', 1.1);
fill.position.set(3, 2, -2);
scene.add(fill);
const toon=resourceMode?createToonStyle({renderer,scene,ambient,key,fill}):null;

const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#d5dfca', roughness: 1 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -.035;
floor.receiveShadow = true;
scene.add(floor);
const stage = new THREE.Mesh(new THREE.CylinderGeometry(1.53, 1.55, .035, 96), new THREE.MeshStandardMaterial({ color: '#e6e8cb', roughness: .95 }));
stage.position.y = -.0175;
stage.receiveShadow = true;
scene.add(stage);
const border = new THREE.Mesh(new THREE.RingGeometry(1.46, 1.485, 96), new THREE.MeshBasicMaterial({ color: '#b5c6a6', side: THREE.DoubleSide }));
border.rotation.x = -Math.PI / 2;
border.position.y = .001;
scene.add(border);
const dots = new THREE.Group();
for (let i = 0; i < 32; i++) {
  const a = i / 32 * Math.PI * 2;
  const dot = new THREE.Mesh(new THREE.CircleGeometry(.008, 6), new THREE.MeshBasicMaterial({ color: '#c6d2b6' }));
  dot.rotation.x = -Math.PI / 2;
  dot.position.set(Math.sin(a)*1.36, .0015, Math.cos(a)*1.36);
  dots.add(dot);
}
scene.add(dots);
if(toon){toon.apply(floor,'stage');toon.apply(stage,'stage');}
const destination = new THREE.Mesh(new THREE.RingGeometry(.065, .083, 48), new THREE.MeshBasicMaterial({ color: '#6c9c80', transparent: true, opacity: .8, side: THREE.DoubleSide }));
destination.rotation.x = -Math.PI / 2;
destination.visible = false;
scene.add(destination);
const destinationMarker=resourceMode?createDestinationMarker(scene):null;

const actor = new THREE.Group();
actor.position.y = .005;
scene.add(actor);
const visualPivot=new THREE.Group();actor.add(visualPivot);
const motion={speed:0,bank:0,pitch:0};
const gardenRunSpeedMultiplier = 1.25;
let model, mixer, active, currentName, target = null;
const actions = new Map();
const state = { loaded: false, paused: false, rate: 1, waterRate: 1, movement: false, travelGait:'Run', transitions: 0 };
const labels = { Idle: '待机 · 轻轻呼吸', Walk: '走路 · 小步慢走', PetReaction: '摸头 · 开心摇尾' };
if(resourceMode)Object.assign(labels,{Walk:'走路 · 轻快小步',Run:'小跑 · 蹬地轻跳',Eat:'进食 · 低头咀嚼',WaterCharge:'蓄力 · 稳住身体',WaterShoot:'喷水 · 张嘴发射',Swim:'游泳 · 划水摆尾',SwimIdle:'漂浮 · 轻轻踩水',DanceA:'跳舞 · 摇摇踏踏舞',DanceB:'跳舞 · 扭扭尾巴舞',DanceC:'庆祝 · 转圈庆祝舞'});
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function makeHeart() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ee9e98';
  ctx.beginPath(); ctx.moveTo(64, 110);
  ctx.bezierCurveTo(45, 94, 12, 67, 12, 40);
  ctx.bezierCurveTo(12, 5, 56, 6, 64, 33);
  ctx.bezierCurveTo(72, 6, 116, 5, 116, 40);
  ctx.bezierCurveTo(116, 67, 83, 94, 64, 110); ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
const heartTexture = makeHeart();
const hearts = [];
function showHearts() {
  clearHearts();
  for (let i = 0; i < 3; i++) {
    const heart = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTexture, transparent: true, depthWrite: false, toneMapped: false }));
    heart.scale.setScalar(.10 + i*.012);
    const start = actor.position.clone().add(new THREE.Vector3((i-1)*.16, 1.03 + i*.045, .05));
    heart.position.copy(start);
    scene.add(heart);
    hearts.push({ sprite: heart, start, age: -i*.12 });
  }
}
function clearHearts() {
  for (const h of hearts) { scene.remove(h.sprite); h.sprite.material.dispose(); }
  hearts.length = 0;
}
function stopTravel({arrived=false}={}) {
  footprints?.stop();
  target = null;
  gardenWalker?.cancel();motion.speed=0;motion.bank=0;motion.pitch=0;
  if(arrived)destinationMarker?.arrive();else destinationMarker?.hide();
  destination.visible = false;
}
function gardenFeedback(message){if($('garden-feedback'))$('garden-feedback').textContent=message;}
function isGardenDancePlaying(){return resourcePreview?.view==='garden'&&gardenDances.includes(currentName);}
function cancelGardenDanceRequest(){pendingGardenDance=null;}
function chooseGardenDance(){
  if(!danceBag.length){
    danceBag=[...gardenDances];
    for(let i=danceBag.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[danceBag[i],danceBag[j]]=[danceBag[j],danceBag[i]];}
    if(danceBag[0]===lastGardenDance)[danceBag[0],danceBag[1]]=[danceBag[1],danceBag[0]];
  }
  lastGardenDance=danceBag.shift();danceCounts[lastGardenDance]++;
  return lastGardenDance;
}
function startGardenDance({completedMeal=false}={}){
  if(!state.loaded||resourcePreview?.view!=='garden')return;
  cancelGardenDanceRequest();
  if(completedMeal)playClip('Idle',{completed:true});
  cancelGardenMeal();skillInput?.cancel();combat?.setMode('move');combat?.cancel();
  stopTravel();clearHearts();
  const name=chooseGardenDance();
  state.paused=false;updatePauseUI();playClip(name,{force:true});
  gardenFeedback({DanceA:'摇摇踏踏，跳支舞给你看～',DanceB:'扭扭尾巴，跟上节奏～',DanceC:'转个圈，开心庆祝一下！'}[name]);
}
function requestGardenDance(){
  if(!state.loaded||resourcePreview?.view!=='garden'||groundSkillActive())return;
  state.paused=false;updatePauseUI();
  if(isGardenDancePlaying()){gardenFeedback('这支还没跳完，等我一下～');return;}
  if(pendingGardenDance){gardenFeedback(pendingGardenDance.kind==='meal'?'吃完这颗果子就跳给你看～':'上岸后就跳给你看～');return;}
  if(gardenMeal?.phase==='eating'){
    pendingGardenDance={kind:'meal'};gardenFeedback('吃完这颗果子就跳给你看～');return;
  }
  if(swimming&&swimming.debug().phase!=='land'){
    const request=pendingGardenDance={kind:'shore'};
    cancelGardenMeal();gardenFeedback('上岸后就跳给你看～');
    swimming.leave(()=>{if(pendingGardenDance===request&&resourcePreview?.view==='garden')startGardenDance();});
    return;
  }
  startGardenDance();
}
function setGardenMenu(open){
  const toggle=$('garden-menu-toggle');if(!toggle)return;
  toggle.setAttribute('aria-expanded',String(open));
  const label=open?'收起菜单':'展开菜单';toggle.setAttribute('aria-label',label);toggle.title=label;
  $('garden-menu-panel').hidden=!open;
}
document.addEventListener('pointerdown',event=>{if(!$('garden-menu')?.contains(event.target))setGardenMenu(false);});
function cancelGardenMeal(){gardenMeal=null;}
const mealTurn=new THREE.Quaternion(),upAxis=new THREE.Vector3(0,1,0),mealForward=new THREE.Vector3();
const mealViewLimit=THREE.MathUtils.degToRad(72);
function keepMealFaceVisible(delta,beforeBite){
  const cameraYaw=Math.atan2(camera.position.x-actor.position.x,camera.position.z-actor.position.z);
  let yaw;
  if(beforeBite){
    const [x,,z]=gardenMeal.center;
    yaw=Math.atan2(x-actor.position.x,z-actor.position.z);
  }else{
    mealForward.set(0,0,1).applyQuaternion(actor.quaternion);
    yaw=Math.atan2(mealForward.x,mealForward.z);
  }
  const fromCamera=THREE.MathUtils.euclideanModulo(yaw-cameraYaw+Math.PI,2*Math.PI)-Math.PI;
  if(!beforeBite&&Math.abs(fromCamera)<=mealViewLimit)return true;
  mealTurn.setFromAxisAngle(upAxis,cameraYaw+THREE.MathUtils.clamp(fromCamera,-mealViewLimit,mealViewLimit));
  actor.quaternion.rotateTowards(mealTurn,(beforeBite?7:4.5)*delta);
  return actor.quaternion.angleTo(mealTurn)<.025;
}
function goEatGardenFruit(fruitId=null){
  if(!state.loaded||resourcePreview?.view!=='garden'||groundSkillActive())return;
  const source=fruitId?resourcePreview.orchard.groundFruit(fruitId):resourcePreview.basketInfo;
  if(!source||gardenMeal?.phase==='eating'||(gardenMeal&&gardenMeal.fruitId===fruitId))return;
  cancelGardenDanceRequest();
  state.paused=false;updatePauseUI();
  if(swimming?.leave(()=>goEatGardenFruit(fruitId)))return;
  const center=new THREE.Vector3().fromArray(source.center);
  const distance=fruitId ? .42 : source.radius+navigation.settings.actorRadius+navigation.settings.skin+.07;
  const towardCamera=camera.position.clone().sub(center).setY(0).normalize();
  let best=null;
  for(let i=0;i<32;i++){
    const angle=i*Math.PI/16,goal={x:center.x+Math.sin(angle)*distance,z:center.z+Math.cos(angle)*distance};
    if(!navigation.isWalkable(goal))continue;
    const plan=navigation.plan(actor.position,goal);
    if(!plan.ok||Math.hypot(plan.goal.x-goal.x,plan.goal.z-goal.z)>=.025)continue;
    const facing=((center.x-goal.x)*towardCamera.x+(center.z-goal.z)*towardCamera.z)/distance;
    // Favor a short walk when the fruit already lies in front of or beside the view.
    const score=plan.length+2.5*Math.max(0,.50-facing);
    if(!best||score<best.score)best={goal,score};
  }
  if(!best){gardenFeedback('暂时走不到果子旁，换个位置再试试。');return;}
  const plan=moveTo(new THREE.Vector3(best.goal.x,0,best.goal.z));if(!plan?.ok)return;
  const biteTime=clipSettings.get('Eat').events.find(event=>event.event==='food_consume')?.time??.7;
  gardenMeal={phase:plan.waypoints.length?'walking':'settling',wait:0,center:source.center,fruitId,biteTime};
  gardenFeedback(fruitId?`这就过去吃${source.name}！`:'去果篮旁吃一颗果子，等我一下。');
}
function setGait(name){
  state.travelGait=name;
  const toggle=$('garden-gait');
  if(toggle){toggle.setAttribute('aria-checked',String(name==='Run'));toggle.title=name==='Run'?'切换为轻快走':'切换为小跑';}
  if(target&&resourcePreview?.view==='garden'&&!swimming?.inWater)playClip(name);
}
function resetActor(){
  cancelGardenDanceRequest();
  swimming?.reset();resourcePreview?.pondWater.reset();
  resourcePreview?.meadow.reset();
  resourcePreview?.windChime?.reset();
  tackle?.reset();
  mud?.reset();
  footprints?.reset();
  cancelGardenMeal();
  skillInput?.cancel();
  combat?.cancel();
  stopTravel();
  visualPivot.rotation.set(0,0,0);
  if(resourcePreview?.view==='garden'){
    actor.position.fromArray(resourcePreview.layout.spawn.position);
    actor.position.y=(resourcePreview.groundHeight(actor.position.x,actor.position.z)??actor.position.y)+.005;
    actor.rotation.set(0,resourcePreview.layout.spawn.yaw,0);
    gardenFeedback('回到起点啦，点我可以跳舞～');
  }else{actor.position.set(0,.005,0);actor.quaternion.identity();}
}
function playClip(name, { immediate = false, force = false, completed = false,gameShot=null } = {}) {
  if (!state.loaded || (!force && name === currentName)) return;
  if(gardenMeal?.phase==='eating'&&name!=='Eat'){
    if(completed&&currentName==='Eat'){
      mealsEaten++;
      gardenFeedback('吃完啦！可以接着点下一颗。');
    }
    cancelGardenMeal();
  }
  combat?.restorePose();
  tackle?.restorePose();
  mud?.restorePose();
  const next = actions.get(name);
  if (!next) throw new Error(`Missing animation: ${name}`);
  const previous = active;
  for (const a of actions.values()) {
    if (a !== previous && a !== next) a.stop();
  }
  const waterAction=name==='WaterShoot'||name==='WaterCharge';
  const looping=!!clipSettings.get(name).loop&&!(resourcePreview?.view==='garden'&&gardenDances.includes(name));
  next.setLoop(looping?THREE.LoopRepeat:THREE.LoopOnce,looping?Infinity:1);next.clampWhenFinished=!looping;
  const transition=resourceMode&&(locomotion(name)||locomotion(currentName))?(metadata.locomotionTransition??.12):.22;
  next.stopFading().reset().setEffectiveWeight(1).setEffectiveTimeScale(locomotion(name) ? state.rate : waterAction?state.waterRate:1).play();
  if (previous && previous !== next && !immediate) {
    previous.stopFading().fadeOut(transition);
    next.fadeIn(transition);
  } else if (immediate) {
    for (const a of actions.values()) if (a !== next) a.stop();
  }
  active = next;
  currentName = name;
  eyeExpressions?.update(name,0);
  const wasTailDanceFramed=tailDanceFramed;tailDanceFramed=name==='DanceB';
  resourcePreview?.onActionChange(name,{completed,gameShot});
  combat?.onActionChange(name,{completed});
  if(resourceMode && resourcePreview?.view==='stage'){
    if(waterAction && !waterFramed){waterFramed=true;resetView();}
    else if(!waterAction && !completed && waterFramed){waterFramed=false;resetView();}
    else if(wasTailDanceFramed!==tailDanceFramed&&!completed)resetView();
  }
  const waterControls=resourceMode&&(waterFramed||waterAction);
  document.querySelector('label[for="rate"]').textContent=waterControls?'喷水播放速度':resourceMode?'走路 / 小跑步频':'走路步频';
  Object.assign($('rate'),waterControls?{min:.25,max:1,step:.25,value:state.waterRate}:{min:.5,max:1.8,step:.1,value:state.rate});
  $('rate-value').value=`${(waterControls?state.waterRate:state.rate).toFixed(2).replace(/0$/,'')}×`;
  state.transitions++;
  $('clip-label').textContent = labels[name];
  $('duration').textContent = `${next.getClip().duration.toFixed(1)} s`;
  $('playback-note').textContent = looping ? '循环播放' : '结束后回到待机';
  document.querySelectorAll('[data-clip]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.clip === name)));
}
function pet() {
  if (!state.loaded) return;
  cancelGardenDanceRequest();
  if(swimming?.busy)return;
  swimming?.hold();
  stopTravel();
  cancelGardenMeal();
  skillInput?.cancel();
  combat?.cancel();
  state.paused = false;
  updatePauseUI();
  playClip('PetReaction', { force: true });
  showHearts();
}
function updatePauseUI() {
  if(state.paused)skillInput?.cancel();
  const label=state.paused?'继续':'暂停';$('pause').textContent=label;
  if($('garden-pause')){
    $('garden-pause').setAttribute('aria-label',label);$('garden-pause').title=label;
    $('garden-pause').setAttribute('aria-pressed',String(state.paused));
    $('garden-pause-icon').setAttribute('href',state.paused?'#ui-play':'#ui-pause');
    $('garden-pause-caption').textContent=label;
  }
}
document.querySelectorAll('[data-clip]').forEach((button) => button.addEventListener('click', () => {
  if (button.dataset.clip === 'PetReaction') { pet(); return; }
  if(['Walk','Run'].includes(button.dataset.clip))setGait(button.dataset.clip);
  stopTravel(); clearHearts();
  state.paused = false; updatePauseUI();
  playClip(button.dataset.clip, { force: true });
}));
$('pause').addEventListener('click', () => { state.paused = !state.paused; updatePauseUI(); });
$('rate').addEventListener('input', (e) => {
  if(resourceMode&&(waterFramed||currentName==='WaterShoot'||currentName==='WaterCharge')){
    state.waterRate=Number(e.target.value);
    $('rate-value').value=`${state.waterRate.toFixed(2).replace(/0$/,'')}×`;
    actions.get('WaterShoot')?.setEffectiveTimeScale(state.waterRate);
    actions.get('WaterCharge')?.setEffectiveTimeScale(state.waterRate);
    return;
  }
  state.rate = Number(e.target.value);
  $('rate-value').value = `${state.rate.toFixed(1)}×`;
  actions.get('Walk')?.setEffectiveTimeScale(state.rate);
  actions.get('Run')?.setEffectiveTimeScale(state.rate);
});
$('movement').addEventListener('change', (e) => {
  state.movement = e.target.checked;
  stopTravel();
  if (state.movement && resourcePreview?.view!=='garden') {
    moveTo(new THREE.Vector3(actor.position.x > 0 ? -.6 : .6, 0, -.3));
  } else {
    playClip('Idle');
  }
});
function seek(time) {
  if (!active) return;
  combat?.restorePose();
  state.paused = true; updatePauseUI();
  for (const a of actions.values()) if (a !== active) a.stop();
  active.stopFading().setEffectiveWeight(1);
  active.time = THREE.MathUtils.clamp(time, 0, active.getClip().duration - 1e-7);
  mixer.update(0);
  eyeExpressions?.update(currentName,active.time);
  model.updateMatrixWorld(true);
  updateTimeline();
}
$('timeline').addEventListener('input', (e) => seek(Number(e.target.value) / 1000 * active.getClip().duration));
function updateTimeline() {
  if (!active) return;
  const duration = active.getClip().duration;
  $('timeline').value = Math.round(active.time / duration * 1000);
  $('time').value = `${active.time.toFixed(2)} / ${duration.toFixed(2)} s`;
}
function moveTo(point,{fromSwimming=false}={}) {
  if (!state.loaded||groundSkillActive()) return;
  cancelGardenDanceRequest();
  if(resourcePreview?.view==='garden'){
    cancelGardenMeal();
    skillInput?.cancel();
    combat?.setMode('move');combat?.cancel();updateCombatUI();
    if(!fromSwimming){const result=swimming?.request(resourcePreview.pondWater.swimTarget(point));if(result?.handled){state.paused=false;updatePauseUI();return result.plan;}}
    const plan=gardenWalker.start(actor.position,point);
    if(!plan.ok){stopTravel();gardenFeedback('这里暂时走不过去，试试旁边的草地。');playClip('Idle');return plan;}
    if(!plan.waypoints.length){stopTravel();playClip('Idle');return plan;}
    target=new THREE.Vector3(plan.goal.x,0,plan.goal.z);
    destinationMarker.show(new THREE.Vector3(plan.goal.x,(resourcePreview.groundHeight(plan.goal.x,plan.goal.z)??0)+.025,plan.goal.z));
    gardenFeedback(plan.adjusted?'那里有障碍，会停在附近的草地。':plan.waypoints.length>1?'找到路线啦，绕过去看看。':'正在过去啦…');
    state.paused=false;updatePauseUI();clearHearts();playClip(state.travelGait);return plan;
  }
  target = point.clone(); target.y = 0;
  if (target.length() > 1.05) target.setLength(1.05);
  destination.position.copy(target); destination.position.y = .003;
  if(destinationMarker)destinationMarker.show(destination.position);else destination.visible = true;
  destination.scale.setScalar(1);
  state.paused = false; updatePauseUI(); clearHearts();
  playClip(currentName === 'Run' ? 'Run' : 'Walk');
}
let down;
function setPointerRay(event){
  const rect=renderer.domElement.getBoundingClientRect();
  pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
  camera.updateMatrixWorld();
  raycaster.setFromCamera(pointer,camera);
}
function characterInFront(hit,aimed){
  return hit&&(!aimed||hit.distance<=aimed.distance+.01);
}
function setFruitHover(id){
  resourcePreview?.orchard.setHover(id);
  renderer.domElement.style.cursor=id?'pointer':'';
}
function updateOrbitInput(){
  controls.enabled=!skillInput?.debug().active;
}
renderer.domElement.addEventListener('pointerdown',()=>{
  // Reconcile the lock before OrbitControls handles a new canvas gesture.
  updateOrbitInput();
  setFruitHover();
},true);
renderer.domElement.addEventListener('pointerdown', (e) => { down = e.isPrimary?{ x: e.clientX, y: e.clientY, button: e.button,id:e.pointerId }:null; });
renderer.domElement.addEventListener('pointermove',e=>{
  if(down?.id===e.pointerId&&!down.dragged&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>6){
    down.dragged=true;
  }
  if(down||e.buttons||e.pointerType!=='mouse'||resourcePreview?.view!=='garden')return;
  setPointerRay(e);
  const candidate=resourcePreview.orchard.nearbyGroundFruit(raycaster.ray);
  if(!candidate){setFruitHover();return;}
  const aimed=resourcePreview.pickAim(raycaster);
  const character=aimed?.fruit&&raycaster.intersectObject(model,true)[0];
  setFruitHover(characterInFront(character,aimed)?null:aimed?.fruit?.id);
});
renderer.domElement.addEventListener('pointerleave',()=>setFruitHover());
renderer.domElement.addEventListener('pointercancel',()=>{down=null;setFruitHover();});
renderer.domElement.addEventListener('lostpointercapture',()=>{down=null;});
renderer.domElement.addEventListener('pointerup', (e) => {
  const start=down;down=null;
  if (!start || start.dragged || start.id!==e.pointerId || start.button !== 0 || Math.hypot(e.clientX-start.x, e.clientY-start.y) > 6 || !state.loaded) return;
  setPointerRay(e);
  const hits = raycaster.intersectObject(model, true);
  if(resourcePreview?.view==='garden'){
    if(groundSkillActive())return;
    const aimed=resourcePreview.pickAim(raycaster,{touch:e.pointerType==='touch'});
    if(characterInFront(hits[0],aimed)){requestGardenDance();return;}
    if(aimed?.fruit){goEatGardenFruit(aimed.fruit.id);return;}
    if(aimed?.basket){goEatGardenFruit();return;}
    if(aimed?.targetId){aimGardenTarget(aimed.point,aimed.targetId);return;}
  }
  if (resourcePreview?.view!=='garden'&&hits.length) { pet(); return; }
  if (state.movement) {
    if(resourcePreview?.view==='garden'){
      const point=resourcePreview.pickDestination(raycaster);if(point)moveTo(point);return;
    }
    const point = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(groundPlane, point) && point.length() < 1.5) moveTo(point);
  }
});

function forwardWaterPoint(){
  const forward=new THREE.Vector3(0,0,1).applyQuaternion(actor.quaternion);forward.y=0;forward.normalize();
  const point=actor.position.clone().addScaledVector(forward,2.8);
  point.y=(resourcePreview.groundHeight(point.x,point.z)??actor.position.y-.005)+.02;return point;
}
function castWaterSkill(){
  if(!combat||resourcePreview.view!=='garden'||state.paused||swimming?.busy||groundSkillActive()||combat.debug().phase!=='idle')return false;
  if(!combat.debug().targetId)combat.aimAt(forwardWaterPoint(),null,{silent:true});
  const fired=combat.fire(state.paused);updateCombatUI();return fired;
}

function aimGardenTarget(point,id){
  if(groundSkillActive())return;
  cancelGardenDanceRequest();
  if(combat.aimAt(point,id)&&resourcePreview.layout.targets.some(target=>target.id===id)){
    gardenFeedback(`已锁定${combat.debug().targetName}，可以喷水或掷泥，近距离也能撞击。`);
  }
  updateCombatUI();
}

function castGroundSkill(skill){
  if(!skill||resourcePreview.view!=='garden'||state.paused||groundSkillActive()||swimming.inWater||skillInput?.debug().active)return false;
  if(skill===mud&&!mud.ready)return false;
  const aim=combat.debug();
  if(aim.phase!=='idle')return false;
  const locked=resourcePreview.layout.targets.some(target=>target.id===aim.targetId)?aim.targetId:null;
  cancelGardenDanceRequest();cancelGardenMeal();swimming.reset();stopTravel();clearHearts();combat.restorePose();
  playClip('Idle',{immediate:true});
  const started=skill.start(locked?resourcePreview.targetPoint(locked):null,locked);
  if(started&&skill===mud)gardenFeedback('用前爪刨一点泥…');
  updateCombatUI();
  return started;
}
const castTackle=()=>castGroundSkill(tackle);
const castMud=()=>castGroundSkill(mud);

function updateCombatUI(){
  if(!combat)return;
  const info=combat.debug(),garden=resourcePreview.view==='garden',busy=info.phase!=='idle';
  const tackling=!!tackle?.active;
  const groundBusy=groundSkillActive();
  const gesture=skillInput?.debug()??{active:false,dragging:false,offset:[0,0]};
  const basket=resourcePreview.basketInfo;
  $('garden-basket').hidden=!garden||!basket;
  if(garden&&basket){
    const p=new THREE.Vector3().fromArray(basket.center).project(camera);
    $('garden-basket').hidden=p.z>1||Math.abs(p.x)>1||Math.abs(p.y)>1;
    $('garden-basket').style.left=`${(p.x+1)*innerWidth/2}px`;$('garden-basket').style.top=`${(1-p.y)*innerHeight/2}px`;
    $('garden-basket').setAttribute('aria-pressed',String(!!gardenMeal&&!gardenMeal.fruitId));
    $('garden-basket').dataset.paused=String(state.paused);
  }
  const groundDisabled=!garden||state.paused||busy||groundBusy||!!swimming?.inWater||gesture.active;
  $('garden-fire').disabled=state.paused||busy||groundBusy||!!swimming?.busy;
  $('garden-tackle').disabled=groundDisabled;
  $('garden-mud').disabled=groundDisabled||!mud?.ready;
  $('garden-tackle').dataset.busy=String(tackling);
  $('garden-tackle').setAttribute('aria-busy',String(tackling));
  $('garden-mud').dataset.busy=String(!mud?.ready);
  $('garden-mud').setAttribute('aria-busy',String(!mud?.ready));
  $('garden-fire').dataset.busy=String(busy);$('garden-fire').dataset.aiming=String(gesture.active);
  $('garden-fire').setAttribute('aria-busy',String(busy));
  $('skill-title').textContent=info.phase==='turning'?'转身':info.phase==='shooting'?(active.time<.33?'蓄水':active.time<.66?'喷水':'恢复'):'水枪';
  $('skill-caption').textContent=state.paused?'已暂停':swimming?.busy?(swimming.debug().phase==='entering'?'正在入水…':'正在上岸…'):gesture.active?'松手喷水':busy?'准备下一发…':'点按喷水 · 拖动瞄准';
  const length=Math.hypot(...gesture.offset),scale=length>0?Math.min(length,22)/length:0;
  $('skill-thumb').style.transform=`translate(${gesture.offset[0]*scale}px,${gesture.offset[1]*scale}px)`;
  $('skill-stick').hidden=!gesture.active;
  $('garden-fire').style.setProperty('--cooldown',`${busy&&info.phase==='shooting'?Math.min(1,active.time)*360:360}deg`);
  if(info.phase==='shooting'&&!info.lastContact)gardenFeedback(active.time<.33?'闭嘴蓄水…':active.time<.66?'水枪发射！':'水流正在飞向目标…');
  $('garden-hit-count').textContent=String(resourcePreview.targetFeedback.debug().total).padStart(2,'0');
  $('aim-reticle').hidden=!garden||!info.point||groundBusy;
  if(garden&&info.point&&!groundBusy){
    const p=new THREE.Vector3().fromArray(info.point).project(camera),visible=p.z<1&&p.z>-1&&Math.abs(p.x)<1&&Math.abs(p.y)<1;
    $('aim-reticle').hidden=!visible;
    $('aim-reticle').style.left=`${(p.x+1)*innerWidth/2}px`;$('aim-reticle').style.top=`${(1-p.y)*innerHeight/2}px`;
    const ready=info.assessment?.reachable&&info.assessment?.clear;
    $('aim-reticle').dataset.ready=String(ready);$('aim-reticle').dataset.firing=String(busy);
    const status=gesture.active?'松手喷水':info.assessment?.blocked?'被遮挡':!info.assessment?.reachable?'距离太远':info.targetId?'可命中':'已瞄准';
    $('aim-label').textContent=`${info.targetName} · ${status}`;
  }
  const hit=resourcePreview.targetFeedback.debug();
  const recent=hit.targets.filter(t=>t.hits&&t.age<.75).sort((a,b)=>a.age-b.age)[0];
  $('garden-score').dataset.hit=String(!!recent&&recent.age<.3);
  const waterHit=recent?.kind==='water'&&recent.age>=.10;
  $('hit-pop').hidden=!garden||!waterHit;
  if(garden&&waterHit){const p=resourcePreview.targetPoint(recent.id).add(new THREE.Vector3(0,.25+recent.age*.5,0)).project(camera);$('hit-pop').style.left=`${(p.x+1)*innerWidth/2}px`;$('hit-pop').style.top=`${(1-p.y)*innerHeight/2}px`;$('hit-pop').style.opacity=String(1-THREE.MathUtils.smoothstep(recent.age,.45,.75));}
  for(const b of document.querySelectorAll('[data-aim-target]')){
    const id=b.dataset.aimTarget,p=resourcePreview.targetPoint(id).project(camera);
    b.hidden=!garden||p.z>1||Math.abs(p.x)>1||Math.abs(p.y)>1;
    b.style.left=`${(p.x+1)*innerWidth/2}px`;b.style.top=`${(1-p.y)*innerHeight/2}px`;
    b.setAttribute('aria-pressed',String(info.targetId===id));
    b.dataset.hits=hit.targets.find(t=>t.id===id).hits;
  }
}
window.addEventListener('keydown',e=>{
  if(resourcePreview?.view!=='garden'||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
  if(e.code==='Space'&&e.target.tagName==='BUTTON'&&e.target.id!=='garden-fire')return;
  if(e.code==='Space'){e.preventDefault();if(!e.repeat&&!skillInput?.debug().active)castWaterSkill();}
  if(e.code==='Escape'){setGardenMenu(false);skillInput?.cancel();if(!groundSkillActive())combat.setMode('move');updateCombatUI();}
});

const diagnostics = { ready: false, version: THREE.REVISION, errors: [] };
window.__mudkipTest = {
  diagnostics,
  renderStats: () => ({ geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,programs:renderer.info.programs.length }),
  camera:()=>({enabled:controls.enabled,position:camera.position.toArray(),target:controls.target.toArray()}),
  facing:()=>actor.getWorldDirection(new THREE.Vector3()).toArray(),
  footprints:()=>footprints?.debug(),
  meadow:()=>resourcePreview?.meadow.debug(),
  windChime:()=>resourcePreview?.windChime?.debug(),
  expression:()=>eyeExpressions?.debug(),
  dance:()=>({playing:isGardenDancePlaying(),pending:pendingGardenDance?.kind??null,last:lastGardenDance,counts:{...danceCounts},completed:completedGardenDances}),
  characterPoint:()=>model.getObjectByName('Head').getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.14,0)).toArray(),
  tailPose:()=>['Hips','Tail1','Tail2'].map(name=>({name,position:model.getObjectByName(name).getWorldPosition(new THREE.Vector3()).toArray(),quaternion:model.getObjectByName(name).getWorldQuaternion(new THREE.Quaternion()).toArray()})),
  resources: () => resourcePreview ? { ...resourcePreview.stats,...resourcePreview.debug() } : null,
  foodContact:()=>resourcePreview?.foodContact(),
  basket:()=>({info:resourcePreview?.basketInfo,interaction:gardenMeal,mealsEaten}),
  orchard:()=>({fruits:resourcePreview?.orchard.debug(),mealType:resourcePreview?.foodType}),
  swimming:()=>swimming?.debug(),
  waves:()=>resourcePreview?.pondWater.sampleWaves(),
  disturbPond:(x,z,strength=1)=>resourcePreview?.pondWater.ripple(new THREE.Vector3(x,0,z),strength),
  splashPond:(x,z)=>resourcePreview?.pondWater.splash(new THREE.Vector3(x,0,z)),
  viewPond:()=>{const p=resourcePreview.pondWater.info;camera.clearViewOffset();controls.target.set(p.center[0],.1,p.center[1]);const scale=lensDistanceScale();camera.position.copy(controls.target).addScaledVector(new THREE.Vector3(1.9,2.4,3.2),scale);controls.minDistance=1.9*scale;controls.update();},
  style: () => toon?.debug(),
  poseState:()=>({head:model.getObjectByName('Head').quaternion.toArray(),headWorld:model.getObjectByName('Head').getWorldQuaternion(new THREE.Quaternion()).toArray(),jaw:model.getObjectByName('Jaw').quaternion.toArray(),mouth:model.getObjectByName('Socket_Mouth').getWorldPosition(new THREE.Vector3()).toArray(),feet:['LHand','RHand','LFoot','RFoot'].map(name=>({name,position:model.getObjectByName(name).getWorldPosition(new THREE.Vector3()).toArray()}))}),
  combat:()=>combat?{...combat.debug(),feedback:resourcePreview.targetFeedback.debug()}:null,
  skill:()=>skillInput?.debug(),
  tackle:()=>tackle?{...tackle.debug(),effects:tackleEffects.debug()}:null,
  mud:()=>mud?{...mud.debug(),effects:mudEffects.debug()}:null,
  castTackle,
  castMud,
  castSkill:castWaterSkill,
  aimAt:(x,y,z,id=null)=>combat?.aimAt(new THREE.Vector3(x,y,z),id),
  aimTarget:id=>combat?.aimAt(resourcePreview.targetPoint(id),id),
  fire:()=>combat?.fire(state.paused),
  destination: () => {let lines=0;scene.traverse(o=>{if(o.isLine)lines++;});return destinationMarker?{...destinationMarker.debug(),routeLines:lines}:null;},
  navigation: () => navigation?{...navigation.debug(),...gardenWalker.debug(),ground:resourcePreview.groundHeight(actor.position.x,actor.position.z)}:null,
  snapshot: () => ({ ...state,speed:motion.speed,visualLean:[visualPivot.rotation.x,visualPivot.rotation.z],clip: currentName, time: active?.time, position: actor.position.toArray(), target: target?.toArray() ?? null, actions: [...actions].map(([name,a]) => ({ name, weight: a.isScheduled() ? a.getEffectiveWeight() : 0, scheduled: a.isScheduled(), running: a.isRunning() })), hearts: hearts.length }),
  play: (name, immediate = false) => { cancelGardenDanceRequest();cancelGardenMeal();stopTravel(); clearHearts(); state.paused = false; updatePauseUI(); playClip(name, { immediate, force: true }); },
  seek,
  moveTo: (x,z) => { state.movement = true; $('movement').checked = true; return moveTo(new THREE.Vector3(x,0,z)); },
  pause: (value) => { state.paused = value; updatePauseUI(); },
  resetPosition: resetActor,
  advanceMovement: (seconds) => {
    const trace=[];let remaining=Math.max(0,Math.min(60,seconds));
    while(remaining>1e-7){const dt=Math.min(remaining,.05);stepSimulation(dt);trace.push(actor.position.toArray());remaining-=dt;}
    actor.updateMatrixWorld(true);if(resourcePreview&&active)resourcePreview.update(currentName,active.time,{paused:state.paused});return trace;
  },
  project: (x,y,z) => { camera.updateMatrixWorld();const v = new THREE.Vector3(x,y,z).project(camera); return { x: (v.x+1)/2*innerWidth, y: (1-v.y)/2*innerHeight }; },
  sample: (name, time) => {
    visualPivot.rotation.set(0,0,0);
    playClip(name, { force: true, immediate: true }); seek(time);
    const positions = [];
    let minimumWorldY=Infinity;
    model.traverse((o) => { if (o.isSkinnedMesh) { o.skeleton.update(); const p = o.geometry.attributes.position; for (let i=0;i<p.count;i++) { const v = new THREE.Vector3().fromBufferAttribute(p,i); o.applyBoneTransform(i,v); positions.push(...v);minimumWorldY=Math.min(minimumWorldY,v.applyMatrix4(o.matrixWorld).y); } } });
    const root = model.getObjectByName('MotionRoot');
    return { positions, minimumWorldY, jawQuaternion:model.getObjectByName('Jaw').quaternion.toArray(), rootPosition: root.getWorldPosition(new THREE.Vector3()).sub(actor.position).toArray(), rootQuaternion:root.getWorldQuaternion(new THREE.Quaternion()).toArray(),feet: ['LHand','RHand','LFoot','RFoot'].map((name) => ({ name, position: model.getObjectByName(name).getWorldPosition(new THREE.Vector3()).toArray(), quaternion:model.getObjectByName(name).getWorldQuaternion(new THREE.Quaternion()).toArray() })) };
  },
};

try {
  let gltf, previewAssets;
  const loader = new GLTFLoader();
  if (resourceMode) {
    const animationMetadata = fetch(resourceRoot + 'characters/mudkip/animations.json').then(response => {
      if (!response.ok) throw new Error('动画配置加载失败');
      return response.json();
    });
    [gltf, metadata, previewAssets] = await Promise.all([
      trackGardenLoad(loader.loadAsync(resourceRoot + 'characters/mudkip/mudkip.glb')),
      trackGardenLoad(animationMetadata),
      loadResourcePreviewAssets(resourceRoot, trackGardenLoad),
    ]);
    clipSettings = new Map(metadata.clips.map(clip => [clip.name, clip]));
  } else {
    gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}assets/mudkip.glb`);
  }
  model = gltf.scene;
  visualPivot.add(model);
  toon?.apply(model,'character');
  if(resourceMode)eyeExpressions=createEyeExpressions(model,metadata.expressions);
  const meshes = [], maps = new Set(), skeletons = new Set();
  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = false;
      meshes.push(o);
      for (const material of (Array.isArray(o.material) ? o.material : [o.material])) if (material.map) maps.add(material.map);
    }
    if (o.isSkinnedMesh) skeletons.add(o.skeleton);
  });
  mixer = new THREE.AnimationMixer(model);
  for (const clip of gltf.animations) {
    const action = mixer.clipAction(clip);
    const looping=clipSettings.get(clip.name)?.loop??false;
    action.setLoop(looping ? THREE.LoopRepeat : THREE.LoopOnce, looping ? Infinity : 1);
    action.clampWhenFinished = !looping;
    actions.set(clip.name, action);
  }
  for (const name of Object.keys(labels)) if (!actions.has(name)) throw new Error(`GLB 缺少 ${name} 动作`);
  mixer.addEventListener('finished',event=>{
    if(event.action!==active||event.action.loop!==THREE.LoopOnce)return;
    if(currentName==='Eat'&&pendingGardenDance?.kind==='meal'&&resourcePreview?.view==='garden'){startGardenDance({completedMeal:true});return;}
    const danced=isGardenDancePlaying();
    if(danced)completedGardenDances++;
    playClip(swimming?.inWater?'SwimIdle':'Idle',{completed:true});
    if(danced)gardenFeedback('跳完啦，点我再跳一支～');
  });
  if(resourceMode){
    resourcePreview=await createResourcePreview({renderer,scene,actor,model,root:resourceRoot,assets:previewAssets,metadata,stageColliders:[stage,floor],toon,heartTexture,onWaterContact:event=>combat?.contact(event)});
    footprints=createGardenFootprints({scene,actor,model,clips:metadata.clips,
      sampleSurface:resourcePreview.footprintSurface,isWater:point=>swimming?.contains(point)});
    combat=createGardenCombat({actor,model,preview:resourcePreview,
      onStop:()=>{cancelGardenDanceRequest();cancelGardenMeal();swimming?.hold();stopTravel();clearHearts();if(state.loaded)playClip(swimming?.inWater?'SwimIdle':'Idle');},
      onShoot:(point,id)=>{stopTravel();clearHearts();playClip('WaterShoot',{force:true,gameShot:{point,id}});},
      onMessage:gardenFeedback,onHit:(id,direction)=>{
        const fruit=resourcePreview.orchard.knockDown(id);
        if(fruit)return `${fruit}掉下来啦，点地上的果子就能吃！`;
        const push=direction?new THREE.Vector3().fromArray(direction).setY(0).normalize():undefined;
        resourcePreview.targetFeedback.hit(id,{direction:push});
      }});
    navigation=createGardenNavigation(resourcePreview.layout,{extraColliders:resourcePreview.extraColliders});gardenWalker=createGardenWalker(navigation);
    tackleEffects=createTackleEffects(resourcePreview.environment);
    tackle=createGardenTackle({actor,pivot:visualPivot,model,navigation,groundHeight:resourcePreview.groundHeight,
      targetContact:resourcePreview.tackleTargetContact,effects:tackleEffects,
      onPhase:(phase,kind)=>{
        if(phase==='windup')gardenFeedback('压低身体，准备撞击…');
        if(phase==='dash')gardenFeedback('蹬地，扑击！');
        if(phase==='hitstop')gardenFeedback('砰！撞中靶子了。');
        if(phase==='recover'){
          playClip('Idle');
          if(kind==='miss')gardenFeedback('急刹！走近靶子再试一次。');
          if(kind==='blocked')gardenFeedback('前面有障碍，刹住啦。');
        }
      },onHit:(id,direction,hold)=>resourcePreview.targetFeedback.hit(id,{kind:'tackle',direction,hold})});
    mudEffects=createMudEffects(resourcePreview.environment);
    mud=createGardenMud({actor,pivot:visualPivot,model,groundHeight:resourcePreview.groundHeight,
      trace:resourcePreview.traceMud,resolveTarget:resourcePreview.targetPoint,effects:mudEffects,
      onRelease:()=>gardenFeedback('把泥团甩出去！'),onContact:(contact,velocity)=>{
        if(contact.targetId){
          resourcePreview.targetFeedback.hit(contact.targetId,{kind:'mud',direction:velocity.clone().setY(0).normalize()});
          gardenFeedback('啪嗒！泥团粘在靶上了。');
        }else if(contact.kind==='water'){
          resourcePreview.pondWater.ripple(contact.point,.35);
          gardenFeedback('泥团落进水里了。');
        }else gardenFeedback('泥团落下了。');
      }});
    swimming=createGardenSwimming({actor,pond:resourcePreview.pondWater.info,
      walkTo:point=>moveTo(point,{fromSwimming:true}),isWalking:()=>gardenWalker.active,
      groundHeight:resourcePreview.groundHeight,onClip:name=>playClip(name),
      canAnimate:()=>!['PetReaction','WaterShoot','Eat',...gardenDances].includes(currentName),
      stroke:()=>currentName==='Swim'?active.time/active.getClip().duration:0,
      onMotion:({turn,speed,acceleration})=>{motion.bank=-THREE.MathUtils.clamp(turn,-1,1)*.065;motion.pitch=THREE.MathUtils.clamp(acceleration,-1,1)*.015;actions.get('Swim')?.setEffectiveTimeScale(.75+.25*Math.min(speed/.65,1));},
      onStop:()=>{stopTravel();cancelGardenMeal();combat.cancel();motion.bank=motion.pitch=0;},
      onMessage:gardenFeedback,onSplash:(point,options)=>resourcePreview.pondWater.splash(point,options),onLand:()=>footprints.wet()});
    if(!navigation.isWalkable([resourcePreview.layout.spawn.position[0],resourcePreview.layout.spawn.position[2]]))throw new Error('庭院出生点位于障碍内');
    toon.excludeUnstyled();
    const music = $('garden-bgm');
    const musicToggle = $('garden-music');
    music.volume = .25;
    const syncMusicToggle = () => {
      musicToggle.setAttribute('aria-pressed', String(!music.paused));
    };
    music.addEventListener('playing', syncMusicToggle);
    music.addEventListener('pause', syncMusicToggle);
    musicToggle.addEventListener('click', async () => {
      if (!music.paused) {
        music.pause();
        return;
      }
      try {
        if (music.error) music.load();
        await music.play();
      } catch (error) {
        if (error.name === 'AbortError') return;
        music.pause();
        syncMusicToggle();
        gardenFeedback('音乐播放失败，点开关重试。');
      }
    });
    $('scene-view').disabled=false;
    $('scene-view').addEventListener('change',(event)=>{
      const garden=event.target.value==='garden';
      musicToggle.hidden = !garden;
      $('garden-score').hidden = !garden;
      $('garden-menu').hidden = !garden;
      $('garden-dock').hidden = !garden;
      if (!garden) music.pause();
      setGardenMenu(false);
      setFruitHover();
      skillInput.cancel();
      controls.enabled=true;
      if(garden)state.waterRate=1;
      combat.setMode('move');combat.cancel();
      document.body.classList.toggle('garden-active',garden);
      resourcePreview.setView(event.target.value);
      waterFramed=false;
      stopTravel();clearHearts();playClip('Idle',{immediate:true});
      state.paused=false;updatePauseUI();
      state.movement=garden;$('movement').checked=garden;$('movement').disabled=false;
      [stage,border,dots].forEach((o)=>o.visible=!garden);
      floor.position.y=garden?-.54:-.035;
      resetActor();
      if(garden)gardenFeedback('点果树再按水枪，试试把果子打下来！');
      const extent=garden?7:2.3;
      Object.assign(key.shadow.camera,{left:-extent,right:extent,top:extent,bottom:-extent,far:garden?30:10});
      key.shadow.camera.updateProjectionMatrix();key.position.set(garden?-6:-2.5,garden?12:4.5,garden?8:3);
      toon.setView(garden?'garden':'stage');
      $('resource-hint').textContent=garden?'点果树瞄准 · 用水枪打落果子。':'十二段动作 · 可以逐帧查看。';
      $('view-hint').textContent=garden?'点 zuzu 跳舞 · 拖动旋转':'拖动旋转 · 滚轮缩放';
      resetView();
    });
    const changeView=(view)=>{$('scene-view').value=view;$('scene-view').dispatchEvent(new Event('change'));};
    $('enter-garden').addEventListener('click',()=>changeView('garden'));
    $('enter-garden').disabled=false;
    $('garden-back').addEventListener('click',()=>changeView('stage'));
    $('garden-menu-toggle').addEventListener('click',()=>setGardenMenu($('garden-menu-toggle').getAttribute('aria-expanded')!=='true'));
    $('garden-reset').addEventListener('click',()=>{resetActor();state.paused=false;updatePauseUI();playClip('Idle');});
    $('garden-camera').addEventListener('click',resetView);
    $('garden-pause').addEventListener('click',()=>{state.paused=!state.paused;updatePauseUI();});
    $('garden-gait').addEventListener('click',()=>setGait(state.travelGait==='Run'?'Walk':'Run'));
    document.querySelectorAll('[data-aim-target]').forEach(b=>b.addEventListener('click',()=>{aimGardenTarget(resourcePreview.targetPoint(b.dataset.aimTarget),b.dataset.aimTarget);renderer.domElement.focus({preventScroll:true});}));
    $('garden-basket').addEventListener('click',()=>{goEatGardenFruit();renderer.domElement.focus({preventScroll:true});});
    $('garden-tackle').addEventListener('click',castTackle);
    $('garden-mud').addEventListener('click',castMud);
    skillInput=createWaterSkillInput({button:$('garden-fire'),canStart:()=>resourcePreview.view==='garden'&&!state.paused&&!swimming.busy&&!groundSkillActive()&&combat.debug().phase==='idle',
      onStart:()=>{cancelGardenDanceRequest();skillAimBefore=combat.debug();controls.enabled=false;if(!skillAimBefore.targetId)combat.aimAt(forwardWaterPoint(),null,{silent:true});updateCombatUI();},
      onDrag:({x,y})=>{
        const forward=new THREE.Vector3();camera.getWorldDirection(forward);forward.y=0;forward.normalize();
        const right=new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0)).normalize();
        const direction=right.multiplyScalar(x).addScaledVector(forward,-y).normalize();
        const point=actor.position.clone().addScaledVector(direction,2.8);point.y=(resourcePreview.groundHeight(point.x,point.z)??actor.position.y-.005)+.02;
        combat.aimAt(point,null,{predict:false,silent:true});gardenFeedback('拖动调整方向，松手喷水。');updateCombatUI();
      },
      onRelease:()=>{controls.enabled=true;combat.fire(state.paused);updateCombatUI();},
      onCancel:()=>{controls.enabled=true;if(skillAimBefore?.point)combat.aimAt(new THREE.Vector3().fromArray(skillAimBefore.point),skillAimBefore.targetId,{silent:true});else{combat.setMode('move');combat.cancel();}gardenFeedback('已取消瞄准。');updateCombatUI();},
      onTap:castWaterSkill});
    $('garden-clear-hits').addEventListener('click',()=>{resourcePreview.targetFeedback.reset();gardenFeedback('命中次数清零啦，再来一轮。');updateCombatUI();});
  }
  state.loaded = true;
  diagnostics.clips = gltf.animations.map((a) => ({ name: a.name, duration: a.duration, tracks: a.tracks.length }));
  diagnostics.meshes = meshes.length;
  diagnostics.bones = [...skeletons].map((s) => s.bones.length);
  diagnostics.textures = [...maps].map((t) => ({ name: t.name, width: t.image.width, height: t.image.height, colorSpace: t.colorSpace }));
  document.querySelectorAll('.controls button, .controls input').forEach((e) => e.disabled = false);
  $('status').textContent = resourceMode ? `小伙伴准备好啦` : `GLB 已加载 · ${gltf.animations.length} 段动作 · ${[...skeletons][0].bones.length} 根骨骼`;
  playClip('Idle', { immediate: true });
  const params = new URLSearchParams(location.search);
  const initialScene = params.get('scene') ?? (location.pathname === '/' ? 'garden' : 'stage');
  if (resourceMode && initialScene === 'garden') {
    $('scene-view').value = 'garden';
    $('scene-view').dispatchEvent(new Event('change'));
  }
  const previewClip = params.get('clip');
  if(resourceMode&&resourcePreview.view==='stage'&&actions.has(previewClip))playClip(previewClip,{immediate:true});
  if (resourceMode) advanceGardenLoading();
} catch (error) {
  state.loaded = false;
  diagnostics.errors.push(error.message);
  showLoadError(error);
  console.error(error);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  if(resourceMode)resetView();
}
window.addEventListener('resize', resize);
resize();
let previousTime;
function stepSimulation(delta){
  if (mixer && !state.paused) {
    if(resourcePreview?.view==='garden')footprints?.update(delta);
    // Restore the authored pose before the mixer's unchanged-value cache runs.
    combat?.restorePose();
    tackle?.restorePose();
    mud?.restorePose();
    if(resourcePreview?.view==='garden'){
      if(!groundSkillActive())combat.update(delta);
      tackle.update(delta);
      mud.update(delta);
    }
    mixer.update(tackle?.holding?0:delta);
    if(resourcePreview?.view==='garden')swimming?.update(delta);
    if (target && locomotion(currentName)) {
      const waypoint=resourcePreview?.view==='garden'?gardenWalker.waypoint:target;
      const difference = new THREE.Vector3(waypoint?.x??target.x,actor.position.y,waypoint?.z??target.z).sub(actor.position); difference.y = 0;
      const distance = difference.length();
      const walkWeight = active.getEffectiveWeight();
      const step = locomotion(currentName).speed * state.rate * walkWeight * delta;
      if (distance < .00001&&!gardenWalker?.active) { stopTravel(); playClip('Idle'); }
      else {
        difference.normalize();
        const desired = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), Math.atan2(difference.x,difference.z));
        if(resourcePreview?.view==='garden'){
          const forward=new THREE.Vector3(0,0,1).applyQuaternion(actor.quaternion);
          const turn=Math.atan2(new THREE.Vector3().crossVectors(forward,difference).y,forward.dot(difference));
          actor.quaternion.rotateTowards(desired,(currentName==='Run'?9:7)*delta);
          const facing=new THREE.Vector3(0,0,1).applyQuaternion(actor.quaternion).dot(difference);
          const gait=locomotion(currentName),remaining=gardenWalker.remainingDistance(actor.position);
          const cruiseSpeed = gait.speed * state.rate * (currentName === 'Run' ? gardenRunSpeedMultiplier : 1);
          const desiredSpeed=Math.min(cruiseSpeed,Math.sqrt(2*(gait.deceleration??6)*remaining))*Math.max(.2,(facing+1)/2);
          const before=motion.speed,change=(desiredSpeed>before?(gait.acceleration??7):(gait.deceleration??6))*delta;
          motion.speed=THREE.MathUtils.clamp(desiredSpeed,before-change,before+change);
          active.setEffectiveTimeScale(motion.speed/gait.speed);
          motion.bank=-THREE.MathUtils.clamp(turn,-1,1)*.085*Math.min(1,motion.speed/1.5);
          motion.pitch=.018*Math.min(1,motion.speed/1.5)+THREE.MathUtils.clamp((motion.speed-before)/Math.max(delta,.001),-5,5)*.003;
          const result=gardenWalker.advance(actor.position,motion.speed*walkWeight*delta);
          const travelled=Math.hypot(result.position.x-actor.position.x,result.position.z-actor.position.z);
          const groundHit=resourcePreview.hitGround(result.position.x,result.position.z);
          actor.position.set(result.position.x,(groundHit?.point.y??actor.position.y-.005)+.005,result.position.z);
          footprints.step({name:currentName,time:active.time,action:state.transitions,distance:travelled,groundHit});
          if(result.finished||result.blocked){
            const adjusted=gardenWalker.debug().plan?.adjusted;stopTravel({arrived:!result.blocked});playClip('Idle');
            if(gardenMeal&& !result.blocked){gardenMeal.phase='settling';gardenMeal.wait=0;gardenFeedback('到果子旁啦，站稳吃一颗。');}
            else{cancelGardenMeal();gardenFeedback(result.blocked?'前面走不过去，选一块别的草地吧。':adjusted?'到附近的草地啦。':'到啦，再选一块草地吧。');}
          }
        }else{
          actor.quaternion.slerp(desired, 1-Math.exp(-delta/.12));
          actor.position.addScaledVector(difference, Math.min(distance, step));
          if(distance<=step+.00001){stopTravel();playClip('Idle');}
        }
      }
    }
    if(resourceMode){visualPivot.rotation.x=THREE.MathUtils.damp(visualPivot.rotation.x,motion.pitch,18,delta);visualPivot.rotation.z=THREE.MathUtils.damp(visualPivot.rotation.z,motion.bank,14,delta);}
    if(gardenMeal?.phase==='settling'){
      gardenMeal.wait+=delta;
      if(keepMealFaceVisible(delta,true)&&gardenMeal.wait>=.16&&Math.abs(visualPivot.rotation.x)+Math.abs(visualPivot.rotation.z)<.01){
        if(resourcePreview.beginGardenMeal(gardenMeal.fruitId)){
          destinationMarker.hide();
          gardenMeal.phase='eating';playClip('Eat',{force:true});gardenFeedback('咬一口，慢慢嚼…');
        }else cancelGardenMeal();
      }
    }else if(gardenMeal?.phase==='eating'&&active.time>=gardenMeal.biteTime)keepMealFaceVisible(delta,false);
    if(resourcePreview?.view==='garden'){
      resourcePreview.meadow.update(delta,actor.position);
      resourcePreview.windChime?.update(delta,actor.position);
      if(tackle.active)tackle.applyPose();else if(mud.active)mud.applyPose();else combat.pose();
      tackleEffects.update(delta,actor.position,tackle.direction,tackle.dashing,tackle.flightHeight);
      mudEffects.update(delta);
    }
    for (let i=hearts.length-1;i>=0;i--) {
      const h = hearts[i]; h.age += delta;
      h.sprite.visible = h.age >= 0;
      h.sprite.position.y = h.start.y + Math.max(0,h.age)*.23;
      h.sprite.material.opacity = Math.max(0,1-Math.max(0,h.age-.5)/.8);
      if (h.age > 1.3) { scene.remove(h.sprite); h.sprite.material.dispose(); hearts.splice(i,1); }
    }
  }
  if(resourcePreview&&active)resourcePreview.update(currentName,active.time,{delta:state.paused?0:delta*state.waterRate,paused:state.paused});
  if(active)eyeExpressions?.update(currentName,active.time);
  if(resourcePreview?.view==='garden')resourcePreview.pondWater.update(state.paused?0:delta,{contacts:resourcePreview.swimContacts(),position:actor.position,yaw:actor.rotation.y,inWater:swimming?.inWater,moving:swimming?.moving});
}
renderer.setAnimationLoop((now) => {
  const delta = previousTime === undefined ? 0 : Math.min((now-previousTime)/1000, .05);
  previousTime = now;
  stepSimulation(delta);
  updateTimeline();
  updateOrbitInput();
  controls.update();
  updateCombatUI();
  destinationMarker?.update(state.paused?0:delta,camera,innerHeight);
  if(resourcePreview?.view==='garden'){
    resourcePreview.pondWater.prepare(camera);
    tackleEffects.prepare(camera);
    mudEffects.prepare(camera);
  }
  if(toon)toon.renderFrame(camera);else renderer.render(scene,camera);
  if (state.loaded && !diagnostics.ready) {
    diagnostics.ready = true;
    if (resourceMode) {
      advanceGardenLoading();
      hideGardenLoading();
    }
  }
});
