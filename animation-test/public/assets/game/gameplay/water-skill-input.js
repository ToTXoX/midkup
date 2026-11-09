// One pointer gesture for mouse, pen and touch. No timer or long-press mode.
export function createWaterSkillInput({button,canStart,onStart,onDrag,onRelease,onCancel,onTap}){
  let gesture=null;
  function end(cancelled=false){
    if(!gesture)return;
    const previous=gesture;gesture=null;
    if(button.hasPointerCapture?.(previous.id))button.releasePointerCapture(previous.id);
    if(cancelled)onCancel();else onRelease({dragging:previous.dragging});
  }
  button.addEventListener('pointerdown',event=>{
    if(gesture||event.isPrimary===false||event.button!==0||!canStart())return;
    event.preventDefault();event.stopPropagation();
    gesture={id:event.pointerId,x:event.clientX,y:event.clientY,dragging:false,dx:0,dy:0};
    button.setPointerCapture(event.pointerId);onStart();
  });
  button.addEventListener('pointermove',event=>{
    if(!gesture||gesture.id!==event.pointerId)return;
    event.preventDefault();
    const x=event.clientX-gesture.x,y=event.clientY-gesture.y;
    if(Math.hypot(x,y)<8)return;
    gesture.dragging=true;gesture.dx=x;gesture.dy=y;onDrag({x,y});
  });
  // Finish even when the release is delivered outside the captured button.
  window.addEventListener('pointerup',event=>{if(gesture?.id===event.pointerId){event.preventDefault();end();}},true);
  window.addEventListener('pointercancel',event=>{if(gesture?.id===event.pointerId)end(true);},true);
  button.addEventListener('lostpointercapture',()=>end(true));
  // Embedded browsers can lose both release and capture-loss events. A hover
  // with no pressed mouse/pen button, or a fresh primary gesture elsewhere,
  // must release the aim lock instead of leaving the camera disabled.
  window.addEventListener('pointermove',event=>{
    if(gesture?.id===event.pointerId&&['mouse','pen'].includes(event.pointerType)&&event.buttons===0)end(true);
  },true);
  document.addEventListener('pointerdown',event=>{
    if(gesture&&event.isPrimary&&event.button===0&&!button.contains(event.target))end(true);
  },true);
  button.addEventListener('click',event=>{if(!gesture&&event.detail===0&&canStart())onTap();});
  button.addEventListener('contextmenu',event=>event.preventDefault());
  window.addEventListener('blur',()=>end(true));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)end(true);});
  return {cancel:()=>end(true),debug:()=>({active:!!gesture,dragging:gesture?.dragging??false,offset:gesture?[gesture.dx,gesture.dy]:[0,0]})};
}
