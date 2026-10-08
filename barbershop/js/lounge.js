// Lounge, reception and waiting area, and ceiling fans.
//
// Lounge, right of the chairs (x 8.6–14.5): a Chesterfield sofa between two
// brass sconces, a bar cart with whisky, framed posters and a jukebox whose
// arch and bubble tubes cycle colour while a record turns behind the glass.
// Reception, left of the chairs (x -9 to -5.3): a fluted walnut desk with a
// brass cash register that rings up a sale now and then, a bell, a banker's
// lamp and the appointment book; club chairs, a coffee table and a rug; a
// coat stand, a palm and a schoolhouse clock showing the visitor's time.
// Fans turn overhead. Static furniture is baked per area, and every printed
// thing (posters, rug, clock face, magazines…) shares one canvas atlas.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { SHOP } from './config.js';
import { mesh, bake, makeCanvas, rng, extrude, archShape, neonLevel, TAU, clamp, lerp, ease } from './kit.js';

// Placements: x, y, z and rotation about y.
const SOFA = [9.7, 0, -1.76, 0];
const CART = [11.3, 0, -1.93, 0];
const SCONCES = [8.66, 10.74]; // x, either side of the sofa
const JUKEBOX = [13.98, 0, -1.78, -0.3];
const DESK = [-6.45, 0, 0.7, 0.55];
const REGISTER = [-0.36, 1.02, -0.02, 0.1]; // on the desk
const CLOCK = [-7.3, 2.3, -2.2, 0];
const PALM = [-5.6, 0, -1.7, 0];
const FANS = [[-6.9, -0.4], [1.5, 0.6], [11, 1.5]]; // x, z

// The one extra light (desktop only) follows the camera to whichever area
// it is looking at, so both get a real key light for the price of one.
const SPOTS = {
  reception: { pos: [-5.5, 4.3, 2.9], target: [-7.2, 0.6, -0.9], angle: 0.58, power: 15 },
  lounge: { pos: [9.9, 4.3, 0.9], target: [10.4, 0.5, -1.9], angle: 0.5, power: 13 },
};

const UP = new THREE.Vector3(0, 1, 0);

export async function createLounge(ctx) {
  const { M, tier } = ctx;
  await loadFonts();
  const art = paintArt();
  const L = makeMaterials(M, art);
  const root = new THREE.Group();
  const warm = []; // light pools from lamps and picture lights
  const jukeGlow = []; // coloured light around the jukebox

  // ------------------------------------------------------------ lounge
  const lounge = new THREE.Group();
  lounge.add(place(buildSofa(M), SOFA), place(buildBarCart(M, L), CART));
  for (const x of SCONCES) {
    lounge.add(place(buildSconce(M, L), [x, 1.62, -2.2, 0]));
    warm.push({ p: [x, 2.0, -2.196], s: [0.75, 1.0] }, { p: [x, 1.45, -2.196], s: [0.45, 0.5] });
  }
  for (const [rect, x, y, w, h, frame] of [
    [ART.eight, 9.2, 1.84, 0.5, 0.694, M.ebony],
    [ART.shave, 10.2, 1.84, 0.5, 0.694, M.brass],
    [ART.rules, 11.3, 1.78, 0.32, 0.427, M.brass],
    [ART.rhythm, 13.95, 2.04, 0.42, 0.583, M.ebony],
  ]) {
    lounge.add(buildPoster(M, L, rect, x, y, w, h, frame));
    warm.push({ p: [x, y + h / 2 + 0.05, -2.196], s: [w * 2.1, h * 1.2] });
  }
  const jukebox = buildJukebox(M, L);
  lounge.add(place(jukebox.body, JUKEBOX));
  jukeGlow.push(
    { p: [13.62, 0.005, -1.05], s: [2.8, 2.1], up: true },
    { p: [13.95, 1.55, -2.197], s: [2.2, 2.0] },
    { p: [13.95, 0.62, -2.155], s: [2.0, 1.0] }
  );
  root.add(bake(lounge));
  const jukeMoving = place(new THREE.Group(), JUKEBOX);
  jukeMoving.add(jukebox.deck);
  root.add(jukeMoving);

  // ------------------------------------------------------------ reception
  const reception = new THREE.Group();
  const desk = place(buildDesk(M, L), DESK);
  const register = buildRegister(M, L);
  desk.add(place(register.body, REGISTER));
  reception.add(desk);
  desk.updateMatrixWorld(true);
  const lampPool = desk.localToWorld(new THREE.Vector3(0.5, 1.024, -0.04));
  warm.push({ p: lampPool.toArray(), s: [0.8, 0.62], up: true, ry: DESK[3] });

  reception.add(buildRug(L), place(buildCoffeeTable(M, L), [-7.4, 0, -0.8, 0.3]));
  for (const [x, z, ry] of [[-8.15, -1.35, 0.5], [-6.65, -1.45, -0.5]]) reception.add(place(buildClubChair(M), [x, 0, z, ry]));
  const palm = buildPalm(M, L);
  reception.add(place(buildCoatStand(M, L), [-8.7, 0, 0.3, 0.4]), place(palm.pot, PALM));
  root.add(place(palm.leaves, PALM));
  for (const [rect, x, y, w, h, frame] of [
    [ART.tonic, -8.65, 1.86, 0.5, 0.694, L.lacquer],
    [ART.hours, -6.5, 1.84, 0.46, 0.638, M.brass],
  ]) {
    reception.add(buildPoster(M, L, rect, x, y, w, h, frame));
    warm.push({ p: [x, y + h / 2 + 0.05, -2.196], s: [w * 2.1, h * 1.2] });
  }
  const clock = buildClock(M, L);
  reception.add(place(clock.body, CLOCK));
  root.add(bake(reception));

  const deskMoving = place(new THREE.Group(), DESK);
  deskMoving.add(place(register.moving, REGISTER));
  const clockMoving = place(new THREE.Group(), CLOCK);
  clockMoving.add(clock.moving);
  root.add(deskMoving, clockMoving);

  // ------------------------------------------------------------ fans
  const fanBodies = new THREE.Group();
  const rotors = FANS.map(([x, z]) => {
    const fan = buildFan(M, L);
    fanBodies.add(place(fan.body, [x, 3.62, z, 0]));
    const rotor = place(bake(fan.rotor), [x, 3.62, z, x]);
    root.add(rotor);
    return rotor;
  });
  root.add(bake(fanBodies));

  root.add(buildPools(warm, L.pool, 0xffc690), buildPools(jukeGlow, L.jukePool, 0xffffff));

  // Far from the key light: no point casting or sampling its shadow.
  root.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = false;
  });

  let spot = null;
  if (tier === 2) {
    spot = new THREE.SpotLight(0xffd6a8, 0, 0, 0.6, 0.75, 1.6);
    root.add(spot, spot.target);
  }

  const tz = new Date().getTimezoneOffset() * 60000;
  const tint = new THREE.Color();
  let spin = 0;

  function update(dt, time, env) {
    const P = env.power;
    const move = !env.reduced;
    // Picture lights, lamps and fan globes are house lights; they dim after
    // hours, but less than the overheads, so the walls keep some colour.
    const fixture = P * (1 - 0.45 * env.afterHours);
    L.print.emissiveIntensity = 0.62 * fixture;
    L.glow.color.setRGB(4.2, 2.5, 1.2).multiplyScalar(fixture);
    L.frosted.emissiveIntensity = 1.05 * fixture;
    L.bankers.emissiveIntensity = 1.6 * P;
    L.pool.color.setScalar(0.55 * fixture);

    // The jukebox flickers on after the neon, then cycles its colours. It
    // takes only part of the after-hours boost so its colours don't wash out.
    const level = neonLevel(env.since === null ? null : env.since - 2.1, P, env.reduced) * lerp(1, env.glow, 0.6);
    const u = L.jukeUniforms;
    u.uLevel.value = level;
    if (move) u.uTime.value += dt;
    L.chamber.color.setRGB(2.2, 1.3, 0.7).multiplyScalar(level);
    L.jukePool.color.copy(jukeColor(0.3 - u.uTime.value * 0.07, tint)).multiplyScalar(0.4 * level);
    L.vinyl.emissiveIntensity = 0.5 * level;
    spin = lerp(spin, move && level > 0.5 ? 3.5 : 0, 1 - Math.exp(-dt * 1.2));
    jukebox.record.rotation.y -= spin * dt;

    if (move) {
      for (const r of rotors) r.rotation.y += dt * 1.9;
      // The palm stirs in the draught from the fan above it.
      palm.leaves.rotation.x = 0.012 * Math.sin(time * 1.3);
      palm.leaves.rotation.z = 0.009 * Math.sin(time * 0.9 + 1);
    }
    updateClock(clock, Date.now() - tz, env.reduced);
    updateRegister(register, time, env.reduced);
    if (spot) aimSpot(spot, env);
  }

  return { group: root, update };
}

// Moves the spot to the area the camera is in and fades it in as the
// camera arrives, so it never pops.
function aimSpot(spot, env) {
  const x = env.camera.position.x;
  const lounge = x > 3;
  const s = lounge ? SPOTS.lounge : SPOTS.reception;
  if (spot.userData.at !== s) {
    spot.userData.at = s;
    spot.position.fromArray(s.pos);
    spot.target.position.fromArray(s.target);
    spot.angle = s.angle;
  }
  const near = lounge ? clamp((x - 5) / 3, 0, 1) : clamp((-x - 1.5) / 2.5, 0, 1);
  spot.intensity = s.power * env.house * ease(near);
}

// ======================================================================
// Helpers
// ======================================================================

function place(obj, [x, y, z, ry]) {
  obj.position.set(x, y, z);
  obj.rotation.y = ry;
  return obj;
}

// LatheGeometry from [radius, height] pairs.
function lathe(points, segments = 32) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

// A tube through [x, y, z] points.
function tube(points, radius, segments = 48, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  return new THREE.TubeGeometry(curve, segments, radius, radial);
}

// A cylinder from a to b.
function rod(a, b, radius, mat, radial = 10) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const m = mesh(new THREE.CylinderGeometry(radius, radius, va.distanceTo(vb), radial), mat);
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, vb.sub(va).normalize());
  return m;
}

// Points up one side, over a half circle and down the other.
function archPoints(halfW, yBottom, yCentre, z) {
  const pts = [];
  for (let i = 0; i < 4; i++) pts.push([-halfW, lerp(yBottom, yCentre, i / 4), z]);
  for (let i = 0; i <= 24; i++) {
    const a = Math.PI * (1 - i / 24);
    pts.push([Math.cos(a) * halfW, yCentre + Math.sin(a) * halfW, z]);
  }
  for (let i = 3; i >= 0; i--) pts.push([halfW, lerp(yBottom, yCentre, i / 4), z]);
  return pts;
}

// A round-topped outline, origin at the bottom centre.
function domeShape(w, h, y0 = 0, path = new THREE.Shape()) {
  const r = w / 2;
  path.moveTo(-r, y0);
  path.lineTo(r, y0);
  path.lineTo(r, y0 + h - r);
  path.absarc(0, y0 + h - r, r, 0, Math.PI, false);
  path.lineTo(-r, y0);
  return path;
}

// Stretches a flat geometry's uvs to 0..1 over its bounding box.
function fitUv(geo) {
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  const p = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - min.x) / (max.x - min.x), (p.getY(i) - min.y) / (max.y - min.y));
  return geo;
}

// Maps a geometry's 0..1 uvs into one region of the art atlas.
function atlas(geo, [x, y, w, h]) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (x + uv.getX(i) * w) / ATLAS, 1 - (y + (1 - uv.getY(i)) * h) / ATLAS);
  }
  return geo;
}

// Soft additive light pools on the floor, the wall or the desk: cheap
// stand-ins for light falling from lamps that are not real lights.
function buildPools(list, mat, color) {
  const c = new THREE.Color(color);
  const geos = list.map(({ p, s, up, ry = 0 }) => {
    const geo = new THREE.PlaneGeometry(s[0], s[1]);
    if (up) geo.rotateX(-Math.PI / 2);
    geo.rotateY(ry);
    geo.translate(p[0], p[1], p[2]);
    const col = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) c.toArray(col, i);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  });
  const m = new THREE.Mesh(mergeGeometries(geos), mat);
  m.renderOrder = 2;
  return m;
}

// ======================================================================
// Materials and printed art
// ======================================================================

function makeMaterials(M, art) {
  const jukeUniforms = { uTime: { value: 0 }, uLevel: { value: 0 } };
  const pool = () =>
    new THREE.MeshBasicMaterial({
      map: art.radial,
      vertexColors: true,
      color: 0x000000,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -4,
    });
  // Older, softer brass than the fittings, so the big surfaces don't mirror
  // the spot straight back.
  const brassWork = M.brass.clone();
  brassWork.color.set(0xb48c4c);
  brassWork.roughness = 0.42;
  brassWork.bumpMap = art.chased;
  brassWork.bumpScale = 0.7;
  return {
    // French-polished walnut: glossy enough that fluting and edges catch
    // highlights in a dim room.
    lacquer: new THREE.MeshPhysicalMaterial({
      map: M.woodDark.map,
      color: 0xd8c2ac,
      roughness: 0.38,
      clearcoat: 0.9,
      clearcoatRoughness: 0.12,
    }),
    // Posters, rug, clock face… lit from the emissive copy of the atlas,
    // which bakes in the fall-off of each picture light.
    print: new THREE.MeshStandardMaterial({
      map: art.map,
      emissiveMap: art.lit,
      emissive: 0xffffff,
      emissiveIntensity: 0,
      roughness: 0.8,
      side: THREE.DoubleSide,
    }),
    glow: new THREE.MeshBasicMaterial({ color: 0x000000 }),
    frosted: new THREE.MeshStandardMaterial({ color: 0xe9dcc3, emissive: 0xffbf80, emissiveIntensity: 0, roughness: 0.45, side: THREE.DoubleSide }),
    bankers: new THREE.MeshPhysicalMaterial({
      color: 0x0a3a1d,
      emissive: 0x1f9c48,
      emissiveIntensity: 0,
      roughness: 0.12,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      side: THREE.DoubleSide,
    }),
    leaf: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide }),
    felt: new THREE.MeshStandardMaterial({ color: 0x2e2924, roughness: 0.95 }),
    brassWork,
    vinyl: new THREE.MeshStandardMaterial({ map: art.record, emissiveMap: art.record, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.32 }),
    chamber: new THREE.MeshBasicMaterial({ map: art.radial, color: 0x000000 }),
    jukeUniforms,
    band: jukeMaterial(jukeUniforms, BAND_FRAG),
    bubbles: jukeMaterial(jukeUniforms, BUBBLE_FRAG),
    panel: jukeMaterial(jukeUniforms, PANEL_FRAG),
    pool: pool(),
    jukePool: pool(),
  };
}

