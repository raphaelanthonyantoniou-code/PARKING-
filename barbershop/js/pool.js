// Pool lounge: an 8-ft walnut table with a working ball simulation, the long
// billiard lamp over it, and a cue rack, scoreboard and neon sign on the
// back wall. The balls run in a 2D simulation on the cloth with fixed
// substeps; everything that never moves is baked into one mesh per material.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TAU, clamp, lerp, ease, NEON, neonGlow, neonPlane, neonLevel, mesh, bake, makeCanvas, toTexture, rng } from './kit.js';

// ---------------------------------------------------------------- sizes
// The table frame has its origin on the floor under the table centre and x
// along the length; world = table frame + (CX, 0, CZ).
const CX = 11;
const CZ = 0.2;
const CLOTH = 0.79; // cloth surface
const R = 0.028575; // ball radius
const BALL_Y = CLOTH + R;
const HX = 1.12; // half the playing length
const HZ = 0.56; // half the playing width
const CW = 0.05; // cushion depth, nose to rail
const BX = HX + CW; // cushion back line
const BZ = HZ + CW;
const OX = BX + 0.12; // outside of the rails
const OZ = BZ + 0.12;
const RAIL_TOP = 0.835;
const JAW = 0.085; // corner jaws start this far from the corner: a 12 cm mouth
const SIDE_JAW = 0.0675; // half the mouth of a side pocket
const SPOT = HX / 2; // head spot at -SPOT, foot spot at +SPOT
const CUE_LEN = 1.47;
const CLOTH_COLOR = 0x0f4f50;

// Pockets in the order the outline walks round the table. The corner holes
// are sized so each jaw ends exactly on the rim.
const corner = (sx, sz) => ({ x: sx * (HX + 0.03), z: sz * (HZ + 0.03), r: Math.hypot(0.03 + JAW - CW, 0.03 - CW) });
const side = (sz) => ({ x: 0, z: sz * (HZ + 0.04), r: 0.075 });
const POCKETS = [corner(1, 1), side(1), corner(-1, 1), corner(-1, -1), side(-1), corner(1, -1)];
const SIDE_BACK = Math.sqrt(POCKETS[1].r ** 2 - (BZ - POCKETS[1].z) ** 2); // where a side jaw meets its hole
const PX = Float64Array.from(POCKETS, (p) => p.x);
const PZ = Float64Array.from(POCKETS, (p) => p.z);
const PR2 = Float64Array.from(POCKETS, (p) => p.r * p.r);

// Cushions by their nose ends (n0, n1) and back ends (b0, b1), as [x, z].
// Each jaw runs from a nose end back to the pocket hole.
const CUSHIONS = [];
for (const sz of [1, -1]) {
  for (const sx of [1, -1]) {
    CUSHIONS.push({
      n0: [sx * SIDE_JAW, sz * HZ],
      n1: [sx * (HX - JAW), sz * HZ],
      b0: [sx * SIDE_BACK, sz * BZ],
      b1: [sx * (HX - JAW + CW), sz * BZ],
    });
  }
}
for (const sx of [1, -1]) {
  CUSHIONS.push({
    n0: [sx * HX, -(HZ - JAW)],
    n1: [sx * HX, HZ - JAW],
    b0: [sx * BX, -(HZ - JAW + CW)],
    b1: [sx * BX, HZ - JAW + CW],
  });
}

// The cushion noses and jaws as segments for the simulation:
// start x, z, direction x, z, 1 / length².
const SEGS = new Float64Array(CUSHIONS.length * 15);
CUSHIONS.forEach((c, i) => {
  [[c.n0, c.n1], [c.n0, c.b0], [c.n1, c.b1]].forEach(([a, b], j) => {
    const ex = b[0] - a[0];
    const ez = b[1] - a[1];
    SEGS.set([a[0], a[1], ex, ez, 1 / (ex * ex + ez * ez)], (i * 3 + j) * 5);
  });
});

// Racked balls sit a hair apart so nothing starts out overlapping.
const RR = R + 0.00015;
const RACK_ROWS = [[1], [11, 6], [15, 8, 3], [4, 14, 9, 7], [2, 10, 5, 13, 12]];
const RACK = new Float64Array(32); // x, z of each ball's place, by number
RACK[0] = -SPOT;
RACK_ROWS.forEach((row, i) =>
  row.forEach((n, j) => {
    RACK[n * 2] = SPOT + i * Math.sqrt(3) * RR;
    RACK[n * 2 + 1] = (j - (row.length - 1) / 2) * 2 * RR;
  })
);
const TRI_X = SPOT + (8 / Math.sqrt(3)) * RR; // centre of the racked triangle
const TRI_IN = (8 + 2 * Math.sqrt(3)) * RR / Math.sqrt(3) + 0.002; // inner corner radius, 1 mm play

// ---------------------------------------------------------------- physics
const STEP = 1 / 1000;
const E_BALL = 0.95;
const E_CUSHION = 0.75;
const GRIP = 0.94; // share of the speed along a cushion kept by a hit
const ROLL = 0.22; // rolling resistance, m/s²
const DRAG = 0.3; // speed-proportional loss, 1/s
const STOP = 0.008;
const FOLLOW = 0.25; // a rolling cue ball keeps going after a hit
const BREAK_SPEED = 7;
const DROP_TIME = 0.4;
const GLIDE_TIME = 0.85;
const SHADOW = 0.078;

const ON = 0; // rolling or resting on the cloth
const DROP = 1; // falling into a pocket
const GONE = 2; // pocketed
const GLIDE = 3; // carried back to the rack

// Cue stroke timing, in seconds.
const T_IN = 0.45;
const T_STROKE = 0.75;
const T_PULL = 0.5;
const T_PAUSE = 0.12;
const T_FOLLOW = 0.16;
const T_HOLD = 0.3;
const T_OUT = 0.45;

