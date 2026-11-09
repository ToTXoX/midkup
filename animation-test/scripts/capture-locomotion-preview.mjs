import {chromium} from 'playwright-core';
import fs from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  await page.goto('http://127.0.0.1:5173/resources.html',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__mudkipTest?.diagnostics.ready);
  const base64=await page.evaluate(async()=>{
    const source=document.querySelector('#scene canvas');
    const canvas=document.createElement('canvas');canvas.width=500;canvas.height=600;
    const context=canvas.getContext('2d');let drawing=true,label='轻快走 · 0.66 米/秒';
    function draw(){
      context.drawImage(source,570,200,500,600,0,0,500,600);
      context.fillStyle='#f2f3e4';context.fillRect(0,0,500,48);
      context.fillStyle='#356858';context.font='600 19px "Microsoft YaHei",sans-serif';context.textAlign='center';context.fillText(label,250,31);
      if(drawing)requestAnimationFrame(draw);
    }
    draw();const stream=canvas.captureStream(60),mime=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm';
    const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:1800000});const chunks=[];
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    const stopped=new Promise(resolve=>recorder.onstop=resolve);
    window.__mudkipTest.play('Walk',true);recorder.start();await new Promise(resolve=>setTimeout(resolve,2200));
    label='弹性小跑 · 1.54 米/秒';window.__mudkipTest.play('Run',true);await new Promise(resolve=>setTimeout(resolve,2200));
    recorder.stop();await stopped;drawing=false;stream.getTracks().forEach(t=>t.stop());
    return new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type:mime}));});
  });
  const bytes=Buffer.from(base64,'base64');await fs.writeFile(new URL('../../renders/locomotion-v08.webm',import.meta.url),bytes);
  console.log('Saved walk/run close-up preview',bytes.length,'bytes');
}finally{await browser.close();}
