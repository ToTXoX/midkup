import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {gardenAction} from './garden-ui-helpers.mjs';
const output=name=>new URL(`../../${name}`,import.meta.url);
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
const checks=[],errors=[],results={};
try{
  const page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:5173/resources.html?clip=Walk',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__mudkipTest?.diagnostics.ready);
  assert.equal(await page.locator('[data-clip="Walk"]').getAttribute('aria-pressed'),'true');
  const metadata=await page.evaluate(async()=>await(await fetch('/assets/game/characters/mudkip/animations.json')).json());
  for(const clip of ['Walk','Run']){
    const duration=metadata.clips.find(c=>c.name===clip).duration;
    const data=await page.evaluate(({clip,duration,speed})=>{
      const api=window.__mudkipTest,first=api.sample(clip,0),last=api.sample(clip,duration-1e-6);
      let minY=Infinity,maxY=-Infinity,minRoot=Infinity,maxRoot=-Infinity,maxFootRotation=0,maxLateral=0,airborne=0;
      for(let frame=0;frame<=120;frame++){
        const sample=api.sample(clip,duration*frame/120);
        minY=Math.min(minY,sample.minimumWorldY);maxY=Math.max(maxY,sample.minimumWorldY);
        minRoot=Math.min(minRoot,sample.rootPosition[1]);maxRoot=Math.max(maxRoot,sample.rootPosition[1]);
        if(sample.minimumWorldY>.01)airborne++;
        for(const foot of sample.feet){
          const base=first.feet.find(f=>f.name===foot.name);
          maxLateral=Math.max(maxLateral,Math.abs(foot.position[0]-base.position[0]));
          maxFootRotation=Math.max(maxFootRotation,2*Math.acos(Math.min(1,Math.abs(foot.quaternion.reduce((sum,v,i)=>sum+v*base.quaternion[i],0)))));
        }
      }
      const a=api.sample(clip,.035).feet.find(f=>f.name==='LHand').position;
      const b=api.sample(clip,.080).feet.find(f=>f.name==='LHand').position;
      return {duration,minY,maxY,minRoot,maxRoot,maxFootRotation,maxLateral,airborne,
        stanceResidual:Math.abs(b[2]-a[2]+speed*.045),
        seam:Math.max(...first.positions.map((v,i)=>Math.abs(v-last.positions[i])))};
    },{clip,duration,speed:metadata.locomotion[clip].speed});
    assert(data.minY>-.002,clip+' must not penetrate the ground');
    assert(data.minRoot>-.041,clip+' must not use the old deep crouch');
    assert(data.maxFootRotation<.002,clip+' paws should remain flat');
    assert(data.maxLateral<.0001,clip+' paws must not scoop sideways');
    assert(data.stanceResidual<.0002,clip+' stance motion should match movement speed');
    assert(data.seam<.0001,clip+' must loop cleanly');
    if(clip==='Walk')assert(data.maxY<.003,'Walk should always retain floor contact');
    else assert(data.maxY>.02&&data.airborne>10&&data.airborne<55,'Run should have brief, visible flight');
    results[clip]=data;
    const png=await page.evaluate(async({clip,duration})=>{
      const api=window.__mudkipTest,source=document.querySelector('#scene canvas');
      const canvas=document.createElement('canvas');canvas.width=840;canvas.height=720;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#f5f4e6';ctx.fillRect(0,0,840,720);
      for(let frame=0;frame<6;frame++){
        const time=duration*frame/6;api.sample(clip,time);api.pause(true);
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const x=frame%3*280,y=Math.floor(frame/3)*360;
        ctx.drawImage(source,510,180,440,520,x,y+28,280,331);
        ctx.fillStyle='#35576e';ctx.font='16px sans-serif';ctx.fillText(`${clip}  ${time.toFixed(3)} s`,x+12,y+21);
      }
      return canvas.toDataURL('image/png').split(',')[1];
    },{clip,duration});
    await fs.writeFile(output(`renders/locomotion-v16-${clip.toLowerCase()}-poses.png`),Buffer.from(png,'base64'));
  }
  checks.push('Both clips keep flat paws, stable lateral placement, clear ground contact and seamless loops');
  checks.push('Walk stays grounded; Run has a short airborne phase; both preserve movement speed');

  await page.selectOption('#scene-view','garden');
  for(const clip of ['Walk','Run']){
    await gardenAction(page,'回到起点');
    const toggle=page.getByRole('switch',{name:'小跑模式',exact:true});
    if((await toggle.getAttribute('aria-checked'))!==String(clip==='Run'))await toggle.click();
    const data=await page.evaluate(({clip,duration,stance})=>{
      const api=window.__mudkipTest;api.moveTo(0,3);
      let previous=api.snapshot(),previousFeet=api.poseState().feet,maxPlantDrift=0,samples=0,peakSpeed=0;
      for(let step=0;step<180&&api.snapshot().target;step++){
        api.advanceMovement(.005);
        const next=api.snapshot(),feet=api.poseState().feet;peakSpeed=Math.max(peakSpeed,next.speed);
        if(step>70&&next.clip===clip&&previous.clip===clip){
          for(const foot of feet){
            const phase=clip==='Run'?(foot.name==='LHand'||foot.name==='RFoot'?0:.5):{LHand:0,RFoot:.25,RHand:.5,LFoot:.75}[foot.name];
            const a=(previous.time/duration+phase)%1,b=(next.time/duration+phase)%1;
            if(a>.05&&b>a&&b<stance-.025){
              const old=previousFeet.find(f=>f.name===foot.name).position;
              maxPlantDrift=Math.max(maxPlantDrift,Math.hypot(foot.position[0]-old[0],foot.position[2]-old[2]));samples++;
            }
          }
        }
        previous=next;previousFeet=feet;
      }
      return {maxPlantDrift,samples,peakSpeed};
    },{clip,duration:results[clip].duration,stance:metadata.locomotion[clip].stanceFraction});
    assert(data.samples>30,'Enough steady support steps must be measured');
    assert(data.maxPlantDrift<.001,'World-space supporting paws must not visibly slide');
    results[clip].garden=data;
  }
  checks.push('Supporting paws remain stationary in the garden while the character advances');
  await gardenAction(page,'返回动作台');
  const video=await page.evaluate(async()=>{
    const api=window.__mudkipTest;api.play('Walk',true);
    const source=document.querySelector('#scene canvas'),canvas=document.createElement('canvas');canvas.width=760;canvas.height=660;
    const ctx=canvas.getContext('2d');let drawing=true;
    function draw(){
      ctx.drawImage(source,420,130,760,660,0,0,760,660);ctx.fillStyle='#fffbed';ctx.fillRect(0,0,760,42);
      ctx.fillStyle='#3b5b70';ctx.font='600 18px "Microsoft YaHei",sans-serif';ctx.textAlign='center';
      ctx.fillText(api.snapshot().clip==='Run'?'小跑 · 蹬地与轻跳':'走路 · 轻快小碎步',380,28);
      if(drawing)requestAnimationFrame(draw);
    }
    draw();const stream=canvas.captureStream(30),recorder=new MediaRecorder(stream,{mimeType:'video/webm',videoBitsPerSecond:2500000}),chunks=[];
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const stopped=new Promise(resolve=>recorder.onstop=resolve);
    recorder.start();const timer=setTimeout(()=>api.play('Run',true),4000);
    await new Promise(resolve=>setTimeout(resolve,8100));recorder.stop();await stopped;clearTimeout(timer);
    drawing=false;stream.getTracks().forEach(t=>t.stop());
    return new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});
  });
  await fs.writeFile(output('renders/locomotion-v16-preview.webm'),Buffer.from(video,'base64'));
  assert.deepEqual(errors,[]);
  await fs.writeFile(output('docs/locomotion-v16-tests.json'),JSON.stringify({passed:true,checks,results,errors},null,2));
  console.log(JSON.stringify({checks,results,errors},null,2));
}finally{await browser.close();}