export async function createPool(ctx) {
  const { M, T, tier, reduced } = ctx;
  const X = makeMaterials(T, tier);
  const cueGeo = cueGeometry();
  const group = new THREE.Group();

  // Everything that never moves, baked into one mesh per material.
  const still = new THREE.Group();
  const table = buildTable(M, X);
  table.position.set(CX, 0, CZ);
  const lamp = buildLamp(M, X);
  lamp.position.set(CX, 0, CZ);
  still.add(table, lamp, buildWall(M, X, cueGeo));
  const baked = bake(still);
  group.add(baked);
  const cloth = baked.children.find((m) => m.material === X.cloth);

  // Balls, each with a soft shadow on the cloth.
  const ballGeo = new THREE.SphereGeometry(R, tier === 2 ? 40 : 28, tier === 2 ? 28 : 20);
  const r = rng(5);
  const balls = [];
  for (let n = 0; n < 16; n++) {
    const b = new THREE.Mesh(
      ballGeo,
      new THREE.MeshPhysicalMaterial({ map: ballTexture(n, tier === 2 ? 256 : 128), roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.03 })
    );
    b.quaternion.setFromEuler(new THREE.Euler(r() * TAU, r() * TAU, r() * TAU));
    group.add(b);
    balls.push(b);
  }
  const blobs = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: blobTexture(), transparent: true, opacity: 0.85, depthWrite: false }),
    16
  );
  blobs.frustumCulled = false;
  group.add(blobs);

  const cue = new THREE.Mesh(cueGeo, X.cues[0]);
  cue.visible = false;
  group.add(cue);

  // The triangle hangs on a peg by the cue rack between racks.
  const triangle = bake(buildTriangle(M, X));
  // The inside of its apex rests on the peg (centre y 1.74, radius 7 mm).
  const TRI_HOME = new THREE.Vector3(12.9, 1.754 - TRI_IN, -2.168);
  const TRI_HANG = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, -Math.PI / 2, 'ZYX'));
  const TRI_FLAT = new THREE.Quaternion();
  const TRI_SPOT = new THREE.Vector3(CX + TRI_X, CLOTH + 0.0005, CZ);
  const TRI_ABOVE = TRI_SPOT.clone().setY(CLOTH + 0.3);
  triangle.position.copy(TRI_HOME);
  triangle.quaternion.copy(TRI_HANG);
  group.add(triangle);

  // Neon over the rack, with a soft pink wash on the wall behind it.
  const sign = neonPlane(await signCanvas(), 1.0, 0.39);
  sign.position.set(12.6, 2.64, -2.165);
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 1.0),
    new THREE.MeshBasicMaterial({ map: T.dot, color: 0x000000, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
  );
  halo.position.set(12.6, 2.6, -2.195);
  group.add(sign, halo);

  // One spot from high over the lamp lights the table on desktops; phones
  // get a glow in the cloth instead.
  let spot = null;
  if (tier === 2) {
    spot = new THREE.SpotLight(0xffe2bd, 0, 0, 0.68, 0.55, 1.6);
    spot.position.set(CX, 3.0, CZ);
    spot.target.position.set(CX, CLOTH, CZ);
    group.add(spot, spot.target);
  }

  // ------------------------------------------------------------ state
  const px = new Float64Array(16);
  const pz = new Float64Array(16);
  const py = new Float64Array(16).fill(BALL_Y);
  const vx = new Float64Array(16);
  const vz = new Float64Array(16);
  const st = new Uint8Array(16);
  const lastX = new Float64Array(16);
  const lastZ = new Float64Array(16);
  // Drops into a pocket and glides back to the rack.
  const pocketOf = new Uint8Array(16);
  const animT = new Float64Array(16);
  const fromX = new Float64Array(16);
  const fromZ = new Float64Array(16);
  const fromY = new Float64Array(16);
  const toX = new Float64Array(16);
  const toZ = new Float64Array(16);
  for (let i = 0; i < 16; i++) {
    px[i] = lastX[i] = RACK[i * 2];
    pz[i] = lastZ[i] = RACK[i * 2 + 1];
  }
  let acc = 0;
  let rolling = false;
  let gliding = false;
  let rackGlide = false;
  let racked = true;
  let pendingBreak = false;
  const shot = { on: false, t: 0, x: 0, z: 0, dx: 1, dz: 0, speed: 0, pull: 0.2, practice: 0, hit: false };
  const tri = { on: false, t: 0, from: new THREE.Vector3(), fromQ: new THREE.Quaternion() };
  const aimDir = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const axis = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const mtx = new THREE.Matrix4();

  // ------------------------------------------------------------ simulation
  function step() {
    for (let i = 0; i < 16; i++) {
      if (st[i] !== ON) continue;
      const s = Math.hypot(vx[i], vz[i]);
      if (s === 0) continue;
      const ns = s - (ROLL + DRAG * s) * STEP;
      if (ns < STOP) {
        vx[i] = vz[i] = 0;
        continue;
      }
      vx[i] *= ns / s;
      vz[i] *= ns / s;
      px[i] += vx[i] * STEP;
      pz[i] += vz[i] * STEP;
    }
    for (let i = 0; i < 15; i++) {
      if (st[i] !== ON) continue;
      for (let j = i + 1; j < 16; j++) if (st[j] === ON) collide(i, j);
    }
    for (let i = 0; i < 16; i++) {
      if (st[i] !== ON) continue;
      cushions(i);
      pockets(i);
    }
  }

  function collide(i, j) {
    const dx = px[j] - px[i];
    const dz = pz[j] - pz[i];
    const d2 = dx * dx + dz * dz;
    if (d2 >= 4 * R * R) return;
    const d = Math.sqrt(d2);
    const nx = d > 1e-9 ? dx / d : 1;
    const nz = d > 1e-9 ? dz / d : 0;
    const push = R - d / 2;
    px[i] -= nx * push;
    pz[i] -= nz * push;
    px[j] += nx * push;
    pz[j] += nz * push;
    const vn = (vx[i] - vx[j]) * nx + (vz[i] - vz[j]) * nz;
    if (vn <= 0) return;
    const k = (vn * (1 + E_BALL)) / 2;
    vx[i] -= k * nx;
    vz[i] -= k * nz;
    vx[j] += k * nx;
    vz[j] += k * nz;
    // The cue ball (always i) rolls on after a soft hit instead of stopping dead.
    if (i === 0 && vn < 3.5) {
      vx[0] += k * nx * FOLLOW;
      vz[0] += k * nz * FOLLOW;
    }
  }

  function cushions(i) {
    if (Math.abs(px[i]) < HX - R - 0.002 && Math.abs(pz[i]) < HZ - R - 0.002) return;
    for (let s = 0; s < SEGS.length; s += 5) {
      const ex = SEGS[s + 2];
      const ez = SEGS[s + 3];
      const t = clamp(((px[i] - SEGS[s]) * ex + (pz[i] - SEGS[s + 1]) * ez) * SEGS[s + 4], 0, 1);
      let nx = px[i] - SEGS[s] - ex * t;
      let nz = pz[i] - SEGS[s + 1] - ez * t;
      const d2 = nx * nx + nz * nz;
      if (d2 >= R * R || d2 < 1e-18) continue;
      const d = Math.sqrt(d2);
      nx /= d;
      nz /= d;
      px[i] += nx * (R - d);
      pz[i] += nz * (R - d);
      const vn = vx[i] * nx + vz[i] * nz;
      if (vn >= 0) continue;
      const tx = vx[i] - vn * nx;
      const tz = vz[i] - vn * nz;
      vx[i] = tx * GRIP - vn * E_CUSHION * nx;
      vz[i] = tz * GRIP - vn * E_CUSHION * nz;
    }
  }

  function pockets(i) {
    let near = 0;
    let nearD = Infinity;
    for (let p = 0; p < 6; p++) {
      const dx = px[i] - PX[p];
      const dz = pz[i] - PZ[p];
      const d2 = dx * dx + dz * dz;
      if (d2 < PR2[p]) return capture(i, p);
      if (d2 < nearD) {
        nearD = d2;
        near = p;
      }
    }
    // Past the cushion noses a ball can only be in a pocket mouth.
    if (Math.abs(px[i]) > HX + 0.004 || Math.abs(pz[i]) > HZ + 0.004) capture(i, near);
  }

  function capture(i, p) {
    st[i] = DROP;
    pocketOf[i] = p;
    animT[i] = 0;
    fromX[i] = px[i];
    fromZ[i] = pz[i];
    vx[i] = vz[i] = 0;
  }

  function simulate(dt) {
    if (!rolling) return;
    acc = Math.min(acc + dt, 0.08);
    while (acc >= STEP) {
      step();
      acc -= STEP;
    }
    rolling = false;
    for (let i = 0; i < 16; i++) if (st[i] === ON && (vx[i] !== 0 || vz[i] !== 0)) rolling = true;
    if (!rolling) acc = 0;
  }

  // A pocketed ball slides to the middle of the hole as it falls.
  function stepDrops(dt) {
    for (let i = 0; i < 16; i++) {
      if (st[i] !== DROP) continue;
      animT[i] += dt;
      const k = Math.min(1, animT[i] / DROP_TIME);
      const m = ease(Math.min(1, k * 1.8)) * 0.9;
      px[i] = lerp(fromX[i], PX[pocketOf[i]], m);
      pz[i] = lerp(fromZ[i], PZ[pocketOf[i]], m);
      py[i] = BALL_Y - k * k * 0.12;
      if (k >= 1) st[i] = GONE;
    }
  }

  // Carry a ball to (x, z) in a low hop; pocketed balls rise out of their pocket.
  function glide(i, x, z, delay) {
    if (st[i] === GONE) {
      px[i] = lastX[i] = PX[pocketOf[i]];
      pz[i] = lastZ[i] = PZ[pocketOf[i]];
      py[i] = BALL_Y - 0.12;
    }
    st[i] = GLIDE;
    vx[i] = vz[i] = 0;
    fromX[i] = px[i];
    fromZ[i] = pz[i];
    fromY[i] = py[i];
    toX[i] = x;
    toZ[i] = z;
    animT[i] = -delay;
    gliding = true;
  }

  function stepGlides(dt) {
    if (!gliding) return;
    gliding = false;
    for (let i = 0; i < 16; i++) {
      if (st[i] !== GLIDE) continue;
      animT[i] += dt;
      const k = clamp(animT[i] / GLIDE_TIME, 0, 1);
      const e = ease(k);
      px[i] = lerp(fromX[i], toX[i], e);
      pz[i] = lerp(fromZ[i], toZ[i], e);
      py[i] = lerp(fromY[i], BALL_Y, ease(Math.min(1, k * 5))) + Math.sin(Math.PI * k) * 0.06;
      if (k < 1) gliding = true;
      else {
        st[i] = ON;
        py[i] = BALL_Y;
      }
    }
    if (!gliding && rackGlide) {
      rackGlide = false;
      racked = true;
    }
  }

  // After a scratch the cue ball comes back to the head spot, or the
  // nearest free place on the head string.
  function respot() {
    let z = 0;
    for (let k = 1; k < 18 && !free(-SPOT, z); k++) z = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (2 * R + 0.004);
    glide(0, -SPOT, z, 0);
  }

  function free(x, z) {
    for (let i = 1; i < 16; i++) if (st[i] === ON && (px[i] - x) ** 2 + (pz[i] - z) ** 2 < (2 * R + 0.002) ** 2) return false;
    return true;
  }

  // ------------------------------------------------------------ cue
  function aim(dx, dz, speed, practice) {
    shot.on = true;
    shot.t = 0;
    shot.hit = false;
    shot.x = px[0];
    shot.z = pz[0];
    shot.dx = dx;
    shot.dz = dz;
    shot.speed = speed;
    shot.practice = practice;
    shot.pull = 0.08 + speed * 0.025;
    // Raise the butt enough to clear the rail behind the cue ball.
    const room = Math.min(
      dx < 0 ? (HX - px[0]) / -dx : dx > 0 ? (px[0] + HX) / dx : Infinity,
      dz < 0 ? (HZ - pz[0]) / -dz : dz > 0 ? (pz[0] + HZ) / dz : Infinity
    );
    const elev = clamp(Math.atan2(0.035, Math.max(room - R, 0.01)), 0.09, 0.85);
    aimDir.set(dx * Math.cos(elev), -Math.sin(elev), dz * Math.cos(elev));
    cue.quaternion.setFromUnitVectors(UP, aimDir);
    racked = false;
  }

  // Slide in, a few practice strokes, draw back, strike, follow through, away.
  function stepCue(dt) {
    if (!shot.on) return;
    let t = (shot.t += dt);
    const strokes = shot.practice * T_STROKE;
    const strike = shot.speed > 6 ? 0.07 : 0.1;
    let gap;
    if (t < T_IN) gap = lerp(0.65, 0.1, ease(t / T_IN));
    else if ((t -= T_IN) < strokes) gap = 0.1 + 0.06 * Math.sin((TAU * t) / T_STROKE);
    else if ((t -= strokes) < T_PULL) gap = lerp(0.1, shot.pull, ease(t / T_PULL));
    else if ((t -= T_PULL) < T_PAUSE) gap = shot.pull;
    else if ((t -= T_PAUSE) < strike) gap = shot.pull * (1 - (t / strike) ** 2);
    else {
      if (!shot.hit) launch();
      t -= strike;
      if (t < T_FOLLOW) gap = -0.07 * ease(t / T_FOLLOW);
      else if ((t -= T_FOLLOW) < T_HOLD) gap = -0.07;
      else if ((t -= T_HOLD) < T_OUT) gap = lerp(-0.07, 0.7, ease(t / T_OUT));
      else {
        shot.on = false;
        cue.visible = false;
        return;
      }
    }
    // The tip sits `gap` behind the ball, on the line through its centre.
    const back = R + gap + CUE_LEN;
    cue.position.set(CX + shot.x - aimDir.x * back, BALL_Y - aimDir.y * back, CZ + shot.z - aimDir.z * back);
    cue.visible = true;
  }

  function launch() {
    shot.hit = true;
    if (st[0] !== ON) return;
    vx[0] = shot.dx * shot.speed;
    vz[0] = shot.dz * shot.speed;
    rolling = true;
  }

  // ------------------------------------------------------------ triangle
  function stepTriangle(dt) {
    if (!tri.on) return;
    const t = (tri.t += dt);
    const P = triangle.position;
    const Q = triangle.quaternion;
    if (t < 0.55) {
      const k = ease(t / 0.55);
      P.lerpVectors(tri.from, TRI_ABOVE, k).y += Math.sin(Math.PI * k) * 0.25;
      Q.slerpQuaternions(tri.fromQ, TRI_FLAT, k);
    } else if (t < 1.05) {
      P.lerpVectors(TRI_ABOVE, TRI_SPOT, ease((t - 0.55) / 0.5));
      Q.copy(TRI_FLAT);
    } else if (t < 1.3) {
      // A little push to tighten the rack.
      P.copy(TRI_SPOT).x += Math.sin((Math.PI * (t - 1.05)) / 0.25) * 0.004;
    } else if (t < 1.6) {
      P.lerpVectors(TRI_SPOT, TRI_ABOVE, ease((t - 1.3) / 0.3));
    } else if (t < 2.3) {
      const k = ease((t - 1.6) / 0.7);
      P.lerpVectors(TRI_ABOVE, TRI_HOME, k).y += Math.sin(Math.PI * k) * 0.25;
      Q.slerpQuaternions(TRI_FLAT, TRI_HANG, k);
    } else {
      P.copy(TRI_HOME);
      Q.copy(TRI_HANG);
      tri.on = false;
    }
    if (pendingBreak && t > 1.45 && !gliding) {
      pendingBreak = false;
      startBreak();
    }
  }

  // ------------------------------------------------------------ frame
  function syncBalls() {
    for (let i = 0; i < 16; i++) {
      // Never let a bad number reach the meshes.
      if (!Number.isFinite(px[i] + pz[i] + py[i] + vx[i] + vz[i])) {
        px[i] = lastX[i];
        pz[i] = lastZ[i];
        py[i] = BALL_Y;
        vx[i] = vz[i] = 0;
      }
      const b = balls[i];
      const gone = st[i] === GONE;
      b.visible = !gone;
      // Roll the ball by the distance it moved: axis across the motion.
      const dx = px[i] - lastX[i];
      const dz = pz[i] - lastZ[i];
      const d = Math.hypot(dx, dz);
      if (d > 1e-7) {
        axis.set(dz / d, 0, -dx / d);
        b.quaternion.premultiply(turn.setFromAxisAngle(axis, d / R)).normalize();
        lastX[i] = px[i];
        lastZ[i] = pz[i];
      }
      b.position.set(CX + px[i], py[i], CZ + pz[i]);
      // The shadow fades as the ball leaves the cloth and leans away from the lamp.
      const s = gone ? 0 : SHADOW * clamp(1 - Math.abs(py[i] - BALL_Y) * 14, 0, 1);
      mtx.makeScale(s, 1, s).setPosition(CX + px[i] * 1.013, CLOTH + 0.0006, CZ + pz[i] * 1.013);
      blobs.setMatrixAt(i, mtx);
    }
    blobs.instanceMatrix.needsUpdate = true;
  }

  function light(env) {
    const lit = env.power * (1 - 0.3 * env.afterHours);
    X.shadeGlow.color.setScalar(1.7 * lit);
    X.bulb.color.setRGB(9, 5.6, 2.8).multiplyScalar(lit);
    X.cone.uniforms.uIntensity.value = 0.05 * lit;
    X.wash.color.setScalar(0.55 * lit);
    X.cloth.emissiveIntensity = (spot ? 0.03 : 0.22) * lit;
    if (spot) spot.intensity = 9 * lit;
    const n = neonLevel(env.since === null ? null : env.since - 2.1, env.power, env.reduced) * env.glow;
    sign.material.color.setScalar(2.4 * n);
    halo.material.color.copy(NEON.pink).multiplyScalar(0.2 * n);
  }

  function update(dt, time, env) {
    dt = Math.min(dt, 0.1);
    stepCue(dt);
    stepTriangle(dt);
    stepGlides(dt);
    simulate(dt);
    stepDrops(dt);
    if (st[0] === GONE && !moving()) respot();
    syncBalls();
    light(env);
  }

  // ------------------------------------------------------------ api
  function moving() {
    if (rolling || gliding || shot.on || (tri.on && tri.t < 1.45)) return true;
    for (let i = 0; i < 16; i++) if (st[i] === DROP) return true;
    return false;
  }

  function rack() {
    shot.on = false;
    cue.visible = false;
    pendingBreak = false;
    rolling = false;
    for (let i = 0; i < 16; i++) glide(i, RACK[i * 2], RACK[i * 2 + 1], i * 0.01);
    rackGlide = true;
    racked = false;
    tri.on = true;
    tri.t = 0;
    tri.from.copy(triangle.position);
    tri.fromQ.copy(triangle.quaternion);
  }

  // Aim a hair off the apex ball so the rack opens unevenly, like a real one.
  function startBreak() {
    const dx = RACK[2] - px[0];
    const dz = RACK[3] + 0.0035 - pz[0];
    const d = Math.hypot(dx, dz);
    aim(dx / d, dz / d, BREAK_SPEED, reduced ? 0 : 2);
    shot.pull = 0.26;
  }

  function breakShot() {
    if (shot.on) return;
    if (racked && !moving()) startBreak();
    else {
      rack();
      pendingBreak = true;
    }
  }

  // Shoot the cue ball toward a world point; harder the further it is.
  function shootAt(point) {
    if (!point || moving() || st[0] !== ON) return false;
    const dx = clamp(point.x - CX, -HX, HX) - px[0];
    const dz = clamp(point.z - CZ, -HZ, HZ) - pz[0];
    const d = Math.hypot(dx, dz);
    if (!(d > 0.01)) return false;
    aim(dx / d, dz / d, clamp(0.8 + d * 2.4, 1, 5.2), 0);
    return true;
  }

  syncBalls();
  const api = { group, update, breakShot, rack, shootAt, moving, pickables: [cloth] };
  window.__pool = api;
  return api;
}

