// Barber props: the worked-in details at and around the stations. Shaving
// kit and bottles on the counters, strops and clipper holsters on the
// cabinet sides, trolleys, hanging capes, a wash station, a chalkboard price
// list, a licence, hair clippings on the floor and a broom. Static pieces are
// baked into one mesh per material; only the towel steamer door, its steam
// and the clippings stay separate.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SERVICES } from './config.js';
import { mesh, bake, makeCanvas, toTexture, rng, TAU, ease, clamp } from './kit.js';

const TOP = 0.93; // counter top surface
const STEAMER = { x: 3.15, z: -1.92, w: 0.36, h: 0.38, d: 0.3 };
const STEAM_COUNT = 26;
const DOOR_CYCLE = 16; // seconds between steamer openings

function box(g, w, h, d, mat, x, y, z, r = 0) {
  const geo = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d);
  const m = mesh(geo, mat, x, y, z);
  g.add(m);
  return m;
}

function cyl(g, rt, rb, h, mat, x, y, z, seg = 16) {
  const m = mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z);
  g.add(m);
  return m;
}

function tube(g, points, r, mat, seg = 32) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const m = mesh(new THREE.TubeGeometry(curve, seg, r, 6), mat);
  g.add(m);
  return m;
}

function lathe(g, profile, mat, x, y, z, seg = 24) {
  const m = mesh(new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r, h)), seg), mat, x, y, z);
  g.add(m);
  return m;
}

function makeMaterials(M) {
  return {
    bristle: new THREE.MeshStandardMaterial({ color: 0xcdbfa6, roughness: 1 }),
    bristleTip: new THREE.MeshStandardMaterial({ color: 0x3a3029, roughness: 1 }),
    cape: new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.85, side: THREE.DoubleSide }),
    capeStripe: new THREE.MeshStandardMaterial({ map: stripeTexture(), roughness: 0.85, side: THREE.DoubleSide }),
    hair: new THREE.MeshStandardMaterial({ color: 0x1c1510, roughness: 0.8 }),
    cord: new THREE.MeshStandardMaterial({ color: 0x0d0d0e, roughness: 0.55 }),
    steel: M.steel,
    enamel: new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.3, metalness: 0.1 }),
    straw: new THREE.MeshStandardMaterial({ color: 0x9a7a45, roughness: 1 }),
  };
}

function stripeTexture() {
  const [c, g] = makeCanvas(128, 128);
  g.fillStyle = '#1d2024';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(230, 225, 215, 0.55)';
  for (let x = 4; x < 128; x += 16) g.fillRect(x, 0, 2, 128);
  return toTexture(c, { repeat: [3, 1] });
}

// ---------------------------------------------------------------- counter kit

function shavingMug(g, M, P, x, z, mugMat) {
  lathe(g, [[0, 0], [0.038, 0], [0.04, 0.005], [0.04, 0.085], [0.036, 0.088], [0.034, 0.012], [0, 0.012]], mugMat, x, TOP, z);
  const handle = mesh(new THREE.TorusGeometry(0.022, 0.006, 6, 14, Math.PI), mugMat, x + 0.04, TOP + 0.045, z);
  handle.rotation.z = -Math.PI / 2;
  g.add(handle);
  // Badger brush standing in the mug, knot up.
  cyl(g, 0.014, 0.012, 0.06, M.ivory, x, TOP + 0.1, z);
  const knot = mesh(new THREE.SphereGeometry(0.024, 14, 10), P.bristle, x, TOP + 0.155, z);
  knot.scale.set(1, 1.5, 1);
  g.add(knot);
  const tips = mesh(new THREE.SphereGeometry(0.0245, 14, 6, 0, TAU, 0, 0.9), P.bristleTip, x, TOP + 0.155, z);
  tips.scale.set(1, 1.5, 1);
  g.add(tips);
}

function barbicide(g, M, P, x, z) {
  lathe(g, [[0, 0], [0.05, 0], [0.052, 0.01], [0.052, 0.2], [0.05, 0.205]], M.glass, x, TOP, z);
  cyl(g, 0.047, 0.047, 0.15, M.liquid, x, TOP + 0.08, z);
  cyl(g, 0.055, 0.055, 0.018, M.blackChrome, x, TOP + 0.212, z);
  // Combs soaking: thin slabs at slight angles.
  for (let i = 0; i < 3; i++) {
    const c = box(g, 0.022, 0.19, 0.003, M.ebony, x - 0.016 + i * 0.016, TOP + 0.12, z + (i - 1) * 0.008);
    c.rotation.z = (i - 1) * 0.12;
  }
}

