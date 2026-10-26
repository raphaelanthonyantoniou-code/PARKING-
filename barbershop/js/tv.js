// Match Day corner: a wall TV showing a live football broadcast (or a
// football video game on the console input), a games console, a media
// unit, a leather sofa, a coffee table and a neon sign. The pitch is a
// small simulation drawn on a canvas each redraw.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mesh, bake, makeCanvas, rng, extrude, neonGlow, neonPlane, neonLevel, TAU, clamp, lerp } from './kit.js';

const TV = { x: -10.5, y: 1.75, z: -2.16, w: 1.45, h: 0.83 };
const SW = 1024;
const SH = 576;

// ------------------------------------------------------------ simulation
// Pitch metres: x along the length (-52.5..52.5), y across (-34 far .. 34 near).
const HALF_L = 52.5;
const HALF_W = 34;
const GOAL_W = 3.66;
const TEAMS = [
  { abbr: 'BRB', name: 'Barbers', kit: '#7a1424', trim: '#f2d9a0', game: '#e3243b', p: 'P1' },
  { abbr: 'ATH', name: 'Athletic', kit: '#f1f1ec', trim: '#1b2a4a', game: '#ffffff', p: 'P2' },
];
// 4-4-2 for the team attacking +x: [x, y] in metres from their own half.
const SHAPE = [
  [-49, 0], [-34, -22], [-36, -8], [-36, 8], [-34, 22],
  [-14, -24], [-17, -8], [-17, 8], [-14, 24], [-3, -7], [-4, 8],
];
const NAMES = ['VEGA', 'OKAFOR', 'LINDQVIST', 'MARCHETTI', 'DUBOIS', 'SATO', 'RAMOS', 'KOWALSKI', 'NWOSU', 'ALVES', 'BRENNAN'];

function makeMatch() {
  const rand = rng(1907);
  const players = [];
  for (let t = 0; t < 2; t++) {
    for (let i = 0; i < 11; i++) {
      const dir = t === 0 ? 1 : -1;
      players.push({
        team: t, idx: i, dir,
        x: SHAPE[i][0] * dir * 0.5, y: SHAPE[i][1] * dir,
        vx: 0, vy: 0, phase: rand() * TAU, speed: 6.4 + rand() * 1.4,
        stamina: 0.7 + rand() * 0.3,
      });
    }
  }
  return {
    rand, players,
    ball: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 },
    owner: null, lastTouch: 0, cool: 0,
    score: [0, 0], clock: 23 * 60, half: 1,
    goalT: -1, scorer: 0, kick: 0,
  };
}

function kickoff(m, team) {
  for (const p of m.players) {
    p.x = SHAPE[p.idx][0] * p.dir * 0.5 - p.dir * 2;
    p.y = SHAPE[p.idx][1] * p.dir;
    p.vx = p.vy = 0;
  }
  const b = m.ball;
  b.x = b.y = b.z = b.vx = b.vy = b.vz = 0;
  const taker = m.players[team * 11 + 9];
  taker.x = -taker.dir * 0.6;
  taker.y = 0;
  m.owner = taker;
  m.cool = 0.8;
}

function strike(m, p, tx, ty, speed, lift) {
  const b = m.ball;
  const dx = tx - b.x;
  const dy = ty - b.y;
  const d = Math.hypot(dx, dy) || 1;
  b.vx = (dx / d) * speed;
  b.vy = (dy / d) * speed;
  b.vz = lift;
  m.owner = null;
  m.lastTouch = p.team;
  m.cool = 0.35;
}

// The player on the ball: dribble at goal, pass forward, or shoot.
function onBall(m, p, dt) {
  const goalX = HALF_L * p.dir;
  const toGoal = Math.abs(goalX - p.x);
  if (m.cool > 0) return;
  if (toGoal < 24 && m.rand() < dt * 1.6) {
    const r = m.rand();
    // Shots: about one in three goes in, the rest are saved or go wide.
    const ty = r < 0.34 ? (m.rand() * 2 - 1) * 3.1 : r < 0.75 ? (m.rand() * 2 - 1) * 1.2 : (m.rand() < 0.5 ? -1 : 1) * (4.5 + m.rand() * 3);
    m.shot = r < 0.34 ? 'goal' : r < 0.75 ? 'save' : 'wide';
    strike(m, p, goalX + p.dir * 2, ty, 27, 1.5 + m.rand() * 2);
    return;
  }
  if (m.rand() < dt * 0.9) {
    // Pass to a teammate further forward, preferring open ones.
    let best = null;
    let bestScore = -1e9;
    for (const q of m.players) {
      if (q.team !== p.team || q === p || q.idx === 0) continue;
      const fwd = (q.x - p.x) * p.dir;
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < 6 || d > 38) continue;
      const s = fwd + m.rand() * 12 - d * 0.15;
      if (s > bestScore) { bestScore = s; best = q; }
    }
    if (best) {
      strike(m, p, best.x + best.vx * 0.6, best.y + best.vy * 0.6, 16 + m.rand() * 7, m.rand() < 0.25 ? 4 : 0.3);
      m.shot = null;
      return;
    }
  }
  // Dribble: drift towards goal, cutting in from the wings.
  const ty = clamp(p.y * 0.6, -20, 20);
  const dx = goalX - p.x;
  const dy = ty - p.y;
  const d = Math.hypot(dx, dy) || 1;
  p.vx = lerp(p.vx, (dx / d) * p.speed * 0.8, dt * 4);
  p.vy = lerp(p.vy, (dy / d) * p.speed * 0.8 + Math.sin(p.phase * 0.3) * 2, dt * 4);
  m.ball.x = p.x + p.dir * 0.7;
  m.ball.y = p.y + 0.15;
  m.ball.z = 0;
}

