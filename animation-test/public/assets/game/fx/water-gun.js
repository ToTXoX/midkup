import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const JET_RADIUS = .098;
const MOUTH_RADIUS = .063;
const CREST_SPAN = .060;
const SPLASH_SCALE = 1.87;
const SLICES = 54;
const APERTURE_BLEND = .020;
const clamp = THREE.MathUtils.clamp;
const smooth = THREE.MathUtils.smoothstep;

export function waterMaterial(opacity = 1) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.FrontSide,
    uniforms: {
      uOpacity: { value: opacity },
      uBody: { value: new THREE.Color('#B5E5EF') },
      uEdge: { value: new THREE.Color('#5F9FB8') },
      uLight: { value: new THREE.Color('#F6FDFF') },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uOpacity;
      uniform vec3 uBody;
      uniform vec3 uEdge;
      uniform vec3 uLight;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec3 n = normalize(vNormal);
        vec3 v = normalize(vView);
        float face = dot(n, v);
        float shine = dot(n, normalize(v + vec3(-0.65, 0.9, 0.0)));
        vec3 color = mix(uEdge, uBody, smoothstep(0.32, 0.43, face));
        color = mix(color, uLight, smoothstep(0.88, 0.94, shine));
        gl_FragColor = vec4(color, uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

function streamMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide, toneMapped: false,
    uniforms: {
      uClock: { value: 0 },
      uAgeStart: { value: 0 },
      uAgeSpan: { value: 0 },
      uCrestSpan: { value: 1 },
      uCrest: { value: 0 },
      uMouthRight: { value: new THREE.Vector3(1, 0, 0) },
      uMouthUp: { value: new THREE.Vector3(0, 1, 0) },
      uBody: { value: new THREE.Color('#AFE2EC') },
      uShade: { value: new THREE.Color('#73B8CA') },
      uFoam: { value: new THREE.Color('#FFFDF2') },
    },
    vertexShader: `
      attribute vec3 aTangent;
      attribute vec2 aOffset;
      attribute float aAperture;
      uniform vec3 uMouthRight;
      uniform vec3 uMouthUp;
      varying vec2 vWaterUv;
      varying float vMirror;

      vec2 projectedAxis(vec3 axis, vec3 point) {
        return isOrthographic ? axis.xy : axis.xy - point.xy * axis.z / point.z;
      }
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 facing = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(-mv.xyz);
        vec3 side = cross(mat3(modelViewMatrix) * aTangent, facing);
        // Ease the raised lip toward the upper side of the projected path as the camera orbits.
        vec2 across = length(side.xy) > 0.0001 ? normalize(side.xy) : vec2(1.0, 0.0);
        vMirror = smoothstep(-0.38, 0.38, across.y);
        vec3 offset = vec3(across, 0.0);
        if (aAperture > 0.0) {
          // Near the socket, the width comes from an ellipse in the lip plane.
          vec3 mouthRight = mat3(modelViewMatrix) * uMouthRight;
          vec3 mouthUp = mat3(modelViewMatrix) * uMouthUp * 0.44;
          vec2 ellipse = vec2(dot(across, projectedAxis(mouthRight, mv.xyz)),
            dot(across, projectedAxis(mouthUp, mv.xyz)));
          vec3 edge = (mouthRight * ellipse.x + mouthUp * ellipse.y) / max(length(ellipse), 0.001);
          offset = mix(offset, edge, aAperture);
        }
        mv.xyz += mix(aOffset.x, aOffset.y, vMirror) * offset;
        vWaterUv = uv;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uClock;
      uniform float uAgeStart;
      uniform float uAgeSpan;
      uniform float uCrestSpan;
      uniform float uCrest;
      uniform vec3 uBody;
      uniform vec3 uShade;
      uniform vec3 uFoam;
      varying vec2 vWaterUv;
      varying float vMirror;

      void main() {
        float age = uAgeStart + vWaterUv.x * uAgeSpan;
        float emitted = uClock - age;
        float front = (1.0 - vWaterUv.x) * uAgeSpan / uCrestSpan;
        float y = vWaterUv.y;
        float shadeEdge = 0.71 + 0.06 * sin(emitted * 57.0);
        float shade = mix(smoothstep(shadeEdge - 0.02, shadeEdge + 0.02, y),
          smoothstep(shadeEdge - 0.02, shadeEdge + 0.02, 1.0 - y), vMirror);
        vec3 color = mix(uBody, uShade, shade);

        // The white cap wraps around the raised lip and ends in a hooked point.
        float curl = 1.0 - smoothstep(0.0, 0.35, abs(front - 0.15));
        float foamEdge = 0.24 + 0.40 * curl - 0.29 * smoothstep(0.42, 0.88, front);
        float foam = uCrest * (1.0 - mix(smoothstep(foamEdge - 0.024, foamEdge + 0.024, y),
          smoothstep(foamEdge - 0.024, foamEdge + 0.024, 1.0 - y), vMirror));

        // One shorter stroke follows the cap, leaving broad clear areas between them.
        float beat = (fract(emitted * 9.0) - 0.47) * 3.5;
        float stroke = max(0.0, 1.0 - beat * beat);
        float distanceToStroke = abs(y - (0.41 - 0.10 * stroke)) - 0.085 * stroke;
        float accent = (1.0 - smoothstep(-0.019, 0.019, distanceToStroke))
          * smoothstep(0.08, 0.30, stroke) * smoothstep(0.84, 1.22, front) * smoothstep(0.006, 0.025, age);
        gl_FragColor = vec4(mix(color, uFoam, max(foam, accent)), 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

function streamGeometry() {
  const geometry = new THREE.BufferGeometry();
  const count = (SLICES + 1) * 2;
  const uv = new Float32Array(count * 2);
  const indices = [];
  for (let i = 0; i <= SLICES; i++) {
    const a = i * 2;
    uv.set([i / SLICES, 0, i / SLICES, 1], a * 2);
    if (i < SLICES) indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aTangent', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aOffset', new THREE.BufferAttribute(new Float32Array(count * 2), 2).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aAperture', new THREE.BufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  return geometry;
}

function dropletGeometry() {
  return new THREE.LatheGeometry([
    new THREE.Vector2(0, -1.4), new THREE.Vector2(.12, -.95),
    new THREE.Vector2(.5, -.25), new THREE.Vector2(.72, .18),
    new THREE.Vector2(.65, .58), new THREE.Vector2(.35, .88),
    new THREE.Vector2(0, 1.0),
  ], 12);
}

function foamShape() {
  const shape = new THREE.Shape();
  shape.moveTo(-.035, -.065);
  shape.bezierCurveTo(-.10, -.075, -.173, -.035, -.217, -.005);
  shape.bezierCurveTo(-.277, .031, -.239, .118, -.164, .091);
  shape.quadraticCurveTo(-.103, .069, -.085, .056);
  shape.bezierCurveTo(-.127, .119, -.142, .201, -.087, .225);
  shape.bezierCurveTo(-.011, .255, .015, .163, .024, .095);
  shape.bezierCurveTo(.065, .142, .167, .177, .199, .121);
  shape.bezierCurveTo(.229, .067, .159, .033, .100, .010);
  shape.bezierCurveTo(.122, -.028, .079, -.066, -.035, -.065);
  shape.closePath();
  return shape;
}

function createImpactFoam() {
  const group = new THREE.Group();
  group.name = 'Three-petal impact foam';
  const sheet = new THREE.ShapeGeometry(foamShape(), 9).rotateX(Math.PI / 2);
  const foamMaterial = color => new THREE.MeshBasicMaterial({color, transparent:true, depthWrite:false, side:THREE.DoubleSide, toneMapped:false});
  const patch = new THREE.Mesh(sheet, foamMaterial('#88CAD9'));
  const core = new THREE.Mesh(sheet, foamMaterial('#FFFDF2'));
  patch.position.y = .006;
  core.position.y = .010;
  core.renderOrder = 5;
  group.add(patch, core);

  return { group, update(age, contactEnd) {
    const bloom = 1 - (1 - clamp(age / .045, 0, 1)) ** 3;
    const collapse = smooth(age, .067, .22);
    const fade = 1 - smooth(age, Math.max(contactEnd, .18), Math.max(contactEnd, .18) + .11);
    const width = (.36 + .64 * bloom) * (1 - .46 * collapse);
    const length = (.30 + .70 * bloom) * (1 - .64 * collapse);
    patch.scale.set(width, 1, length);
    core.scale.set(width * .83, 1, length * .78);
    patch.material.opacity = (.96 - .62 * collapse) * fade;
    core.material.opacity = 1 - smooth(age, .097, .195);
    patch.visible = fade > 0;
    core.visible = core.material.opacity > 0;
    group.visible = patch.visible || core.visible;
    return { lobes: core.visible ? 3 : 0, patch: patch.visible };
  } };
}

function irregularRing() {
  const geometry = new THREE.RingGeometry(.977, 1, 90);
  geometry.rotateX(-Math.PI / 2);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const wobble = 1 + .035 * Math.sin(a * 3) + .018 * Math.sin(a * 5 + .7);
    p.setXYZ(i, p.getX(i) * wobble, 0, p.getZ(i) * wobble);
  }
  return geometry;
}

/** A deterministic, pooled effect: action time can be scrubbed in either direction. */
export function createWaterGunEffect({ scene, resolveImpact, start=.33, stop=.66, actionDuration=1, speed=13.5, gravity=20 }) {
  const START=start,STOP=stop;
  const group = new THREE.Group();
  group.name = 'Water gun — stream, droplets, impact and ripples';
  scene.add(group);
  const stream=new THREE.Mesh(streamGeometry(),streamMaterial());
  stream.name='White wave stream';
  stream.frustumCulled=false;
  const impact = new THREE.Group();
  impact.name='Water impact';
  const splash=createImpactFoam();
  const crown=splash.group;
  crown.scale.setScalar(SPLASH_SCALE);
  const wet = new THREE.Mesh(new THREE.CircleGeometry(1, 72), new THREE.MeshBasicMaterial({ color: '#548D83', transparent: true, depthWrite: false, opacity: .18, side: THREE.DoubleSide }));
  wet.rotation.x = -Math.PI / 2;
  wet.position.y = .001;
  const wetPositions = wet.geometry.attributes.position;
  for (let i = 0; i < wetPositions.count; i++) {
    const a = Math.atan2(wetPositions.getZ(i), wetPositions.getX(i));
    const wobble = 1 + .11 * Math.sin(a * 3 + 1) + .065 * Math.cos(a * 5);
    wetPositions.setX(i, wetPositions.getX(i) * wobble);
    wetPositions.setZ(i, wetPositions.getZ(i) * wobble);
  }
  const ripples = [0, 1].map(() => {
    const mesh = new THREE.Mesh(irregularRing(), new THREE.MeshBasicMaterial({ color: '#D1F6FF', transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    mesh.position.y = .006;
    return mesh;
  });
  impact.add(wet,crown,...ripples);
  group.add(stream,impact);
  const dropGeometry = dropletGeometry();
  const flightDrops = Array.from({ length: 2 }, () => new THREE.Mesh(dropGeometry, waterMaterial(.96)));
  const splashDrops = Array.from({ length: 3 }, () => new THREE.Mesh(dropGeometry, waterMaterial(.97)));
  group.add(...flightDrops, ...splashDrops);
  group.traverse((o) => { if (o.isMesh) { o.renderOrder ||= 4; o.castShadow = false; } });
  wet.renderOrder = 2;
  ripples.forEach((o) => o.renderOrder = 5);
  let pooledMeshes=0;group.traverse((o)=>{if(o.isMesh)pooledMeshes++;});
  let ready = false, lastTime = 0, tail = false, deferred=false, hitTarget=null;
  let flight = .28, firstImpact = .45, lastImpact = .74;
  let endTime=1.65;
  const origin = new THREE.Vector3(), velocity = new THREE.Vector3();
  const currentMouth = new THREE.Vector3(), frozenMouth = new THREE.Vector3();
  const neckOffset = new THREE.Vector3(), mouthInset = new THREE.Vector3();
  let hasMouthFrame = false;
  const direction = new THREE.Vector3(), right = new THREE.Vector3();
  const hit = new THREE.Vector3(), hitNormal = new THREE.Vector3();
  const point = new THREE.Vector3(), before = new THREE.Vector3(), after = new THREE.Vector3();
  const tangent = new THREE.Vector3(), dropVelocity = new THREE.Vector3();
  let current = { phase: 'idle', emitting: false, stream: false, crown: false, ripples: 0, flightDrops: 0, splashDrops: 0 };

  function hide() {
    group.visible = false;
    current = { phase: 'idle', emitting: false, stream: false, crown: false, ripples: 0, flightDrops: 0, splashDrops: 0 };
  }
  function reset() { ready = false; tail = false; deferred=false;hitTarget=null;lastTime = 0;hasMouthFrame=false;mouthInset.set(0,0,0);hide(); }
  function initialize(position, forward) {
    ready = true;
    origin.copy(position);
    direction.copy(forward).normalize();
    velocity.copy(direction).multiplyScalar(speed);
    right.crossVectors(direction, UP).normalize();
    if (right.lengthSq() < .1) right.set(1, 0, 0);
    const result = resolveImpact(origin, velocity, gravity);
    hitTarget=result.targetId??null;
    flight = result.time;
    hit.copy(result.point);
    hitNormal.copy(result.normal).normalize();
    firstImpact = START + flight;
    lastImpact = STOP + flight;
    endTime=lastImpact+.55;
    impact.position.copy(hit).addScaledVector(hitNormal, .002);
    // Leave room for the target's spring-back animation underneath the flash of foam.
    crown.position.y = hitTarget === null ? 0 : .036;
    tangent.copy(velocity);tangent.y-=gravity*flight;
    const forwardOnSurface=tangent.clone().addScaledVector(hitNormal,-tangent.dot(hitNormal));
    if (forwardOnSurface.lengthSq() < .01) {
      forwardOnSurface.copy(Math.abs(hitNormal.y) < .9 ? UP : new THREE.Vector3(0,0,1));
      forwardOnSurface.addScaledVector(hitNormal,-forwardOnSurface.dot(hitNormal));
    }
    forwardOnSurface.normalize();
    const surfaceRight = new THREE.Vector3().crossVectors(hitNormal, forwardOnSurface).normalize();
    impact.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(surfaceRight, hitNormal, forwardOnSurface));
    frozenMouth.copy(position);
  }
  function path(age, target) {
    target.copy(origin).addScaledVector(velocity, age);
    target.y -= .5 * gravity * age * age;
    // The base follows the mouth. Water already in flight keeps its path.
    target.addScaledVector(neckOffset, Math.exp(-age / .035));
    target.addScaledVector(mouthInset, 1 - smooth(age, 0, APERTURE_BLEND));
    target.addScaledVector(right, Math.sin(age * 35 - lastTime * 29) * .003 * Math.sin(Math.PI * age / flight));
    target.lerp(hit, smooth(age, flight - .02, flight));
    return target;
  }
  function placeDrop(mesh, position, motion, size, opacity = 1) {
    mesh.position.copy(position);
    mesh.quaternion.setFromUnitVectors(UP, motion.clone().normalize());
    const stretch = 1 + clamp(motion.length() / 9, 0, 1) * .65;
    mesh.scale.set(size, size * stretch, size);
    mesh.material.uniforms.uOpacity.value = opacity;
    mesh.visible = true;
  }
  function render(time) {
    lastTime = time;
    group.visible = time < endTime;
    stream.visible=impact.visible=false;
    flightDrops.forEach((o) => o.visible = false);
    splashDrops.forEach((o) => o.visible = false);
    if (time >= endTime) { tail = false; ready = false; hide(); return; }
    neckOffset.subVectors(currentMouth,origin);
    const emitting = time >= START && time < STOP;
    let maximumRadius=0;
    let nearMouthRadius=0;
    const impactAge = time - firstImpact;
    const crest = 1 - smooth(impactAge, .002, .052);
    const youngest = Math.max(0, time - STOP);
    const oldest = Math.min(time - START, flight);
    if (oldest - youngest > .006 && oldest > 0) {
      const span = oldest - youngest;
      const crestSpan = Math.min(CREST_SPAN, span * .79);
      const pressure = 1 - .57 * smooth(time, STOP - .032, lastImpact);
      stream.visible=true;
      const uniforms = stream.material.uniforms;
      uniforms.uClock.value = time;
      uniforms.uAgeStart.value = youngest;
      uniforms.uAgeSpan.value = span;
      uniforms.uCrestSpan.value = crestSpan;
      uniforms.uCrest.value = crest;
      const { position, aTangent, aOffset, aAperture } = stream.geometry.attributes;
      const startup = .84 + .16 * smooth(span, .006, .033);
      for (let i = 0; i <= SLICES; i++) {
        const u = i / SLICES, age = THREE.MathUtils.lerp(youngest, oldest, u);
        path(age, point);
        path(Math.max(0, age - .001), before);
        path(age + .001, after);
        tangent.subVectors(after, before).normalize();
        const phase = (age - time) * 57;
        const swell = smooth(age, .006, .038);
        const aperture = hasMouthFrame ? 1 - smooth(age, 0, APERTURE_BLEND) : 0;
        const raisedCrest = crest * smooth(age, .010, .041);
        const head = (oldest - age) / crestSpan;
        const lip = smooth(head, .15, .34) * (1 - smooth(head, .41, .96));
        const curl = smooth(head, .018, .085) * (1 - smooth(head, .12, .25));
        const base = THREE.MathUtils.lerp(MOUTH_RADIUS, JET_RADIUS, swell);
        const tip = 1 - clamp(head / .32, 0, 1);
        const front = Math.sqrt(1 - tip * tip);
        const rear = emitting ? 1 : Math.sqrt(clamp((age - youngest) / .021, 0, 1));
        const scale = front * rear * pressure * startup;
        const negativeWidth = (base * (1 + .13 * Math.sin(phase) * swell) + raisedCrest * (.115 * lip + .052 * curl)) * scale;
        const positiveWidth = (base * (1 + .12 * Math.sin(phase + 1.55) * swell) + .045 * raisedCrest * lip) * scale;
        const halfWidth = (negativeWidth + positiveWidth) * .5;
        maximumRadius = Math.max(maximumRadius, halfWidth);
        if (emitting && i === 0) nearMouthRadius = halfWidth;
        const vertex = i * 2;
        position.setXYZ(vertex, point.x, point.y, point.z);
        position.setXYZ(vertex + 1, point.x, point.y, point.z);
        aTangent.setXYZ(vertex, tangent.x, tangent.y, tangent.z);
        aTangent.setXYZ(vertex + 1, tangent.x, tangent.y, tangent.z);
        aOffset.setXY(vertex, -negativeWidth, -positiveWidth);
        aOffset.setXY(vertex + 1, positiveWidth, negativeWidth);
        aAperture.setX(vertex, aperture);
        aAperture.setX(vertex + 1, aperture);
      }
      position.needsUpdate = aTangent.needsUpdate = aOffset.needsUpdate = aAperture.needsUpdate = true;
    }
    flightDrops.forEach((mesh, i) => {
      const seedAge = flight * (.39 + i * .22);
      const birth = START + seedAge + i * .026, age = time - birth;
      if(age<0||age>.17||seedAge+age*.91>=flight) return;
      const side = i === 0 ? 1 : -1;
      point.copy(origin).addScaledVector(velocity, seedAge);
      point.addScaledVector(right, side * .115);
      point.y -= .5 * gravity * seedAge * seedAge;
      dropVelocity.copy(velocity).multiplyScalar(.88).addScaledVector(right, side * .56);
      dropVelocity.y += .27 + i * .08 - gravity * seedAge;
      point.addScaledVector(dropVelocity, age);
      point.y -= .5 * gravity * age * age;
      if (point.y < hit.y + .009 && hitNormal.y > .6) return;
      dropVelocity.y -= gravity * age;
      placeDrop(mesh,point,dropVelocity,.025 - i * .006,1-smooth(age,.105,.17));
    });
    let splashState={lobes:0,patch:false};
    if (impactAge >= 0) {
      impact.visible = true;
      splashState=splash.update(impactAge,lastImpact-firstImpact);
      wet.scale.setScalar(.14+.12*smooth(impactAge,0,.35));
      wet.material.opacity=.08*(1-smooth(time,lastImpact+.08,endTime));
      ripples.forEach((mesh, i) => {
        const age = impactAge - .035 - i * .11, duration = .55;
        mesh.visible = hitNormal.y>.60&&age>=0&&age<duration;
        if (!mesh.visible) return;
        const u = age / duration;
        const radius = .09 + .35 * (1 - Math.pow(1 - u, 2));
        mesh.scale.set(radius, 1, radius * .94);
        mesh.material.opacity = .48 * Math.pow(1 - u, 1.6);
      });
      splashDrops.forEach((mesh, i) => {
        const age = impactAge - .009 * i;
        if (age < 0 || age > .26) return;
        const side=i%2===0?1:-1;
        const localVelocity=new THREE.Vector3(side*(1.38-i*.28),1.19+i*.22,.44+i*.53);
        dropVelocity.copy(localVelocity).applyQuaternion(impact.quaternion);
        point.copy(hit).addScaledVector(dropVelocity, age);
        point.y -= .5 * gravity * age * age;
        if (point.clone().sub(hit).dot(hitNormal) < 0) return;
        dropVelocity.y -= gravity * age;
        const shrink = 1 - .61 * smooth(age, .07, .26);
        placeDrop(mesh,point,dropVelocity,(.038-i*.006)*shrink,1-smooth(age,.16,.26));
      });
    }
    current = {
      phase: time < START ? 'anticipation' : emitting ? 'jet' : time < lastImpact ? 'cutoff' : crown.visible ? 'splash' : 'residual',
      emitting,mouthBead:false,stream:stream.visible,fragments:Number(stream.visible),crown:impact.visible&&crown.visible,
      ripples: impact.visible ? ripples.filter((o) => o.visible).length : 0,
      flightDrops: flightDrops.filter((o) => o.visible).length,
      splashDrops: splashDrops.filter((o) => o.visible).length,
      impactPoint: hit.toArray(), impactNormal: hitNormal.toArray(), firstImpact, lastImpact,
      targetId:hitTarget,
      time, youngestAge: youngest, oldestAge: oldest,
      splashStyle:'white-wave',splashLobes:splashState.lobes,contactPatch:splashState.patch,
      crest:stream.visible ? crest : 0,
      maximumDiameter:maximumRadius*2,jetSpeed:speed,splashScale:SPLASH_SCALE,
      nearMouthDiameter:nearMouthRadius*2,
    };
  }
  reset();
  return {
    begin(position,forward,{defer=false}={}) { reset();deferred=defer;if(!defer&&position&&forward)initialize(position,forward); },
    cancel: reset,
    finish: () => { tail = ready; lastTime = actionDuration; },
    update(time, position, forward, mouthRotation) {
      if(!ready&&deferred&&time<START){current={...current,phase:'anticipation',time};return;}
      if (!ready) initialize(position, forward);
      if (time <= STOP) frozenMouth.copy(position);
      if (mouthRotation && (time <= STOP || !hasMouthFrame)) {
        hasMouthFrame = true;
        // The exported socket sits ahead of the mouth. Start the visible water inside the open lips.
        mouthInset.set(0, -.024, -.047).applyQuaternion(mouthRotation);
        stream.material.uniforms.uMouthRight.value.set(1, 0, 0).applyQuaternion(mouthRotation);
        stream.material.uniforms.uMouthUp.value.set(0, 1, 0).applyQuaternion(mouthRotation);
      }
      currentMouth.copy(time <= STOP ? position : frozenMouth);
      render(time);
    },
    updateTail(delta) { if (tail) render(lastTime + delta); },
    debug: () => ({ ...current, active: group.visible, tail, pooledMeshes, streamVertices: stream.geometry.attributes.position.count,launchOrigin:origin.toArray(),launchDirection:direction.toArray(),flightTime:flight }),
    dispose() {
      scene.remove(group);
      const geometries = new Set(), materials = new Set();
      group.traverse((o) => { if (o.isMesh) { geometries.add(o.geometry); materials.add(o.material); } });
      geometries.forEach((g) => g.dispose()); materials.forEach((m) => m.dispose());
    },
  };
}
