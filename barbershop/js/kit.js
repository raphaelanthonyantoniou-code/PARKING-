// Shared 3D helpers and materials for the barbershop scene and its modules
// (pool table, lounge, barber props). Units are metres, y is up, the floor
// is y = 0 and the back wall is the plane z = -2.2.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = (t) => t * t * (3 - 2 * t);

// Neon colours in linear light; multiply by an intensity (2–4) for bloom.
export const NEON = {
  pink: new THREE.Color(1.0, 0.16, 0.42),
  cyan: new THREE.Color(0.2, 0.85, 1.0),
  red: new THREE.Color(1.0, 0.12, 0.12),
  green: new THREE.Color(0.25, 1.0, 0.45),
  amber: new THREE.Color(1.0, 0.55, 0.15),
};

// How a neon sign stutters on during the intro: 0 before, a flicker for
// about a second, then 1. `since` is seconds since the intro started.
export function neonLevel(since, power = 1, reduced = false) {
  if (since === null || since < 0) return 0;
  if (reduced) return power;
  const s = since - 0.9;
  if (s < 0) return 0;
  if (s < 0.9) {
    const pattern = [1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    return pattern[Math.floor(s * 14) % pattern.length] * 0.85;
  }
  return 1;
}

// Draws neon tubes on a 2D canvas: layers of blur for the glow, then a hot
// white core. `draw(style, isCore)` must stroke or fill the shape with `style`.
export function neonGlow(g, rgb, draw, k = 1) {
  for (const [blur, alpha] of [[44, 0.45], [20, 0.75], [8, 1]]) {
    g.shadowColor = `rgba(${rgb}, 1)`;
    g.shadowBlur = blur * k;
    draw(`rgba(${rgb}, ${alpha})`, false);
  }
  g.shadowBlur = 0;
  draw('rgba(255, 240, 248, 0.95)', true);
}

// A plane showing a neon canvas texture, added with additive blending.
// Set `mesh.material.color.setScalar(intensity)` every frame (0 = off).
export function neonPlane(canvas, w, h) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({
    map: t,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: 0x000000,
    fog: false,
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}

export function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

export function toTexture(canvas, { repeat = [1, 1], srgb = true, aniso = 1 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

// Small deterministic random so textures look the same on every visit.
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeTextures(aniso) {
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

export function makeMaterials(T) {
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
export function bake(group, x) {
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

// A rectangle with a rounded top, origin at the bottom centre.
export function archShape(w, h, rTop, rBottom) {
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

export function extrude(shape, depth, bevel = 0.0012) {
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

