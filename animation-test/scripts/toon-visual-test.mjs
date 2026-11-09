import {gardenAction} from './garden-ui-helpers.mjs';
import {chromium} from 'playwright-core';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const label=process.argv[2]??'v06';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
const errors=[],warnings=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
const screenshot=async(name)=>page.screenshot({path:fileURLToPath(new URL(`../../renders/toon-${label}-${name}.png`,import.meta.url)),fullPage:true});
try{
  await page.goto('http://127.0.0.1:5173/resources.html',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__mudkipTest?.diagnostics.ready);
  await page.evaluate(()=>window.__mudkipTest.seek(.2));
  await page.waitForTimeout(120);await screenshot('character');
  for(const [clip,time,name] of [['Run',.15,'run'],['Eat',.55,'eat'],['WaterShoot',.55,'water']]){
    await page.evaluate(({clip,time})=>{window.__mudkipTest.play(clip,true);window.__mudkipTest.seek(time);},{clip,time});
    await page.waitForTimeout(80);await screenshot(name);
  }
  await page.selectOption('#scene-view','garden');await page.waitForTimeout(200);await screenshot('garden');
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);await screenshot('garden-mobile');
  await gardenAction(page,'返回动作台');
  await page.evaluate(()=>window.__mudkipTest.seek(.2));
  await gardenAction(page,'重置视角');await page.waitForTimeout(150);await screenshot('mobile');
  const diagnostics=await page.evaluate(()=>({diagnostics:window.__mudkipTest.diagnostics,stats:window.__mudkipTest.renderStats(),style:window.__mudkipTest.style?.()}));
  assert.deepEqual(errors,[],'no browser or shader compilation errors');
  assert.deepEqual(warnings,[],'no renderer compatibility warnings');
  await fs.writeFile(new URL(`../../docs/toon-${label}-browser-tests.json`,import.meta.url),JSON.stringify({timestamp:new Date().toISOString(),errors,warnings,...diagnostics},null,2));
  console.log('PASS toon rendering, seven loaded clips, garden, water and mobile views',JSON.stringify(diagnostics));
}finally{await browser.close();}
