// The 3D barbershop: four hydraulic chairs facing their mirrors, a spinning
// barber pole, neon signs, and four tools that orbit the main chair and line
// up for the "Craft" section. Everything is modelled in code.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

// Where the camera sits for each section. `focus` is the point it looks at,
// `shift` moves that point across the frame (NDC units) so text has room.
// The `m*` values apply on portrait screens.
export const VIEWS = {
  hero: { pos: [0.55, 1.3, 4.3], focus: [0, 1.0, -0.4], shift: [0.3, -0.02], mshift: [0, -0.4], mdist: 1.55, orbitR: 1.08, orbitY: 1.12, show: 0 },
  story: { pos: [1.15, 1.72, 0.35], focus: [1.45, 1.74, -1.98], shift: [0.34, 0], mshift: [0.62, -0.1], mdist: 1.6, orbitR: 0.9, orbitY: 3.1, show: 0 },
  services: { pos: [1.2, 3.2, 7.0], focus: [1.2, 1.1, -0.8], shift: [0, 0], mshift: [0, 0], mdist: 1.3, orbitR: 1.75, orbitY: 1.75, show: 0 },
  craft: { pos: [-0.22, 1.44, 2.95], focus: [-0.98, 1.32, 1.2], shift: [0.34, 0], mshift: [0, 0.34], mdist: 2.3, orbitR: 1.1, orbitY: 1.2, show: 1 },
  team: { pos: [-6.0, 1.75, 3.2], focus: [2.6, 0.95, -0.6], shift: [0, 0], mshift: [0, 0], mdist: 1.1, orbitR: 1.2, orbitY: 1.35, show: 0 },
  shelf: { pos: [-0.55, 1.62, 0.55], focus: [-1.5, 1.62, -2.05], shift: [-0.36, 0], mshift: [0, 0.3], mdist: 1.35, orbitR: 0.9, orbitY: 3.1, show: 0 },
  club: { pos: [1.6, 2.5, 5.2], focus: [1.4, 2.1, -2.1], shift: [0, 0], mshift: [0, 0], mdist: 1.2, orbitR: 1.3, orbitY: 1.4, show: 0 },
  words: { pos: [1.35, 1.45, 1.9], focus: [0, 1.6, -2.15], shift: [0, 0], mshift: [0, 0], mdist: 1.1, orbitR: 0.9, orbitY: 1.3, show: 0 },
  book: { pos: [0.1, 4.6, 2.3], focus: [0, 0.55, 0.15], shift: [0, 0], mshift: [0, 0], mdist: 1.3, orbitR: 1.3, orbitY: 1.05, show: 0 },
  visit: { pos: [-3.3, 1.65, 1.0], focus: [-4.6, 1.85, -2.1], shift: [0.3, 0], mshift: [0, 0.3], mdist: 1.25, orbitR: 0.85, orbitY: 1.15, show: 0 },
  footer: { pos: [1.5, 1.9, 9.5], focus: [1.5, 1.4, -1.5], shift: [0, 0], mshift: [0, 0], mdist: 1.5, orbitR: 1.2, orbitY: 1.2, show: 0 },
};

// Neon colours in linear light; sign intensity multiplies these.
const NEON = {
  pink: new THREE.Color(1.0, 0.16, 0.42),
  cyan: new THREE.Color(0.2, 0.85, 1.0),
};
const CHAIR_X = [-3, 0, 3, 6];

const SHOWCASE = v3(VIEWS.craft.focus);
// The tool carousel slides across the craft camera's view, and steps back
// along it, so the next and previous tools peek in from the sides.
const SHOW_DEPTH = new THREE.Vector3().subVectors(SHOWCASE, v3(VIEWS.craft.pos)).setY(0).normalize();
const SHOW_SIDE = new THREE.Vector3().crossVectors(SHOW_DEPTH, new THREE.Vector3(0, 1, 0)).normalize();