// ======================================================================
// Materials and textures
// ======================================================================

function makeMaterials(T, tier) {
  return {
    cloth: new THREE.MeshPhysicalMaterial({
      color: CLOTH_COLOR,
      map: feltTexture(),
      roughness: 0.9,
      sheen: 1,
      sheenRoughness: 0.5,
      sheenColor: new THREE.Color(CLOTH_COLOR).offsetHSL(0, 0, 0.18),
      emissive: CLOTH_COLOR,
      emissiveIntensity: 0,
    }),
    wood: new THREE.MeshPhysicalMaterial({ map: walnutTexture(tier), roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.14 }),
    pocket: new THREE.MeshStandardMaterial({ color: 0x1c0d0a, roughness: 0.7, bumpMap: T.leather, bumpScale: 0.4, side: THREE.DoubleSide }),
    enamel: new THREE.MeshPhysicalMaterial({ color: 0x0d2624, roughness: 0.32, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.06 }),
    shadeGlow: new THREE.MeshBasicMaterial({ map: shadeTexture(), color: 0x000000, side: THREE.BackSide }),
    bulb: new THREE.MeshBasicMaterial({ color: 0x000000 }),
    chalk: new THREE.MeshStandardMaterial({ color: 0x2b62c2, roughness: 1 }),
    wash: new THREE.MeshBasicMaterial({ map: washTexture(), color: 0x000000, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    cone: coneMaterial(),
    cues: CUE_STYLES.map(
      (s) => new THREE.MeshPhysicalMaterial({ map: cueTexture(s), roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.12 })
    ),
  };
}

// Fine felt with a faint nap along the table, tiled every 25 cm.
function feltTexture() {
  const r = rng(21);
  const [c, g] = makeCanvas(256);
  const img = g.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 214 + (r() - 0.5) * 46;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 320; i++) {
    g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},${0.03 + r() * 0.05})`;
    g.fillRect(r() * 256, r() * 256, 8 + r() * 40, 1);
  }
  return toTexture(c, { repeat: [4, 4], aniso: 8 });
}

// Figured walnut; the grain runs along the texture's v.
function walnutTexture(tier) {
  const r = rng(43);
  const [c, g] = makeCanvas(512);
  g.fillStyle = '#3d2416';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `rgba(${r() > 0.5 ? '104,62,34' : '20,11,6'},${0.08 + r() * 0.16})`;
    g.fillRect(r() * 512, 0, 6 + r() * 40, 512);
  }
  for (let i = 0; i < 520; i++) {
    const x = r() * 512;
    g.strokeStyle = `rgba(${r() > 0.55 ? '128,82,46' : '12,7,4'},${0.12 + r() * 0.3})`;
    g.lineWidth = 0.6 + r() * 1.4;
    g.beginPath();
    g.moveTo(x, 0);
    g.bezierCurveTo(x + r() * 12 - 6, 170, x + r() * 12 - 6, 340, x, 512);
    g.stroke();
  }
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(10,5,3,${r() * 0.35})`;
    g.fillRect(r() * 512, r() * 512, 1, 2 + r() * 5);
  }
  return toTexture(c, { aniso: tier === 2 ? 8 : 4 });
}

