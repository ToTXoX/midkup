import * as THREE from 'three';
import {OutlineEffect} from 'three/addons/effects/OutlineEffect.js';

// Palette is shared by the source model's cel ramp and the browser shader.
const CEL_RAMP = `
vec3 getGradientIrradiance(vec3 normal,vec3 lightDirection){
  float light=dot(normal,lightDirection);
  float aa=max(fwidth(light)*0.65,0.008);
  vec3 shadow=vec3(0.34,0.46,0.65);
  vec3 midtone=vec3(0.68,0.77,0.88);
  vec3 sunlight=vec3(1.0,0.98,0.93);
  vec3 color=mix(shadow,midtone,smoothstep(-0.12-aa,-0.12+aa,light));
  return mix(color,sunlight,smoothstep(0.48-aa,0.48+aa,light));
}`;

export function createToonStyle({renderer,scene,ambient,key,fill,mobileGraphics=false}){
  const ink=new THREE.Color('#294653').toArray();
  const forestInk=new THREE.Color('#49644e').toArray();
  const outlineScale = mobileGraphics ? 1.5 : 1;
  const characterOutline = .0018 * outlineScale;
  const effect=new OutlineEffect(renderer,{defaultThickness:characterOutline,defaultColor:ink,defaultKeepAlive:true});
  const cache=new Map();
  let materials=0,outlinedMaterials=0;
  renderer.toneMapping=THREE.NoToneMapping;
  renderer.toneMappingExposure=1;
  renderer.shadowMap.type=THREE.PCFShadowMap;

  function convert(source,role,outline){
    const cacheKey=`${role}:${outline}:${source.uuid}`;
    if(cache.has(cacheKey))return cache.get(cacheKey);
    const eye=role==='character'&&/eye/i.test(source.name);
    const water=/pond water|water ripple|window soft reflection/i.test(source.name);
    // The eye atlas includes blue skin, so it must share the head's lighting.
    const graphic=water;
    const parameters={name:source.name,color:source.color?.clone()??new THREE.Color('white'),map:source.map??null,vertexColors:source.vertexColors,side:source.side,transparent:source.transparent,opacity:source.opacity,alphaTest:source.alphaTest,depthWrite:source.depthWrite};
    const material=graphic?new THREE.MeshBasicMaterial(parameters):new THREE.MeshToonMaterial(parameters);
    material.userData={...source.userData,style:'anime-cel-v06'};
    if(!graphic){
      material.onBeforeCompile=(shader)=>{shader.fragmentShader=shader.fragmentShader.replace('#include <gradientmap_pars_fragment>',CEL_RAMP);};
      material.customProgramCacheKey=()=> 'mudkip-anime-cel-v06';
    }
    const ground=/terrain|earth warm|grass|water|ripple|glass|reflection|flower/i.test(source.name);
    const outlined=outline&&role!=='stage'&&!ground&&!eye;
    const sceneryOutline = /foliage|forest|pine/i.test(source.name) ? .001 : .00065;
    material.userData.outlineParameters={visible:outlined,thickness:role==='character'?characterOutline:sceneryOutline*outlineScale,color:role==='character'?ink:forestInk,keepAlive:true};
    cache.set(cacheKey,material);materials++;if(outlined)outlinedMaterials++;
    return material;
  }
  function apply(root,role='environment',{outlineMesh}={}){
    root.traverse((object)=>{
      if(!object.isMesh||object.userData.combatDecoration)return;
      const outline=outlineMesh?.(object)??true;
      object.material=Array.isArray(object.material)?object.material.map(m=>convert(m,role,outline)):convert(object.material,role,outline);
    });
  }
  function excludeUnstyled(){
    scene.traverse((object)=>{
      if(!object.material)return;
      for(const material of [].concat(object.material))if(!material.userData.outlineParameters)material.userData.outlineParameters={visible:false};
    });
  }
  function setView(view){
    const garden=view==='garden';
    scene.background.set(garden?'#e9efdd':'#f2f3e4');
    scene.fog.color.copy(scene.background);
    ambient.color.set('#d4e4f6');ambient.groundColor.set('#c5ceaa');ambient.intensity=.95;
    key.color.set('#fff8f0');key.intensity=2.2;
    key.position.set(garden?-6:-3,garden?12:5,garden?8:4);
    key.shadow.radius=2;
    fill.color.set('#a8c7ef');fill.intensity=.13;
  }
  setView('stage');
  return {apply,excludeUnstyled,setView,
    renderFrame:(camera)=>effect.render(scene,camera),
    debug:()=>({name:'anime-cel-v06',bands:3,materials,outlinedMaterials,characterOutline,physicalSpecular:false})};
}
