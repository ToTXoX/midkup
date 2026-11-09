import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {gardenAction} from './garden-ui-helpers.mjs';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
const checks=[],errors=[];
const assertNoSelection=async page=>{
  await page.waitForFunction(()=>getSelection().isCollapsed&&getSelection().toString()==='');
};
try{
  for(const entry of ['','resources.html?clip=Run','resources.html?scene=garden']){
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:5173/'+entry,{waitUntil:'networkidle'});
    await page.waitForFunction(()=>window.__mudkipTest?.diagnostics.ready);
    await page.locator('#scene canvas').focus();
    for(const shortcut of ['Control+a','Meta+a']){await page.keyboard.press(shortcut);await assertNoSelection(page);}
    const title=await page.locator('h1').boundingBox();
    await page.mouse.click(title.x+8,title.y+8,{clickCount:3});
    const beforeOrbit=await page.evaluate(()=>window.__mudkipTest.camera().position);
    await page.mouse.move(title.x+8,title.y+8);await page.mouse.down();
    await page.mouse.move(1000,750,{steps:12});await page.mouse.up();await assertNoSelection(page);
    const afterOrbit=await page.evaluate(()=>window.__mudkipTest.camera().position);
    assert(Math.hypot(...afterOrbit.map((v,i)=>v-beforeOrbit[i]))>.05,'Preventing text selection must preserve camera dragging');
    await page.evaluate(()=>{
      const range=document.createRange();range.selectNodeContents(document.querySelector('#app'));
      getSelection().removeAllRanges();getSelection().addRange(range);
    });
    await assertNoSelection(page);
    const blocked=await page.evaluate(()=>({
      selection:!document.querySelector('h1').dispatchEvent(new Event('selectstart',{bubbles:true,cancelable:true})),
      drag:!document.querySelector('h1').dispatchEvent(new Event('dragstart',{bubbles:true,cancelable:true})),
    }));
    assert(blocked.selection&&blocked.drag);
    checks.push({entry:entry||'index.html',passed:true,checks:['Ctrl/Cmd+A','triple click and camera drag without selection','stale selection cleanup','native selection/drag prevention']});
    if(entry.includes('garden')){
      const toggle=page.locator('#garden-gait'),before=await toggle.getAttribute('aria-checked');
      await toggle.click();assert.notEqual(await toggle.getAttribute('aria-checked'),before);
      await gardenAction(page,'返回动作台');
    }
    const rate=page.locator('#rate'),before=await rate.inputValue();
    await rate.focus();await page.keyboard.press('ArrowRight');assert.notEqual(await rate.inputValue(),before);
    await page.locator('#timeline').focus();await page.keyboard.press('ArrowRight');
    assert((await page.evaluate(()=>window.__mudkipTest.snapshot())).paused);
    await page.locator('[data-clip="Walk"]').click();
    assert.equal(await page.locator('[data-clip][aria-pressed="true"]').count(),1);
    await page.evaluate(()=>{
      const fixture=document.createElement('div');fixture.id='selection-fixture';
      fixture.style.cssText='position:absolute;left:500px;top:120px;z-index:100;background:white;padding:12px';
      fixture.innerHTML='<input aria-label="输入测试" value="保留正常编辑"/><div contenteditable="true" aria-label="编辑测试"><span>可编辑内容</span></div><p data-selectable>可以复制的说明</p>';
      document.querySelector('#app').append(fixture);
    });
    const field=page.getByRole('textbox',{name:'输入测试'});await field.focus();await page.keyboard.press('Control+a');
    assert(await field.evaluate(el=>el.selectionStart===0&&el.selectionEnd===el.value.length));
    const editor=page.locator('[contenteditable="true"]');await editor.focus();await page.keyboard.press('Control+a');
    assert.equal(await page.evaluate(()=>getSelection().toString()),'可编辑内容');
    await page.keyboard.insertText('正常编辑');assert.equal(await editor.textContent(),'正常编辑');
    await page.evaluate(()=>getSelection().selectAllChildren(document.querySelector('[data-selectable]')));
    await page.waitForTimeout(30);assert.equal(await page.evaluate(()=>getSelection().toString()),'可以复制的说明');
    checks.push({entry:entry||'index.html',passed:true,checks:['button and slider keyboard input','single active animation button','text input Select All','contenteditable editing','explicitly selectable text']});
    await page.close();
  }
  assert.deepEqual(errors,[]);
  await fs.writeFile(new URL('../../docs/selection-guard-tests.json',import.meta.url),JSON.stringify({passed:true,checks,errors},null,2));
  console.log(JSON.stringify({checks,errors},null,2));
}finally{await browser.close();}
