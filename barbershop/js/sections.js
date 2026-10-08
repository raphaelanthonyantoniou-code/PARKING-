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

/* ------------------------------------------------------------ head drawing */

// Shared side-profile head, facing right. The hair is described by a few
// numbers so the lab can tween them and the cut book can reuse the drawing.
const SKULL = { cx: 156, cy: 142, rx: 80, ry: 86 };
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

let uid = 0;

// Density of hair for a clipper length: a #0 still shows stubble.
const density = (mm) => 0.34 + Math.min(mm, 12) / 12 * 0.62;

// Outline of the top hair: an offset of the skull ellipse that tapers at the
// crown and the hairline, plus lift at the front for quiffs and pomps.
function topPath(s) {
  const n = 46, a0 = Math.PI * 1.12, a1 = Math.PI * 1.88;
  const thick = 3 + s.top * 4.2;
  const outer = [], inner = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = a0 + (a1 - a0) * t;
    const taper = Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.55;
    const lift = s.lift * Math.exp(-((t - 0.86) ** 2) / 0.012);
    const jag = s.texture ? (i % 2 ? -1 : 1) * s.texture * taper : 0;
    const d = thick * taper + lift + jag;
    const x = Math.cos(a), y = Math.sin(a);
    outer.push([SKULL.cx + x * (SKULL.rx + d) + s.sweep * t * thick * 0.3, SKULL.cy + y * (SKULL.ry + d)]);
    inner.push([SKULL.cx + x * (SKULL.rx - 6), SKULL.cy + y * (SKULL.ry - 6)]);
  }
  const fmt = (p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  return `M${outer.map(fmt).join('L')}L${inner.reverse().map(fmt).join('L')}Z`;
}

// Thin sheen lines that follow the top, at fractions of its thickness.
function sheenPath(s, f) {
  const n = 24, a0 = Math.PI * 1.2, a1 = Math.PI * 1.8;
  const thick = 3 + s.top * 4.2;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = a0 + (a1 - a0) * t;
    const d = (thick * Math.sin(Math.PI * t) ** 0.6 + s.lift * Math.exp(-((t - 0.8) ** 2) / 0.02)) * f;
    pts.push(`${(SKULL.cx + Math.cos(a) * (SKULL.rx + d) + s.sweep * t * thick * 0.3 * f).toFixed(1)} ${(SKULL.cy + Math.sin(a) * (SKULL.ry + d)).toFixed(1)}`);
  }
  return `M${pts.join('L')}`;
}

const HEAD_D = 'M96 262C74 226 62 170 78 120C92 70 140 50 186 56C222 62 244 92 242 128L250 156C254 166 264 182 268 192C266 197 258 199 252 201C255 207 256 213 252 217C256 224 252 231 247 236C243 254 226 262 204 260C196 274 192 296 194 330L112 330C112 300 106 280 96 262Z';
const SIDES_D = 'M94 258C72 220 62 168 78 120C92 72 138 52 186 58C210 62 226 78 234 100L222 110C214 130 212 156 210 186L200 188C196 170 178 160 160 160C138 162 124 186 128 214C116 232 106 248 94 258Z';

// Builds one head and returns a setter that redraws the hair for a style.
function createHead({ size = 'lg' } = {}) {
  const id = `hd${++uid}`;
  const stops = [0, 1, 2, 3].map(() => svg('stop', { 'stop-color': '#17110c' }));
  const root = svg('svg', { class: `head head-${size}`, viewBox: '40 20 250 320', 'aria-hidden': 'true' },
    svg('defs', {},
      svg('linearGradient', { id: `${id}-skin`, x1: '0', y1: '0', x2: '1', y2: '1' },
        svg('stop', { offset: '0', 'stop-color': '#c9a27a' }), svg('stop', { offset: '1', 'stop-color': '#7a5a40' })),
      svg('linearGradient', { id: `${id}-fade`, gradientUnits: 'userSpaceOnUse', x1: '0', y1: '262', x2: '0', y2: '70' }, ...stops),
      svg('linearGradient', { id: `${id}-top`, x1: '0', y1: '0', x2: '1', y2: '0' },
        svg('stop', { offset: '0', 'stop-color': '#120d09' }), svg('stop', { offset: '0.6', 'stop-color': '#241a12' }), svg('stop', { offset: '1', 'stop-color': '#4a3524' }))),
    svg('path', { class: 'head-skin', d: HEAD_D, fill: `url(#${id}-skin)` }));
  const sides = svg('path', { class: 'head-sides', d: SIDES_D, fill: `url(#${id}-fade)` });
  const top = svg('path', { class: 'head-top', fill: `url(#${id}-top)` });
  const sheens = [0.45, 0.75].map((f) => svg('path', { class: 'head-sheen', 'data-f': f, fill: 'none' }));
  const ear = svg('g', { class: 'head-ear' },
    svg('path', { d: 'M156 170C142 168 136 184 140 200C143 212 152 220 162 216C170 212 168 200 166 190C164 180 166 172 156 170Z' }),
    svg('path', { class: 'head-ear-in', d: 'M156 182C150 184 149 194 152 202', fill: 'none' }));
  const lines = svg('g', { class: 'head-lines', fill: 'none' },
    svg('path', { d: 'M214 120C222 117 232 118 238 122' }),
    svg('path', { d: 'M232 142C236 144 240 144 242 142' }),
    svg('path', { d: 'M220 240C214 236 210 230 210 224' }));
  root.append(sides, ear, top, ...sheens, lines, svg('path', { class: 'head-outline', d: HEAD_D, fill: 'none' }));

  function draw(s) {
    // Bottom of the fade, the blend, then the guard length above the line.
    const base = s.skin ? 0 : density(0) * s.base;
    const side = density(s.side);
    const offs = [0, Math.max(0, s.fade - 0.16), s.fade + 0.06, 1];
    const ops = [base * 0.6, base, side, side];
    stops.forEach((st, i) => { st.setAttribute('offset', offs[i].toFixed(3)); st.setAttribute('stop-opacity', ops[i].toFixed(3)); });
    top.setAttribute('d', topPath(s));
    sheens.forEach((p) => p.setAttribute('d', sheenPath(s, +p.dataset.f)));
    root.classList.toggle('is-slick', !!s.slick);
  }
  return { root, draw };
}

