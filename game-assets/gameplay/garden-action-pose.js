import * as THREE from 'three';

const {clamp}=THREE.MathUtils;

export function createGardenActionPose(actor,pivot,model){
  const limbs=[['LArm','LForeArm','LHand'],['RArm','RForeArm','RHand'],['LThigh','LLeg','LFoot'],['RThigh','RLeg','RFoot']].map((names,i)=>{
    const [upper,lower,foot]=names.map(name=>model.getObjectByName(name));
    return {upper,lower,foot,front:i<2,length1:lower.position.length(),length2:foot.position.length(),target:new THREE.Vector3(),orientation:new THREE.Quaternion()};
  });
  const [head,fin,tail,tip]=['Head','Feeler1','Tail1','Tail2'].map(name=>model.getObjectByName(name));
  const bones=[head,fin,tail,tip,...limbs.flatMap(({upper,lower,foot})=>[upper,lower,foot])];
  const saved=bones.map(()=>new THREE.Quaternion());
  const savedPosition=new THREE.Vector3(),savedRotation=new THREE.Euler();
  const origin=new THREE.Vector3(),joint=new THREE.Vector3(),goal=new THREE.Vector3(),axis=new THREE.Vector3();
  const pole=new THREE.Vector3(),from=new THREE.Vector3(),to=new THREE.Vector3(),right=new THREE.Vector3(),shift=new THREE.Vector3();
  const forward=new THREE.Vector3();
  const turn=new THREE.Quaternion(),parent=new THREE.Quaternion(),local=new THREE.Quaternion();
  let applied=false;

  function rotateWorld(bone,rotation){
    bone.parent.getWorldQuaternion(parent);
    local.copy(parent).invert().multiply(rotation).multiply(parent);
    bone.quaternion.premultiply(local);
  }
  function solveFoot({upper,lower,foot,front,length1,length2,target,orientation},weight){
    upper.getWorldPosition(origin);
    foot.getWorldPosition(goal).lerp(target,weight);
    axis.subVectors(goal,origin);
    const length=axis.length();
    if(length<1e-6)return;
    axis.multiplyScalar(1/length);
    const reach=clamp(length,Math.abs(length1-length2)+.001,length1+length2-.001);
    pole.set(0,0,front?-1:1).applyQuaternion(actor.quaternion);
    pole.addScaledVector(axis,-pole.dot(axis)).normalize();
    const along=(length1*length1-length2*length2+reach*reach)/(2*reach);
    joint.copy(origin).addScaledVector(axis,along).addScaledVector(pole,Math.sqrt(Math.max(0,length1*length1-along*along)));
    goal.copy(origin).addScaledVector(axis,reach);
    lower.getWorldPosition(from).sub(origin).normalize();
    to.subVectors(joint,origin).normalize();
    rotateWorld(upper,turn.setFromUnitVectors(from,to));
    lower.getWorldPosition(joint);
    foot.getWorldPosition(from).sub(joint).normalize();
    to.subVectors(goal,joint).normalize();
    rotateWorld(lower,turn.setFromUnitVectors(from,to));
    foot.parent.getWorldQuaternion(parent);
    foot.quaternion.slerp(parent.invert().multiply(orientation),weight);
  }
  function restore(){
    if(!applied)return;
    pivot.position.copy(savedPosition);pivot.rotation.copy(savedRotation);
    bones.forEach((bone,i)=>bone.quaternion.copy(saved[i]));
    applied=false;
  }
  function apply({height,pitch,headPitch,finPitch,tailPitch,lunge=0,bank=0,planted,paws,scoop}){
    applied=true;
    savedPosition.copy(pivot.position);savedRotation.copy(pivot.rotation);
    bones.forEach((bone,i)=>saved[i].copy(bone.quaternion));
    if(planted>0){
      shift.set(0,0,lunge).applyQuaternion(actor.quaternion);
      for(const limb of limbs){
        limb.foot.getWorldPosition(limb.target).add(shift);
        limb.foot.getWorldQuaternion(limb.orientation);
      }
    }
    pivot.position.y+=height;pivot.position.z+=lunge;pivot.rotation.x+=pitch;pivot.rotation.z+=bank;
    right.set(1,0,0).applyQuaternion(actor.quaternion);
    rotateWorld(head,turn.setFromAxisAngle(right,headPitch));
    rotateWorld(fin,turn.setFromAxisAngle(right,finPitch));
    rotateWorld(tail,turn.setFromAxisAngle(right,tailPitch));
    rotateWorld(tip,turn.setFromAxisAngle(right,tailPitch*.52));
    if(planted>0){
      for(const limb of limbs){
        if(scoop&&limb.foot.name==='RHand'){
          shift.set(-scoop.side,scoop.lift,scoop.reach).applyQuaternion(actor.quaternion);
          limb.target.add(shift);
          solveFoot(limb,1);
        }else solveFoot(limb,planted);
      }
    }else if(paws){
      forward.set(0,0,1).applyQuaternion(actor.quaternion);
      for(const limb of limbs){
        const reach=limb.front?paws.frontReach:paws.rearReach;
        limb.foot.getWorldPosition(limb.target).addScaledVector(forward,reach);
        limb.target.y+=limb.front?paws.frontLift:paws.rearLift;
        limb.foot.getWorldQuaternion(limb.orientation);
        solveFoot(limb,1);
      }
    }
  }
  return {apply,restore};
}
