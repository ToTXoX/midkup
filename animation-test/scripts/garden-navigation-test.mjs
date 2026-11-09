import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createGardenNavigation,createGardenWalker} from '../src/garden-navigation.js';
const fixture=(colliders)=>({colliders,targets:[],walkableBounds:{min:[-5,-5],max:[5,5]}});
const wall={id:'wall',type:'box',min:[-.08,0,-2],max:[.08,2,2]};
const nav=createGardenNavigation(fixture([wall]));
assert(!nav.segmentClear({x:-2,z:0},{x:2,z:0}),'a thin wall must block the full swept segment');
const route=nav.plan({x:-2,z:0},{x:2,z:0});
assert(route.ok&&!route.adjusted&&route.waypoints.length>1);
assert(route.length>6,'route must go around a wall end');
const walker=createGardenWalker(nav);walker.start({x:-2,z:0},{x:2,z:0});
const instant=walker.advance({x:-2,z:0},100);
assert(instant.finished&&!instant.blocked&&Math.abs(instant.position.x-2)<1e-7&&Math.abs(instant.position.z)<1e-7);
assert(nav.plan({x:-2,z:0},{x:0,z:0}).adjusted,'an occupied destination must move to reachable ground');
const island=createGardenNavigation(fixture([{id:'partition',type:'box',min:[-.08,0,-5],max:[.08,2,5]}]));
const unreachable=island.plan({x:-2,z:0},{x:2,z:0});
assert(unreachable.adjusted&&unreachable.goal.x<-.4,'a disconnected goal must resolve on the reachable side');
assert(!nav.plan({x:NaN,z:0},{x:2,z:0}).ok);

const layout=JSON.parse(await fs.readFile(new URL('../../game-assets/levels/garden.json',import.meta.url)));
const actual=createGardenNavigation(layout),spawn={x:layout.spawn.position[0],z:layout.spawn.position[2]};
const destinations=[{x:-1.3,z:-4.8},{x:3.53,z:.32},{x:-3.79,z:-5.77},{x:1.63,z:-1.84},{x:15,z:15},{x:2,z:-4},{x:-3,z:1}];
// Independently test the swept body circle against original geometry, not grid cells.
function bodyIsSafe(p){
  const radius=actual.settings.actorRadius;
  for(const c of layout.colliders){
    if(c.type==='circle')assert(Math.hypot(p.x-c.center[0],p.z-c.center[1])>=radius+c.radius-1e-5,`body encloses ${c.id}`);
    if(c.type==='box')assert(Math.hypot(Math.max(c.min[0]-p.x,0,p.x-c.max[0]),Math.max(c.min[2]-p.z,0,p.z-c.max[2]))>=radius-1e-5,`body overlaps ${c.id}`);
  }
  for(let i=0;i<48;i++){
    const a=i*Math.PI*2/48,x=p.x+radius*Math.cos(a),z=p.z+radius*Math.sin(a);
    assert(x>=layout.walkableBounds.min[0]-1e-6&&x<=layout.walkableBounds.max[0]+1e-6);
    assert(z>=layout.walkableBounds.min[1]-1e-6&&z<=layout.walkableBounds.max[1]+1e-6);
    for(const c of layout.colliders){
      if(c.type==='box')assert(!(x>c.min[0]&&x<c.max[0]&&z>c.min[2]&&z<c.max[2]),`body intersects ${c.id}`);
      if(c.type==='circle')assert(Math.hypot(x-c.center[0],z-c.center[1])>=c.radius-1e-5,`body intersects ${c.id}`);
      if(c.type==='ellipse')assert(((x-c.center[0])/c.radii[0])**2+((z-c.center[1])/c.radii[1])**2>=1-1e-5,'body intersects pond');
    }
  }
}
const checks=[];
for(const goal of destinations){
  const follower=createGardenWalker(actual),plan=follower.start(spawn,goal);assert(plan.ok);
  let p={...spawn},steps=0;
  while(follower.active&&steps++<10000){const result=follower.advance(p,[.009,.07,.4,2.5][steps%4]);assert(!result.blocked);p=result.position;bodyIsSafe(p);}
  assert(!follower.active&&Math.hypot(p.x-plan.goal.x,p.z-plan.goal.z)<1e-6);
  checks.push({goal,adjusted:plan.adjusted,waypoints:plan.waypoints.length,length:plan.length});
}
let seed=17,position=spawn;
for(let i=0;i<100;i++){
  seed=(seed*1664525+1013904223)>>>0;const x=-5+(seed/2**32)*10;
  seed=(seed*1664525+1013904223)>>>0;const z=-7+(seed/2**32)*12;
  const follower=createGardenWalker(actual),plan=follower.start(position,{x,z});
  if(!plan.ok)continue;
  for(let frame=0;frame<20&&follower.active;frame++){
    const next=follower.advance(position,.08);assert(!next.blocked);position=next.position;bodyIsSafe(position);
  }
  follower.cancel();
}
console.log('PASS thin walls, rounded obstacle clearance, A* detours, unreachable destinations, long frame steps and 100 retargets',JSON.stringify({navigation:actual.debug(),checks}));
