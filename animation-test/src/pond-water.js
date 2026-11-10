import * as THREE from 'three';
import {createPondSimulation} from './pond-simulation.js';
import {createCartoonSplash} from './cartoon-splash.js';
import {createPondLily} from './pond-lily.js';

// A shallow, refractive pond with sparse cartoon crests over the heightfield.
export async function createPondWater({environment,collider,renderer,scene,atlasURL,groundHeight,mobileGraphics=false}){
  const root=environment.getObjectByName('Pond_Water');
  if(!root||!collider)throw new Error('庭院缺少水池表面或边界');
  const box=new THREE.Box3().setFromObject(root),center=box.getCenter(new THREE.Vector3());
  const info={center:[...collider.center],radii:[...collider.radii],height:center.y,inset:.42};
  // Stones were merged during export. Remove complete connected stone islands
  // at the west bank so the entry animation has a real gap, without cut faces.
  let clearedStones=0;
  environment.getObjectByName('Pond_Details')?.traverse(mesh=>{
    if(!mesh.isMesh||!/stones/i.test(mesh.material.name))return;
    const g=mesh.geometry.clone(),p=g.attributes.position,indices=g.index?.array??Uint32Array.from({length:p.count},(_,i)=>i);
    const parents=Array.from({length:p.count},(_,i)=>i),weld=new Map(),v=new THREE.Vector3();
    const find=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
    const join=(a,b)=>parents[find(a)]=find(b);
    for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);const key=[v.x,v.y,v.z].map(x=>x.toFixed(5)).join(',');if(weld.has(key))join(i,weld.get(key));else weld.set(key,i);}
    for(let i=0;i<indices.length;i+=3){join(indices[i],indices[i+1]);join(indices[i],indices[i+2]);}
    const components=new Map();
    for(let i=0;i<p.count;i++){const id=find(i);if(!components.has(id))components.set(id,new THREE.Box3());components.get(id).expandByPoint(v.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld));}
    const removed=new Set();
    for(const [id,bounds] of components){const c=bounds.getCenter(v);if(c.x<info.center[0]-info.radii[0]*.72&&Math.abs(c.z-info.center[1])<.7){removed.add(id);clearedStones++;}}
    const kept=[];for(let i=0;i<indices.length;i+=3)if(!removed.has(find(indices[i])))kept.push(indices[i],indices[i+1],indices[i+2]);
    g.setIndex(kept);mesh.geometry=g;
  });
  const gridSize = mobileGraphics ? 48 : innerWidth < 700 ? 64 : 96;
  const simulation=createPondSimulation(renderer,{...info,size:gridSize});
  const splashFX=await createCartoonSplash(atlasURL,{surfaceHeight:info.height});
  environment.add(splashFX.group);
  const ripples=Array.from({length:3},()=>new THREE.Vector4(0,0,-100,0));
  const refraction=new THREE.WebGLRenderTarget(512,512,{depthBuffer:true});
  refraction.depthTexture=new THREE.DepthTexture(512,512,THREE.UnsignedIntType);
  const uniforms={uTime:{value:0},uCenter:{value:new THREE.Vector2(...info.center)},uRadii:{value:new THREE.Vector2(...info.radii)},uState:{value:simulation.texture},uGrid:{value:simulation.debug().size},uScene:{value:refraction.texture},uDepth:{value:refraction.depthTexture},uResolution:{value:new THREE.Vector2()},uNear:{value:.05},uFar:{value:100},uShallow:{value:new THREE.Color('#9bcdbd')},uDeep:{value:new THREE.Color('#609fa8')}};
  uniforms.uRipples={value:ripples};
  const sampling=`uniform sampler2D uState;uniform float uGrid;
    vec4 stateAt(vec2 uv){vec2 q=uv*uGrid-.5,f=fract(q),base=(floor(q)+.5)/uGrid;
      return mix(mix(texture2D(uState,base),texture2D(uState,base+vec2(1./uGrid,0.)),f.x),
      mix(texture2D(uState,base+vec2(0.,1./uGrid)),texture2D(uState,base+vec2(1./uGrid)),f.x),f.y);}`;
  const material=new THREE.ShaderMaterial({name:'Heightfield cartoon pond',uniforms,side:THREE.DoubleSide,
    vertexShader:`${sampling} uniform vec2 uCenter,uRadii;varying vec3 vWorld;varying float vDepth;
      void main(){vec4 world=modelMatrix*vec4(position,1.);vec2 uv=(world.xz-uCenter)/(2.*uRadii)+.5;
        world.y+=stateAt(uv).r;vWorld=world.xyz;vec4 view=viewMatrix*world;vDepth=-view.z;gl_Position=projectionMatrix*view;}`,
    fragmentShader:`${sampling}
      uniform float uTime,uNear,uFar;uniform vec2 uCenter,uRadii,uResolution;
      uniform vec4 uRipples[3];
      uniform sampler2D uScene,uDepth;uniform vec3 uShallow,uDeep;varying vec3 vWorld;varying float vDepth;
      float viewDepth(float depth){return uNear*uFar/(uFar-depth*(uFar-uNear));}
      void main(){
        vec2 uv=(vWorld.xz-uCenter)/(2.*uRadii)+.5;vec4 state=stateAt(uv);
        vec2 slope=clamp(state.ba,vec2(-.45),vec2(.45));
        // A millimeter-scale background breeze, not painted foam ribbons.
        slope+=vec2(cos(vWorld.x*5.+uTime*.65),sin(vWorld.z*4.-uTime*.48))*.003;
        vec3 normal=normalize(vec3(slope.x,sqrt(max(.01,1.-dot(slope,slope))),slope.y));
        vec3 eye=normalize(cameraPosition-vWorld);vec2 screen=gl_FragCoord.xy/uResolution;
        float thickness=max(0.,viewDepth(texture2D(uDepth,screen).r)-vDepth);
        vec2 offset=(mat3(viewMatrix)*normal).xy*.022*min(thickness,.35);
        vec2 refracted=clamp(screen+offset,vec2(.001),vec2(.999));
        if(viewDepth(texture2D(uDepth,refracted).r)<vDepth)refracted=screen;
        vec4 underneath=texture2D(uScene,refracted);
        vec3 tint=mix(uShallow,uDeep,smoothstep(.04,.42,thickness));
        float absorption=1.-exp(-thickness*2.5);
        // Preserve the discovery pebble's warm highlight through the same refraction pass.
        float pebble=smoothstep(.12,.25,underneath.a)*(1.-smoothstep(.25,.82,underneath.a));
        vec3 transmission=mix(vec3(.70,.93,.98),vec3(.99,.97,.93),pebble);
        vec3 color=mix(underneath.rgb*transmission,tint,(.42+absorption*.28)*mix(1.,.47,pebble));
        vec3 reflection=mix(vec3(.36,.51,.40),vec3(.78,.88,.83),smoothstep(.02,.7,reflect(-eye,normal).y));
        float fresnel=.09+.45*pow(1.-max(dot(eye,normal),0.),4.);
        color=mix(color,reflection,fresnel);
        color+=vec3(.65,.85,.85)*clamp(dot(state.ba,vec2(-.6,.8)),-.12,.12)*.16;
        vec3 light=normalize(vec3(-.5,1.,.6)),halfway=normalize(light+eye);
        float glint=pow(max(dot(normal,halfway),0.),100.);
        color+=vec3(.90,.96,.87)*glint*.06;
        // Swimming leaves low, spreading surface ripples. No upright splash
        // geometry or billboard animation is involved in this pass.
        float shore=1.-smoothstep(.86,.99,length(uv*2.-1.));
        for(int i=0;i<3;i++){
          vec4 ripple=uRipples[i];float age=uTime-ripple.z;
          if(age>=0.&&age<1.3){
            vec2 relative=vWorld.xz-ripple.xy,forward=vec2(sin(ripple.w),cos(ripple.w));
            vec2 local=vec2(dot(relative,vec2(forward.y,-forward.x)),dot(relative,forward));
            vec2 radius=vec2(.28+age*.28,.34+age*.32);
            float angle=atan(local.y/radius.y,local.x/radius.x);
            float edge=(length(local/radius)-1.)*radius.x+.006*sin(angle*4.+age);
            float width=mix(.012,.006,age/1.3),aa=max(fwidth(edge),.002);
            float line=1.-smoothstep(width,width+aa,abs(edge));
            float arcs=smoothstep(-.65,.25,cos(angle*2.+.55));
            float life=smoothstep(0.,.10,age)*(1.-smoothstep(.45,1.3,age));
            color=mix(color,vec3(.78,.91,.86),line*arcs*life*shore*.60);
          }
        }
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
  material.userData.outlineParameters={visible:false};
  // Subdivide the original flat fan so simulated height changes move the surface.
  const positions=[],indices=[];
  const rings = mobileGraphics ? 24 : 40;
  const segments = mobileGraphics ? 72 : 112;
  for(let i=0;i<=rings;i++)for(let j=0;j<segments;j++){const r=i/rings,a=j/segments*Math.PI*2;positions.push(info.center[0]+r*info.radii[0]*Math.cos(a),info.height,info.center[1]+r*info.radii[1]*Math.sin(a));}
  for(let i=0;i<rings;i++)for(let j=0;j<segments;j++){const a=i*segments+j,b=i*segments+(j+1)%segments,c=a+segments,d=b+segments;indices.push(a,b,c,b,d,c);}
  const surfaceGeometry=new THREE.BufferGeometry();surfaceGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));surfaceGeometry.setIndex(indices);surfaceGeometry.computeVertexNormals();
  root.traverse(o=>{if(o.isMesh){o.geometry=surfaceGeometry;o.material=material;o.castShadow=false;o.receiveShadow=false;o.renderOrder=2;}});
  // Replace the baked white loops and let the far lily pad float on its own.
  environment.traverse(o=>{if(o.isMesh&&[].concat(o.material).some(m=>/water ripple/i.test(m.name)))o.visible=false;});
  const lily=createPondLily(environment,info,groundHeight);

  // One-off entry/exit splashes; ordinary swimming only emits surface ripples.
  const drops=splashFX.group;
  let time=0,lastInWater=false,rippleIndex=0,lastRipple=-100,travel=0,hadPosition=false;
  let wavesActive = !mobileGraphics;
  let lastRefractionAt = -Infinity;
  const lastCameraPosition = new THREE.Vector3();
  const lastCameraRotation = new THREE.Quaternion();
  const lastProjection = new THREE.Matrix4();
  const previousPosition=new THREE.Vector3(),emission=new THREE.Vector3(),forward=new THREE.Vector3();
  function surfaceRipple(point,yaw=0){ripples[rippleIndex++%ripples.length].set(point.x,point.z,time,yaw);lastRipple=time;}
  function ripple(point,strength=.4){simulation.drop(point,.002*strength,.15);surfaceRipple(point);}
  function splash(point,{kind='entry'}={}){ripple(point,1);splashFX.spawn(point,{size:kind==='exit'?.43:.55,duration:kind==='exit'?.36:.44,kind});}
  function update(delta,{contacts,position,yaw=0,inWater=false,moving=false}={}){
    time+=delta;uniforms.uTime.value=time;
    lily?.update(delta,position,inWater);
    const simulateWaves = !mobileGraphics || inWater || time - lastRipple < 4;
    if (simulateWaves) simulation.update(delta, inWater ? contacts : null);
    else if (wavesActive) simulation.reset();
    wavesActive = simulateWaves;
    uniforms.uState.value=simulation.texture;
    splashFX.update(delta);
    if(delta>0&&position&&inWater&&moving){
      const distance=hadPosition?Math.hypot(position.x-previousPosition.x,position.z-previousPosition.z):0;
      if(distance<.15)travel+=distance;
      if(travel>.12&&time-lastRipple>.62){
        forward.set(Math.sin(yaw),0,Math.cos(yaw));emission.copy(position).addScaledVector(forward,-.08);
        surfaceRipple(emission,yaw);travel=0;
      }
      previousPosition.copy(position);hadPosition=true;
    }else if(delta>0){hadPosition=false;travel=0;}
    if(!inWater&&lastInWater)splashFX.reset();
    lastInWater=inWater;
  }
  function reset(){
    simulation.reset();
    uniforms.uState.value=simulation.texture;
    splashFX.reset();
    lily?.reset();
    ripples.forEach(r=>r.z=-100);
    rippleIndex=0;lastRipple=-100;travel=0;hadPosition=false;lastInWater=false;
    wavesActive = !mobileGraphics;
    lastRefractionAt = -Infinity;
  }
  const drawingBuffer=new THREE.Vector2();
  function prepare(camera, now = performance.now()){
    renderer.getDrawingBufferSize(drawingBuffer);uniforms.uResolution.value.copy(drawingBuffer);
    const scale = mobileGraphics
      ? Math.min(.4, 384 / Math.max(drawingBuffer.x, drawingBuffer.y))
      : Math.min(.65, 960 / drawingBuffer.x);
    const w=Math.max(1,Math.round(drawingBuffer.x*scale)),h=Math.max(1,Math.round(drawingBuffer.y*scale));
    const resized = refraction.width !== w || refraction.height !== h;
    if (resized) refraction.setSize(w,h);
    // A still camera can reuse the pond image between refreshes on a phone.
    if (mobileGraphics && !lastInWater && !resized && now - lastRefractionAt < 100 &&
        lastCameraPosition.distanceToSquared(camera.position) < 1e-8 &&
        Math.abs(lastCameraRotation.dot(camera.quaternion)) > 1 - 1e-9 &&
        lastProjection.equals(camera.projectionMatrix)) return;
    uniforms.uNear.value=camera.near;uniforms.uFar.value=camera.far;
    const target=renderer.getRenderTarget(),shadowAuto=renderer.shadowMap.autoUpdate,shadowEnabled=renderer.shadowMap.enabled;
    root.visible=false;drops.visible=false;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.enabled=false;
    // Surface sparkles are drawn only over the water, without a refracted duplicate.
    if(lily)lily.surfaceGlints.visible=false;
    try{
      renderer.setRenderTarget(refraction);
      renderer.render(scene,camera);
      if (mobileGraphics) {
        lastRefractionAt = now;
        lastCameraPosition.copy(camera.position);
        lastCameraRotation.copy(camera.quaternion);
        lastProjection.copy(camera.projectionMatrix);
      }
    }finally{
      renderer.setRenderTarget(target);
      renderer.shadowMap.autoUpdate=shadowAuto;renderer.shadowMap.enabled=shadowEnabled;
      root.visible=true;drops.visible=true;
      if(lily)lily.surfaceGlints.visible=true;
    }
  }
  return {info,update,ripple,splash,reset,prepare,swimTarget:point=>lily?.swimTarget(point)??point,sampleWaves:simulation.sample,debug:()=>({time,height:info.height,center:info.center,radii:info.radii,clearedStones,ripples:ripples.filter(r=>time-r.z<1.3).length,crestLimit:3,foam:0,droplets:0,cartoonSplash:splashFX.debug(),lily:lily?.debug(),shader:'heightfield-refractive-toon',simulation:simulation.debug(),extraRenderTargets:3,refractionSize:[refraction.width,refraction.height]})};
}
