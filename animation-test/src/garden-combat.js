import * as THREE from 'three';
import {solveWaterAim} from './water-aim.js';

const names={normal:'普通靶',moving:'滑轨靶',heavy:'重型靶'};
export function createGardenCombat({actor,model,preview,onShoot,onStop,onMessage,onHit}){
  let mode='move',phase='idle',point=null,targetId=null,shot=0,lastContact=null;
  let assessment=null,assessmentAge=0;
  const head=model.getObjectByName('Head'),socket=model.getObjectByName('Socket_Mouth');
  const animationHead=head.quaternion.clone();
  let poseApplied=false;
  function restorePose(){if(poseApplied){head.quaternion.copy(animationHead);poseApplied=false;}}
  const origin=new THREE.Vector3(),desired=new THREE.Quaternion(),parentQ=new THREE.Quaternion(),worldQ=new THREE.Quaternion(),tiltQ=new THREE.Quaternion();
  const assessedOrigin=new THREE.Vector3(Infinity,Infinity,Infinity);
  const assessedPoint=new THREE.Vector3(Infinity,Infinity,Infinity);
  const up=new THREE.Vector3(0,1,0),right=new THREE.Vector3();
  const targetName=id=>preview.visitorName?.(id)??preview.orchard?.treeName(id)??names[id];
  function clearMissingAim(){
    if(!(targetId?.startsWith('visitor:')||preview.orchard?.treeName(targetId))||preview.targetPoint(targetId))return;
    restorePose();point=null;targetId=null;assessment=null;phase='idle';
  }
  function assess(){
    assessmentAge=0;
    if(!point){assessment=null;return;}
    actor.updateMatrixWorld(true);socket.getWorldPosition(origin);
    assessedOrigin.copy(origin);
    assessedPoint.copy(point);
    const aim=solveWaterAim(origin,point),contact=preview.traceWater(origin,aim.direction);
    const clear=targetId?contact.targetId===targetId:contact.point.distanceTo(point)<.35;
    assessment={reachable:aim.reachable,clear,range:aim.range,angle:aim.angle,contact:contact.point.toArray(),blocked:!!targetId&&aim.reachable&&!clear};
  }
  return {
    setMode(value){if(value===mode)return;restorePose();onStop();mode=value;phase='idle';if(value==='move'){point=null;targetId=null;assessment=null;}onMessage(value==='aim'?'点按水枪喷水，拖动技能键可自由瞄准。':'点草地移动，点按右下角水枪喷水。');},
    aimAt(value,id=null,{predict=true,silent=false}={}){
      if(phase!=='idle'||!value)return false;
      if(mode!=='aim')this.setMode('aim');
      point=value.clone();targetId=id;
      if(predict)assess();
      if(!silent){
        const tree=preview.orchard?.treeName(id);
        if(tree&&predict&&!assessment.reachable)onMessage(`${tree}离得有点远，走近些再瞄准。`);
        else onMessage(id?`已锁定${targetName(id)}，点按水枪发射。`:'松开水枪技能键发射。');
      }
      return true;
    },
    fire(paused=false){if(paused||mode!=='aim'||!point||phase!=='idle')return false;phase='turning';onStop();onMessage('转过身，准备蓄水…');return true;},
    cancel(){restorePose();phase='idle';point=null;targetId=null;assessment=null;lastContact=null;},
    onActionChange(name,{completed=false}={}){if(name!=='WaterShoot'&&phase==='shooting'){phase='idle';if(!completed)lastContact=null;clearMissingAim();}},
    contact(event){
      if(event.shotId!==shot)return;
      lastContact={...event,point:event.point.toArray()};
      if(event.targetId){
        const message=onHit(event.targetId,event.direction);
        onMessage(typeof message==='string'?message:`命中${targetName(event.targetId)}！`);
        if(phase==='idle')clearMissingAim();
      }else onMessage('水花落下了，再调整一下准星。');
    },
    update(delta){
      assessmentAge+=delta;
      if(phase!=='shooting'&&targetId?.startsWith('visitor:')){
        const aim=preview.targetPoint(targetId);
        if(aim)point.copy(aim);else clearMissingAim();
      }
      if(!point||mode!=='aim')return;
      if(phase!=='shooting'){
        const dx=point.x-actor.position.x,dz=point.z-actor.position.z;
        desired.setFromAxisAngle(up,Math.atan2(dx,dz));actor.quaternion.rotateTowards(desired,8*delta);
        if(phase==='turning'&&actor.quaternion.angleTo(desired)<.035){phase='shooting';shot++;lastContact=null;onShoot(point.clone(),shot);onMessage('闭嘴蓄水…');}
      }
    },
    pose(){
      restorePose();
      if(!point||mode!=='aim')return;
      animationHead.copy(head.quaternion);
      actor.updateMatrixWorld(true);socket.getWorldPosition(origin);
      const aim=solveWaterAim(origin,point);
      right.set(1,0,0).applyQuaternion(actor.quaternion);
      tiltQ.setFromAxisAngle(right,-THREE.MathUtils.clamp(aim.angle*.7,-.25,.40));
      head.getWorldQuaternion(worldQ);head.parent.getWorldQuaternion(parentQ);
      head.quaternion.copy(parentQ.invert().multiply(tiltQ).multiply(worldQ));
      poseApplied=true;
      actor.updateMatrixWorld(true);socket.getWorldPosition(origin);
      // Static targets need a new collision prediction only after a meaningful
      // mouth movement, plus a slow refresh while a target rebounds.
      if(assessmentAge>=.12&&(origin.distanceToSquared(assessedOrigin)>.0004||point.distanceToSquared(assessedPoint)>.0016||assessmentAge>=.6))assess();
    },
    restorePose,
    targetName,
    get point(){return point;},get mode(){return mode;},
    debug:()=>({mode,phase,point:point?.toArray()??null,targetId,targetName:targetName(targetId)??'草地',shot,lastContact,assessment}),
  };
}
