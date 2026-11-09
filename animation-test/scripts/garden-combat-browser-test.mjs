import {gardenAction} from './garden-ui-helpers.mjs';
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {solveWaterAim,WATER_SPEED,WATER_GRAVITY} from '../src/water-aim.js';

const checks=[],errors=[],warnings=[];
const pass=(name,details)=>{checks.push({name,passed:true,details});console.log('PASS',name,JSON.stringify(details??{}));};
for(const point of [new THREE.Vector3(-1.7,.56,-1.5),new THREE.Vector3(0,.66,-2.54),new THREE.Vector3(1.63,.61,-1.75),new THREE.Vector3(.5,0,1.5)]){
  const origin=new THREE.Vector3(0,.4,.8),solution=solveWaterAim(origin,point);
  assert(solution.reachable);const landed=origin.clone().addScaledVector(solution.direction,WATER_SPEED*solution.time);landed.y-=.5*WATER_GRAVITY*solution.time**2;
  assert(landed.distanceTo(point)<1e-8);
}
assert(!solveWaterAim(new THREE.Vector3(),new THREE.Vector3(0,0,10)).reachable);
assert(!solveWaterAim(new THREE.Vector3(),new THREE.Vector3(0,10,1)).reachable);
pass('Low-arc aiming reaches targets with the exact visible jet speed and gravity; impossible shots remain out of range');

