// A sculpted 3D head for the fade lab: a head scan in clay, with the fade
// carved into the scalp by a shader and the top built from hundreds of hair
// clumps combed the way each style is worn.
// Head scan: Lee Perry-Smith, Infinite-Realities, CC BY 3.0.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const MODEL = new URL('../vendor/models/lee-perry-smith.glb', import.meta.url).href;
// About 5 cm per model unit on this scan.
const CM = 0.2;
// Fade heights above the hairline, in model units, for FADES[].h.
const fadeHeight = (h) => h * 2.2;
const BLEND = 0.6;
const CAP = 2.9;          // the top hair grows above this height
const CENTER = new THREE.Vector3(0, 1.7, 0.1);

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------- the scalp */

// Shader code shared by the head: the hairline, the fade and the hair grain.
const SCALP_GLSL = /* glsl */ `
uniform vec4 uNew;   // fade height, blend, base mm, guard mm
uniform vec4 uOld;
uniform float uCut;  // height the clipper has reached; below it the new cut
uniform float uTime;
varying vec3 vObj;

float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
// Height of the hairline under this point: the sideburn, over the ear,
// dropping behind it to the nape, level across the back.
float hairlineY(vec3 p) {
  float a = abs(atan(p.x, p.z - 0.1)) * 57.2958;
  float y = mix(1.2, 1.95, smoothstep(74.0, 84.0, a));
  y = mix(y, 0.55, smoothstep(100.0, 140.0, a));
  return y;
}
// 1 on the scalp, 0 on the face.
float scalpMask(vec3 p) {
  float a = abs(atan(p.x, p.z - 0.1)) * 57.2958;
  // The temple hairline slopes forward as it rises.
  float edge = mix(74.0, 50.0, smoothstep(1.4, 3.0, p.y));
  float side = smoothstep(edge - 5.0, edge + 3.0, a);
  float top = smoothstep(2.75, 2.95, p.y);
  return max(side, top) * smoothstep(-0.05, 0.08, p.y - hairlineY(p) + 0.04);
}
float lengthAt(vec4 c, float d) {
  float b0 = max(0.0, c.x - c.y);
  if (c.x <= 0.0) return c.w;
  return mix(c.z, c.w, smoothstep(b0, c.x, d));
}
float coverOf(float mm) { return min(1.0, pow(max(0.0, mm) / 7.0, 0.55)); }
`;

