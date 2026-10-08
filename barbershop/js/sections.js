// Extra page sections: Fade Lab, Cut Book and the pool lounge.
// Everything is built with DOM APIs so copy never goes through innerHTML.

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  setAttrs(node, attrs);
  node.append(...kids.flat().filter((k) => k != null));
  return node;
}

function svg(tag, attrs = {}, ...kids) {
  const node = document.createElementNS(SVG_NS, tag);
  setAttrs(node, attrs);
  node.append(...kids);
  return node;
}

function setAttrs(node, attrs) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
}

const icon = (d) => {
  const s = svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  s.append(svg('path', { d }));
  return s;
};

function sectionHead(eyebrow, title, accent) {
  return el('div', { class: 'section-head', 'data-reveal': true },
    el('p', { class: 'eyebrow', text: eyebrow }),
    el('h2', { class: 'h2' }, title + ' ', el('em', { text: accent })));
}

/* ------------------------------------------------------------ head painting */

// Side-profile head, facing right, painted on a canvas hair by hair so a fade
// reads like the real thing: skin, then stubble, then the guard length.
// Everything is drawn in a 250 x 320 box that starts at (40, 20).
const BOX = { x: 40, y: 20, w: 250, h: 320 };
const SKULL = { cx: 156, cy: 142, rx: 80, ry: 86 };
const NAPE = 262, CROWN = 70;           // the fade is measured between these
const TOP_A0 = Math.PI * 1.12, TOP_A1 = Math.PI * 1.88;
const GUARDS = [
  { label: '#0', mm: 0 }, { label: '#0.5', mm: 1.5 }, { label: '#1', mm: 3 },
  { label: '#1.5', mm: 4.5 }, { label: '#2', mm: 6 }, { label: '#3', mm: 9 }, { label: '#4', mm: 12 },
];
const FADES = {
  low: { label: 'Low', h: 0.2 },
  mid: { label: 'Mid', h: 0.38 },
  high: { label: 'High', h: 0.58 },
  skin: { label: 'Skin', h: 0.38 },
};
// Sides before the barber starts: grown out all over.
const UNCUT = { fade: 0, side: 14, base: 28, skin: false };

const HEAD_D = 'M96 262C74 226 62 170 78 120C92 70 140 50 186 56C222 62 244 92 242 128L250 156C254 166 264 182 268 192C266 197 258 199 252 201C255 207 256 213 252 217C256 224 252 231 247 236C243 254 226 262 204 260C196 274 192 296 194 330L112 330C112 300 106 280 96 262Z';
const SIDES_D = 'M94 258C72 220 62 168 78 120C92 72 138 52 186 58C210 62 226 78 234 100L222 110C214 130 212 156 210 186L200 188C196 170 178 160 160 160C138 162 124 186 128 214C116 232 106 248 94 258Z';
const EAR_D = 'M156 170C142 168 136 184 140 200C143 212 152 220 162 216C170 212 168 200 166 190C164 180 166 172 156 170Z';

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hair length in mm at height h (0 at the nape, 1 at the crown): the bottom
// of the fade, a smooth blend, then the guard length above the line.
function lengthAt(s, h) {
  const b0 = Math.max(0.02, s.fade - 0.16), b1 = s.fade + 0.06;
  const base = s.skin ? 0 : 0.5 * s.base;
  if (h >= b1) return s.side;
  if (h <= b0) return base;
  return base + (s.side - base) * smooth((h - b0) / (b1 - b0));
}
// How dark the scalp reads under hair of a given length.
const toneOf = (mm) => (mm <= 0 ? 0 : 0.36 + 0.58 * Math.min(1, mm / 8) ** 0.6);

// One strand per ~1.3 units across the sides, laid down and back like real
// growth. Computed once and shared by every head on the page.
let STRANDS = null;
function sideStrands() {
  if (STRANDS) return STRANDS;
  const ctx = document.createElement('canvas').getContext('2d');
  const sides = new Path2D(SIDES_D);
  const r = rng(7);
  STRANDS = [];
  for (let y = 54; y < 262; y += 1.2) {
    for (let x = 64; x < 238; x += 1.2) {
      const px = x + (r() - 0.5) * 1.2, py = y + (r() - 0.5) * 1.2;
      if (!ctx.isPointInPath(sides, px, py)) continue;
      // Thin the hair out toward the edge of the region so the hairline,
      // sideburn and nape feather instead of ending in a hard line.
      let inside = 0;
      for (let j = 0; j < 8; j++) inside += ctx.isPointInPath(sides, px + Math.cos(j * 0.785) * 4, py + Math.sin(j * 0.785) * 4) ? 1 : 0;
      const edge = smooth((inside / 8 - 0.35) / 0.65);
      if (r() > 0.25 + 0.75 * edge) continue;
      const front = smooth((px - 186) / 36), crown = smooth((110 - py) / 40);
      const a = Math.PI * (0.66 - 0.16 * front - 0.3 * crown) + (r() - 0.5) * 0.55;
      STRANDS.push({ x: px, y: py, h: (NAPE - py) / (NAPE - CROWN), dx: Math.cos(a), dy: Math.sin(a), k: (0.7 + r() * 0.6) * (0.55 + 0.45 * edge), hi: r() < 0.13 });
    }
  }
  return STRANDS;
}