// Inside of a lamp shade: brightest up by the bulb.
function shadeTexture() {
  const [c, g] = makeCanvas(4, 64);
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, '#fff4de');
  grad.addColorStop(0.45, '#eccb98');
  grad.addColorStop(1, '#6a5440');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// The picture light's pool of light on the cue board, brightest at the top.
function washTexture() {
  const [c, g] = makeCanvas(128, 128);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 128);
  const grad = g.createRadialGradient(64, -20, 0, 64, -20, 150);
  grad.addColorStop(0, 'rgba(255,214,160,1)');
  grad.addColorStop(0.45, 'rgba(255,190,130,0.45)');
  grad.addColorStop(1, 'rgba(255,170,110,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Soft round contact shadow (alpha in the green channel).
function blobTexture() {
  const [c, g] = makeCanvas(64);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// The table's shadow on the floor: lit from above, it falls about 1.4x
// wider than the table, darkest under the top and the legs.
function floorShadowTexture() {
  const [c, g] = makeCanvas(256, 168);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 168);
  const rect = (w, h, r, fill, blur) => {
    g.filter = `blur(${blur}px)`;
    g.fillStyle = fill;
    g.beginPath();
    if (g.roundRect) g.roundRect(128 - w / 2, 84 - h / 2, w, h, r);
    else g.rect(128 - w / 2, 84 - h / 2, w, h);
    g.fill();
  };
  rect(206, 116, 22, '#9c9c9c', 12);
  rect(150, 84, 10, '#f4f4f4', 8);
  g.filter = 'blur(4px)';
  g.fillStyle = '#fff';
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.beginPath();
      g.arc(128 + sx * 68, 84 + sz * 36, 7, 0, TAU);
      g.fill();
    }
  }
  g.filter = 'none';
  return new THREE.CanvasTexture(c);
}

