import * as THREE from 'three';

const RESTOCK_SECONDS = 24;
const fruitNames = {berry: '树果', apple: '苹果', orange: '橘子', plum: '李子'};

export function createFruitModels(berry) {
  const leafGeometry = new THREE.SphereGeometry(1, 12, 8);
  const leafMaterial = new THREE.MeshStandardMaterial({color: '#69a844', name: 'Fruit leaf'});
  const stemMaterial = new THREE.MeshStandardMaterial({color: '#85513b', name: 'Fruit stem'});
  function makeFruit(type, profile, color, leafSize) {
    const fruit = new THREE.Group();
    fruit.name = fruitNames[type];
    const outline = new THREE.SplineCurve(profile.map(([x,y]) => new THREE.Vector2(x,y)));
    const body = new THREE.Mesh(
      new THREE.LatheGeometry(outline.getPoints(30).map(p => p.setX(Math.max(0,p.x))), 28),
      new THREE.MeshStandardMaterial({color, name: fruitNames[type], roughness: .8}),
    );
    fruit.add(body);
    const top = profile.at(-1)[1];
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(.004,.006,.029,8),stemMaterial);
    stem.position.set(0,top+.010,0);
    stem.rotation.z = -.20;
    fruit.add(stem);
    const leaf = new THREE.Mesh(leafGeometry,leafMaterial);
    leaf.position.set(.027,top+.023,.003);
    leaf.scale.set(leafSize,.008,.020);
    leaf.rotation.set(.2,-.15,.47);
    fruit.add(leaf);
    return fruit;
  }

  return {
    berry,
    apple: makeFruit('apple',[[0,.009],[.037,.003],[.065,.019],[.087,.065],[.091,.105],[.075,.145],[.043,.159],[0,.149]],'#e74b56',.034),
    orange: makeFruit('orange',[[0,0],[.049,.009],[.075,.035],[.085,.074],[.080,.114],[.056,.142],[0,.151]],'#f7a237',.028),
    plum: makeFruit('plum',[[0,0],[.034,.012],[.060,.045],[.068,.087],[.058,.131],[.032,.151],[0,.153]],'#8c65bd',.026),
  };
}