function topPoint(s, t, f, jig = 0) {
  const thick = 3 + s.top * 4.2;
  const a = TOP_A0 + (TOP_A1 - TOP_A0) * t;
  const taper = Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.55;
  const lift = s.lift * Math.exp(-((t - 0.86) ** 2) / 0.012);
  const d = -6 + (thick * taper + lift + 6) * f + jig;
  return [SKULL.cx + Math.cos(a) * (SKULL.rx + d) + s.sweep * t * thick * 0.3 * f, SKULL.cy + Math.sin(a) * (SKULL.ry + d)];
}

// Outline of the top hair: an offset of the skull that tapers at the crown
// and the hairline, with lift at the front for quiffs and pomps.
function topPath(s) {
  const n = 46, outer = [], inner = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const jag = s.texture ? (i % 2 ? -1 : 1) * s.texture * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.55 : 0;
    outer.push(topPoint(s, t, 1, jag));
    inner.push(topPoint(s, t, 0));
  }
  const fmt = (p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  return `M${outer.map(fmt).join('L')}L${inner.reverse().map(fmt).join('L')}Z`;
}

const PATHS = {};
const path = (k, d) => (PATHS[k] ||= new Path2D(d));

function paintSkin(ctx) {
  const head = path('head', HEAD_D);
  const g = ctx.createLinearGradient(80, 60, 260, 300);
  g.addColorStop(0, '#d9b08a'); g.addColorStop(0.55, '#b88a63'); g.addColorStop(1, '#7c5638');
  ctx.fillStyle = g;
  ctx.fill(head);
  ctx.save();
  ctx.clip(head);
  // Key light from the front, falloff to the back of the skull and neck.
  const key = ctx.createRadialGradient(232, 150, 4, 232, 150, 150);
  key.addColorStop(0, 'rgba(255,226,196,0.42)'); key.addColorStop(1, 'rgba(255,226,196,0)');
  ctx.fillStyle = key; ctx.fillRect(40, 20, 250, 320);
  const back = ctx.createLinearGradient(60, 0, 170, 0);
  back.addColorStop(0, 'rgba(36,16,8,0.55)'); back.addColorStop(1, 'rgba(36,16,8,0)');
  ctx.fillStyle = back; ctx.fillRect(40, 20, 250, 320);
  const neck = ctx.createRadialGradient(176, 268, 2, 176, 268, 60);
  neck.addColorStop(0, 'rgba(40,18,8,0.6)'); neck.addColorStop(1, 'rgba(40,18,8,0)');
  ctx.fillStyle = neck; ctx.fillRect(40, 20, 250, 320);
  const cheek = ctx.createRadialGradient(230, 196, 1, 230, 196, 22);
  cheek.addColorStop(0, 'rgba(200,92,70,0.18)'); cheek.addColorStop(1, 'rgba(200,92,70,0)');
  ctx.fillStyle = cheek; ctx.fillRect(40, 20, 250, 320);
  ctx.restore();
}

function paintScalp(ctx, s) {
  const g = ctx.createLinearGradient(0, NAPE, 0, CROWN);
  for (let i = 0; i <= 24; i++) {
    const h = i / 24;
    g.addColorStop(h, `rgba(26,19,15,${toneOf(lengthAt(s, h)).toFixed(3)})`);
  }
  ctx.fillStyle = g;
  ctx.fillRect(40, 20, 250, 320);
}

// Strands are batched by opacity so the whole side is a dozen strokes.
function paintStrands(ctx, s, cut) {
  const B = 10, dark = Array.from({ length: B }, () => new Path2D()), light = Array.from({ length: B }, () => new Path2D());
  for (const p of sideStrands()) {
    const st = cut && p.y < cut.y ? cut.prev : s;
    const mm = lengthAt(st, p.h);
    if (mm <= 0.05) continue;
    const len = (0.55 + mm * 0.5) * p.k;
    const a = Math.min(0.99, 0.2 + mm * 0.085);
    const b = Math.min(B - 1, Math.floor(a * B));
    const P = (p.hi ? light : dark)[b];
    P.moveTo(p.x, p.y);
    P.lineTo(p.x + p.dx * len, p.y + p.dy * len);
  }
  ctx.lineCap = 'round';
  for (let b = 0; b < B; b++) {
    const a = (b + 0.5) / B;
    ctx.lineWidth = 0.55;
    ctx.strokeStyle = `rgba(10,7,5,${a.toFixed(2)})`;
    ctx.stroke(dark[b]);
    ctx.lineWidth = 0.45;
    ctx.strokeStyle = `rgba(122,90,62,${(a * 0.8).toFixed(2)})`;
    ctx.stroke(light[b]);
  }
}

function paintEar(ctx) {
  const ear = path('ear', EAR_D);
  ctx.save();
  ctx.shadowColor = 'rgba(30,12,4,0.55)'; ctx.shadowBlur = 6 * ctx.__k; ctx.shadowOffsetX = -2 * ctx.__k;
  const g = ctx.createRadialGradient(158, 188, 2, 154, 194, 30);
  g.addColorStop(0, '#d2a47b'); g.addColorStop(1, '#8a6043');
  ctx.fillStyle = g;
  ctx.fill(ear);
  ctx.restore();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(70,36,18,0.6)'; ctx.lineWidth = 1.3;
  ctx.stroke(path('ear-in', 'M156 180C149 182 147 194 151 203C153 208 157 210 160 208'));
  ctx.strokeStyle = 'rgba(70,36,18,0.35)'; ctx.lineWidth = 1;
  ctx.stroke(path('ear-in2', 'M158 190C155 192 155 198 158 200'));
  ctx.strokeStyle = 'rgba(255,220,190,0.35)'; ctx.lineWidth = 0.8;
  ctx.stroke(path('ear-rim', 'M160 172C166 176 166 186 167 194'));
}

