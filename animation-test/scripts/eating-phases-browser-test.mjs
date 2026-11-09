import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
const sample=async time=>{const r=await page.evaluate(time=>{const t=window.__mudkipTest;t.sample('Eat',time);t.advanceMovement(0);return {pose:t.poseState(),fx:t.resources().eating,food:t.foodContact()};},time);await page.waitForTimeout(35);return r;};
const angle=(a,b)=>2*Math.acos(Math.min(1,Math.abs(a.reduce((s,v,i)=>s+v*b[i],0))));
try{
  await page.goto('http://127.0.0.1:5173/resources.html',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__mudkipTest?.diagnostics.ready);
  const closed=await sample(0),bite=await sample(.55);assert(angle(closed.pose.jaw,bite.pose.jaw)>.29);assert(bite.food.visible&&bite.food.separation>=.00399&&bite.food.scale===1);
  await page.screenshot({path:'../renders/eat-v11-bite.png'});
  const bitten=await sample(.73);assert(!bitten.food.visible&&bitten.fx.crumbs===3);assert(angle(closed.pose.jaw,bitten.pose.jaw)<.003);
  const chews=[];for(const time of [.9,1.16,1.48]){const r=await sample(time);chews.push(angle(closed.pose.jaw,r.pose.jaw));assert.equal(r.fx.phase,'chew');assert(!r.food.visible);}
  assert(chews[0]>chews[1]&&chews[1]>chews[2]&&chews[2]>.055);
  await page.screenshot({path:'../renders/eat-v11-chew.png'});
  const swallow=await sample(1.83);assert.equal(swallow.fx.phase,'swallow');assert(angle(closed.pose.jaw,swallow.pose.jaw)<.003);assert(angle(closed.pose.head,swallow.pose.head)>.04);
  await page.screenshot({path:'../renders/eat-v11-swallow.png'});
  const happy=await sample(2.2);assert.equal(happy.fx.phase,'satisfied');assert.equal(happy.fx.hearts,2);assert(angle(closed.pose.jaw,happy.pose.jaw)<.003);
  await page.screenshot({path:'../renders/eat-v11-satisfied.png'});
  const end=await sample(2.59);assert.equal(end.fx.hearts,0);assert(angle(closed.pose.head,end.pose.head)<.003);
  checks.push({passed:true,name:'Bite closes, fruit disappears at contact, three decreasing chews, closed-mouth swallow and satisfied hearts',chews});
  const frozen=await sample(2.2);await page.waitForTimeout(100);assert.deepEqual(await page.evaluate(()=>window.__mudkipTest.resources().eating),frozen.fx);
  await sample(.5);assert.equal((await page.evaluate(()=>window.__mudkipTest.resources().eating)).hearts,0);
  await sample(.73);assert.equal((await page.evaluate(()=>window.__mudkipTest.resources().eating)).crumbs,3);
  await sample(2.2);const before=await page.evaluate(()=>window.__mudkipTest.renderStats());
  for(let i=0;i<8;i++){await sample(.73);await sample(2.2);}
  const after=await page.evaluate(()=>window.__mudkipTest.renderStats());assert.deepEqual(after,before);
  await page.evaluate(()=>window.__mudkipTest.play('Idle',true));await page.waitForTimeout(60);assert.deepEqual(await page.evaluate(()=>window.__mudkipTest.resources().eating),{phase:null,crumbs:0,hearts:0});
  checks.push({passed:true,name:'Pause, reverse seeking, interruption and pooled effects stay correct',before,after});
  await page.setViewportSize({width:390,height:844});await sample(2.2);await page.screenshot({path:'../renders/eat-v11-mobile.png'});
  assert.deepEqual(errors,[]);await fs.writeFile(new URL('../../docs/eating-phases-tests.json',import.meta.url),JSON.stringify({checks,errors},null,2));console.log('PASS',JSON.stringify(checks));
}finally{await browser.close();}