const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1,hasTouch:true});
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
page.on('requestfailed',r=>errors.push(r.url()+': '+r.failure()?.errorText));
const read=()=>page.evaluate(()=>({combat:window.__mudkipTest.combat(),state:window.__mudkipTest.snapshot(),fx:window.__mudkipTest.resources().waterEffect}));
const simulate=seconds=>page.evaluate(s=>window.__mudkipTest.advanceMovement(s),seconds);
const shot=name=>page.screenshot({path:fileURLToPath(new URL(`../../renders/combat-v09-${name}.png`,import.meta.url)),fullPage:true});
try{
  await page.goto('http://127.0.0.1:5173/resources.html?scene=garden',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__mudkipTest?.diagnostics.ready);
  assert(await page.getByRole('button',{name:'喷水',exact:true}).isEnabled());
  await page.getByRole('button',{name:'瞄准普通靶',exact:true}).click();
  await simulate(.7);
  let data=await read();assert.equal(data.combat.mode,'aim');assert.equal(data.combat.targetId,'normal');assert(data.combat.assessment.reachable&&data.combat.assessment.clear);assert.equal(data.state.target,null);assert.equal(data.combat.feedback.total,0);
  await shot('aim');pass('Clicking a target stops movement, turns the actor and locks a clear reticle without auto-firing');

  await page.keyboard.press('Space');
  await page.evaluate(()=>{window.__mudkipTest.advanceMovement(.2);window.__mudkipTest.pause(true);});
  data=await read();assert.equal(data.state.clip,'WaterShoot');assert(!data.fx.stream);assert.equal(data.combat.feedback.total,0);
  const frozen=JSON.stringify(data);await page.waitForTimeout(120);assert.equal(JSON.stringify(await read()),frozen);
  pass('Space starts closed-mouth anticipation; pause freezes the animation, jet and hit state');
  await page.evaluate(()=>{window.__mudkipTest.pause(false);window.__mudkipTest.advanceMovement(.28);window.__mudkipTest.pause(true);});
  data=await read();assert(data.fx.stream&&data.fx.emitting);assert.equal(data.combat.feedback.total,0);assert(data.fx.time<data.fx.firstImpact);
  await shot('jet');pass('The water travels from the mouth before any hit is awarded',{time:data.fx.time,firstImpact:data.fx.firstImpact});
  await page.evaluate(()=>{window.__mudkipTest.pause(false);window.__mudkipTest.advanceMovement(.25);window.__mudkipTest.pause(true);});
  data=await read();assert.equal(data.combat.feedback.total,1);assert.equal(data.combat.lastContact.targetId,'normal');assert(data.combat.feedback.targets[0].flash);assert(Math.abs(data.combat.feedback.targets[0].tilt)>.002);assert(data.fx.crown);
  await shot('hit');pass('Real surface impact awards one hit, bends the target and shows a water flash, splash and +1',data.combat.lastContact);
  await page.evaluate(()=>{window.__mudkipTest.pause(false);window.__mudkipTest.advanceMovement(2);window.__mudkipTest.pause(true);});
  data=await read();assert.equal(data.combat.feedback.total,1);assert.equal(data.state.clip,'Idle');assert(!data.fx.active);assert(data.combat.feedback.targets.every(t=>!t.flash&&t.tilt===0));
  pass('A full stream scores once, finishes in Idle and leaves no persistent hit effect');

  const types=await page.evaluate(()=>{
    const t=window.__mudkipTest;t.pause(false);const result=[];
    for(const id of ['moving','heavy']){t.resetPosition();t.aimTarget(id);t.advanceMovement(.7);t.fire();const duplicates=[t.fire(),t.fire(),t.fire()];t.advanceMovement(.88);result.push({id,duplicates,combat:t.combat()});t.advanceMovement(1);}
    return result;
  });
  for(const result of types){assert(result.duplicates.every(x=>x===false));assert.equal(result.combat.lastContact.targetId,result.id);}
  assert.equal((await read()).combat.feedback.total,3);
  pass('All three target models receive hits, and repeated fire input cannot stack a shot',types.map(t=>({id:t.id,total:t.combat.feedback.total})));

  const interrupt=await page.evaluate(()=>{const t=window.__mudkipTest;t.resetPosition();t.aimTarget('normal');t.advanceMovement(.7);t.fire();t.advanceMovement(.4);const before=t.combat().feedback.total;t.moveTo(0,2.4);t.advanceMovement(3);return {before,after:t.combat(),fx:t.resources().waterEffect,state:t.snapshot()};});
  assert.equal(interrupt.after.mode,'move');assert.equal(interrupt.after.feedback.total,interrupt.before);assert(!interrupt.fx.active);assert.equal(interrupt.state.clip,'Idle');
  pass('Returning to movement interrupts the shot and prevents a delayed ghost hit');

  const misses=await page.evaluate(()=>{
    const t=window.__mudkipTest;t.resetPosition();t.aimAt(0,.02,2.5);t.advanceMovement(.7);t.fire();t.advanceMovement(1.6);const ground=t.combat();
    t.resetPosition();t.moveTo(3.1,-4.4);t.advanceMovement(15);t.aimAt(-1.3,.8,-4.4);t.advanceMovement(.7);t.fire();t.advanceMovement(.9);const wall={combat:t.combat(),fx:t.resources().waterEffect};
    t.advanceMovement(1);t.resetPosition();t.aimAt(0,0,-12);t.advanceMovement(.7);const far=t.combat();t.fire();t.advanceMovement(2);return {ground,wall,far,final:t.combat()};
  });
  assert.equal(misses.ground.lastContact.targetId,null);assert.equal(misses.wall.combat.lastContact.targetId,null);assert(misses.wall.fx.impactNormal[1]<.6,'the jet must stop against the cottage wall or roof');assert(!misses.far.assessment.reachable);assert.equal(misses.final.feedback.total,3);
  pass('Grass, cottage obstruction and out-of-range aiming never award phantom target hits',{wall:misses.wall.fx.impactPoint,far:misses.far.assessment});

  await gardenAction(page,'回到起点');
  await page.getByRole('button',{name:'瞄准普通靶',exact:true}).click();await simulate(.7);
  await page.keyboard.press('Escape');assert.equal((await read()).combat.mode,'move');assert(await page.locator('#aim-reticle').isHidden());
  await page.getByRole('button',{name:'瞄准普通靶',exact:true}).click();
  const p=await page.evaluate(()=>window.__mudkipTest.project(1,.02,1.8));await page.mouse.click(p.x,p.y);assert.equal((await read()).combat.targetId,null);assert.notEqual((await read()).state.target,null);
  await gardenAction(page,'回到起点');
  pass('Escape clears a target lock; grass clicks always resume walking without a mode switch');

  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);
  await page.touchscreen.tap(...await page.getByRole('button',{name:'瞄准普通靶',exact:true}).evaluate(el=>{const r=el.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2];}));
  await simulate(.7);assert.equal((await read()).combat.targetId,'normal');
  await page.getByRole('button',{name:'喷水',exact:true}).click();
  await page.evaluate(()=>{window.__mudkipTest.advanceMovement(.75);window.__mudkipTest.pause(true);});
  assert.equal((await read()).combat.feedback.total,4);
  const reticle=await page.locator('#aim-reticle').boundingBox(),panel=await page.locator('#garden-controls').boundingBox();
  assert(reticle.x>10&&reticle.x+reticle.width<380&&reticle.y>95&&reticle.y+reticle.height<panel.y-10);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth));await shot('mobile');
  pass('Touch target selection and the on-screen fire button work above a compact mobile panel',{reticle,panel});

  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>{const t=window.__mudkipTest;t.pause(false);for(const id of ['normal','moving','heavy']){t.resetPosition();t.aimTarget(id);t.advanceMovement(.6);t.fire();t.advanceMovement(2);}});
  await page.waitForTimeout(60);const before=await page.evaluate(()=>window.__mudkipTest.renderStats());
  await page.evaluate(()=>{const t=window.__mudkipTest;for(let i=0;i<15;i++){t.resetPosition();t.aimTarget(['normal','moving','heavy'][i%3]);t.advanceMovement(.6);t.fire();t.advanceMovement(2);}});
  await page.waitForTimeout(60);const after=await page.evaluate(()=>window.__mudkipTest.renderStats());assert.deepEqual(after,before);
  assert.equal(await page.evaluate(()=>window.__mudkipTest.destination().routeLines),0);
  pass('Repeated shots reuse GPU assets and keep the garden free of trajectory and route lines',{before,after});
  await page.getByRole('button',{name:'清空命中',exact:true}).click();assert.equal((await read()).combat.feedback.total,0);
  await gardenAction(page,'返回动作台');assert(await page.locator('#aim-reticle').isHidden());assert.equal((await read()).combat.point,null);
  assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);pass('Score reset and scene changes clear aim safely; no browser errors or warnings');
  await fs.writeFile(new URL('../../docs/garden-combat-v09-tests.json',import.meta.url),JSON.stringify({timestamp:new Date().toISOString(),browser:await browser.version(),checks,errors,warnings},null,2));
}finally{await browser.close();}