function aftershaves(g, M, x, z, r) {
  const shapes = [
    [[0, 0], [0.026, 0], [0.026, 0.11], [0.01, 0.13], [0.01, 0.145]],
    [[0, 0], [0.032, 0], [0.034, 0.07], [0.02, 0.1], [0.008, 0.108], [0.008, 0.12]],
    [[0, 0], [0.022, 0], [0.022, 0.15], [0.009, 0.165], [0.009, 0.178]],
  ];
  for (let i = 0; i < 3; i++) {
    const s = shapes[Math.floor(r() * 3)];
    const bx = x + (i - 1) * 0.065;
    const bz = z + (r() - 0.5) * 0.05;
    lathe(g, s, i === 1 ? M.glass : M.amber, bx, TOP, bz, 16);
    const top = s[s.length - 1][1];
    cyl(g, 0.012, 0.012, 0.026, i === 2 ? M.brass : M.blackChrome, bx, TOP + top + 0.013, bz, 12);
  }
}

function combSet(g, M, P, x, z, rot) {
  const set = new THREE.Group();
  set.position.set(x, TOP, z);
  set.rotation.y = rot;
  box(set, 0.19, 0.004, 0.032, M.ebony, 0, 0.002, 0);
  box(set, 0.15, 0.004, 0.026, M.ivory, 0.01, 0.006, 0.042);
  // Flat brush: walnut back on a bristle pad.
  box(set, 0.17, 0.02, 0.055, M.wood, -0.02, 0.022, -0.06, 0.008);
  box(set, 0.155, 0.014, 0.045, P.bristle, -0.02, 0.007, -0.06);
  g.add(set);
}

function neckDuster(g, M, P, x, z, rot) {
  const d = new THREE.Group();
  d.position.set(x, TOP + 0.018, z);
  d.rotation.y = rot;
  const handle = cyl(d, 0.011, 0.014, 0.15, M.wood, 0.075, 0, 0, 12);
  handle.rotation.z = Math.PI / 2;
  const fan = mesh(new THREE.SphereGeometry(0.05, 16, 10), P.bristle, -0.035, 0, 0);
  fan.scale.set(1.3, 0.35, 0.9);
  d.add(fan);
  g.add(d);
}

function sprayBottleSmall(g, M, x, z) {
  cyl(g, 0.026, 0.028, 0.13, M.glass, x, TOP + 0.065, z);
  cyl(g, 0.024, 0.024, 0.08, M.liquid, x, TOP + 0.042, z);
  cyl(g, 0.012, 0.014, 0.04, M.blackChrome, x, TOP + 0.15, z);
  box(g, 0.03, 0.012, 0.012, M.blackChrome, x + 0.012, TOP + 0.168, z);
}

// ---------------------------------------------------------- cabinet sides

function strop(g, M, x, side) {
  // Hook on the cabinet side, strop hanging down flat against it.
  const sx = x + side * 0.862;
  cyl(g, 0.008, 0.008, 0.03, M.brass, sx + side * 0.012, 0.86, -1.95, 10).rotation.z = Math.PI / 2;
  const ring = mesh(new THREE.TorusGeometry(0.022, 0.004, 6, 16), M.brass, sx + side * 0.028, 0.84, -1.95);
  ring.rotation.y = Math.PI / 2;
  g.add(ring);
  box(g, 0.006, 0.5, 0.06, M.leather, sx + side * 0.03, 0.57, -1.95);
  box(g, 0.007, 0.42, 0.055, M.woodDark, sx + side * 0.036, 0.6, -1.95);
  box(g, 0.012, 0.03, 0.07, M.brass, sx + side * 0.03, 0.81, -1.95);
  box(g, 0.012, 0.025, 0.07, M.brass, sx + side * 0.03, 0.31, -1.95);
}

function clipperHolster(g, M, P, x, side) {
  const sx = x + side * 0.86;
  const hx = sx + side * 0.04;
  box(g, 0.08, 0.12, 0.08, M.blackChrome, hx, 0.66, -1.95, 0.01);
  // Clipper standing blade-up in the cup.
  box(g, 0.05, 0.13, 0.04, M.satin, hx, 0.76, -1.95, 0.015);
  box(g, 0.052, 0.008, 0.035, M.steel, hx, 0.83, -1.95);
  tube(g, [[hx, 0.6, -1.95], [hx + side * 0.03, 0.45, -1.92], [hx + side * 0.06, 0.25, -1.86], [hx + side * 0.02, 0.12, -1.8], [sx + side * 0.01, 0.2, -1.84]], 0.004, P.cord);
}

