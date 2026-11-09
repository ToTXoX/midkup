import * as THREE from 'three';

export function createDestinationMarker(scene){
  const root=new THREE.Group();root.name='Destination marker';root.visible=false;scene.add(root);
  const flat=new THREE.Group();flat.rotation.x=-Math.PI/2;root.add(flat);
  const material=(color,opacity=1)=>{
    const m=new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,depthTest:false,side:THREE.DoubleSide,toneMapped:false,fog:false});
    m.userData.outlineParameters={visible:false};return m;
  };
  const mint=material('#3BBA92'),white=material('#FFFFEF'),soft=material('#6AD5AE',.12),rippleMaterial=material('#FFFFEF',.7);
  const plate=new THREE.Mesh(new THREE.CircleGeometry(.98,64),soft);
  const border=new THREE.Mesh(new THREE.RingGeometry(.66,1.12,64),white);
  const ring=new THREE.Mesh(new THREE.RingGeometry(.74,1.02,64),mint);
  const dot=new THREE.Mesh(new THREE.CircleGeometry(.13,24),mint);
  const ripple=new THREE.Mesh(new THREE.RingGeometry(.98,1.045,64),rippleMaterial);
  flat.add(plate,border,ring,dot,ripple);
  [plate,border,ring,dot,ripple].forEach((o,i)=>{o.renderOrder=20+i;o.position.z=i*.001;});
  let age=0,phase='idle',radius=0,pixelWidth=0;
  const cameraPoint=new THREE.Vector3();
  const outlinePoint=new THREE.Vector3();
  const easeOut=(x)=>1-(1-x)**3;
  return {
    show(position){root.position.copy(position);age=0;phase='spawn';root.visible=true;},
    hide(){root.visible=false;phase='idle';},
    arrive(){if(root.visible){phase='arrive';age=0;}},
    update(delta,camera,height){
      if(!root.visible)return;
      age+=delta;
      if(phase==='arrive'&&age>=.28){root.visible=false;phase='idle';return;}
      if(phase==='spawn'&&age>.24)phase='hold';
      camera.updateMatrixWorld();
      const depth=-cameraPoint.copy(root.position).applyMatrix4(camera.matrixWorldInverse).z;
      const worldPerPixel=2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*depth/height;
      const opening=.6+.4*easeOut(Math.min(1,age/.18));
      const breathing=1+.045*Math.sin(age*Math.PI*2*1.1);
      const progress=phase==='arrive'?Math.min(1,age/.28):0;
      const scale=phase==='arrive'?1-.25*progress:phase==='spawn'?opening:breathing;
      radius=18*worldPerPixel;root.scale.setScalar(radius*scale);
      mint.opacity=white.opacity=1-progress;
      soft.opacity=.12*(1-progress);
      ripple.visible=phase!=='arrive'&&age<.5;
      ripple.scale.setScalar(1+easeOut(Math.min(1,age/.5))*.9);
      rippleMaterial.opacity=.65*(1-Math.min(1,age/.5))**2;
      root.updateMatrixWorld(true);
      let left=Infinity,right=-Infinity;
      for(let i=0;i<12;i++){
        const angle=i*Math.PI/6;
        outlinePoint.set(Math.cos(angle)*1.12,Math.sin(angle)*1.12,0).applyMatrix4(flat.matrixWorld).project(camera);
        const x=(outlinePoint.x+1)*camera.aspect*height/2;left=Math.min(left,x);right=Math.max(right,x);
      }
      pixelWidth=right-left;
    },
    debug:()=>({visible:root.visible,phase,age,worldRadius:radius,nominalDiameterPixels:36,pixelWidth,position:root.position.toArray()}),
    dispose(){scene.remove(root);flat.children.forEach(o=>o.geometry.dispose());new Set([mint,white,soft,rippleMaterial]).forEach(m=>m.dispose());},
  };
}
