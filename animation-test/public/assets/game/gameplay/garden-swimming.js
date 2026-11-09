import * as THREE from 'three';

export function createGardenSwimming({actor,pond,walkTo,isWalking,groundHeight,onClip,canAnimate,onStop,onMessage,onSplash,stroke=()=>0,onMotion=()=>{},onLand=()=>{}}){
  const [cx,cz]=pond.center,[rx,rz]=pond.radii;
  const entry={land:new THREE.Vector3(cx-rx-.60,0,cz),water:new THREE.Vector3(cx-(rx-pond.inset)*.7,0,cz)};
  entry.land.y=(groundHeight(entry.land.x,entry.land.z)??0)+.005;
  const waterY=pond.height-.19;
  entry.water.y=waterY;
  const up=new THREE.Vector3(0,1,0),desired=new THREE.Quaternion();
  let phase='land',goal=null,afterExit=null,progress=0,clock=0,speed=0,start=new THREE.Vector3(),splashSent=false;
  const velocity=new THREE.Vector3(),forward=new THREE.Vector3();let heave=0,heaveVelocity=0;
  const contains=p=>((p.x-cx)/rx)**2+((p.z-cz)/rz)**2<=1.08**2;
  function clampGoal(p){const q=new THREE.Vector2((p.x-cx)/(rx-pond.inset),(p.z-cz)/(rz-pond.inset));if(q.length()>1)q.normalize();return new THREE.Vector3(cx+q.x*(rx-pond.inset),waterY,cz+q.y*(rz-pond.inset));}
  function clip(name){if(canAnimate())onClip(name);}
  function beginExit(){onStop();phase='exiting';progress=0;start.copy(actor.position);splashSent=false;speed=0;velocity.set(0,0,0);clip('Swim');onMessage('游回岸边，准备上岸。');}
  function request(point){
    if(contains(point)){
      goal=clampGoal(point);afterExit=null;
      if(phase==='exiting')afterExit=()=>request(point);
      if(phase==='land'){
        const plan=walkTo(entry.land);if(!plan?.ok){onMessage('岸边暂时过不去，换个位置再试试。');return {handled:true,plan};}
        phase='approaching';onMessage('去岸边，准备下水。');return {handled:true,plan};
      }
      if(phase==='swimming'){const previousSpeed=speed;onStop();speed=previousSpeed;clip('Swim');}
      return {handled:true,plan:{ok:true,goal:{x:goal.x,z:goal.z},waypoints:[],swimming:true}};
    }
    if(phase==='land'||phase==='approaching'){phase='land';goal=null;return {handled:false};}
    afterExit=()=>walkTo(point);
    if(phase==='swimming')beginExit();
    return {handled:true,plan:{ok:true,goal:{x:point.x,z:point.z},waypoints:[],swimming:true}};
  }
  function update(delta){
    clock+=delta;
    if(phase==='approaching'&&!isWalking()){
      if(actor.position.distanceTo(entry.land)>.08){reset();return;}
      phase='entering';progress=0;start.copy(actor.position);onStop();clip('Swim');splashSent=false;
    }
    if(phase==='entering'||phase==='exiting'){
      progress=Math.min(1,progress+delta/(phase==='entering'?.95:1.15));
      const end=phase==='entering'?entry.water:entry.land;
      const t=THREE.MathUtils.smoothstep(progress,0,1);
      actor.position.lerpVectors(start,end,t);
      actor.position.y+=Math.sin(progress*Math.PI)*.025;
      actor.position.y=Math.max(actor.position.y,(groundHeight(actor.position.x,actor.position.z)??actor.position.y)+.005);
      desired.setFromAxisAngle(up,Math.atan2(end.x-start.x,end.z-start.z));actor.quaternion.rotateTowards(desired,5*delta);
      if(!splashSent){
        const shore=Math.hypot((actor.position.x-cx)/rx,(actor.position.z-cz)/rz);
        if(phase==='entering'&&progress>.5){onSplash(actor.position,{kind:'entry'});splashSent=true;}
        else if(phase==='exiting'&&shore>=.90){
          // Anchor the exit splash to the last water contact, not the dry bank.
          const point=actor.position.clone();point.x=cx+(point.x-cx)*.90/shore;point.z=cz+(point.z-cz)*.90/shore;
          onSplash(point,{kind:'exit'});splashSent=true;
        }
      }
      if(progress===1){
        if(phase==='entering'){
          phase='swimming';velocity.set(0,0,0);onMessage('下水啦！点水面游泳，点草地上岸。');
          if(afterExit)beginExit();
        }else{
          phase='land';goal=null;onLand();clip('Idle');const next=afterExit;afterExit=null;
          if(next)next();else onMessage('回到岸上啦。');
        }
      }
      return;
    }
    if(phase!=='swimming')return;
    // Damped buoyancy: a small lift follows propulsion, rather than an
    // independent, constantly bouncing sine animation.
    const desiredHeave=Math.min(.004,speed*.005);
    heaveVelocity+=(desiredHeave-heave)*35*delta-heaveVelocity*9*delta;
    heave+=heaveVelocity*delta;actor.position.y=waterY+heave;
    if(!canAnimate())return;
    const distance=goal?actor.position.clone().setY(waterY).distanceTo(goal):0;
    if(distance>.012){
      const direction=goal.clone().sub(actor.position);direction.y=0;direction.normalize();
      forward.set(0,0,1).applyQuaternion(actor.quaternion);
      const turn=Math.atan2(new THREE.Vector3().crossVectors(forward,direction).y,forward.dot(direction));
      desired.setFromAxisAngle(up,Math.atan2(direction.x,direction.z));actor.quaternion.rotateTowards(desired,2.8*delta);
      forward.set(0,0,1).applyQuaternion(actor.quaternion);
      const facing=Math.max(0,forward.dot(direction)),pulse=.92+.08*Math.sin(stroke()*Math.PI*4-.5);
      const desiredSpeed=Math.min(.65*pulse,Math.sqrt(2*.85*distance))*facing;
      const before=speed;speed=THREE.MathUtils.clamp(desiredSpeed,speed-1.2*delta,speed+.85*delta);
      velocity.lerp(forward.multiplyScalar(speed),1-Math.exp(-delta*9));
      if(velocity.length()*delta>=distance){actor.position.copy(goal);goal=null;speed=0;velocity.set(0,0,0);}
      else actor.position.addScaledVector(velocity,delta);
      const bounded=clampGoal(actor.position);actor.position.x=bounded.x;actor.position.z=bounded.z;
      onMotion({turn,speed,acceleration:(speed-before)/Math.max(delta,.001)});clip('Swim');
    }else{
      goal=null;speed=THREE.MathUtils.damp(speed,0,10,delta);velocity.multiplyScalar(Math.exp(-delta*12));
      onMotion({turn:0,speed:0,acceleration:0});clip('SwimIdle');
    }
  }
  function reset(){phase='land';goal=null;afterExit=null;progress=0;speed=0;velocity.set(0,0,0);heave=heaveVelocity=0;}
  return {request,update,reset,contains,hold:()=>{if(phase==='swimming'){goal=null;speed=0;}},
    leave(callback){if(phase==='land')return false;afterExit=callback;if(phase==='approaching'){reset();callback();}else if(phase==='swimming')beginExit();return true;},
    get inWater(){return ['swimming','entering','exiting'].includes(phase);},get busy(){return phase==='entering'||phase==='exiting';},
    get moving(){return phase==='swimming'&&speed>.04;},
    debug:()=>({phase,progress,speed,velocity:velocity.toArray(),heave,goal:goal?.toArray()??null,entry:{land:entry.land.toArray(),water:entry.water.toArray()},waterY})};
}
