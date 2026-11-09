import {gardenAction} from './garden-ui-helpers.mjs';
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
const errors=[],warnings=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
const pass=(name,details)=>{checks.push({name,passed:true,details});console.log('PASS',name,JSON.stringify(details));};
try{
  await page.goto('http://127.0.0.1:5173/resources.html?scene=garden',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__mudkipTest?.diagnostics.ready);
  const metadata=await page.evaluate(async()=>await(await fetch('/assets/game/characters/mudkip/animations.json')).json());
  assert(metadata.locomotion.Walk.speed>.6&&metadata.locomotion.Run.speed>1.5);
  const trips={};
  for(const [name,label] of [['Walk','轻快走'],['Run','小跑']]){
    await gardenAction(page,'回到起点');
    const toggle=page.getByRole('switch',{name:'小跑模式',exact:true});
    if((await toggle.getAttribute('aria-checked'))!==String(name==='Run'))await toggle.click();
    trips[name]=await page.evaluate(()=>{
      const api=window.__mudkipTest;api.moveTo(0,3);
      let time=0,peak=0,earlySpeed=0;
      while(api.snapshot().target&&time<8){api.advanceMovement(.025);time+=.025;const speed=api.snapshot().speed;peak=Math.max(peak,speed);if(time<.06)earlySpeed=speed;}
      const final=api.snapshot();api.advanceMovement(.35);
      return {time,peak,earlySpeed,final,settledLean:api.snapshot().visualLean};
    });
    const trip=trips[name];assert.equal(trip.final.target,null);assert.equal(trip.final.clip,'Idle');
    assert(trip.earlySpeed<trip.peak*.75,'start should accelerate, not jump directly to cruise speed');
    assert(trip.settledLean.every(n=>Math.abs(n)<.003),'the character must settle after stopping');
  }
  assert(trips.Run.time<1.9&&trips.Walk.time<3.5&&trips.Walk.time>trips.Run.time*1.7);
  pass('Brisk walk and springy run have distinct speeds, acceleration and soft stops',trips);
  await gardenAction(page,'回到起点');
  const lean=await page.evaluate(()=>{const api=window.__mudkipTest;api.moveTo(-2,1.4);api.advanceMovement(.125);return api.snapshot();});
  assert(Math.abs(lean.visualLean[1])>.002&&Math.abs(lean.visualLean[1])<.1);
  pass('Turning produces a small, bounded bank rather than a rigid upright swivel',lean.visualLean);
  await gardenAction(page,'回到起点');
  await page.evaluate(()=>window.__mudkipTest.moveTo(2,-4));await page.waitForTimeout(350);
  await gardenAction(page,'暂停');
  const desktop=await page.evaluate(()=>window.__mudkipTest.destination());
  assert(desktop.visible&&desktop.routeLines===0&&desktop.pixelWidth>35&&desktop.pixelWidth<46);
  await page.screenshot({path:fileURLToPath(new URL('../../renders/movement-v08-desktop.png',import.meta.url)),fullPage:true});
  const frozen=desktop.age;await page.waitForTimeout(100);assert.equal((await page.evaluate(()=>window.__mudkipTest.destination())).age,frozen);
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);
  const mobile=await page.evaluate(()=>window.__mudkipTest.destination());
  assert(mobile.pixelWidth>35&&mobile.pixelWidth<46&&Math.abs(mobile.pixelWidth-desktop.pixelWidth)<3);
  await page.screenshot({path:fileURLToPath(new URL('../../renders/movement-v08-mobile.png',import.meta.url)),fullPage:true});
  pass('High-contrast ring stays about 40 CSS pixels wide on desktop and mobile, with no path line',{desktop,mobile});
  await gardenAction(page,'继续');
  await page.evaluate(()=>window.__mudkipTest.advanceMovement(10));
  await page.waitForTimeout(350);assert(!(await page.evaluate(()=>window.__mudkipTest.destination())).visible);
  pass('Arrival closes and fades the destination ring',true);
  await page.evaluate(()=>window.__mudkipTest.moveTo(0,2));await page.waitForTimeout(100);
  const before=await page.evaluate(()=>window.__mudkipTest.renderStats());
  for(let i=0;i<18;i++){await page.evaluate(i=>window.__mudkipTest.moveTo(i%2?1:-1,2.4),i);await page.waitForTimeout(18);}
  const after=await page.evaluate(()=>window.__mudkipTest.renderStats());assert.deepEqual(after,before);
  pass('Repeated destinations reuse the marker geometry and materials',{before,after});
  assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);
  await fs.writeFile(new URL('../../docs/movement-v08-feel-tests.json',import.meta.url),JSON.stringify({timestamp:new Date().toISOString(),checks,errors,warnings},null,2));
}finally{await browser.close();}