function paintTop(ctx, s) {
  const top = new Path2D(topPath(s));
  const g = ctx.createLinearGradient(80, 0, 250, 0);
  g.addColorStop(0, '#0a0705'); g.addColorStop(0.55, '#1b130d'); g.addColorStop(1, '#33251a');
  ctx.fillStyle = g;
  ctx.fill(top);
  ctx.save();
  ctx.clip(top);
  const hl = ctx.createRadialGradient(204, 60, 2, 204, 60, 74);
  hl.addColorStop(0, s.slick ? 'rgba(255,220,236,0.4)' : 'rgba(170,124,82,0.36)'); hl.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = hl; ctx.fillRect(60, 0, 230, 170);
  const r = rng(11);
  const count = 80 + Math.round(s.top * 16);
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const f = 0.04 + r() * 0.96, t0 = r() * 0.6, t1 = Math.min(1, t0 + 0.25 + r() * 0.5), jig = (r() - 0.5) * 1.4;
    ctx.beginPath();
    for (let j = 0; j <= 12; j++) {
      const [x, y] = topPoint(s, t0 + (t1 - t0) * j / 12, f, jig);
      j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    const hi = r() < 0.34;
    ctx.strokeStyle = hi ? (s.slick ? 'rgba(255,214,232,0.42)' : 'rgba(156,112,72,0.5)') : 'rgba(4,3,2,0.55)';
    ctx.lineWidth = 0.45 + r() * 0.75;
    ctx.stroke();
  }
  ctx.restore();
  // Point-cut tips break the outline on textured styles.
  if (s.texture) {
    ctx.strokeStyle = 'rgba(30,21,14,0.9)'; ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (let i = 0; i < 40; i++) {
      const t = 0.08 + r() * 0.86;
      const [x, y] = topPoint(s, t, 1);
      const [x2, y2] = topPoint(s, Math.min(1, t + 0.02), 1, 1.5 + r() * s.texture * 1.6);
      ctx.moveTo(x, y); ctx.lineTo(x2, y2);
    }
    ctx.stroke();
  }
}

function paintFace(ctx) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(20,12,8,0.9)'; ctx.lineWidth = 3.2;
  ctx.stroke(path('brow', 'M213 121C221 116 231 116 239 121'));
  ctx.strokeStyle = 'rgba(20,12,8,0.5)'; ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let i = 0; i < 14; i++) { const x = 214 + i * 1.8; ctx.moveTo(x, 121 - Math.sin(i / 13 * Math.PI) * 4); ctx.lineTo(x + 2.4, 118 - Math.sin(i / 13 * Math.PI) * 4); }
  ctx.stroke();
  ctx.fillStyle = '#efe2d6';
  ctx.fill(path('eye', 'M230 140C234 136.5 239 136.5 242.5 139.5C239 142.5 234 142.5 230 140Z'));
  ctx.fillStyle = '#2a1a10';
  ctx.beginPath(); ctx.arc(239.6, 139.6, 2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(25,14,8,0.95)'; ctx.lineWidth = 1.2;
  ctx.stroke(path('lid', 'M229 140C233 136 239 135.6 243 139'));
  ctx.strokeStyle = 'rgba(90,52,30,0.5)'; ctx.lineWidth = 0.9;
  ctx.stroke(path('lid2', 'M231 134.5C235 132.5 239 132.6 242 134.5'));
  ctx.strokeStyle = 'rgba(96,48,28,0.65)'; ctx.lineWidth = 1.1;
  ctx.stroke(path('nostril', 'M253 195C256 196.5 258 198.5 257.5 200.5'));
  ctx.strokeStyle = 'rgba(80,32,22,0.8)'; ctx.lineWidth = 1.2;
  ctx.stroke(path('mouth', 'M252 217C249 218 246 218.2 243 217.4'));
  ctx.strokeStyle = 'rgba(60,30,16,0.45)'; ctx.lineWidth = 1.4;
  ctx.stroke(path('jaw', 'M222 241C214 236 209 229 209 222'));
}

function paintRim(ctx) {
  const head = path('head', HEAD_D);
  ctx.save();
  ctx.lineWidth = 1.6;
  const pink = ctx.createLinearGradient(60, 0, 160, 0);
  pink.addColorStop(0, 'rgba(255,79,163,0.95)'); pink.addColorStop(1, 'rgba(255,79,163,0)');
  ctx.strokeStyle = pink; ctx.shadowColor = '#ff4fa3'; ctx.shadowBlur = 10 * ctx.__k;
  ctx.stroke(head);
  const warm = ctx.createLinearGradient(200, 0, 270, 0);
  warm.addColorStop(0, 'rgba(255,214,170,0)'); warm.addColorStop(1, 'rgba(255,214,170,0.7)');
  ctx.strokeStyle = warm; ctx.shadowColor = 'rgba(255,190,130,0.6)'; ctx.shadowBlur = 6 * ctx.__k; ctx.lineWidth = 1.1;
  ctx.stroke(head);
  ctx.restore();
}

function paintFadeLine(ctx, s) {
  if (s.fade < 0.05) return;
  const y = NAPE - s.fade * (NAPE - CROWN);
  ctx.save();
  ctx.setLineDash([3.2, 2.6]);
  ctx.beginPath(); ctx.moveTo(44, y); ctx.lineTo(206, y);
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,79,163,0.22)'; ctx.stroke();
  ctx.lineWidth = 1; ctx.strokeStyle = '#ff8cc8'; ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#ffd1e8';
  ctx.font = '700 6.4px "Hanken Grotesk", system-ui, sans-serif';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '1.2px';
  ctx.fillText('FADE LINE', 45, y - 4);
  ctx.restore();
}