export function createGardenFruit({layout, environment, models, groundHeight, mobileGraphics=false}) {
  const fruitById = new Map();
  const trees = new Map();
  const star = new THREE.Shape();
  for(let i=0;i<8;i++){
    const angle = i*Math.PI/4;
    const radius = i%2 ? .24 : 1;
    star[i?'lineTo':'moveTo'](Math.cos(angle)*radius, Math.sin(angle)*radius);
  }
  const glintGeometry = new THREE.ShapeGeometry(star);
  const pickupRingGeometry = new THREE.RingGeometry(mobileGraphics ? .18 : .128,mobileGraphics ? .23 : .163,48);
  let hoveredFruit = null;
  const planting = environment.getObjectByName('Planting');
  const plantingMeshes = [];
  planting?.traverse(mesh => {if(mesh.isMesh)plantingMeshes.push(mesh);});

  for(const definition of layout?.trees ?? []){
    for(const mesh of plantingMeshes){
      if(mesh.material.name===definition.material)mesh.userData.fruitTree = definition.id;
    }
    const tree = {...definition, fruitScale:definition.fruitScale??1, wait:0, fruits:[]};
    trees.set(tree.id,tree);
    tree.fruits = definition.placements.map(({branch,landing}, index) => {
      const id = `${tree.id}-${index+1}`;
      const position = new THREE.Vector3().fromArray(branch);
      const [x,z] = landing;
      const ground = groundHeight(x,z);
      if(ground===null)throw new Error(`果实落点不在地面上：${id}`);
      const object = new THREE.Group();
      object.name = id;
      object.position.copy(position);
      const body = models[tree.fruit].clone();
      body.scale.setScalar(tree.fruitScale);
      body.rotation.y = index*2.2;
      body.traverse(mesh => {
        if(!mesh.isMesh)return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.gardenFruit = id;
      });
      const glint = new THREE.Mesh(glintGeometry,new THREE.MeshBasicMaterial({
        color: '#fff3c4', side: THREE.DoubleSide, transparent: true, depthWrite: false,
      }));
      glint.userData.combatDecoration = true;
      glint.position.set(.076,.165,.032).multiplyScalar(tree.fruitScale);
      glint.rotation.x = -Math.PI/3;
      glint.visible = false;
      const pickupRing = new THREE.Mesh(pickupRingGeometry,new THREE.MeshBasicMaterial({
        color:'#fff2b9',transparent:true,opacity:.75,depthWrite:false,
      }));
      pickupRing.userData.combatDecoration = true;
      pickupRing.rotation.x = -Math.PI/2;
      pickupRing.position.y = .010;
      pickupRing.visible = false;
      object.add(body,glint,pickupRing);
      environment.add(object);
      const fruit = {id, tree, position, landing:new THREE.Vector3(x,ground+.002,z), object, body, glint, pickupRing, index, age:0, phase:'hanging'};
      fruitById.set(id,fruit);
      return fruit;
    });
  }

  function aimPoint(id) {
    const fruit = trees.get(id)?.fruits.find(f => f.phase==='hanging');
    return fruit ? fruitPoint(fruit) : null;
  }
  function fruitPoint(fruit) {
    const point = fruit.object.position.clone();
    point.y += .075*fruit.tree.fruitScale;
    return point;
  }
  function groundFruit(id) {
    const fruit = fruitById.get(id);
    if(fruit?.phase!=='ground')return null;
    const {fruit:type,fruitScale:scale} = fruit.tree;
    return {id,type,name:fruitNames[type],center:fruitPoint(fruit).toArray(),scale};
  }
  function nearbyFruit(ray, {maxDistance=Infinity, radiusPerMeter=0, isVisible}={}) {
    let closest = Infinity, match = null;
    for(const fruit of fruitById.values()){
      const onGround = fruit.phase==='ground';
      if(!onGround && (!radiusPerMeter || fruit.phase!=='hanging'))continue;
      const point = fruitPoint(fruit);
      const distance = point.clone().sub(ray.origin).dot(ray.direction);
      if(distance<=0 || distance>maxDistance)continue;
      const radius = radiusPerMeter ? Math.min(.72,distance*radiusPerMeter) : .24;
      const offset = ray.distanceSqToPoint(point);
      const tapOffset = radiusPerMeter ? offset / distance**2 : offset;
      if(offset>=radius**2 || tapOffset>=closest)continue;
      const targetId = onGround ? null : fruit.tree.id;
      if(isVisible && !isVisible(point,fruit.id,targetId))continue;
      closest = tapOffset;
      match = {fruit:onGround ? groundFruit(fruit.id) : null,targetId,point,distance};
    }
    return match;
  }
  function setHover(id) {
    const next = fruitById.get(id)??null;
    if(next===hoveredFruit)return;
    if(hoveredFruit){
      hoveredFruit.pickupRing.material.opacity = .75;
      hoveredFruit.pickupRing.scale.setScalar(1);
    }
    hoveredFruit = next;
    if(hoveredFruit){
      hoveredFruit.pickupRing.material.opacity = 1;
      hoveredFruit.pickupRing.scale.setScalar(1.12);
    }
  }
  function knockDown(id) {
    const tree = trees.get(id);
    if(!tree || !aimPoint(id))return null;
    for(const fruit of tree.fruits){
      if(fruit.phase!=='hanging')continue;
      fruit.phase = 'falling';
      fruit.age = 0;
    }
    return fruitNames[tree.fruit];
  }
  function update(delta) {
    for(const fruit of fruitById.values()){
      if(fruit.phase==='falling'){
        fruit.age += delta;
        const t = fruit.age-fruit.index*.085;
        const fall = Math.sqrt((fruit.position.y-fruit.landing.y)/5.6);
        const u = THREE.MathUtils.clamp(t/fall,0,1);
        const bounce = THREE.MathUtils.clamp((t-fall)/.24,0,1);
        fruit.object.position.lerpVectors(fruit.position,fruit.landing,.87*u+.13*bounce);
        fruit.object.position.y = THREE.MathUtils.lerp(fruit.position.y,fruit.landing.y,u*u)+.20*bounce*(1-bounce);
        fruit.body.rotation.z = -Math.sin(u*Math.PI)*.73+Math.sin(bounce*Math.PI*2)*.22;
        if(bounce===1){
          fruit.phase = 'ground';
          fruit.age = 0;
        }
      }else if(fruit.phase==='ground'){
        fruit.age += delta;
      }
      fruit.pickupRing.visible = fruit.phase==='ground';
      const pulse = (fruit.age+3.9-fruit.index*.12)%4;
      fruit.glint.visible = fruit.phase==='ground' && pulse<.48;
      if(fruit.glint.visible){
        const sparkle = Math.sin(pulse*Math.PI/.48);
        fruit.glint.scale.setScalar(.055*sparkle);
        fruit.glint.material.opacity = .88*sparkle;
      }
    }
    for(const tree of trees.values()){
      if(!tree.fruits.every(fruit => fruit.phase==='eaten'))continue;
      tree.wait += delta;
      if(tree.wait<RESTOCK_SECONDS)continue;
      tree.wait = 0;
      for(const fruit of tree.fruits){
        fruit.phase = 'hanging';
        fruit.age = 0;
        fruit.object.position.copy(fruit.position);
        fruit.object.visible = true;
      }
    }
  }

  return {
    update, knockDown, aimPoint,
    treeName: id => trees.get(id)?.name,
    isHanging: id => fruitById.get(id)?.phase==='hanging',
    treeAt: id => fruitById.get(id)?.tree.id,
    point: id => fruitById.has(id) ? fruitPoint(fruitById.get(id)) : null,
    groundFruit, nearbyFruit, setHover,
    take(id) {
      const fruit = fruitById.get(id);
      if(fruit?.phase!=='ground')return false;
      fruit.phase = 'in-meal';
      fruit.object.visible = false;
      return true;
    },
    finish(id, bitten) {
      const fruit = fruitById.get(id);
      if(fruit?.phase!=='in-meal')return;
      fruit.phase = bitten ? 'eaten' : 'ground';
      fruit.object.visible = !bitten;
    },
    debug: () => [...fruitById.values()].map(fruit => ({
      id:fruit.id, treeId:fruit.tree.id, type:fruit.tree.fruit, phase:fruit.phase, point:fruitPoint(fruit).toArray(),
      pickupCue:fruit.object.visible&&fruit.pickupRing.visible,
    })),
  };
}
