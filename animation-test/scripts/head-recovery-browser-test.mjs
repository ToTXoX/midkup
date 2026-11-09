import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage();const errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto('http://127.0.0.1:5173/resources.html?scene=garden');await page.waitForFunction(()=>window.__mudkipTest?.diagnostics.ready);
  for(const fps of [30,60,120]){
    const result=await page.evaluate(fps=>{
      const t=window.__mudkipTest,angle=(a,b)=>2*Math.acos(Math.min(1,Math.abs(a.reduce((s,v,i)=>s+v*b[i],0))));
      return ['normal','moving','heavy','free'].map(target=>{
        t.resetPosition();target==='free'?t.aimAt(2,0,2):t.aimTarget(target);t.advanceMovement(.7);t.fire();
        let before=t.poseState(),maxStep=0,recoveryStep=0,mouthStep=0;
        for(let i=0;i<Math.round(fps*1.5);i++){
          t.advanceMovement(1/fps);const pose=t.poseState(),step=angle(before.head,pose.head);maxStep=Math.max(maxStep,step);
          if(i/fps>.9){recoveryStep=Math.max(recoveryStep,step);mouthStep=Math.max(mouthStep,Math.hypot(...pose.mouth.map((v,j)=>v-before.mouth[j])));}
          before=pose;
        }
        const rest=t.poseState();t.advanceMovement(2.4);const held=t.poseState();
        return {target,maxStep,recoveryStep,mouthStep,holdAngle:angle(rest.head,held.head),clip:t.snapshot().clip,contact:t.combat().lastContact?.targetId};
      });
    },fps);
    for(const r of result){
      assert(r.maxStep<.06,`${fps} FPS ${r.target}: head pose must never snap`);
      assert(r.recoveryStep<.008,`${fps} FPS ${r.target}: recovery must remain smooth across the Idle transition`);
      assert(r.mouthStep<.004,`${fps} FPS ${r.target}: mouth must not teleport during recovery`);
      assert(r.holdAngle<.035,'held aiming must not accumulate a head rotation');assert.equal(r.clip,'Idle');
      if(r.target!=='free')assert.equal(r.contact,r.target);
    }
    checks.push({fps,passed:true,result});console.log('PASS smooth head recovery and stable held aim',fps,JSON.stringify(result));
  }
  const pause=await page.evaluate(()=>{const t=window.__mudkipTest;t.aimTarget('moving');t.advanceMovement(.6);t.fire();t.advanceMovement(.95);t.pause(true);const before=t.poseState();t.advanceMovement(.2);return {before,after:t.poseState()};});
  assert.deepEqual(pause.before,pause.after);assert.deepEqual(errors,[]);
  await fs.writeFile(new URL('../../docs/head-recovery-tests.json',import.meta.url),JSON.stringify({checks,pause,errors},null,2));
}finally{await browser.close();}