function paintClipper(ctx, c) {
  ctx.save();
  ctx.translate(c.x + (c.buzz ? (Math.random() - 0.5) * 0.7 : 0), c.y);
  ctx.rotate(-0.22);
  ctx.strokeStyle = 'rgba(20,20,20,0.9)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 50); ctx.bezierCurveTo(4, 70, -16, 74, -10, 110); ctx.stroke();
  const body = ctx.createLinearGradient(-10, 0, 10, 0);
  body.addColorStop(0, '#060606'); body.addColorStop(0.45, '#2c2c2e'); body.addColorStop(1, '#0b0b0c');
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.roundRect(-9.5, 2, 19, 50, [4, 4, 8, 8]); ctx.fill();
  ctx.fillStyle = '#c9a24f';
  ctx.fillRect(-9.5, 30, 19, 2.4);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(-6, 6, 2, 22);
  ctx.fillStyle = 'rgba(255,79,163,0.3)';
  ctx.beginPath(); ctx.arc(3.5, 14, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff6fb5';
  ctx.beginPath(); ctx.arc(3.5, 14, 1.3, 0, Math.PI * 2); ctx.fill();
  const blade = ctx.createLinearGradient(-11, 0, 11, 0);
  blade.addColorStop(0, '#8d9298'); blade.addColorStop(0.5, '#f1f3f5'); blade.addColorStop(1, '#7a7f86');
  ctx.fillStyle = blade;
  ctx.beginPath(); ctx.roundRect(-11, -5, 22, 8, 1.5); ctx.fill();
  ctx.strokeStyle = '#d7dade'; ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let x = -10; x <= 10; x += 1.7) { ctx.moveTo(x, -5); ctx.lineTo(x, -7.4); }
  ctx.stroke();
  ctx.restore();
}

function paintClippings(ctx, parts) {
  ctx.strokeStyle = 'rgba(14,9,6,0.85)'; ctx.lineWidth = 0.55; ctx.lineCap = 'round';
  ctx.beginPath();
  for (const p of parts) {
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(p.a) * p.l, p.y + Math.sin(p.a) * p.l);
  }
  ctx.stroke();
}

// Builds one head and returns draw(style, cut). `cut` paints the clipper at
// work: below cut.y the new style, above it cut.prev.
function createHead({ size = 'lg' } = {}) {
  const canvas = el('canvas', { class: `head head-${size}`, width: BOX.w, height: BOX.h, 'aria-hidden': 'true' });
  const ctx = canvas.getContext('2d');
  let last = null;

  // Skin below the hair, and ear, face and neon rim above it, never change:
  // they are painted once per size. The stubble shadow is masked by a
  // pre-blurred copy of the hair region so its edges stay soft.
  const L = { w: 0, h: 0 };
  function layer() {
    const c = document.createElement('canvas');
    c.width = canvas.width; c.height = canvas.height;
    const x = c.getContext('2d');
    x.__k = canvas.width / BOX.w;
    x.setTransform(x.__k, 0, 0, x.__k, -BOX.x * x.__k, -BOX.y * x.__k);
    return x;
  }
  function layers() {
    if (L.w === canvas.width && L.h === canvas.height) return;
    L.w = canvas.width; L.h = canvas.height;
    L.under = layer(); paintSkin(L.under);
    L.over = layer(); paintEar(L.over); paintFace(L.over); paintRim(L.over);
    L.mask = layer();
    if ('filter' in L.mask) L.mask.filter = `blur(${(1.6 * L.mask.__k).toFixed(1)}px)`;
    L.mask.fillStyle = '#fff'; L.mask.fill(path('sides', SIDES_D));
    L.tmp = layer();
  }
  const blit = (x) => { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(x.canvas, 0, 0); ctx.restore(); };

  function draw(s, cut = null) {
    last = [s, cut];
    layers();
    const k = canvas.width / BOX.w;
    ctx.__k = k;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(k, 0, 0, k, -BOX.x * k, -BOX.y * k);
    blit(L.under);
    const t = L.tmp;
    t.save(); t.setTransform(1, 0, 0, 1, 0, 0); t.clearRect(0, 0, t.canvas.width, t.canvas.height); t.restore();
    if (cut?.prev) {
      for (const [st, y0, y1] of [[cut.prev, 0, cut.y], [s, cut.y, 400]]) {
        t.save(); t.beginPath(); t.rect(0, y0, 400, y1 - y0); t.clip(); paintScalp(t, st); t.restore();
      }
    } else paintScalp(t, s);
    t.save(); t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = 'destination-in'; t.drawImage(L.mask.canvas, 0, 0); t.restore();
    blit(t);
    paintStrands(ctx, s, cut?.prev ? cut : null);
    paintTop(ctx, s);
    blit(L.over);
    // Let the neck dissolve into the booth instead of ending in a cut.
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    const fadeOut = ctx.createLinearGradient(0, 286, 0, 334);
    fadeOut.addColorStop(0, 'rgba(0,0,0,0)'); fadeOut.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = fadeOut; ctx.fillRect(40, 280, 250, 60);
    ctx.restore();
    if (size === 'lg') paintFadeLine(ctx, s);
    if (cut?.parts?.length) paintClippings(ctx, cut.parts);
    if (cut?.clipper) paintClipper(ctx, cut.clipper);
  }

  // Keep the backing store sharp at any size.
  const fit = () => {
    const w = canvas.clientWidth;
    if (!w) return;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const W = Math.round(w * dpr), H = Math.round(W * BOX.h / BOX.w);
    if (W === canvas.width && H === canvas.height) return;
    canvas.width = W; canvas.height = H;
    if (last) draw(...last);
  };
  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(canvas);
  return { root: canvas, draw, fit };
}