// Faint light cones under the shades, brightest near the lamp.
function coneMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(1.0, 0.84, 0.62) }, uIntensity: { value: 0 } },
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
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.0);
        float fall = smoothstep(0.0, 0.6, vY) * mix(0.3, 1.0, vY);
        gl_FragColor = vec4(uColor * edge * fall * uIntensity, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

// Pool ball colours by number (9–15 are stripes of 1–7).
const BALL_COLORS = ['#f4efe2', '#f2b70d', '#1b3c9c', '#c8171e', '#4a2280', '#ef600e', '#0c6a37', '#74141b', '#0c0c0e'];

// Equirectangular ball skin: the number circles sit on the equator, where
// the 2:1 canvas keeps them round.
function ballTexture(n, size) {
  const W = size * 2;
  const H = size;
  const [c, g] = makeCanvas(W, H);
  const col = BALL_COLORS[n > 8 ? n - 8 : n];
  g.fillStyle = n > 8 ? BALL_COLORS[0] : col;
  g.fillRect(0, 0, W, H);
  if (n > 8) {
    g.fillStyle = col;
    g.fillRect(0, H * 0.31, W, H * 0.38);
  }
  if (n > 0) {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `700 ${Math.round(H * 0.15)}px Arial, Helvetica, sans-serif`;
    for (const u of [0.25, 0.75]) {
      const x = u * W;
      g.fillStyle = '#f7f3ea';
      g.beginPath();
      g.arc(x, H / 2, H * 0.125, 0, TAU);
      g.fill();
      g.fillStyle = '#111';
      g.fillText(String(n), x, H * 0.508);
      // 6 and 9 are underlined so they read the right way up.
      if (n === 6 || n === 9) g.fillRect(x - H * 0.035, H * 0.575, H * 0.07, H * 0.012);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Three cue designs: ebony and maple with brass, oxblood with maple
// points, and a plain walnut house cue.
const CUE_STYLES = [
  { sleeve: '#15100d', forearm: '#d4b585', point: '#15100d', veneers: ['#c9a24a', '#efe6d4'], wrap: '#1b1b1d', ring: '#c9a24a' },
  { sleeve: '#4a0e12', forearm: '#17110e', point: '#d8bd8a', veneers: ['#efe6d4', '#4a0e12'], wrap: '#29211c', ring: '#efe6d4' },
  { sleeve: '#3b2315', forearm: '#5b3a22', point: null, veneers: [], wrap: '#3b2315', ring: '#c9a24a' },
];

// The cue skin runs butt (bottom) to tip (top); u goes round the cue.
function cueTexture(style) {
  const W = 128;
  const H = 2048;
  const [c, g] = makeCanvas(W, H);
  const y = (s) => H * (1 - s / CUE_LEN);
  const band = (s0, s1, fill) => {
    g.fillStyle = fill;
    g.fillRect(0, y(s1), W, y(s0) - y(s1));
  };
  const r = rng(13);
  band(0.75, CUE_LEN, '#ead7b0');
  for (let i = 0; i < 30; i++) {
    g.fillStyle = `rgba(150,110,60,${0.05 + r() * 0.08})`;
    g.fillRect(r() * W, 0, 1, y(0.75));
  }
  band(0, 0.012, '#0c0c0c');
  band(0.012, 0.03, style.ring);
  band(0.03, 0.25, style.sleeve);
  band(0.25, 0.262, style.ring);
  band(0.262, 0.52, style.wrap);
  for (let s = 0.262; s < 0.52; s += 0.0025) {
    g.fillStyle = `rgba(255,255,255,${0.03 + r() * 0.05})`;
    g.fillRect(0, y(s), W, 1);
  }
  band(0.52, 0.532, style.ring);
  band(0.532, 0.735, style.forearm);
  for (let k = 0; k < 4; k++) {
    const x = ((k + 0.5) / 4) * W;
    // Inlaid diamonds on the sleeve, and points with veneers on the forearm.
    g.fillStyle = style.ring;
    g.beginPath();
    g.moveTo(x, y(0.15));
    g.lineTo(x + 5, y(0.14));
    g.lineTo(x, y(0.13));
    g.lineTo(x - 5, y(0.14));
    g.fill();
    if (!style.point) continue;
    [...style.veneers, style.point].forEach((fill, j) => {
      const w = (W / 8) * (1 - j * 0.14);
      g.fillStyle = fill;
      g.beginPath();
      g.moveTo(x - w, y(0.532));
      g.lineTo(x, y(0.718 - j * 0.007));
      g.lineTo(x + w, y(0.532));
      g.fill();
    });
  }
  band(0.735, 0.752, '#efe6d4');
  band(0.742, 0.745, style.ring);
  band(1.455, 1.465, '#f3efe6');
  band(1.465, CUE_LEN, '#36589a');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// "RACK 'EM" beside a neon 8-ball.
async function signCanvas() {
  const fonts = document.fonts.load('800 150px "Big Shoulders Display"');
  await Promise.race([fonts, new Promise((r) => setTimeout(r, 1500))]).catch(() => {});
  const PINK = '255, 70, 140';
  const CYAN = '70, 225, 255';
  const [c, g] = makeCanvas(1024, 400);
  const ring = (rad, width) => (style) => {
    g.strokeStyle = style;
    g.lineWidth = width;
    g.beginPath();
    g.arc(196, 200, rad, 0, TAU);
    g.stroke();
  };
  const text = (str, x, y, alpha) => (style, core) => {
    g.fillStyle = style;
    if (core) {
      g.save();
      g.globalAlpha = alpha;
    }
    g.fillText(str, x, y);
    if (core) g.restore();
  };
  neonGlow(g, CYAN, ring(136, 9));
  neonGlow(g, '255, 236, 214', ring(62, 7), 0.6);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '800 100px "Big Shoulders Display", "Arial Narrow", sans-serif';
  neonGlow(g, PINK, text('8', 196, 206, 0.55), 0.7);
  g.font = '800 156px "Big Shoulders Display", "Arial Narrow", sans-serif';
  if ('letterSpacing' in g) g.letterSpacing = '10px';
  neonGlow(g, PINK, text("RACK 'EM", 676, 168, 0.5));
  g.font = '600 44px "Big Shoulders Display", "Arial Narrow", sans-serif';
  if ('letterSpacing' in g) g.letterSpacing = '18px';
  neonGlow(g, CYAN, text('POOL · LOUNGE', 680, 302, 0.6), 0.5);
  return c;
}

// ======================================================================
// Geometry helpers
// ======================================================================

// Extrudes a plan shape (x, z) into a horizontal slab from top - height up
// to top, with rounded edges that stay inside the outline.
function slab(shape, top, height, bevel = 0.004) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 3,
    curveSegments: 24,
  });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, top - bevel, 0);
  return geo;
}

function roundRect(path, hx, hz, r) {
  path.moveTo(-hx + r, -hz);
  path.lineTo(hx - r, -hz);
  path.quadraticCurveTo(hx, -hz, hx, -hz + r);
  path.lineTo(hx, hz - r);
  path.quadraticCurveTo(hx, hz, hx - r, hz);
  path.lineTo(-hx + r, hz);
  path.quadraticCurveTo(-hx, hz, -hx, hz - r);
  path.lineTo(-hx, -hz + r);
  path.quadraticCurveTo(-hx, -hz, -hx + r, -hz);
  return path;
}

// A rounded rectangle frame `width` wide.
function frame(hx, hz, r, width) {
  const s = roundRect(new THREE.Shape(), hx, hz, r);
  s.holes.push(roundRect(new THREE.Path(), hx - width, hz - width, Math.max(r - width, 0.005)));
  return s;
}

// Where a pocket hole crosses the cushion back line, as [arrival,
// departure] while the outline walks round the table.
function cuts(p) {
  const sz = Math.sign(p.z);
  const az = Math.abs(p.z);
  if (p.x === 0) {
    const h = Math.sqrt(p.r ** 2 - (BZ - az) ** 2);
    return [[sz * h, sz * BZ], [-sz * h, sz * BZ]];
  }
  const sx = Math.sign(p.x);
  const ax = Math.abs(p.x);
  const onX = [sx * BX, sz * (az - Math.sqrt(p.r ** 2 - (BX - ax) ** 2))];
  const onZ = [sx * (ax - Math.sqrt(p.r ** 2 - (BZ - az) ** 2)), sz * BZ];
  return sx * sz > 0 ? [onX, onZ] : [onZ, onX];
}

const angleTo = (p, q) => Math.atan2(q[1] - p.z, q[0] - p.x);

// The cushion back line round the table with the pockets: the bed has the
// holes cut into it (`notch`), the rails' opening goes round them.
function outline(path, notch) {
  POCKETS.forEach((p, i) => {
    const [a, b] = cuts(p);
    if (i === 0) path.moveTo(a[0], a[1]);
    else path.lineTo(a[0], a[1]);
    path.absarc(p.x, p.z, p.r, angleTo(p, a), angleTo(p, b), notch);
  });
  path.closePath();
  return path;
}

// Rails run along x on the long sides and along z on the ends, mitred at
// 45° in the corners.
const mitre = (x, z) => (Math.abs(x) - Math.abs(z) > HX - HZ ? 2 : 0);

// Box-maps UVs (metres) so the wood grain, the texture's v, runs along
// `axis` (0 x, 1 y, 2 z), or along `axis(x, z)` picked per triangle.
function grain(geo, axis) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position.array;
  const uv = new Float32Array((p.length / 3) * 2);
  for (let i = 0; i < p.length; i += 9) {
    const ax = p[i + 3] - p[i];
    const ay = p[i + 4] - p[i + 1];
    const az = p[i + 5] - p[i + 2];
    const bx = p[i + 6] - p[i];
    const by = p[i + 7] - p[i + 1];
    const bz = p[i + 8] - p[i + 2];
    const n = [Math.abs(ay * bz - az * by), Math.abs(az * bx - ax * bz), Math.abs(ax * by - ay * bx)];
    const dom = n[0] > n[1] && n[0] > n[2] ? 0 : n[1] > n[2] ? 1 : 2;
    const along = typeof axis === 'function' ? axis((p[i] + p[i + 3] + p[i + 6]) / 3, (p[i + 2] + p[i + 5] + p[i + 8]) / 3) : axis;
    // On end grain the grain axis points at you; use the other two.
    const vA = dom === along ? (dom + 1) % 3 : along;
    const uA = 3 - dom - vA;
    for (let k = 0; k < 3; k++) {
      uv[(i / 3 + k) * 2] = p[i + k * 3 + uA] * 1.2;
      uv[(i / 3 + k) * 2 + 1] = p[i + k * 3 + vA] * 1.2;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

const lathe = (pts, segments) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segments);

// Rubber cushion profile as [depth from the rail, height above the cloth];
// the nose sits at 36 mm, a little above the middle of a ball.
const PROFILE = [
  [0, 0.044], [0.022, 0.0425], [0.038, 0.0398], [0.046, 0.0372], [0.0494, 0.0342], [0.05, 0.0312],
  [0.0488, 0.027], [0.0435, 0.0205], [0.034, 0.0125], [0.022, 0.0045], [0.011, 0], [0, 0],
];

// One cushion: the profile swept along its rail and cut along each jaw.
function cushionGeometry({ n0, n1, b0, b1 }) {
  const along = new THREE.Vector3(n1[0] - n0[0], 0, n1[1] - n0[1]).normalize();
  const inward = new THREE.Vector3(-along.z, 0, along.x);
  if (inward.x * (n0[0] - b0[0]) + inward.z * (n0[1] - b0[1]) < 0) inward.negate();
  const at = (end, [d, h]) => {
    const [n, b] = end ? [n1, b1] : [n0, b0];
    const k = d / CW;
    return new THREE.Vector3(b[0] + (n[0] - b[0]) * k, CLOTH + h, b[1] + (n[1] - b[1]) * k);
  };
  // Outward normal of each profile edge, and smooth normals at its points.
  const edges = PROFILE.slice(0, -1).map(([d0, h0], i) => {
    const [d1, h1] = PROFILE[i + 1];
    const l = Math.hypot(d1 - d0, h1 - h0);
    return new THREE.Vector3().addScaledVector(inward, -(h1 - h0) / l).setY((d1 - d0) / l);
  });
  const smooth = PROFILE.map((_, i) => new THREE.Vector3().add(edges[i - 1] || edges[i]).add(edges[i] || edges[i - 1]).normalize());

  const pos = [];
  const nor = [];
  const uv = [];
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  // A triangle wound so it faces `out`.
  const tri = (verts, normals, out) => {
    ab.subVectors(verts[1], verts[0]);
    ac.subVectors(verts[2], verts[0]);
    const order = ab.cross(ac).dot(out) < 0 ? [0, 2, 1] : [0, 1, 2];
    for (const k of order) {
      const v = verts[k];
      pos.push(v.x, v.y, v.z);
      nor.push(normals[k].x, normals[k].y, normals[k].z);
      uv.push(v.x * along.x + v.z * along.z, v.y + v.x * inward.x + v.z * inward.z);
    }
  };
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const s0 = at(0, PROFILE[i]);
    const s1 = at(0, PROFILE[i + 1]);
    const e0 = at(1, PROFILE[i]);
    const e1 = at(1, PROFILE[i + 1]);
    tri([s0, s1, e1], [smooth[i], smooth[i + 1], smooth[i + 1]], edges[i]);
    tri([s0, e1, e0], [smooth[i], smooth[i + 1], smooth[i]], edges[i]);
  }
  // Flat ends along the jaws.
  const faces = THREE.ShapeUtils.triangulateShape(PROFILE.map(([d, h]) => new THREE.Vector2(d, h)), []);
  for (const end of [0, 1]) {
    const [n, b] = end ? [n1, b1] : [n0, b0];
    const out = new THREE.Vector3(n[1] - b[1], 0, b[0] - n[0]).normalize();
    if (out.dot(along) * (end ? 1 : -1) < 0) out.negate();
    const pts = PROFILE.map((q) => at(end, q));
    for (const f of faces) tri([pts[f[0]], pts[f[1]], pts[f[2]]], [out, out, out], out);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geo;
}

// Brass casting over a rail corner, cut round the pocket.
function cornerCap(p) {
  const sx = Math.sign(p.x);
  const sz = Math.sign(p.z);
  const ax = Math.abs(p.x);
  const az = Math.abs(p.z);
  const ex = OX + 0.003;
  const ez = OZ + 0.003;
  const round = 0.053;
  const arm = 0.14;
  const pts = [[ex - arm, ez]];
  for (let i = 0; i <= 8; i++) {
    const t = (Math.PI / 2) * (1 - i / 8);
    pts.push([ex - round + round * Math.cos(t), ez - round + round * Math.sin(t)]);
  }
  pts.push([ex, ez - arm]);
  const a0 = Math.asin((ez - arm - az) / p.r);
  const a1 = Math.acos((ex - arm - ax) / p.r);
  for (let i = 0; i <= 14; i++) {
    const t = lerp(a0, a1, i / 14);
    pts.push([ax + p.r * Math.cos(t), az + p.r * Math.sin(t)]);
  }
  return new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(sx * x, sz * z)));
}