function stepMatch(m, dt) {
  const b = m.ball;
  m.cool -= dt;
  m.clock += dt * 9;
  if (m.clock >= 90 * 60) { m.clock = 0; m.half = 1; m.score[0] = m.score[1] = 0; }

  if (m.goalT >= 0) {
    m.goalT += dt;
    // Celebration: scorers run to the corner, the rest walk back.
    for (const p of m.players) {
      const tx = p.team === m.scorer ? HALF_L * p.dir * 0.8 : SHAPE[p.idx][0] * p.dir * 0.4;
      const ty = p.team === m.scorer ? 30 : SHAPE[p.idx][1] * p.dir;
      moveTo(p, tx, ty, p.team === m.scorer ? 0.9 : 0.35, dt);
    }
    b.vx *= 0.9; b.vy *= 0.9;
    if (m.goalT > 7) { m.goalT = -1; kickoff(m, 1 - m.scorer); }
    return;
  }

  // Ball flight.
  if (!m.owner) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    b.vz -= 9.8 * dt;
    if (b.z < 0) { b.z = 0; b.vz = -b.vz * 0.45; if (b.vz < 1) b.vz = 0; }
    const f = b.z > 0 ? 0.995 : 1 - dt * 0.9;
    b.vx *= f; b.vy *= f;
    if (Math.abs(b.x) > HALF_L) {
      const side = Math.sign(b.x);
      if (Math.abs(b.y) < GOAL_W && m.shot === 'goal') {
        m.score[side > 0 ? 0 : 1]++;
        m.scorer = side > 0 ? 0 : 1;
        m.goalT = 0;
        m.shot = null;
        b.x = side * (HALF_L + 1.2); b.vx = b.vy = 0; b.z = 0.6;
        return;
      }
      // Goal kick: the keeper takes it.
      const keeper = m.players[(side > 0 ? 1 : 0) * 11];
      keeper.x = side * (HALF_L - 6); keeper.y = 0;
      m.owner = keeper; m.cool = 1; m.shot = null;
    }
    if (Math.abs(b.y) > HALF_W) { b.y = Math.sign(b.y) * HALF_W; b.vy = -b.vy * 0.4; }
  }

  // The nearest player of each team chases the ball; the others hold shape.
  const chasers = [null, null];
  const best = [1e9, 1e9];
  for (const p of m.players) {
    if (p.idx === 0) continue;
    const d = Math.hypot(p.x - b.x, p.y - b.y);
    if (d < best[p.team]) { best[p.team] = d; chasers[p.team] = p; }
  }
  for (const p of m.players) {
    p.phase += dt * Math.hypot(p.vx, p.vy) * 1.6;
    if (p === m.owner) { onBall(m, p, dt); continue; }
    if (p.idx === 0) {
      // Keeper: shuffle across the goal mouth, dive at saved shots.
      const gx = -HALF_L * p.dir;
      const near = Math.abs(b.x - gx) < 12 && m.shot === 'save' && m.lastTouch !== p.team;
      moveTo(p, gx + p.dir * 1.2, clamp(b.y * 0.15, -3, 3) + (near ? b.y * 0.6 : 0), near ? 1.4 : 0.5, dt);
      if (near && Math.hypot(p.x - b.x, p.y - b.y) < 2.2 && b.z < 2.6) { m.owner = p; m.cool = 1.2; m.shot = null; }
      continue;
    }
    if (p === chasers[p.team] && (!m.owner || m.owner.team !== p.team)) {
      moveTo(p, b.x + b.vx * 0.3, b.y + b.vy * 0.3, 1, dt);
      const d = Math.hypot(p.x - b.x, p.y - b.y);
      if (d < 1.1 && b.z < 1.6 && m.cool <= 0 && (!m.owner || m.rand() < dt * 2.5)) {
        m.owner = p; m.lastTouch = p.team; m.cool = 0.4; m.shot = null;
      }
      continue;
    }
    // Formation shifted towards the ball, attackers pushing up in possession.
    const att = m.owner && m.owner.team === p.team ? 12 : -4;
    const tx = SHAPE[p.idx][0] * p.dir * 0.85 + b.x * 0.55 + att * p.dir;
    const ty = SHAPE[p.idx][1] * p.dir * 0.8 + b.y * 0.3;
    moveTo(p, clamp(tx, -HALF_L + 3, HALF_L - 3), ty, 0.55, dt);
  }
}

function moveTo(p, tx, ty, effort, dt) {
  const dx = tx - p.x;
  const dy = ty - p.y;
  const d = Math.hypot(dx, dy);
  const s = d < 0.5 ? 0 : Math.min(p.speed * effort, d * 1.5);
  const k = Math.min(1, dt * 3);
  p.vx += ((d ? (dx / d) * s : 0) - p.vx) * k;
  p.vy += ((d ? (dy / d) * s : 0) - p.vy) * k;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
}

// --------------------------------------------------------------- drawing
// A pinhole camera on the near side of the pitch: screen x/y and pixels per
// metre for a pitch point. `cam` holds the pan and lens for each style.
const P = { x: 0, y: 0, s: 0 };
function project(cam, px, py) {
  const dist = cam.d0 + (HALF_W - py);
  P.s = cam.f / dist;
  P.x = SW / 2 + (px - cam.x) * P.s;
  P.y = cam.a + (cam.b * cam.h) / dist;
  return P;
}