export async function createStage(canvas, opts = {}) {
  const reduced = !!opts.reducedMotion;
  // Screenshots only: jump straight to each camera position.
  const settle = !!window.__BARBERSHOP_SETTLE;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const tier = opts.tier || (small ? 1 : 2); // 2 high, 1 medium, 0 low

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    stencil: false,
    powerPreference: 'high-performance',
  });
  let pixelRatio = Math.min(window.devicePixelRatio || 1, tier === 2 ? 1.75 : 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x070908, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070908);
  scene.fog = new THREE.FogExp2(0x070908, 0.075);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.2;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.05, 60);
  camera.position.set(4, 2.4, 6);

  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const T = makeTextures(maxAniso);
  const M = makeMaterials(T);

  // ---------------------------------------------------------------- room
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), M.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 9), M.wall);
  wall.position.set(0, 4.5, -2.2);
  wall.receiveShadow = true;
  scene.add(wall);

  const wainscot = new THREE.Mesh(new THREE.BoxGeometry(30, 1.1, 0.04), M.wood);
  wainscot.position.set(0, 0.55, -2.18);
  wainscot.receiveShadow = true;
  scene.add(wainscot);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(30, 0.035, 0.06), M.brass);
  rail.position.set(0, 1.12, -2.16);
  scene.add(rail);

  // Four stations: cabinet, mirror, neon ring behind the mirror, chair.
  // The main chair (x = 0) is the one you can spin; the others are baked
  // into a few meshes to keep draw calls down.
  const circle = new THREE.CircleGeometry(0.6, 72);
  const frameGeo = new THREE.TorusGeometry(0.625, 0.038, 20, 96);
  const frameInnerGeo = new THREE.TorusGeometry(0.585, 0.008, 8, 96);
  const haloGeo = new THREE.TorusGeometry(0.72, 0.013, 10, 120);
  const halos = [];
  const sideYaw = { '-3': 0.35, 3: -0.3, 6: 0.15 };
  let chair;
  CHAIR_X.forEach((x, i) => {
    const main = x === 0;
    scene.add(bake(buildStation(M, main), x));

    const mg = new THREE.Group();
    mg.position.set(x, 1.64, -2.15);
    scene.add(mg);
    let mirror;
    if (main ? tier >= 1 : tier >= 2) {
      const size = main && tier === 2 ? 1024 : 512;
      mirror = new Reflector(circle, {
        textureWidth: size,
        textureHeight: size,
        color: 0x7b8484,
        clipBias: 0.003,
        multisample: main && tier === 2 ? 4 : 0,
      });
    } else {
      mirror = new THREE.Mesh(circle, M.mirrorFake);
    }
    mirror.position.z = 0.01;
    mg.add(mirror);
    mg.add(mesh(frameGeo, M.brass));
    const inner = mesh(frameInnerGeo, M.brass);
    inner.position.z = 0.02;
    mg.add(inner);
    const halo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }));
    halo.position.z = -0.028;
    mg.add(halo);
    halos.push({ mat: halo.material, color: i % 2 ? NEON.pink : NEON.cyan, delay: 0.5 + i * 0.18 });

    const c = buildChair(M);
    if (main) {
      chair = c;
      // Bake the swivel and the base separately so the seat can still turn.
      c.group.remove(c.swivel);
      const swivel = bake(c.swivel);
      const base = bake(c.group);
      base.add(swivel);
      chair = { group: base, swivel };
      scene.add(base);
    } else {
      c.swivel.rotation.y = sideYaw[x];
      scene.add(bake(c.group, x));
    }
  });

  // Shelf with products and a jar of blue disinfectant.
  const shelf = bake(buildShelf(M));
  shelf.position.set(-1.5, 1.42, -2.05);
  scene.add(shelf);

  // Neon signs: the shop name, scissors and an OPEN sign.
  const neonTex = await neonTextures();
  const signs = [];
  const addSign = (tex, w, h, x, y, opts = {}) => {
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: 0x000000,
      fog: false,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, -2.165);
    scene.add(m);
    signs.push({ mat, base: opts.base ?? 2.4, delay: opts.delay ?? 0.9, buzz: !!opts.buzz, next: 6, until: 0 });
  };
  addSign(neonTex.main, 2.0, 0.75, -1.5, 2.5, { delay: 0.9, base: 2.6 });
  addSign(neonTex.scissors, 0.95, 0.95, 4.5, 2.2, { delay: 1.35 });
  addSign(neonTex.open, 0.92, 0.46, -4.6, 1.85, { delay: 1.7, buzz: true });

  // Barber pole.
  const poleUniforms = { uTime: { value: 0 }, uGlow: { value: 0 } };
  const pole = bake(buildPole(M, poleUniforms));
  pole.position.set(1.45, 1.78, -1.98);
  scene.add(pole);

  // Pendant bulbs over the chairs.
  const bulbs = [];
  for (const [x, y, z] of [[-0.95, 2.62, -0.7], [0.05, 2.9, -1.25], [1.0, 2.55, -0.55], [-3.3, 2.75, -0.8], [3.2, 2.6, -0.7], [6.1, 2.8, -0.9]]) {
    const b = buildBulb(M);
    b.position.set(x, y, z);
    scene.add(b);
    bulbs.push(b);
  }

  // The tools.
  const tools = [buildRazor(M), buildShears(M), buildClipper(M), buildComb(M)];
  for (const t of tools) scene.add(t.group);

  // ---------------------------------------------------------------- light
  const hemi = new THREE.HemisphereLight(0x3d5a5c, 0x0c0907, 0.0);
  scene.add(hemi);

  const keyPos = new THREE.Vector3(0.18, 4.7, 0.42);
  const key = new THREE.SpotLight(0xffe0b5, 0, 0, 0.43, 0.55, 1.6);
  key.position.copy(keyPos);
  key.target.position.set(0, 0.6, 0.15);
  key.castShadow = true;
  key.shadow.mapSize.set(tier === 2 ? 2048 : 1024, tier === 2 ? 2048 : 1024);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 8;
  scene.add(key, key.target);

  const rim = new THREE.SpotLight(0x6fc7cf, 0, 0, 0.5, 0.8, 1.6);
  rim.position.set(2.6, 3.0, -1.4);
  rim.target.position.set(0, 0.9, 0);
  scene.add(rim, rim.target);

  // Softer lights over the other chairs.
  const rows = [
    [-3, 0.6],
    [4.5, 0.75],
  ].map(([x, angle]) => {
    const l = new THREE.SpotLight(0xffd9ad, 0, 0, angle, 0.7, 1.6);
    l.position.set(x, 4.4, 0.9);
    l.target.position.set(x, 0.4, -0.1);
    scene.add(l, l.target);
    return l;
  });

  const showLight = new THREE.SpotLight(0xfff1dc, 0, 0, 0.35, 0.8, 1.6);
  showLight.position.set(SHOWCASE.x + 1.3, SHOWCASE.y + 1.4, SHOWCASE.z + 1.9);
  showLight.target.position.copy(SHOWCASE);
  scene.add(showLight, showLight.target);

  const bulbLight = new THREE.PointLight(0xffa25a, 0, 6, 1.8);
  bulbLight.position.set(0, 2.6, -0.8);
  scene.add(bulbLight);

  const poleLight = new THREE.PointLight(0xff6a5a, 0, 2.6, 1.8);
  poleLight.position.set(1.45, 1.8, -1.7);
  scene.add(poleLight);

  // Coloured spill from the neon onto the floor, chairs and shelf.
  const pinkLight = new THREE.PointLight(0xff3f86, 0, 6, 1.6);
  pinkLight.position.set(-1.5, 2.3, -1.5);
  scene.add(pinkLight);
  const cyanLight = new THREE.PointLight(0x3fe0ff, 0, 6, 1.6);
  cyanLight.position.set(4.5, 2.1, -1.5);
  scene.add(cyanLight);

  // Visible light beam and dust inside it.
  const beam = buildBeam(keyPos, key.target.position);
  scene.add(beam.mesh);
  const dust = buildDust(T.dot, tier === 2 ? 520 : 300);
  scene.add(dust.points);

  // ---------------------------------------------------------------- post
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: tier === 2 ? 4 : 0 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(pixelRatio);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.42, 0.5, 0.9);
  if (tier >= 1) composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // ---------------------------------------------------------------- state
  const state = {
    from: VIEWS.hero,
    to: VIEWS.hero,
    t: 0,
    craft: 0,
    px: 0,
    py: 0,
    power: 0,
    introStart: -1,
    yaw: 0.5,
    yawVel: 0,
    dragging: false,
    lastTouch: 0,
    poleBoost: 0,
    neonFlicker: 0,
    afterHours: 0,
  };

  const cur = {
    pos: v3(VIEWS.hero.pos).add(new THREE.Vector3(1.2, 0.9, 2.2)),
    focus: v3(VIEWS.hero.focus),
    shift: new THREE.Vector2(...VIEWS.hero.shift),
    orbitR: VIEWS.hero.orbitR,
    orbitY: VIEWS.hero.orbitY,
    show: 0,
    craft: 0,
    afterHours: 0,
  };

  const tmp = {
    pos: new THREE.Vector3(),
    focus: new THREE.Vector3(),
    a: new THREE.Vector3(),
    b: new THREE.Vector3(),
    shift: new THREE.Vector2(),
    s1: new THREE.Vector2(),
    s2: new THREE.Vector2(),
    right: new THREE.Vector3(),
    up: new THREE.Vector3(),
    q1: new THREE.Quaternion(),
    q2: new THREE.Quaternion(),
    e: new THREE.Euler(),
    p1: new THREE.Vector3(),
    p2: new THREE.Vector3(),
  };

  function portrait() {
    return camera.aspect < 0.9;
  }

  function viewTarget(view, outPos, outFocus, outShift) {
    outFocus.set(...view.focus);
    outPos.set(...view.pos);
    if (portrait()) {
      outPos.sub(outFocus).multiplyScalar(view.mdist).add(outFocus);
      outShift.set(...view.mshift);
    } else {
      outShift.set(...view.shift);
    }
  }

  // ---------------------------------------------------------------- tools
  function orbitPose(i, time, out) {
    const a = i * (TAU / tools.length) + time * 0.16 + 0.6;
    const r = cur.orbitR + (i % 2) * 0.12;
    out.pos.set(Math.cos(a) * r, cur.orbitY + (i % 2 ? 0.28 : 0) + Math.sin(time * 0.7 + i * 1.7) * 0.07, Math.sin(a) * r);
    out.rot.set(Math.sin(time * 0.35 + i) * 0.5, -a + Math.PI / 2 + time * 0.1, 0.35 * (i - 1.5) + Math.sin(time * 0.5 + i) * 0.2);
    out.scale = 0.95;
  }

  function showcasePose(i, time, out) {
    const d = i - cur.craft;
    const ad = Math.abs(d);
    out.pos.copy(SHOWCASE).addScaledVector(SHOW_SIDE, d * 0.8).addScaledVector(SHOW_DEPTH, Math.min(ad, 2) * 0.55);
    out.pos.y -= Math.min(ad, 1.5) * 0.06;
    const spin = cur.craft * Math.PI * 0.9 + (reduced ? 0 : time * 0.22);
    out.rot.set(0.42 + Math.sin(time * 0.6) * 0.04, spin - d * 0.6 + 0.05, -0.12 + d * 0.15);
    out.scale = lerp(1.08, 0.8, clamp(ad, 0, 1));
  }

  const poseA = { pos: new THREE.Vector3(), rot: new THREE.Euler(), scale: 1 };
  const poseB = { pos: new THREE.Vector3(), rot: new THREE.Euler(), scale: 1 };

  function updateTools(time, dt) {
    const w = ease(clamp(cur.show, 0, 1));
    tools.forEach((tool, i) => {
      const tt = reduced ? 0 : time;
      orbitPose(i, tt, poseA);
      showcasePose(i, time, poseB);
      tool.group.position.lerpVectors(poseA.pos, poseB.pos, w);
      tmp.q1.setFromEuler(poseA.rot);
      tmp.q2.setFromEuler(poseB.rot);
      tool.group.quaternion.slerpQuaternions(tmp.q1, tmp.q2, w);
      tool.group.scale.setScalar(lerp(poseA.scale, poseB.scale, w));
      const focus = w * (1 - clamp(Math.abs(i - cur.craft) * 1.6, 0, 1));
      tool.animate(time, dt, focus, reduced);
    });
  }

  // ---------------------------------------------------------------- frame
  const clock = new THREE.Clock();
  let raf = 0;
  let running = false;
  let frameAvg = 16;
  let slowFrames = 0;

  function frame() {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = clock.elapsedTime;

    // Intro: lights come up, neon flickers on, camera settles.
    if (state.introStart >= 0) {
      const k = clamp((time - state.introStart) / (reduced ? 0.4 : 2.2), 0, 1);
      state.power = ease(k);
    }
    const P = state.power;

    // Camera target from the scroll position.
    viewTarget(state.from, tmp.a, tmp.p1, tmp.s1);
    viewTarget(state.to, tmp.b, tmp.p2, tmp.s2);
    const t = ease(clamp(state.t, 0, 1));
    tmp.pos.lerpVectors(tmp.a, tmp.b, t);
    tmp.focus.lerpVectors(tmp.p1, tmp.p2, t);
    tmp.shift.lerpVectors(tmp.s1, tmp.s2, t);

    const k = settle ? 1 : 1 - Math.exp(-dt * (reduced ? 10 : 3.2));
    cur.pos.lerp(tmp.pos, k);
    cur.focus.lerp(tmp.focus, k);
    cur.shift.lerp(tmp.shift, k);
    cur.orbitR = lerp(cur.orbitR, lerp(state.from.orbitR, state.to.orbitR, t), k);
    cur.orbitY = lerp(cur.orbitY, lerp(state.from.orbitY, state.to.orbitY, t), k);
    cur.show = lerp(cur.show, lerp(state.from.show, state.to.show, t), k);
    cur.craft = settle ? state.craft : lerp(cur.craft, state.craft, 1 - Math.exp(-dt * 6));

    // Pointer parallax.
    camera.position.copy(cur.pos);
    camera.lookAt(cur.focus);
    if (!reduced) {
      tmp.right.setFromMatrixColumn(camera.matrixWorld, 0);
      tmp.up.setFromMatrixColumn(camera.matrixWorld, 1);
      camera.position.addScaledVector(tmp.right, state.px * 0.16).addScaledVector(tmp.up, -state.py * 0.08);
      camera.lookAt(cur.focus);
    }
    applyShift();

    // Chair swivel: drag, inertia, then drift back to a gentle sway.
    if (!state.dragging) {
      state.yaw += state.yawVel * dt;
      state.yawVel *= Math.exp(-dt * 1.4);
      if (Math.abs(state.yawVel) < 0.25 && time - state.lastTouch > 2.5) {
        const rest = 0.5 + (reduced ? 0 : Math.sin(time * 0.35) * 0.22);
        const turns = Math.round((state.yaw - rest) / TAU);
        state.yaw = lerp(state.yaw, rest + turns * TAU, 1 - Math.exp(-dt * 1.2));
      }
    }
    chair.swivel.rotation.y = state.yaw;

    updateTools(time, dt);

    // Lights and glow. After hours, the house lights drop and the neon
    // takes over.
    cur.afterHours = settle ? state.afterHours : lerp(cur.afterHours, state.afterHours, 1 - Math.exp(-dt * 2.2));
    const A = ease(clamp(cur.afterHours, 0, 1));
    const house = P * (1 - 0.68 * A);
    const glow = 1 + 0.8 * A;
    state.poleBoost *= Math.exp(-dt * 0.6);
    poleUniforms.uTime.value += dt * (reduced ? 0.08 : 0.32) * (1 + state.poleBoost * 6);
    poleUniforms.uGlow.value = P;
    key.intensity = 26 * house;
    rim.intensity = 9 * P * (1 - 0.3 * A);
    for (const l of rows) l.intensity = 13 * house;
    showLight.intensity = 9 * P * (0.2 + cur.show * 0.8);
    hemi.intensity = 0.4 * house;
    bulbLight.intensity = 2.2 * house;
    poleLight.intensity = 1.4 * P;
    beam.mat.uniforms.uIntensity.value = 0.11 * house;
    for (const b of bulbs) b.userData.core.material.color.setRGB(9, 4.2, 1.6).multiplyScalar(P * (1 - 0.5 * A) * (reduced ? 1 : 0.96 + Math.sin(time * 9 + b.position.x * 10) * 0.04));

    // Neon: each sign stutters on after the lights, and the OPEN sign
    // buzzes now and then like an old tube.
    const since = time - state.introStart;
    const flick = state.neonFlicker > 0 ? (Math.random() > 0.5 ? 1 : 0.2) : 1;
    state.neonFlicker = Math.max(0, state.neonFlicker - dt);
    for (const sg of signs) {
      let n = neonLevel(since - sg.delay, P);
      if (sg.buzz && !reduced && n > 0.9) {
        if (time > sg.next) {
          sg.until = time + 0.35;
          sg.next = time + 5 + Math.random() * 7;
        }
        if (time < sg.until) n *= Math.random() > 0.45 ? 1 : 0.15;
      }
      sg.mat.color.setScalar(sg.base * n * flick * glow);
    }
    for (const h of halos) h.mat.color.copy(h.color).multiplyScalar(3.2 * neonLevel(since - h.delay, P) * glow);
    pinkLight.intensity = 2.2 * P * (0.7 + 1.3 * A);
    cyanLight.intensity = 2.0 * P * (0.7 + 1.3 * A);

    dust.update(time, dt, reduced, P);

    composer.render(dt);

    // Lower the resolution if frames are slow.
    frameAvg = lerp(frameAvg, dt * 1000, 0.05);
    if (frameAvg > 30 && pixelRatio > 1) {
      if (++slowFrames > 90) {
        pixelRatio = Math.max(1, pixelRatio - 0.25);
        resize();
        slowFrames = 0;
      }
    } else slowFrames = 0;
  }

  function neonLevel(since, P) {
    if (state.introStart < 0) return 0;
    if (reduced) return P;
    const s = since - 0.9;
    if (s < 0) return 0;
    if (s < 0.9) {
      // A few stutters before it holds.
      const pattern = [1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 1];
      return pattern[Math.floor(s * 14) % pattern.length] * 0.85;
    }
    return 1;
  }

  function applyShift() {
    camera.updateProjectionMatrix();
    const e = camera.projectionMatrix.elements;
    e[8] = -cur.shift.x;
    e[9] = -cur.shift.y;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(w, h);
    bloom.resolution.set(w, h);
  }

  // ---------------------------------------------------------------- picking
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function hitsChair(x, y) {
    ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObject(chair.group, true).length > 0;
  }

  await renderer.compileAsync(scene, camera).catch(() => {});
  resize();

  return {
    renderer,
    start() {
      if (running) return;
      running = true;
      clock.getDelta();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    intro() {
      state.introStart = clock.elapsedTime;
    },
    setView(fromName, toName, t) {
      state.from = VIEWS[fromName] || VIEWS.hero;
      state.to = VIEWS[toName] || state.from;
      state.t = t;
    },
    setCraft(p) {
      state.craft = p;
    },
    setPointer(x, y) {
      state.px = x;
      state.py = y;
    },
    hitsChair,
    grab() {
      state.dragging = true;
      state.yawVel = 0;
      state.lastTouch = clock.elapsedTime;
    },
    drag(dx, dtMs) {
      const d = dx * 0.012;
      state.yaw += d;
      state.yawVel = clamp(d / Math.max(dtMs / 1000, 0.008), -14, 14);
      state.lastTouch = clock.elapsedTime;
    },
    release() {
      state.dragging = false;
      state.lastTouch = clock.elapsedTime;
    },
    setAfterHours(on) {
      state.afterHours = on ? 1 : 0;
    },
    celebrate() {
      state.yawVel = reduced ? 0 : 13;
      state.lastTouch = clock.elapsedTime;
      state.poleBoost = 1;
      state.neonFlicker = 0.6;
    },
    resize,
  };
}

