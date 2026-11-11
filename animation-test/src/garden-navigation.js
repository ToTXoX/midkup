// Ground-plane navigation. All dimensions are meters, with +Z forward.
const EPS=1e-9;
const point=(p)=>Array.isArray(p)?{x:p[0],z:p[1]}:{x:p.x,z:p.z};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const cross=(ax,az,bx,bz)=>ax*bz-az*bx;
function pointSegmentSquared(p,a,b){
  const x=b.x-a.x,z=b.z-a.z,length=x*x+z*z;
  const t=length?Math.max(0,Math.min(1,((p.x-a.x)*x+(p.z-a.z)*z)/length)):0;
  return (p.x-a.x-x*t)**2+(p.z-a.z-z*t)**2;
}
function segmentSquared(a,b,c,d){
  const ax=b.x-a.x,az=b.z-a.z,bx=d.x-c.x,bz=d.z-c.z;
  const denominator=cross(ax,az,bx,bz);
  if(Math.abs(denominator)>EPS){
    const t=cross(c.x-a.x,c.z-a.z,bx,bz)/denominator;
    const u=cross(c.x-a.x,c.z-a.z,ax,az)/denominator;
    if(t>=0&&t<=1&&u>=0&&u<=1)return 0;
  }
  return Math.min(pointSegmentSquared(a,c,d),pointSegmentSquared(b,c,d),pointSegmentSquared(c,a,b),pointSegmentSquared(d,a,b));
}
function inside(p,polygon){
  let positive=false,negative=false;
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length];
    const side=cross(b.x-a.x,b.z-a.z,p.x-a.x,p.z-a.z);
    positive ||= side>EPS;negative ||= side<-EPS;
    if(positive&&negative)return false;
  }
  return true;
}
class MinHeap{
  values=[];
  push(id,score){
    const item={id,score},array=this.values;let i=array.length;array.push(item);
    while(i){const parent=(i-1)>>1;if(array[parent].score<=score)break;array[i]=array[parent];i=parent;}array[i]=item;
  }
  pop(){
    const array=this.values,first=array[0],last=array.pop();
    if(array.length){let i=0;while(i*2+1<array.length){let child=i*2+1;if(child+1<array.length&&array[child+1].score<array[child].score)child++;if(array[child].score>=last.score)break;array[i]=array[child];i=child;}array[i]=last;}
    return first;
  }
}
function obstacle(collider,radius,skin,shore){
  const padding=radius+skin+(collider.id==='pond'?shore:0);
  if(collider.type==='circle')return {id:collider.id,center:point(collider.center),radius:collider.radius+padding};
  if(collider.type==='capsule')return {id:collider.id,start:point(collider.start),end:point(collider.end),radius:collider.radius+padding};
  let polygon;
  if(collider.type==='box'){
    const [x,,z]=collider.min,[right,,bottom]=collider.max;
    polygon=[{x,z},{x:right,z},{x:right,z:bottom},{x,z:bottom}];
  }else if(collider.type==='ellipse'){
    // An affine transform of a circumscribed polygon fully encloses the pond.
    const count=48,outward=1/Math.cos(Math.PI/count),center=point(collider.center);
    polygon=Array.from({length:count},(_,i)=>({x:center.x+collider.radii[0]*outward*Math.cos(i*Math.PI*2/count),z:center.z+collider.radii[1]*outward*Math.sin(i*Math.PI*2/count)}));
  }else throw new Error(`Unsupported garden collider: ${collider.type}`);
  return {id:collider.id,polygon,padding,minX:Math.min(...polygon.map(p=>p.x))-padding,maxX:Math.max(...polygon.map(p=>p.x))+padding,minZ:Math.min(...polygon.map(p=>p.z))-padding,maxZ:Math.max(...polygon.map(p=>p.z))+padding};
}

