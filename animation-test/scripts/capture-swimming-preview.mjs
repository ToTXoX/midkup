import {chromium} from 'playwright-core';
import fs from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:900,height:760},deviceScaleFactor:1});
  await page.goto('http://127.0.0.1:5173/resources.html?scene=garden',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__mudkipTest?.diagnostics.ready);
  const base64=await page.evaluate(async()=>{
    const api=window.__mudkipTest;api.moveTo(3.53,.316);
    let frames=0;while(api.swimming().phase==='approaching'&&frames++<200)api.advanceMovement(.025);
    api.viewPond();
    const source=document.querySelector('#scene canvas'),canvas=document.createElement('canvas');canvas.width=720;canvas.height=608;
    const ctx=canvas.getContext('2d');let drawing=true;
    const labels={entering:'轻轻入水',swimming:'划水 · 摆尾 · 踩水',exiting:'从岸边上岸',land:'回到草地'};
    function draw(){ctx.drawImage(source,0,0,720,608);ctx.fillStyle='#fffbed';ctx.fillRect(0,0,720,38);ctx.fillStyle='#3b5b70';ctx.font='600 17px "Microsoft YaHei",sans-serif';ctx.textAlign='center';ctx.fillText(labels[api.swimming().phase]??'去岸边',360,26);if(drawing)requestAnimationFrame(draw);}
    draw();const stream=canvas.captureStream(30),recorder=new MediaRecorder(stream,{mimeType:'video/webm',videoBitsPerSecond:2000000}),chunks=[];
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const stopped=new Promise(resolve=>recorder.onstop=resolve);
    recorder.start();api.pause(false);
    const timers=[setTimeout(()=>api.moveTo(3.53,.95),1800),setTimeout(()=>api.moveTo(3.53,.316),3100),setTimeout(()=>api.moveTo(0,1.3),4700)];
    await new Promise(resolve=>setTimeout(resolve,6500));recorder.stop();await stopped;drawing=false;timers.forEach(clearTimeout);stream.getTracks().forEach(t=>t.stop());
    return new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});
  });
  await fs.writeFile(new URL(`../../renders/${process.argv[2]??'swimming-v13.webm'}`,import.meta.url),Buffer.from(base64,'base64'));console.log('Saved swimming preview video');
}finally{await browser.close();}