// ======================================================================
// Builders
// ======================================================================

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(canvas, { repeat = [1, 1], srgb = true, aniso = 1 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

// Small deterministic random so textures look the same on every visit.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeTextures(aniso) {
  const r = rng(7);

  // Black and white floor tiles, 50 cm, with grout and wear.
  const [fc, fg] = makeCanvas(512);
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) {
      const dark = (x + y) % 2 === 0;
      fg.fillStyle = dark ? '#141414' : '#b9b1a1';
      fg.fillRect(x * 256, y * 256, 256, 256);
      for (let i = 0; i < 900; i++) {
        fg.fillStyle = dark ? `rgba(255,255,255,${r() * 0.035})` : `rgba(60,45,30,${r() * 0.06})`;
        fg.fillRect(x * 256 + r() * 256, y * 256 + r() * 256, 1 + r() * 3, 1 + r() * 3);
      }
    }
  }
  fg.strokeStyle = '#0b0b0a';
  fg.lineWidth = 4;
  for (const p of [0, 256, 512]) {
    fg.beginPath();
    fg.moveTo(p, 0);
    fg.lineTo(p, 512);
    fg.moveTo(0, p);
    fg.lineTo(512, p);
    fg.stroke();
  }
  const floor = toTexture(fc, { repeat: [20, 20], aniso });

  // Leather grain (bump).
  const [lc, lg] = makeCanvas(256);
  const img = lg.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 110 + r() * 60;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  lg.putImageData(img, 0, 0);
  lg.globalAlpha = 0.35;
  lg.drawImage(lc, 1, 1);
  const leather = toTexture(lc, { repeat: [3, 3], srgb: false });

  // Channel tufting for the backrest (bump).
  const [tc, tg] = makeCanvas(256);
  for (let x = 0; x < 256; x++) {
    const v = Math.round(128 + 110 * Math.pow(Math.abs(Math.cos((x / 256) * Math.PI * 5)), 0.35) - 60);
    tg.fillStyle = `rgb(${v},${v},${v})`;
    tg.fillRect(x, 0, 1, 256);
  }
  tg.globalAlpha = 0.5;
  tg.drawImage(lc, 0, 0);
  const tufted = toTexture(tc, { srgb: false, repeat: [2, 2] });
  tufted.offset.set(0.5, 0);

  // Dark walnut panels.
  const [wc, wg] = makeCanvas(512);
  wg.fillStyle = '#24160d';
  wg.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 260; i++) {
    const x = r() * 512;
    wg.strokeStyle = `rgba(${r() > 0.5 ? '70,44,25' : '10,6,3'},${0.15 + r() * 0.3})`;
    wg.lineWidth = 0.5 + r() * 1.6;
    wg.beginPath();
    wg.moveTo(x, 0);
    wg.bezierCurveTo(x + r() * 8 - 4, 170, x + r() * 8 - 4, 340, x + r() * 6 - 3, 512);
    wg.stroke();
  }
  wg.fillStyle = 'rgba(0,0,0,0.65)';
  for (let x = 0; x < 512; x += 128) wg.fillRect(x, 0, 3, 512);
  const wood = toTexture(wc, { repeat: [24, 1], aniso });
  const woodSmall = toTexture(wc, { repeat: [2, 1], aniso });

  // Painted plaster.
  const [pc, pg] = makeCanvas(256);
  pg.fillStyle = '#ffffff';
  pg.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    pg.fillStyle = `rgba(0,0,0,${r() * 0.05})`;
    pg.fillRect(r() * 256, r() * 256, 2 + r() * 6, 2 + r() * 6);
  }
  const plaster = toTexture(pc, { repeat: [10, 3] });

  // Soft dot for dust.
  const [dc, dg] = makeCanvas(64);
  const grad = dg.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.4)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  dg.fillStyle = grad;
  dg.fillRect(0, 0, 64, 64);
  const dot = new THREE.CanvasTexture(dc);

  return { floor, leather, tufted, wood, woodSmall, plaster, dot };
}

