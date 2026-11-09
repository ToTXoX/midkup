import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const output = name => new URL(`../../${name}`, import.meta.url);
const browser = await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
const checks = [], errors = [];
try {
  const page = await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1});
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5173/resources.html?clip=DanceA',{waitUntil:'networkidle'});
  await page.waitForFunction(() => window.__mudkipTest?.diagnostics.ready);
  assert.equal(await page.locator('[data-clip="DanceA"]').getAttribute('aria-pressed'),'true');
  checks.push('Direct preview opens DanceA and selects its button');
  const data = await page.evaluate(() => {
    const api = window.__mudkipTest;
    const first = api.sample('DanceA',0), last = api.sample('DanceA',4-1e-6);
    const times = [.25,.75,1.23,1.73,2.15,2.38,2.64,2.88,3.22,3.51,3.80];
    const samples = times.map(time => ({time,...api.sample('DanceA',time)}));
    const seam = Math.max(...first.positions.map((v,i) => Math.abs(v-last.positions[i])));
    let minimumVertexY = Infinity, maximumFootRotation = 0;
    for(let frame=0;frame<=240;frame++){
      const sample=api.sample('DanceA',frame/60);
      minimumVertexY=Math.min(minimumVertexY,sample.minimumWorldY);
      for(const foot of sample.feet){
        const original=first.feet.find(f=>f.name===foot.name).quaternion;
        maximumFootRotation=Math.max(maximumFootRotation,2*Math.acos(Math.min(1,Math.abs(foot.quaternion.reduce((sum,v,i)=>sum+v*original[i],0)))));
      }
    }
    const planted = samples.filter(s => s.time<2).map(s => Math.max(...s.feet.filter(f => !((s.time===.25&&f.name==='RHand')||(s.time===.75&&f.name==='LHand'))).map(f => {
      const original=first.feet.find(p=>p.name===f.name).position;
      return Math.hypot(...f.position.map((v,i)=>v-original[i]));
    })));
    const airborne = samples.find(s=>s.time===3.51).feet.map(f=>f.position[1]-first.feet.find(p=>p.name===f.name).position[1]);
    return {duration:api.diagnostics.clips.find(c=>c.name==='DanceA').duration,seam,minimumVertexY,maximumFootRotation,initialMinimumY:first.minimumWorldY,minimumSamples:samples.map(s=>[s.time,s.minimumWorldY]),planted,airborne,
      maximumRootSideways:Math.max(...samples.map(s=>Math.abs(s.rootPosition[0])))};
  });
  console.log('Dance contact measurements',JSON.stringify(data));
  assert.equal(data.duration,4);
  assert(data.seam<.0001,'Dance must loop without a seam');
  assert(Math.max(...data.planted)<.0005,'Support paws must stay planted during sway/nods');
  assert(Math.min(...data.airborne)>.078&&Math.max(...data.airborne)<.086,'All paws should clear the ground by about 8 cm during the hop');
  assert(data.maximumRootSideways<.032,'Dance must stay close to its starting point');
  assert(data.maximumFootRotation<.002,'Paws must stay flat instead of twisting');
  assert(data.minimumVertexY>-.002,'Feet must not visibly sink into the stage');
  checks.push('4-second loop, planted flat paws with no ankle twisting, 8 cm hop and small side steps');
  for(const [label,time] of [['sway-left',.25],['sway-right',.75],['nod',1.23],['step',2.38],['crouch',3.22],['hop',3.51],['land',3.80]]) {
    await page.evaluate(time=>{window.__mudkipTest.sample('DanceA',time);window.__mudkipTest.pause(true);},time);
    await page.waitForTimeout(70);
    await page.screenshot({path:output(`renders/dance-a-${label}.png`).pathname.replace(/^\//,'')});
  }
  await page.getByRole('button',{name:'待机 轻轻呼吸'}).click();
  assert.equal(await page.evaluate(()=>window.__mudkipTest.snapshot().clip),'Idle');
  await page.getByRole('button',{name:'跳舞 摇摇踏踏'}).click();
  await page.waitForTimeout(4300);
  assert.equal(await page.evaluate(()=>window.__mudkipTest.snapshot().clip),'DanceA');
  checks.push('Button switches from Idle and continues into another dance loop');
  const base64=await page.evaluate(async()=>{
    const api=window.__mudkipTest;
    api.play('DanceA',true);
    const source=document.querySelector('#scene canvas'),canvas=document.createElement('canvas');
    canvas.width=760;canvas.height=660;
    const ctx=canvas.getContext('2d'); let drawing=true;
    function draw(){
      ctx.drawImage(source,420,130,760,660,0,0,760,660);
      ctx.fillStyle='#fffbed';ctx.fillRect(0,0,760,42);
      ctx.fillStyle='#3b5b70';ctx.font='600 18px "Microsoft YaHei",sans-serif';ctx.textAlign='center';
      ctx.fillText('A · 摇摇踏踏舞',380,28);
      if(drawing)requestAnimationFrame(draw);
    }
    draw();
    const stream=canvas.captureStream(30),recorder=new MediaRecorder(stream,{mimeType:'video/webm',videoBitsPerSecond:2500000}),chunks=[];
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    const stopped=new Promise(resolve=>recorder.onstop=resolve);
    recorder.start();await new Promise(resolve=>setTimeout(resolve,8100));recorder.stop();await stopped;
    drawing=false;stream.getTracks().forEach(t=>t.stop());
    return new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});
  });
  await fs.writeFile(output('renders/dance-a-preview.webm'),Buffer.from(base64,'base64'));
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'跳舞 摇摇踏踏'}).click();
  const bounds=await page.locator('[data-clip="DanceA"]').boundingBox();
  assert(bounds&&bounds.y>=0&&bounds.y+bounds.height<=844,'Mobile dance button must be visible');
  await page.screenshot({path:output('renders/dance-a-mobile.png').pathname.replace(/^\//,'')});
  checks.push('Dance button remains visible on a 390 px mobile viewport');
  assert.deepEqual(errors,[]);
  await fs.writeFile(output('docs/dance-a-tests.json'),JSON.stringify({passed:true,checks,data,errors},null,2));
  console.log(JSON.stringify({checks,data,errors},null,2));
} finally { await browser.close(); }