/* --------------------------------------------------------------- fade lab */

const PRESETS = [
  { label: 'Skin fade', fade: 'skin', guard: 2, top: 3 },
  { label: 'Classic mid', fade: 'mid', guard: 4, top: 4 },
  { label: 'Low taper', fade: 'low', guard: 5, top: 5 },
  { label: 'High & tight', fade: 'high', guard: 1, top: 2 },
  { label: 'Fade + quiff', fade: 'mid', guard: 3, top: 7 },
];

function fadeAdvice({ fade, guard, top }) {
  const f = FADES[fade], g = GUARDS[guard];
  const name = fade === 'skin' ? 'Mid skin fade' : `${f.label} fade`;
  const into = fade === 'skin' ? `shaved to skin into a ${g.label}` : g.mm === 0 ? 'a #0 all through the sides' : `#0 into a ${g.label}`;
  const finish = top >= 6 ? 'scissor-cut and textured' : top <= 2 ? 'clipper-cut and squared off' : 'scissor-finished on top';
  const weeks = { skin: [2, 2], low: [3, 3], mid: [3, 3], high: [3, 4] }[fade].map((w) => w + (top >= 6 ? 1 : 0));
  const service = fade === 'skin' || g.mm === 0 ? 'fade' : top >= 6 ? 'scissor' : 'signature';
  return {
    ask: `${name}, ${into}, ${top} cm on top, ${finish}.`,
    sharp: weeks[0] === weeks[1] ? `About ${weeks[0]} weeks` : `About ${weeks[0]} to ${weeks[1]} weeks`,
    why: fade === 'skin' ? 'Bare skin shows regrowth first.' : top >= 6 ? 'A longer top hides the regrowth for longer.' : fade === 'high' ? 'A high line takes longer to soften.' : 'The blend softens after the third week.',
    service,
  };
}

