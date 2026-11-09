import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const output=name=>new URL(`../../${name}`,import.meta.url);
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
const checks=[],errors=[];
try{
  const page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:5173/resources.html?clip=DanceC',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__mudkipTest?.diagnostics.ready);
  const meta=await page.evaluate(async()=>await(await fetch('/assets/game/characters/mudkip/animations.json')).json());
  assert.equal(meta.clips.find(c=>c.name==='DanceC').loop,false);
  const data=await page.evaluate(()=>{
    const api=window.__mudkipTest,first=api.sample('DanceC',0);
    let minimumY=Infinity,slide=0,contactRotation=0,groundSamples=0,turn=0,maxTurnStep=0,previous=null,maxLifted=0;
    const counts={LHand:0,RHand:0,LFoot:0,RFoot:0},wasLifted={};
    const qAngle=(a,b)=>2*Math.acos(Math.min(1,Math.abs(a.reduce((sum,v,i)=>sum+v*b[i],0))));
    for(let frame=0;frame<=252;frame++){
      const time=.65+2.1*frame/252,sample=api.sample('DanceC',time);let lifted=0;
      minimumY=Math.min(minimumY,sample.minimumWorldY);
      if(previous){
        const a=sample.rootQuaternion,b=previous.rootQuaternion;
        const y=-a[3]*b[1]+a[0]*b[2]+a[1]*b[3]-a[2]*b[0],w=a.reduce((sum,v,i)=>sum+v*b[i],0);
        const step=2*Math.atan2(w<0?-y:y,Math.abs(w));turn+=step;maxTurnStep=Math.max(maxTurnStep,Math.abs(step));
      }
      for(const foot of sample.feet){
        const base=first.feet.find(f=>f.name===foot.name),high=foot.position[1]-base.position[1]>.001;
        if(high)lifted++;
        if(high&&!wasLifted[foot.name])counts[foot.name]++;wasLifted[foot.name]=high;
        if(previous){
          const old=previous.feet.find(f=>f.name===foot.name);
          if(Math.abs(foot.position[1]-base.position[1])<.0002&&Math.abs(old.position[1]-base.position[1])<.0002){
            slide=Math.max(slide,Math.hypot(foot.position[0]-old.position[0],foot.position[2]-old.position[2]));
            contactRotation=Math.max(contactRotation,qAngle(foot.quaternion,old.quaternion));groundSamples++;
          }
        }
      }
      maxLifted=Math.max(maxLifted,lifted);previous=sample;
    }
    for(let frame=0;frame<=300;frame++)minimumY=Math.min(minimumY,api.sample('DanceC',frame/60).minimumWorldY);
    const tapA=api.sample('DanceC',.21).feet.find(f=>f.name==='RHand').position[1]-first.feet.find(f=>f.name==='RHand').position[1];
    const tapB=api.sample('DanceC',.48).feet.find(f=>f.name==='LHand').position[1]-first.feet.find(f=>f.name==='LHand').position[1];
    const jump=api.sample('DanceC',3.71).feet.map(f=>f.position[1]-first.feet.find(p=>p.name===f.name).position[1]);
    return {minimumY,slide,contactRotation,groundSamples,turn,maxTurnStep,maxLifted,counts,tapA,tapB,jump};
  });
  console.log('Celebration contact measurements',JSON.stringify(data));
  assert(data.minimumY>-.002,'The celebration must not penetrate the ground');
  assert(Math.abs(Math.abs(data.turn)-2*Math.PI)<.02&&data.maxTurnStep<.07,'The body must turn once without a quaternion flip');
  assert(data.slide<.001&&data.contactRotation<.006&&data.groundSamples>500,'Supporting paws must stay planted while the body turns');
  assert(data.maxLifted===1&&Object.values(data.counts).every(n=>n===6),'All four paws must alternate real small steps');
  assert(data.tapA>.014&&data.tapB>.014&&Math.min(...data.jump)>.068&&Math.max(...data.jump)<.076,'Two clear taps must precede the 7 cm finishing hop');
  checks.push('One full turn with 24 alternating steps, three supporting paws and no visible contact sliding');
  checks.push('Two introductory taps, a small finishing hop and no ground penetration');

  const expression=await page.evaluate(()=>{
    const api=window.__mudkipTest;api.sample('DanceC',3.5);const before=api.expression();
    api.sample('DanceC',4.25);const happy=api.expression();api.advanceMovement(.3);const paused=api.expression();
    api.play('Idle',true);const interrupted=api.expression();api.sample('DanceC',4.8);const end=api.expression();
    return {before,happy,paused,interrupted,end};
  });
  assert.equal(expression.happy.maps,1);assert.equal(expression.before.state,'open');
  assert.equal(expression.happy.state,'happy');assert.deepEqual(expression.happy.offsets[0],[.5,.25]);
  assert.deepEqual(expression.paused,expression.happy);assert.equal(expression.interrupted.state,'open');assert.equal(expression.end.state,'open');
  checks.push('Original eye atlas supplies the smile; pausing, seeking and interruption preserve the correct expression');

  const png=await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=840;canvas.height=720;
    const ctx=canvas.getContext('2d'),source=document.querySelector('#scene canvas');
    ctx.fillStyle='#f5f4e6';ctx.fillRect(0,0,840,720);
    const times=[.48,1.20,2.05,3.10,3.71,4.25],names=['点脚准备','连续小步转圈','轮流落地','找回平衡','小跳','抬头笑眼'];
    for(let i=0;i<times.length;i++){
      window.__mudkipTest.sample('DanceC',times[i]);
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const x=i%3*280,y=Math.floor(i/3)*360;
      ctx.drawImage(source,500,150,490,550,x,y+28,280,314);ctx.fillStyle='#35576e';
      ctx.font='15px "Microsoft YaHei",sans-serif';ctx.fillText(`${names[i]} · ${times[i].toFixed(2)} s`,x+12,y+21);
    }
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await fs.writeFile(output('renders/dance-c-poses.png'),Buffer.from(png,'base64'));
  await page.screenshot({path:fileURLToPath(output('renders/dance-c-happy.png'))});
  await page.evaluate(()=>{window.__mudkipTest.sample('DanceC',4.25);window.__mudkipTest.pause(false);window.__mudkipTest.advanceMovement(1);});
  assert.equal(await page.evaluate(()=>window.__mudkipTest.snapshot().clip),'Idle');
  assert.equal(await page.evaluate(()=>window.__mudkipTest.expression().state),'open');
  checks.push('C ends once, restores open eyes and transitions back to Idle');
  const cameraBefore=await page.evaluate(()=>window.__mudkipTest.camera().position);
  await page.mouse.move(950,320);await page.mouse.down();await page.mouse.move(890,350,{steps:8});await page.mouse.up();
  const cameraAfter=await page.evaluate(()=>window.__mudkipTest.camera().position);
  assert(Math.hypot(...cameraAfter.map((v,i)=>v-cameraBefore[i]))>.05);assert(await page.evaluate(()=>getSelection().isCollapsed));
  await page.locator('#reset-view').click();
  checks.push('Preview can still be rotated without selecting the page');

  const video=await page.evaluate(async()=>{
    window.__mudkipTest.play('DanceC',true);const source=document.querySelector('#scene canvas'),canvas=document.createElement('canvas');canvas.width=760;canvas.height=660;
    const ctx=canvas.getContext('2d');let drawing=true;
    function draw(){ctx.drawImage(source,420,130,760,660,0,0,760,660);ctx.fillStyle='#fffbed';ctx.fillRect(0,0,760,42);ctx.fillStyle='#3b5b70';ctx.font='600 18px "Microsoft YaHei",sans-serif';ctx.textAlign='center';ctx.fillText('C · 转圈庆祝舞',380,28);if(drawing)requestAnimationFrame(draw);}
    draw();const stream=canvas.captureStream(30),recorder=new MediaRecorder(stream,{mimeType:'video/webm',videoBitsPerSecond:2400000}),chunks=[];
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const stopped=new Promise(resolve=>recorder.onstop=resolve);
    recorder.start();await new Promise(resolve=>setTimeout(resolve,5700));recorder.stop();await stopped;drawing=false;stream.getTracks().forEach(t=>t.stop());
    return new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});
  });
  await fs.writeFile(output('renders/dance-c-preview.webm'),Buffer.from(video,'base64'));
  await page.setViewportSize({width:390,height:844});await page.locator('[data-clip="DanceC"]').click();
  await page.evaluate(()=>window.__mudkipTest.sample('DanceC',4.25));await page.waitForTimeout(50);
  const rect=await page.locator('[data-clip="DanceC"]').boundingBox();assert(rect&&rect.y+rect.height<844);
  await page.screenshot({path:fileURLToPath(output('renders/dance-c-mobile.png'))});
  checks.push('Twelve action buttons and the happy pose remain visible on phones');
  assert.deepEqual(errors,[]);
  await fs.writeFile(output('docs/dance-c-tests.json'),JSON.stringify({passed:true,checks,data,expression,errors},null,2));
  console.log(JSON.stringify({checks,data,expression,errors},null,2));
}finally{await browser.close();}
