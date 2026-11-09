import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
const read=()=>page.evaluate(()=>window.__mudkipTest.footprints());
const move=(x,z)=>page.evaluate(([x,z])=>window.__mudkipTest.moveTo(x,z),[x,z]);
const tick=time=>page.evaluate(time=>window.__mudkipTest.advanceMovement(time),time);
const reset=()=>page.evaluate(()=>window.__mudkipTest.resetPosition());

try{
  await page.goto('http://127.0.0.1:5173/resources.html?scene=garden',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.body.classList.contains('garden-active')&&window.__mudkipTest?.diagnostics.ready);
  assert.equal((await read()).total,0);
  await page.locator('#garden-gait').click();
  assert((await move(-1.6,1.15)).ok);
  const contact=await page.evaluate(()=>{
    const game=window.__mudkipTest;
    let furthest=0;
    for(let i=0;i<180;i++){
      const before=game.footprints().total;
      game.advanceMovement(.02);
      const prints=game.footprints();
      if(before===prints.total)continue;
      const feet=game.poseState().feet;
      for(const {paw,point} of prints.marks.filter(mark=>mark.age===0)){
        const foot=feet.find(foot=>foot.name===paw).position;
        furthest=Math.max(furthest,Math.hypot(foot[0]-point[0],foot[2]-point[2]));
      }
    }
    return {furthest,clip:game.snapshot().clip,prints:game.footprints()};
  });
  assert.equal(contact.clip,'Idle');
  assert(contact.furthest<.10&&contact.prints.total>8&&contact.prints.marks.length>=2,JSON.stringify(contact));
  assert.deepEqual([...new Set(contact.prints.marks.map(mark=>mark.paw))].sort(),['LFoot','RFoot']);
  assert(contact.prints.marks.every(mark=>mark.kind==='grass'&&mark.opacity<.32));
  await tick(.4);
  const idle=await read();
  assert.equal(idle.total,contact.prints.total,'Idle must not stamp more paw prints');
  await page.evaluate(()=>window.__mudkipTest.pause(true));
  const frozen=await read();
  await tick(3);
  assert.deepEqual(await read(),frozen);
  await page.evaluate(()=>window.__mudkipTest.pause(false));
  await tick(1.7);
  assert.equal((await read()).marks.length,0);
  console.log('PASS walking stamps alternating rear paws, then fades without stamping while idle');

  await reset();
  await page.locator('#garden-gait').click();
  assert((await move(1.55,2.46)).ok);
  await tick(2);
  assert((await move(.33,2.89)).ok);
  await tick(1.4);
  const path=await read();
  const earth=path.marks.filter(mark=>mark.kind==='earth');
  assert(earth.length>=3&&earth.some(mark=>mark.opacity>.40));
  assert.deepEqual([...new Set(path.marks.map(mark=>mark.paw))].sort(),['LFoot','RFoot']);
  assert(path.marks.length<=path.capacity&&path.capacity===16);
  console.log('PASS running leaves a bounded pair of tracks, stronger on dirt');

  await reset();
  assert.equal((await read()).marks.length,0);
  await move(3.53,.316);
  await tick(6);
  assert.equal(await page.evaluate(()=>window.__mudkipTest.swimming().phase),'swimming');
  const inWater=(await read()).total;
  await tick(1);
  assert.equal((await read()).total,inWater);
  await move(0,1.3);
  await tick(2.4);
  const wet=(await read()).marks.filter(mark=>mark.kind==='wet');
  assert(wet.length>=2&&wet.length<=5,JSON.stringify(wet));
  const pond=await page.evaluate(()=>window.__mudkipTest.resources().pond);
  for(const mark of wet){
    const [x,,z]=mark.point;
    assert(((x-pond.center[0])/pond.radii[0])**2+((z-pond.center[1])/pond.radii[1])**2>1);
  }
  await tick(6);
  assert.equal((await read()).marks.length,0);
  assert.deepEqual(errors,[]);
  console.log('PASS no prints in the pond; the first shore steps are wet and fade');
}finally{
  await browser.close();
}
