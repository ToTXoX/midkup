import {gardenAction} from './garden-ui-helpers.mjs';
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
const errors=[],warnings=[],checks=[];
page.on('pageerror',(e)=>errors.push(e.message));
page.on('console',(m)=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
page.on('requestfailed',(r)=>errors.push(r.url()+': '+r.failure()?.errorText));
const read=()=>page.evaluate(()=>window.__mudkipTest.resources().waterEffect);
const seek=async(t)=>{await page.evaluate(t=>window.__mudkipTest.seek(t),t);await page.waitForTimeout(50);return read();};
const shot=async(name)=>page.screenshot({path:fileURLToPath(new URL(`../../renders/water-gun-v05-${name}.png`,import.meta.url)),fullPage:true});
const pass=(name,details)=>{checks.push({name,passed:true,details});console.log('PASS',name,details??'');};
try{
  await page.goto((process.env.TEST_URL??'http://127.0.0.1:5173/')+'resources.html',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__mudkipTest?.diagnostics.ready);
  const timing=await page.evaluate(async()=>{
    const metadata=await(await fetch('/assets/game/characters/mudkip/animations.json')).json();
    const clip=metadata.clips.find((c)=>c.name==='WaterShoot');
    return {start:clip.events.find((e)=>e.event==='water_start').time,stop:clip.events.find((e)=>e.event==='water_stop').time};
  });
  const jetTime=timing.start+.115,collisionTime=timing.stop+.095;
  await page.getByRole('button',{name:'喷水 张嘴发射'}).click();
  const anticipation=await seek(.20);assert.equal(anticipation.phase,'anticipation');assert(!anticipation.stream&&!anticipation.mouthBead);
  await page.waitForTimeout(200);await shot('anticipation');
  const startup=await seek(timing.start+.020);
  assert(startup.stream&&startup.nearMouthDiameter>=.10,'the jet should read as a broad burst from its first frames');
  await shot('startup');
  const jet=await seek(jetTime);assert(jet.emitting&&jet.stream&&jet.fragments===1);assert(jet.flightDrops>0&&jet.flightDrops<=2);
  assert(!jet.mouthBead&&jet.maximumDiameter>.30&&jet.crest===1,'the connected stream must carry a broad wave crest');
  assert(jet.nearMouthDiameter>=.115&&jet.nearMouthDiameter<jet.maximumDiameter*.65,'the mouth connection must have a visible width before the jet flares');
  assert(jet.jetSpeed>=13&&jet.splashScale>=1.8);
  await shot('stream');
  const strike=await seek(jet.firstImpact+.057);
  assert(strike.crown&&strike.impactNormal[1]>.99&&strike.splashLobes===3&&strike.contactPatch&&strike.crest===0);
  assert(strike.splashDrops>0&&strike.splashDrops<=3);
  await shot('splash');
  const collision=await seek(collisionTime);assert(!collision.emitting&&collision.stream&&collision.fragments===1&&collision.crown);assert(collision.ripples>0);
  pass('A broad burst lifts a white crest that collapses into a three-petal splash',{startup,jet,strike,collision});
  const back=await seek(.10);assert(!back.crown&&!back.stream&&!back.ripples);
  const replay=await seek(collisionTime);assert.equal(replay.fragments,1);assert.equal(replay.firstImpact,collision.firstImpact);
  pass('Backward scrubbing reconstructs the effect without stale water or collision timing drift');

  assert.equal(replay.splashStyle,'white-wave');
  await page.evaluate(()=>window.__mudkipTest.pause(false));
  await page.waitForFunction(()=>window.__mudkipTest.resources().waterEffect.time>1.08);
  const dispersed=await read();assert.equal(dispersed.splashLobes,0);assert(!dispersed.contactPatch);
  pass('The petals collapse, and the contact foam fades separately',dispersed);
  await page.getByRole('button',{name:'喷水 张嘴发射'}).click();await seek(collisionTime);

  const before=await page.evaluate(()=>window.__mudkipTest.renderStats());
  for(let i=0;i<14;i++){
    await page.evaluate((t)=>{window.__mudkipTest.play('WaterShoot',true);window.__mudkipTest.seek(t);},collisionTime);
    await page.waitForTimeout(20);
  }
  const after=await page.evaluate(()=>window.__mudkipTest.renderStats());
  assert.deepEqual(after,before);
  pass('Repeated shots reuse GPU geometry, textures and shader programs',{before,after});

  await page.locator('#rate').evaluate((el)=>{el.value='.5';el.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await page.evaluate(()=>window.__mudkipTest.snapshot().waterRate),.5);
  await page.getByRole('button',{name:'喷水 张嘴发射'}).click();
  await page.waitForFunction(()=>window.__mudkipTest.snapshot().clip==='Idle',{timeout:3000});
  await page.waitForTimeout(240);
  const natural=await read();assert(natural.tail&&natural.active&&natural.ripples>0);
  await page.evaluate(()=>window.__mudkipTest.pause(true));await page.waitForTimeout(60);
  const time=(await read()).time;await page.waitForTimeout(180);assert.equal((await read()).time,time);
  await shot('residual');
  await page.evaluate(()=>window.__mudkipTest.pause(false));await page.waitForTimeout(2100);
  assert(!(await read()).active);
  pass('Half-speed playback, post-animation water ripples, pause/resume and complete fade-out',natural);

  await page.getByRole('button',{name:'喷水 张嘴发射'}).click();await seek(collisionTime);
  await page.getByRole('button',{name:'进食 低头咀嚼'}).click();await page.waitForTimeout(80);
  assert(!(await read()).active);
  pass('Interrupting a shot cancels its detached water and residual effects');

  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'喷水 张嘴发射'}).click();await seek(collisionTime);await gardenAction(page,'重置视角');await page.waitForTimeout(150);
  const fx=await read();
  const point=await page.evaluate((p)=>window.__mudkipTest.project(...p),fx.impactPoint);
  const controls=await page.locator('.controls').boundingBox();
  assert(point.x>16&&point.x<374&&point.y>80&&point.y<controls.y-8,'the impact must remain visible above mobile controls');
  await shot('mobile');pass('Mobile framing keeps the complete stream and impact above the controls',point);

  await page.selectOption('#scene-view','garden');
  await page.evaluate(()=>window.__mudkipTest.play('WaterShoot',true));
  const gardenJet=await seek(jetTime);
  const garden=await seek(gardenJet.firstImpact+.057);
  assert(garden.crown&&garden.splashLobes===3&&garden.impactNormal.every(Number.isFinite));
  await shot('garden');pass('The same effect hits the actual exported garden terrain',garden.impactPoint);
  assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);
  pass('No browser errors, warnings or failed requests');
  await fs.writeFile(new URL('../../docs/water-gun-v05-tests.json',import.meta.url),JSON.stringify({browser:await browser.version(),timestamp:new Date().toISOString(),checks,errors,warnings},null,2));
}finally{await browser.close();}
