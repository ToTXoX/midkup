import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {gardenAction} from './garden-ui-helpers.mjs';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
const checks=[],errors=[];
try{
  const page=await browser.newPage({viewport:{width:1280,height:900},hasTouch:true});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:5173/resources.html?scene=garden',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__mudkipTest?.diagnostics.ready);
  const durations=await page.evaluate(()=>Object.fromEntries(window.__mudkipTest.diagnostics.clips.map(c=>[c.name,c.duration])));
  const read=()=>page.evaluate(()=>({dance:window.__mudkipTest.dance(),state:window.__mudkipTest.snapshot(),expression:window.__mudkipTest.expression(),swim:window.__mudkipTest.swimming(),basket:window.__mudkipTest.basket()}));
  const advance=seconds=>page.evaluate(seconds=>{const api=window.__mudkipTest;api.pause(false);api.advanceMovement(seconds);api.pause(true);},seconds);
  const danceButton=page.getByRole('button',{name:'跳舞',exact:true});
  const danceEffects=page.locator('#garden-dance-effects');
  const assertDanceHud=async playing=>{
    assert.equal(await page.locator('#garden-dance').getAttribute('aria-busy'),String(playing));
    assert.equal(await danceEffects.evaluate(element=>element.hidden),!playing);
  };
  async function clickCharacter(touch=false){
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const point=await page.evaluate(()=>window.__mudkipTest.project(...window.__mudkipTest.characterPoint()));
    if(touch)await page.touchscreen.tap(point.x,point.y);else await page.mouse.click(point.x,point.y);
    await page.evaluate(()=>window.__mudkipTest.pause(true));
  }
  const point=await page.evaluate(()=>window.__mudkipTest.project(...window.__mudkipTest.characterPoint()));
  await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+65,point.y,{steps:8});
  await page.waitForTimeout(80);await page.mouse.move(point.x,point.y,{steps:8});await page.mouse.up();
  assert.equal((await read()).state.clip,'Idle');assert.equal((await read()).dance.last,null);
  await gardenAction(page,'重置视角');
  await assertDanceHud(false);
  checks.push('Dragging from the character and back rotates the camera without starting a dance');

  const sequence=[];
  for(let i=0;i<6;i++){
    const position=(await read()).state.position;
    if(i%2){
      await danceButton.press('Space');
      await page.evaluate(()=>window.__mudkipTest.pause(true));
    }else await clickCharacter();
    let current=await read();const name=current.state.clip;
    assert(['DanceA','DanceB','DanceC'].includes(name));sequence.push(name);
    await assertDanceHud(true);
    if(i)assert.notEqual(name,sequence[i-1]);
    assert.deepEqual(current.state.position,position);assert.equal(current.state.target,null);
    await advance(.5);const before=await read();await clickCharacter();current=await read();
    assert.equal(current.state.clip,name);assert.deepEqual(current.dance.counts,before.dance.counts);
    assert(current.state.time>=before.state.time-.01,'Repeated clicks must not restart the current dance');
    if(name==='DanceC'){
      await advance(4.25-current.state.time);assert.equal((await read()).expression.state,'happy');
      await page.screenshot({path:'../renders/garden-dance-happy.png'});
    }
    await advance(durations[name]+.3);current=await read();
    assert.equal(current.state.clip,'Idle');assert.equal(current.expression.state,'open');
    assert.equal(current.dance.completed,i+1);
    await assertDanceHud(false);
  }
  assert.equal(new Set(sequence.slice(0,3)).size,3);assert.equal(new Set(sequence.slice(3)).size,3);
  console.log('PASS random one-shot dance cycles',sequence.join(', '));
  checks.push({name:'Character and button choose from the same dances without repeats; effects clear after each performance',sequence});

  await page.evaluate(()=>{window.__mudkipTest.moveTo(1.4,2);window.__mudkipTest.advanceMovement(.2);window.__mudkipTest.pause(true);});
  assert.notEqual((await read()).state.target,null);await clickCharacter();assert.equal((await read()).state.target,null);
  assert((await read()).dance.playing);await page.evaluate(()=>window.__mudkipTest.moveTo(0,1.3));
  await advance(6);assert.equal((await read()).state.clip,'Idle');assert.equal((await read()).dance.pending,null);
  await assertDanceHud(false);
  checks.push('A character tap stops walking; a new destination interrupts the dance');

  await page.getByRole('button',{name:'去果篮吃果子',exact:true}).click();
  await page.evaluate(()=>{const api=window.__mudkipTest;api.pause(false);let i=0;while(api.snapshot().clip!=='Eat'&&i++<300)api.advanceMovement(.025);api.pause(true);});
  assert.equal((await read()).state.clip,'Eat');const meals=(await read()).basket.mealsEaten;
  await clickCharacter();assert.equal((await read()).dance.pending,'meal');assert.equal((await read()).state.clip,'Eat');
  await advance(2.9);assert((await read()).dance.playing);assert.equal((await read()).basket.mealsEaten,meals+1);
  await advance(6);assert.equal((await read()).state.clip,'Idle');
  checks.push('Tapping during a meal finishes the fruit exactly once, then dances');
  console.log('PASS finish meal before dancing');

  await gardenAction(page,'回到起点');await page.evaluate(()=>window.__mudkipTest.moveTo(3.53,.316));await advance(6);
  assert.equal((await read()).swim.phase,'swimming');await page.evaluate(()=>window.__mudkipTest.viewPond());
  await clickCharacter();assert.equal((await read()).dance.pending,'shore');assert.equal((await read()).swim.phase,'exiting');
  await advance(1.4);assert.equal((await read()).swim.phase,'land');assert((await read()).dance.playing);
  await advance(6);assert.equal((await read()).state.clip,'Idle');
  checks.push('Tapping the swimmer exits at the shore before dancing on land');
  console.log('PASS exit water before dancing');

  await gardenAction(page,'回到起点');await page.evaluate(()=>window.__mudkipTest.moveTo(3.53,.316));await advance(6);
  await page.evaluate(()=>window.__mudkipTest.viewPond());await clickCharacter();
  const counts=(await read()).dance.counts;await page.evaluate(()=>window.__mudkipTest.moveTo(0,1.3));await advance(8);
  assert.deepEqual((await read()).dance.counts,counts);assert.equal((await read()).dance.pending,null);
  checks.push('A new grass command cancels a queued shore dance without a phantom restart');

  await gardenAction(page,'重置视角');await clickCharacter();assert((await read()).dance.playing);
  await page.evaluate(()=>window.__mudkipTest.pause(false));
  await page.getByRole('button',{name:'喷水',exact:true}).click();await advance(2);
  assert(!(await read()).dance.playing);assert.equal((await read()).dance.pending,null);
  await assertDanceHud(false);
  checks.push('The water skill interrupts dancing and clears pending dance requests');

  await gardenAction(page,'返回动作台');await clickCharacter();assert.equal((await read()).state.clip,'PetReaction');await advance(2);
  await page.locator('[data-clip="DanceA"]').click();await advance(9);
  assert.equal((await read()).state.clip,'DanceA');
  await page.locator('[data-clip="DanceB"]').click();await advance(7);assert.equal((await read()).state.clip,'DanceB');
  checks.push('A and B regain looping playback in the animation stage');
  await page.getByRole('button',{name:'去庭院散步 →',exact:true}).click();await page.setViewportSize({width:390,height:844});
  await gardenAction(page,'回到起点');
  await clickCharacter(true);assert((await read()).dance.playing);
  await advance(6);
  await danceButton.tap();assert((await read()).dance.playing);await assertDanceHud(true);
  await page.screenshot({path:'../renders/garden-dance-mobile.png'});
  await gardenAction(page,'返回动作台');assert.equal((await read()).dance.pending,null);
  assert.equal(await danceButton.count(),0);await assertDanceHud(false);
  checks.push('A native phone tap on the button starts one dance; scene changes clear the effects');
  assert.deepEqual(errors,[]);
  await fs.writeFile(new URL('../../docs/garden-dance-tests.json',import.meta.url),JSON.stringify({passed:true,checks,errors},null,2));
  console.log(JSON.stringify({checks,errors},null,2));
}finally{await browser.close();}