function dryerHolster(g, M, P, x, side) {
  const sx = x + side * 0.86;
  const hx = sx + side * 0.06;
  box(g, 0.02, 0.06, 0.1, M.chrome, sx + side * 0.01, 0.72, -1.95);
  const ring = mesh(new THREE.TorusGeometry(0.045, 0.007, 8, 20), M.chrome, hx, 0.72, -1.95);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  // Dryer hanging nozzle-down through the ring, handle up.
  const body = mesh(new THREE.CylinderGeometry(0.042, 0.03, 0.17, 18), M.ebony, hx, 0.66, -1.95);
  g.add(body);
  cyl(g, 0.026, 0.03, 0.06, M.blackChrome, hx, 0.555, -1.95);
  cyl(g, 0.022, 0.025, 0.13, M.ebony, hx + side * 0.02, 0.8, -1.95).rotation.z = side * -0.2;
  tube(g, [[hx + side * 0.034, 0.87, -1.95], [hx + side * 0.07, 0.75, -1.9], [hx + side * 0.05, 0.45, -1.86], [hx + side * 0.09, 0.3, -1.88], [hx + side * 0.03, 0.18, -1.9], [sx + side * 0.01, 0.15, -1.9]], 0.0045, P.cord, 40);
}

// ---------------------------------------------------------------- steamer

function steamerBody(g, M) {
  const { x, z, w, h, d } = STEAMER;
  // Open-fronted shell: back, sides, top, bottom.
  box(g, w, 0.02, d, M.satin, x, TOP + 0.01, z);
  box(g, w, 0.03, d, M.satin, x, TOP + h - 0.015, z, 0.008);
  box(g, 0.015, h, d, M.satin, x - w / 2 + 0.0075, TOP + h / 2, z);
  box(g, 0.015, h, d, M.satin, x + w / 2 - 0.0075, TOP + h / 2, z);
  box(g, w, h, 0.012, M.steel, x, TOP + h / 2, z - d / 2 + 0.006);
  box(g, w - 0.03, 0.006, d - 0.02, M.chrome, x, TOP + 0.17, z);
  // Rolled towels on two racks.
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 3; i++) {
      const t = mesh(new THREE.CylinderGeometry(0.033, 0.033, d - 0.06, 14), M.towel, x - 0.1 + i * 0.1, TOP + 0.055 + row * 0.155, z + 0.005);
      t.rotation.x = Math.PI / 2;
      g.add(t);
    }
  }
  // Indicator lamp and feet.
  cyl(g, 0.008, 0.008, 0.01, M.amber, x + w / 2 - 0.04, TOP + h - 0.015, z + d / 2 + 0.001, 10).rotation.x = Math.PI / 2;
}

function steamerDoor(M) {
  const { x, z, w, h, d } = STEAMER;
  const pivot = new THREE.Group();
  pivot.position.set(x - w / 2, TOP + 0.02, z + d / 2 + 0.008);
  const door = new THREE.Group();
  box(door, w, 0.02, 0.012, M.satin, w / 2, 0.01, 0);
  box(door, w, 0.02, 0.012, M.satin, w / 2, h - 0.05, 0);
  box(door, 0.02, h - 0.04, 0.012, M.satin, 0.01, (h - 0.04) / 2, 0);
  box(door, 0.02, h - 0.04, 0.012, M.satin, w - 0.01, (h - 0.04) / 2, 0);
  box(door, 0.012, 0.09, 0.02, M.chrome, w - 0.03, (h - 0.04) / 2, 0.016);
  const baked = bake(door);
  const glass = mesh(new THREE.PlaneGeometry(w - 0.03, h - 0.07), M.glass, w / 2, (h - 0.04) / 2, 0);
  glass.castShadow = false;
  baked.add(glass);
  pivot.add(baked);
  return pivot;
}

