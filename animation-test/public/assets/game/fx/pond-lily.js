import * as THREE from 'three';

const {damp,smoothstep}=THREE.MathUtils;
const BUBBLE_PERIOD=4.8;
const BUBBLE_SIZES=[.081,.063,.075];
const STONE_GLINTS=[
  {x:.057,z:.035,height:.095,size:.28,delay:0,duration:.71},
  {x:.14,z:-.067,height:.12,size:.127,delay:.26,duration:.48},
];

function separateFarLeaf(environment,centerZ){
  let leaf;
  environment.getObjectByName('Pond_Details')?.traverse(mesh=>{
    if(mesh.isMesh&&/lily leaves/i.test(mesh.material.name))leaf=mesh;
  });
  if(!leaf)return null;

  const geometry=leaf.geometry,positions=geometry.attributes.position;
  const indices=geometry.index?.array??Array.from({length:positions.count},(_,i)=>i);
  const points=Array.from({length:3},()=>new THREE.Vector3());
  const kept=[],bounds=new THREE.Box3();
  for(let i=0;i<indices.length;i+=3){
    points.forEach((point,j)=>point.fromBufferAttribute(positions,indices[i+j]).applyMatrix4(leaf.matrixWorld));
    if((points[0].z+points[1].z+points[2].z)/3>=centerZ){
      kept.push(indices[i],indices[i+1],indices[i+2]);
    }else{
      for(const point of points)bounds.expandByPoint(point);
    }
  }
  if(bounds.isEmpty())return null;
  leaf.geometry=geometry.clone().setIndex(kept);
  return bounds.getCenter(new THREE.Vector3());
}

function makeMesh(name){
  const positions=[],colors=[];
  return {
    vertex(point,color){positions.push(...point);colors.push(color.r,color.g,color.b);},
    finish(){
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
      geometry.computeVertexNormals();
      return new THREE.Mesh(geometry,new THREE.MeshToonMaterial({name,vertexColors:true}));
    },
  };
}

function createPad(){
  const leaf=makeMesh('Floating lily leaf');
  const green=new THREE.Color('#75a765'),vein=new THREE.Color('#91b879'),rim=new THREE.Color('#527f50');
  const center=[0,.009,0],edge=[];
  for(let i=0;i<=40;i++){
    const angle=.27+(2*Math.PI-.54)*i/40;
    const radius=1+.025*Math.sin(angle*5);
    edge.push([Math.cos(angle)*.181*radius,0,Math.sin(angle)*.150*radius]);
  }
  for(let i=0;i<40;i++){
    const a=edge[i],b=edge[i+1];
    leaf.vertex(center,vein);
    leaf.vertex(b,i%7===0?vein:green);
    leaf.vertex(a,green);
    const lowerA=[a[0],-.009,a[2]],lowerB=[b[0],-.009,b[2]];
    for(const point of [a,b,lowerA,lowerA,b,lowerB])leaf.vertex(point,rim);
  }

  const flower=makeMesh('Blush water lily flower');
  const base=new THREE.Color('#d88e9c'),tip=new THREE.Color('#ffebe4'),heart=new THREE.Color('#f6c15e');
  const fx=-.067,fz=.018;
  for(let i=0;i<8;i++){
    const angle=i*Math.PI/4,dx=Math.cos(angle),dz=Math.sin(angle);
    const petal=(out,up,side)=>[fx+dx*out-dz*side,up,fz+dz*out+dx*side];
    const root=petal(.006,.009,0),left=petal(.036,.034,-.020),right=petal(.036,.034,.020);
    const peak=petal(.071,.051,0),fold=petal(.035,.023,0);
    for(const point of [root,right,fold,root,fold,left,fold,right,peak,fold,peak,left]){
      flower.vertex(point,point===root||point===fold?base:tip);
    }
    flower.vertex(petal(0,.032,0),heart);
    flower.vertex(petal(.019,.022,.008),heart);
    flower.vertex(petal(.019,.022,-.008),heart);
  }
  const pad=new THREE.Group();
  pad.name='Interactive water lily';
  pad.add(leaf.finish(),flower.finish());
  return pad;
}

function texture(draw){
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=64;
  draw(canvas.getContext('2d'));
  const result=new THREE.CanvasTexture(canvas);
  result.colorSpace=THREE.SRGBColorSpace;
  return result;
}

function createDiscoveryPebble(){
  const geometry=new THREE.IcosahedronGeometry(1,2);
  const points=geometry.attributes.position;
  const colors=new Float32Array(points.count*3);
  const base=new THREE.Color('#a67449'),shoulder=new THREE.Color('#efbe69'),crown=new THREE.Color('#fff8d4');
  const pigment=new THREE.Color();
  for(let i=0;i<points.count;i++){
    const y=points.getY(i);
    const highlight=y-points.getX(i)*.16+points.getZ(i)*.18;
    pigment.copy(base).lerp(shoulder,smoothstep(y,-.25,.48)).lerp(crown,smoothstep(highlight,.48,.86));
    pigment.toArray(colors,i*3);
  }
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  geometry.scale(.118,.071,.088);
  const material=new THREE.MeshToonMaterial({
    name:'Lily discovery pebble',vertexColors:true,emissive:'#ffd382',emissiveIntensity:0,
  });
  // Mark the opaque pebble in the existing refraction buffer's alpha channel.
  material.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',
      '#include <opaque_fragment>\ngl_FragColor.a = 0.25;');
  };
  return new THREE.Mesh(geometry,material);
}