export function createGardenNavigation(layout,{extraColliders=[],...options}={}){
  const settings={actorRadius:.4,skin:.04,cellSize:.16,pondShore:.12,...layout.navigation,...options};
  const radius=settings.actorRadius,skin=settings.skin;
  const bounds={minX:layout.walkableBounds.min[0]+radius+skin,maxX:layout.walkableBounds.max[0]-radius-skin,minZ:layout.walkableBounds.min[1]+radius+skin,maxZ:layout.walkableBounds.max[1]-radius-skin};
  const targets=(layout.targets??[]).map(t=>({id:`target-${t.id}`,type:'circle',center:[t.position[0],t.position[2]],radius:Math.max(.18,t.hit.radius)}));
  const shapes=[...layout.colliders,...targets,...extraColliders].map(c=>obstacle(c,radius,skin,settings.pondShore));
  const fixedShapeCount=shapes.length;
  let revision=0;
  function inBounds(p,extra){return p.x>=bounds.minX+extra-EPS&&p.x<=bounds.maxX-extra+EPS&&p.z>=bounds.minZ+extra-EPS&&p.z<=bounds.maxZ-extra+EPS;}
  function segmentBlocker(first,last,extra=0,ignoreId=null){
    const a=point(first),b=point(last);
    if(![a.x,a.z,b.x,b.z].every(Number.isFinite)||!inBounds(a,extra))return 'boundary';
    for(const shape of shapes){
      if(shape.id===ignoreId)continue;
      if(shape.center){if(pointSegmentSquared(shape.center,a,b)<(shape.radius+extra)**2-EPS)return shape.id;continue;}
      if(shape.start){if(segmentSquared(a,b,shape.start,shape.end)<(shape.radius+extra)**2-EPS)return shape.id;continue;}
      if(Math.max(a.x,b.x)<shape.minX-extra||Math.min(a.x,b.x)>shape.maxX+extra||Math.max(a.z,b.z)<shape.minZ-extra||Math.min(a.z,b.z)>shape.maxZ+extra)continue;
      const polygon=shape.polygon;
      if(inside(a,polygon)||inside(b,polygon))return shape.id;
      for(let i=0;i<polygon.length;i++)if(segmentSquared(a,b,polygon[i],polygon[(i+1)%polygon.length])<(shape.padding+extra)**2-EPS)return shape.id;
    }
    return inBounds(b,extra)?null:'boundary';
  }
  const segmentClear=(a,b)=>segmentBlocker(a,b)===null;
  const isWalkable=(p)=>segmentClear(p,p);
  function sweep(first,last,extra=0,ignoreId=null){
    const a=point(first),b=point(last);
    let blockedBy=segmentBlocker(a,b,extra,ignoreId);
    if(blockedBy===null)return {position:b,blockedBy};
    let low=0,high=1;
    // Prefixes of a swept segment stay blocked after the first contact.
    for(let i=0;i<16;i++){
      const t=(low+high)*.5;
      const blocker=segmentBlocker(a,{x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t},extra,ignoreId);
      if(blocker===null)low=t;
      else{high=t;blockedBy=blocker;}
    }
    return {position:{x:a.x+(b.x-a.x)*low,z:a.z+(b.z-a.z)*low},blockedBy};
  }
  const columns=Math.ceil((bounds.maxX-bounds.minX)/settings.cellSize)+1;
  const rows=Math.ceil((bounds.maxZ-bounds.minZ)/settings.cellSize)+1;
  const dx=(bounds.maxX-bounds.minX)/(columns-1),dz=(bounds.maxZ-bounds.minZ)/(rows-1);
  const nodes=Array.from({length:columns*rows},(_,i)=>({x:bounds.minX+(i%columns)*dx,z:bounds.minZ+Math.floor(i/columns)*dz}));
  const free=Uint8Array.from(nodes,p=>Number(isWalkable(p)));
  function setVisitorColliders(colliders){
    shapes.splice(fixedShapeCount,shapes.length-fixedShapeCount,
      ...colliders.map(collider=>obstacle(collider,radius,skin,settings.pondShore)));
    for(let i=0;i<nodes.length;i++)free[i]=Number(isWalkable(nodes[i]));
    revision++;
  }
  function anchor(p,connect){
    let best=-1,bestDistance=Infinity;
    for(let i=0;i<nodes.length;i++)if(free[i]){
      const d=distance(p,nodes[i]);
      if(d<bestDistance&&(!connect||segmentClear(p,nodes[i]))){best=i;bestDistance=d;}
    }
    return best;
  }
  function plan(first,requested){
    const start=point(first),request=point(requested);
    const failed=(reason)=>({ok:false,reason,requested:request,goal:start,waypoints:[],length:0,adjusted:true,visited:0});
    if(![start.x,start.z,request.x,request.z].every(Number.isFinite))return failed('invalid');
    if(!isWalkable(start))return failed('invalid-start');
    if(distance(start,request)<.012)return {ok:true,reason:'arrived',requested:request,goal:start,waypoints:[],length:0,adjusted:false,visited:0};
    if(segmentClear(start,request))return {ok:true,reason:'direct',requested:request,goal:request,waypoints:[request],length:distance(start,request),adjusted:false,visited:0};
    const from=anchor(start,true),goal=anchor(request,isWalkable(request));
    if(from<0||goal<0)return failed('unreachable');
    const open=new MinHeap(),cost=new Float64Array(nodes.length).fill(Infinity),previous=new Int32Array(nodes.length).fill(-1),closed=new Uint8Array(nodes.length);
    cost[from]=0;open.push(from,distance(nodes[from],request));
    let closest=from,closestDistance=distance(nodes[from],request),visited=0,reached=false;
    while(open.values.length){
      const {id}=open.pop();if(closed[id])continue;closed[id]=1;visited++;
      const distanceToRequest=distance(nodes[id],request);
      if(distanceToRequest<closestDistance){closest=id;closestDistance=distanceToRequest;}
      if(id===goal){closest=id;reached=true;break;}
      const x=id%columns,z=Math.floor(id/columns);
      for(let oz=-1;oz<=1;oz++)for(let ox=-1;ox<=1;ox++){
        if((!ox&&!oz)||x+ox<0||x+ox>=columns||z+oz<0||z+oz>=rows)continue;
        const next=(z+oz)*columns+x+ox;
        if(!free[next]||closed[next])continue;
        const nextCost=cost[id]+Math.hypot(ox*dx,oz*dz);
        if(nextCost>=cost[next]||!segmentClear(nodes[id],nodes[next]))continue;
        cost[next]=nextCost;previous[next]=id;open.push(next,nextCost+distance(nodes[next],request));
      }
    }
    const route=[];for(let id=closest;id>=0;id=previous[id])route.push(nodes[id]);route.reverse();route.unshift(start);
    if(reached&&isWalkable(request)&&segmentClear(nodes[closest],request))route.push(request);
    const smoothed=[];let index=0;
    while(index<route.length-1){let next=route.length-1;while(next>index+1&&!segmentClear(route[index],route[next]))next--;if(distance(route[index],route[next])>.001)smoothed.push({...route[next]});index=next;}
    const end=smoothed.at(-1)??start;
    if(distance(end,start)<.02)return failed('unreachable');
    let length=0,last=start;for(const p of smoothed){length+=distance(last,p);last=p;}
    return {ok:true,reason:distance(end,request)>.04?'nearby':'detour',requested:request,goal:{...end},waypoints:smoothed,length,adjusted:distance(end,request)>.04,visited};
  }
  const canFitVisitor=(center,footprint,ignoreId)=>segmentBlocker(center,center,footprint-radius,ignoreId)===null;
  const sweepVisitor=(first,last,footprint,ignoreId)=>sweep(first,last,footprint-radius,ignoreId);
  return {isWalkable,segmentClear,sweep,plan,settings,bounds,setVisitorColliders,canFitVisitor,sweepVisitor,get revision(){return revision;},debug:()=>({radius,skin,obstacles:shapes.length,columns,rows,freeCells:free.reduce((sum,n)=>sum+n,0)})};
}

