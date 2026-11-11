import * as THREE from 'three';

export function createTargetFeedback(records){
  let total=0;
  const entries=records.map(record=>{
    const pivot=new THREE.Group();pivot.position.y=.145;record.object.add(pivot);
    record.object.updateMatrixWorld(true);
    // Leave the base on the ground; the board and post bend above it.
    for(const mesh of [...record.object.children])if(mesh.isMesh&&!/pedestal|shield badge/i.test(mesh.name))pivot.attach(mesh);
    const flash=new THREE.Group();flash.position.fromArray(record.hit.center);flash.position.z=.105;
    const material=new THREE.MeshBasicMaterial({color:'#f0fff5',transparent:true,opacity:0,depthWrite:false,toneMapped:false,side:THREE.DoubleSide});
    material.userData.outlineParameters={visible:false};
    const ring=new THREE.Mesh(new THREE.RingGeometry(.91,1,48),material);flash.add(ring);
    const geometry=new THREE.PlaneGeometry(.035,.11);
    const sparks=Array.from({length:4},(_,i)=>{const mesh=new THREE.Mesh(geometry,material);mesh.rotation.z=-i*Math.PI/2;flash.add(mesh);return mesh;});
    flash.traverse(o=>{o.userData.combatDecoration=true;});record.object.add(flash);flash.visible=false;
    return {record,pivot,flash,ring,sparks,material,age:10,hits:0,kind:'water',hold:0,direction:new THREE.Vector3()};
  });
  return {
    hit(id,{kind='water',direction,hold=0}={}){
      const e=entries.find(e=>e.record.id===id);if(!e)return null;
      e.age=0;e.hits++;total++;e.kind=kind;e.hold=hold;
      if(direction)e.direction.copy(direction);else e.direction.set(0,0,-1);
      return {id,hits:e.hits,total};
    },
    reset(){total=0;entries.forEach(e=>{e.age=10;e.hits=0;e.pivot.rotation.set(0,0,0);e.flash.visible=false;});},
    update(delta){for(const e of entries){
      e.age+=delta;
      const t=Math.max(0,e.age-e.hold),envelope=Math.exp(-7*t),strength=e.record.id==='heavy'?.10:.24;
      const water=e.kind==='water',force=water?1.48:e.kind==='tackle'?1.7:e.kind==='basketball'?1.2:.50;
      const swing=t<.8?force*strength*Math.sin((water?23:19)*t)*envelope:0;
      e.pivot.rotation.x=e.direction.z*swing;
      e.pivot.rotation.z=-e.direction.x*swing;
      e.flash.visible=e.kind==='water'&&t<.33;
      if(e.flash.visible){const u=t/.33,radius=e.record.hit.radius*(.8+u*.65);e.ring.scale.setScalar(radius);e.material.opacity=.9*(1-u)**1.4;e.sparks.forEach((mesh,i)=>{const a=i*Math.PI/2+.4;mesh.position.set(Math.sin(a)*radius*1.18,Math.cos(a)*radius*1.18,0);mesh.rotation.z=-a;mesh.scale.setScalar(1-u*.7);});}
    }},
    debug:()=>({total,targets:entries.map(e=>({id:e.record.id,hits:e.hits,age:e.age,kind:e.kind,tilt:e.pivot.rotation.x,flash:e.flash.visible}))}),
  };
}