function scalpMaterial(color) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0 });
  const uniforms = {
    uNew: { value: new THREE.Vector4(0.8, BLEND, 0.5, 6) },
    uOld: { value: new THREE.Vector4(0.8, BLEND, 0.5, 6) },
    uCut: { value: 99 },
    uTime: { value: 0 },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = 'varying vec3 vObj;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = SCALP_GLSL + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        float hairD = vObj.y - hairlineY(vObj);
        vec4 cutC = vObj.y < uCut ? uNew : uOld;
        float mm = lengthAt(cutC, hairD) * scalpMask(vObj);
        float cov = coverOf(mm);
        // Short hair lies down and back: a grain stretched along the growth.
        vec3 gp = vObj * vec3(70.0, 26.0, 70.0);
        float grain = vnoise(gp) * 0.6 + vnoise(gp * 2.3) * 0.4;
        diffuseColor.rgb *= 1.0 - cov * (0.14 + 0.22 * grain);
        float glow = (1.0 - smoothstep(0.0, 0.05, abs(vObj.y - uCut))) * scalpMask(vObj);
      `)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float h = (grain * 0.9 + vnoise(vObj * 150.0) * 0.5) * cov * 0.012 * (0.4 + min(1.0, mm / 6.0));
          vec3 sp = -vViewPosition;
          vec2 dh = vec2(dFdx(h), dFdy(h));
          vec3 sx = dFdx(sp), sy = dFdy(sp);
          vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
          float det = dot(sx, r1);
          normal = normalize(abs(det) * normal - sign(det) * (dh.x * r1 + dh.y * r2));
        }
      `)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.31, 0.64) * glow * 1.6;
      `);
  };
  return { mat, uniforms };
}

/* ------------------------------------------------------------- the top */

// The head's surface as a radius for every direction from the middle of the
// skull, so hair can be laid along it, over the top and down the back,
// without ray casting.
function radialMap(geo) {
  const NT = 128, NP = 64;
  const r = new Float32Array(NT * NP).fill(0);
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).sub(CENTER);
    if (v.y < -1.2) continue;
    const len = v.length();
    const th = Math.atan2(v.x, v.z), ph = Math.acos(THREE.MathUtils.clamp(v.y / len, -1, 1));
    const it = Math.round(((th + Math.PI) / (2 * Math.PI)) * NT) % NT, ip = Math.min(NP - 1, Math.round((ph / Math.PI) * (NP - 1)));
    for (let dp = -1; dp <= 1; dp++) for (let dt = -1; dt <= 1; dt++) {
      const k = Math.max(0, Math.min(NP - 1, ip + dp)) * NT + ((it + dt + NT) % NT);
      if (len > r[k]) r[k] = len;
    }
  }
  // Fill any gaps from their neighbours.
  for (let pass = 0; pass < 4; pass++) for (let j = 0; j < NP; j++) for (let i = 0; i < NT; i++) {
    const k = j * NT + i;
    if (r[k] > 0) continue;
    const n = [r[j * NT + (i + 1) % NT], r[j * NT + (i + NT - 1) % NT], r[Math.min(NP - 1, j + 1) * NT + i], r[Math.max(0, j - 1) * NT + i]].filter((x) => x > 0);
    if (n.length) r[k] = n.reduce((a, b) => a + b) / n.length;
  }
  // Surface point (plus an offset along the radius) in a direction.
  return (dir, off = 0, out = new THREE.Vector3()) => {
    const th = Math.atan2(dir.x, dir.z), ph = Math.acos(THREE.MathUtils.clamp(dir.y, -1, 1));
    const ft = ((th + Math.PI) / (2 * Math.PI)) * NT, fp = (ph / Math.PI) * (NP - 1);
    const i0 = Math.floor(ft), j0 = Math.min(NP - 2, Math.floor(fp)), tt = ft - i0, tp = fp - j0;
    const at = (i, j) => r[j * NT + ((i % NT) + NT) % NT];
    const rad = (at(i0, j0) * (1 - tt) + at(i0 + 1, j0) * tt) * (1 - tp) + (at(i0, j0 + 1) * (1 - tt) + at(i0 + 1, j0 + 1) * tt) * tp;
    return out.copy(dir).multiplyScalar(rad + off).add(CENTER);
  };
}

// One clump of hair: a flattened, tapering tube along a path, with a groove
// down the middle so it reads as sculpted strands.
function clump(points, width, thick) {
  const curve = new THREE.CatmullRomCurve3(points);
  const segs = 22, rad = 7;
  const pos = [], idx = [];
  const frames = curve.computeFrenetFrames(segs, false);
  const up = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const c = curve.getPointAt(t);
    const tan = frames.tangents[i];
    // Keep the flat side facing out from the head.
    up.copy(c).sub(CENTER).normalize();
    const side = new THREE.Vector3().crossVectors(tan, up).normalize();
    const nrm = new THREE.Vector3().crossVectors(side, tan).normalize();
    const taper = Math.min(1, t * 6) * (1 - t) ** 0.7;
    for (let j = 0; j < rad; j++) {
      const a = (j / rad) * Math.PI * 2;
      const groove = 1 - 0.35 * Math.max(0, Math.cos(a * 2)) * (Math.sin(a) > 0 ? 1 : 0);
      const w = Math.cos(a) * width * taper, hgt = Math.sin(a) * thick * taper * groove;
      pos.push(c.x + side.x * w + nrm.x * hgt, c.y + side.y * w + nrm.y * hgt, c.z + side.z * w + nrm.z * hgt);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < rad; j++) {
    const a = i * rad + j, b = i * rad + ((j + 1) % rad), c = (i + 1) * rad + j, d = (i + 1) * rad + ((j + 1) % rad);
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Lays clumps over the crown for a style. Each clump starts at a root on
// the crown and travels over the head (back for slicked styles, forward for
// crops and quiffs), rising off the scalp and lying back down.
function buildTop(S, s) {
  const r = rng(1234);
  const len = Math.max(0.14, s.top * CM);
  const back = s.sweep < 0;
  const fringe = s.sweep > 1;
  const count = Math.round(520 + s.top * 70);
  const lift = (s.lift || 0) * 0.04;
  const geos = [];
  const dir = new THREE.Vector3(), p = new THREE.Vector3(), axis = new THREE.Vector3(1, 0, 0);
  const q = new THREE.Quaternion();
  for (let n = 0, tries = 0; n < count && tries < count * 6; tries++) {
    // A root on the crown: above the cap height and behind the hairline.
    dir.set(r() * 2 - 1, 0.35 + r() * 0.75, r() * 2 - 1.05).normalize();
    S(dir, 0, p);
    if (p.y < CAP + 0.02 || p.z > 2.05) continue;
    n++;
    const layer = r();
    const front = smooth((p.z - 0.4) / 1.5);
    const steps = 12;
    const arc = len / 2.2;                 // radians across the skull
    const sweepDir = back ? -1 : 1;
    const drift = (r() - 0.5) * (s.slick ? 0.08 : 0.18) - (back ? 0 : p.x * 0.04);
    const pts = [];
    const d = dir.clone();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Stop a fringe at the brows.
      const sp = S(d, 0);
      if (sp.y < (back ? 1.5 : fringe ? 2.15 : 2.6) && i > 2) break;
      const rise = Math.sin(Math.min(1, t * 1.8) * Math.PI * 0.5);
      // Slicked hair stands up off the front and lies flat toward the back.
      const stand = back ? lift * 1.6 * front * Math.sin(Math.min(1, t * 1.6) * Math.PI) ** 0.8 * (1 - t * 0.5) : lift * (0.3 + front) * Math.sin(Math.min(1, t * 1.25) * Math.PI) * rise;
      const off = 0.035 + layer * (0.04 + s.top * 0.016) * (back ? 1 - t * 0.6 : 1) + stand;
      pts.push(S(d, off));
      // Step over the head: a turn about the ear-to-ear axis, with a little drift.
      q.setFromAxisAngle(axis, sweepDir * arc / steps);
      d.applyQuaternion(q);
      d.x += drift * arc / steps;
      d.normalize();
    }
    if (pts.length < 4) continue;
    if (s.texture) {
      const last = pts[pts.length - 1];
      pts.push(last.clone().add(new THREE.Vector3((r() - 0.5) * 0.1, 0.06 + r() * 0.07 * s.texture, sweepDir * 0.05)));
    }
    const w = 0.06 + r() * 0.07 + s.top * 0.004;
    geos.push(clump(pts, w, w * (s.slick ? 0.32 : 0.42)));
  }
  return geos.length ? mergeGeometries(geos) : new THREE.BufferGeometry();
}

/* ------------------------------------------------------------ the stage */

export async function createHead3D(host, { reduced = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'head3d';
  canvas.setAttribute('aria-hidden', 'true');
  host.append(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 60);
  const CLAY = 0x9aa9b9;

  const gltf = await new GLTFLoader().loadAsync(MODEL);
  let src;
  gltf.scene.traverse((o) => { if (o.isMesh) src = o; });
  const geo = src.geometry;
  geo.computeVertexNormals();
  const scalp = scalpMaterial(CLAY);
  const head = new THREE.Mesh(geo, scalp.mat);
  const pivot = new THREE.Group();
  pivot.add(head);
  head.position.set(0, -1.6, -0.1);
  scene.add(pivot);

  const hairMat = new THREE.MeshStandardMaterial({ color: CLAY, roughness: 0.5, metalness: 0 });
  const hair = new THREE.Mesh(new THREE.BufferGeometry(), hairMat);
  head.add(hair);
  const H = radialMap(geo);

  // Soft studio light with a pink neon rim, like the shop.
  scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x2a2430, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(-6, 7, 6);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xcfe0ff, 0.6);
  fill.position.set(6, 1, 4);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xff4fa3, 2.2);
  rim.position.set(4, 3, -7);
  scene.add(rim);

  // Three-quarter view from the left, face toward the right like the 2D head.
  camera.position.set(-13.6, 2.3, 5.0);
  camera.lookAt(0, 0.75, 0.2);

  let yaw = 0, yawVel = 0, dragging = false, lastX = 0, visible = true, raf = 0, last = 0;
  let cut = null, current = null, topKey = '';

  function resize() {
    const w = host.clientWidth, h = Math.round(w * 1.15);
    if (!w) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  if ('ResizeObserver' in window) new ResizeObserver(() => { resize(); kick(); }).observe(host);
  resize();

  const vec = (s) => new THREE.Vector4(s.fade > 0 ? fadeHeight(s.fade) : 0, BLEND, s.skin ? 0 : 0.5 * (s.base ?? 1), s.side);

  function setStyle(s, { animate = true } = {}) {
    const key = [s.top, s.lift, s.sweep, s.texture, s.slick].map((v) => (typeof v === 'number' ? v.toFixed(2) : String(v))).join();
    if (key !== topKey) {
      topKey = key;
      hair.geometry.dispose();
      hair.geometry = buildTop(H, s);
    }
    const next = vec(s);
    if (current && animate && !reduced && !next.equals(current)) {
      scalp.uniforms.uOld.value.copy(current);
      scalp.uniforms.uNew.value.copy(next);
      cut = { t0: performance.now(), dur: 1600 };
    } else {
      scalp.uniforms.uOld.value.copy(next);
      scalp.uniforms.uNew.value.copy(next);
      scalp.uniforms.uCut.value = 99;
      cut = null;
    }
    current = next;
    kick();
  }

  function frame(now) {
    raf = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    let busy = false;
    if (cut) {
      const p = Math.min(1, (now - cut.t0) / cut.dur);
      scalp.uniforms.uCut.value = 0.2 + p * 3.0;
      if (p >= 1) { cut = null; scalp.uniforms.uOld.value.copy(current); scalp.uniforms.uCut.value = 99; }
      busy = true;
    }
    if (!dragging) {
      yaw += yawVel * dt;
      yawVel *= Math.exp(-dt * 2.5);
      const rest = reduced ? 0 : Math.sin(now / 1000 * 0.4) * 0.22;
      yaw += (rest - yaw) * (1 - Math.exp(-dt * 1.5));
      busy = busy || !reduced || Math.abs(yawVel) > 0.01;
    }
    pivot.rotation.y = yaw;
    renderer.render(scene, camera);
    if (busy && visible) raf = requestAnimationFrame(frame);
    else last = 0;
  }
  function kick() { if (!raf && visible) raf = requestAnimationFrame(frame); }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); }).observe(host);
  }
  // Drag to turn the head.
  canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = (e.clientX - lastX) / canvas.clientWidth * 4;
    lastX = e.clientX;
    yaw += dx; yawVel = dx * 30;
    kick();
  });
  const end = () => { dragging = false; kick(); };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  // Testing hook for screenshots.
  window.__head3d = { setStyle, render: (y = 0) => { pivot.rotation.y = y; renderer.render(scene, camera); }, scalp };
  return { canvas, setStyle };
}
