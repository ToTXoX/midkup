import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {gardenAction} from './garden-ui-helpers.mjs';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
const checks=[],errors=[];
async function rotate(page,from={x:900,y:330},to={x:740,y:370}){
  const before=await page.evaluate(()=>window.__mudkipTest.camera().position);
  await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:10});await page.mouse.up();
  await page.waitForTimeout(100);
  const after=await page.evaluate(()=>window.__mudkipTest.camera());
  const change=Math.hypot(...after.position.map((v,i)=>v-before[i]));
  assert(after.enabled&&change>.05,'Canvas dragging must rotate the camera');
  assert(await page.evaluate(()=>getSelection().isCollapsed),'Rotation must not select the page');
  return change;
}
try{
  for(const entry of ['','resources.html?clip=Run','resources.html?scene=garden']){
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:5173/'+entry,{waitUntil:'networkidle'});
    await page.waitForFunction(()=>window.__mudkipTest?.diagnostics.ready);
    await page.locator('#scene canvas').focus();await page.keyboard.press('Control+a');
    checks.push({name:'Desktop rotation after Select All',entry:entry||'index.html',change:await rotate(page)});
    await page.close();
  }
  const page=await browser.newPage({viewport:{width:1280,height:900},hasTouch:true});
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    // Emulate a webview dropping a release and its capture-loss notification.
    for(const type of ['pointerup','lostpointercapture'])window.addEventListener(type,event=>{
      if(!window.__dropSkillRelease||event.target.id!=='garden-fire')return;
      event.stopImmediatePropagation();
      if(type==='lostpointercapture')window.__dropSkillRelease=false;
    },true);
  });
  await page.goto('http://127.0.0.1:5173/resources.html?scene=garden',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__mudkipTest?.diagnostics.ready);
  async function holdSkill(){
    const rect=await page.locator('#garden-fire').boundingBox();
    await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();
    const state=await page.evaluate(()=>({skill:window.__mudkipTest.skill(),camera:window.__mudkipTest.camera(),combat:window.__mudkipTest.combat().phase}));
    assert(state.skill.active&&!state.camera.enabled,JSON.stringify(state));
  }
  await holdSkill();
  await page.evaluate(()=>window.__dropSkillRelease=true);
  await page.mouse.up();
  assert(await page.evaluate(()=>window.__mudkipTest.skill().active),'The dropped-release fixture must retain the old gesture');
  const shots=await page.evaluate(()=>window.__mudkipTest.combat().shot);
  await page.mouse.move(900,330);
  assert(await page.evaluate(()=>!window.__mudkipTest.skill().active&&window.__mudkipTest.camera().enabled));
  assert.equal(await page.evaluate(()=>window.__mudkipTest.combat().shot),shots,'Recovery must not fire a ghost shot');
  checks.push({name:'A missed release recovers on mouse hover, without a shot',change:await rotate(page)});

  await holdSkill();await page.evaluate(()=>dispatchEvent(new Event('blur')));await page.mouse.up();
  checks.push({name:'Rotation recovers after window blur',change:await rotate(page)});
  await holdSkill();await page.keyboard.press('Escape');await page.mouse.up();
  checks.push({name:'Rotation recovers after cancelling aim',change:await rotate(page)});
  await holdSkill();await page.setViewportSize({width:1200,height:860});
  await page.waitForFunction(()=>!window.__mudkipTest.skill().active);await page.mouse.up();
  checks.push({name:'Resizing cancels aim and restores rotation',change:await rotate(page)});
  await holdSkill();await page.locator('#garden-back').evaluate(el=>el.click());await page.mouse.up();
  checks.push({name:'Returning to the stage clears the camera lock',change:await rotate(page)});

  await page.setViewportSize({width:390,height:844});await page.locator('#reset-view').click();
  const session=await page.context().newCDPSession(page);
  const before=await page.evaluate(()=>window.__mudkipTest.camera().position);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y:235,id:2}]});
  for(let i=1;i<=8;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:180+i*10,y:235+i*3,id:2}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(100);
  const after=await page.evaluate(()=>window.__mudkipTest.camera().position);
  assert(Math.hypot(...after.map((v,i)=>v-before[i]))>.05,'Native touch must rotate the model');
  assert(await page.evaluate(()=>getSelection().isCollapsed));
  checks.push({name:'Native phone touch rotates the stage without selecting text'});
  await page.selectOption('#scene-view','garden');
  await gardenAction(page,'回到起点');
  const gardenBefore=await page.evaluate(()=>window.__mudkipTest.camera().position);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y:300,id:3}]});
  for(let i=1;i<=8;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:180+i*10,y:300+i*3,id:3}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(100);
  const gardenAfter=await page.evaluate(()=>window.__mudkipTest.camera().position);
  assert(Math.hypot(...gardenAfter.map((v,i)=>v-gardenBefore[i]))>.05);
  checks.push({name:'Native phone touch also rotates the garden'});
  assert.deepEqual(errors,[]);
  await fs.writeFile(new URL('../../docs/camera-input-tests.json',import.meta.url),JSON.stringify({passed:true,checks,errors},null,2));
  console.log(JSON.stringify({checks,errors},null,2));
}finally{await browser.close();}