function buildFadeLab(section, { SERVICES, reduced }) {
  const state = { fade: 'mid', guard: 4, top: 4 };
  const head = createHead({ size: 'lg' });
  const svcName = (id) => SERVICES.find((s) => s.id === id)?.name || id;

  const presetRow = el('div', { class: 'fl-presets', role: 'group', 'aria-label': 'Start from a classic' },
    PRESETS.map((p, i) => el('button', { type: 'button', class: 'fl-preset', 'data-preset': i, 'aria-pressed': 'false', text: p.label })));
  const fadeGroup = el('div', { class: 'fl-seg', role: 'group', 'aria-label': 'Fade height' },
    Object.entries(FADES).map(([k, f]) => el('button', { type: 'button', class: 'fl-seg-btn', 'data-fade': k, 'aria-pressed': String(k === state.fade), text: f.label })));
  const guardGroup = el('div', { class: 'fl-guards', role: 'group', 'aria-label': 'Guard on the sides' },
    GUARDS.map((g, i) => el('button', { type: 'button', class: 'fl-guard', 'data-guard': i, 'aria-pressed': String(i === state.guard), style: `--len:${(g.mm / 12).toFixed(2)}` },
      el('i', { class: 'fl-guard-bar', 'aria-hidden': 'true' }), el('b', { text: g.label }), el('span', { text: `${g.mm} mm` }))));
  const range = el('input', { type: 'range', id: 'fl-top', min: 1, max: 10, step: 1, value: state.top, class: 'fl-range' });
  const topOut = el('output', { for: 'fl-top', class: 'fl-out' });

  const ask = el('p', { class: 'fl-ask', 'aria-live': 'polite' });
  const sharp = el('strong', { class: 'fl-sharp' });
  const why = el('span', { class: 'fl-why' });
  const svcLabel = el('span', { class: 'fl-svc' });
  const book = el('button', { type: 'button', class: 'btn btn-brass fl-book', 'data-cursor': 'Book' }, 'Book this cut', icon('M5 12h14M13 6l6 6-6 6'));
  const readout = el('p', { class: 'fl-readout', 'aria-hidden': 'true' });
  const replay = el('button', { type: 'button', class: 'fl-replay', 'data-cursor': 'Cut' }, icon('M6 4l14 8-14 8z'), 'Watch the cut');

  const stage = el('figure', { class: 'fl-stage', 'data-reveal': true },
    el('div', { class: 'fl-ring', 'aria-hidden': 'true' }),
    el('div', { class: 'fl-spot', 'aria-hidden': 'true' }),
    head.root,
    readout,
    replay,
    el('figcaption', { class: 'sx-sr', text: 'Side profile painted hair by hair, showing the fade you build.' }));

  const controls = el('div', { class: 'fl-panel', 'data-reveal': true },
    el('div', { class: 'fl-field' }, el('p', { class: 'fl-label', text: 'Start from a classic' }), presetRow),
    el('div', { class: 'fl-field' }, el('p', { class: 'fl-label', text: 'Fade height' }), fadeGroup),
    el('div', { class: 'fl-field' }, el('p', { class: 'fl-label', text: 'Guard on the sides' }), guardGroup),
    el('div', { class: 'fl-field' },
      el('div', { class: 'fl-label-row' }, el('label', { class: 'fl-label', for: 'fl-top', text: 'Length on top' }), topOut),
      range,
      el('div', { class: 'fl-scale', 'aria-hidden': 'true' }, el('span', { text: '1 cm' }), el('span', { text: '10 cm' }))));

  const card = el('div', { class: 'fl-card', 'data-reveal': true },
    el('p', { class: 'fl-card-k', text: 'Ask for' }), ask,
    el('div', { class: 'fl-card-row' },
      el('div', {}, el('p', { class: 'fl-card-k', text: 'Stays sharp' }), sharp, why),
      el('div', {}, el('p', { class: 'fl-card-k', text: 'Book as' }), svcLabel)),
    book);

  section.append(el('div', { class: 'wrap fl-wrap' },
    el('div', { class: 'fl-side' },
      el('div', { class: 'fl-intro' },
        sectionHead('Fade lab', 'Build your fade.', 'Then ask for it.'),
        el('p', { class: 'fl-lede', 'data-reveal': true, text: 'Pick the height, the guard and the length on top, and watch the clipper cut it in. The card turns it into words your barber uses.' })),
      el('div', { class: 'fl-grid' }, stage, el('div', { class: 'fl-col' }, controls, card)))));

  // Sides change with a clipper pass from the nape up; the top tweens.
  const sideOf = () => ({ fade: FADES[state.fade].h, side: GUARDS[state.guard].mm, base: 1, skin: state.fade === 'skin' });
  let shownSide = reduced ? sideOf() : { ...UNCUT };
  let top = state.top;
  let pass = null;
  const parts = [];
  let raf = 0;
  const topStyle = () => ({ top, lift: top * 0.8, sweep: 0.4, texture: top >= 6 ? 1.6 : 0, slick: false });

  function cutTo(from, to, dur = 1250) {
    if (reduced) { shownSide = to; kick(); return; }
    pass = { from, to, t0: performance.now(), dur };
    kick();
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  let lastNow = 0;
  function frame(now) {
    raf = 0;
    const f = lastNow ? Math.min(4, (now - lastNow) / 16.7) : 1;
    lastNow = now;
    let busy = false;
    const dt = state.top - top;
    if (Math.abs(dt) > 0.01 && !reduced) { top += dt * 0.14; busy = true; } else top = state.top;
    const ts = topStyle();
    let cut = { parts };
    if (pass) {
      const p = Math.min(1, (now - pass.t0) / pass.dur);
      const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
      const yTop = NAPE - (Math.max(pass.from.fade, pass.to.fade) + 0.2) * (NAPE - CROWN);
      const y = NAPE + 12 + (yTop - NAPE - 12) * e;
      const x = 116 + Math.sin(p * Math.PI * 5) * 7;
      cut = { y, prev: { ...pass.from, ...ts }, parts, clipper: { x, y, buzz: true } };
      if (p < 1) {
        for (let i = 0; i < 3; i++) {
          parts.push({ x: x - 34 + Math.random() * 68, y: y - 2, vx: (Math.random() - 0.7) * 0.7, vy: -0.3 - Math.random() * 0.8, a: Math.random() * Math.PI, va: (Math.random() - 0.5) * 0.3, l: 1.2 + Math.random() * 2.2, life: 70 });
        }
      } else { shownSide = pass.to; pass = null; cut = { parts }; }
      busy = true;
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i];
      q.vy += 0.06 * f; q.x += q.vx * f; q.y += q.vy * f; q.a += q.va * f;
      if ((q.life -= f) <= 0 || q.y > 345) parts.splice(i, 1);
    }
    if (parts.length) busy = true;
    head.draw({ ...(pass ? pass.to : shownSide), ...ts }, cut);
    if (busy) raf = requestAnimationFrame(frame); else lastNow = 0;
  }

  function update(sidesChanged) {
    const a = fadeAdvice(state);
    ask.textContent = a.ask;
    sharp.textContent = a.sharp;
    why.textContent = a.why;
    svcLabel.textContent = svcName(a.service);
    book.dataset.bookService = a.service;
    topOut.textContent = `${state.top} cm`;
    readout.textContent = `${state.fade === 'skin' ? 'Skin' : FADES[state.fade].label} fade · ${GUARDS[state.guard].label} sides · ${state.top} cm top`;
    range.value = String(state.top);
    range.setAttribute('aria-valuetext', `${state.top} centimetres`);
    fadeGroup.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fade === state.fade)));
    guardGroup.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.guard === state.guard)));
    presetRow.querySelectorAll('button').forEach((b) => {
      const p = PRESETS[+b.dataset.preset];
      b.setAttribute('aria-pressed', String(p.fade === state.fade && p.guard === state.guard && p.top === state.top));
    });
    stage.style.setProperty('--fill', String((state.top - 1) / 9));
    if (sidesChanged) cutTo(pass ? pass.to : shownSide, sideOf());
    else kick();
  }

  presetRow.addEventListener('click', (e) => {
    const b = e.target.closest('[data-preset]');
    if (!b) return;
    const p = PRESETS[+b.dataset.preset];
    const sides = p.fade !== state.fade || p.guard !== state.guard;
    Object.assign(state, { fade: p.fade, guard: p.guard, top: p.top });
    update(sides);
  });
  fadeGroup.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fade]');
    if (b && b.dataset.fade !== state.fade) { state.fade = b.dataset.fade; update(true); }
  });
  guardGroup.addEventListener('click', (e) => {
    const b = e.target.closest('[data-guard]');
    if (b && +b.dataset.guard !== state.guard) { state.guard = +b.dataset.guard; update(true); }
  });
  range.addEventListener('input', () => { state.top = +range.value; update(false); });
  replay.addEventListener('click', () => cutTo({ ...UNCUT }, sideOf(), 1700));

  update(false);
  head.fit();
  // First time the head is on screen, the barber cuts it in.
  if (!reduced && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      setTimeout(() => cutTo({ ...UNCUT }, sideOf(), 1700), 450);
    }, { threshold: 0.45 });
    io.observe(stage);
  } else {
    shownSide = sideOf();
    kick();
  }
}

