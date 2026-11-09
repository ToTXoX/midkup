import * as THREE from 'three';

// An independent, transparent animation inspired by the selected hand-drawn
// splash reference. The reference GIF itself is not a runtime asset.
export async function createCartoonSplash(atlasURL,{surfaceHeight}){
  const [atlas,metadata]=await Promise.all([new THREE.TextureLoader().loadAsync(atlasURL),fetch(atlasURL.replace(/\.png$/,'.json')).then(r=>{if(!r.ok)throw new Error('水花序列信息加载失败');return r.json();})]);
  atlas.colorSpace=THREE.SRGBColorSpace;atlas.minFilter=atlas.magFilter=THREE.LinearFilter;atlas.generateMipmaps=false;
  const group=new THREE.Group();group.name='Hand drawn water splash flipbooks';
  const pool=Array.from({length:2},()=>{
    const frame={value:0},flip={value:0};
    const material=new THREE.SpriteMaterial({map:atlas,transparent:true,depthWrite:false,alphaTest:.12,toneMapped:false});
    material.userData.outlineParameters={visible:false};
    material.onBeforeCompile=shader=>{
      shader.uniforms.uSplashFrame=frame;shader.uniforms.uSplashFlip=flip;
      shader.fragmentShader='uniform float uSplashFrame,uSplashFlip;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
        vec2 cell=vec2(mod(uSplashFrame,4.),3.-floor(uSplashFrame/4.));
        vec2 localUV=vMapUv;if(uSplashFlip>.5)localUV.x=1.-localUV.x;
        vec2 atlasUV=(cell+localUV*.984375+.0078125)/4.;
        diffuseColor*=texture2D(map,atlasUV);
      `);
    };
    material.customProgramCacheKey=()=> 'hand-drawn-water-flipbook-v14';
    const sprite=new THREE.Sprite(material);sprite.center.set(.5,.14);sprite.visible=false;sprite.renderOrder=3;
    sprite.raycast=()=>{}; // Decorative flipbooks must never block aiming or ground picking.
    sprite.userData.combatDecoration=true;group.add(sprite);
    return {sprite,frame,flip,born:-100,duration:.64,active:false,kind:null};
  });
  let time=0,total=0;const counts={entry:0,exit:0};
  function spawn(point,{size=.55,flip=false,duration=.44,kind='entry'}={}){
    const record=pool.find(p=>!p.active)??pool.reduce((old,p)=>p.born<old.born?p:old,pool[0]);
    record.sprite.position.set(point.x,surfaceHeight+.014,point.z);record.sprite.scale.set(size,size,1);
    record.frame.value=0;record.flip.value=Number(flip);record.sprite.material.opacity=1;
    record.born=time;record.duration=duration;record.active=record.sprite.visible=true;record.kind=kind;total++;counts[kind]=(counts[kind]??0)+1;
  }
  function update(delta){
    time+=delta;
    for(const record of pool){
      const progress=(time-record.born)/record.duration;
      record.active=record.sprite.visible=progress>=0&&progress<1;
      if(record.active){record.frame.value=Math.min(15,Math.floor(progress*16));record.sprite.center.y=metadata.anchors[record.frame.value];record.sprite.material.opacity=1-THREE.MathUtils.smoothstep(progress,.78,1);}
    }
  }
  function reset(){pool.forEach(p=>{p.born=-100;p.active=p.sprite.visible=false;p.kind=null;});}
  return {group,spawn,update,reset,debug:()=>({active:pool.filter(p=>p.active).length,frames:pool.filter(p=>p.active).map(p=>p.frame.value),positions:pool.filter(p=>p.active).map(p=>p.sprite.position.toArray()),poolSize:pool.length,total,counts:{...counts},frameCount:16,columns:4,rows:4,mode:'transparent-flipbook'})};
}
