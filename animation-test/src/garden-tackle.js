import * as THREE from 'three';
import {createGardenActionPose} from './garden-action-pose.js';

const WINDUP=.18,FLIGHT=.34,RANGE=2,HIT_STOP=.045,RECOVERY=.28;
const {clamp,lerp,smoothstep}=THREE.MathUtils;

export function createGardenTackle({actor,pivot,model,navigation,groundHeight,targetContact,effects,onPhase,onHit}){
  const pose=createGardenActionPose(actor,pivot,model);
  const up=new THREE.Vector3(0,1,0),direction=new THREE.Vector3();
  const desired=new THREE.Quaternion(),turnStart=new THREE.Quaternion();
  const start=new THREE.Vector3(),end=new THREE.Vector3(),recoil=new THREE.Vector3(),contact=new THREE.Vector3();
  const floorPoint=new THREE.Vector3();
  let phase='idle',age=0,duration=0,distance=0,apex=0,blockedBy=null,hitId=null,kind=null,lunge=0,travel=0;
  const flightProgress=()=>clamp(age/duration,0,1);
  function flightHeight(){
    if(phase!=='dash')return 0;
    const t=flightProgress();
    return 4*t*(1-t)*apex;
  }

  function change(next){phase=next;age=0;onPhase(next,kind,hitId);}
  function startTackle(lockedPoint){
    if(phase!=='idle'||!navigation.isWalkable(actor.position))return false;
    direction.set(0,0,1).applyQuaternion(actor.quaternion);
    if(lockedPoint&&Math.hypot(lockedPoint.x-actor.position.x,lockedPoint.z-actor.position.z)>.01){
      direction.subVectors(lockedPoint,actor.position);
    }
    direction.setY(0).normalize();
    turnStart.copy(actor.quaternion);
    desired.setFromAxisAngle(up,Math.atan2(direction.x,direction.z));
    blockedBy=hitId=kind=null;lunge=distance=apex=travel=0;
    change('windup');
    return true;
  }
  function place(x,z){
    const y=groundHeight(x,z);
    actor.position.set(x,(y??actor.position.y-.005)+.005,z);
  }
  function findContact(){
    const candidate=blockedBy?.startsWith('target-')?blockedBy.slice(7):blockedBy?.startsWith('visitor:')?blockedBy:null;
    const surface=candidate?targetContact(candidate,end,direction):null;
    hitId=surface?candidate:null;
    lunge=0;
    if(!surface)return;
    contact.copy(surface);
    const contactDistance=(contact.x-end.x)*direction.x+(contact.z-end.z)*direction.z;
    lunge=clamp(contactDistance-.48,0,.28);
  }
  function launch(){
    start.copy(actor.position);
    end.copy(start).addScaledVector(direction,RANGE);
    const sweep=navigation.sweep(start,end);
    end.set(sweep.position.x,groundHeight(sweep.position.x,sweep.position.z)??start.y,sweep.position.z);
    blockedBy=sweep.blockedBy;
    distance=Math.hypot(end.x-start.x,end.z-start.z);
    findContact();
    const rangeFraction=clamp(distance/RANGE,0,1);
    const openPounce=hitId!==null||blockedBy===null;
    duration=FLIGHT*(openPounce?lerp(.60,1,Math.sqrt(rangeFraction)):clamp(rangeFraction,.28,1));
    apex=openPounce?lerp(.155,.28,Math.sqrt(rangeFraction)):.24*smoothstep(distance,.05,1.8);
    floorPoint.copy(start).addScaledVector(direction,-.19);floorPoint.y=start.y+.028;
    effects.dust(floorPoint,direction,'launch');
    change('dash');
  }
  function finishDash(){
    if(hitId?.startsWith('visitor:')&&!targetContact(hitId,actor.position,direction)){
      blockedBy=hitId=null;
    }
    if(hitId){
      kind='hit';
      effects.hit(contact,direction);
      onHit(hitId,direction,HIT_STOP);
      change('hitstop');
      return;
    }
    kind=blockedBy?'blocked':'miss';
    beginRecovery();
  }
  function beginRecovery(){
    floorPoint.copy(actor.position).addScaledVector(direction,.21+lunge);floorPoint.y=actor.position.y+.035;
    effects.dust(floorPoint,direction,kind==='hit'?'landing':kind);
    end.copy(actor.position);
    const back=recoil.copy(end).addScaledVector(direction,kind==='hit'?-.15:kind==='blocked'?-.075:0);
    const sweep=navigation.sweep(end,back);
    recoil.set(sweep.position.x,end.y,sweep.position.z);
    change('recover');
  }
  function update(delta){
    if(phase==='idle'||delta<=0)return;
    age+=delta;
    if(phase==='windup'){
      actor.quaternion.slerpQuaternions(turnStart,desired,smoothstep(age,0,WINDUP));
      if(age>=WINDUP)launch();
    }else if(phase==='dash'){
      const t=flightProgress(),ramp=.22;
      const progress=(t<ramp?t*t/(2*ramp):t-ramp/2)/(1-ramp/2);
      const sweep=navigation.sweep(actor.position,{x:lerp(start.x,end.x,progress),z:lerp(start.z,end.z,progress)});
      place(sweep.position.x,sweep.position.z);
      travel=Math.hypot(actor.position.x-start.x,actor.position.z-start.z);
      if(sweep.blockedBy){blockedBy=sweep.blockedBy;end.copy(actor.position);findContact();}
      if(t>=1||sweep.blockedBy)finishDash();
    }else if(phase==='hitstop'){
      if(age>=HIT_STOP)beginRecovery();
    }else{
      const t=smoothstep(age,0,.19);
      place(lerp(end.x,recoil.x,t),lerp(end.z,recoil.z,t));
      if(age>=RECOVERY)change('idle');
    }
  }
  function applyPose(){
    if(phase==='idle')return;
    if(phase==='windup'){
      const t=smoothstep(age,0,.145);
      pose.apply({height:-.046*t,pitch:.145*t,headPitch:.15*t,finPitch:-.19*t,tailPitch:.28*t,lunge:0,planted:smoothstep(t,0,.42)});
    }else if(phase==='dash'){
      const t=flightProgress(),push=smoothstep(t,0,.20),dive=smoothstep(t,.36,.95);
      const lift=clamp(apex/.17,0,1);
      const tuck=smoothstep(t,.15,.40)*(1-smoothstep(t,.58,.89))*lift;
      const reach=smoothstep(t,.58,.81)*(1-smoothstep(t,.90,1))*lift;
      const paws=tuck+reach>.001?{
        frontLift:.059*tuck,rearLift:.084*tuck,
        frontReach:.059*reach-.044*tuck,rearReach:-.026*tuck-.019*reach,
      }:null;
      pose.apply({height:flightHeight()-.046*(1-push)+.024*dive,
        pitch:lerp(lerp(.145,-.15*lift,push),.22,dive),headPitch:lerp(.15,-.12,push),
        finPitch:lerp(-.19,-.32,push),tailPitch:lerp(.28,-.22,push),lunge:lunge*smoothstep(t,.35,1),
        planted:1-smoothstep(t,0,.15),paws});
    }else if(phase==='hitstop'){
      pose.apply({height:.024,pitch:.22,headPitch:-.12,finPitch:-.32,tailPitch:-.22,lunge,planted:0});
    }else{
      const t=clamp(age/RECOVERY,0,1),settle=1-smoothstep(t,.12,1),snap=Math.sin(t*Math.PI*2)*settle;
      const kick=smoothstep(t,0,.23);
      pose.apply({height:lerp(.024,-.018,kick)*settle,pitch:lerp(.22,kind==='miss'?.22:-.13,kick)*settle,
        headPitch:-.12*(1-kick)+.12*snap,finPitch:-.32*(1-kick)+.34*snap,tailPitch:-.22*(1-kick)-.24*snap,
        lunge:lunge*(1-smoothstep(t,0,.55)),planted:.84*kick*settle});
    }
  }
  function reset(){
    pose.restore();effects.reset();phase='idle';age=travel=0;blockedBy=hitId=kind=null;
  }
  return {start:startTackle,update,applyPose,restorePose:pose.restore,reset,
    get active(){return phase!=='idle';},get holding(){return phase==='hitstop';},get dashing(){return phase==='dash';},
    get direction(){return direction;},get flightHeight(){return flightHeight();},
    debug:()=>({phase,age,travel,flightHeight:flightHeight(),kind,blockedBy,hitId,contact:hitId?contact.toArray():null})};
}