/* --------------------------------------------------------------- fade lab */

const TWEEN_KEYS = ['fade', 'side', 'top', 'base'];

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

  const fadeGroup = el('div', { class: 'fl-seg', role: 'group', 'aria-label': 'Fade height' },
    Object.entries(FADES).map(([k, f]) => el('button', { type: 'button', class: 'fl-seg-btn', 'data-fade': k, 'aria-pressed': String(k === state.fade), text: f.label })));
  const guardGroup = el('div', { class: 'fl-guards', role: 'group', 'aria-label': 'Guard on the sides' },
    GUARDS.map((g, i) => el('button', { type: 'button', class: 'fl-guard', 'data-guard': i, 'aria-pressed': String(i === state.guard) },
      el('b', { text: g.label }), el('span', { text: `${g.mm} mm` }))));
  const range = el('input', { type: 'range', id: 'fl-top', min: 1, max: 10, step: 1, value: state.top, class: 'fl-range' });
  const topOut = el('output', { for: 'fl-top', class: 'fl-out' });

  const ask = el('p', { class: 'fl-ask', 'aria-live': 'polite' });
  const sharp = el('strong', { class: 'fl-sharp' });
  const why = el('span', { class: 'fl-why' });
  const svcLabel = el('span', { class: 'fl-svc' });
  const book = el('button', { type: 'button', class: 'btn btn-brass fl-book', 'data-cursor': 'Book' }, 'Book this cut', icon('M5 12h14M13 6l6 6-6 6'));

  const stage = el('figure', { class: 'fl-stage', 'data-reveal': true },
    el('div', { class: 'fl-ring', 'aria-hidden': 'true' }),
    head.root,
    el('figcaption', { class: 'fl-legend' },
      el('span', { class: 'fl-tick fl-tick-top', 'aria-hidden': 'true' }, 'Top'),
      el('span', { class: 'fl-tick fl-tick-line', 'aria-hidden': 'true' }, 'Fade line'),
      el('span', { class: 'sx-sr', text: 'Side profile showing the fade you build.' })));

  const controls = el('div', { class: 'fl-panel', 'data-reveal': true },
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
      sectionHead('Fade lab', 'Build your fade.', 'Then ask for it.'),
      el('p', { class: 'fl-lede', 'data-reveal': true, text: 'Pick the height, the guard and the length on top. The card turns it into words your barber uses.' }),
      el('div', { class: 'fl-grid' }, stage, el('div', { class: 'fl-col' }, controls, card)))));

  // Tween the drawn numbers toward the chosen look.
  const target = () => ({ fade: FADES[state.fade].h, side: GUARDS[state.guard].mm, top: state.top, base: 1 });
  const shown = { ...target() };
  const style = () => ({ ...shown, skin: state.fade === 'skin', lift: shown.top * 0.8, sweep: 0.4, texture: shown.top >= 6 ? 1.6 : 0 });
  let raf = 0;
  function step() {
    const goal = target();
    let moving = false;
    for (const k of TWEEN_KEYS) {
      const d = goal[k] - shown[k];
      if (Math.abs(d) > 0.002) { shown[k] += d * 0.16; moving = true; } else shown[k] = goal[k];
    }
    head.draw(style());
    raf = moving ? requestAnimationFrame(step) : 0;
  }

  function update() {
    const a = fadeAdvice(state);
    ask.textContent = a.ask;
    sharp.textContent = a.sharp;
    why.textContent = a.why;
    svcLabel.textContent = svcName(a.service);
    book.dataset.bookService = a.service;
    topOut.textContent = `${state.top} cm`;
    range.setAttribute('aria-valuetext', `${state.top} centimetres`);
    fadeGroup.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fade === state.fade)));
    guardGroup.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.guard === state.guard)));
    stage.style.setProperty('--line', String(1 - FADES[state.fade].h));
    stage.style.setProperty('--fill', String((state.top - 1) / 9));
    if (reduced) { Object.assign(shown, target()); head.draw(style()); } else if (!raf) raf = requestAnimationFrame(step);
  }

  fadeGroup.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fade]');
    if (b) { state.fade = b.dataset.fade; update(); }
  });
  guardGroup.addEventListener('click', (e) => {
    const b = e.target.closest('[data-guard]');
    if (b) { state.guard = +b.dataset.guard; update(); }
  });
  range.addEventListener('input', () => { state.top = +range.value; update(); });
  head.draw(style());
  update();
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