// The jukebox's lit plastic: amber, pink, cyan and green, blended in a loop.
const JUKE_COLORS = [[1.0, 0.42, 0.08], [1.0, 0.12, 0.38], [0.15, 0.75, 1.0], [0.3, 1.0, 0.3]];
function jukeColor(t, out) {
  const f = (((t % 1) + 1) % 1) * 4;
  const i = Math.floor(f);
  const a = JUKE_COLORS[i];
  const b = JUKE_COLORS[(i + 1) % 4];
  const k = ease(f - i);
  return out.setRGB(lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k));
}

const JUKE_COMMON = /* glsl */ `
  uniform float uTime;
  uniform float uLevel;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  vec3 palette(float t) {
    t = fract(t) * 4.0;
    vec3 c0 = vec3(1.0, 0.42, 0.08), c1 = vec3(1.0, 0.12, 0.38), c2 = vec3(0.15, 0.75, 1.0), c3 = vec3(0.3, 1.0, 0.3);
    float f = smoothstep(0.0, 1.0, fract(t));
    if (t < 1.0) return mix(c0, c1, f);
    if (t < 2.0) return mix(c1, c2, f);
    if (t < 3.0) return mix(c2, c3, f);
    return mix(c3, c0, f);
  }
  float facing() { return clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0); }
`;

const BAND_FRAG = /* glsl */ `
  void main() {
    vec3 col = palette(vUv.x * 1.3 - uTime * 0.07);
    float f = facing();
    col *= (0.3 + 0.8 * f * f) * uLevel * 1.45;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// Bubbles rise from both ends of the tube towards the top of the arch.
const BUBBLE_FRAG = /* glsl */ `
  float hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
  void main() {
    float s = 0.5 - abs(vUv.x - 0.5);
    float cell = s * 60.0 - uTime * 1.2;
    float id = floor(cell);
    float size = 0.12 + 0.26 * hash(id);
    float bubble = step(0.62, hash(id + 7.0)) * smoothstep(size, size * 0.45, abs(fract(cell) - 0.5));
    vec3 liquid = palette(0.05 + s * 0.6 - uTime * 0.03) * 0.8;
    vec3 col = mix(liquid, vec3(1.7, 1.5, 1.2), bubble);
    col *= (0.45 + 0.8 * facing()) * uLevel * 1.25;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// Backlit grille plastic: colour drifts upwards, brighter in the middle.
const PANEL_FRAG = /* glsl */ `
  void main() {
    vec3 col = palette(vUv.y * 0.35 + vUv.x * 0.1 - uTime * 0.07 + 0.4);
    float glow = 1.0 - 0.7 * length(vUv - 0.5);
    gl_FragColor = vec4(col * glow * uLevel * 0.85, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

function jukeMaterial(uniforms, frag) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalMatrix * normal;
        vV = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: JUKE_COMMON + frag,
  });
}

// ---------------------------------------------------------------- atlas

const ATLAS = 2048;
// Regions of the atlas, [x, y, w, h] in pixels.
const ART = {
  eight: [8, 8, 496, 688],
  shave: [520, 8, 496, 688],
  rhythm: [1032, 8, 496, 688],
  tonic: [1544, 8, 496, 688],
  hours: [8, 712, 496, 688],
  clock: [520, 712, 496, 496],
  rug: [1032, 712, 1008, 640],
  mag0: [520, 1224, 236, 316],
  mag1: [772, 1224, 236, 316],
  mag2: [8, 1416, 236, 316],
  scarf: [260, 1416, 120, 600],
  rules: [396, 1556, 360, 480],
  pages: [1032, 1368, 640, 420],
  titles: [1688, 1368, 352, 132],
  amount: [1688, 1516, 352, 60],
  tabs: [1688, 1592, 352, 88],
  ring: [1688, 1696, 352, 80],
  notes: [772, 1556, 236, 120],
};

const FONT = {
  display: '"Big Shoulders Display", "Arial Narrow", sans-serif',
  serif: '"Bodoni Moda", Georgia, serif',
  sans: '"Hanken Grotesk", Arial, sans-serif',
  script: '"Neonderthaw", "Brush Script MT", cursive',
};

async function loadFonts() {
  const wanted = [
    `800 100px ${FONT.display}`,
    `600 40px ${FONT.display}`,
    `italic 700 80px ${FONT.serif}`,
    `italic 400 40px ${FONT.serif}`,
    `400 40px ${FONT.serif}`,
    `600 30px ${FONT.sans}`,
    `400 100px ${FONT.script}`,
  ];
  const all = Promise.all(wanted.map((f) => document.fonts.load(f)));
  await Promise.race([all, new Promise((r) => setTimeout(r, 2000))]).catch(() => {});
}

function paintArt() {
  const r = rng(31);
  const [c, g] = makeCanvas(ATLAS);
  g.fillStyle = '#2a2520';
  g.fillRect(0, 0, ATLAS, ATLAS);
  const painters = {
    eight: paintEightBall,
    shave: paintShave,
    rhythm: paintRhythm,
    tonic: paintTonic,
    hours: paintHours,
    clock: paintClockFace,
    rug: paintRug,
    mag0: (g, w, h) => paintMagazine(g, w, h, 0),
    mag1: (g, w, h) => paintMagazine(g, w, h, 1),
    mag2: (g, w, h) => paintMagazine(g, w, h, 2),
    scarf: paintScarf,
    rules: paintRules,
    pages: paintPages,
    titles: paintTitles,
    amount: (g, w, h) => plate(g, w, h, 'AMOUNT PURCHASED', '#16120f', '#d9b56a'),
    tabs: paintTabs,
    ring: (g, w, h) => plate(g, w, h, 'PLEASE RING', '#b98d45', '#1a120c'),
    notes: paintNotes,
  };
  for (const [name, paint] of Object.entries(painters)) {
    const [x, y, w, h] = ART[name];
    g.save();
    g.translate(x, y);
    g.beginPath();
    g.rect(0, 0, w, h);
    g.clip();
    paint(g, w, h, r);
    g.restore();
  }

  // The emissive copy: how much light falls on each print. Posters are lit
  // from above by a picture light, the jukebox titles from behind.
  const [lc, lg] = makeCanvas(ATLAS);
  lg.fillStyle = '#000';
  lg.fillRect(0, 0, ATLAS, ATLAS);
  const poster = (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, -h * 0.25, h * 0.2, w / 2, -h * 0.25, h * 1.35);
    grad.addColorStop(0, 'rgb(255,236,206)');
    grad.addColorStop(1, 'rgb(64,54,44)');
    return grad;
  };
  const LIT = {
    eight: poster,
    shave: poster,
    rhythm: poster,
    tonic: poster,
    hours: poster,
    rules: poster,
    clock: () => 'rgb(96,90,80)',
    titles: () => 'rgb(255,236,200)',
    pages: (g, w, h) => {
      const grad = g.createRadialGradient(w * 0.7, h * 0.3, 20, w * 0.7, h * 0.3, w * 0.9);
      grad.addColorStop(0, 'rgb(190,165,120)');
      grad.addColorStop(1, 'rgb(40,34,26)');
      return grad;
    },
    amount: () => 'rgb(50,44,36)',
    tabs: () => 'rgb(60,56,50)',
    ring: () => 'rgb(40,36,30)',
  };
  for (const [name, mask] of Object.entries(LIT)) {
    const [x, y, w, h] = ART[name];
    lg.drawImage(c, x, y, w, h, x, y, w, h);
    lg.save();
    lg.translate(x, y);
    lg.globalCompositeOperation = 'multiply';
    lg.fillStyle = mask(lg, w, h);
    lg.fillRect(0, 0, w, h);
    lg.restore();
  }

  const tex = (canvas, srgb = true) => {
    const t = new THREE.CanvasTexture(canvas);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  return {
    map: tex(c),
    lit: tex(lc),
    record: tex(paintRecord()),
    radial: tex(paintRadial()),
    chased: chasedBrass(),
  };
}

// --- canvas helpers

function text(g, str, x, y, font, color, spacing = 0, maxWidth) {
  g.font = font;
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if ('letterSpacing' in g) g.letterSpacing = `${spacing}px`;
  // Letter spacing trails the last glyph; shift back to stay centred.
  g.fillText(str, x + spacing / 2, y, maxWidth);
  if ('letterSpacing' in g) g.letterSpacing = '0px';
}

function rule(g, x, y, w, color, lw = 2) {
  g.fillStyle = color;
  g.fillRect(x, y - lw / 2, w, lw);
}

// Double keyline inside the edge of a print.
function keyline(g, w, h, color, inset = 16) {
  g.strokeStyle = color;
  g.lineWidth = 3;
  g.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
  g.lineWidth = 1.2;
  g.strokeRect(inset + 7, inset + 7, w - inset * 2 - 14, h - inset * 2 - 14);
}

function sunburst(g, cx, cy, n, color) {
  g.save();
  g.translate(cx, cy);
  g.fillStyle = color;
  for (let i = 0; i < n; i += 2) {
    const a = (i / n) * TAU;
    const b = ((i + 1) / n) * TAU;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a) * 900, Math.sin(a) * 900);
    g.lineTo(Math.cos(b) * 900, Math.sin(b) * 900);
    g.fill();
  }
  g.restore();
}

// Paper wear: specks, yellowed edges and a fold.
function age(g, w, h, r, k = 1) {
  for (let i = 0; i < 1400 * k; i++) {
    g.fillStyle = r() < 0.5 ? `rgba(255,246,222,${r() * 0.07})` : `rgba(40,24,10,${r() * 0.08})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 2.5, 1 + r() * 2.5);
  }
  const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.72);
  v.addColorStop(0, 'rgba(120,80,30,0)');
  v.addColorStop(1, 'rgba(80,48,16,0.42)');
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,250,235,0.07)';
  g.fillRect(0, h / 2 - 1, w, 2);
}

function wrap(g, str, x, y, maxW, lineH) {
  const words = str.split(' ');
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width > maxW && line) {
      g.fillText(line, x, y);
      line = word;
      y += lineH;
    } else line = next;
  }
  g.fillText(line, x, y);
  return y + lineH;
}

// --- prints

function paintEightBall(g, w, h, r) {
  const cx = w / 2;
  const cy = h * 0.56;
  g.fillStyle = '#103a37';
  g.fillRect(0, 0, w, h);
  sunburst(g, cx, cy, 40, 'rgba(236,222,190,0.07)');
  // Crossed cues behind the ball.
  for (const s of [-1, 1]) {
    g.save();
    g.translate(cx, cy);
    g.rotate(s * 0.6);
    const grad = g.createLinearGradient(0, -320, 0, 320);
    grad.addColorStop(0, '#efe0bd');
    grad.addColorStop(0.55, '#d1a466');
    grad.addColorStop(0.64, '#d1a466');
    grad.addColorStop(0.65, '#1d0f0a');
    grad.addColorStop(1, '#3a2015');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(-3.5, -320);
    g.lineTo(3.5, -320);
    g.lineTo(9, 320);
    g.lineTo(-9, 320);
    g.fill();
    g.fillStyle = '#3d78b8';
    g.fillRect(-3.5, -328, 7, 8);
    g.restore();
  }
  // The ball, lit from the top left.
  const R = 112;
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.ellipse(cx + 14, cy + R + 6, R * 0.9, 16, 0, 0, TAU);
  g.fill();
  const ball = g.createRadialGradient(cx - 38, cy - 42, 8, cx, cy, R);
  ball.addColorStop(0, '#5c5c5c');
  ball.addColorStop(0.35, '#161616');
  ball.addColorStop(1, '#020202');
  g.fillStyle = ball;
  g.beginPath();
  g.arc(cx, cy, R, 0, TAU);
  g.fill();
  g.fillStyle = '#f3ead8';
  g.beginPath();
  g.ellipse(cx - 10, cy - 12, 50, 46, -0.2, 0, TAU);
  g.fill();
  text(g, '8', cx - 10, cy - 8, `800 80px ${FONT.display}`, '#0b0b0b');
  g.fillStyle = 'rgba(255,255,255,0.45)';
  g.beginPath();
  g.ellipse(cx - 56, cy - 64, 22, 11, -0.7, 0, TAU);
  g.fill();
  text(g, 'EIGHT BALL', cx, 96, `800 106px ${FONT.display}`, '#efe2c4', 4, w - 70);
  text(g, 'SATURDAY NIGHT CLUB', cx, 162, `600 26px ${FONT.display}`, '#e0583e', 9);
  rule(g, 80, 190, w - 160, '#efe2c4');
  text(g, 'CUES · CARDS · CLOSE SHAVES', cx, h - 94, `600 28px ${FONT.display}`, '#efe2c4', 5);
  text(g, 'Athens · Est. 2012', cx, h - 58, `italic 400 24px ${FONT.serif}`, '#c9b48c');
  keyline(g, w, h, '#d9c9a2');
  age(g, w, h, r);
}

