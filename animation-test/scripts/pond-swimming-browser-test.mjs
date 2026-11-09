import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {gardenAction} from './garden-ui-helpers.mjs';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1400,height:1000},hasTouch:true});
const errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const read=()=>page.evaluate(()=>({state:__mudkipTest.snapshot(),swim:__mudkipTest.swimming(),pond:__mudkipTest.resources().pond}));
const advance=s=>page.evaluate(s=>__mudkipTest.advanceMovement(s),s);
const pass=name=>{checks.push({name,passed:true});console.log('PASS',name);};
const reset=()=>page.evaluate(()=>{__mudkipTest.resetPosition();__mudkipTest.play('Idle',true);__mudkipTest.pause(false);});
try{
  await page.goto('http://127.0.0.1:5173/resources.html?scene=garden',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__mudkipTest?.diagnostics.ready);
  const initial=await read();assert.equal(initial.pond.clearedStones,2);assert.equal(initial.pond.extraRenderTargets,3);
  const propagation=await page.evaluate(()=>{
    const t=__mudkipTest;t.disturbPond(3.53,.316,1);const local=t.waves();
    t.advanceMovement(.3);const spread=t.waves();t.advanceMovement(5);const settled=t.waves();
    return {local,spread,settled};
  });
  assert(propagation.local.peak<.003);assert(propagation.spread.active>propagation.local.active*3);
  assert(propagation.spread.energy<propagation.local.energy&&propagation.settled.energy<propagation.local.energy*.01);
  assert(propagation.settled.finite);await reset();
  pass('A small local disturbance propagates across the actual heightfield and decays to calm water');
  const center=await page.evaluate(()=>__mudkipTest.project(3.53,-.039,.316));await page.mouse.click(center.x,center.y);
  assert.equal((await read()).swim.phase,'approaching');
  const enter=await page.evaluate(()=>{
    const t=__mudkipTest;let count=0;while(t.swimming().phase==='approaching'&&count++<160)t.advanceMovement(.025);
    return {s:t.snapshot(),swim:t.swimming()};
  });
  assert.equal(enter.swim.phase,'entering');assert.equal(enter.s.target,null);
  assert(Math.hypot(enter.s.position[0]-enter.swim.entry.land[0],enter.s.position[2]-enter.swim.entry.land[2])<.04);
  await advance(.52);let data=await read();assert(data.pond.cartoonSplash.active>0);assert.equal(data.pond.cartoonSplash.frameCount,16);assert.equal(data.pond.cartoonSplash.mode,'transparent-flipbook');
  const entrySplashCount=data.pond.cartoonSplash.total;
  await page.screenshot({path:'../renders/pond-v13-entry.png'});
  pass('Actual pond click walks to the cleared bank, then enters with a pooled cartoon splash animation');

  await advance(3);data=await read();assert.equal(data.swim.phase,'swimming');assert.equal(data.state.clip,'SwimIdle');
  assert(Math.abs(data.state.position[1]-data.swim.waterY)<.009);assert.equal(data.state.target,null);
  assert(data.pond.foam<.01&&data.pond.cartoonSplash.active===0,'cartoon splashes must finish after the swimmer stops');
  pass('Arrival uses a buoyant SwimIdle loop instead of walking or standing on the pool');
  await page.evaluate(()=>__mudkipTest.moveTo(3.53,1.10));await advance(.8);data=await read();assert.equal(data.state.clip,'Swim');assert(data.swim.speed>.1);
  assert.equal(data.pond.cartoonSplash.active,0,'swimming never plays the upright entry splash');
  assert.equal(data.pond.cartoonSplash.total,entrySplashCount,'paddle strokes cannot spawn any splash animation');
  assert.equal(data.pond.cartoonSplash.poolSize,2);assert(data.pond.ripples>=1&&data.pond.ripples<=3,'swimming leaves only a few spreading surface ripples');
  const waves=await page.evaluate(()=>__mudkipTest.waves());assert(waves.finite&&waves.active>500&&waves.peak>.0001&&waves.peak<.03);
  await page.evaluate(()=>{__mudkipTest.viewPond();__mudkipTest.pause(true);});
  await page.screenshot({path:'../renders/pond-v13-close-swimming.png'});
  const frozen=await read();await advance(3);assert.deepEqual(await read(),frozen);
  await page.evaluate(()=>__mudkipTest.pause(false));await advance(2);
  const safe=await read(),[x,,z]=safe.state.position,[cx,cz]=safe.pond.center,[rx,rz]=safe.pond.radii;
  assert(((x-cx)/(rx-.42))**2+((z-cz)/(rz-.42))**2<=1.0001);
  pass('Swimming retargets inside a body-sized safe ellipse; pause freezes buoyancy, stroke and water FX');

  await page.getByRole('button',{name:'喷水',exact:true}).click();await advance(3);data=await read();
  assert.equal(data.state.clip,'SwimIdle');assert.equal(data.swim.phase,'swimming');
  assert.equal(data.pond.cartoonSplash.total,entrySplashCount);
  pass('Water skill can fire afloat and blends back into SwimIdle');

  await page.evaluate(()=>__mudkipTest.moveTo(0,1.3));assert.equal((await read()).swim.phase,'exiting');
  const exitContact=await page.evaluate(()=>{
    const t=__mudkipTest;let frames=0;while(t.resources().pond.cartoonSplash.total<2&&frames++<80)t.advanceMovement(.025);
    t.pause(true);return {swim:t.swimming(),fx:t.resources().pond.cartoonSplash};
  });
  assert.equal(exitContact.swim.phase,'exiting');assert(exitContact.fx.active>0);assert.equal(exitContact.fx.counts.exit,1);
  await page.screenshot({path:'../renders/pond-v14.2-exit-splash.png'});await page.evaluate(()=>__mudkipTest.pause(false));
  await advance(6);data=await read();assert.equal(data.swim.phase,'land');assert.equal(data.state.clip,'Idle');
  assert(Math.hypot(data.state.position[0],data.state.position[2]-1.3)<.01);
  assert.equal(data.pond.cartoonSplash.total,entrySplashCount+1,'climbing out triggers exactly one exit splash');
  assert.equal(data.pond.cartoonSplash.counts.entry,1);assert.equal(data.pond.cartoonSplash.counts.exit,1);
  pass('A grass destination climbs out through the bank and resumes normal navigation');

  await reset();await page.evaluate(()=>__mudkipTest.moveTo(3.53,.316));await advance(6);
  await page.evaluate(()=>__mudkipTest.moveTo(0,1.3));await advance(.2);await page.evaluate(()=>__mudkipTest.moveTo(3.53,.8));await advance(7);
  assert.equal((await read()).swim.phase,'swimming');
  pass('Tapping water again during exit safely queues a return without teleporting');
  await gardenAction(page,'重置视角');
  await page.getByRole('button',{name:'去果篮吃果子',exact:true}).click();await advance(15);
  assert.equal((await read()).swim.phase,'land');assert.equal(await page.evaluate(()=>__mudkipTest.basket().mealsEaten),1);
  pass('Basket interaction exits the pond first and completes a full meal on land');

  await reset();await page.evaluate(()=>__mudkipTest.moveTo(3.53,.316));await advance(6);
  await gardenAction(page,'返回动作台');data=await read();assert.equal(data.swim.phase,'land');assert.equal(data.pond.cartoonSplash.active,0);
  await page.getByRole('button',{name:'游泳 划水摆尾',exact:true}).click();assert.equal((await read()).state.clip,'Swim');
  await page.getByRole('button',{name:'去庭院散步 →',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  const mobile=await page.evaluate(()=>__mudkipTest.project(3.53,-.039,.316));await page.touchscreen.tap(mobile.x,mobile.y);await advance(6);
  assert.equal((await read()).swim.phase,'swimming');
  await page.evaluate(()=>__mudkipTest.pause(true));await page.screenshot({path:'../renders/pond-v13-mobile.png'});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth));
  pass('Stage exposes both portable swim clips; scene cleanup and phone touch entry work');
  const phone=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true});
  phone.on('pageerror',e=>errors.push(e.message));
  await phone.goto('http://127.0.0.1:5173/resources.html?scene=garden',{waitUntil:'networkidle'});
  await phone.waitForFunction(()=>window.__mudkipTest?.diagnostics.ready);
  assert.equal(await phone.evaluate(()=>__mudkipTest.resources().pond.simulation.size),64);
  const phonePoint=await phone.evaluate(()=>__mudkipTest.project(3.53,-.039,.316));await phone.touchscreen.tap(phonePoint.x,phonePoint.y);
  await phone.evaluate(()=>{__mudkipTest.advanceMovement(6);__mudkipTest.pause(true);});
  assert.equal(await phone.evaluate(()=>__mudkipTest.swimming().phase),'swimming');
  assert(await phone.evaluate(()=>__mudkipTest.waves().peak<.012));
  await phone.screenshot({path:'../renders/pond-v13-mobile.png'});await phone.close();
  pass('A fresh phone viewport selects the smaller 64-square simulation and supports native touch entry');
  assert.deepEqual(errors,[]);
  await fs.writeFile('../docs/pond-swimming-v14.2-tests.json',JSON.stringify({timestamp:new Date().toISOString(),browser:await browser.version(),checks,errors},null,2));
}finally{await browser.close();}