function steamPoints(T) {
  const pos = new Float32Array(STEAM_COUNT * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    map: T.dot,
    size: 0.2,
    color: 0xd8dde0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

// ---------------------------------------------------------------- trolley

function trolley(g, M, P, x, z, flip) {
  const t = new THREE.Group();
  t.position.set(x, 0, z);
  t.rotation.y = flip ? Math.PI : 0;
  const W = 0.4, D = 0.34;
  // Chrome frame posts and rails.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    cyl(t, 0.009, 0.009, 0.78, M.chrome, sx * W / 2, 0.47, sz * D / 2, 10);
    cyl(t, 0.018, 0.018, 0.02, M.chrome, sx * W / 2, 0.075, sz * D / 2, 12);
    const wheel = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.022, 14), M.rubber, sx * W / 2 + 0.012, 0.03, sz * D / 2);
    wheel.rotation.x = Math.PI / 2;
    t.add(wheel);
    box(t, 0.026, 0.04, 0.03, M.chrome, sx * W / 2 + 0.006, 0.06, sz * D / 2);
  }
  box(t, W, 0.012, D, M.chrome, 0, 0.09, 0);
  // Three walnut drawers with brass pulls.
  box(t, W - 0.02, 0.5, D - 0.02, M.woodDark, 0, 0.36, 0);
  for (let i = 0; i < 3; i++) {
    const y = 0.18 + i * 0.165;
    box(t, W - 0.03, 0.15, 0.012, M.wood, 0, y, D / 2 - 0.004, 0.004);
    box(t, 0.1, 0.012, 0.016, M.brass, 0, y + 0.03, D / 2 + 0.008, 0.005);
  }
  // Top tray with a rim, handle bar on one side.
  box(t, W + 0.02, 0.014, D + 0.02, M.marble, 0, 0.62, 0);
  box(t, W + 0.02, 0.03, 0.008, M.chrome, 0, 0.64, D / 2 + 0.01);
  box(t, W + 0.02, 0.03, 0.008, M.chrome, 0, 0.64, -D / 2 - 0.01);
  const bar = cyl(t, 0.009, 0.009, D + 0.04, M.chrome, W / 2 + 0.05, 0.8, 0, 10);
  bar.rotation.x = Math.PI / 2;
  for (const sz of [-1, 1]) {
    const arm = cyl(t, 0.007, 0.007, 0.05, M.chrome, W / 2 + 0.025, 0.8, sz * (D / 2), 8);
    arm.rotation.z = Math.PI / 2;
  }
  // Tools on top: clipper on its side, scissors, a talc tin, a comb.
  const yT = 0.627;
  box(t, 0.15, 0.04, 0.05, M.blackChrome, -0.08, yT + 0.02, -0.06, 0.015);
  box(t, 0.012, 0.042, 0.048, M.steel, -0.16, yT + 0.021, -0.06);
  tube(t, [[0.0, yT + 0.02, -0.06], [0.08, yT + 0.015, -0.1], [0.15, yT + 0.01, -0.05], [W / 2 + 0.02, yT - 0.05, 0]], 0.004, P.cord);
  box(t, 0.12, 0.004, 0.012, M.steel, 0.06, yT + 0.002, 0.05).rotation.y = 0.4;
  box(t, 0.12, 0.004, 0.012, M.steel, 0.06, yT + 0.006, 0.05).rotation.y = 0.15;
  const ringA = mesh(new THREE.TorusGeometry(0.014, 0.004, 6, 12), M.blackChrome, 0.135, yT + 0.004, 0.06);
  ringA.rotation.x = Math.PI / 2;
  t.add(ringA);
  cyl(t, 0.032, 0.032, 0.11, P.enamel, 0.12, yT + 0.055, -0.07);
  cyl(t, 0.033, 0.033, 0.012, M.chrome, 0.12, yT + 0.116, -0.07);
  box(t, 0.18, 0.004, 0.028, M.ebony, -0.05, yT + 0.002, 0.08).rotation.y = -0.2;
  g.add(t);
}

// ---------------------------------------------------------------- capes

function capeGeometry(seed) {
  const r = rng(seed);
  const W = 16, H = 20;
  const geo = new THREE.PlaneGeometry(1, 1, W, H);
  const p = geo.attributes.position;
  const phase = r() * TAU;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 0.5; // 0..1 across
    const v = 0.5 - p.getY(i); // 0 top .. 1 bottom
    const k = ease(clamp(v * 1.3, 0, 1));
    const width = 0.05 + 0.48 * k;
    const x = (u - 0.5) * width;
    // Folds deepen towards the hem; the whole cape bulges off the wall.
    const fold = Math.sin(u * TAU * 3 + phase + v * 1.5) * 0.025 * k;
    const z = 0.04 + fold + Math.sin(u * Math.PI) * 0.05 * k;
    const hem = v > 0.95 ? Math.sin(u * TAU * 3 + phase) * 0.02 : 0;
    p.setXYZ(i, x, -v * 0.78 + hem, z);
  }
  geo.computeVertexNormals();
  return geo;
}