function barberStripes(g, y, h) {
  const cols = ['#a3201b', '#efe6d2', '#1f3a6b', '#efe6d2'];
  for (let i = -6; i < 40; i++) {
    g.fillStyle = cols[(i + 60) % 4];
    g.beginPath();
    g.moveTo(i * 20, y + h);
    g.lineTo(i * 20 + 20, y + h);
    g.lineTo(i * 20 + 20 + h, y);
    g.lineTo(i * 20 + h, y);
    g.fill();
  }
}

function paintRazor(g, cx, cy) {
  g.save();
  g.translate(cx, cy);
  // Scales, angled down to the left of the pivot.
  g.save();
  g.rotate(2.55);
  const hg = g.createLinearGradient(0, -16, 0, 16);
  hg.addColorStop(0, '#4a403a');
  hg.addColorStop(0.45, '#0d0b0a');
  hg.addColorStop(1, '#000');
  g.fillStyle = hg;
  g.beginPath();
  g.moveTo(0, -14);
  g.quadraticCurveTo(110, -22, 210, -12);
  g.quadraticCurveTo(226, 0, 210, 12);
  g.quadraticCurveTo(110, 22, 0, 14);
  g.quadraticCurveTo(-12, 0, 0, -14);
  g.fill();
  g.fillStyle = '#d6b56a';
  for (const x of [6, 200]) {
    g.beginPath();
    g.arc(x, 0, 4, 0, TAU);
    g.fill();
  }
  g.restore();
  // Blade, open to the right.
  g.save();
  g.rotate(-0.22);
  const bg = g.createLinearGradient(0, -32, 0, 28);
  bg.addColorStop(0, '#666c70');
  bg.addColorStop(0.35, '#eef1f3');
  bg.addColorStop(0.62, '#a3aab0');
  bg.addColorStop(1, '#fafbfc');
  g.fillStyle = bg;
  g.beginPath();
  g.moveTo(-6, -10);
  g.lineTo(36, -13);
  g.lineTo(206, -28);
  g.quadraticCurveTo(226, -28, 228, -8);
  g.lineTo(226, 28);
  g.lineTo(36, 21);
  g.lineTo(-4, 10);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(20,20,20,0.6)';
  g.lineWidth = 2;
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.beginPath();
  g.moveTo(40, -10);
  g.lineTo(206, -24);
  g.stroke();
  g.restore();
  g.fillStyle = '#d6b56a';
  g.beginPath();
  g.arc(0, 0, 7, 0, TAU);
  g.fill();
  g.restore();
}

function paintShave(g, w, h, r) {
  const cx = w / 2;
  g.fillStyle = '#eadfc6';
  g.fillRect(0, 0, w, h);
  barberStripes(g, 0, 40);
  barberStripes(g, h - 40, 40);
  text(g, "GENTLEMEN'S GROOMING PARLOUR", cx, 74, `600 20px ${FONT.display}`, '#1f3a6b', 5);
  text(g, 'Hot Towel', cx, 146, `italic 700 86px ${FONT.serif}`, '#8e1d17', 0, w - 60);
  text(g, 'SHAVE', cx, 238, `800 118px ${FONT.display}`, '#1f2c4a', 14);
  // Steam over a folded towel, then the razor.
  g.strokeStyle = 'rgba(80,90,110,0.35)';
  g.lineWidth = 4;
  g.lineCap = 'round';
  for (let i = -1; i <= 1; i++) {
    g.beginPath();
    g.moveTo(cx + i * 46, 400);
    g.bezierCurveTo(cx + i * 46 - 22, 370, cx + i * 46 + 22, 345, cx + i * 46, 315);
    g.stroke();
  }
  g.fillStyle = '#f7f2e6';
  g.strokeStyle = '#b9ab8e';
  g.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.roundRect(cx - 120 + i * 6, 404 + i * 22, 240 - i * 12, 26, 12);
    g.fill();
    g.stroke();
  }
  g.fillStyle = '#8e1d17';
  g.fillRect(cx - 108, 412, 216, 4);
  paintRazor(g, cx - 70, 530);
  text(g, 'THE ROYAL TREATMENT', cx, h - 98, `700 30px ${FONT.display}`, '#8e1d17', 6);
  text(g, 'Two hot towels · one steady hand', cx, h - 64, `italic 400 22px ${FONT.serif}`, '#3a2c20');
  age(g, w, h, r);
}

function paintRhythm(g, w, h, r) {
  const cx = w / 2;
  g.fillStyle = '#16131d';
  g.fillRect(0, 0, w, h);
  // Halftone dots fading from the corner.
  for (let y = 0; y < h; y += 14) {
    for (let x = 0; x < w; x += 14) {
      const k = Math.max(0, 1 - Math.hypot(x - w, y - h * 0.15) / 420);
      if (k <= 0) continue;
      g.fillStyle = 'rgba(255,70,140,0.55)';
      g.beginPath();
      g.arc(x, y, 5.5 * k, 0, TAU);
      g.fill();
    }
  }
  // A big record rising from the bottom.
  const ry = h * 0.86;
  g.fillStyle = '#060606';
  g.beginPath();
  g.arc(cx, ry, 220, 0, TAU);
  g.fill();
  for (let rad = 214; rad > 80; rad -= 3) {
    g.strokeStyle = `rgba(255,255,255,${0.04 + r() * 0.05})`;
    g.lineWidth = 1;
    g.beginPath();
    g.arc(cx, ry, rad, 0, TAU);
    g.stroke();
  }
  g.fillStyle = '#c7303c';
  g.beginPath();
  g.arc(cx, ry, 74, 0, TAU);
  g.fill();
  text(g, '45', cx, ry - 30, `800 40px ${FONT.display}`, '#f3e6cc');
  g.save();
  g.shadowColor = 'rgba(255,70,140,1)';
  g.shadowBlur = 24;
  text(g, 'Rhythm', cx, 150, `400 132px ${FONT.script}`, '#ff6fa8');
  g.restore();
  g.save();
  g.shadowColor = 'rgba(70,225,255,1)';
  g.shadowBlur = 16;
  text(g, 'NIGHT', cx, 246, `800 70px ${FONT.display}`, '#8fe9ff', 16);
  g.restore();
  text(g, 'EVERY FRIDAY · RECORDS TILL LATE', cx, 310, `600 22px ${FONT.display}`, '#efe2c4', 5);
  text(g, 'Cues racked · drinks poured', cx, 346, `italic 400 22px ${FONT.serif}`, '#c9b48c');
  keyline(g, w, h, 'rgba(239,226,196,0.7)');
  age(g, w, h, r, 0.6);
}

function paintTonic(g, w, h, r) {
  const cx = w / 2;
  g.fillStyle = '#c4923a';
  g.fillRect(0, 0, w, h);
  sunburst(g, cx, h * 0.6, 48, 'rgba(255,240,200,0.12)');
  text(g, 'BAY RUM', cx, 96, `800 104px ${FONT.display}`, '#6e1712', 6);
  text(g, 'Hair & Scalp Tonic', cx, 166, `italic 700 38px ${FONT.serif}`, '#1f2c4a');
  // The bottle.
  const by = 470;
  const body = g.createLinearGradient(cx - 80, 0, cx + 80, 0);
  body.addColorStop(0, '#4a1d06');
  body.addColorStop(0.3, '#a2520f');
  body.addColorStop(0.55, '#c86e1c');
  body.addColorStop(1, '#3e1704');
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(cx - 20, by - 226);
  g.lineTo(cx + 20, by - 226);
  g.lineTo(cx + 22, by - 160);
  g.quadraticCurveTo(cx + 82, by - 140, cx + 82, by - 90);
  g.lineTo(cx + 82, by + 110);
  g.quadraticCurveTo(cx + 82, by + 126, cx + 66, by + 126);
  g.lineTo(cx - 66, by + 126);
  g.quadraticCurveTo(cx - 82, by + 126, cx - 82, by + 110);
  g.lineTo(cx - 82, by - 90);
  g.quadraticCurveTo(cx - 82, by - 140, cx - 22, by - 160);
  g.closePath();
  g.fill();
  g.fillStyle = '#1b1410';
  g.fillRect(cx - 24, by - 256, 48, 34);
  g.fillStyle = 'rgba(255,240,210,0.35)';
  g.fillRect(cx - 62, by - 100, 10, 190);
  g.fillStyle = '#efe4c9';
  g.fillRect(cx - 64, by - 50, 128, 120);
  g.strokeStyle = '#6e1712';
  g.lineWidth = 3;
  g.strokeRect(cx - 58, by - 44, 116, 108);
  text(g, 'BAY RUM', cx, by - 14, `800 30px ${FONT.display}`, '#6e1712', 2);
  text(g, 'No. 7', cx, by + 22, `italic 400 22px ${FONT.serif}`, '#1f2c4a');
  text(g, 'BRACING · FRAGRANT · FRESH', cx, h - 96, `600 26px ${FONT.display}`, '#2b1a0e', 5);
  text(g, 'For the discerning gentleman', cx, h - 60, `italic 400 22px ${FONT.serif}`, '#3a2410');
  keyline(g, w, h, '#6e1712');
  age(g, w, h, r);
}