// Brass plate over a side pocket, rounded where it meets the cushion.
function sideIron(p) {
  const sz = Math.sign(p.z);
  const az = Math.abs(p.z);
  const ez = OZ + 0.003;
  const arm = 0.1;
  const inner = BZ + 0.008;
  const round = 0.024;
  const a0 = Math.asin((inner - az) / p.r);
  const pts = [[-arm, ez], [arm, ez]];
  for (let i = 0; i <= 6; i++) {
    const t = (Math.PI / 2) * (i / 6);
    pts.push([arm - round + round * Math.cos(t), inner + round - round * Math.sin(t)]);
  }
  for (let i = 0; i <= 16; i++) {
    const t = lerp(a0, Math.PI - a0, i / 16);
    pts.push([p.r * Math.cos(t), az + p.r * Math.sin(t)]);
  }
  for (let i = 0; i <= 6; i++) {
    const t = (Math.PI / 2) * (1 - i / 6);
    pts.push([-arm + round - round * Math.cos(t), inner + round - round * Math.sin(t)]);
  }
  return new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, sz * z)));
}

// ======================================================================
// Builders
// ======================================================================

// A turned baluster leg as [radius, height], and its brass cup foot.
const LEG = [
  [0, 0.035], [0.05, 0.035], [0.062, 0.05], [0.07, 0.068], [0.068, 0.085], [0.054, 0.097], [0.05, 0.106],
  [0.056, 0.116], [0.07, 0.135], [0.085, 0.165], [0.093, 0.2], [0.095, 0.235], [0.09, 0.27], [0.078, 0.305],
  [0.062, 0.335], [0.05, 0.36], [0.046, 0.375], [0.05, 0.385], [0.064, 0.392], [0.066, 0.405], [0.054, 0.414],
  [0.05, 0.425], [0.058, 0.44], [0.072, 0.448], [0.074, 0.46], [0, 0.46],
];
const FOOT = [[0, 0], [0.052, 0], [0.06, 0.008], [0.061, 0.02], [0.056, 0.032], [0.05, 0.038], [0, 0.038]];