function path(g, cam, pts) {
  g.beginPath();
  for (let i = 0; i < pts.length; i += 2) {
    project(cam, pts[i], pts[i + 1]);
    if (i === 0) g.moveTo(P.x, P.y); else g.lineTo(P.x, P.y);
  }
}

function makeCrowd() {
  const [c, g] = makeCanvas(1024, 160);
  const r = rng(77);
  g.fillStyle = '#16181d';
  g.fillRect(0, 0, 1024, 160);
  // Tiers of seats, then a soft speckle of faces and shirts.
  for (let y = 0; y < 160; y += 16) {
    g.fillStyle = y % 32 ? '#1f2229' : '#262a33';
    g.fillRect(0, y, 1024, 9);
  }
  const shirts = ['#7a1424', '#a11c30', '#e7e2d6', '#2b3550', '#c9b28a', '#3d4048'];
  for (let i = 0; i < 5200; i++) {
    g.fillStyle = r() < 0.4 ? `rgba(220,180,150,${0.4 + r() * 0.4})` : shirts[Math.floor(r() * shirts.length)];
    g.globalAlpha = 0.55 + r() * 0.45;
    g.fillRect(r() * 1024, r() * 160, 2 + r() * 2, 2 + r() * 3);
  }
  g.globalAlpha = 1;
  g.filter = 'blur(1.2px)';
  g.drawImage(c, 0, 0);
  g.filter = 'none';
  return c;
}

