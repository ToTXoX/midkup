import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto('http://127.0.0.1:5173/resources.html',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__mudkipTest?.diagnostics.ready);
  for(const garden of [false,true]){
    if(garden)await page.getByRole('button',{name:'去庭院散步 →',exact:true}).click();
    for(const turned of [false,true]){
      const result=await page.evaluate(async({garden,turned})=>{
        const t=window.__mudkipTest;t.resetPosition();
        const metadata=await(await fetch('/assets/game/characters/mudkip/animations.json')).json();
        const attach=metadata.clips.find(c=>c.name==='Eat').events.find(e=>e.event==='food_attach').time;
        if(turned){t.moveTo(garden?1.3:-.6,garden?2.2:-.3);t.advanceMovement(6);}
        t.play('Eat',true);let minimum=Infinity,nearMouthMaximum=0,visibleFrames=0;
        for(let i=0;i<=108;i++){
          t.seek(i/120);t.advanceMovement(0);const c=t.foodContact();
          if(c.visible){minimum=Math.min(minimum,c.separation);visibleFrames++;if(i/120>=attach)nearMouthMaximum=Math.max(nearMouthMaximum,c.separation);}
        }
        t.seek(.9);t.advanceMovement(0);const consumed=!t.foodContact().visible;
        t.seek(.45);t.advanceMovement(0);const replay=t.foodContact();
        t.play('Idle',true);t.advanceMovement(0);const interrupted=!t.foodContact().visible;
        return {minimum,nearMouthMaximum,visibleFrames,consumed,replay,interrupted};
      },{garden,turned});
      assert(result.minimum>=.00399,'all fruit vertices must remain in front of every skinned character vertex along the contact normal');
      assert(result.nearMouthMaximum<.012,'the fruit should touch the mouth area, rather than hovering far away');
      assert(result.consumed&&result.interrupted&&result.replay.visible&&result.replay.separation>=.00399);
      checks.push({garden,turned,passed:true,...result});console.log('PASS real skinned mesh / fruit separation',JSON.stringify({garden,turned,...result}));
    }
  }
  assert.deepEqual(errors,[]);await fs.writeFile(new URL('../../docs/food-contact-tests.json',import.meta.url),JSON.stringify({checks,errors},null,2));
}finally{await browser.close();}