function buildTable(M, X) {
  const g = new THREE.Group();

  // Slate bed and cushions in cloth.
  g.add(mesh(slab(outline(new THREE.Shape(), true), CLOTH, 0.035, 0.003), X.cloth));
  for (const c of CUSHIONS) g.add(mesh(cushionGeometry(c), X.cloth));

  // Walnut rails in one ring round the cushions.
  const ring = roundRect(new THREE.Shape(), OX, OZ, 0.05);
  ring.holes.push(outline(new THREE.Path(), false));
  g.add(mesh(grain(slab(ring, RAIL_TOP, 0.09, 0.008), mitre), X.wood));

  // Mother-of-pearl diamonds at every eighth of the length.
  const diamond = new THREE.Shape([[0, -0.013], [0.0065, 0], [0, 0.013], [-0.0065, 0]].map(([x, z]) => new THREE.Vector2(x, z)));
  const sight = slab(diamond, RAIL_TOP + 0.0008, 0.002, 0);
  for (const sz of [-1, 1]) for (const k of [-3, -2, -1, 1, 2, 3]) g.add(mesh(sight, M.ivory, k * 0.28, 0, (sz * (BZ + OZ)) / 2));
  for (const sx of [-1, 1]) {
    for (const k of [-1, 0, 1]) {
      const d = mesh(sight, M.ivory, (sx * (BX + OX)) / 2, 0, k * 0.28);
      d.rotation.y = Math.PI / 2;
      g.add(d);
    }
  }

  // Pockets: a leather well under each hole, a leather lip round the rail
  // side above the cloth, and brass over the rail.
  for (const p of POCKETS) {
    const r = p.r - 0.0015;
    const well = [[r, 0], [r - 0.002, -0.02], [r - 0.012, -0.04], [r * 0.72, -0.085], [r * 0.38, -0.118], [0, -0.126]];
    g.add(mesh(lathe(well.map(([x, y]) => [x, CLOTH + 0.0005 + y]), 28), X.pocket, p.x, 0, p.z));
    const [a, b] = cuts(p);
    const from = angleTo(p, a);
    let to = angleTo(p, b);
    while (to <= from) to += TAU;
    const lip = new THREE.CylinderGeometry(r, r, RAIL_TOP - CLOTH - 0.001, 24, 1, true, Math.PI / 2 - to, to - from);
    g.add(mesh(lip, X.pocket, p.x, (RAIL_TOP + CLOTH - 0.003) / 2, p.z));
    const iron = p.x === 0 ? slab(sideIron(p), RAIL_TOP + 0.0025, 0.034, 0.002) : slab(cornerCap(p), RAIL_TOP + 0.0025, 0.094, 0.002);
    g.add(mesh(iron, M.brass));
  }

  // Apron under the rails: brass bead on top, raised panels, moulded base.
  g.add(mesh(grain(slab(frame(OX - 0.03, OZ - 0.03, 0.03, 0.035), 0.75, 0.15, 0.006), mitre), X.wood));
  g.add(mesh(slab(frame(OX - 0.026, OZ - 0.026, 0.034, 0.02), 0.748, 0.009, 0.003), M.brass));
  g.add(mesh(grain(slab(frame(OX - 0.02, OZ - 0.02, 0.04, 0.06), 0.615, 0.035, 0.012), mitre), X.wood));
  const longPanel = grain(new RoundedBoxGeometry(0.86, 0.085, 0.016, 2, 0.006), 0);
  const endPanel = grain(new RoundedBoxGeometry(0.016, 0.085, 1.0, 2, 0.006), 2);
  const boss = new THREE.CylinderGeometry(0.03, 0.03, 0.01, 32).rotateX(Math.PI / 2);
  for (const s of [-1, 1]) {
    g.add(mesh(longPanel, X.wood, -0.62, 0.676, s * (OZ - 0.03)));
    g.add(mesh(longPanel, X.wood, 0.62, 0.676, s * (OZ - 0.03)));
    g.add(mesh(endPanel, X.wood, s * (OX - 0.03), 0.676, 0));
    g.add(mesh(boss, M.brass, 0, 0.676, s * (OZ - 0.026)));
  }

  // Four turned legs on square blocks, brass cup feet.
  const leg = grain(lathe(LEG, 32), 1);
  const foot = lathe(FOOT, 32);
  const collar = new THREE.TorusGeometry(0.066, 0.004, 8, 40).rotateX(Math.PI / 2);
  const block = grain(new RoundedBoxGeometry(0.17, 0.16, 0.17, 2, 0.012), 1);
  const stud = new THREE.SphereGeometry(0.018, 20, 12, 0, TAU, 0, Math.PI / 2);
  const lx = OX - 0.115;
  const lz = OZ - 0.115;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(mesh(leg, X.wood, sx * lx, 0, sz * lz));
      g.add(mesh(foot, M.brass, sx * lx, 0, sz * lz));
      g.add(mesh(collar, M.brass, sx * lx, 0.398, sz * lz));
      g.add(mesh(block, X.wood, sx * lx, 0.53, sz * lz));
      const studX = mesh(stud, M.brass, sx * (lx + 0.085), 0.53, sz * lz);
      studX.rotation.z = -sx * (Math.PI / 2);
      const studZ = mesh(stud, M.brass, sx * lx, 0.53, sz * (lz + 0.085));
      studZ.rotation.x = sz * (Math.PI / 2);
      g.add(studX, studZ);
    }
  }

  // A cube of chalk left on the near rail.
  const chalk = mesh(new RoundedBoxGeometry(0.022, 0.022, 0.022, 2, 0.0025), X.chalk, -0.97, RAIL_TOP + 0.011, BZ + 0.055);
  chalk.rotation.y = 0.5;
  g.add(chalk);

  // Nothing here casts real shadows, so the table's shadow is painted on.
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 2.9).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: floorShadowTexture(), transparent: true, opacity: 0.95, depthWrite: false })
  );
  shadow.position.y = 0.002;
  g.add(shadow);
  return g;
}

// Dome shade as [radius, height below its top], ordered so it faces out.
const SHADE = [[0.196, -0.176], [0.192, -0.166], [0.18, -0.136], [0.16, -0.1], [0.13, -0.066], [0.094, -0.038], [0.06, -0.017], [0.038, -0.005], [0.03, 0]];
const LAMP_Y = 1.79;

// Three enamel shades on a brass bar, hung on chains from the dark above.
function buildLamp(M, X) {
  const g = new THREE.Group();
  g.add(mesh(new RoundedBoxGeometry(1.94, 0.036, 0.05, 2, 0.01), M.brass, 0, LAMP_Y, 0));
  const eye = new THREE.TorusGeometry(0.012, 0.003, 8, 20);
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.SphereGeometry(0.026, 20, 14), M.brass, s * 0.99, LAMP_Y, 0));
    const neck = mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.03, 16), M.brass, s * 0.965, LAMP_Y, 0);
    neck.rotation.z = (s * Math.PI) / 2;
    g.add(neck);
    g.add(mesh(eye, M.brass, s * 0.78, LAMP_Y + 0.03, 0));
    chain(g, M.brass, s * 0.78, LAMP_Y + 0.04, 4.4);
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.025, 28), M.brass, s * 0.78, 4.41, 0));
  }

  const shade = lathe(SHADE, 48);
  const rim = new THREE.TorusGeometry(0.196, 0.006, 8, 48).rotateX(Math.PI / 2);
  const top = LAMP_Y - 0.068;
  const coneH = top - 0.176 - CLOTH;
  const cone = new THREE.CylinderGeometry(0.19, 0.6, coneH, 40, 1, true);
  for (const x of [-0.65, 0, 0.65]) {
    g.add(mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.06, 12), M.brass, x, LAMP_Y - 0.045, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.022, 24), M.brass, x, top + 0.009, 0));
    g.add(mesh(shade, X.enamel, x, top, 0));
    g.add(new THREE.Mesh(shade, X.shadeGlow).translateX(x).translateY(top));
    g.add(mesh(rim, M.brass, x, top - 0.176, 0));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.032, 20, 14), X.bulb).translateX(x).translateY(top - 0.085));
    g.add(new THREE.Mesh(cone, X.cone).translateX(x).translateY(CLOTH + coneH / 2));
  }
  return g;
}