function makeMaterials(T) {
  const leather = new THREE.MeshPhysicalMaterial({
    color: 0x5c1813,
    roughness: 0.5,
    bumpMap: T.leather,
    bumpScale: 0.6,
    clearcoat: 0.35,
    clearcoatRoughness: 0.35,
    sheen: 0.6,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(0xa0503e),
  });
  const leatherTufted = leather.clone();
  leatherTufted.bumpMap = T.tufted;
  leatherTufted.bumpScale = 3;

  return {
    floor: new THREE.MeshStandardMaterial({ map: T.floor, roughness: 0.36, metalness: 0, envMapIntensity: 0.7 }),
    wall: new THREE.MeshStandardMaterial({ color: 0x14302d, map: T.plaster, roughness: 0.92 }),
    wood: new THREE.MeshStandardMaterial({ map: T.wood, roughness: 0.55, color: 0xbbbbbb }),
    woodDark: new THREE.MeshStandardMaterial({ map: T.woodSmall, roughness: 0.5, color: 0x999999 }),
    marble: new THREE.MeshPhysicalMaterial({ color: 0xe6e0d4, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.1 }),
    towel: new THREE.MeshStandardMaterial({ color: 0xf1ece2, roughness: 1 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xf0f0f0, metalness: 1, roughness: 0.1 }),
    satin: new THREE.MeshStandardMaterial({ color: 0xc8cbcd, metalness: 1, roughness: 0.3 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xe6e9ec, metalness: 1, roughness: 0.16 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xd2a75a, metalness: 1, roughness: 0.26 }),
    leather,
    leatherTufted,
    porcelain: new THREE.MeshPhysicalMaterial({ color: 0xe2d9c6, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.85 }),
    ebony: new THREE.MeshPhysicalMaterial({ color: 0x1b1310, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12 }),
    blackChrome: new THREE.MeshPhysicalMaterial({ color: 0x15161a, metalness: 0.7, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08 }),
    ivory: new THREE.MeshPhysicalMaterial({ color: 0xe9dcc4, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.15 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.04,
      metalness: 0,
      transparent: true,
      opacity: 0.16,
      envMapIntensity: 2.4,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    amber: new THREE.MeshPhysicalMaterial({ color: 0x9a5214, roughness: 0.08, transparent: true, opacity: 0.78, clearcoat: 1, envMapIntensity: 1.5 }),
    liquid: new THREE.MeshPhysicalMaterial({ color: 0x1aa9b8, emissive: 0x0b5d66, emissiveIntensity: 0.6, roughness: 0.1, transparent: true, opacity: 0.88 }),
    bulbGlass: new THREE.MeshPhysicalMaterial({ color: 0xffd9a8, roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false, envMapIntensity: 2 }),
    mirrorFake: new THREE.MeshStandardMaterial({ color: 0x8c9696, metalness: 1, roughness: 0.04 }),
  };
}

// Merge a group's meshes into one mesh per material. Positions stay the
// same; `x` optionally moves the result along the wall.
function bake(group, x) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const rel = new THREE.Matrix4();
  const byMat = new Map();
  group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld));
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.clearGroups();
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(g);
  });
  const out = new THREE.Group();
  out.position.copy(group.position);
  out.quaternion.copy(group.quaternion);
  out.scale.copy(group.scale);
  if (x !== undefined) out.position.x = x;
  for (const [mat, geos] of byMat) {
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.castShadow = !mat.transparent;
    m.receiveShadow = true;
    out.add(m);
    geos.forEach((g) => g.dispose());
  }
  return out;
}

