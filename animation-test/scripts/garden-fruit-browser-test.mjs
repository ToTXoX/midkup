import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

const browser = await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport:{width:1440,height:1000},hasTouch:true});
const errors = [];
page.on('pageerror',error=>errors.push(error.message));

const read = () => page.evaluate(() => {
  const game = window.__mudkipTest;
  return {...game.orchard(), character:game.snapshot(), combat:game.combat(), meal:game.basket(), food:game.foodContact()};
});
const tick = seconds => page.evaluate(seconds=>window.__mudkipTest.advanceMovement(seconds),seconds);
const startBite = () => page.evaluate(() => {
  const game = window.__mudkipTest;
  for(let i=0;i<420&&game.snapshot().clip!=='Eat';i++)game.advanceMovement(.025);
});
const moveTo = async (x,z) => {
  const plan = await page.evaluate(([x,z])=>window.__mudkipTest.moveTo(x,z),[x,z]);
  assert(plan.ok&&!plan.adjusted);
  await tick(10);
};
async function projectPoint(point) {
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  return page.evaluate(point=>window.__mudkipTest.project(...point),point);
}
async function tapPoint(point, offset=0) {
  const p = await projectPoint(point);
  await page.touchscreen.tap(p.x+offset,p.y);
}
async function tapFruit(id, offset=0) {
  const fruit = (await read()).fruits.find(f=>f.id===id);
  await tapPoint(fruit.point,offset);
}

try {
  await page.goto('http://127.0.0.1:5173/resources.html?scene=garden',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.body.classList.contains('garden-active')&&window.__mudkipTest?.diagnostics.ready);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert((await read()).fruits.every(f=>f.phase==='hanging'&&!f.pickupCue));

  for(const [tree,type,x,z] of [['apple-tree','apple',-2.62,-.94],['orange-tree','orange',2.10,-.90]]){
    if(type==='orange')await page.setViewportSize({width:390,height:844});
    await moveTo(x,z);
    if(type==='apple')await tapPoint([-4,.995,-2.77]);
    else await tapFruit(tree+'-2');
    const locked = (await read()).combat;
    assert.equal(locked.targetId,tree,JSON.stringify(locked));
    assert(locked.assessment.reachable&&locked.assessment.clear,JSON.stringify(locked.assessment));
    await page.locator('#garden-fire').tap();
    assert((await read()).fruits.filter(f=>f.treeId===tree).every(f=>f.phase==='hanging'));
    await tick(2.2);
    const hit = await read();
    assert.equal(hit.combat.lastContact.targetId,tree);
    assert.equal(hit.combat.feedback.total,0);
    assert.equal(hit.combat.targetId,null);
    assert(hit.fruits.filter(f=>f.treeId===tree).every(f=>f.phase==='ground'&&f.pickupCue));
    const viewBefore=await page.evaluate(()=>window.__mudkipTest.camera());

    if(type==='apple'){
      const p=await projectPoint(hit.fruits.find(f=>f.id===tree+'-2').point);
      await page.mouse.move(p.x+10,p.y);
      assert.equal(await page.locator('#scene canvas').evaluate(el=>el.style.cursor),'pointer');
      await page.mouse.click(p.x+10,p.y);
    }else await tapFruit(tree+'-2',6);
    assert.equal((await read()).meal.interaction?.fruitId,tree+'-2',await page.locator('#garden-feedback').textContent());
    await startBite();
    const bite = await read();
    assert.equal(bite.character.clip,'Eat');
    assert.equal(bite.mealType,type);
    assert(bite.food.visible&&bite.food.separation>=.0039&&bite.food.scale<.75);
    const view=await page.evaluate(()=>{
      const game=window.__mudkipTest;
      const [x,,z]=game.snapshot().position,[cx,,cz]=game.camera().position,[dx,,dz]=game.facing();
      return {camera:game.camera(),facing:((cx-x)*dx+(cz-z)*dz)/Math.hypot(cx-x,cz-z)};
    });
    assert.deepEqual(view.camera,viewBefore);
    assert(view.facing>.28,'Mudkip should keep its face visible when eating fruit from the ground');
    await tick(3);
    const eaten=(await read()).fruits.find(f=>f.id===tree+'-2');
    assert(eaten.phase==='eaten'&&!eaten.pickupCue);
    console.log('PASS water contact, pickup cue, off-center selection and eating for',tree);
    if(type==='apple'){
      await tapFruit(tree+'-1');
      assert.equal((await read()).meal.interaction?.fruitId,tree+'-1','The next apple should be selectable from the same view');
      await startBite();
      assert.equal((await read()).fruits.find(f=>f.id===tree+'-1').phase,'in-meal');
      await page.evaluate(()=>window.__mudkipTest.play('Idle'));
      assert.equal((await read()).fruits.find(f=>f.id===tree+'-1').phase,'ground');
      for(const index of [1,3]){
        await tapFruit(tree+'-'+index);
        await startBite();
        assert.equal((await read()).meal.interaction?.fruitId,tree+'-'+index);
        await tick(3);
      }
      await tick(24);
      assert((await read()).fruits.filter(f=>f.treeId===tree).every(f=>f.phase==='hanging'));
      console.log('PASS a fruit returns when interrupted before the bite and the tree restocks after harvest');
    }
  }

  const basket = page.getByRole('button',{name:'去果篮吃果子',exact:true});
  for(const type of ['berry','apple','orange','plum']){
    await basket.tap();
    await startBite();
    const bite = await read();
    assert.equal(bite.mealType,type);
    assert(bite.food.visible&&bite.food.separation>=.0039);
    await tick(3);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS basket rotates all four foods and the mouth contact stays clear');
} finally {
  await browser.close();
}