function makeStatic() {
  const [c, g] = makeCanvas(256, 144);
  const img = g.createImageData(256, 144);
  const r = rng(5);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = r() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

const ADS = ['BARBERSHOP', 'FADE CUT', 'HOT TOWEL', 'STRAIGHT RAZOR', 'BEARD OIL', 'SHARP & CO'];
const ADCOL = ['#7a1424', '#0f3b3a', '#1b2a4a', '#c69a3c', '#111111', '#6e2a8a'];

function drawPitch(g, cam, game) {
  // Stands and crowd above the far touchline, with a little parallax.
  project(cam, 0, -HALF_W - 4);
  const boardTop = P.y - 1.6 * P.s;
  const crowd = cam.crowd;
  const off = (((-cam.x * 6) % 1024) + 1024) % 1024;
  g.drawImage(crowd, off, 0, 1024 - off, 160, 0, 0, (1024 - off) * 1, boardTop);
  g.drawImage(crowd, 0, 0, off, 160, 1024 - off, 0, off, boardTop);
  if (game) { g.fillStyle = 'rgba(40,90,180,0.25)'; g.fillRect(0, 0, SW, boardTop); }

  // Grass apron then mowing stripes across the length.
  g.fillStyle = game ? '#2f9a3a' : '#2c6b2c';
  g.fillRect(0, P.y - 2, SW, SH);
  const w = 105 / 18;
  for (let i = 0; i < 18; i++) {
    const x0 = -HALF_L + i * w;
    g.fillStyle = i % 2 ? (game ? '#3fb34a' : '#357a33') : (game ? '#36a541' : '#2f702e');
    path(g, cam, [x0, -HALF_W - 3, x0 + w, -HALF_W - 3, x0 + w, HALF_W + 3, x0, HALF_W + 3]);
    g.fill();
  }

  // Advertising boards along the far touchline.
  const bw = 14;
  for (let i = -6; i < 6; i++) {
    const x0 = i * bw;
    project(cam, x0, -HALF_W - 4);
    const xa = P.x;
    const ya = P.y;
    const s = P.s;
    project(cam, x0 + bw, -HALF_W - 4);
    if (P.x < 0 || xa > SW) continue;
    const k = (i + 6) % ADS.length;
    g.fillStyle = ADCOL[k];
    g.fillRect(xa, ya - 1.5 * s, P.x - xa - 1, 1.5 * s);
    g.fillStyle = k === 3 ? '#111' : '#f4ead2';
    g.font = `800 ${Math.round(0.9 * s)}px "Arial Narrow", Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(ADS[k], (xa + P.x) / 2, ya - 0.75 * s);
  }

  // Markings.
  g.strokeStyle = 'rgba(245,245,240,0.88)';
  g.lineWidth = 2;
  path(g, cam, [-HALF_L, -HALF_W, HALF_L, -HALF_W, HALF_L, HALF_W, -HALF_L, HALF_W, -HALF_L, -HALF_W]);
  g.stroke();
  path(g, cam, [0, -HALF_W, 0, HALF_W]);
  g.stroke();
  for (const s of [-1, 1]) {
    const gx = s * HALF_L;
    path(g, cam, [gx, -20.16, gx - s * 16.5, -20.16, gx - s * 16.5, 20.16, gx, 20.16]);
    g.stroke();
    path(g, cam, [gx, -9.16, gx - s * 5.5, -9.16, gx - s * 5.5, 9.16, gx, 9.16]);
    g.stroke();
  }
  g.beginPath();
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * TAU;
    project(cam, Math.cos(a) * 9.15, Math.sin(a) * 9.15);
    if (i === 0) g.moveTo(P.x, P.y); else g.lineTo(P.x, P.y);
  }
  g.stroke();
}

function drawGoal(g, cam, s) {
  const gx = s * HALF_L;
  const pts = [-GOAL_W, GOAL_W];
  g.strokeStyle = '#f7f7f2';
  g.lineWidth = 3;
  // Net: a faint box behind the line.
  g.fillStyle = 'rgba(230,230,230,0.18)';
  project(cam, gx, -GOAL_W);
  const ax = P.x, ay = P.y, as = P.s;
  project(cam, gx, GOAL_W);
  const bx = P.x, by = P.y, bs = P.s;
  project(cam, gx + s * 2, -GOAL_W);
  const cx = P.x, cy = P.y, cs = P.s;
  g.beginPath();
  g.moveTo(ax, ay - 2.44 * as); g.lineTo(cx, cy - 2.2 * cs); g.lineTo(cx, cy);
  g.lineTo(ax, ay); g.lineTo(bx, by); g.lineTo(bx, by - 2.44 * bs); g.closePath();
  g.fill();
  g.beginPath();
  g.moveTo(ax, ay); g.lineTo(ax, ay - 2.44 * as); g.lineTo(bx, by - 2.44 * bs); g.lineTo(bx, by);
  g.stroke();
  return pts;
}

// Players sorted far to near so nearer ones overlap.
function drawPlayers(g, cam, m, game, ctrl) {
  const order = m.order;
  order.sort((a, b) => a.y - b.y);
  for (const p of order) {
    project(cam, p.x, p.y);
    const s = P.s * (game ? 1.05 : 0.95);
    const x = P.x;
    const y = P.y;
    if (x < -40 || x > SW + 40) continue;
    const t = TEAMS[p.team];
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.ellipse(x + 0.35 * s, y, 0.55 * s, 0.16 * s, 0, 0, TAU);
    g.fill();
    // Legs swing with the running phase.
    const sw = Math.sin(p.phase) * 0.28 * s * Math.min(1, Math.hypot(p.vx, p.vy) / 3);
    g.strokeStyle = p.team === 0 ? '#1a1a1a' : '#e8e8e8';
    g.lineWidth = Math.max(1.5, 0.2 * s);
    g.beginPath();
    g.moveTo(x - 0.1 * s, y - 0.9 * s); g.lineTo(x - 0.1 * s + sw, y);
    g.moveTo(x + 0.1 * s, y - 0.9 * s); g.lineTo(x + 0.1 * s - sw, y);
    g.stroke();
    const kit = p.idx === 0 ? (p.team === 0 ? '#e9c21e' : '#2db36a') : game ? t.game : t.kit;
    g.fillStyle = kit;
    g.fillRect(x - 0.27 * s, y - 1.5 * s, 0.54 * s, 0.65 * s);
    g.fillStyle = t.trim;
    g.fillRect(x - 0.27 * s, y - 0.95 * s, 0.54 * s, 0.12 * s);
    g.fillStyle = '#c99a78';
    g.beginPath();
    g.arc(x, y - 1.68 * s, 0.17 * s, 0, TAU);
    g.fill();
    if (game && p === ctrl) {
      // Controlled player: ring, marker and name tag.
      g.strokeStyle = '#ffe14a';
      g.lineWidth = 2.5;
      g.beginPath();
      g.ellipse(x, y, 0.9 * s, 0.3 * s, 0, 0, TAU);
      g.stroke();
      const ty = y - 2.3 * s;
      g.fillStyle = '#ffe14a';
      g.beginPath(); g.moveTo(x - 6, ty - 8); g.lineTo(x + 6, ty - 8); g.lineTo(x, ty); g.fill();
      g.font = '700 15px Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      const name = NAMES[p.idx];
      const tw = g.measureText(name).width + 14;
      g.fillStyle = 'rgba(10,20,60,0.85)';
      g.fillRect(x - tw / 2, ty - 30, tw, 20);
      g.fillStyle = '#fff';
      g.fillText(name, x, ty - 12);
    }
  }
}

function drawBall(g, cam, b) {
  project(cam, b.x, b.y);
  const s = P.s;
  g.fillStyle = 'rgba(0,0,0,0.4)';
  g.beginPath();
  g.ellipse(P.x, P.y, 0.3 * s, 0.1 * s, 0, 0, TAU);
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(P.x, P.y - (b.z + 0.2) * s, Math.max(2.5, 0.22 * s), 0, TAU);
  g.fill();
}

function fmtClock(sec) {
  const mm = Math.floor(sec / 60);
  const ss = Math.floor(sec % 60);
  return `${mm < 10 ? '0' : ''}${mm}:${ss < 10 ? '0' : ''}${ss}`;
}

function drawBroadcastHud(g, m, time) {
  // Score bug.
  g.fillStyle = 'rgba(12,14,20,0.88)';
  g.fillRect(36, 30, 268, 40);
  g.fillStyle = TEAMS[0].kit; g.fillRect(36, 30, 6, 40);
  g.fillStyle = TEAMS[1].kit; g.fillRect(222, 30, 6, 40);
  g.fillStyle = '#f2f2f2';
  g.font = '700 21px Arial, sans-serif';
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillText(TEAMS[0].abbr, 52, 51);
  g.fillText(TEAMS[1].abbr, 236, 51) ;
  g.textAlign = 'center';
  g.fillStyle = '#c69a3c';
  g.fillRect(112, 30, 96, 40);
  g.fillStyle = '#111';
  g.fillText(`${m.score[0]} – ${m.score[1]}`, 160, 51);
  g.fillStyle = 'rgba(12,14,20,0.88)';
  g.fillRect(304, 30, 78, 40);
  g.fillStyle = '#f2f2f2';
  g.font = '600 19px Arial, sans-serif';
  g.fillText(fmtClock(m.clock), 343, 51);
  // LIVE tag, top right.
  g.fillStyle = '#d0142c';
  g.fillRect(SW - 108, 30, 72, 30);
  g.fillStyle = '#fff';
  g.font = '800 17px Arial, sans-serif';
  g.fillText('LIVE', SW - 64, 46);
  if (Math.sin(time * 4) > 0) { g.beginPath(); g.arc(SW - 95, 45, 5, 0, TAU); g.fill(); }

  if (m.goalT >= 0) drawGoalBanner(g, m, false);
}

function drawGoalBanner(g, m, game) {
  const t = m.goalT;
  if (t < 3.6) {
    const k = Math.min(1, t * 3);
    const s = 0.6 + 0.4 * k + Math.sin(t * 9) * 0.02;
    g.save();
    g.translate(SW / 2, SH / 2 - 10);
    g.scale(s, s);
    g.fillStyle = game ? 'rgba(255,225,74,0.9)' : 'rgba(122,20,36,0.9)';
    g.fillRect(-SW, -62, SW * 2, 124);
    g.fillStyle = game ? '#14205a' : '#fff';
    g.font = '900 120px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('GOAL!', 0, 4);
    g.restore();
    g.fillStyle = '#fff';
    g.font = '700 24px Arial, sans-serif';
    g.textAlign = 'center';
    g.fillText(`${TEAMS[m.scorer].name.toUpperCase()}  ${m.score[0]} – ${m.score[1]}`, SW / 2, SH / 2 + 86);
  } else {
    // Replay label while the players walk back.
    g.fillStyle = 'rgba(12,14,20,0.85)';
    g.fillRect(SW - 200, SH - 78, 164, 40);
    g.fillStyle = game ? '#ffe14a' : '#c69a3c';
    g.fillRect(SW - 200, SH - 78, 8, 40);
    g.fillStyle = '#fff';
    g.font = '800 20px Arial, sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText('▶ REPLAY', SW - 182, SH - 57);
  }
}

function drawGameHud(g, m, ctrl) {
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(10,20,60,0.85)';
  g.fillRect(SW / 2 - 150, 22, 300, 42);
  g.fillStyle = '#e3243b'; g.fillRect(SW / 2 - 150, 22, 70, 42);
  g.fillStyle = '#2c6fe0'; g.fillRect(SW / 2 + 80, 22, 70, 42);
  g.fillStyle = '#fff';
  g.font = '800 24px Arial, sans-serif';
  g.textAlign = 'center';
  g.fillText('P1', SW / 2 - 115, 44);
  g.fillText('P2', SW / 2 + 115, 44);
  g.fillText(`${m.score[0]} – ${m.score[1]}`, SW / 2, 44);
  g.font = '700 16px Arial, sans-serif';
  g.fillText(fmtClock(m.clock), SW / 2, 80);

  // Stamina bar for the controlled player, bottom left.
  g.fillStyle = 'rgba(10,20,60,0.8)';
  g.fillRect(30, SH - 70, 230, 44);
  g.fillStyle = '#fff';
  g.textAlign = 'left';
  g.font = '700 15px Arial, sans-serif';
  g.fillText(ctrl ? NAMES[ctrl.idx] : '', 42, SH - 56);
  g.fillStyle = '#333a55';
  g.fillRect(42, SH - 44, 206, 9);
  g.fillStyle = '#4ef08a';
  g.fillRect(42, SH - 44, 206 * (ctrl ? ctrl.stamina : 1), 9);

  // Mini-map, bottom centre.
  const mw = 168;
  const mh = 108;
  const mx = SW / 2 - mw / 2;
  const my = SH - mh - 18;
  g.fillStyle = 'rgba(20,60,30,0.8)';
  g.fillRect(mx, my, mw, mh);
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = 1;
  g.strokeRect(mx, my, mw, mh);
  g.beginPath(); g.moveTo(mx + mw / 2, my); g.lineTo(mx + mw / 2, my + mh); g.stroke();
  for (const p of m.players) {
    g.fillStyle = p === ctrl ? '#ffe14a' : p.team === 0 ? '#ff3b52' : '#5aa0ff';
    g.fillRect(mx + ((p.x + HALF_L) / 105) * mw - 2, my + ((p.y + HALF_W) / 68) * mh - 2, 4, 4);
  }
  g.fillStyle = '#fff';
  g.fillRect(mx + ((m.ball.x + HALF_L) / 105) * mw - 1.5, my + ((m.ball.y + HALF_W) / 68) * mh - 1.5, 3, 3);

  if (m.goalT >= 0) drawGoalBanner(g, m, true);
}

// Nearest P1 player to the ball: the one "you" control in the game view.
function controlled(m) {
  let best = null;
  let bd = 1e9;
  for (let i = 1; i < 11; i++) {
    const p = m.players[i];
    const d = Math.hypot(p.x - m.ball.x, p.y - m.ball.y);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function createScreen(tier) {
  const [canvas, g] = makeCanvas(SW, SH);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const crowd = makeCrowd();
  const noise = makeStatic();
  const match = makeMatch();
  match.order = match.players.slice();
  kickoff(match, 0);
  // Warm the simulation up so the first frame is mid-play.
  for (let i = 0; i < 300; i++) stepMatch(match, 1 / 20);

  const cams = {
    match: { x: 0, d0: 30, h: 20, f: 1150, a: -30, b: 840, crowd },
    console: { x: 0, d0: 30, h: 30, f: 900, a: -150, b: 960, crowd },
  };

  const state = { input: 'match', switchT: 9, switchAt: -99, acc: 0, simAcc: 0, brightness: 1 };

  function draw(time) {
    const game = state.input === 'console';
    const cam = game ? cams.console : cams.match;
    // The broadcast camera pans after the ball, a little behind it.
    const target = clamp(match.ball.x, -HALF_L + 22, HALF_L - 22);
    cam.x += (target - cam.x) * 0.12;
    g.fillStyle = '#000';
    g.fillRect(0, 0, SW, SH);
    drawPitch(g, cam, game);
    drawGoal(g, cam, -1);
    drawGoal(g, cam, 1);
    const ctrl = controlled(match);
    drawPlayers(g, cam, match, game, ctrl);
    drawBall(g, cam, match.ball);
    if (game) drawGameHud(g, match, ctrl); else drawBroadcastHud(g, match, time);

    // Input change: a burst of static, black, then the input label.
    const st = state.switchT;
    if (st < 0.35) {
      g.drawImage(noise, (time * 997) % 60 | 0, (time * 613) % 40 | 0, 196, 104, 0, 0, SW, SH);
    } else if (st < 0.8) {
      g.fillStyle = '#000';
      g.fillRect(0, 0, SW, SH);
    }
    if (st < 2.6) {
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(SW - 220, SH - 120, 170, 64);
      g.fillStyle = '#fff';
      g.font = '600 28px Arial, sans-serif';
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(game ? 'HDMI 2' : 'TV  ·  CH 4', SW - 200, SH - 98);
      g.font = '400 15px Arial, sans-serif';
      g.fillText(game ? 'Game console' : 'Sport HD', SW - 200, SH - 72);
    }
    state.brightness = st < 0.8 ? (st < 0.35 ? 0.8 : 0.05) : match.goalT >= 0 && match.goalT < 3.6 ? 1.15 : 1;
    tex.needsUpdate = true;
  }

  return {
    tex, state, match,
    tick(dt, time, reduced) {
      // Timed from the clock, since dt may be clamped on slow frames.
      if (state.switchAt === null) state.switchAt = time;
      state.switchT = time - state.switchAt;
      state.acc += dt;
      const step = reduced ? 0.5 : tier === 2 ? 1 / 20 : 1 / 12;
      if (state.acc < step) return;
      const d = Math.min(state.acc, 0.5);
      state.acc = 0;
      stepMatch(match, d);
      draw(time);
    },
    setInput(name) {
      if (name !== 'match' && name !== 'console') return;
      if (name === state.input) return;
      state.input = name;
      state.switchAt = null;
      state.acc = 1;
    },
  };
}

// ------------------------------------------------------------- furniture
function sharedMaterials() {
  return {
    white: new THREE.MeshPhysicalMaterial({ color: 0xf2f2ef, roughness: 0.38, clearcoat: 0.4, clearcoatRoughness: 0.3 }),
    gloss: new THREE.MeshPhysicalMaterial({ color: 0x0b0b0d, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 }),
    matte: new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.7 }),
    blue: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.55, 1.6), fog: false }),
    case: new THREE.MeshStandardMaterial({ color: 0x1d3f9c, roughness: 0.4 }),
    caseRed: new THREE.MeshStandardMaterial({ color: 0x8a1622, roughness: 0.4 }),
  };
}

function buildTV(M, X) {
  const g = new THREE.Group();
  // Bezel and slim body, with a dark soft halo on the wall for the bracket.
  g.add(mesh(new RoundedBoxGeometry(TV.w + 0.02, TV.h + 0.02, 0.035, 2, 0.006), X.matte, TV.x, TV.y, TV.z - 0.005));
  g.add(mesh(new THREE.BoxGeometry(0.4, 0.3, 0.05), X.matte, TV.x, TV.y, -2.19));
  return g;
}

function buildMediaUnit(M, X) {
  const g = new THREE.Group();
  const x = TV.x;
  const z = -1.97;
  g.add(mesh(new RoundedBoxGeometry(1.8, 0.36, 0.45, 2, 0.012), M.woodDark, x, 0.24, z));
  g.add(mesh(new RoundedBoxGeometry(1.84, 0.03, 0.46, 2, 0.008), M.wood, x, 0.435, z));
  // Slatted doors and brass feet.
  for (let i = 0; i < 4; i++) g.add(mesh(new THREE.BoxGeometry(0.43, 0.3, 0.01), M.wood, x - 0.675 + i * 0.45, 0.24, z + 0.226));
  for (const dx of [-0.82, 0.82]) for (const dz of [-0.17, 0.17]) g.add(mesh(new THREE.CylinderGeometry(0.018, 0.012, 0.06, 10), M.brass, x + dx, 0.03, z + dz));
  // Soundbar, centred under the screen.
  g.add(mesh(new RoundedBoxGeometry(0.95, 0.065, 0.1, 3, 0.03), X.matte, x, 0.485, z + 0.12));
  // Game cases leaning in a short stack.
  const c1 = mesh(new THREE.BoxGeometry(0.135, 0.17, 0.015), X.case, x + 0.62, 0.535, z - 0.05);
  const c2 = mesh(new THREE.BoxGeometry(0.135, 0.17, 0.015), X.caseRed, x + 0.62, 0.535, z - 0.03);
  c2.rotation.x = -0.12;
  c1.rotation.x = -0.12;
  const c3 = mesh(new THREE.BoxGeometry(0.17, 0.015, 0.135), X.case, x + 0.82, 0.457, z + 0.05);
  c3.rotation.y = 0.3;
  g.add(c1, c2, c3);
  return g;
}

// Tall slim console: a gloss black core between two curved white wings.
function buildConsole(M, X, x, z) {
  const g = new THREE.Group();
  const y0 = 0.45;
  const h = 0.39;
  const d = 0.25;
  g.add(mesh(new RoundedBoxGeometry(0.06, h - 0.02, d - 0.03, 2, 0.008), X.gloss, x, y0 + h / 2, z));
  // Side wing profile: flares out at the top and front like a fin.
  const s = new THREE.Shape();
  s.moveTo(-d / 2 + 0.02, 0.01);
  s.lineTo(d / 2 - 0.01, 0.03);
  s.quadraticCurveTo(d / 2 + 0.01, h * 0.6, d / 2 + 0.015, h + 0.005);
  s.quadraticCurveTo(0, h - 0.02, -d / 2 - 0.01, h + 0.01);
  s.quadraticCurveTo(-d / 2 - 0.005, h * 0.4, -d / 2 + 0.02, 0.01);
  const wing = extrude(s, 0.008, 0.003);
  for (const side of [-1, 1]) {
    const w = mesh(wing, X.white, x + side * 0.034, y0, z);
    w.rotation.y = -Math.PI / 2;
    w.rotation.z = side * 0.02;
    g.add(w);
  }
  // Round stand at the base.
  g.add(mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.012, 24), X.gloss, x, y0 + 0.006, z));
  // Blue light strips between core and wings (emissive, animated).
  const strip = new THREE.BoxGeometry(0.003, h - 0.06, 0.004);
  const lights = [];
  for (const side of [-1, 1]) {
    const l = new THREE.Mesh(strip, X.blue);
    l.position.set(x + side * 0.031, y0 + h / 2, z + d / 2 - 0.02);
    lights.push(l);
  }
  return { group: g, lights };
}

// A wireless controller: two rounded grips, a black centre, a blue light bar.
function buildController(M, X) {
  const g = new THREE.Group();
  // Body, with the grips sweeping back towards the player (+z).
  g.add(mesh(new RoundedBoxGeometry(0.15, 0.026, 0.065, 3, 0.011), X.white, 0, 0, 0));
  const grip = new THREE.SphereGeometry(0.03, 16, 12);
  for (const s of [-1, 1]) {
    const m = mesh(grip, X.white, s * 0.052, -0.004, 0.042);
    m.scale.set(0.85, 0.6, 1.5);
    m.rotation.y = -s * 0.3;
    g.add(m);
  }
  // Black centre plate, touchpad and two sticks.
  g.add(mesh(new RoundedBoxGeometry(0.07, 0.006, 0.05, 2, 0.002), X.matte, 0, 0.012, 0.012));
  g.add(mesh(new RoundedBoxGeometry(0.06, 0.004, 0.032, 2, 0.0015), X.white, 0, 0.0145, -0.012));
  for (const s of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.012, 12), X.gloss, s * 0.022, 0.02, 0.026));
  for (const s of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.004, 8), X.gloss, s * 0.05, 0.014, -0.004));
  return g;
}

function controllerLight(X) {
  return new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.0025, 0.004), X.blue);
}

function buildSofa(M) {
  const g = new THREE.Group();
  const x = TV.x;
  const z = 1.2;
  // Back is toward +z so the sofa faces the TV.
  g.add(mesh(new RoundedBoxGeometry(1.7, 0.22, 0.86, 3, 0.04), M.leather, x, 0.25, z));
  for (const dx of [-0.39, 0.39]) g.add(mesh(new RoundedBoxGeometry(0.76, 0.14, 0.66, 3, 0.05), M.leather, x + dx, 0.43, z - 0.06));
  g.add(mesh(new RoundedBoxGeometry(1.7, 0.5, 0.2, 3, 0.06), M.leatherTufted, x, 0.56, z + 0.33));
  for (const s of [-1, 1]) g.add(mesh(new RoundedBoxGeometry(0.16, 0.32, 0.86, 3, 0.06), M.leather, x + s * 0.85, 0.5, z));
  for (const dx of [-0.75, 0.75]) for (const dz of [-0.35, 0.35]) g.add(mesh(new THREE.CylinderGeometry(0.02, 0.015, 0.14, 10), M.brass, x + dx, 0.07, z + dz));
  return g;
}

function buildTable(M, X) {
  const g = new THREE.Group();
  const x = TV.x;
  const z = 0.15;
  g.add(mesh(new RoundedBoxGeometry(0.9, 0.04, 0.5, 2, 0.012), M.wood, x, 0.4, z));
  for (const dx of [-0.4, 0.4]) for (const dz of [-0.2, 0.2]) g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.38, 8), M.brass, x + dx, 0.19, z + dz));
  // Snack bowl and two glasses of something amber.
  const bowl = mesh(new THREE.SphereGeometry(0.09, 20, 10, 0, TAU, Math.PI / 2, Math.PI / 2), M.porcelain, x + 0.2, 0.505, z - 0.05);
  bowl.scale.y = 0.7;
  g.add(bowl);
  g.add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 20), M.ivory, x + 0.2, 0.46, z - 0.05));
  for (const [dx, dz] of [[-0.3, 0.08], [-0.2, -0.12]]) {
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.1, 16, 1, true), M.glass, x + dx, 0.47, z + dz));
    g.add(mesh(new THREE.CylinderGeometry(0.027, 0.024, 0.06, 16), M.amber, x + dx, 0.452, z + dz));
  }
  return g;
}

function snacks(M) {
  const r = rng(31);
  const geo = new THREE.IcosahedronGeometry(0.012, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.7 });
  const g = new THREE.Group();
  for (let i = 0; i < 26; i++) {
    const a = r() * TAU;
    const d = r() * 0.06;
    g.add(mesh(geo, mat, TV.x + 0.2 + Math.cos(a) * d, 0.49 + r() * 0.02, 0.1 + Math.sin(a) * d));
  }
  return g;
}

function buildRug() {
  const [c, g] = makeCanvas(512, 384);
  const r = rng(9);
  g.fillStyle = '#2c1c17';
  g.fillRect(0, 0, 512, 384);
  g.strokeStyle = '#7a5a33';
  g.lineWidth = 10;
  g.strokeRect(22, 22, 468, 340);
  g.strokeStyle = '#4a1c1a';
  g.lineWidth = 26;
  g.strokeRect(58, 58, 396, 268);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '200,160,110'},${r() * 0.08})`;
    g.fillRect(r() * 512, r() * 384, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.95), new THREE.MeshStandardMaterial({ map: t, roughness: 1 }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(TV.x, 0.004, 0.45);
  m.receiveShadow = true;
  return m;
}

// Neon football with "MATCH DAY" underneath.
function buildNeon() {
  const [c, g] = makeCanvas(512, 512);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  neonGlow(g, '255, 245, 235', (style) => {
    g.strokeStyle = style;
    g.lineWidth = 9;
    g.beginPath();
    g.arc(256, 190, 120, 0, TAU);
    g.stroke();
    // Centre pentagon and seams.
    g.beginPath();
    for (let i = 0; i <= 5; i++) {
      const a = -Math.PI / 2 + (i / 5) * TAU;
      const px = 256 + Math.cos(a) * 42;
      const py = 190 + Math.sin(a) * 42;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i / 5) * TAU;
      g.moveTo(256 + Math.cos(a) * 42, 190 + Math.sin(a) * 42);
      g.lineTo(256 + Math.cos(a) * 120, 190 + Math.sin(a) * 120);
    }
    g.stroke();
  }, 0.8);
  neonGlow(g, '255, 40, 90', (style) => {
    g.fillStyle = style;
    g.font = '700 74px "Arial Narrow", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('MATCH DAY', 256, 410);
  }, 0.7);
  const n = neonPlane(c, 0.72, 0.72);
  n.position.set(-12.0, 1.82, -2.17);
  return n;
}

// --------------------------------------------------------------- module
export async function createTV(ctx) {
  const { M, tier } = ctx;
  const X = sharedMaterials();
  const group = new THREE.Group();

  const furniture = new THREE.Group();
  furniture.add(buildTV(M, X), buildMediaUnit(M, X), buildSofa(M), buildTable(M, X));
  const con = buildConsole(M, X, -11.1, -1.98);
  furniture.add(con.group);
  const pad1 = buildController(M, X);
  pad1.position.set(-9.95, 0.47, -1.9);
  pad1.rotation.y = -0.35;
  const pad2 = buildController(M, X);
  pad2.position.set(-10.82, 0.44, 0.2);
  pad2.rotation.y = 0.5;
  furniture.add(pad1, pad2);
  group.add(bake(furniture));
  group.add(bake(snacks(M)), buildRug(), ...con.lights);

  // Light bars on the pads: kept separate so they can glow with the console.
  for (const p of [pad1, pad2]) {
    const l = controllerLight(X);
    l.position.set(0, 0.0165, -0.029).applyMatrix4(p.matrix);
    l.rotation.y = p.rotation.y;
    group.add(l);
  }

  // Wall shadow under the TV body (soft, so the TV doesn't float).
  const [sc, sg] = makeCanvas(128, 128);
  const grad = sg.createRadialGradient(64, 64, 20, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.75)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  sg.fillStyle = grad;
  sg.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(TV.w + 0.3, TV.h + 0.3), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
  shadow.position.set(TV.x + 0.03, TV.y - 0.05, -2.196);
  group.add(shadow);

  // The screen.
  const screen = createScreen(tier);
  const screenMat = new THREE.MeshBasicMaterial({ map: screen.tex, color: 0x000000, fog: false, toneMapped: true });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(TV.w, TV.h), screenMat);
  panel.position.set(TV.x, TV.y, TV.z + 0.0135);
  group.add(panel);

  const neon = buildNeon();
  group.add(neon);

  let light = null;
  if (tier === 2) {
    light = new THREE.PointLight(0x9fc0ff, 0, 4.5, 1.6);
    light.position.set(TV.x, 1.55, -1.3);
    group.add(light);
  }

  let shown = 0;
  const api = {
    group,
    pickables: [panel],
    input: () => screen.state.input,
    setInput: (name) => screen.setInput(name),
    update(dt, time, env) {
      const power = env.power ?? 1;
      screen.tick(dt, time, env.reduced);
      // Screen glow: slight overdrive, a touch brighter after hours.
      const target = screen.state.brightness * (1.15 + 0.12 * (env.afterHours || 0)) * power;
      shown += (target - shown) * Math.min(1, dt * 10);
      screenMat.color.setScalar(shown);
      const game = screen.state.input === 'console';
      X.blue.color.setRGB(0.25, 0.55, 1.6).multiplyScalar(power * (game ? 1.6 : 0.45));
      const since = env.since === null || env.since === undefined ? null : env.since - 1.5;
      neon.material.color.setScalar(neonLevel(since, power, env.reduced) * 1.6 * (env.glow || 1));
      if (light) light.intensity = shown * (0.6 + 1.6 * (env.afterHours || 0)) * (game ? 1.1 : 1);
    },
  };
  window.__tv = api;
  return api;
}
