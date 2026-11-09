import {chromium} from 'playwright-core';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:946,height:871},deviceScaleFactor:1});
  await page.goto('http://127.0.0.1:5173/resources.html',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__mudkipTest?.diagnostics.ready);
  await page.getByRole('button',{name:'喷水 张嘴发射'}).click();
  for(const [name,time] of [['closed',.20],['open',.50],['recovered',.95]]){
    await page.evaluate((t)=>window.__mudkipTest.seek(t),time);
    await page.waitForTimeout(80);
    await page.screenshot({path:fileURLToPath(new URL(`../../renders/water-mouth-v05-${name}.png`,import.meta.url)),clip:{x:410,y:230,width:530,height:430}});
  }
  const base64=await page.evaluate(async()=>{
    const source=document.querySelector('#scene canvas');
    const canvas=document.createElement('canvas');canvas.width=530;canvas.height=430;
    const context=canvas.getContext('2d');
    let drawing=true;
    function draw(){context.drawImage(source,410,230,530,430,0,0,530,430);if(drawing)requestAnimationFrame(draw);}
    draw();
    const stream=canvas.captureStream(30);
    const mime=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm';
    const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:1800000});
    const chunks=[];
    recorder.ondataavailable=(event)=>{if(event.data.size)chunks.push(event.data);};
    const stopped=new Promise((resolve)=>recorder.onstop=resolve);
    recorder.start();
    window.__mudkipTest.play('WaterShoot',true);
    await new Promise((resolve)=>setTimeout(resolve,1700));
    window.__mudkipTest.play('WaterShoot',true);
    await new Promise((resolve)=>setTimeout(resolve,1700));
    recorder.stop();await stopped;drawing=false;stream.getTracks().forEach((t)=>t.stop());
    return new Promise((resolve)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type:mime}));});
  });
  const bytes=Buffer.from(base64,'base64');
  await fs.writeFile(new URL('../../renders/water-mouth-v05.webm',import.meta.url),bytes);
  console.log('Saved normal-speed preview',bytes.length,'bytes');
}finally{await browser.close();}