/* --------------------------------------------------------------- cut book */

const CUTS = [
  { name: 'Crew Cut', ask: '#2 on the sides tapered to a #1 at the neck, 2 cm on top, cut to fall forward.', back: 'Every 3 weeks', suits: 'Thick or coarse hair. Square and oval faces.', service: 'signature', hair: { fade: 0.3, side: 6, top: 2, lift: 1, sweep: 0.2 } },
  { name: 'French Crop', ask: 'Low skin fade into a #2, 3 cm on top with a short blunt fringe.', back: 'Every 2 to 3 weeks', suits: 'Fine or thinning hair. Long and oval faces.', service: 'fade', hair: { fade: 0.22, side: 6, top: 3, lift: 0, sweep: 1.6, skin: true, texture: 1 } },
  { name: 'Taper Fade', ask: 'Taper from a #1 at the nape to a #3, 4 cm on top, scissor-finished.', back: 'Every 3 weeks', suits: 'Most hair types. Works on any face shape.', service: 'signature', hair: { fade: 0.16, side: 9, top: 4, lift: 3, sweep: 0.4 } },
  { name: 'Pompadour', ask: 'Mid fade, #0 into a #2, 8 cm on top swept up and back.', back: 'Every 3 to 4 weeks', suits: 'Thick, straight or wavy hair. Round and square faces.', service: 'scissor', hair: { fade: 0.38, side: 6, top: 8, lift: 14, sweep: -0.6, slick: true } },
  { name: 'Buzz Cut', ask: 'One length all over with a #2, neckline squared off.', back: 'Every 2 weeks', suits: 'Any hair type. Strong jaws and oval faces.', service: 'signature', hair: { fade: 0.6, side: 6, top: 1, lift: 0, sweep: 0 } },
  { name: 'Textured Quiff', ask: 'High fade, #0 into a #1.5, 6 cm on top, point-cut and pushed up.', back: 'Every 3 to 4 weeks', suits: 'Medium to thick hair. Round and oval faces.', service: 'scissor', hair: { fade: 0.58, side: 4.5, top: 6, lift: 9, sweep: 0.3, texture: 2.6 } },
  { name: 'Slick Back', ask: 'Low taper with a #3, 9 cm on top, combed straight back with pomade.', back: 'Every 4 weeks', suits: 'Straight or wavy hair. Long and square faces.', service: 'scissor', hair: { fade: 0.2, side: 9, top: 9, lift: 4, sweep: -1.4, slick: true } },
  { name: 'Caesar', ask: 'Mid fade, #0 into a #1, 2 cm on top with a short straight fringe.', back: 'Every 2 to 3 weeks', suits: 'Thinning or receding hair. Oval and heart faces.', service: 'fade', hair: { fade: 0.4, side: 3, top: 2, lift: 0, sweep: 1.2 } },
];

function cutCard(cut, i) {
  const head = createHead({ size: 'sm' });
  head.draw({ base: 1, texture: 0, slick: false, skin: false, ...cut.hair });
  return el('article', { class: 'cb-card', 'data-index': i, 'aria-roledescription': 'card', 'aria-label': `${cut.name}, ${i + 1} of ${CUTS.length}` },
    el('div', { class: 'cb-card-top' },
      el('span', { class: 'cb-no', text: String(i + 1).padStart(2, '0') }),
      el('h3', { class: 'cb-name', text: cut.name })),
    el('div', { class: 'cb-art' }, head.root),
    el('dl', { class: 'cb-facts' },
      el('div', {}, el('dt', { text: 'Ask for' }), el('dd', { text: cut.ask })),
      el('div', {}, el('dt', { text: 'Come back' }), el('dd', { text: cut.back })),
      el('div', {}, el('dt', { text: 'Suits' }), el('dd', { text: cut.suits }))),
    el('button', { type: 'button', class: 'btn btn-brass btn-small cb-book', 'data-book-service': cut.service, 'data-cursor': 'Book', tabindex: '-1' }, `Book the ${cut.name}`));
}

