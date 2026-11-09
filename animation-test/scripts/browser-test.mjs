import {gardenAction} from './garden-ui-helpers.mjs';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const url = process.env.TEST_URL ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-webgl', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const errors = [], warnings = [], checks = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); if (msg.type() === 'warning') warnings.push(msg.text()); });
page.on('requestfailed', (request) => errors.push(`Request failed: ${request.url()} ${request.failure()?.errorText}`));
const record = (name, details) => { checks.push({ name, passed: true, details }); console.log('PASS', name, details ?? ''); };
const snapshot = () => page.evaluate(() => window.__mudkipTest.snapshot());
try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__mudkipTest?.diagnostics.ready, { timeout: 30000 });
  const diagnostics = await page.evaluate(() => window.__mudkipTest.diagnostics);
  assert.deepEqual(diagnostics.clips.map((c) => c.name).sort(), ['Idle','PetReaction','Walk']);
  for (const [name,duration] of Object.entries({ Idle: 3, Walk: .8, PetReaction: 1.6 })) assert(Math.abs(diagnostics.clips.find((c)=>c.name===name).duration-duration)<.00001);
  assert(diagnostics.bones.every((n) => n === 25));
  assert.equal(diagnostics.textures.length, 2);
  assert(diagnostics.textures.every((t) => t.width > 0 && t.height > 0 && t.colorSpace === 'srgb'));
  record('GLB clips, skeleton and embedded textures load in Three.js', diagnostics);
  await page.screenshot({ path: new URL('../../renders/threejs-animation-test.png', import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'), fullPage: true });

  const samples = await page.evaluate(() => {
    const api = window.__mudkipTest;
    const result = {};
    api.resetPosition();
    for (const clip of api.diagnostics.clips) {
      const first = api.sample(clip.name, 0);
      const middle = api.sample(clip.name, clip.duration * .5);
      const end = api.sample(clip.name, clip.duration - 1e-6);
      const delta = (a,b) => Math.max(...a.map((v,i) => Math.abs(v-b[i])));
      result[clip.name] = { deform: delta(first.positions,middle.positions), seam: delta(first.positions,end.positions), horizontalRoot: Math.max(...[first,middle,end].map((s) => Math.hypot(s.rootPosition[0],s.rootPosition[2]))), maxCoordinate: Math.max(...middle.positions.map(Math.abs)) };
    }
    const a = api.sample('Walk', .04).feet.find((f) => f.name === 'LHand').position;
    const b = api.sample('Walk', .14).feet.find((f) => f.name === 'LHand').position;
    result.walkContact = { delta: b.map((v,i)=>v-a[i]), expectedTravel: .13 / (.8*.62) * .10 };
    return result;
  });
  for (const name of ['Idle','Walk','PetReaction']) {
    assert(samples[name].deform > .001, `${name} must deform the mesh`);
    assert(samples[name].seam < .0001, `${name} must return to its start pose`);
    assert(samples[name].horizontalRoot < .00001, `${name} must stay in place`);
    assert(samples[name].maxCoordinate < 2, `${name} must not explode`);
  }
  assert(Math.abs(samples.walkContact.delta[2] + samples.walkContact.expectedTravel) < .0001, 'stance feet must match runtime forward velocity');
  assert(Math.abs(samples.walkContact.delta[1]) < .0001, 'stance foot must stay at ground height');
  record('Exported skin deformation, loop seams, root motion and foot contact', samples);

  await page.getByRole('button', { name: '走路 小步慢走' }).click();
  await page.waitForTimeout(400);
  assert.equal((await snapshot()).clip, 'Walk');
  assert((await snapshot()).actions.find((a)=>a.name==='Walk').weight > .99);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const pausedTime = (await snapshot()).time;
  await page.waitForTimeout(250);
  assert.equal((await snapshot()).time, pausedTime);
  await page.locator('#timeline').evaluate((el) => { el.value='500'; el.dispatchEvent(new Event('input', { bubbles:true })); });
  assert(Math.abs((await snapshot()).time - .4) < .001);
  await page.getByRole('button', { name: '继续', exact: true }).click();
  record('Action buttons, 220 ms crossfade, pause, scrub and resume');

  for (let i=0;i<12;i++) {
    await page.evaluate((name) => window.__mudkipTest.play(name), ['Idle','Walk','PetReaction'][i%3]);
    await page.waitForTimeout(35);
  }
  await page.evaluate(() => window.__mudkipTest.play('Walk'));
  await page.waitForTimeout(400);
  const stress = await snapshot();
  assert(stress.actions.find((a) => a.name === 'Walk').weight > .99);
  assert(stress.actions.filter((a)=>a.name!=='Walk').every((a)=>a.weight < .001));
  record('Rapid action switching settles to one active clip', stress.actions);

  await page.evaluate(() => { window.__mudkipTest.resetPosition(); window.__mudkipTest.play('Idle', true); });
  await page.waitForTimeout(100);
  const point = await page.evaluate(() => window.__mudkipTest.project(0,.55,.14));
  await page.mouse.click(point.x, point.y);
  assert.equal((await snapshot()).clip, 'PetReaction');
  assert.equal((await snapshot()).hearts, 3);
  await page.waitForTimeout(2100);
  assert.equal((await snapshot()).clip, 'Idle');
  assert.equal((await snapshot()).hearts, 0);
  record('Clicking the rendered character plays one reaction, emits hearts and returns to Idle');

  await page.locator('#movement').check();
  await page.waitForTimeout(3300);
  const moved = await snapshot();
  assert.equal(moved.clip, 'Idle');
  assert.equal(moved.target, null);
  assert(Math.hypot(moved.position[0]-.6,moved.position[2]+.3) < .02);
  record('Runtime movement reaches its destination and returns to Idle', moved.position);
  await page.locator('#rate').evaluate((el) => { el.value='1.5'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.equal((await snapshot()).rate, 1.5);
  await page.evaluate(() => window.__mudkipTest.moveTo(-.5, -.3));
  await page.waitForTimeout(800);
  const fast = await snapshot();
  assert(fast.position[0] < moved.position[0]-.20);
  record('Walk cadence control also changes runtime travel speed', fast.position);

  await page.evaluate(() => { window.__mudkipTest.resetPosition(); window.__mudkipTest.play('Idle', true); });
  await page.waitForTimeout(100);
  const groundPoint = await page.evaluate(() => window.__mudkipTest.project(.8,0,.5));
  await page.mouse.click(groundPoint.x, groundPoint.y);
  const clicked = await snapshot();
  assert.equal(clicked.clip, 'Walk');
  assert(Math.hypot(clicked.target[0]-.8, clicked.target[2]-.5)<.001);
  record('Clicking the rendered ground selects a world-space movement destination', clicked.target);

  await page.evaluate(() => { window.__mudkipTest.resetPosition(); window.__mudkipTest.play('Idle', true); });
  await page.locator('#movement').uncheck();
  await page.locator('#rate').evaluate((el) => { el.value='1'; el.dispatchEvent(new Event('input',{bubbles:true})); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: new URL('../../renders/threejs-animation-test.png', import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await gardenAction(page,'重置视角');
  await page.waitForTimeout(350);
  const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, controlBounds: document.querySelector('.controls').getBoundingClientRect().toJSON() }));
  assert(layout.scrollWidth <= layout.width);
  assert(layout.controlBounds.x >= 0 && layout.controlBounds.right <= layout.width);
  await page.screenshot({ path: new URL('../../renders/threejs-animation-mobile.png', import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'), fullPage: true });
  record('Desktop and 390 px mobile viewport render without overflow', layout);
  assert.deepEqual(errors, []);
  record('No browser script, WebGL or network errors');
  await fs.writeFile(new URL('../../docs/threejs-test-results.json', import.meta.url), JSON.stringify({ url, timestamp: new Date().toISOString(), browser: await browser.version(), diagnostics, checks, errors, warnings }, null, 2));
} finally {
  await browser.close();
}
