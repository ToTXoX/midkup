// Reuse the expressions already present in the embedded eye atlas.
// Sampling the timeline also handles seeking, pausing and interrupted clips.
export function createEyeExpressions(model,definition){
  const maps=new Map();
  model.traverse(object=>{
    if(!object.isMesh)return;
    for(const material of [].concat(object.material)){
      if(!/eye/i.test(material.name)||!material.map||maps.has(material.map.uuid))continue;
      const texture=material.map;maps.set(texture.uuid,{texture,base:texture.offset.clone()});
    }
  });
  let state='open';
  function update(clip,time){
    const interval=definition?.tracks?.[clip]?.find(frame=>time>=frame.start&&time<frame.end);
    state=interval?.state??'open';
    const offset=definition?.states?.[state]?.uvOffset??[0,0];
    for(const {texture,base} of maps.values()){
      texture.offset.set(base.x+offset[0],base.y+offset[1]);texture.updateMatrix();
    }
  }
  return {update,debug:()=>({state,maps:maps.size,offsets:[...maps.values()].map(({texture})=>texture.offset.toArray())})};
}
