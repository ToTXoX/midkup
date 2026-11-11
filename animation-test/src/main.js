import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import './style.css';
import './anime-ui.css';
import { createResourcePreview, loadResourcePreviewAssets } from './resource-preview.js';
import { createToonStyle } from './toon-style.js';
import { createGardenNavigation,createGardenWalker } from './garden-navigation.js';
import { createDestinationMarker } from './destination-marker.js';
import { createGardenCombat } from './garden-combat.js';
import { createGardenTackle } from './garden-tackle.js';
import { createGardenIronShoulder } from './garden-iron-shoulder.js';
import { createTackleEffects } from './tackle-effects.js';
import { createGardenMud } from './garden-mud.js';
import { createMudEffects } from './mud-effects.js';
import { createWaterSkillInput } from './water-skill-input.js';
import { createGardenSwimming } from './garden-swimming.js';
import { createGardenFootprints } from './garden-footprints.js';
import { preventGameSelection } from './game-selection.js';
import { createEyeExpressions } from './eye-expressions.js';
import { setupGardenViewport } from './garden-viewport.js';
import { createGardenFriends } from './garden-friends.js';

preventGameSelection(document.getElementById('app'));

const $ = (id) => document.getElementById(id);
const resourceMode = document.body.dataset.pack === 'game';
const resourceRoot = `${import.meta.env.BASE_URL}assets/game/`;
const gardenLoading = $('garden-loading');
const mobileGraphics = matchMedia('(pointer: coarse)').matches;
const syncGardenViewport = resourceMode ? setupGardenViewport($('app'), $('garden-zoom-notice')) : null;
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
const locomotion = (name) => metadata.locomotion?.[name];
let resourcePreview, stageRoster, gardenFriends;
let navigation,gardenWalker,combat,skillInput,skillAimBefore,swimming,footprints;
let tackle,tackleEffects,mud,mudEffects,iron,ironAim=null;
const groundSkillActive=()=>!!(tackle?.active||mud?.active||iron?.active);
let gardenMeal=null,mealsEaten=0;
const gardenDances=['DanceA','DanceB','DanceC'];
let danceBag=[],lastGardenDance=null,pendingGardenDance=null,completedGardenDances=0;
const danceCounts={DanceA:0,DanceB:0,DanceC:0};
const gardenDanceButton = $('garden-dance');
const gardenDanceEffects = $('garden-dance-effects');
const danceAnchor = new THREE.Vector3();
let danceHead;
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
renderer.setPixelRatio(Math.min(devicePixelRatio, mobileGraphics ? 1.25 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
$('scene').appendChild(renderer.domElement);
renderer.domElement.tabIndex=0;
renderer.domElement.draggable=false;
const zuzuCanvasLabel='庭院：点击草地移动，双指缩放，点击 ZUZU 或按跳舞键跳舞，点按水枪键喷水，拖动技能键瞄准';
renderer.domElement.setAttribute('aria-label',zuzuCanvasLabel);

const STAGE_FOV=36;
const camera = new THREE.PerspectiveCamera(STAGE_FOV, 1, .05, 40);
const halfFovTan=fov=>Math.tan(THREE.MathUtils.degToRad(fov/2));
const lensDistanceScale=()=>halfFovTan(STAGE_FOV)/halfFovTan(camera.fov);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = mobileGraphics ? .1 : .05;
controls.enablePan = false;
// With pan disabled, a two-finger gesture only zooms the camera.
controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
controls.minDistance = 1.9;
controls.maxDistance = 6;
controls.minPolarAngle = .25;
controls.maxPolarAngle = Math.PI / 2 - .04;
function resetView() {
  skillInput?.cancel();
  controls.enabled=true;
  controls.enableDamping = false;
  controls.update();
  controls.enableDamping = true;
  const garden=resourcePreview?.view==='garden';
  controls.zoomToCursor = garden && mobileGraphics;
  camera.fov=garden?(resourcePreview.layout.camera.fov??STAGE_FOV):STAGE_FOV;
  camera.near=.05;
  camera.far=40;
  camera.clearViewOffset();
  if (garden) {
    const dock = $('garden-dock').getBoundingClientRect();
    const compact = dock.width > 0;
    const portrait = compact && innerHeight >= innerWidth;
    const sideInset = portrait ? 8 : compact ? 12 : Math.min(48,innerWidth*.06);
    const desktopInset=THREE.MathUtils.lerp(72,36,THREE.MathUtils.smoothstep(innerHeight,650,1000));
    const verticalInset = Math.min(desktopInset, innerHeight * .13);
    let rightEdge = innerWidth - sideInset;
    let topEdge = verticalInset;
    let bottomEdge = innerHeight - verticalInset;
    if (compact) {
      const topControls = ['garden-score', 'garden-music', 'garden-menu-toggle', 'garden-invite', 'view-hint'];
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
    direction.y *= portrait ? 1.15 : .73;
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
const shadowSize = mobileGraphics ? 1024 : 2048;
key.shadow.mapSize.set(shadowSize, shadowSize);
key.shadow.normalBias = .012;
key.shadow.bias = -.00015;
key.shadow.radius = 3;
scene.add(key);
const fill = new THREE.DirectionalLight('#e1efff', 1.1);
fill.position.set(3, 2, -2);
scene.add(fill);
const toon=resourceMode?createToonStyle({renderer,scene,ambient,key,fill,mobileGraphics}):null;

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
let activeCharacter = 'mudkip';
const isZuzu = () => activeCharacter === 'mudkip';
let actions = new Map();
const hasIronShoulder=()=>actions.has('IronShoulder');
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
function setHudText(id, text) {
  const element = $(id);
  if (element && element.textContent !== text) element.textContent = text;
}
function gardenFeedback(message){setHudText('garden-feedback',message);}
function isGardenDancePlaying(){return resourcePreview?.view==='garden'&&gardenDances.includes(currentName);}
function positionGardenDanceEffects() {
  if (!gardenDanceEffects || gardenDanceEffects.hidden) return;
  danceHead.getWorldPosition(danceAnchor);
  danceAnchor.y += .17;
  danceAnchor.project(camera);
  gardenDanceEffects.style.visibility = Math.abs(danceAnchor.z) <= 1 ? '' : 'hidden';
  gardenDanceEffects.style.transform = `translate(${(danceAnchor.x + 1) * innerWidth / 2}px, ${(1 - danceAnchor.y) * innerHeight / 2}px)`;
}
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
  if(!isZuzu()||!state.loaded||resourcePreview?.view!=='garden'||groundSkillActive())return;
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
  if(open)gardenFriends?.close();
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
  if(!isZuzu()||!state.loaded||resourcePreview?.view!=='garden'||groundSkillActive())return;
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
  if(!actions.has(name)||!locomotion(name))return;
  state.travelGait=name;
  const toggle=$('garden-gait');
  if(toggle){toggle.setAttribute('aria-checked',String(name==='Run'));toggle.title=name==='Run'?'切换为轻快走':'切换为小跑';}
  if(target&&resourcePreview?.view==='garden'&&!swimming?.inWater)playClip(name);
}
function stopGardenActions(){
  cancelGardenDanceRequest();
  swimming?.reset();
  tackle?.reset();
  mud?.reset();
  iron?.cancel();
  ironAim=null;
  footprints?.reset();
  cancelGardenMeal();
  skillInput?.cancel();
  combat?.cancel();
  stopTravel();
  clearHearts();
  visualPivot.rotation.set(0,0,0);
  visualPivot.position.set(0,0,0);
}
function resetActor(restorePosition=false){
  stopGardenActions();
  resourcePreview?.pondWater.reset();
  resourcePreview?.meadow.reset();
  resourcePreview?.windChime?.reset();
  if(resourcePreview?.view==='garden'){
    if(!restorePosition||!gardenFriends.restorePlayer()){
      const point=gardenFriends.resetPoint();
      if(!point){gardenFeedback('起点附近没有空地。');return;}
      actor.position.copy(point);
      actor.position.y=(resourcePreview.groundHeight(actor.position.x,actor.position.z)??actor.position.y)+.005;
      actor.rotation.set(0,resourcePreview.layout.spawn.yaw,0);
    }
    gardenFeedback(isZuzu()?'回到起点啦，按跳舞键一起玩吧～':'回到起点啦，点草地继续散步。');
  }else{actor.position.set(0,.005,0);actor.quaternion.identity();}
}

function createPlayback(gltf, config) {
  const player = new THREE.AnimationMixer(gltf.scene);
  const settings = new Map(config.clips.map(clip => [clip.name, clip]));
  const clips = new Map(gltf.animations.map(clip => [clip.name, player.clipAction(clip)]));
  for (const name of settings.keys()) {
    if (!clips.has(name)) throw new Error(`GLB 缺少 ${name} 动作`);
  }
  player.addEventListener('finished', event => {
    if (event.action !== active || event.action.loop !== THREE.LoopOnce) return;
    if (currentName === 'Eat' && pendingGardenDance?.kind === 'meal' && resourcePreview?.view === 'garden') {
      startGardenDance({ completedMeal: true });
      return;
    }
    const danced = isGardenDancePlaying();
    if (danced) completedGardenDances++;
    playClip(swimming?.inWater ? 'SwimIdle' : 'Idle', { completed: true });
    if (danced) gardenFeedback('跳完啦，再按一次跳舞键吧～');
  });
  return { model: gltf.scene, mixer: player, actions: clips, metadata: config, clipSettings: settings };
}

const stageHint = () => hasIronShoulder() ? '待机时挥手 · 可逐帧查看走路和小跑。' : '十二段动作 · 可以逐帧查看。';
const characterPortraits = {
  mudkip: 'mudkip-avatar-user-v1.png',
  dawn: 'dawn-avatar.png',
};

function createCharacterPortrait(id) {
  const file = characterPortraits[id];
  if (!file) return null;
  const image = document.createElement('img');
  image.src = `${import.meta.env.BASE_URL}assets/ui/${file}`;
  image.alt = '';
  image.draggable = false;
  return image;
}

function outlineDawnMesh(mesh) {
  // Eyes and fabric markings already have their own edges in the model.
  return /^(Hood_shell|Round_ear|Romper_torso|Rounded_boot|Sleeve_&_mitten|Bill_|Bow_(knot|wing)|Backpack_strap|Satchel_(body|flap)$)/.test(mesh.name);
}

function createCharacterLoader(characters, loader) {
  const assets = new Map();

  async function load(id) {
    const entry = characters[id];
    const [gltf, config] = await Promise.all([
      loader.loadAsync(resourceRoot + entry.model),
      fetch(resourceRoot + entry.animations).then(response => {
        if (!response.ok) throw new Error('动画配置加载失败');
        return response.json();
      }),
    ]);
    gltf.scene.traverse(object => {
      if (object.isMesh) object.castShadow = true;
    });
    toon.apply(gltf.scene, 'character', { outlineMesh: id === 'dawn' ? outlineDawnMesh : undefined });
    return { gltf, config };
  }

  return id => {
    if (!assets.has(id)) {
      assets.set(id, load(id).catch(error => {
        assets.delete(id);
        throw error;
      }));
    }
    return assets.get(id);
  };
}

function setupStageRoster(characters, loadCharacter) {
  const roster = $('character-roster');
  const cache = new Map([['mudkip', { model, mixer, actions, metadata, clipSettings }]]);
  const buttons = new Map();
  let selected = 'mudkip';
  let request = 0;
  let busy = false;
  for (const [id, entry] of Object.entries(characters)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'character-avatar';
    button.title = entry.name;
    button.setAttribute('aria-label', entry.name);
    button.setAttribute('aria-pressed', String(id === activeCharacter));
    button.append(createCharacterPortrait(id) ?? entry.name);
    button.addEventListener('click', () => select(id));
    buttons.set(id, button);
    roster.append(button);
  }

  function setBusy(value) {
    busy = value;
    roster.setAttribute('aria-busy', String(busy));
    for (const button of buttons.values()) button.setAttribute('aria-disabled', String(busy));
  }

  function activate(id) {
    if (id === activeCharacter) return;
    mixer.stopAllAction();
    visualPivot.remove(model);
    ({ model, mixer, actions, metadata, clipSettings } = cache.get(id));
    visualPivot.add(model);
    activeCharacter = id;
    for (const [characterId, button] of buttons) {
      button.setAttribute('aria-pressed', String(characterId === id));
    }
    currentName = active = null;
    $('resource-title').textContent = `和 ${characters[id].name} 玩一会儿`;
    for (const button of document.querySelectorAll('[data-clip]')) {
      button.hidden = !actions.has(button.dataset.clip);
    }
  }

  function cacheCharacter(id, { gltf, config }) {
    if (!cache.has(id)) cache.set(id, createPlayback({ ...gltf, scene: clone(gltf.scene) }, config));
  }

  async function select(id) {
    if (!buttons.has(id) || id === selected || resourcePreview.view !== 'stage' || busy) return;
    const ticket = ++request;
    const entry = characters[id];
    setBusy(true);
    $('resource-hint').textContent = `正在加载 ${entry.name}…`;
    try {
      if (!cache.has(id)) {
        const asset = await loadCharacter(id);
        if (ticket !== request) return;
        cacheCharacter(id, asset);
      }
      if (ticket !== request) return;
      selected = id;
      activate(id);
      waterFramed = false;
      resetActor();
      state.paused = false;
      updatePauseUI();
      playClip('Idle', { immediate: true, force: true });
      updateTimeline();
      $('resource-hint').textContent = stageHint();
      resetView();
    } catch (error) {
      if (ticket !== request) return;
      $('resource-hint').textContent = `${entry.name} 加载失败，请重新选择。`;
      console.warn(error);
    } finally {
      if (ticket === request) setBusy(false);
    }
  }

  return {
    select,
    activateGarden(id, asset) {
      cacheCharacter(id, asset);
      activate(id);
    },
    setView(garden, controlled) {
      request++;
      setBusy(false);
      activate(garden ? controlled : selected);
    },
  };
}

function syncGardenPlayer(garden) {
  const guest = garden && !isZuzu();
  document.body.classList.toggle('guest-control', guest);
  $('garden-score').hidden = !garden || guest && !hasIronShoulder();
  for (const id of ['garden-fire', 'garden-mud', 'garden-tackle', 'skill-caption']) $(id).hidden = guest;
  gardenDanceButton.hidden = guest;
  $('garden-iron').hidden = !guest || !hasIronShoulder();
  $('garden-gait').hidden = guest && !(actions.has('Run') && locomotion('Run') && actions.has('Walk') && locomotion('Walk'));
  setHudText('garden-speaker', gardenFriends.controlledName);
  renderer.domElement.setAttribute('aria-label', guest ? `庭院：点击草地移动 ${gardenFriends.controlledName}，点击角色瞄准，按铁山靠发动技能` : zuzuCanvasLabel);
  resourcePreview.setPlayerModel(model);
}

function switchGardenCharacter(id) {
  if (!state.loaded || resourcePreview.view !== 'garden' || id === gardenFriends.controlled) return;
  function change() {
    if (resourcePreview.view !== 'garden') return;
    const previous = actor.position.clone();
    const changed = gardenFriends.control(id, asset => {
      combat.setMode('move');
      stopGardenActions();
      if (isZuzu()) eyeExpressions?.update('Idle', 0);
      stageRoster.activateGarden(id, asset);
    });
    if (!changed) return;
    syncGardenPlayer(true);
    playClip('Idle', { immediate: true, force: true });
    gardenFeedback(`现在操控 ${gardenFriends.controlledName}，点草地移动。`);
    const projected = actor.position.clone().add(new THREE.Vector3(0,.35,0)).project(camera);
    if (controls.getDistance() < 14 * lensDistanceScale() || Math.abs(projected.x) > .87 || Math.abs(projected.y) > .87) {
      const offset = actor.position.clone().sub(previous).setY(0);
      controls.target.add(offset);
      camera.position.add(offset);
      controls.update();
    }
    updateCombatUI();
  }
  if (isZuzu() && swimming.inWater) {
    state.paused = false;
    updatePauseUI();
    swimming.leave(change);
    gardenFeedback('上岸后就切换角色。');
  } else change();
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
  if (gardenDanceEffects) {
    const dancing = isGardenDancePlaying();
    gardenDanceEffects.hidden = !dancing;
    gardenDanceButton.setAttribute('aria-busy', String(dancing || resourcePreview?.view === 'garden' && name === 'Wave'));
  }
  if(isZuzu())eyeExpressions?.update(name,0);
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
  $('clip-label').textContent = clipSettings.get(name).label ?? labels[name];
  $('duration').textContent = `${next.getClip().duration.toFixed(1)} s`;
  $('playback-note').textContent = looping ? '循环播放' : '结束后回到待机';
  document.querySelectorAll('[data-clip]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.clip === name)));
}
function pet() {
  if (!state.loaded) return;
  if (actions.has('Wave')) {
    stopTravel();
    state.paused = false;
    updatePauseUI();
    playClip('Wave', { force: true });
    return;
  }
  if (!actions.has('PetReaction')) return;
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
  gardenDanceEffects?.toggleAttribute('data-paused', state.paused);
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
  if(isZuzu())eyeExpressions?.update(currentName,active.time);
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
    ironAim=null;
    skillInput?.cancel();
    combat?.setMode('move');combat?.cancel();updateCombatUI();
    if(isZuzu()&&!fromSwimming){const result=swimming?.request(resourcePreview.pondWater.swimTarget(point));if(result?.handled){state.paused=false;updatePauseUI();return result.plan;}}
    const gait = actions.has(state.travelGait) && locomotion(state.travelGait) ? state.travelGait : 'Walk';
    if(!actions.has(gait)||!locomotion(gait))return;
    const plan=gardenWalker.start(actor.position,point);
    if(!plan.ok){stopTravel();gardenFeedback('这里暂时走不过去，试试旁边的草地。');playClip('Idle');return plan;}
    if(!plan.waypoints.length){stopTravel();playClip('Idle');return plan;}
    target=new THREE.Vector3(plan.goal.x,0,plan.goal.z);
    destinationMarker.show(new THREE.Vector3(plan.goal.x,(resourcePreview.groundHeight(plan.goal.x,plan.goal.z)??0)+.025,plan.goal.z));
    gardenFeedback(plan.adjusted?'那里有障碍，会停在附近的草地。':plan.waypoints.length>1?'找到路线啦，绕过去看看。':'正在过去啦…');
    state.paused=false;updatePauseUI();clearHearts();playClip(gait);return plan;
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
  const candidate=resourcePreview.orchard.nearbyFruit(raycaster.ray);
  if(!candidate&&!gardenFriends.intersect(raycaster)){setFruitHover();return;}
  const aimed=resourcePreview.pickAim(raycaster);
  const character=(aimed?.fruit||aimed?.visitor)&&raycaster.intersectObject(model,true)[0];
  const playerInFront=characterInFront(character,aimed);
  setFruitHover(playerInFront?null:aimed?.fruit?.id);
  if(aimed?.visitor&&!playerInFront)renderer.domElement.style.cursor='pointer';
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
    // Convert a 16 CSS pixel tap radius to world units at the fruit's depth.
    const radiusPerMeter = e.pointerType==='touch' ? 32 * halfFovTan(camera.fov) / renderer.domElement.clientHeight : 0;
    const aimed=resourcePreview.pickAim(raycaster,{radiusPerMeter});
    if(characterInFront(hits[0],aimed)){requestGardenDance();return;}
    if(!isZuzu()){
      if(aimed?.visitor)gardenFriends.greet(aimed.targetId);
      if(aimed?.targetId&&hasIronShoulder()&&(aimed.visitor||resourcePreview.layout.targets.some(target=>target.id===aimed.targetId))){
        aimGardenTarget(aimed.point,aimed.targetId);return;
      }
      if(aimed?.visitor)return;
      if(state.movement&&aimed)moveTo(aimed.point);
      return;
    }
    if(aimed?.fruit){goEatGardenFruit(aimed.fruit.id);return;}
    if(aimed?.basket){goEatGardenFruit();return;}
    if(aimed?.targetId){aimGardenTarget(aimed.point,aimed.targetId);return;}
    if(state.movement && aimed)moveTo(aimed.point);
    return;
  }
  if (hits.length) { pet(); return; }
  if (state.movement) {
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
  if(!isZuzu()||!combat||resourcePreview.view!=='garden'||state.paused||swimming?.busy||groundSkillActive()||combat.debug().phase!=='idle')return false;
  if(!combat.debug().targetId)combat.aimAt(forwardWaterPoint(),null,{silent:true});
  const fired=combat.fire(state.paused);updateCombatUI();return fired;
}

function aimGardenTarget(point,id){
  if(!point||groundSkillActive())return;
  if(!isZuzu()){
    if(!hasIronShoulder())return;
    ironAim=id;
    stopTravel();playClip('Idle');
    gardenFeedback(`已锁定 ${gardenFriends.targetName(id)??'练习靶'}，点按铁山靠。`);
    updateCombatUI();
    return;
  }
  cancelGardenDanceRequest();
  if(combat.aimAt(point,id)){
    const visitor=gardenFriends.targetName(id);
    if(visitor)gardenFriends.greet(id);
    if(visitor||resourcePreview.layout.targets.some(target=>target.id===id)){
      const label=visitor?` ${visitor}`:combat.debug().targetName;
      gardenFeedback(`已锁定${label}，可以喷水或掷泥，近距离也能撞击。`);
    }
  }
  updateCombatUI();
}

function castGroundSkill(skill){
  if(!isZuzu()||!skill||resourcePreview.view!=='garden'||state.paused||groundSkillActive()||swimming.inWater||skillInput?.debug().active)return false;
  if(skill===mud&&!mud.ready)return false;
  const aim=combat.debug();
  if(aim.phase!=='idle')return false;
  const locked=gardenFriends.targetName(aim.targetId)||resourcePreview.layout.targets.some(target=>target.id===aim.targetId)?aim.targetId:null;
  cancelGardenDanceRequest();cancelGardenMeal();swimming.reset();stopTravel();clearHearts();combat.restorePose();
  playClip('Idle',{immediate:true});
  const started=skill.start(locked?resourcePreview.targetPoint(locked):null,locked);
  if(started&&skill===mud)gardenFeedback('用前爪刨一点泥…');
  updateCombatUI();
  return started;
}
const castTackle=()=>castGroundSkill(tackle);
const castMud=()=>castGroundSkill(mud);

function castIronShoulder(){
  if(resourcePreview?.view!=='garden'||!hasIronShoulder()||state.paused||groundSkillActive()||!iron?.ready)return false;
  const aim=ironAim?resourcePreview.targetPoint(ironAim):null;
  if(!iron.start(aim))return false;
  stopTravel();clearHearts();
  tackleEffects.enableBeatSound();
  playClip('IronShoulder',{immediate:true,force:true});
  updateCombatUI();
  return true;
}

function updateCombatUI(){
  if(!combat)return;
  const info=combat.debug(),garden=resourcePreview.view==='garden'&&isZuzu(),busy=info.phase!=='idle';
  const ironGarden=resourcePreview.view==='garden'&&hasIronShoulder();
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
  $('garden-fire').disabled=!garden||state.paused||busy||groundBusy||!!swimming?.busy;
  if (gardenDanceButton.disabled !== groundBusy) gardenDanceButton.disabled = groundBusy;
  $('garden-tackle').disabled=groundDisabled;
  $('garden-mud').disabled=groundDisabled||!mud?.ready;
  const ironButton=$('garden-iron');
  ironButton.disabled=!ironGarden||state.paused||!iron?.ready;
  if(ironGarden){
    const {phase}=iron.debug();
    ironButton.setAttribute('aria-busy',String(iron.active));
    ironButton.style.setProperty('--cooldown',`${(1-iron.cooldownRatio)*360}deg`);
    setHudText('iron-title',phase==='charge'?'蓄力':phase==='dash'?'靠击':phase==='recover'?'收势':iron.ready?'铁山靠':`${Math.ceil(iron.cooldown)}s`);
  }
  $('garden-tackle').dataset.busy=String(tackling);
  $('garden-tackle').setAttribute('aria-busy',String(tackling));
  $('garden-mud').dataset.busy=String(!mud?.ready);
  $('garden-mud').setAttribute('aria-busy',String(!mud?.ready));
  $('garden-fire').dataset.busy=String(busy);$('garden-fire').dataset.aiming=String(gesture.active);
  $('garden-fire').setAttribute('aria-busy',String(busy));
  setHudText('skill-title',info.phase==='turning'?'转身':info.phase==='shooting'?(active.time<.33?'蓄水':active.time<.66?'喷水':'恢复'):'水枪');
  setHudText('skill-caption',state.paused?'已暂停':swimming?.busy?(swimming.debug().phase==='entering'?'正在入水…':'正在上岸…'):gesture.active?'松手喷水':busy?'准备下一发…':'点按喷水 · 拖动瞄准');
  const length=Math.hypot(...gesture.offset),scale=length>0?Math.min(length,22)/length:0;
  $('skill-thumb').style.transform=`translate(${gesture.offset[0]*scale}px,${gesture.offset[1]*scale}px)`;
  $('skill-stick').hidden=!gesture.active;
  $('garden-fire').style.setProperty('--cooldown',`${busy&&info.phase==='shooting'?Math.min(1,active.time)*360:360}deg`);
  if(info.phase==='shooting'&&!info.lastContact)gardenFeedback(active.time<.33?'闭嘴蓄水…':active.time<.66?'水枪发射！':'水流正在飞向目标…');
  setHudText('garden-hit-count',String(resourcePreview.targetFeedback.debug().total).padStart(2,'0'));
  const aimPoint=ironGarden&&ironAim?resourcePreview.targetPoint(ironAim):garden&&info.point?new THREE.Vector3().fromArray(info.point):null;
  $('aim-reticle').hidden=!aimPoint||groundBusy;
  if(aimPoint&&!groundBusy){
    const p=aimPoint.project(camera),visible=p.z<1&&p.z>-1&&Math.abs(p.x)<1&&Math.abs(p.y)<1;
    $('aim-reticle').hidden=!visible;
    $('aim-reticle').style.left=`${(p.x+1)*innerWidth/2}px`;$('aim-reticle').style.top=`${(1-p.y)*innerHeight/2}px`;
    const ready=ironGarden?iron.ready:info.assessment?.reachable&&info.assessment?.clear;
    $('aim-reticle').dataset.ready=String(ready);$('aim-reticle').dataset.firing=String(busy);
    const status=gesture.active?'松手喷水':info.assessment?.blocked?'被遮挡':!info.assessment?.reachable?'距离太远':info.targetId?'可命中':'已瞄准';
    setHudText('aim-label',ironGarden?`${gardenFriends.targetName(ironAim)??'练习靶'} · 铁山靠`:`${info.targetName} · ${status}`);
  }
  const hit=resourcePreview.targetFeedback.debug();
  const recent=hit.targets.filter(t=>t.hits&&t.age<.75).sort((a,b)=>a.age-b.age)[0];
  $('garden-score').dataset.hit=String(!!recent&&recent.age<.3);
  const waterHit=recent?.kind==='water'&&recent.age>=.10;
  $('hit-pop').hidden=!garden||!waterHit;
  if(garden&&waterHit){const p=resourcePreview.targetPoint(recent.id).add(new THREE.Vector3(0,.25+recent.age*.5,0)).project(camera);$('hit-pop').style.left=`${(p.x+1)*innerWidth/2}px`;$('hit-pop').style.top=`${(1-p.y)*innerHeight/2}px`;$('hit-pop').style.opacity=String(1-THREE.MathUtils.smoothstep(recent.age,.45,.75));}
  for(const b of document.querySelectorAll('[data-aim-target]')){
    const id=b.dataset.aimTarget,p=resourcePreview.targetPoint(id).project(camera);
    b.hidden=!(garden||ironGarden)||p.z>1||Math.abs(p.x)>1||Math.abs(p.y)>1;
    b.style.left=`${(p.x+1)*innerWidth/2}px`;b.style.top=`${(1-p.y)*innerHeight/2}px`;
    b.setAttribute('aria-pressed',String((ironGarden?ironAim:info.targetId)===id));
    b.dataset.hits=hit.targets.find(t=>t.id===id).hits;
  }
}
window.addEventListener('keydown',e=>{
  if(resourcePreview?.view!=='garden'||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
  if(e.code==='Space'&&e.target.tagName==='BUTTON'&&e.target.id!=='garden-fire')return;
  if(e.code==='Space'&&isZuzu()){e.preventDefault();if(!e.repeat&&!skillInput?.debug().active)castWaterSkill();}
  if(e.code==='Space'&&hasIronShoulder()){e.preventDefault();if(!e.repeat)castIronShoulder();}
  if(e.code==='Escape'){
    if(gardenFriends?.close(true))return;
    setGardenMenu(false);skillInput?.cancel();if(!groundSkillActive()){combat.setMode('move');ironAim=null;}updateCombatUI();
  }
});

const diagnostics = { ready: false, version: THREE.REVISION, errors: [] };
window.__mudkipTest = {
  diagnostics,
  renderStats: () => ({ geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,programs:renderer.info.programs.length }),
  camera:()=>({enabled:controls.enabled,position:camera.position.toArray(),target:controls.target.toArray()}),
  facing:()=>actor.getWorldDirection(new THREE.Vector3()).toArray(),
  footprints:()=>footprints?.debug(),
  meadow:()=>resourcePreview?.meadow.debug(),
  friends:()=>gardenFriends?.debug(),
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
  iron:()=>iron?{...iron.debug(),effects:tackleEffects.debug(),targetId:ironAim}:null,
  mud:()=>mud?{...mud.debug(),effects:mudEffects.debug()}:null,
  castTackle,
  castMud,
  castSkill:castWaterSkill,
  aimAt:(x,y,z,id=null)=>combat?.aimAt(new THREE.Vector3(x,y,z),id),
  aimTarget:id=>combat?.aimAt(resourcePreview.targetPoint(id),id),
  fire:()=>combat?.fire(state.paused),
  destination: () => {let lines=0;scene.traverse(o=>{if(o.isLine)lines++;});return destinationMarker?{...destinationMarker.debug(),routeLines:lines}:null;},
  navigation: () => navigation?{...navigation.debug(),...gardenWalker.debug(),ground:resourcePreview.groundHeight(actor.position.x,actor.position.z)}:null,
  snapshot: () => ({ ...state,character:activeCharacter,speed:motion.speed,visualLean:[visualPivot.rotation.x,visualPivot.rotation.z],clip: currentName, time: active?.time, position: actor.position.toArray(), target: target?.toArray() ?? null, actions: [...actions].map(([name,a]) => ({ name, weight: a.isScheduled() ? a.getEffectiveWeight() : 0, scheduled: a.isScheduled(), running: a.isRunning() })), hearts: hearts.length }),
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
  } else {
    gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}assets/mudkip.glb`);
  }
  model = gltf.scene;
  visualPivot.add(model);
  toon?.apply(model,'character');
  if(resourceMode){
    eyeExpressions=createEyeExpressions(model,metadata.expressions);
    danceHead = model.getObjectByName('Head');
  }
  const meshes = [], maps = new Set(), skeletons = new Set();
  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = false;
      meshes.push(o);
      for (const material of (Array.isArray(o.material) ? o.material : [o.material])) if (material.map) maps.add(material.map);
    }
    if (o.isSkinnedMesh) skeletons.add(o.skeleton);
  });
  ({ mixer, actions, clipSettings } = createPlayback(gltf, metadata));
  for (const name of Object.keys(labels)) if (!actions.has(name)) throw new Error(`GLB 缺少 ${name} 动作`);
  if(resourceMode){
    resourcePreview=await createResourcePreview({renderer,scene,actor,model,root:resourceRoot,assets:previewAssets,metadata,stageColliders:[stage,floor],toon,heartTexture,mobileGraphics,onWaterContact:event=>combat?.contact(event)});
    footprints=createGardenFootprints({scene,actor,model,clips:metadata.clips,
      sampleSurface:resourcePreview.footprintSurface,isWater:point=>swimming?.contains(point)});
    combat=createGardenCombat({actor,model,preview:resourcePreview,
      onStop:()=>{cancelGardenDanceRequest();cancelGardenMeal();swimming?.hold();stopTravel();clearHearts();if(state.loaded)playClip(swimming?.inWater?'SwimIdle':'Idle');},
      onShoot:(point,id)=>{stopTravel();clearHearts();playClip('WaterShoot',{force:true,gameShot:{point,id}});},
      onMessage:gardenFeedback,onHit:(id,direction)=>{
        const push=new THREE.Vector3().fromArray(direction??[0,0,1]);
        if(id.startsWith('visitor:'))return gardenFriends.hit(id,'water',push)??'水花落下了。';
        const fruit=resourcePreview.orchard.knockDown(id);
        if(fruit)return `${fruit}掉下来啦，点地上的果子就能吃！`;
        resourcePreview.targetFeedback.hit(id,{direction:direction?push.setY(0).normalize():undefined});
      }});
    navigation=createGardenNavigation(resourcePreview.layout,{extraColliders:resourcePreview.extraColliders});gardenWalker=createGardenWalker(navigation);
    tackleEffects=createTackleEffects(resourcePreview.environment);
    iron=createGardenIronShoulder({actor,navigation,groundHeight:resourcePreview.groundHeight,
      targetContact:resourcePreview.tackleTargetContact,effects:tackleEffects,
      onPhase:phase=>{
        if(phase==='idle'){
          visualPivot.position.x=0;
          playClip('Idle',{immediate:true});
          return;
        }
        gardenFeedback({charge:'侧身抖肩蓄力…',dash:'铁山靠！',blocked:'碰到障碍，收住了。',miss:'冲空了。'}[phase]);
      },
      onHit:(id,direction,damage)=>{
        if(id.startsWith('visitor:')){
          const message=gardenFriends.hit(id,'iron',direction);
          if(message)gardenFeedback(`${message}物理伤害 ${damage}`);
        }else{
          resourcePreview.targetFeedback.hit(id,{kind:'tackle',direction,hold:.055});
          gardenFeedback(`铁山靠命中练习靶，物理伤害 ${damage}。`);
        }
      }});
    tackle=createGardenTackle({actor,pivot:visualPivot,model,navigation,groundHeight:resourcePreview.groundHeight,
      targetContact:resourcePreview.tackleTargetContact,effects:tackleEffects,
      onPhase:(phase,kind,id)=>{
        if(phase==='windup')gardenFeedback('压低身体，准备撞击…');
        if(phase==='dash')gardenFeedback('蹬地，扑击！');
        if(phase==='hitstop'&&!gardenFriends.targetName(id))gardenFeedback('砰！撞中靶子了。');
        if(phase==='recover'){
          playClip('Idle');
          if(kind==='miss')gardenFeedback('急刹！走近靶子再试一次。');
          if(kind==='blocked')gardenFeedback('前面有障碍，刹住啦。');
        }
      },onHit:(id,direction,hold)=>{
        if(id.startsWith('visitor:')){
          const message=gardenFriends.hit(id,'tackle',direction);
          if(message)gardenFeedback(message);
        }else resourcePreview.targetFeedback.hit(id,{kind:'tackle',direction,hold});
      }});
    mudEffects=createMudEffects(resourcePreview.environment);
    mud=createGardenMud({actor,pivot:visualPivot,model,groundHeight:resourcePreview.groundHeight,
      trace:resourcePreview.traceMud,resolveTarget:resourcePreview.targetPoint,effects:mudEffects,
      onRelease:()=>gardenFeedback('把泥团甩出去！'),onContact:(contact,velocity)=>{
        if(contact.targetId?.startsWith('visitor:')){
          const message=gardenFriends.hit(contact.targetId,'mud',velocity);
          if(message)gardenFeedback(message);
        }else if(contact.targetId){
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
    const characters = previewAssets.manifest.characters ?? { mudkip: { name: 'ZUZU' } };
    const loadCharacter = createCharacterLoader(characters, loader);
    stageRoster = setupStageRoster(characters, loadCharacter);
    gardenFriends = createGardenFriends({
      scene, characters, playerId: activeCharacter, actor, camera, preview: resourcePreview, navigation, loadCharacter,
      host: { gltf, config: metadata }, onControl: switchGardenCharacter,
      portrait: createCharacterPortrait, feedback: gardenFeedback, onOpen: () => setGardenMenu(false),
      onLeave: id => {
        if (ironAim === id) ironAim = null;
        const aim = combat.debug();
        if (aim.targetId === id && aim.phase !== 'shooting') combat.cancel();
        updateCombatUI();
      },
    });
    resourcePreview.setVisitors(gardenFriends);
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
    const touchViewHint = '双指缩放 · 拖动旋转';
    if (mobileGraphics) $('view-hint').textContent = touchViewHint;
    $('scene-view').disabled=false;
    $('scene-view').addEventListener('change',(event)=>{
      const garden=event.target.value==='garden';
      musicToggle.hidden = !garden;
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
      syncGardenViewport();
      resourcePreview.setView(event.target.value);
      gardenFriends.setView(garden);
      stageRoster.setView(garden,gardenFriends.controlled);
      syncGardenPlayer(garden);
      waterFramed=false;
      stopTravel();clearHearts();playClip('Idle',{immediate:true});
      state.paused=false;updatePauseUI();
      state.movement=garden;$('movement').checked=garden;$('movement').disabled=false;
      [stage,border,dots].forEach((o)=>o.visible=!garden);
      floor.position.y=garden?-.54:-.035;
      resetActor(garden);
      if(garden)gardenFeedback(isZuzu()?'点果树再按水枪，试试把果子打下来！':`现在操控 ${gardenFriends.controlledName}，点草地移动。`);
      const extent=garden?7:2.3;
      Object.assign(key.shadow.camera,{left:-extent,right:extent,top:extent,bottom:-extent,far:garden?30:10});
      key.shadow.camera.updateProjectionMatrix();key.position.set(garden?-6:-2.5,garden?12:4.5,garden?8:3);
      toon.setView(garden?'garden':'stage');
      $('resource-hint').textContent=garden?'点果树瞄准 · 用水枪打落果子。':stageHint();
      $('view-hint').textContent=garden
        ? (mobileGraphics?'点地移动 · 双指缩放':'点草地移动 · 拖动旋转')
        : (mobileGraphics?touchViewHint:'拖动旋转 · 滚轮缩放');
      resetView();
      updateCombatUI();
    });
    const changeView=(view)=>{$('scene-view').value=view;$('scene-view').dispatchEvent(new Event('change'));};
    $('enter-garden').addEventListener('click',()=>changeView('garden'));
    $('enter-garden').disabled=false;
    $('garden-back').addEventListener('click',()=>changeView('stage'));
    $('garden-menu-toggle').addEventListener('click',()=>setGardenMenu($('garden-menu-toggle').getAttribute('aria-expanded')!=='true'));
    $('garden-reset').addEventListener('click',()=>{resetActor();state.paused=false;updatePauseUI();playClip('Idle');});
    $('garden-camera').addEventListener('click',resetView);
    const recenter = $('garden-recenter');
    const restoreFullView = () => {
      setGardenMenu(false);
      resetView();
    };
    recenter.addEventListener('click', restoreFullView);
    recenter.addEventListener('touchend', event => {
      const touch = event.changedTouches[0];
      if (event.touches.length || !touch || !recenter.contains(document.elementFromPoint(touch.clientX, touch.clientY))) return;
      event.preventDefault();
      restoreFullView();
    }, { passive: false });
    $('garden-pause').addEventListener('click',()=>{
      state.paused=!state.paused;
      updatePauseUI();
      updateCombatUI();
    });
    $('garden-gait').addEventListener('click',()=>setGait(state.travelGait==='Run'?'Walk':'Run'));
    gardenDanceButton.addEventListener('click', requestGardenDance);
    document.querySelectorAll('[data-aim-target]').forEach(b=>b.addEventListener('click',()=>{aimGardenTarget(resourcePreview.targetPoint(b.dataset.aimTarget),b.dataset.aimTarget);renderer.domElement.focus({preventScroll:true});}));
    $('garden-basket').addEventListener('click',()=>{goEatGardenFruit();renderer.domElement.focus({preventScroll:true});});
    $('garden-tackle').addEventListener('click',castTackle);
    $('garden-mud').addEventListener('click',castMud);
    $('garden-iron').addEventListener('click',castIronShoulder);
    skillInput=createWaterSkillInput({button:$('garden-fire'),canStart:()=>isZuzu()&&resourcePreview.view==='garden'&&!state.paused&&!swimming.busy&&!groundSkillActive()&&combat.debug().phase==='idle',
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
  const previewCharacter = params.get('character');
  if(resourceMode && resourcePreview.view==='stage' && previewCharacter) await stageRoster.select(previewCharacter);
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
  const garden=resourcePreview?.view==='garden';
  if (mixer && !state.paused) {
    if(garden&&isZuzu())footprints?.update(delta);
    // Restore the authored pose before the mixer's unchanged-value cache runs.
    combat?.restorePose();
    tackle?.restorePose();
    mud?.restorePose();
    if(garden&&isZuzu()){
      if(!groundSkillActive())combat.update(delta);
      tackle.update(delta);
      mud.update(delta);
    }
    if(garden)iron?.update(delta);
    if(garden&&iron?.active){
      active.time=iron.time;
      mixer.update(0);
      visualPivot.position.x=iron.lunge;
    }else mixer.update(tackle?.holding?0:delta);
    if(garden&&isZuzu())swimming?.update(delta);
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
          const cruiseSpeed = gait.speed * state.rate * (currentName === 'Run' && isZuzu() ? gardenRunSpeedMultiplier : 1);
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
          if(isZuzu())footprints.step({name:currentName,time:active.time,action:state.transitions,distance:travelled,groundHit});
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
      gardenFriends.update(delta);
      if(isZuzu()){
        if(tackle.active)tackle.applyPose();else if(mud.active)mud.applyPose();else combat.pose();
      }
      tackleEffects.update(delta,actor.position,iron.active?iron.direction:tackle.direction,iron.active?iron.dashing:tackle.dashing,iron.active?0:tackle.flightHeight);
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
  if(active&&isZuzu())eyeExpressions?.update(currentName,active.time);
  if(garden)resourcePreview.pondWater.update(state.paused?0:delta,{contacts:isZuzu()?resourcePreview.swimContacts():[],position:actor.position,yaw:actor.rotation.y,inWater:isZuzu()&&swimming?.inWater,moving:isZuzu()&&swimming?.moving});
}
renderer.setAnimationLoop((now) => {
  if (mobileGraphics && previousTime !== undefined && now - previousTime < 1000 / 30 - 1) return;
  const delta = previousTime === undefined ? 0 : Math.min((now-previousTime)/1000, .05);
  previousTime = now;
  stepSimulation(delta);
  updateTimeline();
  updateOrbitInput();
  controls.update();
  updateCombatUI();
  destinationMarker?.update(state.paused?0:delta,camera,innerHeight);
  if(resourcePreview?.view==='garden'){
    resourcePreview.pondWater.prepare(camera, now);
    tackleEffects.prepare(camera);
    mudEffects.prepare(camera);
  }
  if(toon)toon.renderFrame(camera);else renderer.render(scene,camera);
  positionGardenDanceEffects();
  if (state.loaded && !diagnostics.ready) {
    diagnostics.ready = true;
    if (resourceMode) {
      advanceGardenLoading();
      hideGardenLoading();
    }
  }
});
