import * as THREE from 'three';
import {createMeadowButterfly} from './garden-butterfly.js';

const CENTER_X=1.57;
const CENTER_Z=-4.46;
const LEAF_COLORS=['#4e8c3e','#64a447','#7eb94e'].map(hex=>new THREE.Color(hex));
const TUFT_LEAVES=[
  {angle:0, height:.45, width:.15, reach:.09, tone:2},
  {angle:1.3, height:.38, width:.14, reach:.13, tone:1},
  {angle:2.7, height:.34, width:.13, reach:.15, tone:0},
  {angle:3.9, height:.41, width:.15, reach:.12, tone:1},
  {angle:5.1, height:.30, width:.12, reach:.16, tone:0},
];

export function createCottageMeadow(groundHeight){
  const vertices=[],colors=[];
  function addLeaf(leaf){
    const dx=Math.cos(leaf.angle),dz=Math.sin(leaf.angle);
    const {height,width,reach}=leaf;
    const color=LEAF_COLORS[leaf.tone];
    function point(outward,up,across){
      return [dx*outward-dz*across,up,dz*outward+dx*across];
    }
    const points=[
      point(.015,0,-width*.20),
      point(.015,0,width*.20),
      point(reach*.47,height*.60,-width*.50),
      point(reach*.29,height*.60,0),
      point(reach*.47,height*.60,width*.50),
      point(reach,height,0),
    ];
    const tints=[.54,.57,.87,1,1.08,1.17];
    for(const index of [0,3,2,0,1,3,1,4,3,2,3,5,3,4,5]){
      vertices.push(...points[index]);
      const tint=tints[index];
      colors.push(color.r*tint,color.g*tint,color.b*tint);
    }
  }

  const tufts=[];
  // Offset rows give the patch a readable boundary and soften the two end rows.
  for(const [row,count] of [4,5,5,5,5,4].entries()){
    for(let column=0;column<count;column++){
      const offset=row%2===0?-.07:.07;
      const x=CENTER_X+(column-(count-1)/2)*.32+offset;
      const z=CENTER_Z+(row-2.5)*.31;
      const ground=groundHeight(x,z);
      if(ground===null)continue;
      const edge=column===0||column===count-1||count===4;
      const scale=(edge?.88:1)+((row+column*2)%3)*.045;
      tufts.push({position:new THREE.Vector3(x,ground-.006,z),scale:new THREE.Vector3().setScalar(scale),
        yaw:new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP,-(row+column)*1.13),bendX:0,bendZ:0});
    }
  }

  for(const leaf of TUFT_LEAVES)addLeaf(leaf);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.computeVertexNormals();
  const material=new THREE.MeshStandardMaterial({
    name:'Grass beside the cottage',vertexColors:true,side:THREE.DoubleSide,roughness:1,
  });
  const meadow=new THREE.InstancedMesh(geometry,material,tufts.length);
  meadow.name='Cottage Meadow';
  meadow.receiveShadow=true;
  meadow.raycast=()=>{};
  meadow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const axis=new THREE.Vector3(),tilt=new THREE.Quaternion(),matrix=new THREE.Matrix4();
  const previous=new THREE.Vector3();
  let hasPrevious=false,inside=false;
  const butterfly=createMeadowButterfly(groundHeight,CENTER_X,CENTER_Z);
  meadow.add(butterfly.object);

  function placeTuft(tuft,index){
    axis.set(tuft.bendZ,0,-tuft.bendX).normalize();
    tilt.setFromAxisAngle(axis,Math.hypot(tuft.bendX,tuft.bendZ)).multiply(tuft.yaw);
    meadow.setMatrixAt(index,matrix.compose(tuft.position,tilt,tuft.scale));
  }

  function reset(){
    for(const [i,tuft] of tufts.entries()){
      tuft.bendX=0;
      tuft.bendZ=0;
      placeTuft(tuft,i);
    }
    meadow.instanceMatrix.needsUpdate=true;
    inside=false;
    hasPrevious=false;
    butterfly.reset();
  }

  function update(delta,actor){
    if(delta<=0)return;
    const moving=hasPrevious&&Math.hypot(actor.x-previous.x,actor.z-previous.z)>.001;
    previous.copy(actor);
    hasPrevious=true;
    const near=Math.abs(actor.x-CENTER_X)<1.35&&Math.abs(actor.z-CENTER_Z)<1.47;
    inside=false;
    let changed=false;
    for(const [i,tuft] of tufts.entries()){
      if(!near&&tuft.bendX===0&&tuft.bendZ===0)continue;
      const dx=tuft.position.x-actor.x,dz=tuft.position.z-actor.z;
      const distance=Math.hypot(dx,dz);
      inside ||= distance<.23;
      const angle=.84*(1-THREE.MathUtils.smoothstep(distance,.18,.62));
      const outX=distance>.015?dx/distance:(i%2===0?1:-1);
      const outZ=distance>.015?dz/distance:0;
      const damping=angle>0?18:8;
      const x=THREE.MathUtils.damp(tuft.bendX,angle*outX,damping,delta);
      const z=THREE.MathUtils.damp(tuft.bendZ,angle*outZ,damping,delta);
      const bendX=Math.abs(x)<.001?0:x,bendZ=Math.abs(z)<.001?0:z;
      if(bendX===tuft.bendX&&bendZ===tuft.bendZ)continue;
      tuft.bendX=bendX;
      tuft.bendZ=bendZ;
      placeTuft(tuft,i);
      changed=true;
    }
    if(changed)meadow.instanceMatrix.needsUpdate=true;
    butterfly.update(delta,actor,inside&&moving,near);
  }

  reset();
  // Leave room in the culling bounds for the tufts to bend outward.
  meadow.computeBoundingSphere();
  meadow.boundingSphere.radius+=.45;
  return Object.assign(meadow,{update,reset,debug:()=>({inside,bentTufts:tufts.filter(t=>Math.hypot(t.bendX,t.bendZ)>.06).length,
    butterfly:butterfly.debug()})});
}