export function createGardenWalker(navigation){
  let plan=null,index=0,active=false,routeRevision=navigation.revision;
  return {
    start(from,to){plan=navigation.plan(from,to);index=0;active=plan.ok&&plan.waypoints.length>0;routeRevision=navigation.revision;return plan;},
    cancel(){active=false;},
    get active(){return active;},
    get waypoint(){return active?plan.waypoints[index]:null;},
    remainingDistance(from){
      if(!active)return 0;
      let length=0,last=point(from);
      for(let i=index;i<plan.waypoints.length;i++){length+=distance(last,plan.waypoints[i]);last=plan.waypoints[i];}
      return length;
    },
    advance(from,budget){
      const result=point(from);let travelled=0;
      if(active&&routeRevision!==navigation.revision){
        const previous=plan;
        this.start(from,previous.goal);
        if(!plan.ok)return {position:result,travelled,blocked:true,finished:false};
      }
      while(active&&budget>EPS){
        const goal=plan.waypoints[index],length=distance(result,goal);
        if(length<EPS){index++;active=index<plan.waypoints.length;continue;}
        const step=Math.min(length,budget),next={x:result.x+(goal.x-result.x)*step/length,z:result.z+(goal.z-result.z)*step/length};
        // Check the entire swept segment, including very long frame steps.
        if(!navigation.segmentClear(result,next)){active=false;return {position:result,travelled,blocked:true,finished:false};}
        result.x=next.x;result.z=next.z;travelled+=step;budget-=step;
        if(step>=length-EPS){index++;active=index<plan.waypoints.length;}
      }
      return {position:result,travelled,blocked:false,finished:!active};
    },
    debug:()=>({active,index,plan}),
  };
}
