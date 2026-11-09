import * as THREE from 'three';
import {createGardenActionPose} from './garden-action-pose.js';

const SCRAPE=.105,RELEASE=.26,RECOVER=.63,RANGE=3,SPEED=8.6,GRAVITY=20;
const {lerp,smoothstep}=THREE.MathUtils;

export function createGardenMud({actor,pivot,model,groundHeight,trace,resolveTarget,effects,onRelease,onContact}){
  const pose=createGardenActionPose(actor,pivot,model);
  const hand=model.getObjectByName('RHand');
  const up=new THREE.Vector3(0,1,0),forward=new THREE.Vector3(),side=new THREE.Vector3();
  const desired=new THREE.Quaternion(),turnStart=new THREE.Quaternion();
  const pawPoint=new THREE.Vector3(),scoopPoint=new THREE.Vector3(),destination=new THREE.Vector3();
  const origin=new THREE.Vector3(),previous=new THREE.Vector3(),next=new THREE.Vector3();
  const velocity=new THREE.Vector3(),tangent=new THREE.Vector3();
  let targetId=null,age=RECOVER,flight=0,flying=false,scraped=false,released=false,lastContact=null;

  function start(point,id){
    if(age<RECOVER||flying)return false;
    forward.set(0,0,1).applyQuaternion(actor.quaternion);
    if(point&&Math.hypot(point.x-actor.position.x,point.z-actor.position.z)>.01)forward.subVectors(point,actor.position);
    forward.setY(0).normalize();
    side.set(-forward.z,0,forward.x);
    turnStart.copy(actor.quaternion);
    desired.setFromAxisAngle(up,Math.atan2(forward.x,forward.z));
    targetId=id;age=flight=0;scraped=released=false;lastContact=null;
    return true;
  }

  function throwMud(){
    released=flying=true;
    origin.copy(pawPoint);previous.copy(origin);
    const aim=targetId?resolveTarget(targetId):null;
    const aimedRange=aim?Math.hypot(aim.x-origin.x,aim.z-origin.z):Infinity;
    if(aimedRange>=.24&&aimedRange<=RANGE)destination.copy(aim);
    else{
      destination.copy(origin).addScaledVector(forward,RANGE);
      let ground=groundHeight(destination.x,destination.z);
      if(ground===null){
        // Shorten free throws at the garden's edge so the clod still lands on the lawn.
        let low=0,high=RANGE;
        for(let i=0;i<8;i++){
          const range=(low+high)*.5;
          destination.copy(origin).addScaledVector(forward,range);
          if(groundHeight(destination.x,destination.z)===null)high=range;else low=range;
        }
        destination.copy(origin).addScaledVector(forward,Math.max(.16,low-.08));
        ground=groundHeight(destination.x,destination.z);
      }
      destination.y=(ground??actor.position.y-.005)+.015;
    }
    const travelTime=Math.hypot(destination.x-origin.x,destination.z-origin.z)/SPEED;
    velocity.subVectors(destination,origin).divideScalar(travelTime);
    velocity.y+=.5*GRAVITY*travelTime;
    effects.release(origin,velocity);
    onRelease();
  }

  function update(delta){
    if(delta<=0)return;
    if(age<RECOVER){
      age=Math.min(RECOVER,age+delta);
      actor.quaternion.slerpQuaternions(turnStart,desired,smoothstep(age,0,.16));
    }
    if(!flying)return;
    flight+=delta;
    next.copy(origin).addScaledVector(velocity,flight);next.y-=.5*GRAVITY*flight*flight;
    tangent.copy(velocity);tangent.y-=GRAVITY*flight;
    const contact=trace(previous,next);
    if(contact){
      flying=false;
      lastContact={kind:contact.kind,targetId:contact.targetId,point:contact.point.toArray()};
      effects.land(contact,tangent);
      onContact(contact,tangent);
    }else if(flight>.72){
      flying=false;effects.hideGlob();
    }else{
      effects.flight(next,tangent,flight);
      previous.copy(next);
    }
  }

  function applyPose(){
    if(age>=RECOVER)return;
    // Take the release sample even when a slow frame steps over it.
    const t=released?age:Math.min(age,RELEASE);
    const crouch=smoothstep(t,0,.115)*(1-smoothstep(t,.19,.38));
    const draw=smoothstep(t,.06,.145)*(1-smoothstep(t,.16,.232));
    const flick=smoothstep(t,.164,RELEASE)*(1-smoothstep(t,.285,.46));
    const settle=1-smoothstep(t,.46,RECOVER);
    pose.apply({height:-.037*crouch+.018*flick,pitch:.15*crouch-.10*flick,bank:-.15*draw+.17*flick,
      headPitch:.18*crouch-.095*flick,finPitch:-.17*draw+.19*flick,tailPitch:.19*draw-.24*flick,
      planted:settle,scoop:{reach:-.049*draw+.124*flick,lift:.043*draw+.118*flick,side:.026*draw+.091*flick}});
    if(released)return;
    hand.getWorldPosition(pawPoint);
    if(age>=SCRAPE&&!scraped){
      scraped=true;
      scoopPoint.copy(pawPoint).addScaledVector(forward,.09);
      scoopPoint.y=(groundHeight(scoopPoint.x,scoopPoint.z)??actor.position.y)+.027;
      effects.scrape(scoopPoint,forward);
    }
    if(age<SCRAPE)return;
    pawPoint.addScaledVector(side,.048+.105*flick).addScaledVector(forward,.064+.109*flick);
    pawPoint.y+=.028+.055*flick;
    if(age>=RELEASE)throwMud();
    else effects.scoop(pawPoint,forward,smoothstep(age,SCRAPE,RELEASE));
  }

  function reset(){
    pose.restore();effects.reset();targetId=null;age=RECOVER;flight=0;flying=scraped=released=false;lastContact=null;
  }
  return {start,update,applyPose,restorePose:pose.restore,reset,
    get active(){return age<RECOVER;},get ready(){return age>=RECOVER&&!flying;},
    debug:()=>({phase:age<RELEASE?'scoop':flying?'flight':age<RECOVER?'recover':'idle',age,flight,lastContact})};
}