export function createPondLily(environment,info,groundHeight){
  const home=separateFarLeaf(environment,info.center[1]);
  if(!home)return null;
  home.y=info.height+.014;
  const approach=new THREE.Vector3(home.x-.44,info.height,home.z+.13);
  const pad=createPad();
  const stone=createDiscoveryPebble();
  const sx=home.x+.013,sz=home.z-.044;
  const ground=groundHeight?.(sx,sz)??info.height-.14;
  stone.position.set(sx,Math.min(info.height-.09,ground+.042),sz);
  stone.rotation.y=.60;

  const bubbleMap=texture(ctx=>{
    ctx.beginPath();ctx.arc(32,32,23,0,Math.PI*2);
    ctx.fillStyle='rgba(161, 223, 219, .18)';ctx.fill();
    ctx.strokeStyle='#edfdf3';ctx.lineWidth=4.5;ctx.stroke();
    ctx.beginPath();ctx.arc(23,21,5,0,Math.PI*2);
    ctx.fillStyle='#ffffff';ctx.fill();
  });
  const bubbles=Array.from({length:3},()=>new THREE.Sprite(new THREE.SpriteMaterial({map:bubbleMap,transparent:true,depthWrite:false})));
  const glintMap=texture(ctx=>{
    const halo=ctx.createRadialGradient(32,32,3,32,32,31);
    halo.addColorStop(0,'rgba(255, 221, 126, .52)');
    halo.addColorStop(1,'rgba(255, 221, 126, 0)');
    ctx.fillStyle=halo;ctx.fillRect(0,0,64,64);
    ctx.beginPath();
    for(const [x,y] of [[32,3],[39,24],[58,32],[39,40],[32,61],[25,40],[6,32],[25,24]])ctx.lineTo(x,y);
    ctx.closePath();
    ctx.lineJoin='round';ctx.lineWidth=3;ctx.strokeStyle='#dba548';ctx.stroke();
    ctx.fillStyle='#fffbe0';ctx.fill();
  });
  const surfaceGlints=new THREE.Group();
  const glints=STONE_GLINTS.map(()=>new THREE.Sprite(new THREE.SpriteMaterial({map:glintMap,transparent:true,depthWrite:false,toneMapped:false})));
  surfaceGlints.add(...glints);
  pad.traverse(o=>{o.raycast=()=>{};});
  for(const object of [stone,...glints,...bubbles])object.raycast=()=>{};
  environment.add(pad,stone,surfaceGlints,...bubbles);

  let time=0,opening=0,hold=0,revealAge=0;
  function reset(){
    time=opening=hold=revealAge=0;
    pad.position.copy(home);
    pad.rotation.set(0,-.36,0);
    stone.visible=false;
    stone.material.emissiveIntensity=0;
    for(const glint of glints)glint.visible=false;
    for(const bubble of bubbles)bubble.visible=false;
  }

  function update(delta,position,inWater){
    if(delta<=0)return;
    time+=delta;
    const distance=position&&inWater?Math.hypot(position.x-home.x,position.z-home.z):Infinity;
    hold=distance<(hold>0?.58:.50)?1.15:Math.max(0,hold-delta);
    opening=damp(opening,hold>0?1:0,hold>0?5.8:4,delta);
    pad.position.set(home.x-opening*.11,home.y+Math.sin(time*2.1)*.004,home.z-opening*.245);
    pad.rotation.set(.035*Math.sin(time*2.8)+.18*opening*(1-opening),-.36+opening*.49,.025*Math.cos(time*2.1));

    stone.visible=opening>.32;
    revealAge=opening>.56?revealAge+delta:0;
    const flash=revealAge%2.85;
    let shine=0;
    glints.forEach((glint,i)=>{
      const {x,z,height,size,delay,duration}=STONE_GLINTS[i];
      const progress=(flash-delay)/duration;
      glint.visible=revealAge>0&&progress>0&&progress<1;
      if(!glint.visible)return;
      const pulse=smoothstep(progress,0,.18)*(1-smoothstep(progress,.46,1));
      glint.material.opacity=pulse;
      glint.material.rotation=i===0?.12*progress:-.18;
      glint.scale.setScalar(size*(.55+.45*pulse));
      glint.position.set(sx+x+progress*.026,info.height+height+progress*.026,sz+z);
      shine=Math.max(shine,pulse*(i===0?1:.48));
    });
    stone.material.emissiveIntensity=.28+.70*shine;

    const hintAge=(time+BUBBLE_PERIOD-1.2)%BUBBLE_PERIOD;
    bubbles.forEach((bubble,i)=>{
      const age=hintAge-i*.15;
      bubble.visible=opening<.025&&hold===0&&age>=0&&age<.58;
      if(!bubble.visible)return;
      const rise=age/.58;
      bubble.position.set(home.x-.09+i*.042+rise*.025,info.height+.029+rise*.16,home.z+.069+i*.022);
      bubble.scale.setScalar(BUBBLE_SIZES[i]*(.74+rise*.29));
      bubble.material.opacity=.93*smoothstep(rise,0,.21)*(1-smoothstep(rise,.63,1));
    });
  }

  function swimTarget(point){
    // Leave room beside the pad so the swimmer doesn't cover the discovery.
    const nearHome=Math.hypot(point.x-home.x,point.z-home.z)<.20;
    const nearPad=Math.hypot(point.x-pad.position.x,point.z-pad.position.z)<.16;
    return nearHome||nearPad?approach:point;
  }

  reset();
  return {update,reset,swimTarget,surfaceGlints,debug:()=>({position:pad.position.toArray(),home:home.toArray(),opening,
    bubbles:bubbles.filter(b=>b.visible).length,pebble:stone.visible,glint:glints.some(glint=>glint.visible),
    glow:stone.visible?stone.material.emissiveIntensity:0})};
}
