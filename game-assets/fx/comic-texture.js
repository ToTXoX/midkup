import * as THREE from 'three';

export function paintComicTexture(width,height,draw){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  draw(canvas.getContext('2d'));
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  return map;
}

export function comicLettering(text){
  return paintComicTexture(256,128,ctx=>{
    ctx.font='900 78px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif';
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';
    ctx.strokeStyle='#4f382e';ctx.lineWidth=14;ctx.strokeText(text,132,76,226);
    ctx.fillStyle='#e39b62';ctx.fillText(text,132,76,226);
    ctx.lineWidth=11;ctx.strokeText(text,125,69,226);
    ctx.fillStyle='#fff7dd';ctx.fillText(text,125,69,226);
  });
}