// Cabinet with a marble top and brass knobs; the main one has towels.
function buildStation(M, towels) {
  const g = new THREE.Group();
  g.add(mesh(new RoundedBoxGeometry(1.7, 0.86, 0.44, 3, 0.02), M.woodDark, 0, 0.45, -1.96));
  g.add(mesh(new RoundedBoxGeometry(1.82, 0.05, 0.5, 3, 0.02), M.marble, 0, 0.905, -1.95));
  for (let i = 0; i < 3; i++) g.add(mesh(new THREE.SphereGeometry(0.018, 16, 12), M.brass, -0.55 + i * 0.55, 0.62, -1.73));
  if (towels) {
    for (let i = 0; i < 3; i++) {
      const towel = mesh(new RoundedBoxGeometry(0.34, 0.06, 0.22, 3, 0.028), M.towel, -0.58, 0.96 + i * 0.058, -1.9);
      towel.rotation.y = (i - 1) * 0.06;
      g.add(towel);
    }
  } else {
    // A spray bottle and a folded cape.
    g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.17, 20), M.amber, 0.6, 1.015, -1.9));
    g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 10), M.ebony, 0.6, 1.125, -1.9));
    g.add(mesh(new RoundedBoxGeometry(0.4, 0.04, 0.26, 2, 0.018), M.rubber, -0.5, 0.95, -1.9));
  }
  return g;
}

// ---------------------------------------------------------------- chair

function buildChair(M) {
  const group = new THREE.Group();
  group.name = 'chair';

  // Pedestal and hydraulic column.
  group.add(mesh(new THREE.CylinderGeometry(0.37, 0.39, 0.045, 72), M.chrome, 0, 0.0225, 0));
  const lip = mesh(new THREE.TorusGeometry(0.37, 0.012, 12, 72), M.chrome, 0, 0.045, 0);
  lip.rotation.x = Math.PI / 2;
  group.add(lip);
  group.add(mesh(new THREE.CylinderGeometry(0.1, 0.21, 0.13, 56), M.chrome, 0, 0.11, 0));
  group.add(mesh(new THREE.CylinderGeometry(0.072, 0.072, 0.3, 40), M.chrome, 0, 0.32, 0));
  group.add(mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.055, 56), M.satin, 0, 0.475, 0));

  const swivel = new THREE.Group();
  swivel.position.y = 0.5;
  group.add(swivel);

  // Seat.
  swivel.add(mesh(new RoundedBoxGeometry(0.6, 0.16, 0.56, 4, 0.05), M.porcelain, 0, 0.09, 0));
  swivel.add(mesh(new RoundedBoxGeometry(0.54, 0.11, 0.53, 5, 0.05), M.leather, 0, 0.215, 0.01));
  const piping = mesh(new THREE.BoxGeometry(0.62, 0.012, 0.58), M.chrome, 0, 0.17, 0);
  swivel.add(piping);

  // Arms: porcelain sides, leather pads, chrome caps.
  for (const s of [-1, 1]) {
    swivel.add(mesh(new RoundedBoxGeometry(0.05, 0.3, 0.5, 3, 0.02), M.porcelain, s * 0.315, 0.26, -0.01));
    swivel.add(mesh(new RoundedBoxGeometry(0.095, 0.06, 0.58, 4, 0.028), M.leather, s * 0.32, 0.435, 0.02));
    const cap = mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.05, 28), M.chrome, s * 0.32, 0.435, 0.32);
    cap.rotation.x = Math.PI / 2;
    swivel.add(cap);
    const strut = mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.18, 14), M.chrome, s * 0.32, 0.33, 0.26);
    swivel.add(strut);
  }

  // Backrest, tilted back, with headrest.
  const back = new THREE.Group();
  back.position.set(0, 0.2, -0.25);
  back.rotation.x = -0.2;
  swivel.add(back);
  const shell = mesh(extrude(archShape(0.58, 0.72, 0.22, 0.04), 0.03, 0.012), M.porcelain, 0, 0.01, -0.06);
  back.add(shell);
  const pad = mesh(extrude(archShape(0.49, 0.62, 0.18, 0.05), 0.05, 0.028), M.leatherTufted, 0, 0.05, 0.0);
  back.add(pad);
  for (const s of [-1, 1]) back.add(mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.2, 12), M.chrome, s * 0.08, 0.76, -0.035));
  back.add(mesh(new RoundedBoxGeometry(0.31, 0.12, 0.09, 4, 0.042), M.leather, 0, 0.86, -0.005));

  // Footrest.
  const foot = new THREE.Group();
  foot.position.set(0, 0.03, 0.26);
  swivel.add(foot);
  for (const s of [-1, 1]) {
    const bar = mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.42, 12), M.chrome, s * 0.18, -0.16, 0.12);
    bar.rotation.x = 0.62;
    foot.add(bar);
  }
  const plate = mesh(new RoundedBoxGeometry(0.46, 0.022, 0.21, 2, 0.008), M.chrome, 0, -0.335, 0.25);
  plate.rotation.x = -0.18;
  foot.add(plate);
  for (let i = 0; i < 4; i++) {
    const tread = mesh(new THREE.BoxGeometry(0.4, 0.008, 0.018), M.rubber, 0, -0.318 - i * 0.008 * 0.18, 0.18 + i * 0.045);
    tread.rotation.x = -0.18;
    foot.add(tread);
  }
  foot.add(mesh(new THREE.BoxGeometry(0.12, 0.03, 0.006), M.brass, 0, -0.33, 0.36));

  // Pump lever.
  const lever = mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.3, 12), M.chrome, 0.36, -0.1, 0.1);
  lever.rotation.z = -0.55;
  swivel.add(lever);
  swivel.add(mesh(new THREE.SphereGeometry(0.028, 20, 14), M.ebony, 0.44, 0.02, 0.1));

  return { group, swivel };
}

