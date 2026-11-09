import {chromium} from 'playwright-core';
import fs from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  await page.goto('http://127.0.0.1:5173/resources.html',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__mudkipTest?.diagnostics.ready);
  const base64=await page.evaluate(async()=>{
    const source=document.querySelector('#scene canvas'),canvas=document.createElement('canvas');canvas.width=500;canvas.height=600;
    const context=canvas.getContext('2d'),labels={approach:'靠近水果',bite:'咬住 · 合嘴',chew:'咀嚼 · 由快到慢',swallow:'闭嘴 · 咽下',satisfied:'满足 · 抬头晃尾'};let drawing=true;
    function draw(){context.drawImage(source,570,220,500,600,0,0,500,600);context.fillStyle='#f2f3e4';context.fillRect(0,0,500,45);context.fillStyle='#3b5b70';context.font='600 18px "Microsoft YaHei",sans-serif';context.textAlign='center';context.fillText(labels[window.__mudkipTest.resources().eating.phase]??'吃完啦',250,29);if(drawing)requestAnimationFrame(draw);}
    draw();const stream=canvas.captureStream(60),recorder=new MediaRecorder(stream,{mimeType:'video/webm',videoBitsPerSecond:1800000}),chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const stopped=new Promise(resolve=>recorder.onstop=resolve);
    window.__mudkipTest.play('Eat',true);recorder.start();await new Promise(resolve=>setTimeout(resolve,3000));recorder.stop();await stopped;drawing=false;stream.getTracks().forEach(t=>t.stop());
    return new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});
  });await fs.writeFile(new URL('../../renders/eating-v11.webm',import.meta.url),Buffer.from(base64,'base64'));console.log('Saved eating close-up video');
}finally{await browser.close();}