function capeOnHook(g, M, mat, x, seed) {
  const y = 1.6;
  cyl(g, 0.02, 0.02, 0.012, M.brass, x, y, -2.192, 14).rotation.x = Math.PI / 2;
  const hook = mesh(new THREE.TorusGeometry(0.025, 0.006, 6, 14, Math.PI * 1.2), M.brass, x, y - 0.015, -2.15);
  hook.rotation.set(0, Math.PI / 2, Math.PI * 0.6);
  g.add(hook);
  const cape = mesh(capeGeometry(seed), mat, x, y + 0.01, -2.19);
  g.add(cape);
  // Gathered collar with a snap.
  const collar = mesh(new THREE.TorusGeometry(0.04, 0.012, 6, 16), mat, x, y - 0.01, -2.14);
  collar.scale.set(1, 0.5, 1);
  g.add(collar);
}

// ---------------------------------------------------------------- wash station

function washStation(g, M, P) {
  const x = 7.6;
  // Walnut base cabinet with the basin on top.
  box(g, 0.9, 0.82, 0.5, M.woodDark, x, 0.41, -1.95, 0.01);
  box(g, 0.94, 0.04, 0.54, M.marble, x, 0.84, -1.94);
  const bowl = mesh(new THREE.SphereGeometry(0.25, 28, 14, 0, TAU, Math.PI / 2, Math.PI / 2), M.porcelain, x, 0.98, -1.86);
  bowl.scale.set(1.15, 0.65, 0.95);
  g.add(bowl);
  const rim = mesh(new THREE.TorusGeometry(0.25, 0.025, 10, 32), M.porcelain, x, 0.98, -1.86);
  rim.rotation.x = Math.PI / 2;
  rim.scale.set(1.15, 0.95, 1);
  g.add(rim);
  // Neck rest notch, black rubber.
  box(g, 0.14, 0.03, 0.05, M.rubber, x, 0.99, -1.63, 0.012);
  cyl(g, 0.12, 0.13, 0.14, M.porcelain, x, 0.91, -1.86, 20);
  // Chrome faucet from the wall, gooseneck spout and mixer lever.
  cyl(g, 0.03, 0.035, 0.02, M.chrome, x, 1.1, -2.19, 16).rotation.x = Math.PI / 2;
  tube(g, [[x, 1.1, -2.19], [x, 1.1, -2.12], [x, 1.2, -2.06], [x, 1.2, -1.98], [x, 1.12, -1.93]], 0.012, M.chrome, 24);
  cyl(g, 0.016, 0.016, 0.06, M.chrome, x + 0.11, 1.1, -2.16, 12).rotation.x = Math.PI / 2;
  box(g, 0.012, 0.012, 0.08, M.chrome, x + 0.11, 1.11, -2.1);
  // Hand shower hose hanging on the side.
  tube(g, [[x - 0.11, 1.1, -2.17], [x - 0.15, 0.96, -2.13], [x - 0.2, 0.9, -2.08], [x - 0.24, 0.97, -2.05]], 0.007, M.chrome, 20);
  cyl(g, 0.016, 0.02, 0.1, M.chrome, x - 0.25, 1.02, -2.05, 12);
  // Shelf with shampoo bottles above.
  box(g, 0.7, 0.025, 0.14, M.wood, x, 1.42, -2.13);
  for (const sx of [-1, 1]) box(g, 0.02, 0.1, 0.12, M.brass, x + sx * 0.3, 1.37, -2.14);
  const r = rng(77);
  for (let i = 0; i < 5; i++) {
    const h = 0.14 + r() * 0.06;
    const mat = [M.amber, P.enamel, M.blackChrome, M.amber, M.porcelain][i];
    cyl(g, 0.03, 0.032, h, mat, x - 0.24 + i * 0.12, 1.433 + h / 2, -2.12, 14);
    cyl(g, 0.012, 0.016, 0.03, M.blackChrome, x - 0.24 + i * 0.12, 1.448 + h, -2.12, 10);
  }
  // Folded towels on the marble.
  for (let i = 0; i < 3; i++) box(g, 0.2, 0.035, 0.16, M.towel, x + 0.33, 0.878 + i * 0.036, -1.95, 0.012);
  washChair(g, M, x);
}