// A rectangle with a rounded top, origin at the bottom centre.
function archShape(w, h, rTop, rBottom) {
  const s = new THREE.Shape();
  const x = w / 2;
  s.moveTo(-x + rBottom, 0);
  s.lineTo(x - rBottom, 0);
  s.quadraticCurveTo(x, 0, x, rBottom);
  s.lineTo(x, h - rTop);
  s.quadraticCurveTo(x, h, x - rTop, h);
  s.lineTo(-x + rTop, h);
  s.quadraticCurveTo(-x, h, -x, h - rTop);
  s.lineTo(-x, rBottom);
  s.quadraticCurveTo(-x, 0, -x + rBottom, 0);
  return s;
}

// ---------------------------------------------------------------- pole

function buildPole(M, uniforms) {
  const g = new THREE.Group();

  const stripes = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uGlow;
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vV;
      vec3 bandColor(float k) {
        vec3 red = vec3(0.78, 0.03, 0.04);
        vec3 white = vec3(0.95, 0.92, 0.86);
        vec3 blue = vec3(0.03, 0.1, 0.5);
        return k < 0.5 ? red : (k < 1.5 ? white : (k < 2.5 ? blue : white));
      }
      void main() {
        float s = vUv.x * 2.0 + vUv.y * 2.4 - uTime;
        float f = fract(s) * 4.0;
        float k = floor(f);
        float fr = fract(f);
        float w = fwidth(f) * 1.2;
        vec3 col = mix(bandColor(k), bandColor(mod(k + 1.0, 4.0)), smoothstep(1.0 - w, 1.0, fr));
        float facing = clamp(dot(vN, vV), 0.0, 1.0);
        col *= (0.25 + 1.05 * pow(facing, 0.8)) * (0.15 + 1.25 * uGlow);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });

  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.72, 64, 1, true), stripes));
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.76, 64, 1, true), M.glass);
  g.add(glass);

  g.add(mesh(new THREE.CylinderGeometry(0.105, 0.1, 0.055, 48), M.chrome, 0, 0.405, 0));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.088, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), M.chrome);
  dome.position.y = 0.43;
  g.add(dome);
  g.add(mesh(new THREE.SphereGeometry(0.022, 20, 14), M.chrome, 0, 0.535, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.105, 0.055, 48), M.chrome, 0, -0.405, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.06, 40), M.chrome, 0, -0.46, 0));
  g.add(mesh(new THREE.SphereGeometry(0.03, 20, 14), M.chrome, 0, -0.51, 0));

  for (const y of [0.3, -0.3]) {
    g.add(mesh(new THREE.BoxGeometry(0.03, 0.03, 0.2), M.chrome, 0, y, -0.12));
    const collar = mesh(new THREE.TorusGeometry(0.093, 0.008, 8, 48), M.chrome, 0, y, 0);
    collar.rotation.x = Math.PI / 2;
    g.add(collar);
    const plate = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.016, 28), M.chrome, 0, y, -0.215);
    plate.rotation.x = Math.PI / 2;
    g.add(plate);
  }
  return g;
}

// ---------------------------------------------------------------- props

function buildBulb(M) {
  const g = new THREE.Group();
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 4, 6), M.rubber);
  cord.position.y = 2.1;
  g.add(cord);
  g.add(mesh(new THREE.CylinderGeometry(0.024, 0.02, 0.07, 20), M.brass, 0, 0.085, 0));
  const glass = new THREE.Mesh(new THREE.SphereGeometry(0.06, 28, 20), M.bulbGlass);
  glass.scale.set(1, 1.25, 1);
  g.add(glass);
  const core = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.0035, 6, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  core.rotation.x = Math.PI / 2;
  g.add(core);
  g.userData.core = core;
  return g;
}

