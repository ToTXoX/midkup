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
  await page.goto('http://127.0.0.1:5173/resources.html?clip=DanceB',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__mudkipTest?.diagnostics.ready);
  assert.equal(await page.locator('[data-clip="DanceB"]').getAttribute('aria-pressed'),'true');
  const data=await page.evaluate(()=>{
    const api=window.__mudkipTest,first=api.sample('DanceB',0),last=api.sample('DanceB',3-1e-6);
    api.sample('DanceB',0);const firstTail=api.tailPose(),firstHead=api.poseState().headWorld;
    const angle=(a,b)=>2*Math.acos(Math.min(1,Math.abs(a.reduce((sum,v,i)=>sum+v*b[i],0))));
    let minimumY=Infinity,frontDrift=0,footRotation=0,rearLift=0,tailAngle=0,rootSideways=0,bothRearLifted=0;
    for(let frame=0;frame<=180;frame++){
      const sample=api.sample('DanceB',frame/60);
      minimumY=Math.min(minimumY,sample.minimumWorldY);rootSideways=Math.max(rootSideways,Math.abs(sample.rootPosition[0]));
      let lifted=0;
      for(const foot of sample.feet){
        const base=first.feet.find(f=>f.name===foot.name);
        footRotation=Math.max(footRotation,angle(foot.quaternion,base.quaternion));
        if(foot.name.endsWith('Hand'))frontDrift=Math.max(frontDrift,Math.hypot(...foot.position.map((v,i)=>v-base.position[i])));
        else{
          const lift=foot.position[1]-base.position[1];rearLift=Math.max(rearLift,lift);
          if(lift>.001)lifted++;
        }
      }
      if(lifted===2)bothRearLifted++;
      tailAngle=Math.max(tailAngle,angle(api.tailPose().find(b=>b.name==='Tail2').quaternion,firstTail.find(b=>b.name==='Tail2').quaternion));
    }
    api.sample('DanceB',1.4);const peekAngle=angle(api.poseState().headWorld,firstHead);
    const holdA=api.sample('DanceB',1.38),holdB=api.sample('DanceB',1.50);
    return {duration:api.diagnostics.clips.find(c=>c.name==='DanceB').duration,
      seam:Math.max(...first.positions.map((v,i)=>Math.abs(v-last.positions[i]))),minimumY,frontDrift,footRotation,rearLift,tailAngle,rootSideways,bothRearLifted,peekAngle,
      holdDelta:Math.max(...holdA.positions.map((v,i)=>Math.abs(v-holdB.positions[i])))};
  });
  assert.equal(data.duration,3);assert(data.seam<.0001,'B must loop cleanly');
  assert(data.minimumY>-.002,'B must not penetrate the stage');
  assert(data.frontDrift<.0005,'Both front paws must stay planted');
  assert(data.footRotation<.002,'Paws must stay flat');
  assert(data.rearLift>.009&&data.rearLift<.012&&data.bothRearLifted===0,'Rear paws should alternate tiny steps');
  assert(data.tailAngle>.45&&data.tailAngle<.7,'The tail should give a clear, bounded wag');
  assert(data.rootSideways<.015,'B must stay close to its spot');
  assert(data.peekAngle>.14&&data.holdDelta<.0001,'The curious head tilt must include a real pause');
  checks.push('3-second seamless loop; fixed front paws; flat feet and alternating 10 mm rear steps');
  checks.push('Visible tail follow-through and a held head tilt without ground penetration');

  const sheet=await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=840;canvas.height=720;
    const ctx=canvas.getContext('2d'),source=document.querySelector('#scene canvas');
    ctx.fillStyle='#f5f4e6';ctx.fillRect(0,0,840,720);
    const times=[.38,.88,1.40,1.86,2.36,2.85],labels=['向左轻扭','向右轻扭','歪头停顿','再扭一下','尾鳍跟随','收尾回位'];
    for(let frame=0;frame<times.length;frame++){
      window.__mudkipTest.sample('DanceB',times[frame]);window.__mudkipTest.pause(true);
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const x=frame%3*280,y=Math.floor(frame/3)*360;
      ctx.drawImage(source,510,160,480,540,x,y+28,280,315);
      ctx.fillStyle='#35576e';ctx.font='15px "Microsoft YaHei",sans-serif';ctx.fillText(`${labels[frame]} · ${times[frame].toFixed(2)} s`,x+12,y+21);
    }
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await fs.writeFile(output('renders/dance-b-poses.png'),Buffer.from(sheet,'base64'));
  await page.locator('[data-clip="DanceA"]').click();await page.locator('[data-clip="DanceB"]').click();
  assert.equal(await page.locator('[data-clip][aria-pressed="true"]').count(),1);
  const before=await page.evaluate(()=>window.__mudkipTest.camera().position);
  await page.mouse.move(950,320);await page.mouse.down();await page.mouse.move(890,350,{steps:8});await page.mouse.up();
  const after=await page.evaluate(()=>window.__mudkipTest.camera().position);
  assert(Math.hypot(...after.map((v,i)=>v-before[i]))>.05,'B must remain freely rotatable');
  assert(await page.evaluate(()=>getSelection().isCollapsed));
  await page.locator('#reset-view').click();
  await page.evaluate(()=>window.__mudkipTest.sample('DanceB',1.4));
  await page.waitForTimeout(50);await page.screenshot({path:fileURLToPath(output('renders/dance-b-stage.png'))});
  checks.push('A/B switches keep one selected action; mouse orbit and selection protection both work');

  const video=await page.evaluate(async()=>{
    window.__mudkipTest.play('DanceB',true);
    const source=document.querySelector('#scene canvas'),canvas=document.createElement('canvas');canvas.width=760;canvas.height=660;
    const ctx=canvas.getContext('2d');let drawing=true;
    function draw(){
      ctx.drawImage(source,420,130,760,660,0,0,760,660);ctx.fillStyle='#fffbed';ctx.fillRect(0,0,760,42);
      ctx.fillStyle='#3b5b70';ctx.font='600 18px "Microsoft YaHei",sans-serif';ctx.textAlign='center';ctx.fillText('B · 扭扭尾巴舞',380,28);
      if(drawing)requestAnimationFrame(draw);
    }
    draw();const stream=canvas.captureStream(30),recorder=new MediaRecorder(stream,{mimeType:'video/webm',videoBitsPerSecond:2200000}),chunks=[];
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const stopped=new Promise(resolve=>recorder.onstop=resolve);
    recorder.start();await new Promise(resolve=>setTimeout(resolve,6100));recorder.stop();await stopped;
    drawing=false;stream.getTracks().forEach(t=>t.stop());
    return new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});
  });
  await fs.writeFile(output('renders/dance-b-preview.webm'),Buffer.from(video,'base64'));
  assert.equal(await page.evaluate(()=>window.__mudkipTest.snapshot().clip),'DanceB');
  checks.push('Playback continues into another B loop');
  await page.setViewportSize({width:390,height:844});await page.locator('[data-clip="DanceB"]').click();
  const rect=await page.locator('[data-clip="DanceB"]').boundingBox();
  assert(rect&&rect.y>0&&rect.y+rect.height<844,'The B button must stay visible on phones');
  await page.evaluate(()=>window.__mudkipTest.sample('DanceB',1.4));await page.waitForTimeout(50);
  await page.screenshot({path:fileURLToPath(output('renders/dance-b-mobile.png'))});
  checks.push('Phone preview and B button remain visible');
  assert.deepEqual(errors,[]);
  await fs.writeFile(output('docs/dance-b-tests.json'),JSON.stringify({passed:true,checks,data,errors},null,2));
  console.log(JSON.stringify({checks,data,errors},null,2));
}finally{await browser.close();}