// Opening hours from the shop config, Monday first, today picked out.
function paintHours(g, w, h, r) {
  const gold = '#d6ae62';
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const today = new Date().getDay();
  g.fillStyle = '#121110';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(255,255,255,${r() * 0.03})`;
    g.fillRect(r() * w, r() * h, 2, 2);
  }
  keyline(g, w, h, gold);
  text(g, 'OPENING HOURS', w / 2, 82, `800 54px ${FONT.display}`, gold, 6, w - 70);
  text(g, 'Barbershop · Athens', w / 2, 128, `italic 400 22px ${FONT.serif}`, '#e9dcc0');
  rule(g, 60, 154, w - 120, gold, 2);
  [1, 2, 3, 4, 5, 6, 0].forEach((d, i) => {
    const y = 204 + i * 58;
    const open = SHOP.hours[d];
    const hours = open ? `${open[0]} – ${open[1]}` : 'Closed';
    if (d === today) {
      g.fillStyle = 'rgba(214,174,98,0.16)';
      g.fillRect(34, y - 24, w - 68, 48);
    }
    g.font = `600 25px ${FONT.sans}`;
    g.fillStyle = d === today ? gold : '#efe5cf';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(days[d], 48, y);
    const dayW = g.measureText(days[d]).width;
    g.font = `700 28px ${FONT.display}`;
    g.fillStyle = open ? gold : '#9a8f7c';
    g.textAlign = 'right';
    g.fillText(hours, w - 48, y);
    const hoursW = g.measureText(hours).width;
    g.fillStyle = 'rgba(214,174,98,0.5)';
    for (let x = 58 + dayW; x < w - 58 - hoursW; x += 9) g.fillRect(x, y + 8, 2.5, 2.5);
  });
  text(g, 'Walk-ins welcome · ask at the desk', w / 2, h - 52, `italic 400 22px ${FONT.serif}`, '#e9dcc0');
}

function paintRules(g, w, h, r) {
  const ink = '#3b2116';
  g.fillStyle = '#ebdfc4';
  g.fillRect(0, 0, w, h);
  keyline(g, w, h, '#7d1d16', 12);
  text(g, 'HOUSE RULES', w / 2, 62, `800 50px ${FONT.display}`, '#7d1d16', 6);
  rule(g, 70, 96, w - 140, '#7d1d16');
  g.font = `400 21px ${FONT.serif}`;
  g.fillStyle = ink;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  let y = 130;
  for (const [n, rule] of [
    ['I.', 'Chalk your cue, never the felt.'],
    ['II.', 'Loser racks the next game.'],
    ['III.', 'No shots from the barber chair.'],
    ['IV.', 'Drinks stay off the rails.'],
    ['V.', 'Ties are settled with a coin toss.'],
  ]) {
    g.font = `700 21px ${FONT.serif}`;
    g.fillText(n, 34, y);
    g.font = `400 21px ${FONT.serif}`;
    y = wrap(g, rule, 84, y, w - 118, 27) + 9;
  }
  text(g, 'By order of the management', w / 2, h - 42, `italic 400 19px ${FONT.serif}`, '#7d1d16');
  age(g, w, h, r, 0.5);
}

function paintClockFace(g, w) {
  const c = w / 2;
  const R = c - 3;
  const ink = '#1a1512';
  const face = g.createRadialGradient(c - 40, c - 50, 10, c, c, R);
  face.addColorStop(0, '#f6efdf');
  face.addColorStop(1, '#d8cab0');
  g.fillStyle = '#d8cab0';
  g.fillRect(0, 0, w, w);
  g.fillStyle = face;
  g.beginPath();
  g.arc(c, c, R, 0, TAU);
  g.fill();
  g.strokeStyle = ink;
  for (const [rad, lw] of [[R * 0.95, 3], [R * 0.86, 2]]) {
    g.lineWidth = lw;
    g.beginPath();
    g.arc(c, c, rad, 0, TAU);
    g.stroke();
  }
  g.lineCap = 'butt';
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * TAU;
    g.lineWidth = i % 5 ? 2 : 6;
    g.beginPath();
    g.moveTo(c + Math.sin(a) * R * 0.86, c - Math.cos(a) * R * 0.86);
    g.lineTo(c + Math.sin(a) * R * 0.95, c - Math.cos(a) * R * 0.95);
    g.stroke();
  }
  const numerals = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  numerals.forEach((n, i) => {
    g.save();
    g.translate(c, c);
    g.rotate((i / 12) * TAU);
    text(g, n, 0, -R * 0.72, `500 52px ${FONT.serif}`, ink);
    g.restore();
  });
  text(g, 'AIOLOU & SONS', c, c - R * 0.34, `600 22px ${FONT.display}`, ink, 4);
  text(g, 'Athens', c, c + R * 0.36, `italic 400 24px ${FONT.serif}`, '#7d1d16');
}

function paintRug(g, w, h, r) {
  const RED = '#6a1b17';
  const NAVY = '#1c2339';
  const CREAM = '#d9c59d';
  const GOLD = '#b4823a';
  const fringe = 26;
  // Fringe at the short ends.
  g.fillStyle = '#3a342b';
  g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 3) {
    for (const x0 of [0, w - fringe]) {
      g.fillStyle = `rgba(226,210,176,${0.65 + r() * 0.35})`;
      g.fillRect(x0 + r() * 4, y, fringe - r() * 7, 2);
    }
  }
  const bx = fringe;
  const bw = w - fringe * 2;
  g.fillStyle = NAVY;
  g.fillRect(bx, 0, bw, h);
  // Border band with a running diamond motif.
  g.fillStyle = CREAM;
  g.fillRect(bx + 12, 12, bw - 24, 3);
  g.fillRect(bx + 12, h - 15, bw - 24, 3);
  g.fillRect(bx + 12, 12, 3, h - 24);
  g.fillRect(bx + bw - 15, 12, 3, h - 24);
  const motif = (x, y, s, col) => {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(x, y - s);
    g.lineTo(x + s, y);
    g.lineTo(x, y + s);
    g.lineTo(x - s, y);
    g.fill();
  };
  for (let x = bx + 40; x < bx + bw - 30; x += 34) {
    motif(x, 38, 11, GOLD);
    motif(x, h - 38, 11, GOLD);
    motif(x, 38, 5, RED);
    motif(x, h - 38, 5, RED);
  }
  for (let y = 72; y < h - 60; y += 34) {
    motif(bx + 38, y, 11, GOLD);
    motif(bx + bw - 38, y, 11, GOLD);
    motif(bx + 38, y, 5, RED);
    motif(bx + bw - 38, y, 5, RED);
  }
  // Field.
  const fx = bx + 64;
  const fy = 64;
  const fw = bw - 128;
  const fh = h - 128;
  g.fillStyle = CREAM;
  g.fillRect(fx - 5, fy - 5, fw + 10, fh + 10);
  g.fillStyle = RED;
  g.fillRect(fx, fy, fw, fh);
  for (let y = fy + 24; y < fy + fh; y += 40) {
    for (let x = fx + 24 + ((y / 40) % 2) * 20; x < fx + fw; x += 40) {
      motif(x, y, 6, 'rgba(28,35,57,0.8)');
      motif(x, y, 2.5, GOLD);
    }
  }
  // Corner spandrels and the central medallion.
  for (const [x, y, sx, sy] of [[fx, fy, 1, 1], [fx + fw, fy, -1, 1], [fx, fy + fh, 1, -1], [fx + fw, fy + fh, -1, -1]]) {
    g.fillStyle = NAVY;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + sx * 150, y);
    g.quadraticCurveTo(x + sx * 70, y + sy * 70, x, y + sy * 110);
    g.fill();
  }
  const cx = fx + fw / 2;
  const cy = fy + fh / 2;
  for (const [s, col] of [[200, CREAM], [190, NAVY], [130, GOLD], [122, RED], [60, NAVY], [24, CREAM]]) {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(cx, cy - s * 0.62);
    g.lineTo(cx + s, cy);
    g.lineTo(cx, cy + s * 0.62);
    g.lineTo(cx - s, cy);
    g.fill();
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    motif(cx + Math.cos(a) * 92, cy + Math.sin(a) * 52, 9, CREAM);
  }
  // Wear.
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = r() < 0.5 ? `rgba(0,0,0,${r() * 0.12})` : `rgba(255,235,200,${r() * 0.05})`;
    g.fillRect(bx + r() * bw, r() * h, 1 + r() * 3, 1 + r() * 2);
  }
}

function paintMagazine(g, w, h, kind) {
  const [bg, title, ink] = [
    ['#a3201b', 'THE SHARP', '#f1e6cf'],
    ['#14523a', 'CUE & CHALK', '#f1e6cf'],
    ['#1f3a5b', 'HI-FI WEEKLY', '#f6d27a'],
  ][kind];
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  text(g, title, w / 2, 34, `800 38px ${FONT.display}`, ink, 2, w - 20);
  if (kind === 0) {
    // A pompadour in profile.
    g.fillStyle = '#16100c';
    g.beginPath();
    g.ellipse(w / 2, 180, 62, 80, 0, 0, TAU);
    g.fill();
    g.beginPath();
    g.ellipse(w / 2 - 6, 112, 72, 34, -0.25, 0, TAU);
    g.fill();
    g.fillStyle = '#d9a982';
    g.beginPath();
    g.ellipse(w / 2 + 22, 196, 40, 58, 0.1, 0, TAU);
    g.fill();
  } else if (kind === 1) {
    for (const [x, y, col] of [[80, 170, '#e8c02c'], [150, 150, '#1d3f9e'], [118, 220, '#0c0c0c']]) {
      g.fillStyle = col;
      g.beginPath();
      g.arc(x, y, 34, 0, TAU);
      g.fill();
      g.fillStyle = '#f4ecdc';
      g.beginPath();
      g.arc(x - 4, y - 4, 13, 0, TAU);
      g.fill();
    }
  } else {
    g.fillStyle = '#080808';
    g.beginPath();
    g.arc(w / 2, 178, 82, 0, TAU);
    g.fill();
    g.fillStyle = '#f6d27a';
    g.beginPath();
    g.arc(w / 2, 178, 26, 0, TAU);
    g.fill();
  }
  text(g, 'FADES OF THE SEASON', w / 2, h - 52, `600 18px ${FONT.display}`, ink, 2, w - 24);
  text(g, 'No. 48 · Autumn', w / 2, h - 26, `italic 400 16px ${FONT.serif}`, ink);
}

function paintScarf(g, w, h) {
  g.fillStyle = '#a2804f';
  g.fillRect(0, 0, w, h);
  // Tartan: bands both ways, then fine lines.
  for (const [pos, size, col] of [[18, 14, 'rgba(110,25,20,0.75)'], [60, 26, 'rgba(30,36,60,0.6)'], [96, 6, 'rgba(240,226,190,0.6)']]) {
    g.fillStyle = col;
    g.fillRect(pos, 0, size, h);
    for (let y = pos; y < h; y += 120) g.fillRect(0, y, w, size);
  }
  for (let y = 0; y < h; y += 4) {
    g.fillStyle = 'rgba(0,0,0,0.08)';
    g.fillRect(0, y, w, 1);
  }
}

function paintPages(g, w, h, r) {
  const ink = '#2b2a4a';
  g.fillStyle = '#efe6d0';
  g.fillRect(0, 0, w, h);
  const gutter = g.createLinearGradient(w / 2 - 30, 0, w / 2 + 30, 0);
  gutter.addColorStop(0, 'rgba(90,70,40,0)');
  gutter.addColorStop(0.5, 'rgba(90,70,40,0.35)');
  gutter.addColorStop(1, 'rgba(90,70,40,0)');
  g.fillStyle = gutter;
  g.fillRect(w / 2 - 30, 0, 60, h);
  const now = new Date();
  const day = now.toLocaleDateString('en-GB', { weekday: 'long' }).toUpperCase();
  const date = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  text(g, day, w * 0.25, 34, `800 30px ${FONT.display}`, '#7d1d16', 4);
  text(g, date, w * 0.75, 34, `italic 400 26px ${FONT.serif}`, '#7d1d16');
  const names = ['Giorgos — skin fade', 'Mark — royal shave', 'Andreas — cut & beard', '', 'Yannis — full ritual', 'Chris — signature', 'Kostas — beard', 'Petros — fade', '', 'Dimitris — scissor cut', 'Leo — junior cut', 'Alex — skin fade', 'Nikos — shave', 'Sam — signature'];
  for (let i = 0; i < 14; i++) {
    const left = i < 7;
    const x0 = left ? 22 : w / 2 + 22;
    const y = 82 + (i % 7) * 46;
    g.fillStyle = 'rgba(70,110,160,0.35)';
    g.fillRect(x0, y + 16, w / 2 - 44, 1.5);
    const hour = 10 + Math.floor(i / 2) + (i % 2 ? ':30' : ':00');
    g.font = `600 17px ${FONT.sans}`;
    g.fillStyle = '#7d1d16';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(hour, x0, y);
    if (!names[i]) continue;
    g.font = `italic 400 ${21 + r() * 3}px ${FONT.serif}`;
    g.fillStyle = ink;
    g.save();
    g.translate(x0 + 70, y);
    g.rotate((r() - 0.5) * 0.05);
    g.fillText(names[i], 0, 0);
    g.restore();
    if (i < 5) {
      g.strokeStyle = ink;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x0 + 276, y - 2);
      g.lineTo(x0 + 282, y + 5);
      g.lineTo(x0 + 294, y - 9);
      g.stroke();
    }
  }
}

function paintTitles(g, w, h) {
  const titles = ['Midnight Fade', 'Straight Razor Blues', 'Pomade Shuffle', 'Hot Towel Swing', 'Barber Pole Boogie', 'Chalk & Cue', 'Close Shave Stomp', 'Aiolou Avenue', 'Lather Lullaby', 'Last Call Rag'];
  g.fillStyle = '#2a1c14';
  g.fillRect(0, 0, w, h);
  const cw = w / 2;
  const ch = h / 5;
  titles.forEach((t, i) => {
    const x = (i % 2) * cw;
    const y = Math.floor(i / 2) * ch;
    g.fillStyle = '#f2e8d2';
    g.fillRect(x + 3, y + 2, cw - 6, ch - 4);
    g.fillStyle = '#b8261d';
    g.fillRect(x + 3, y + 2, cw - 6, 3);
    g.fillRect(x + 3, y + ch - 5, cw - 6, 3);
    text(g, t.toUpperCase(), x + cw / 2, y + ch / 2 + 1, `700 15px ${FONT.display}`, '#1a1410', 1, cw - 16);
  });
}

function plate(g, w, h, label, bg, ink) {
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = ink;
  g.lineWidth = 2;
  g.strokeRect(5, 5, w - 10, h - 10);
  text(g, label, w / 2, h / 2 + 1, `700 ${Math.round(h * 0.5)}px ${FONT.display}`, ink, 4, w - 24);
}

// The top banknote of a stack in the till.
function paintNotes(g, w, h) {
  g.fillStyle = '#b9c2a4';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#4f6146';
  g.lineWidth = 4;
  g.strokeRect(8, 8, w - 16, h - 16);
  g.fillStyle = '#d9dcc6';
  g.beginPath();
  g.ellipse(w * 0.66, h / 2, 34, 40, 0, 0, TAU);
  g.fill();
  text(g, '20', w * 0.25, h / 2, `800 46px ${FONT.display}`, '#3f5238');
}

function paintTabs(g, w, h) {
  const tw = w / 4;
  ['€', '2', '5', '.00'].forEach((d, i) => {
    g.fillStyle = '#f4ecdb';
    g.fillRect(i * tw + 4, 4, tw - 8, h - 8);
    text(g, d, i * tw + tw / 2, h / 2 + 2, `800 ${i === 3 ? 44 : 62}px ${FONT.display}`, i ? '#141010' : '#b8261d');
  });
}

function paintRecord() {
  const r = rng(5);
  const [c, g] = makeCanvas(512);
  const C = 256;
  g.fillStyle = '#050505';
  g.fillRect(0, 0, 512, 512);
  for (let rad = 252; rad > 92; rad -= 1.6) {
    const gap = rad < 200 && rad > 196;
    g.strokeStyle = `rgba(255,255,255,${gap ? 0.01 : 0.05 + r() * 0.06})`;
    g.lineWidth = 1;
    g.beginPath();
    g.arc(C, C, rad, 0, TAU);
    g.stroke();
  }
  // A faint sheen wedge so the turning reads.
  g.fillStyle = 'rgba(255,255,255,0.06)';
  g.beginPath();
  g.moveTo(C, C);
  g.arc(C, C, 250, -0.4, 0.15);
  g.fill();
  g.fillStyle = '#c4302a';
  g.beginPath();
  g.arc(C, C, 88, 0, TAU);
  g.fill();
  g.strokeStyle = '#f0d9a6';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(C, C, 80, 0, TAU);
  g.stroke();
  text(g, 'AIOLOU', C, C - 44, `800 30px ${FONT.display}`, '#f6e8c6', 4);
  text(g, 'RECORDS', C, C - 18, `600 14px ${FONT.display}`, '#f6e8c6', 5);
  text(g, 'Midnight Fade', C, C + 32, `italic 400 18px ${FONT.serif}`, '#f6e8c6');
  text(g, '78 RPM', C, C + 56, `600 13px ${FONT.display}`, '#f6e8c6', 3);
  g.fillStyle = '#000';
  g.beginPath();
  g.arc(C, C, 6, 0, TAU);
  g.fill();
  return c;
}

// White to black, opaque: added on top for light pools, or shown as is.
function paintRadial() {
  const [c, g] = makeCanvas(128);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return c;
}

// Engraved scrollwork for the cash register (bump).
function chasedBrass() {
  const r = rng(13);
  const [c, g] = makeCanvas(256);
  g.fillStyle = '#808080';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#d8d8d8';
  g.lineWidth = 3;
  g.lineCap = 'round';
  g.lineWidth = 2;
  // Rows of acanthus scrolls: a spiral, then a leaf curling off it.
  for (let row = 0; row < 8; row++) {
    for (let k = 0; k < 6; k++) {
      const x = k * 44 + (row % 2) * 22 + r() * 6;
      const y = row * 32 + 16;
      const s = 7 + r() * 4;
      const dir = row % 2 ? -1 : 1;
      g.beginPath();
      for (let a = 0; a < 9; a += 0.3) g.lineTo(x + Math.cos(a * dir) * s * (1 - a / 11), y + Math.sin(a * dir) * s * (1 - a / 11));
      g.stroke();
      g.beginPath();
      g.moveTo(x + s, y);
      g.bezierCurveTo(x + s * 1.8, y - s * 1.4, x + s * 2.6, y + s, x + s * 3.2, y - s * 0.4);
      g.stroke();
    }
  }
  g.fillStyle = '#5a5a5a';
  for (let i = 0; i < 500; i++) g.fillRect(r() * 256, r() * 256, 1.5, 1.5);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 4);
  return t;
}

// ======================================================================
// Lounge
// ======================================================================

// A print in a moulded frame with a cream mat, on the back wall, with a
// brass picture light above it.
function buildPoster(M, L, rect, x, y, w, h, frameMat) {
  const g = new THREE.Group();
  g.position.set(x, y, -2.2);
  const mat = 0.03;
  const f = 0.032;
  const W = w + 2 * (mat + f);
  const H = h + 2 * (mat + f);
  g.add(mesh(new THREE.BoxGeometry(W - 0.02, H - 0.02, 0.012), frameMat, 0, 0, 0.008));
  g.add(mesh(new THREE.PlaneGeometry(w + 2 * mat, h + 2 * mat), M.towel, 0, 0, 0.0145));
  g.add(mesh(atlas(new THREE.PlaneGeometry(w, h), rect), L.print, 0, 0, 0.015));
  for (const [bx, by, bw, bh] of [
    [0, (H - f) / 2, W, f],
    [0, -(H - f) / 2, W, f],
    [(W - f) / 2, 0, f, H - 2 * f],
    [-(W - f) / 2, 0, f, H - 2 * f],
  ]) {
    g.add(mesh(new RoundedBoxGeometry(bw, bh, 0.034, 2, 0.01), frameMat, bx, by, 0.02));
  }
  const top = H / 2;
  g.add(rod([0, top - 0.03, 0.02], [0, top + 0.06, 0.11], 0.006, M.brass));
  const hood = mesh(new THREE.CylinderGeometry(0.022, 0.022, w * 0.7, 20), M.brass, 0, top + 0.07, 0.12);
  hood.rotation.z = Math.PI / 2;
  g.add(hood);
  g.add(mesh(new THREE.BoxGeometry(w * 0.66, 0.006, 0.014), L.glow, 0, top + 0.05, 0.12));
  return g;
}

// Chesterfield: rolled arms and a deep-buttoned back, all in oxblood
// leather, brass nailheads along the arms, on bun feet.
function buildSofa(M) {
  const g = new THREE.Group();
  const W = 2.0;
  const D = 0.8;
  const H = 0.74;
  const foot = 0.08;
  const seat = 0.44;
  const nail = new THREE.SphereGeometry(0.0065, 6, 4);

  g.add(mesh(new RoundedBoxGeometry(W - 0.04, 0.28, D - 0.04, 4, 0.05), M.leather, 0, foot + 0.15, 0.0));
  const cw = (W - 0.4) / 2;
  for (const s of [-1, 1]) {
    g.add(mesh(new RoundedBoxGeometry(cw - 0.01, 0.13, D - 0.24, 4, 0.055), M.leather, (s * cw) / 2, seat - 0.04, 0.09));
  }
  // Back: body, then the buttoned face between the arms.
  g.add(mesh(new RoundedBoxGeometry(W - 0.3, H - foot, 0.22, 5, 0.08), M.leather, 0, foot + (H - foot) / 2, -D / 2 + 0.11));
  const faceH = H - seat - 0.04;
  const face = tufted(W - 0.38, faceH, 0.2, 0.19, 0.03);
  const back = new THREE.Group();
  back.position.set(0, seat + faceH / 2 - 0.01, -D / 2 + 0.215);
  back.rotation.x = -0.08;
  back.add(mesh(face.geo, M.leather));
  for (const [bx, by] of face.buttons) back.add(mesh(nail, M.leather, bx, by, 0.004));
  g.add(back);

  // Arms: a block topped by an outward roll, buttoned on the inside.
  for (const s of [-1, 1]) {
    const ax = s * (W / 2 - 0.1);
    g.add(mesh(new RoundedBoxGeometry(0.18, H - foot - 0.07, D - 0.02, 4, 0.05), M.leather, ax, foot + (H - foot - 0.07) / 2, 0));
    const roll = mesh(new THREE.CylinderGeometry(0.085, 0.085, D, 36), M.leather, s * (W / 2 - 0.085), H - 0.085, 0);
    roll.rotation.x = Math.PI / 2;
    g.add(roll);
    const inner = tufted(D - 0.32, H - seat - 0.12, 0.2, 0.19, 0.022);
    const side = new THREE.Group();
    side.position.set(s * (W / 2 - 0.19), seat + (H - seat - 0.12) / 2 + 0.02, 0.06);
    side.rotation.y = -s * Math.PI / 2;
    side.add(mesh(inner.geo, M.leather));
    for (const [bx, by] of inner.buttons) side.add(mesh(nail, M.leather, bx, by, 0.004));
    g.add(side);
    // Nailheads round the scroll and down the front of the arm.
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU;
      g.add(mesh(nail, M.brass, s * (W / 2 - 0.085) + Math.cos(a) * 0.07, H - 0.085 + Math.sin(a) * 0.07, D / 2 + 0.002));
    }
    for (let y = foot + 0.04; y < H - 0.17; y += 0.028) g.add(mesh(nail, M.brass, ax, y, (D - 0.02) / 2 + 0.003));
  }
  for (let x = -W / 2 + 0.22; x <= W / 2 - 0.21; x += 0.028) g.add(mesh(nail, M.brass, x, foot + 0.035, D / 2 - 0.016));

  const bun = lathe([[0, 0], [0.035, 0], [0.05, 0.025], [0.045, 0.06], [0.03, foot], [0, foot]], 20);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(bun, M.ebony, sx * (W / 2 - 0.1), 0, sz * (D / 2 - 0.1)));
  return g;
}

// A deep-buttoned panel facing +z: diamonds puff out between the buttons.
// `sx` is the spacing between buttons in a row, `sy` twice the row pitch.
function tufted(w, h, sx, sy, depth) {
  const geo = new THREE.PlaneGeometry(w, h, Math.round(w / 0.0125), Math.round(h / 0.0125));
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const u = x / sx + y / sy;
    const v = x / sx - y / sy;
    const puff = Math.sin(Math.PI * (u - Math.floor(u))) * Math.sin(Math.PI * (v - Math.floor(v)));
    // Flatten into the frame at the top edge so the puffs don't end in a cliff.
    const edge = clamp((h / 2 - y) / 0.03, 0, 1);
    p.setZ(i, depth * Math.pow(puff, 0.45) * edge);
  }
  geo.computeVertexNormals();
  const buttons = [];
  const ni = Math.ceil(w / sx);
  const nj = Math.ceil(h / sy);
  for (let i = -ni; i <= ni; i++) {
    for (let j = -nj; j <= nj; j++) {
      if ((i + j) % 2) continue;
      const bx = (i * sx) / 2;
      const by = (j * sy) / 2;
      if (Math.abs(bx) < w / 2 - 0.03 && Math.abs(by) < h / 2 - 0.025) buttons.push([bx, by]);
    }
  }
  return { geo, buttons };
}

function buildBarCart(M, L) {
  const g = new THREE.Group();
  const W = 0.72;
  const D = 0.42;
  // Brass frame, two walnut shelves with a gallery rail on top.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) g.add(rod([sx * W / 2, 0.08, sz * D / 2], [sx * W / 2, 0.86, sz * D / 2], 0.011, M.brass));
  }
  for (const y of [0.24, 0.78]) {
    g.add(mesh(new RoundedBoxGeometry(W - 0.02, 0.022, D - 0.02, 2, 0.006), L.lacquer, 0, y, 0));
    for (const sz of [-1, 1]) g.add(rod([-W / 2, y + 0.012, sz * D / 2], [W / 2, y + 0.012, sz * D / 2], 0.008, M.brass));
  }
  for (const sz of [-1, 1]) g.add(rod([-W / 2, 0.86, sz * D / 2], [W / 2, 0.86, sz * D / 2], 0.008, M.brass));
  for (const sx of [-1, 1]) g.add(rod([sx * W / 2, 0.86, -D / 2], [sx * W / 2, 0.86, D / 2], 0.008, M.brass));
  // Handle on the right, big wheels on the left, ball feet on the right.
  for (const sz of [-1, 1]) g.add(rod([W / 2, 0.82, sz * 0.12], [W / 2 + 0.07, 0.86, sz * 0.12], 0.007, M.brass));
  g.add(rod([W / 2 + 0.07, 0.86, -0.15], [W / 2 + 0.07, 0.86, 0.15], 0.012, M.brass));
  for (const sz of [-1, 1]) {
    const wheel = new THREE.Group();
    wheel.position.set(-W / 2 + 0.02, 0.11, sz * (D / 2 + 0.025));
    const tyre = mesh(new THREE.TorusGeometry(0.1, 0.011, 10, 40), M.rubber);
    const rim = mesh(new THREE.TorusGeometry(0.088, 0.006, 8, 40), M.brass);
    wheel.add(tyre, rim);
    for (let i = 0; i < 6; i++) {
      const spoke = mesh(new THREE.BoxGeometry(0.176, 0.006, 0.006), M.brass);
      spoke.rotation.z = (i / 6) * Math.PI;
      wheel.add(spoke);
    }
    const hub = mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.03, 16), M.brass);
    hub.rotation.x = Math.PI / 2;
    wheel.add(hub);
    g.add(wheel);
    g.add(mesh(new THREE.SphereGeometry(0.022, 14, 10), M.brass, W / 2, 0.06, sz * D / 2));
  }

  // On top: a tray, a crystal decanter of whisky and two tumblers.
  const top = 0.791;
  g.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.008, 40), M.satin, -0.08, top + 0.004, 0));
  const decanter = new THREE.Group();
  decanter.position.set(-0.13, top + 0.008, -0.03);
  decanter.add(mesh(lathe([[0, 0], [0.058, 0], [0.064, 0.008], [0.064, 0.085], [0, 0.085]], 32), M.amber));
  decanter.add(mesh(lathe([[0, 0], [0.066, 0], [0.072, 0.012], [0.074, 0.12], [0.06, 0.165], [0.026, 0.19], [0.022, 0.235], [0.03, 0.245], [0, 0.245]], 40), M.glass));
  decanter.add(mesh(new THREE.IcosahedronGeometry(0.034, 0), M.glass, 0, 0.28, 0));
  g.add(decanter);
  for (const [x, z] of [[0.0, 0.08], [0.06, -0.06]]) {
    const glass = new THREE.Group();
    glass.position.set(x, top + 0.008, z);
    glass.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.025, 24), M.amber, 0, 0.022, 0));
    glass.add(mesh(lathe([[0, 0], [0.04, 0], [0.042, 0.012], [0.044, 0.09], [0.039, 0.09], [0.037, 0.012], [0, 0.012]], 28), M.glass));
    g.add(glass);
  }
  // Ice bucket and a shaker.
  g.add(mesh(lathe([[0, 0], [0.05, 0], [0.058, 0.11], [0.054, 0.11], [0.047, 0.006], [0, 0.006]], 32), M.chrome, 0.22, top, 0.05));
  g.add(mesh(lathe([[0, 0], [0.034, 0], [0.036, 0.13], [0.028, 0.16], [0.016, 0.2], [0, 0.205]], 28), M.satin, 0.24, top, -0.11));

  // Bottles on the lower shelf.
  const bottle = lathe([[0, 0], [0.045, 0], [0.048, 0.01], [0.048, 0.2], [0.03, 0.24], [0.016, 0.26], [0.016, 0.3], [0, 0.3]], 28);
  for (const [x, z, s] of [[-0.2, -0.05, 1], [-0.08, 0.06, 0.85], [0.18, -0.02, 0.95]]) {
    const b = mesh(bottle, M.amber, x, 0.252, z);
    b.scale.setScalar(s);
    g.add(b);
    g.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.04, 16), M.ebony, x, 0.252 + 0.31 * s, z));
  }
  return g;
}

// Brass wall sconce: a backplate, a swan-neck arm and a frosted tulip
// shade lit from inside. Origin on the wall at the backplate.
function buildSconce(M, L) {
  const g = new THREE.Group();
  g.add(mesh(new RoundedBoxGeometry(0.07, 0.16, 0.014, 2, 0.006), M.brass, 0, 0, 0.007));
  g.add(mesh(tube([[0, -0.03, 0.01], [0, -0.03, 0.07], [0, 0.0, 0.12], [0, 0.07, 0.13]], 0.007, 24, 8), M.brass));
  g.add(mesh(lathe([[0, 0], [0.02, 0], [0.026, 0.02], [0.018, 0.03], [0, 0.03]], 20), M.brass, 0, 0.065, 0.13));
  g.add(mesh(lathe([[0.02, 0], [0.034, 0.012], [0.052, 0.05], [0.066, 0.1], [0.072, 0.135]], 28), L.frosted, 0, 0.09, 0.13));
  g.add(mesh(new THREE.SphereGeometry(0.022, 14, 10), L.glow, 0, 0.13, 0.13));
  return g;
}

// A 1940s-style jukebox: walnut cabinet with a round top, a lit arch and
// bubble tubes framing the window, a selector strip and a speaker grille.
function buildJukebox(M, L) {
  const body = new THREE.Group();
  const W = 0.84;
  const D = 0.56;
  const zf = D / 2; // front face

  body.add(mesh(new RoundedBoxGeometry(W + 0.03, 0.06, D + 0.03, 2, 0.01), M.blackChrome, 0, 0.03, 0));
  body.add(mesh(new RoundedBoxGeometry(W, 0.86, D, 4, 0.025), L.lacquer, 0, 0.49, 0));
  const upper = domeShape(W, 0.6);
  upper.holes.push(domeShape(0.48, 0.45, 0.05, new THREE.Path()));
  body.add(mesh(extrude(upper, D, 0.006), L.lacquer, 0, 0.9, 0));

  // The window: a warm chamber behind glass, framed in chrome.
  body.add(mesh(fitUv(new THREE.ShapeGeometry(domeShape(0.48, 0.45, 0.95))), L.chamber, 0, 0, -0.14));
  body.add(mesh(new THREE.ShapeGeometry(domeShape(0.48, 0.45, 0.95)), M.glass, 0, 0, zf - 0.01));
  body.add(mesh(tube(archPoints(0.24, 0.95, 1.16, zf + 0.004), 0.01, 120, 8), M.chrome));
  body.add(mesh(new THREE.BoxGeometry(0.5, 0.02, 0.03), M.chrome, 0, 0.95, zf));
  // Records waiting in the carousel behind the turntable.
  for (let i = 0; i < 7; i++) {
    const a = (i / 6 - 0.5) * 2.0;
    const disc = mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.004, 32), M.ebony, Math.sin(a) * 0.15, 1.24, -0.08 - Math.cos(a) * 0.03);
    disc.rotation.set(0, 0, Math.PI / 2);
    disc.rotateOnWorldAxis(UP, a);
    body.add(disc);
  }

  // Lit arch band and bubble tubes, up the sides and over the top.
  body.add(mesh(tube(archPoints(0.36, 0.1, 1.08, zf - 0.008), 0.034, 160, 12), L.band));
  body.add(mesh(tube(archPoints(0.29, 0.12, 1.08, zf + 0.018), 0.013, 160, 10), L.bubbles));
  body.add(mesh(tube(archPoints(0.42, 0.9, 1.08, zf + 0.004), 0.011, 120, 8), M.chrome));

  // Selector: title strips under glass, a row of buttons.
  const sel = new THREE.Group();
  sel.position.set(0, 0.86, zf + 0.04);
  sel.rotation.x = -0.55;
  sel.add(mesh(new RoundedBoxGeometry(0.52, 0.2, 0.06, 3, 0.012), M.chrome, 0, 0, -0.02));
  sel.add(mesh(atlas(new THREE.PlaneGeometry(0.46, 0.15), ART.titles), L.print, 0, 0.01, 0.0105));
  for (let i = 0; i < 10; i++) sel.add(mesh(new RoundedBoxGeometry(0.03, 0.014, 0.02, 2, 0.004), M.ivory, -0.2 + i * 0.0445, -0.083, 0.01));
  body.add(sel);

  // Speaker grille: backlit plastic behind chrome bars.
  body.add(mesh(new THREE.PlaneGeometry(0.5, 0.46), L.panel, 0, 0.38, zf + 0.002));
  for (let i = 0; i < 9; i++) body.add(mesh(new THREE.BoxGeometry(0.012, 0.46, 0.012), M.chrome, -0.2 + i * 0.05, 0.38, zf + 0.012));
  for (const y of [0.15, 0.61]) body.add(mesh(new THREE.BoxGeometry(0.52, 0.02, 0.02), M.chrome, 0, y, zf + 0.012));
  const medal = mesh(new THREE.TorusGeometry(0.07, 0.01, 10, 40), M.chrome, 0, 0.38, zf + 0.02);
  body.add(medal);
  body.add(mesh(new THREE.CircleGeometry(0.06, 32), M.blackChrome, 0, 0.38, zf + 0.019));

  // Turntable, tilted towards the room so the record reads.
  const deck = new THREE.Group();
  deck.position.set(0, 1.06, 0.05);
  deck.rotation.x = 0.85;
  deck.add(mesh(new THREE.CylinderGeometry(0.128, 0.128, 0.012, 48), M.blackChrome, 0, -0.008, 0));
  const record = mesh(new THREE.CylinderGeometry(0.122, 0.122, 0.003, 64), L.vinyl, 0, 0.0, 0);
  deck.add(record);
  deck.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.02, 8), M.chrome, 0, 0.008, 0));
  deck.add(rod([0.17, 0.012, -0.09], [0.06, 0.012, 0.07], 0.004, M.chrome));
  deck.add(mesh(new THREE.BoxGeometry(0.02, 0.012, 0.03), M.chrome, 0.06, 0.012, 0.07));
  deck.add(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.02, 16), M.chrome, 0.17, 0.006, -0.09));
  return { body, deck: bakeKeeping(deck, record), record };
}

// Bakes a group's static meshes but keeps `keep` live so it can move.
function bakeKeeping(group, keep) {
  group.remove(keep);
  const out = bake(group);
  out.add(keep);
  return out;
}

// ======================================================================
// Reception
// ======================================================================

// Counter-height desk: fluted walnut front between brass columns, a brass
// kick plate and a marble top carrying the lamp, bell and book.
function buildDesk(M, L) {
  const g = new THREE.Group();
  const W = 1.6;
  const D = 0.62;
  const zf = 0.25; // front of the carcass
  g.add(mesh(new THREE.BoxGeometry(W - 0.06, 0.9, D - 0.08), L.lacquer, 0, 0.51, -0.02));
  const flute = new THREE.CylinderGeometry(0.017, 0.017, 0.74, 12, 1, true, -Math.PI / 2, Math.PI);
  for (let i = 0; i < 35; i++) g.add(mesh(flute, L.lacquer, -0.68 + i * 0.04, 0.5, zf));
  g.add(mesh(new THREE.BoxGeometry(W - 0.04, 0.075, 0.03), M.brass, 0, 0.0375, zf + 0.01));
  g.add(mesh(new THREE.BoxGeometry(W - 0.04, 0.03, 0.04), L.lacquer, 0, 0.09, zf + 0.005));
  g.add(mesh(new THREE.BoxGeometry(W - 0.12, 0.02, 0.012), M.brass, 0, 0.885, zf + 0.012));
  g.add(mesh(new RoundedBoxGeometry(W - 0.02, 0.07, D - 0.02, 2, 0.012), L.lacquer, 0, 0.945, -0.005));
  g.add(mesh(new RoundedBoxGeometry(W + 0.06, 0.04, D + 0.04, 2, 0.012), M.marble, 0, 1.0, 0));
  for (const s of [-1, 1]) {
    const x = s * (W / 2 - 0.04);
    g.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.78, 20), M.brass, x, 0.5, zf + 0.012));
    for (const y of [0.1, 0.9]) g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.025, 20), M.brass, x, y, zf + 0.012));
    // Raised side panel with a brass bead.
    g.add(mesh(new RoundedBoxGeometry(0.02, 0.6, D - 0.24, 2, 0.006), L.lacquer, s * (W / 2 - 0.025), 0.5, -0.02));
    g.add(mesh(new THREE.BoxGeometry(0.006, 0.62, 0.008), M.brass, s * (W / 2 - 0.013), 0.5, (D - 0.2) / 2 - 0.02));
  }

  const top = 1.02;
  g.add(place(buildBankersLamp(M, L), [0.52, top, -0.14, -0.35]));
  g.add(place(buildBell(M), [0.6, top, 0.18, 0]));
  g.add(place(buildBook(M, L), [0.12, top, 0.06, -0.12]));
  const sign = new THREE.Group();
  sign.position.set(0.43, top, 0.25);
  sign.rotation.y = -0.2;
  sign.add(mesh(new THREE.BoxGeometry(0.13, 0.005, 0.04), M.brass, 0, 0.0025, 0));
  const face = mesh(atlas(new THREE.PlaneGeometry(0.12, 0.028), ART.ring), L.print, 0, 0.022, 0);
  face.rotation.x = -0.35;
  sign.add(face);
  g.add(sign);
  return g;
}

function buildBankersLamp(M, L) {
  const g = new THREE.Group();
  const base = mesh(new THREE.CylinderGeometry(0.085, 0.09, 0.022, 40), M.brass, 0, 0.011, 0);
  base.scale.x = 1.35;
  g.add(base);
  g.add(mesh(new THREE.SphereGeometry(0.026, 20, 12), M.brass, 0, 0.028, -0.03));
  g.add(rod([0, 0.03, -0.03], [0, 0.31, -0.03], 0.008, M.brass));
  g.add(rod([0, 0.31, -0.03], [0, 0.33, 0.02], 0.007, M.brass));
  // Emerald glass shade, a half cylinder with its ends closed.
  const shade = new THREE.Group();
  shade.position.set(0, 0.33, 0.03);
  shade.rotation.x = 0.18;
  const half = new THREE.CylinderGeometry(0.075, 0.075, 0.27, 32, 1, true, 0, Math.PI);
  half.rotateZ(Math.PI / 2);
  shade.add(mesh(half, L.bankers));
  for (const s of [-1, 1]) {
    const end = mesh(new THREE.CircleGeometry(0.075, 24, 0, Math.PI), L.bankers, s * 0.135, 0, 0);
    end.rotation.y = Math.PI / 2;
    shade.add(end);
  }
  shade.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 10), L.glow, 0, -0.02, 0).rotateZ(Math.PI / 2));
  g.add(shade);
  for (let i = 0; i < 6; i++) g.add(mesh(new THREE.SphereGeometry(0.0035, 6, 4), M.brass, 0.05, 0.3 - i * 0.011, 0.1));
  return g;
}

function buildBell(M) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.048, 0.05, 0.016, 32), M.ebony, 0, 0.008, 0));
  const dome = mesh(new THREE.SphereGeometry(0.043, 32, 16, 0, TAU, 0, Math.PI / 2), M.brass, 0, 0.016, 0);
  dome.scale.y = 0.85;
  g.add(dome);
  g.add(mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.02, 8), M.chrome, 0, 0.06, 0));
  g.add(mesh(new THREE.SphereGeometry(0.008, 14, 10), M.chrome, 0, 0.072, 0));
  return g;
}

function buildBook(M, L) {
  const g = new THREE.Group();
  g.add(mesh(new RoundedBoxGeometry(0.47, 0.01, 0.33, 1, 0.003), M.leather, 0, 0.005, 0));
  g.add(mesh(new THREE.BoxGeometry(0.44, 0.012, 0.3), M.towel, 0, 0.016, 0));
  // Pages rise from the spine and settle towards the edges.
  const pages = atlas(new THREE.PlaneGeometry(0.44, 0.3, 32, 1), ART.pages);
  pages.rotateX(-Math.PI / 2);
  const p = pages.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, 0.012 * Math.sin(Math.PI * Math.sqrt(Math.abs(p.getX(i)) / 0.22)));
  pages.computeVertexNormals();
  g.add(mesh(pages, L.print, 0, 0.0225, 0));
  const pen = new THREE.Group();
  pen.position.set(0.1, 0.04, 0.02);
  pen.rotation.y = 0.6;
  pen.add(mesh(new THREE.CylinderGeometry(0.0055, 0.0045, 0.13, 14), M.ebony).rotateZ(Math.PI / 2));
  pen.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.012, 14), M.brass, 0.03, 0, 0).rotateZ(Math.PI / 2));
  g.add(pen);
  g.add(mesh(new THREE.BoxGeometry(0.012, 0.002, 0.1), M.leather, -0.02, 0.026, 0.19));
  return g;
}

// Brass cash register: keys on a sloping front, the amount shown on tabs
// in a window on top, and a walnut drawer underneath. `body` is static,
// `moving` holds the drawer, the tabs and the keys.
function buildRegister(M, L) {
  const body = new THREE.Group();
  const moving = new THREE.Group();
  const W = 0.4;
  const D = 0.36;
  const brass = L.brassWork;

  // Drawer housing, open at the front.
  for (const y of [0.006, 0.104]) body.add(mesh(new THREE.BoxGeometry(W, 0.012, D), L.lacquer, 0, y, 0));
  for (const s of [-1, 1]) body.add(mesh(new THREE.BoxGeometry(0.012, 0.11, D), L.lacquer, s * (W / 2 - 0.006), 0.055, 0));
  body.add(mesh(new THREE.BoxGeometry(W, 0.11, 0.012), L.lacquer, 0, 0.055, -D / 2 + 0.006));

  // Brass case: a keyboard slope in front, flat behind.
  const prof = new THREE.Shape();
  prof.moveTo(-0.17, 0);
  prof.lineTo(0.17, 0);
  prof.lineTo(0.17, 0.035);
  prof.lineTo(0.05, 0.17);
  prof.lineTo(-0.17, 0.17);
  prof.closePath();
  const caseGeo = new THREE.ExtrudeGeometry(prof, { depth: 0.38, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2 });
  caseGeo.translate(0, 0, -0.19);
  caseGeo.rotateY(-Math.PI / 2);
  body.add(mesh(caseGeo, brass, 0, 0.11, 0));

  // Display cabinet with a window, an amount plate and a crest.
  const cz = -0.09;
  body.add(mesh(new THREE.BoxGeometry(0.3, 0.12, 0.01), brass, 0, 0.34, cz - 0.055));
  body.add(mesh(new THREE.BoxGeometry(0.29, 0.11, 0.004), M.ebony, 0, 0.34, cz - 0.048));
  for (const s of [-1, 1]) body.add(mesh(new THREE.BoxGeometry(0.01, 0.12, 0.12), brass, s * 0.145, 0.34, cz));
  body.add(mesh(new THREE.BoxGeometry(0.3, 0.012, 0.12), brass, 0, 0.406, cz));
  body.add(mesh(new THREE.BoxGeometry(0.3, 0.05, 0.012), brass, 0, 0.305, cz + 0.055));
  body.add(mesh(new THREE.BoxGeometry(0.3, 0.016, 0.012), brass, 0, 0.392, cz + 0.055));
  for (const s of [-1, 1]) body.add(mesh(new THREE.BoxGeometry(0.03, 0.06, 0.012), brass, s * 0.135, 0.355, cz + 0.055));
  body.add(mesh(new THREE.PlaneGeometry(0.24, 0.06), M.glass, 0, 0.356, cz + 0.058));
  body.add(mesh(atlas(new THREE.PlaneGeometry(0.2, 0.034), ART.amount), L.print, 0, 0.305, cz + 0.0615));
  body.add(mesh(extrude(archShape(0.26, 0.07, 0.06, 0.0), 0.016, 0.003), brass, 0, 0.412, cz));
  body.add(mesh(new THREE.SphereGeometry(0.014, 16, 12), M.brass, 0, 0.492, cz));

  // Crank on the right side.
  const hub = mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.02, 20), M.brass, W / 2 + 0.008, 0.2, 0.02);
  hub.rotation.z = Math.PI / 2;
  body.add(hub);
  body.add(mesh(new THREE.BoxGeometry(0.008, 0.11, 0.018), M.brass, W / 2 + 0.02, 0.15, 0.02));
  body.add(rod([W / 2 + 0.02, 0.1, 0.02], [W / 2 + 0.07, 0.1, 0.02], 0.009, M.ebony));

  // Drawer: walnut front, brass pull, coin cups inside.
  const drawer = new THREE.Group();
  drawer.add(mesh(new THREE.BoxGeometry(W - 0.026, 0.084, 0.014), L.lacquer, 0, 0.055, D / 2 - 0.007));
  drawer.add(rod([-0.04, 0.055, D / 2 + 0.012], [0.04, 0.055, D / 2 + 0.012], 0.006, M.brass));
  for (const s of [-1, 1]) drawer.add(rod([s * 0.04, 0.055, D / 2], [s * 0.04, 0.055, D / 2 + 0.012], 0.004, M.brass));
  drawer.add(mesh(new THREE.BoxGeometry(W - 0.04, 0.008, D - 0.04), L.lacquer, 0, 0.018, 0));
  for (let i = 0; i < 5; i++) drawer.add(mesh(new THREE.CylinderGeometry(0.026, 0.024, 0.012, 20), M.brass, -0.13 + i * 0.065, 0.028, 0.06));
  for (let i = 0; i < 3; i++) {
    const notes = atlas(new THREE.PlaneGeometry(0.15, 0.076), ART.notes).rotateX(-Math.PI / 2).rotateY(Math.PI / 2);
    drawer.add(mesh(notes, L.print, -0.12 + i * 0.12, 0.03, -0.08));
  }
  const drawerMesh = bake(drawer);
  moving.add(drawerMesh);

  // Amount tabs, hidden behind the plate until a sale rings up.
  const tabGeos = [];
  for (let i = 0; i < 4; i++) {
    const [x, y, w, h] = ART.tabs;
    const geo = atlas(new THREE.PlaneGeometry(0.036, 0.036), [x + (i * w) / 4, y, w / 4, h]);
    geo.translate(-0.06 + i * 0.04, 0, 0);
    tabGeos.push(geo);
  }
  const tabs = mesh(mergeGeometries(tabGeos), L.print, 0, 0.3, cz + 0.03);
  moving.add(tabs);

  // Keys: four rows of six on the slope, as instances so they can dip.
  const a = new THREE.Vector3(0, 0.145, 0.17);
  const b = new THREE.Vector3(0, 0.28, 0.05);
  const normal = new THREE.Vector3(0, 0.135, 0.12).normalize();
  const tilt = new THREE.Quaternion().setFromUnitVectors(UP, normal);
  const stemGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.0035, 0.0035, 0.024, 8).translate(0, 0.012, 0),
    new THREE.TorusGeometry(0.0135, 0.0025, 6, 20).rotateX(Math.PI / 2).translate(0, 0.024, 0),
  ]);
  const capGeo = new THREE.CylinderGeometry(0.0125, 0.0125, 0.006, 20).translate(0, 0.025, 0);
  const keys = [new THREE.InstancedMesh(stemGeo, M.satin, 24), new THREE.InstancedMesh(capGeo, M.ivory, 24)];
  const rest = [];
  const m = new THREE.Matrix4();
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 6; col++) {
      const p = a.clone().lerp(b, (row + 0.5) / 4).addScaledVector(normal, 0.006);
      p.x = (col - 2.5) * 0.055;
      rest.push(p);
      m.compose(p, tilt, new THREE.Vector3(1, 1, 1));
      for (const k of keys) k.setMatrixAt(rest.length - 1, m);
    }
  }
  moving.add(...keys);

  return {
    body,
    moving,
    drawer: drawerMesh,
    tabs,
    keys,
    rest,
    normal,
    tilt,
    depth: new Float32Array(24),
    busy: false,
    one: new THREE.Vector3(1, 1, 1),
    m,
    p: new THREE.Vector3(),
  };
}

// Every nine seconds: four keys, the tabs pop up, the drawer springs open,
// then everything settles back.
function updateRegister(reg, time, reduced) {
  const T = 9;
  const c = reduced ? 0 : time % T;
  const sale = Math.floor(time / T);
  reg.depth.fill(0);
  let busy = false;
  for (let k = 0; k < 4 && !reduced; k++) {
    const t = (c - 0.3 - k * 0.28) / 0.18;
    if (t <= 0 || t >= 1) continue;
    reg.depth[(sale * 5 + k * 7) % 24] = Math.sin(Math.PI * t);
    busy = true;
  }
  // Upload the keys while one is moving and once more to put it back.
  if (busy || reg.busy) {
    for (let i = 0; i < 24; i++) {
      reg.p.copy(reg.rest[i]).addScaledVector(reg.normal, -0.011 * reg.depth[i]);
      reg.m.compose(reg.p, reg.tilt, reg.one);
      for (const key of reg.keys) key.setMatrixAt(i, reg.m);
    }
    for (const key of reg.keys) key.instanceMatrix.needsUpdate = true;
  }
  reg.busy = busy;
  const up = ease(clamp((c - 1.45) / 0.12, 0, 1)) * (1 - ease(clamp((c - 5.6) / 0.3, 0, 1)));
  reg.tabs.position.y = 0.3 + 0.056 * up;
  const t = c - 1.5;
  let open = 0;
  if (t > 0 && t < 3.6) open = 1 - Math.exp(-t * 9) * Math.cos(t * 13);
  else if (t >= 3.6 && t < 4.2) open = 1 - ease((t - 3.6) / 0.6);
  reg.drawer.position.z = 0.16 * open;
}

// Leather club chair: one curved shell for the back and arms, the back
// rising smoothly from the arms, buttoned inside, nailheads round the base.
function buildClubChair(M) {
  const g = new THREE.Group();
  const R = 0.43;
  const r = 0.29;
  const F = 0.3;
  const s = new THREE.Shape();
  s.moveTo(R, -F);
  s.lineTo(R, 0);
  s.absarc(0, 0, R, 0, Math.PI, false);
  s.lineTo(-R, -F);
  s.lineTo(-r, -F);
  s.lineTo(-r, 0);
  s.absarc(0, 0, r, Math.PI, 0, true);
  s.lineTo(r, -F);
  s.closePath();
  let geo = new THREE.ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.045, bevelSize: 0.035, bevelSegments: 5, curveSegments: 40 });
  geo.rotateX(-Math.PI / 2);
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  geo = mergeVertices(geo, 1e-4);
  const p = geo.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const y = p.getY(i) + 0.045;
    const back = Math.max(0, -z) / Math.hypot(x, z);
    const rise = THREE.MathUtils.smoothstep(back, 0.15, 0.8) * 0.26 * clamp(y / 0.55, 0, 1);
    p.setY(i, y + rise);
    uv[i * 2] = (x + z) * 1.5;
    uv[i * 2 + 1] = y * 1.5;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  g.add(mesh(geo, M.leather, 0, 0.07, 0));

  g.add(mesh(new RoundedBoxGeometry(0.6, 0.13, 0.62, 4, 0.05), M.leather, 0, 0.38, 0.03));
  g.add(mesh(new THREE.BoxGeometry(0.58, 0.26, 0.58), M.leather, 0, 0.2, 0.02));
  const nail = new THREE.SphereGeometry(0.0055, 6, 4);
  const ring = R + 0.04;
  for (let d = 0; d < F; d += 0.028) for (const sx of [-1, 1]) g.add(mesh(nail, M.brass, sx * ring, 0.12, F - d));
  for (let a = 0; a <= Math.PI + 1e-3; a += 0.028 / ring) g.add(mesh(nail, M.brass, Math.cos(a) * ring, 0.12, -Math.sin(a) * ring));
  for (let row = 0; row < 3; row++) {
    for (let k = 0; k < 5 - (row % 2); k++) {
      const a = Math.PI / 2 + (k - (4 - (row % 2)) / 2) * 0.32;
      g.add(mesh(new THREE.SphereGeometry(0.009, 10, 8), M.leather, Math.cos(a) * 0.25, 0.56 + row * 0.1, -Math.sin(a) * 0.25));
    }
  }
  const foot = lathe([[0, 0], [0.022, 0], [0.03, 0.03], [0.026, 0.07], [0, 0.07]], 16);
  for (const [x, z] of [[-0.32, -0.22], [0.32, -0.22], [-0.3, 0.26], [0.3, 0.26]]) g.add(mesh(foot, M.ebony, x, 0, z));
  return g;
}

function buildCoffeeTable(M, L) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 56), M.marble, 0, 0.43, 0));
  const rim = mesh(new THREE.TorusGeometry(0.342, 0.009, 8, 64), M.brass, 0, 0.43, 0);
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 48, 1, true), L.lacquer, 0, 0.39, 0));
  g.add(mesh(lathe([[0, 0], [0.2, 0], [0.2, 0.014], [0.07, 0.05], [0.032, 0.1], [0.026, 0.34], [0.07, 0.38], [0, 0.38]], 40), M.brass));

  // Magazines fanned on one side, a tray with two espressos on the other.
  const top = 0.445;
  [[-0.1, 0.06, 0.4, 'mag0'], [-0.06, -0.03, -0.25, 'mag1'], [-0.14, -0.1, 0.9, 'mag2']].forEach(([x, z, ry, name], i) => {
    const mag = new THREE.Group();
    mag.position.set(x, top + i * 0.007, z);
    mag.rotation.y = ry;
    mag.add(mesh(new THREE.BoxGeometry(0.21, 0.006, 0.28), M.towel, 0, 0.003, 0));
    mag.add(mesh(atlas(new THREE.PlaneGeometry(0.21, 0.28), ART[name]).rotateX(-Math.PI / 2), L.print, 0, 0.0062, 0));
    g.add(mag);
  });
  const tray = new THREE.Group();
  tray.position.set(0.15, top, 0.02);
  tray.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.008, 40), M.brass, 0, 0.004, 0));
  const lip = mesh(new THREE.TorusGeometry(0.11, 0.005, 6, 40), M.brass, 0, 0.01, 0);
  lip.rotation.x = Math.PI / 2;
  tray.add(lip);
  const cup = lathe([[0, 0], [0.02, 0], [0.026, 0.01], [0.03, 0.045], [0.027, 0.045], [0.023, 0.012], [0, 0.012]], 24);
  const saucer = lathe([[0, 0], [0.04, 0], [0.055, 0.01], [0.053, 0.012], [0.038, 0.004], [0, 0.004]], 28);
  for (const [x, z] of [[-0.045, 0.03], [0.05, -0.03]]) {
    tray.add(mesh(saucer, M.porcelain, x, 0.008, z));
    tray.add(mesh(cup, M.porcelain, x, 0.012, z));
    tray.add(mesh(new THREE.CircleGeometry(0.026, 20).rotateX(-Math.PI / 2), M.ebony, x, 0.05, z));
    const handle = mesh(new THREE.TorusGeometry(0.011, 0.003, 6, 14), M.porcelain, x + 0.033, 0.035, z);
    tray.add(handle);
  }
  g.add(tray);
  return g;
}

function buildRug(L) {
  const geo = atlas(new THREE.PlaneGeometry(2.4, 1.52), ART.rug);
  geo.rotateX(-Math.PI / 2);
  return mesh(geo, L.print, -7.4, 0.006, -1.08);
}

// Bentwood coat stand with a fedora on one hook and a tartan scarf on another.
function buildCoatStand(M, L) {
  const g = new THREE.Group();
  g.add(mesh(lathe([[0, 0.3], [0.03, 0.3], [0.024, 0.4], [0.02, 1.0], [0.026, 1.05], [0.019, 1.1], [0.018, 1.72], [0.028, 1.76], [0.03, 1.8], [0, 1.86]], 20), L.lacquer));
  g.add(mesh(new THREE.SphereGeometry(0.032, 16, 12), M.brass, 0, 1.87, 0));
  for (const y of [0.42, 1.06]) {
    const band = mesh(new THREE.TorusGeometry(0.024, 0.005, 6, 20), M.brass, 0, y, 0);
    band.rotation.x = Math.PI / 2;
    g.add(band);
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    const c = Math.cos(a);
    const s = Math.sin(a);
    g.add(mesh(tube([[0.01 * c, 0.42, 0.01 * s], [0.09 * c, 0.3, 0.09 * s], [0.2 * c, 0.1, 0.2 * s], [0.33 * c, 0.02, 0.33 * s]], 0.015, 24, 8), L.lacquer));
    g.add(mesh(new THREE.SphereGeometry(0.02, 12, 8), M.brass, 0.34 * c, 0.018, 0.34 * s));
  }
  // Hooks: three high, three low between them.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const y = i % 2 ? 1.6 : 1.74;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const pts = [[0, 0, 0], [0.08, -0.03, 0], [0.13, 0.0, 0], [0.14, 0.05, 0]].map(([x, yy]) => [x * c, y + yy, x * s]);
    g.add(mesh(tube(pts, 0.006, 16, 6), M.brass));
    g.add(mesh(new THREE.SphereGeometry(0.011, 10, 8), M.brass, 0.14 * c, y + 0.055, 0.14 * s));
  }
  // Fedora on the first high hook.
  const hat = new THREE.Group();
  hat.position.set(0.15, 1.73, 0);
  hat.rotation.set(0.25, 0, -0.9);
  hat.add(mesh(lathe([[0.155, 0], [0.15, 0.012], [0.1, 0.008], [0.088, 0.01], [0.085, 0.08], [0.06, 0.11], [0.02, 0.1], [0, 0.104]], 36), L.felt));
  hat.add(mesh(lathe([[0, -0.004], [0.155, -0.001]], 36), L.felt));
  hat.add(mesh(new THREE.CylinderGeometry(0.0875, 0.0875, 0.024, 36, 1, true), M.ebony, 0, 0.024, 0));
  g.add(hat);
  // Scarf folded over the low hook facing the room.
  const a = (3 / 6) * TAU;
  g.add(scarf(L, 1.6, a));
  return g;
}

// A strip of cloth folded over a hook: the back end hangs longer, and both
// ends drift apart and away from the pole as they fall.
function scarf(L, hy, angle) {
  const width = 0.15;
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = 1 - i / 12; // 1 at the bottom of the back end
    pts.push(new THREE.Vector3(-0.025 * t, hy - 0.04 - t * 0.6, -0.02 - 0.03 * t * t));
  }
  for (let i = 1; i < 8; i++) {
    const a = Math.PI * (i / 8);
    pts.push(new THREE.Vector3(0, hy - 0.04 + Math.sin(a) * 0.035, -Math.cos(a) * 0.02));
  }
  for (let i = 0; i <= 12; i++) {
    const t = i / 12; // 1 at the bottom of the front end
    pts.push(new THREE.Vector3(0.03 * t, hy - 0.04 - t * 0.46, 0.02 + 0.045 * t * t));
  }
  const pos = [];
  const uv = [];
  const idx = [];
  let len = 0;
  pts.forEach((p, i) => {
    if (i) len += p.distanceTo(pts[i - 1]);
    for (const side of [0, 1]) {
      pos.push(p.x + (side - 0.5) * width, p.y, p.z);
      uv.push(side, len / 1.3);
    }
    if (i) idx.push(i * 2 - 2, i * 2 - 1, i * 2, i * 2 - 1, i * 2 + 1, i * 2);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  atlas(geo, ART.scarf);
  geo.computeVertexNormals();
  // Hang along the hook: the cloth's width runs out along the hook.
  geo.translate(0.09, 0, 0);
  const m = mesh(geo, L.print);
  m.rotation.y = -angle;
  return m;
}

// Kentia palm in a glazed pot: arching fronds of folded leaflets, merged
// into one mesh with a little colour variation (kept out of the bake,
// which would drop the colours).
function buildPalm(M, L) {
  const pot = new THREE.Group();
  pot.add(mesh(lathe([[0, 0], [0.15, 0], [0.17, 0.03], [0.2, 0.3], [0.215, 0.44], [0.225, 0.46], [0.205, 0.465], [0, 0.465]], 40), M.blackChrome));
  const band = mesh(new THREE.TorusGeometry(0.212, 0.008, 8, 48), M.brass, 0, 0.42, 0);
  band.rotation.x = Math.PI / 2;
  pot.add(band);
  pot.add(mesh(new THREE.CircleGeometry(0.2, 32).rotateX(-Math.PI / 2), M.rubber, 0, 0.45, 0));

  const r = rng(23);
  const leaf = leafletGeometry();
  const parts = [];
  const color = (geo, hue, light) => {
    const c = new THREE.Color().setHSL(hue, 0.42, light);
    const col = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) c.toArray(col, i);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  };
  const base = new THREE.Vector3(0, 0.45, 0);
  const m = new THREE.Matrix4();
  const side = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const bin = new THREE.Vector3();
  for (let f = 0; f < 11; f++) {
    const yaw = f * 2.4 + r() * 0.3;
    const lean = 0.25 + r() * 0.6;
    const len = 1.15 + r() * 0.55;
    // Against a wall: fronds that would point into it swing round to the sides.
    const out = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
    if (out.z < 0) out.setZ(out.z * 0.25).normalize();
    const curve = new THREE.QuadraticBezierCurve3(
      base.clone().addScaledVector(out, 0.02),
      base.clone().addScaledVector(out, len * 0.25 * lean).add(new THREE.Vector3(0, len * 0.95, 0)),
      base.clone().addScaledVector(out, len * (0.35 + lean * 0.55)).add(new THREE.Vector3(0, len * (1.0 - lean * 0.45), 0))
    );
    parts.push(color(new THREE.TubeGeometry(curve, 16, 0.009, 6), 0.25, 0.3).deleteAttribute('uv'));
    for (let i = 0; i < 20; i++) {
      const t = 0.28 + (i / 19) * 0.7;
      const p = curve.getPoint(t);
      const tan = curve.getTangent(t);
      side.crossVectors(tan, UP).normalize();
      const size = (0.2 + 0.2 * Math.sin((Math.PI * (t - 0.24)) / 0.76)) * (0.9 + r() * 0.2);
      for (const s of [-1, 1]) {
        dir.copy(tan).multiplyScalar(0.5).addScaledVector(side, s * 0.86).add(new THREE.Vector3(0, -0.2 - 0.3 * t, 0)).normalize();
        nrm.copy(UP).addScaledVector(dir, -dir.y).normalize();
        bin.crossVectors(dir, nrm);
        m.makeBasis(dir, nrm, bin).scale(new THREE.Vector3(size, size, size)).setPosition(p);
        parts.push(color(leaf.clone().applyMatrix4(m), 0.27 + r() * 0.05, 0.2 + r() * 0.1));
      }
    }
  }
  return { pot, leaves: new THREE.Mesh(mergeGeometries(parts), L.leaf) };
}

// One palm leaflet, unit length along +x: narrow, folded along the midrib
// and drooping towards the tip.
function leafletGeometry() {
  const n = 6;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= n; i++) {
    const x = i / n;
    const half = 0.06 * Math.pow(Math.sin(Math.PI * Math.min(0.98, x * 0.92 + 0.06)), 0.8);
    const droop = -0.16 * x * x;
    pos.push(x, droop + 0.012, -half, x, droop, 0, x, droop + 0.012, half);
    if (i) {
      const a = (i - 1) * 3;
      const b = i * 3;
      idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Schoolhouse clock: octagonal walnut bezel, cream face, a drop case with
// the pendulum swinging behind a little window. Origin on the wall at the
// centre of the face.
function buildClock(M, L) {
  const body = new THREE.Group();
  const oct = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 8;
    const x = Math.cos(a) * 0.29;
    const y = Math.sin(a) * 0.29;
    if (i) oct.lineTo(x, y);
    else oct.moveTo(x, y);
  }
  oct.holes.push(new THREE.Path().absarc(0, 0, 0.205, 0, TAU, true));
  body.add(mesh(extrude(oct, 0.05, 0.005), L.lacquer, 0, 0, 0.025));
  body.add(mesh(atlas(new THREE.CircleGeometry(0.206, 64), ART.clock), L.print, 0, 0, 0.03));
  body.add(mesh(new THREE.TorusGeometry(0.208, 0.009, 10, 72), M.brass, 0, 0, 0.052));
  body.add(mesh(new THREE.CircleGeometry(0.205, 48), M.glass, 0, 0, 0.058));
  body.add(mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.012, 16).rotateX(Math.PI / 2), M.brass, 0, 0, 0.05));

  const drop = new THREE.Shape();
  drop.moveTo(-0.16, -0.2);
  drop.lineTo(0.16, -0.2);
  drop.lineTo(0.16, -0.5);
  drop.quadraticCurveTo(0.14, -0.62, 0, -0.68);
  drop.quadraticCurveTo(-0.14, -0.62, -0.16, -0.5);
  drop.closePath();
  body.add(mesh(extrude(drop, 0.045, 0.005), L.lacquer, 0, 0, 0.023));
  body.add(mesh(new THREE.PlaneGeometry(0.12, 0.15), M.ebony, 0, -0.46, 0.052));
  for (const [x, y, w, h] of [[0, -0.38, 0.14, 0.012], [0, -0.54, 0.14, 0.012], [-0.065, -0.46, 0.012, 0.17], [0.065, -0.46, 0.012, 0.17]]) {
    body.add(mesh(new THREE.BoxGeometry(w, h, 0.008), M.brass, x, y, 0.057));
  }
  body.add(mesh(new THREE.PlaneGeometry(0.12, 0.15), M.glass, 0, -0.46, 0.062));

  // Hands, built pointing up (12 o'clock) around the centre.
  const shape = (pts) => {
    const s = new THREE.Shape();
    pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
    return new THREE.ExtrudeGeometry(s, { depth: 0.0025, bevelEnabled: false });
  };
  const hour = mesh(shape([[-0.005, -0.025], [0.005, -0.025], [0.004, 0.07], [0.017, 0.085], [0, 0.115], [-0.017, 0.085], [-0.004, 0.07]]), M.ebony, 0, 0, 0.038);
  const minute = mesh(shape([[-0.0035, -0.03], [0.0035, -0.03], [0.0025, 0.14], [0, 0.168], [-0.0025, 0.14]]), M.ebony, 0, 0, 0.042);
  const second = mesh(
    mergeGeometries([shape([[-0.0012, -0.05], [0.0012, -0.05], [0.0008, 0.175], [-0.0008, 0.175]]), new THREE.CylinderGeometry(0.008, 0.008, 0.0025, 16).rotateX(Math.PI / 2).translate(0, -0.04, 0.00125).toNonIndexed()]),
    M.brass,
    0,
    0,
    0.046
  );
  const pendulum = new THREE.Group();
  pendulum.position.set(0, -0.2, 0.055);
  pendulum.add(rod([0, -0.17, 0], [0, -0.27, 0], 0.003, M.brass));
  pendulum.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.006, 32).rotateX(Math.PI / 2), M.brass, 0, -0.275, 0));
  const swing = bake(pendulum);
  const moving = new THREE.Group();
  moving.add(hour, minute, second, swing);
  return { body, moving, hour, minute, second, pendulum: swing };
}

function updateClock(clock, ms, reduced) {
  const s = (ms / 1000) % 60;
  clock.hour.rotation.z = -((ms / 3600000) % 12) / 12 * TAU;
  clock.minute.rotation.z = -((ms / 60000) % 60) / 60 * TAU;
  // The second hand ticks with a little snap; nothing swings when reduced.
  clock.second.visible = !reduced;
  clock.second.rotation.z = -(Math.floor(s) + ease(clamp((s % 1) / 0.12, 0, 1))) / 60 * TAU;
  clock.pendulum.rotation.z = reduced ? 0 : 0.09 * Math.sin((ms / 1000) * Math.PI);
}

// ======================================================================
// Ceiling fans
// ======================================================================

// A brass fan with walnut paddles and a schoolhouse globe. Origin at the
// motor; the canopy sits on the ceiling about a metre above.
function buildFan(M, L) {
  const body = new THREE.Group();
  body.add(mesh(lathe([[0, -0.065], [0.014, -0.065], [0.04, -0.06], [0.085, -0.03], [0.09, 0], [0, 0]], 32), M.brass, 0, 0.98, 0));
  body.add(rod([0, 0.06, 0], [0, 0.93, 0], 0.013, M.brass));
  body.add(mesh(lathe([[0, -0.05], [0.1, -0.05], [0.13, -0.025], [0.13, 0.025], [0.1, 0.055], [0.03, 0.075], [0, 0.075]], 40), M.blackChrome));
  const bandGeo = new THREE.TorusGeometry(0.131, 0.006, 8, 48).rotateX(Math.PI / 2);
  body.add(mesh(bandGeo, M.brass, 0, 0.0, 0));
  body.add(mesh(lathe([[0, -0.1], [0.045, -0.1], [0.055, -0.08], [0.05, -0.05], [0, -0.05]], 28), M.brass));
  body.add(mesh(lathe([[0, -0.258], [0.04, -0.255], [0.078, -0.23], [0.09, -0.17], [0.07, -0.12], [0.045, -0.1]], 32), L.frosted));
  body.add(mesh(new THREE.SphereGeometry(0.012, 12, 8), M.brass, 0, -0.268, 0));

  const rotor = new THREE.Group();
  const paddle = new THREE.Shape();
  paddle.moveTo(0, -0.05);
  paddle.lineTo(0.48, -0.072);
  paddle.quadraticCurveTo(0.56, -0.074, 0.56, 0);
  paddle.quadraticCurveTo(0.56, 0.074, 0.48, 0.072);
  paddle.lineTo(0, 0.05);
  paddle.closePath();
  const blade = extrude(paddle, 0.008, 0.0015).rotateX(-Math.PI / 2);
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    arm.rotation.y = (i / 4) * TAU;
    const b = mesh(blade, M.wood, 0.17, -0.035, 0);
    b.rotation.x = 0.2;
    arm.add(b);
    arm.add(mesh(new THREE.BoxGeometry(0.2, 0.008, 0.034), M.brass, 0.18, -0.026, 0));
    rotor.add(arm);
  }
  rotor.add(mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.03, 40), M.brass, 0, -0.035, 0));
  return { body, rotor };
}
