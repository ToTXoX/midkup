import {gardenAction} from './garden-ui-helpers.mjs';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
const errors=[],warnings=[],checks=[];
page.on('pageerror',(e)=>errors.push(e.message));
page.on('console',(m)=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
page.on('requestfailed',(r)=>errors.push(r.url()+': '+r.failure()?.errorText));
const record=(name,details)=>{checks.push({name,passed:true,details});console.log('PASS',name,details??'');};
const shot=async(name)=>page.screenshot({path:fileURLToPath(new URL(`../../renders/${name}.png`,import.meta.url)),fullPage:true});
try{
  await page.goto((process.env.TEST_URL??'http://127.0.0.1:5173/')+'resources.html',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__mudkipTest?.diagnostics.ready,{timeout:30000});
  const data=await page.evaluate(async()=>({metadata:await(await fetch('/assets/game/characters/mudkip/animations.json')).json(),diagnostics:window.__mudkipTest.diagnostics,resources:window.__mudkipTest.resources()}));
  assert.equal(data.metadata.clips.length,12);
  assert.equal(data.diagnostics.clips.length,12);
  for(const clip of data.metadata.clips)assert(Math.abs(data.diagnostics.clips.find((c)=>c.name===clip.name).duration-clip.duration)<.00001);
  assert.equal(data.resources.targets,3);
  assert.equal(data.resources.groups,10);
  assert.equal(data.resources.colliders,22);
  assert.equal(data.resources.vertexColorMeshes+data.resources.proceduralWaterMeshes,data.resources.renderMeshes);
  record('All twelve animation clips, compressed garden, vertex colors and separate props load',data.resources);
  await shot('game-resources-stage');

  const samples=await page.evaluate((metadata)=>{
    const api=window.__mudkipTest,result={};
    for(const clip of metadata.clips){
      const first=api.sample(clip.name,0),end=api.sample(clip.name,clip.duration-1e-6);
      let motion=0,rootHorizontal=0;
      for(const fraction of [.2,.4,.6,.8]){
        const current=api.sample(clip.name,clip.duration*fraction);
        motion=Math.max(motion,...first.positions.map((v,i)=>Math.abs(v-current.positions[i])));
        rootHorizontal=Math.max(rootHorizontal,Math.hypot(current.rootPosition[0],current.rootPosition[2]));
      }
      result[clip.name]={motion,rootHorizontal,seam:Math.max(...first.positions.map((v,i)=>Math.abs(v-end.positions[i])))};
    }
    for(const name of ['Walk','Run']){
      const a=api.sample(name,.04).feet.find((f)=>f.name==='LHand').position;
      const b=api.sample(name,.10).feet.find((f)=>f.name==='LHand').position;
      result[name].stanceResidual=Math.abs(b[2]-a[2]+metadata.locomotion[name].speed*.06);
      result[name].groundResidual=Math.abs(b[1]-a[1]);
    }
    return result;
  },data.metadata);
  for(const clip of data.metadata.clips){assert(samples[clip.name].motion>.001,clip.name+' must deform');assert(samples[clip.name].rootHorizontal<(clip.name.startsWith('Dance')?.055:1e-5));if(clip.loop)assert(samples[clip.name].seam<1e-4,clip.name+' loop seam');}
  for(const name of ['Walk','Run']){assert(samples[name].stanceResidual<.00015);assert(samples[name].groundResidual<.001);}
  record('All clips deform and loop correctly; dance stays within 5.5 cm; Walk and Run match runtime speed',samples);

  const mouth=await page.evaluate(()=>{
    const api=window.__mudkipTest;
    const closed=api.sample('Idle',0).jawQuaternion;
    const difference=(clip,time)=>{
      const q=api.sample(clip,time).jawQuaternion;
      return 2*Math.acos(Math.min(1,Math.abs(q.reduce((sum,v,i)=>sum+v*closed[i],0))));
    };
    return {charge:difference('WaterCharge',.4),preparation:difference('WaterShoot',.20),open:difference('WaterShoot',.40),closedAgain:difference('WaterShoot',.95)};
  });
  assert(mouth.charge<.025&&mouth.preparation<.025&&mouth.closedAgain<.025);
  assert(mouth.open>.28,'water emission must coincide with a visibly open jaw');
  record('Jaw stays closed during charge and anticipation, opens to fire, then closes again',mouth);
  const shoot=data.metadata.clips.find((c)=>c.name==='WaterShoot');
  const waterStart=shoot.events.find((e)=>e.event==='water_start').time;
  const waterStop=shoot.events.find((e)=>e.event==='water_stop').time;

  await page.evaluate(()=>{window.__mudkipTest.play('Idle',true);window.__mudkipTest.seek(0);});
  await page.waitForTimeout(50);
  assert((await page.evaluate(()=>window.__mudkipTest.resources())).direction[2]>.99);
  await page.getByRole('button',{name:'进食 低头咀嚼'}).click();
  await page.evaluate(()=>window.__mudkipTest.seek(.5));await page.waitForTimeout(50);
  assert((await page.evaluate(()=>window.__mudkipTest.resources())).food);
  await shot('game-resources-eat');
  await page.evaluate(()=>window.__mudkipTest.seek(1));await page.waitForTimeout(50);
  assert(!(await page.evaluate(()=>window.__mudkipTest.resources())).food);
  await page.evaluate(()=>window.__mudkipTest.pause(false));await page.waitForFunction(()=>window.__mudkipTest.snapshot().clip==='Idle',null,{timeout:4000});
  assert.equal((await page.evaluate(()=>window.__mudkipTest.snapshot())).clip,'Idle');
  record('Mouth emitter points forward; Eat attaches and consumes the berry, then returns to Idle');

  await page.getByRole('button',{name:'蓄力 稳住身体'}).click();
  await page.evaluate(()=>window.__mudkipTest.seek(.4));await page.waitForTimeout(50);
  assert(!(await page.evaluate(()=>window.__mudkipTest.resources())).orb);
  await shot('game-resources-charge');
  await page.getByRole('button',{name:'喷水 张嘴发射'}).click();
  await page.evaluate(()=>window.__mudkipTest.seek(.10));await page.waitForTimeout(50);
  assert(!(await page.evaluate(()=>window.__mudkipTest.resources())).water);
  await page.evaluate((t)=>window.__mudkipTest.seek(t),waterStart+.08);await page.waitForTimeout(50);
  assert((await page.evaluate(()=>window.__mudkipTest.resources())).water);
  await shot('game-resources-shoot');
  await page.evaluate((t)=>window.__mudkipTest.seek(t),waterStop+.09);await page.waitForTimeout(50);
  const cutoff=await page.evaluate(()=>window.__mudkipTest.resources());
  assert(!cutoff.waterEffect.emitting && cutoff.water);
  await page.evaluate(()=>window.__mudkipTest.pause(false));await page.waitForTimeout(500);
  assert.equal((await page.evaluate(()=>window.__mudkipTest.snapshot())).clip,'Idle');
  record('WaterCharge holds a closed mouth with no external orb; detached water continues after emission stops',{waterStart,waterStop});

  await page.selectOption('#scene-view','garden');await page.waitForTimeout(250);
  assert.equal((await page.evaluate(()=>window.__mudkipTest.resources())).view,'garden');
  assert(!(await page.locator('#movement').isDisabled()));
  assert(await page.locator('#garden-controls').isVisible());
  await shot('game-resources-garden');
  await gardenAction(page,'返回动作台');
  assert(!(await page.locator('#movement').isDisabled()));
  record('Garden enables collision-aware movement with compact controls; stage interactions restore correctly');

  await page.getByRole('button',{name:'小跑 蹬地轻跳'}).click();
  await page.evaluate(()=>window.__mudkipTest.moveTo(.8,0));await page.waitForTimeout(350);
  const running=await page.evaluate(()=>window.__mudkipTest.snapshot());
  assert.equal(running.clip,'Run');assert(running.position[0]>.28);
  await page.getByRole('button',{name:'进食 低头咀嚼'}).click();
  await page.getByRole('button',{name:'喷水 张嘴发射'}).click();
  await page.getByRole('button',{name:'待机 轻轻呼吸'}).click();await page.waitForTimeout(300);
  const interrupted=await page.evaluate(()=>({state:window.__mudkipTest.snapshot(),fx:window.__mudkipTest.resources()}));
  assert(interrupted.state.target===null&&!interrupted.fx.food&&!interrupted.fx.water&&!interrupted.fx.orb);
  record('Run drives faster movement; interrupted clips clean up travel and effects',running.position);

  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{window.__mudkipTest.resetPosition();window.__mudkipTest.play('Idle',true);});
  await gardenAction(page,'重置视角');await page.waitForTimeout(150);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth));
  await shot('game-resources-mobile');
  await page.selectOption('#scene-view','garden');await page.waitForTimeout(150);
  await shot('game-resources-garden-mobile');
  record('390 px stage and garden overview render without horizontal overflow');
  assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);
  record('No browser errors, warnings or failed resource requests');
  await fs.writeFile(new URL('../../docs/game-resources-browser-tests.json',import.meta.url),JSON.stringify({browser:await browser.version(),timestamp:new Date().toISOString(),checks,errors,warnings},null,2));
}finally{await browser.close();}
