import {gardenAction} from './garden-ui-helpers.mjs';
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1,hasTouch:true});
const checks=[],errors=[],warnings=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
const pass=(name,details)=>{checks.push({name,passed:true,details});console.log('PASS',name,JSON.stringify(details??{}));};
const read=()=>page.evaluate(()=>({combat:window.__mudkipTest.combat(),skill:window.__mudkipTest.skill(),state:window.__mudkipTest.snapshot(),fx:window.__mudkipTest.resources().waterEffect}));
const simulate=seconds=>page.evaluate(s=>window.__mudkipTest.advanceMovement(s),seconds);
const shot=name=>page.screenshot({path:fileURLToPath(new URL(`../../renders/skill-v10-${name}.png`,import.meta.url)),fullPage:true});
const center=async()=>{const r=await page.locator('#garden-fire').boundingBox();return {x:r.x+r.width/2,y:r.y+r.height/2};};
try{
  await page.goto('http://127.0.0.1:5173/resources.html?scene=garden',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__mudkipTest?.diagnostics.ready);
  assert.equal(await page.locator('[data-garden-mode]').count(),0);assert(await page.getByRole('button',{name:'喷水',exact:true}).isEnabled());assert.equal((await read()).combat.point,null);
  await shot('desktop');
  await page.getByRole('button',{name:'喷水',exact:true}).click();await simulate(.5);
  let data=await read();assert.equal(data.combat.shot,1);assert.equal(data.combat.targetId,null);assert(data.fx.stream);assert.equal(data.state.target,null);
  await simulate(2);assert.equal((await read()).combat.shot,1);
  pass('A single click of the always-available skill casts freely without selecting a target or mode');

  await gardenAction(page,'回到起点');
  const c=await center(),cameraBefore=await page.evaluate(()=>window.__mudkipTest.project(0,0,0));
  await page.mouse.move(c.x,c.y);await page.mouse.down();await page.mouse.move(c.x-62,c.y-50,{steps:8});await page.waitForTimeout(200);
  data=await read();assert(data.skill.active&&data.skill.dragging);assert.equal(data.combat.phase,'idle');assert.equal(data.combat.shot,1);assert.equal(data.state.target,null);assert(data.combat.point[0]<-1);
  assert.deepEqual(await page.evaluate(()=>window.__mudkipTest.project(0,0,0)),cameraBefore);
  await shot('drag');
  await page.mouse.up();await simulate(.9);data=await read();assert.equal(data.combat.shot,2);assert(!data.skill.active);assert.equal(data.combat.targetId,null);assert.equal(data.state.target,null);
  await simulate(2);pass('Dragging the skill shows a free aim point; releasing outside the button casts once and never rotates the camera');

  const beforeCancel=(await read()).combat.shot;
  await page.mouse.move(c.x,c.y);await page.mouse.down();await page.mouse.move(c.x-40,c.y+40,{steps:3});await page.keyboard.press('Escape');await page.mouse.up();await simulate(1);
  data=await read();assert.equal(data.combat.shot,beforeCancel);assert(!data.skill.active);assert.equal(data.combat.point,null);
  pass('Esc cancels an active drag without firing or leaving a captured pointer');

  await page.getByRole('button',{name:'瞄准普通靶',exact:true}).click();await simulate(.6);
  await page.getByRole('button',{name:'喷水',exact:true}).click();await simulate(.85);data=await read();assert.equal(data.combat.lastContact.targetId,'normal');assert.equal(data.combat.feedback.total,1);
  await simulate(2);pass('Optional target lock still works with the same skill key and real impact feedback');
  await gardenAction(page,'暂停');assert(await page.getByRole('button',{name:'喷水',exact:true}).isDisabled());const paused=(await read()).combat.shot;
  await page.locator('#scene canvas').focus();await page.keyboard.press('Space');await simulate(1);assert.equal((await read()).combat.shot,paused);await gardenAction(page,'继续');
  pass('Pause disables both the skill button and keyboard casting');

  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);await gardenAction(page,'回到起点');
  const mobile=await page.locator('#garden-fire').boundingBox(),panel=await page.locator('#garden-controls').boundingBox();assert(mobile.width>=80&&(mobile.y+mobile.height<panel.y-12||mobile.x>=panel.x+panel.width+12)&&mobile.x+mobile.width<390);
  await page.touchscreen.tap(mobile.x+mobile.width/2,mobile.y+mobile.height/2);await simulate(.55);data=await read();assert(data.fx.stream&&data.combat.targetId===null);assert.equal(data.combat.shot,paused+1);await shot('mobile-free');await simulate(2);
  pass('Phone users can tap an 82-pixel skill key to spray freely, with no target or keyboard',{mobile,panel});

  await gardenAction(page,'回到起点');
  const touch=await center(),session=await page.context().newCDPSession(page),beforeTouch=(await read()).combat.shot;
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touch.x,y:touch.y,id:7}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touch.x-65,y:touch.y-45,id:7}]});await page.waitForTimeout(180);
  data=await read();assert(data.skill.active&&data.skill.dragging);assert.equal(data.combat.shot,beforeTouch);assert(data.combat.point[0]<-1);await shot('mobile-aim');
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await simulate(.95);data=await read();assert.equal(data.combat.shot,beforeTouch+1);assert(!data.skill.active);await simulate(2);
  pass('Native touch dragging captures the finger outside the key, previews aim and casts only on release');

  const beforeTouchCancel=(await read()).combat.shot;
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touch.x,y:touch.y,id:8}]});await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touch.x-30,y:touch.y+30,id:8}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await simulate(1);assert.equal((await read()).combat.shot,beforeTouchCancel);assert(!(await read()).skill.active);
  pass('A native touch cancellation restores controls and never fires a ghost shot');

  await page.getByRole('button',{name:'瞄准普通靶',exact:true}).click();await simulate(.6);
  await page.touchscreen.tap(touch.x,touch.y);await simulate(.8);assert.equal((await read()).combat.feedback.total,2);await shot('mobile-hit');await simulate(2);
  const p=await page.evaluate(()=>window.__mudkipTest.project(1.4,0,2));await page.touchscreen.tap(p.x,p.y);assert((await read()).state.target!==null);await simulate(4);assert.equal((await read()).combat.mode,'move');
  pass('On phones, optional lock-and-tap hits a target, and the next ground tap immediately resumes walking');

  await page.setViewportSize({width:1440,height:1000});await gardenAction(page,'回到起点');await page.locator('#garden-fire').focus();const beforeKeys=(await read()).combat.shot;
  await page.keyboard.press('Enter');await simulate(2);assert.equal((await read()).combat.shot,beforeKeys+1);await page.locator('#garden-fire').focus();await page.keyboard.press('Space');await simulate(2);assert.equal((await read()).combat.shot,beforeKeys+2);
  pass('Enter and Space each cast exactly once when the skill key has keyboard focus');
  const ending=await center();await page.mouse.move(ending.x,ending.y);await page.mouse.down();await page.mouse.move(ending.x-30,ending.y-20);
  await page.locator('#garden-back').evaluate(el=>el.click());await page.mouse.up();assert(!(await read()).skill.active);assert(await page.locator('#garden-skill').isHidden());
  assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);pass('Scene changes clear a held skill safely, with no console errors or warnings');
  await fs.writeFile(new URL('../../docs/water-skill-v10-tests.json',import.meta.url),JSON.stringify({timestamp:new Date().toISOString(),checks,errors,warnings},null,2));
}finally{await browser.close();}