// Interlocked links, each turned a quarter from the last.
function chain(g, mat, x, y0, y1) {
  const link = new THREE.TorusGeometry(0.0072, 0.0017, 4, 10).scale(1, 1.55, 1);
  for (let y = y0, i = 0; y < y1; y += 0.0185, i++) {
    const l = new THREE.Mesh(link, mat);
    l.position.set(x, y, 0);
    l.rotation.y = (i % 2) * (Math.PI / 2);
    g.add(l);
  }
}

// The back wall behind the table (world coordinates): a walnut board with
// five cues, a peg for the triangle, a chalk shelf and a bead scoreboard.
function buildWall(M, X, cueGeo) {
  const g = new THREE.Group();
  g.add(mesh(grain(new RoundedBoxGeometry(1.06, 0.86, 0.026, 2, 0.008), 1), X.wood, 12.6, 1.6, -2.185));
  g.add(mesh(grain(new RoundedBoxGeometry(1.12, 0.045, 0.06, 2, 0.012), 0), X.wood, 12.6, 2.05, -2.17));
  g.add(mesh(grain(new RoundedBoxGeometry(1.1, 0.03, 0.045, 2, 0.01), 0), X.wood, 12.6, 1.18, -2.176));

  // Cue rack: a ledge with brass cups for the butts, clips up top.
  g.add(mesh(grain(new RoundedBoxGeometry(0.58, 0.035, 0.12, 2, 0.008), 0), X.wood, 12.4, 0.47, -2.1));
  g.add(mesh(grain(new RoundedBoxGeometry(0.58, 0.06, 0.075, 2, 0.01), 0), X.wood, 12.4, 1.82, -2.135));
  for (const x of [12.15, 12.65]) g.add(mesh(grain(new RoundedBoxGeometry(0.03, 0.08, 0.1, 2, 0.008), 1), X.wood, x, 0.415, -2.11));
  const cup = new THREE.CylinderGeometry(0.021, 0.021, 0.024, 24);
  const clip = new THREE.TorusGeometry(0.009, 0.0022, 6, 16, Math.PI).rotateX(Math.PI / 2);
  [1, 0, 2, 0, 1].forEach((style, i) => {
    const x = 12.2 + i * 0.1;
    const c = new THREE.Mesh(cueGeo, X.cues[style]);
    c.position.set(x, 0.4875, -2.08);
    c.rotation.x = -0.008;
    g.add(c);
    g.add(mesh(cup, M.brass, x, 0.4995, -2.08));
    g.add(mesh(clip, M.brass, x, 1.82, -2.091));
  });

  // A brass picture light over the board, washing it in warm light.
  for (const x of [12.25, 12.95]) {
    const arm = mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.1, 10), M.brass, x, 2.03, -2.115);
    arm.rotation.x = -1.0;
    g.add(arm);
  }
  const hood = mesh(new RoundedBoxGeometry(0.82, 0.022, 0.075, 2, 0.008), M.brass, 12.6, 2.0, -2.07);
  hood.rotation.x = 0.35;
  g.add(hood);
  g.add(mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.74, 12).rotateZ(Math.PI / 2), X.bulb, 12.6, 1.985, -2.075));
  g.add(new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.84), X.wash).translateX(12.6).translateY(1.6).translateZ(-2.1705));

  // Peg for the triangle, and a chalk shelf under it.
  const peg = mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.06, 12), M.brass, 12.9, 1.74, -2.145);
  peg.rotation.x = Math.PI / 2;
  g.add(peg, mesh(new THREE.SphereGeometry(0.011, 16, 12), M.brass, 12.9, 1.74, -2.113));
  g.add(mesh(grain(new RoundedBoxGeometry(0.36, 0.022, 0.085, 2, 0.006), 0), X.wood, 12.9, 1.255, -2.13));
  const chalk = new RoundedBoxGeometry(0.022, 0.022, 0.022, 2, 0.0025);
  [[12.79, 0.3], [12.87, -0.2], [12.97, 0.7]].forEach(([x, a]) => {
    const c = mesh(chalk, X.chalk, x, 1.277, -2.125);
    c.rotation.y = a;
    g.add(c);
  });

  // Bead scoreboard: two brass wires between walnut posts, ivory and ebony
  // beads in fives, some pushed across for the score.
  g.add(mesh(grain(new RoundedBoxGeometry(1.04, 0.12, 0.02, 2, 0.006), 0), X.wood, 12.6, 2.2, -2.188));
  for (const x of [12.1, 13.1]) g.add(mesh(grain(new RoundedBoxGeometry(0.03, 0.1, 0.05, 2, 0.008), 1), X.wood, x, 2.2, -2.168));
  const wire = new THREE.CylinderGeometry(0.0012, 0.0012, 0.97, 6).rotateZ(Math.PI / 2);
  const bead = new THREE.SphereGeometry(0.0118, 16, 10).scale(0.72, 1, 1);
  [[2.225, 7], [2.175, 3]].forEach(([y, score]) => {
    g.add(mesh(wire, M.brass, 12.6, y, -2.155));
    for (let i = 0; i < 15; i++) {
      const x = i < score ? 12.125 + 0.0086 + i * 0.0172 : 13.075 - 0.0086 - (14 - i) * 0.0172;
      g.add(mesh(bead, Math.floor(i / 5) % 2 ? M.ebony : M.ivory, x, y, -2.155));
    }
  });
  return g;
}

// The wooden triangle: centre at the origin, apex toward -x, sitting on y = 0.
function buildTriangle(M, X) {
  const g = new THREE.Group();
  const corners = (rad) => [0, 1, 2].map((i) => new THREE.Vector2(Math.cos(Math.PI + (i * TAU) / 3) * rad, Math.sin(Math.PI + (i * TAU) / 3) * rad));
  const outer = TRI_IN + 0.04;
  const shape = new THREE.Shape(corners(outer));
  shape.holes.push(new THREE.Path(corners(TRI_IN)));
  g.add(mesh(slab(shape, 0.04, 0.04, 0.004), X.wood));
  // Brass guards over the corners, open where the balls sit.
  const guard = outer + 0.002;
  const open = guard - TRI_IN + 0.001;
  for (const c of corners(guard)) {
    const d = c.clone().normalize().negate();
    const n = new THREE.Vector2(-d.y, d.x);
    const at = (along, across) => c.clone().addScaledVector(d, along).addScaledVector(n, across);
    const tip = new THREE.Shape([c, at(0.06, 0.0346), at(0.06, -0.0346)]);
    const w = (0.057 - open) * Math.tan(Math.PI / 6);
    tip.holes.push(new THREE.Path([at(open, 0), at(0.057, w), at(0.057, -w)]));
    g.add(mesh(slab(tip, 0.042, 0.044, 0.002), M.brass));
  }
  return g;
}

// A cue as a lathe from butt (y = 0) to tip (y = CUE_LEN), with a pro taper
// on the shaft; v runs along the length so the skin lines up.
function cueGeometry() {
  const joint = 0.752;
  const straight = CUE_LEN - 0.3; // the last 30 cm of shaft keep the tip's size
  const radius = (s) => {
    if (s < 0.012) return 0.0146;
    if (s < 0.735) return lerp(0.0152, 0.011, s / 0.735);
    if (s < joint) return 0.0113;
    return 0.0065 + 0.0042 * clamp((straight - s) / (straight - joint), 0, 1) ** 1.3;
  };
  const pts = [[0, 0]];
  for (let s = 0; s < CUE_LEN - 0.005; s += 0.01) pts.push([radius(s), s]);
  pts.push([0.0064, CUE_LEN - 0.004], [0.0055, CUE_LEN - 0.0015], [0.0035, CUE_LEN - 0.0003], [0, CUE_LEN]);
  const geo = lathe(pts, 14);
  const uv = geo.attributes.uv;
  const pos = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setY(i, pos.getY(i) / CUE_LEN);
  return geo;
}