function washChair(g, M, x) {
  const z = -0.95;
  // Pedestal base and column.
  cyl(g, 0.24, 0.27, 0.05, M.chrome, x, 0.025, z, 28);
  cyl(g, 0.06, 0.07, 0.3, M.chrome, x, 0.2, z, 16);
  box(g, 0.56, 0.06, 0.5, M.blackChrome, x, 0.37, z);
  // Seat cushion and armrests.
  box(g, 0.52, 0.12, 0.5, M.leather, x, 0.46, z, 0.04);
  for (const sx of [-1, 1]) {
    box(g, 0.08, 0.06, 0.46, M.leather, x + sx * 0.3, 0.66, z + 0.02, 0.025);
    box(g, 0.04, 0.2, 0.04, M.chrome, x + sx * 0.3, 0.53, z + 0.18);
    box(g, 0.04, 0.2, 0.04, M.chrome, x + sx * 0.3, 0.53, z - 0.16);
  }
  // Backrest reclined towards the basin.
  const back = box(g, 0.5, 0.62, 0.12, M.leatherTufted, x, 0.72, z - 0.48, 0.04);
  back.rotation.x = -0.85;
  box(g, 0.52, 0.03, 0.06, M.chrome, x, 0.42, z - 0.24);
  // Leg rest sloping to the front with a chrome foot plate.
  const leg = box(g, 0.48, 0.1, 0.42, M.leather, x, 0.36, z + 0.42, 0.035);
  leg.rotation.x = -0.35;
  box(g, 0.4, 0.015, 0.12, M.chrome, x, 0.18, z + 0.66);
  box(g, 0.03, 0.2, 0.03, M.chrome, x, 0.26, z + 0.58);
}

// ---------------------------------------------------------------- wall pieces

