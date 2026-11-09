// Keep browser text selection out of the game without cancelling pointer
// defaults: controls still need native focus, slider and dropdown behaviour.
export function preventGameSelection(root){
  if(!root)return;
  const doc=root.ownerDocument,win=doc.defaultView;
  const element=node=>node?.nodeType===1?node:node?.parentElement;
  function selectable(node){
    const el=element(node);
    if(!el)return null;
    if(el.isContentEditable)return el.closest('[contenteditable]');
    const field=el.closest('textarea,input,select');
    if(field&&(field.tagName!=='INPUT'||['text','search','url','email','tel','password','number'].includes(field.type)))return field;
    return el.closest('[data-selectable]');
  }
  const inGame=node=>{
    const el=element(node);
    return el&&(root.contains(el)||el===doc.body||el===doc.documentElement);
  };
  function clearGameSelection(){
    const selection=win.getSelection();
    if(!selection||selection.isCollapsed)return;
    const allowed=selectable(selection.anchorNode);
    if(allowed&&allowed===selectable(selection.focusNode))return;
    for(let i=0;i<selection.rangeCount;i++){
      if(selection.getRangeAt(i).intersectsNode(root)){
        selection.removeAllRanges();return;
      }
    }
  }
  function blockSelection(event){
    // Canvas gestures belong to OrbitControls. CSS and selectionchange still
    // prevent text highlights without cancelling the canvas's native events.
    if(element(event.target)?.closest('#scene'))return;
    if(inGame(event.target)&&!selectable(event.target))event.preventDefault();
  }
  doc.addEventListener('selectstart',blockSelection);
  doc.addEventListener('dragstart',blockSelection);
  doc.addEventListener('pointerdown',event=>{
    if(inGame(event.target)&&!selectable(event.target))clearGameSelection();
  },true);
  doc.addEventListener('keydown',event=>{
    if((event.ctrlKey||event.metaKey)&&!event.shiftKey&&!event.altKey
      &&(event.code==='KeyA'||event.key?.toLowerCase()==='a')
      &&inGame(event.target)&&!selectable(event.target)){
      event.preventDefault();clearGameSelection();
    }
  },true);
  doc.addEventListener('selectionchange',clearGameSelection);
  win.addEventListener('focus',clearGameSelection);
  clearGameSelection();
}