function buildCutBook(section, { reduced }) {
  const cards = CUTS.map(cutCard);
  const deck = el('div', { class: 'cb-deck', tabindex: '0', role: 'region', 'aria-roledescription': 'card deck', 'aria-label': 'Classic cuts. Use the arrow keys to flip cards.' }, cards);
  const counter = el('p', { class: 'cb-count', 'aria-live': 'polite' });
  const prev = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Previous cut' }, icon('M15 5l-7 7 7 7'));
  const next = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Next cut' }, icon('M9 5l7 7-7 7'));

  section.append(el('div', { class: 'wrap cb-wrap' },
    el('div', { class: 'cb-copy' },
      sectionHead('Cut book', 'Eight classics.', 'Pick one.'),
      el('p', { class: 'cb-lede', 'data-reveal': true, text: 'Swipe through the cuts we do most. Each card gives you the exact words, guard numbers included.' }),
      el('p', { class: 'cb-hint', 'data-reveal': true, text: 'Drag the top card or use the arrows.' })),
    el('div', { class: 'cb-stage', 'data-reveal': true },
      deck,
      el('div', { class: 'cb-nav' }, prev, counter, next))));

  let order = cards.map((_, i) => i);
  let busy = false;

  function layout() {
    order.forEach((ci, depth) => {
      const c = cards[ci];
      c.style.setProperty('--d', depth);
      c.style.zIndex = String(cards.length - depth);
      c.classList.toggle('is-top', depth === 0);
      c.toggleAttribute('inert', depth !== 0);
      c.querySelector('.cb-book').tabIndex = depth === 0 ? 0 : -1;
    });
    counter.textContent = `${order[0] + 1} / ${cards.length}`;
  }

  // Flings the top card off to one side, then slides it under the deck.
  function advance(dir) {
    if (busy) return;
    const top = cards[order[0]];
    const done = () => {
      order = dir > 0 ? [...order.slice(1), order[0]] : [order.at(-1), ...order.slice(0, -1)];
      top.style.transform = '';
      top.classList.remove('is-flying');
      layout();
      busy = false;
    };
    if (reduced) return done();
    busy = true;
    if (dir > 0) {
      top.classList.add('is-flying');
      top.style.transform = `translate3d(${dir * 120}%, -4%, 60px) rotate(${dir * 18}deg)`;
      setTimeout(done, 380);
    } else {
      // The card comes back from the left: place it there first, then let layout pull it in.
      const back = cards[order.at(-1)];
      order = [order.at(-1), ...order.slice(0, -1)];
      back.classList.add('is-flying');
      back.style.transition = 'none';
      back.style.transform = 'translate3d(-120%, -4%, 60px) rotate(-18deg)';
      back.style.zIndex = String(cards.length + 1);
      back.getBoundingClientRect();
      back.style.transition = '';
      layout();
      back.style.transform = '';
      setTimeout(() => { back.classList.remove('is-flying'); busy = false; }, 420);
    }
  }

  // Drag: follow the finger, tilt with velocity, fling past a threshold.
  let drag = null;
  deck.addEventListener('pointerdown', (e) => {
    const top = cards[order[0]];
    if (busy || !top.contains(e.target) || e.target.closest('button') || e.button > 0) return;
    drag = { x: e.clientX, y: e.clientY, dx: 0, vx: 0, t: performance.now(), card: top, id: e.pointerId };
    top.setPointerCapture(e.pointerId);
    top.classList.add('is-dragging');
  });
  deck.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const now = performance.now();
    const dx = e.clientX - drag.x;
    drag.vx = drag.vx * 0.6 + ((dx - drag.dx) / Math.max(1, now - drag.t)) * 0.4;
    drag.dx = dx;
    drag.t = now;
    const tilt = Math.max(-16, Math.min(16, dx * 0.05 + drag.vx * 6));
    drag.card.style.transform = `translate3d(${dx}px, ${(e.clientY - drag.y) * 0.15}px, 40px) rotate(${tilt}deg)`;
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { card, dx, vx } = drag;
    drag = null;
    card.classList.remove('is-dragging');
    const flung = Math.abs(dx) > Math.min(110, deck.offsetWidth * 0.28) || Math.abs(vx) > 0.6;
    if (!flung) { card.style.transform = ''; return; }
    if (reduced) { card.style.transform = ''; return advance(1); }
    const dir = Math.sign(dx || vx);
    busy = true;
    card.classList.add('is-flying');
    card.style.transform = `translate3d(${dir * 130}%, -4%, 60px) rotate(${dir * 22}deg)`;
    setTimeout(() => { busy = false; card.classList.remove('is-flying'); card.style.transform = ''; order = [...order.slice(1), order[0]]; layout(); }, 360);
  };
  deck.addEventListener('pointerup', endDrag);
  deck.addEventListener('pointercancel', endDrag);

  prev.addEventListener('click', () => advance(-1));
  next.addEventListener('click', () => advance(1));
  deck.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); advance(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); advance(-1); }
  });
  layout();
}

/* ----------------------------------------------------------------- lounge */

function buildLounge(section) {
  const perks = [
    ['Espresso and Greek coffee', 'On the house'],
    ['Cold beer', 'After 6 pm'],
    ['Free Wi-Fi', 'Ask for the code'],
    ['House rule', 'Winner stays on'],
  ];
  section.append(el('div', { class: 'wrap lg-wrap' },
    el('div', { class: 'lg-panel', 'data-no-shoot': true, 'data-reveal': true },
      el('p', { class: 'eyebrow', text: 'The lounge' }),
      el('h2', { class: 'h2 lg-title' }, 'Rack ’em ', el('em', { text: 'while you wait.' })),
      el('p', { class: 'lg-lede', text: 'The table is free and so is the espresso. Walk-ins wait here with the jukebox on.' }),
      el('div', { class: 'lg-actions' },
        el('button', { type: 'button', class: 'btn btn-brass', 'data-pool': 'break', text: 'Break' }),
        el('button', { type: 'button', class: 'btn btn-ghost', 'data-pool': 'rack', text: 'Rack' }),
        el('p', { class: 'lg-hint' }, el('span', { class: 'lg-dot', 'aria-hidden': 'true' }), 'Tap the table to take a shot')),
      el('ul', { class: 'lg-perks' },
        perks.map(([k, v]) => el('li', {}, el('span', { text: k }), el('b', { text: v })))))));
}

export function mountSections(deps) {
  const at = (id) => document.getElementById(id);
  if (at('fade-lab')) buildFadeLab(at('fade-lab'), deps);
  if (at('cut-book')) buildCutBook(at('cut-book'), deps);
  if (at('lounge')) buildLounge(at('lounge'));
}