function chalkboardTexture() {
  const W = 1024, H = 748;
  const [c, g] = makeCanvas(W, H);
  g.fillStyle = '#1d2422';
  g.fillRect(0, 0, W, H);
  // Smudged chalk dust from earlier erasing.
  const r = rng(91);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(220, 225, 215, ${0.015 + r() * 0.03})`;
    g.beginPath();
    g.ellipse(r() * W, r() * H, 60 + r() * 180, 20 + r() * 60, r() * 3, 0, TAU);
    g.fill();
  }
  const chalk = (text, x, y, size, align = 'left', color = '#ece9df', font = 'Georgia, serif') => {
    g.font = `${size}px ${font}`;
    g.textAlign = align;
    g.fillStyle = color;
    g.globalAlpha = 0.9;
    g.fillText(text, x, y);
    g.globalAlpha = 0.25;
    g.fillText(text, x + 1.5, y + 1);
    g.globalAlpha = 1;
  };
  chalk('Price List', W / 2, 92, 74, 'center', '#f2efe6', 'italic Georgia, serif');
  g.strokeStyle = 'rgba(240, 236, 226, 0.6)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(330, 116);
  g.quadraticCurveTo(W / 2, 128, 694, 114);
  g.stroke();
  const list = SERVICES.slice(0, 8);
  const top = 190, step = (H - top - 70) / list.length;
  list.forEach((s, i) => {
    const y = top + i * step;
    chalk(s.name, 80, y, 40);
    chalk(`€${s.price}`, W - 80, y, 40, 'right', '#f6c6d4');
    g.font = '40px Georgia, serif';
    const start = 92 + g.measureText(s.name).width;
    g.fillStyle = 'rgba(236, 233, 223, 0.55)';
    for (let dx = start; dx < W - 190; dx += 16) g.fillRect(dx, y - 6, 4, 4);
  });
  chalk('walk-ins welcome', W / 2, H - 34, 34, 'center', '#9fe3f0', 'italic Georgia, serif');
  // Grain: speckle so the chalk does not look printed.
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.05)';
    g.fillRect(r() * W, r() * H, 2, 2);
  }
  return toTexture(c, { aniso: 4 });
}

function chalkboard(g, M) {
  const x = 4.5, y = 1.45, z = -2.17, w = 0.85, h = 0.62;
  const mat = new THREE.MeshStandardMaterial({ map: chalkboardTexture(), roughness: 0.95 });
  g.add(mesh(new THREE.PlaneGeometry(w, h), mat, x, y, z + 0.012));
  box(g, w + 0.08, 0.04, 0.03, M.wood, x, y + h / 2 + 0.02, z);
  box(g, w + 0.08, 0.04, 0.03, M.wood, x, y - h / 2 - 0.02, z);
  box(g, 0.04, h, 0.03, M.wood, x - w / 2 - 0.02, y, z);
  box(g, 0.04, h, 0.03, M.wood, x + w / 2 + 0.02, y, z);
  // Chalk ledge with a stick of chalk.
  box(g, w * 0.6, 0.015, 0.05, M.wood, x, y - h / 2 - 0.045, z + 0.02);
  cyl(g, 0.005, 0.005, 0.06, M.towel, x + 0.15, y - h / 2 - 0.032, z + 0.03, 8).rotation.z = Math.PI / 2;
}

function certificateTexture() {
  const W = 360, H = 480;
  const [c, g] = makeCanvas(W, H);
  g.fillStyle = '#efe6cf';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#7a5a2a';
  g.lineWidth = 6;
  g.strokeRect(16, 16, W - 32, H - 32);
  g.lineWidth = 1.5;
  g.strokeRect(28, 28, W - 56, H - 56);
  g.fillStyle = '#3b2a18';
  g.textAlign = 'center';
  g.font = 'bold 30px Georgia, serif';
  g.fillText('MASTER BARBER', W / 2, 90);
  g.font = 'italic 18px Georgia, serif';
  g.fillText('Licence to practise', W / 2, 124);
  g.font = '15px Georgia, serif';
  g.fillText('Hellenic Guild of Barbers', W / 2, 150);
  g.fillStyle = 'rgba(59, 42, 24, 0.45)';
  for (let i = 0; i < 6; i++) g.fillRect(70, 200 + i * 26, W - 140, 2);
  g.fillStyle = '#3b2a18';
  g.font = 'italic 26px Georgia, serif';
  g.fillText('Nikos', W / 2, 192);
  g.font = '13px Georgia, serif';
  g.fillText('No. 2012 · Athens', W / 2, 380);
  // Gold seal.
  g.fillStyle = '#b8862e';
  g.beginPath();
  g.arc(W - 90, H - 80, 30, 0, TAU);
  g.fill();
  g.strokeStyle = '#e3bf6a';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(W - 90, H - 80, 22, 0, TAU);
  g.stroke();
  return toTexture(c, { aniso: 4 });
}

function certificate(g, M) {
  const x = -4.6, y = 1.36, z = -2.18;
  const mat = new THREE.MeshStandardMaterial({ map: certificateTexture(), roughness: 0.8 });
  g.add(mesh(new THREE.PlaneGeometry(0.24, 0.32), mat, x, y, z + 0.014));
  box(g, 0.3, 0.38, 0.018, M.ebony, x, y, z);
  box(g, 0.3, 0.012, 0.024, M.brass, x, y + 0.19, z + 0.004);
}

function broomAndPan(g, M, P) {
  const x = 8.45;
  // Broom leaning against the wall, bristles on the floor.
  const broom = new THREE.Group();
  broom.position.set(x, 0, -1.95);
  broom.rotation.z = 0.12;
  broom.rotation.x = -0.12;
  cyl(broom, 0.013, 0.013, 1.25, M.wood, 0, 0.78, 0, 10);
  box(broom, 0.3, 0.05, 0.06, M.woodDark, 0, 0.14, 0, 0.01);
  box(broom, 0.28, 0.12, 0.05, P.straw, 0, 0.06, 0);
  cyl(broom, 0.015, 0.015, 0.03, M.brass, 0, 1.38, 0, 10);
  g.add(broom);
  // Dustpan standing upright against the wall next to it.
  const pan = new THREE.Group();
  pan.position.set(x + 0.4, 0, -2.12);
  pan.rotation.x = -0.15;
  box(pan, 0.26, 0.24, 0.01, M.blackChrome, 0, 0.14, 0);
  box(pan, 0.26, 0.01, 0.06, M.blackChrome, 0, 0.02, 0.03);
  cyl(pan, 0.012, 0.012, 0.6, M.woodDark, 0, 0.55, -0.01, 10);
  g.add(pan);
}

// ---------------------------------------------------------------- clippings

function clippings(P, tier) {
  const centres = [-3, 3, 6];
  const per = tier === 2 ? 260 : 120;
  const geo = new THREE.CylinderGeometry(0.0008, 0.0008, 0.018, 3);
  geo.rotateZ(Math.PI / 2);
  const inst = new THREE.InstancedMesh(geo, P.hair, per * centres.length);
  inst.receiveShadow = true;
  const r = rng(4242);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let k = 0;
  for (const cx of centres) {
    for (let i = 0; i < per; i++) {
      // Denser near the chair, thinning out in a ring around it.
      const a = r() * TAU;
      const d = 0.25 + Math.pow(r(), 0.7) * 0.75;
      p.set(cx + Math.cos(a) * d, 0.002, Math.sin(a) * d * 0.8 + 0.1);
      e.set((r() - 0.5) * 0.3, r() * TAU, (r() - 0.5) * 0.3);
      q.setFromEuler(e);
      const len = 0.4 + r() * 1.4;
      s.set(len, 1 + r(), 1 + r());
      inst.setMatrixAt(k++, m.compose(p, q, s));
    }
  }
  return inst;
}

// ---------------------------------------------------------------- stations

function stationKit(g, M, P) {
  // Station -3: barbicide, mug, comb set; holster left, strop right.
  barbicide(g, M, P, -2.78, -1.85);
  shavingMug(g, M, P, -3.18, -1.88, M.porcelain);
  combSet(g, M, P, -3.0, -1.82, 0.08);
  aftershaves(g, M, -3.74, -2.05, rng(11));
  clipperHolster(g, M, P, -3, -1);
  strop(g, M, -3, 1);
  // Main station 0: kept sparse so the hero chair reads.
  shavingMug(g, M, P, 0.32, -1.9, M.ebony);
  aftershaves(g, M, 0.66, -2.06, rng(23));
  neckDuster(g, M, P, -0.18, -1.84, 0.3);
  strop(g, M, 0, -1);
  // Station 3: towel steamer, barbicide, mug; strop left, dryer right.
  barbicide(g, M, P, 2.82, -1.84);
  shavingMug(g, M, P, 3.44, -1.88, P.enamel);
  strop(g, M, 3, -1);
  dryerHolster(g, M, P, 3, 1);
  // Station 6: barbicide, neck duster, comb set, aftershave, spray.
  barbicide(g, M, P, 6.32, -1.86);
  neckDuster(g, M, P, 5.9, -1.83, -0.4);
  combSet(g, M, P, 6.1, -1.86, -0.15);
  aftershaves(g, M, 5.28, -2.06, rng(37));
  sprayBottleSmall(g, M, 5.88, -2.08);
  clipperHolster(g, M, P, 6, -1);
  dryerHolster(g, M, P, 6, 1);
}

export function createProps(ctx) {
  const { M, T } = ctx;
  const P = makeMaterials(M);
  const group = new THREE.Group();

  const stat = new THREE.Group();
  stationKit(stat, M, P);
  steamerBody(stat, M);
  trolley(stat, M, P, 3.85, 0.45, false);
  trolley(stat, M, P, -3.85, 0.45, true);
  capeOnHook(stat, M, P.cape, -5.45, 3);
  capeOnHook(stat, M, P.capeStripe, -5.95, 8);
  capeOnHook(stat, M, P.cape, 1.98, 5);
  washStation(stat, M, P);
  chalkboard(stat, M);
  certificate(stat, M);
  broomAndPan(stat, M, P);
  group.add(bake(stat));

  group.add(clippings(P, ctx.tier));

  const door = steamerDoor(M);
  group.add(door);
  const steam = steamPoints(T);
  group.add(steam);
  const pos = steam.geometry.attributes.position;
  const seeds = new Float32Array(STEAM_COUNT);
  const r = rng(5);
  for (let i = 0; i < STEAM_COUNT; i++) seeds[i] = r();

  // Door swing: 0 closed .. 1 open, over one DOOR_CYCLE.
  function doorOpen(time) {
    const t = (time + 6) % DOOR_CYCLE;
    if (t < 1.2) return ease(t / 1.2);
    if (t < 4.2) return 1;
    if (t < 5.4) return 1 - ease((t - 4.2) / 1.2);
    return 0;
  }

  function update(dt, time, env) {
    if (env.reduced) {
      door.rotation.y = 0;
      steam.visible = false;
      return;
    }
    const open = doorOpen(time);
    door.rotation.y = -1.7 * open;
    // Steam follows the door, lingering a little after it closes.
    const t = (time + 6) % DOOR_CYCLE;
    const level = t < 6.5 ? clamp(Math.min(t / 0.8, (6.5 - t) / 1.5), 0, 1) : 0;
    steam.visible = level > 0.01;
    if (!steam.visible) return;
    steam.material.opacity = 0.12 * level * env.power;
    for (let i = 0; i < STEAM_COUNT; i++) {
      const s = seeds[i];
      const life = (time * 0.35 + s) % 1;
      pos.setXYZ(i,
        STEAMER.x + (s - 0.5) * 0.24 + Math.sin(time * 1.3 + s * 9) * 0.03 * life,
        TOP + 0.25 + life * 0.45,
        STEAMER.z + STEAMER.d / 2 + 0.02 + life * 0.08);
    }
    pos.needsUpdate = true;
  }

  return { group, update };
}