function buildShelf(M) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(1.25, 0.04, 0.24), M.woodDark, 0, 0, 0));
  for (const x of [-0.5, 0.5]) {
    g.add(mesh(new THREE.BoxGeometry(0.02, 0.14, 0.02), M.brass, x, -0.08, -0.1));
    const brace = mesh(new THREE.BoxGeometry(0.015, 0.2, 0.015), M.brass, x, -0.07, -0.03);
    brace.rotation.x = 0.75;
    g.add(brace);
  }

  // Jar of blue disinfectant with combs.
  const jar = new THREE.Group();
  jar.position.set(-0.45, 0.02, 0);
  jar.add(new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.24, 40, 1, true), M.glass).translateY(0.12));
  jar.add(mesh(new THREE.CylinderGeometry(0.061, 0.061, 0.18, 32), M.liquid, 0, 0.09, 0));
  jar.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.025, 32), M.chrome, 0, 0.25, 0));
  jar.add(mesh(new THREE.CylinderGeometry(0.067, 0.067, 0.012, 32), M.chrome, 0, 0.006, 0));
  for (let i = 0; i < 3; i++) {
    const c = mesh(new THREE.BoxGeometry(0.018, 0.2, 0.004), i === 1 ? M.ivory : M.ebony, (i - 1) * 0.02, 0.12, (i - 1) * 0.012);
    c.rotation.z = (i - 1) * 0.12;
    jar.add(c);
  }
  g.add(jar);

  // Amber tonic bottles.
  const profile = [
    [0, 0], [0.042, 0], [0.045, 0.01], [0.045, 0.13], [0.038, 0.155], [0.016, 0.175], [0.015, 0.2], [0, 0.2],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const bottleGeo = new THREE.LatheGeometry(profile, 40);
  for (const [x, s] of [[-0.2, 1], [-0.08, 0.85]]) {
    const b = mesh(bottleGeo, M.amber, x, 0.02, 0.02);
    b.scale.setScalar(s);
    g.add(b);
    g.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.035, 20), M.ebony, x, 0.02 + 0.215 * s, 0.02));
  }

  // Pomade tins.
  for (const [x, y] of [[0.12, 0.02], [0.25, 0.02], [0.185, 0.06]]) {
    g.add(mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.036, 36), M.blackChrome, x, y + 0.018, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.054, 0.054, 0.01, 36), M.brass, x, y + 0.04, 0));
  }

  // Shaving brush on a stand.
  const brush = new THREE.Group();
  brush.position.set(0.45, 0.02, 0);
  const handle = [
    [0, 0], [0.024, 0], [0.026, 0.01], [0.02, 0.04], [0.022, 0.07], [0.028, 0.075], [0, 0.075],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  brush.add(mesh(new THREE.LatheGeometry(handle, 28), M.ivory));
  const knot = [
    [0, 0.075], [0.024, 0.075], [0.034, 0.1], [0.04, 0.13], [0.034, 0.155], [0.018, 0.168], [0, 0.17],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  brush.add(mesh(new THREE.LatheGeometry(knot, 28), new THREE.MeshStandardMaterial({ color: 0x8f7b66, roughness: 1 })));
  g.add(brush);

  return g;
}

function buildBeam(from, to) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const h = dir.length() + 0.3;
  const geo = new THREE.ConeGeometry(Math.tan(0.4) * h, h, 64, 1, true);
  geo.translate(0, -h / 2, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(1.0, 0.82, 0.58) }, uIntensity: { value: 0 } },
    vertexShader: /* glsl */ `
      varying float vY;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vY = uv.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying float vY;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.2);
        float fall = smoothstep(0.0, 0.35, vY) * mix(0.35, 1.0, vY);
        gl_FragColor = vec4(uColor * edge * fall * uIntensity, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(from);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
  return { mesh: m, mat };
}

function buildDust(dot, count) {
  const r = rng(11);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = r() * TAU;
    const rad = Math.sqrt(r()) * 1.4;
    pos[i * 3] = Math.cos(a) * rad;
    pos[i * 3 + 1] = 0.2 + r() * 3.8;
    pos[i * 3 + 2] = Math.sin(a) * rad + 0.2;
    seed[i] = r() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.016,
    map: dot,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    sizeAttenuation: true,
    fog: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;

  return {
    points,
    update(time, dt, reduced, power) {
      for (let i = 0; i < count; i++) {
        const j = i * 3;
        if (!reduced) {
          pos[j + 1] += dt * (0.02 + (seed[i] % 1) * 0.04);
          pos[j] += Math.sin(time * 0.3 + seed[i]) * dt * 0.02;
          pos[j + 2] += Math.cos(time * 0.25 + seed[i]) * dt * 0.02;
          if (pos[j + 1] > 4) pos[j + 1] = 0.2;
        }
        // Brighter near the centre of the beam.
        const y = pos[j + 1];
        const beamR = Math.max(0.05, (4.7 - y) * 0.27);
        const d = Math.hypot(pos[j], pos[j + 2] - 0.2) / beamR;
        const tw = 0.6 + 0.4 * Math.sin(time * 2 + seed[i] * 7);
        const b = Math.max(0, 1 - d) * tw * power * 1.6;
        col[j] = b;
        col[j + 1] = b * 0.85;
        col[j + 2] = b * 0.62;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
  };
}

async function neonTextures() {
  const fontsReady = Promise.all([
    document.fonts.load('400 200px "Neonderthaw"'),
    document.fonts.load('800 120px "Big Shoulders Display"'),
    document.fonts.load('600 52px "Big Shoulders Display"'),
  ]);
  await Promise.race([fontsReady, new Promise((r) => setTimeout(r, 1800))]).catch(() => {});

  // Layers of blur build the glow; the last pass is the hot white core.
  const glowPasses = (g, rgb, draw, k = 1) => {
    for (const [blur, alpha] of [[44, 0.45], [20, 0.75], [8, 1]]) {
      g.shadowColor = `rgba(${rgb}, 1)`;
      g.shadowBlur = blur * k;
      draw(`rgba(${rgb}, ${alpha})`);
    }
    g.shadowBlur = 0;
    draw('rgba(255, 240, 248, 0.95)', true);
  };
  const PINK = '255, 70, 140';
  const CYAN = '70, 225, 255';

  // Shop name in a tube script, with an underline swash.
  const [mc, mg] = makeCanvas(1024, 384);
  mg.textAlign = 'center';
  mg.textBaseline = 'middle';
  mg.font = '400 210px "Neonderthaw", "Brush Script MT", cursive';
  glowPasses(mg, PINK, (style, core) => {
    mg.fillStyle = style;
    if (core) {
      mg.save();
      mg.globalAlpha = 0.6;
    }
    mg.fillText('Barbershop', 512, 160);
    if (core) mg.restore();
  });
  glowPasses(
    mg,
    CYAN,
    (style) => {
      mg.strokeStyle = style;
      mg.lineWidth = 6;
      mg.lineCap = 'round';
      mg.beginPath();
      mg.moveTo(210, 286);
      mg.bezierCurveTo(400, 250, 640, 320, 830, 268);
      mg.stroke();
    },
    0.8
  );
  mg.font = '600 40px "Big Shoulders Display", "Arial Narrow", sans-serif';
  if ('letterSpacing' in mg) mg.letterSpacing = '16px';
  glowPasses(mg, CYAN, (style) => {
    mg.fillStyle = style;
    mg.fillText('ATHENS · EST. 2012', 520, 340);
  }, 0.5);

  // Scissors drawn as one tube.
  const [sc, sg] = makeCanvas(512, 512);
  glowPasses(sg, CYAN, (style) => {
    sg.strokeStyle = style;
    sg.lineWidth = 9;
    sg.lineCap = 'round';
    sg.lineJoin = 'round';
    sg.beginPath();
    sg.arc(176, 372, 52, 0, Math.PI * 2);
    sg.moveTo(388, 372);
    sg.arc(336, 372, 52, 0, Math.PI * 2);
    // Blades cross at the pivot and taper to points.
    sg.moveTo(212, 334);
    sg.quadraticCurveTo(300, 230, 384, 72);
    sg.quadraticCurveTo(318, 200, 262, 262);
    sg.moveTo(300, 334);
    sg.quadraticCurveTo(212, 230, 128, 72);
    sg.quadraticCurveTo(194, 200, 250, 262);
    sg.stroke();
    sg.beginPath();
    sg.arc(256, 268, 7, 0, Math.PI * 2);
    sg.stroke();
  });

  // OPEN in red letters inside a blue frame.
  const [oc, og] = makeCanvas(512, 256);
  glowPasses(og, CYAN, (style) => {
    og.strokeStyle = style;
    og.lineWidth = 8;
    og.beginPath();
    if (og.roundRect) og.roundRect(34, 34, 444, 188, 40);
    else og.rect(34, 34, 444, 188);
    og.stroke();
  }, 0.7);
  og.textAlign = 'center';
  og.textBaseline = 'middle';
  og.font = '800 128px "Big Shoulders Display", "Arial Narrow", sans-serif';
  if ('letterSpacing' in og) og.letterSpacing = '14px';
  glowPasses(og, '255, 60, 70', (style, core) => {
    og.fillStyle = style;
    if (core) {
      og.save();
      og.globalAlpha = 0.5;
    }
    og.fillText('OPEN', 263, 134);
    if (core) og.restore();
  });

  const tex = (c) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { main: tex(mc), scissors: tex(sc), open: tex(oc) };
}

// ---------------------------------------------------------------- tools

function extrude(shape, depth, bevel = 0.0012) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 24,
  });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  return geo;
}

function buildRazor(M) {
  const group = new THREE.Group();
  const inner = new THREE.Group();
  group.add(inner);
  inner.position.x = -0.02;

  // Scales: a slim coffin shape.
  const sc = new THREE.Shape();
  sc.moveTo(-0.24, -0.016);
  sc.quadraticCurveTo(-0.255, 0, -0.24, 0.016);
  sc.lineTo(0.2, 0.026);
  sc.quadraticCurveTo(0.245, 0.024, 0.245, 0);
  sc.quadraticCurveTo(0.245, -0.024, 0.2, -0.026);
  sc.closePath();
  const scaleGeo = extrude(sc, 0.005, 0.0016);
  for (const z of [-0.0062, 0.0062]) inner.add(mesh(scaleGeo, M.ebony, 0, 0, z));
  inner.add(mesh(new THREE.BoxGeometry(0.03, 0.026, 0.008), M.ebony, -0.225, 0, 0));
  for (const x of [0.215, -0.225]) {
    const pin = mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.022, 16), M.brass, x, 0, 0);
    pin.rotation.x = Math.PI / 2;
    inner.add(pin);
  }

  // Blade on a pivot.
  const pivot = new THREE.Group();
  pivot.position.set(0.215, 0, 0);
  inner.add(pivot);
  const bl = new THREE.Shape();
  bl.moveTo(0.022, 0.008);
  bl.lineTo(-0.035, 0.013);
  bl.lineTo(-0.3, 0.013);
  bl.quadraticCurveTo(-0.322, 0.0, -0.302, -0.034);
  bl.lineTo(-0.06, -0.04);
  bl.quadraticCurveTo(-0.032, -0.012, 0.0, -0.01);
  bl.lineTo(0.022, -0.006);
  bl.closePath();
  pivot.add(mesh(extrude(bl, 0.0026, 0.0006), M.steel));
  // Polished edge strip.
  const edge = mesh(new THREE.BoxGeometry(0.24, 0.006, 0.0018), M.chrome, -0.18, -0.037, 0);
  edge.rotation.z = 0.025;
  pivot.add(edge);

  return {
    group,
    animate(time, dt, focus, reduced) {
      const idle = reduced ? 0.6 : 0.55 + 0.45 * Math.sin(time * 0.6);
      const open = lerp(idle, 1, focus);
      pivot.rotation.z = -open * (Math.PI + 0.32);
      inner.position.x = lerp(-0.02, -0.17, open);
    },
  };
}

function buildShears(M) {
  const group = new THREE.Group();
  const halves = [];
  for (const side of [1, -1]) {
    const half = new THREE.Group();
    half.scale.y = side;
    half.position.z = side * 0.0028;
    const bl = new THREE.Shape();
    bl.moveTo(-0.03, 0.013);
    bl.lineTo(0.12, 0.012);
    bl.quadraticCurveTo(0.25, 0.008, 0.3, 0.0015);
    bl.lineTo(0.3, -0.001);
    bl.lineTo(0.0, -0.004);
    bl.lineTo(-0.03, -0.004);
    bl.closePath();
    half.add(mesh(extrude(bl, 0.0034, 0.0007), M.steel));
    const shank = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.025, 0.005, 0),
      new THREE.Vector3(-0.08, 0.016, 0),
      new THREE.Vector3(-0.13, 0.034, 0),
    ]);
    half.add(mesh(new THREE.TubeGeometry(shank, 20, 0.0055, 10), M.steel));
    const ring = mesh(new THREE.TorusGeometry(0.026, 0.0062, 14, 40), M.steel, -0.16, 0.045, 0);
    half.add(ring);
    if (side === 1) {
      const tang = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.17, 0.07, 0),
        new THREE.Vector3(-0.2, 0.085, 0),
        new THREE.Vector3(-0.225, 0.08, 0),
      ]);
      half.add(mesh(new THREE.TubeGeometry(tang, 12, 0.004, 8), M.steel));
    }
    group.add(half);
    halves.push(half);
  }
  const screw = mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.014, 20), M.brass);
  screw.rotation.x = Math.PI / 2;
  group.add(screw);
  group.children.forEach((c) => (c.position.x -= 0.035));

  return {
    group,
    animate(time, dt, focus, reduced) {
      const snip = reduced ? 0.5 : Math.pow(0.5 + 0.5 * Math.sin(time * (2 + focus * 2.5)), 3);
      const a = lerp(0.1, 0.06 + snip * 0.32, focus) + (1 - focus) * 0.06;
      halves[0].rotation.z = a;
      halves[1].rotation.z = -a;
    },
  };
}

function buildClipper(M) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  body.rotation.z = -Math.PI / 2;
  body.position.x = -0.2;
  group.add(body);

  const profile = [
    [0, 0], [0.028, 0], [0.04, 0.012], [0.046, 0.05], [0.049, 0.16], [0.05, 0.27], [0.047, 0.33], [0.044, 0.37], [0.04, 0.385], [0, 0.385],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const shell = mesh(new THREE.LatheGeometry(profile, 48), M.blackChrome);
  shell.scale.z = 0.74;
  body.add(shell);
  for (const y of [0.06, 0.29]) {
    const band = mesh(new THREE.TorusGeometry(0.0495, 0.004, 10, 48), M.brass, 0, y, 0);
    band.rotation.x = Math.PI / 2;
    band.scale.y = 0.74;
    body.add(band);
  }
  body.add(mesh(new RoundedBoxGeometry(0.024, 0.05, 0.012, 2, 0.005), M.brass, 0, 0.2, 0.036));
  body.add(mesh(new RoundedBoxGeometry(0.03, 0.09, 0.01, 2, 0.004), M.brass, 0, 0.13, 0.034));
  const lever = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 10), M.chrome, 0.05, 0.33, 0);
  lever.rotation.z = Math.PI / 2;
  body.add(lever);

  // Blade set and teeth.
  body.add(mesh(new RoundedBoxGeometry(0.1, 0.022, 0.04, 2, 0.004), M.steel, 0, 0.395, 0.004));
  const teethGeo = new THREE.BoxGeometry(0.0032, 0.018, 0.012);
  const teeth = new THREE.InstancedMesh(teethGeo, M.chrome, 22);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 22; i++) {
    m4.makeTranslation(-0.047 + i * 0.00448, 0.412, 0.016);
    teeth.setMatrixAt(i, m4);
  }
  teeth.castShadow = true;
  body.add(teeth);

  // Short cord.
  const cord = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.005, 0),
    new THREE.Vector3(0, -0.05, 0),
    new THREE.Vector3(0.03, -0.11, 0.02),
    new THREE.Vector3(0.09, -0.14, -0.01),
  ]);
  body.add(mesh(new THREE.TubeGeometry(cord, 24, 0.007, 8), M.rubber));

  const base = body.position.clone();
  return {
    group,
    animate(time, dt, focus, reduced) {
      const buzz = reduced ? 0 : focus * 0.0016;
      body.position.set(base.x + (Math.random() - 0.5) * buzz, base.y + (Math.random() - 0.5) * buzz, base.z);
    },
  };
}

function buildComb(M) {
  const group = new THREE.Group();
  group.add(mesh(new RoundedBoxGeometry(0.42, 0.032, 0.0075, 2, 0.0035), M.ivory, 0, 0.026, 0));
  const xs = [];
  let x = -0.19;
  for (let i = 0; i < 14; i++, x += 0.0125) xs.push(x);
  for (let i = 0; i < 26; i++, x += 0.0078) xs.push(x);
  const shift = (xs[0] + xs[xs.length - 1]) / 2;
  const toothGeo = new THREE.BoxGeometry(0.0046, 0.06, 0.0058);
  toothGeo.translate(0, -0.03, 0);
  const teeth = new THREE.InstancedMesh(toothGeo, M.ivory, xs.length);
  const m4 = new THREE.Matrix4();
  xs.forEach((px, i) => {
    m4.makeTranslation(px - shift, 0.012, 0);
    teeth.setMatrixAt(i, m4);
  });
  teeth.castShadow = true;
  group.add(teeth);
  group.add(mesh(new THREE.BoxGeometry(0.05, 0.006, 0.0082), M.brass, 0.16, 0.028, 0));
  return {
    group,
    animate() {},
  };
}
