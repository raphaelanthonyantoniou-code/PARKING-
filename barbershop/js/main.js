import { SHOP, SERVICES, GROUPS, BARBERS, REVIEWS, FAQ, PRODUCTS, MEMBERSHIPS, GIFT_AMOUNTS } from './config.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable */
    }
  },
};

const money = new Intl.NumberFormat(SHOP.locale, { style: 'currency', currency: SHOP.currency, maximumFractionDigits: 0 });

// Scene darkness behind each section, so text stays readable.
const DIM = { hero: 0, story: 0.18, services: 0.62, fadelab: 0.15, craft: 0, team: 0.6, cutbook: 0.55, shelf: 0.2, lounge: 0.1, club: 0.6, words: 0.5, book: 0.74, visit: 0.38, footer: 0.6 };
// On tall phone screens text covers more of the scene.
const DIM_PORTRAIT = { ...DIM, story: 0.45, fadelab: 0.5, shelf: 0.62, lounge: 0.35, words: 0.6, visit: 0.5 };
const portrait = matchMedia('(max-aspect-ratio: 9 / 10)');

let stage = null;

// ======================================================================
// Shop time
// ======================================================================

const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const fromMin = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const isoDate = (d) => d.toISOString().slice(0, 10);
const parseIso = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const addDays = (iso, n) => {
  const d = parseIso(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
};
const weekday = (iso) => parseIso(iso).getUTCDay();
const fmtDay = new Intl.DateTimeFormat(SHOP.locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtDayLong = new Intl.DateTimeFormat(SHOP.locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const fmtWeekday = new Intl.DateTimeFormat(SHOP.locale, { weekday: 'long', timeZone: 'UTC' });
const fmtWeekdayShort = new Intl.DateTimeFormat(SHOP.locale, { weekday: 'short', timeZone: 'UTC' });
const fmtMonth = new Intl.DateTimeFormat(SHOP.locale, { month: 'short', timeZone: 'UTC' });
// 2023-01-01 was a Sunday, so day n of that week has weekday n.
const dayName = (wd, short = false) => (short ? fmtWeekdayShort : fmtWeekday).format(new Date(Date.UTC(2023, 0, 1 + wd)));

function shopNow() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SHOP.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: (Number(get('hour')) % 24) * 60 + Number(get('minute')) };
}

// Wall-clock time in the shop's time zone to a UTC Date.
function shopTimeToUtc(iso, hhmm) {
  const [y, m, d] = iso.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SHOP.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(guess));
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const asShop = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
  return new Date(guess - (asShop - guess));
}

function openStatus() {
  const now = shopNow();
  const today = SHOP.hours[weekday(now.date)];
  if (today && now.minutes >= toMin(today[0]) && now.minutes < toMin(today[1])) {
    return { open: true, short: `Open · until ${today[1]}`, long: `Open now, until ${today[1]}` };
  }
  for (let i = 0; i < 8; i++) {
    const iso = addDays(now.date, i);
    const h = SHOP.hours[weekday(iso)];
    if (!h || (i === 0 && now.minutes >= toMin(h[0]))) continue;
    const when = i === 0 ? 'today' : i === 1 ? 'tomorrow' : dayName(weekday(iso));
    return { open: false, short: `Closed · opens ${when} ${h[0]}`, long: `Closed now. Opens ${when} at ${h[0]}.` };
  }
  return { open: false, short: 'Closed', long: 'Closed' };
}

// ======================================================================
// Static content from config
// ======================================================================

function fillShopDetails() {
  const years = new Date().getFullYear() - SHOP.established;
  $$('[data-since]').forEach((el) => (el.textContent = SHOP.established));
  $$('[data-since-years]').forEach((el) => {
    el.textContent = years;
    el.dataset.count = years;
  });
  $('#year').textContent = new Date().getFullYear();
  $('#visit-address').innerHTML = `${esc(SHOP.street)}<em>${esc(SHOP.city)} ${esc(SHOP.postcode)}</em>`;
  $('#footer-address').textContent = `${SHOP.street}, ${SHOP.city}`;
  $('#directions').href = SHOP.mapsUrl;
  $('#footer-ig').href = `https://instagram.com/${encodeURIComponent(SHOP.instagram)}`;
  $('#demo-note').hidden = !SHOP.demo;

  const contacts = [
    { k: 'Phone', v: SHOP.phone, href: `tel:${SHOP.phone.replace(/\s+/g, '')}`, action: 'Call' },
    { k: 'WhatsApp', v: SHOP.phone, href: `https://wa.me/${SHOP.whatsapp}`, action: 'Message', external: true },
    { k: 'Email', v: SHOP.email, href: `mailto:${SHOP.email}`, action: 'Write' },
    { k: 'Instagram', v: `@${SHOP.instagram}`, href: `https://instagram.com/${encodeURIComponent(SHOP.instagram)}`, action: 'Follow', external: true },
  ];
  $('#contact-list').innerHTML = contacts
    .map(
      (c) => `<div class="contact"><span class="k">${c.k}</span><span class="v">${esc(c.v)}</span>
        <span class="contact-actions"><a class="text-btn" href="${esc(c.href)}"${c.external ? ' target="_blank" rel="noopener"' : ''}>${c.action}</a>
        ${c.k === 'Instagram' ? '' : `· <button class="text-btn" type="button" data-copy="${esc(c.v)}">Copy</button>`}</span></div>`
    )
    .join('');

  const order = [1, 2, 3, 4, 5, 6, 0];
  const todayWd = weekday(shopNow().date);
  $('#hours-table tbody').innerHTML = order
    .map((wd) => {
      const h = SHOP.hours[wd];
      return `<tr class="${wd === todayWd ? 'is-today' : ''}"><th scope="row">${dayName(wd)}</th><td>${h ? `${h[0]} – ${h[1]}` : 'Closed'}</td></tr>`;
    })
    .join('');

  $('#faq').insertAdjacentHTML('beforeend', FAQ.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join(''));
}

function updateOpenStatus() {
  const s = openStatus();
  const pill = $('#open-pill');
  pill.classList.toggle('is-open', s.open);
  pill.querySelector('span').textContent = s.short;
  const line = $('#open-line');
  line.className = `open-line${s.open ? ' is-open' : ''}`;
  line.innerHTML = `<i aria-hidden="true"></i>${esc(s.long)}`;
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  const text = btn.dataset.copy;
  const done = () => toast(`Copied ${text}`);
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done, () => selectText(btn));
  } else selectText(btn);
});

function selectText(btn) {
  const v = btn.closest('.contact')?.querySelector('.v');
  if (!v) return;
  const range = document.createRange();
  range.selectNodeContents(v);
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  toast('Selected. Press Ctrl+C or ⌘C to copy');
}

let toastTimer = 0;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 2600);
}

// ======================================================================
// Hero split text
// ======================================================================

function splitHero() {
  let line = 0;
  for (const el of $$('[data-split]')) {
    const words = el.textContent.trim().split(/\s+/);
    let n = 0;
    el.innerHTML = words
      .map((w) => `<span class="word">${[...w].map((ch) => `<span class="char" style="--d:${380 + line * 140 + n++ * 30}">${esc(ch)}</span>`).join('')}</span>`)
      .join(' ');
    el.setAttribute('aria-hidden', 'true');
    line++;
  }
}

// ======================================================================
// Services
// ======================================================================

function renderServices() {
  const tabs = $('#service-tabs');
  tabs.innerHTML = GROUPS.map(
    (g, i) => `<button class="tab" type="button" role="tab" aria-selected="${i === 0}" data-group="${g.id}">${esc(g.label)}</button>`
  ).join('');
  const grid = $('#service-grid');
  grid.innerHTML = SERVICES.map(
    (s, i) => `<article class="svc" data-group="${s.group}" data-reveal style="--rd:${(i % 4) * 70}">
      <div class="svc-meta"><span class="chip${s.grade === 'Most booked' ? ' chip-brass' : ''}">${esc(s.grade)}</span><span>${s.minutes} min</span></div>
      <div class="svc-title"><h3>${esc(s.name)}</h3><span class="leader" aria-hidden="true"></span><span class="svc-price"><small>€</small>${s.price}</span></div>
      <p>${esc(s.text)}</p>
      <button class="svc-book" type="button" data-book-service="${s.id}" data-cursor="Book">Book this
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    </article>`
  ).join('');

  tabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    $$('.tab', tabs).forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
    const g = tab.dataset.group;
    $$('.svc', grid).forEach((card) => {
      card.hidden = g !== 'all' && card.dataset.group !== g;
      card.classList.add('is-in');
    });
    measureSoon();
  });

  tabs.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const all = $$('.tab', tabs);
    const i = all.indexOf(document.activeElement);
    if (i < 0) return;
    const next = all[(i + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length];
    next.focus();
    next.click();
  });

  if (finePointer && !reduced) {
    grid.addEventListener('pointermove', (e) => {
      const card = e.target.closest('.svc');
      if (!card) return;
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      card.classList.add('is-tilting');
      card.style.setProperty('--ry', `${(px - 0.5) * 10}deg`);
      card.style.setProperty('--rx', `${(0.5 - py) * 8}deg`);
      card.style.setProperty('--gx', `${px * 100}%`);
      card.style.setProperty('--gy', `${py * 100}%`);
    });
    grid.addEventListener(
      'pointerleave',
      (e) => {
        const card = e.target.closest?.('.svc');
        if (!card) return;
        card.classList.remove('is-tilting');
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      },
      true
    );
  }
}

// ======================================================================
// Team
// ======================================================================

function offDays(b) {
  const closed = Object.entries(SHOP.hours).filter(([, h]) => !h).map(([d]) => Number(d));
  return b.daysOff.filter((d) => !closed.includes(d));
}

function renderTeam() {
  $('#team-grid').innerHTML = BARBERS.map((b, i) => {
    const off = offDays(b);
    return `<article class="bcard" data-reveal style="--rd:${i * 90};--tone:${b.tone}">
      <div class="bcard-inner">
        <div class="bface bfront">
          <span class="byears">${b.years} years</span>
          <span class="binitial" aria-hidden="true">${esc(b.name[0])}</span>
          <div class="bname">
            <h3>${esc(b.name)}</h3>
            <p>${esc(b.role)}</p>
            <button class="text-btn" type="button" data-flip aria-label="More about ${esc(b.name)}">More about ${esc(b.name)}</button>
          </div>
        </div>
        <div class="bface bback">
          <blockquote>“${esc(b.quote)}”</blockquote>
          <ul>${b.skills.map((s) => `<li class="chip">${esc(s)}</li>`).join('')}</ul>
          <p class="off">${off.length ? `Off on ${off.map((d) => dayName(d) + 's').join(' and ')}` : 'In every day the shop is open'}</p>
          <div class="bback-actions">
            <button class="btn btn-brass btn-small" type="button" data-book-barber="${b.id}">Book with ${esc(b.name)}</button>
            <button class="text-btn" type="button" data-flip>Back</button>
          </div>
        </div>
      </div>
    </article>`;
  }).join('');

  $('#team-grid').addEventListener('click', (e) => {
    const flip = e.target.closest('[data-flip]');
    if (!flip) return;
    const card = flip.closest('.bcard');
    card.classList.toggle('is-flipped');
    const back = card.classList.contains('is-flipped');
    (back ? card.querySelector('.bback [data-book-barber]') : card.querySelector('.bfront [data-flip]'))?.focus({ preventScroll: true });
  });
}

// ======================================================================
// The shelf: products added to the visit
// ======================================================================

function renderShelf() {
  $('#shelf-grid').innerHTML = PRODUCTS.map(
    (p, i) => `<article class="product" data-reveal style="--rd:${(i % 2) * 80}">
      <div class="product-top"><h3>${esc(p.name)}</h3><span class="product-price">€${p.price}</span></div>
      <p class="product-size">${esc(p.size)}</p>
      <p>${esc(p.text)}</p>
      <button class="product-add" type="button" data-product="${p.id}" aria-pressed="false">
        <span class="product-add-off">Add to my visit</span><span class="product-add-on">Added to your visit</span>
      </button>
    </article>`
  ).join('');

  $('#shelf-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-product]');
    if (!btn || B.result) {
      if (btn && B.result) toast('Start a new booking to add products.');
      return;
    }
    const id = btn.dataset.product;
    const had = B.products.includes(id);
    B.products = had ? B.products.filter((x) => x !== id) : [...B.products, id];
    syncShelf();
    renderSummary();
    toast(had ? `Removed ${productById(id).name}` : `${productById(id).name} will be waiting at your visit`);
  });
  syncShelf();
}

function syncShelf() {
  $$('[data-product]').forEach((b) => b.setAttribute('aria-pressed', String(B.products.includes(b.dataset.product))));
  const bar = $('#shelf-bar');
  if (!B.products.length) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  const n = B.products.length;
  $('#shelf-bar-text').textContent = `${n} item${n > 1 ? 's' : ''} · ${money.format(productsTotal(B.products))} · paid at the shop`;
}

// ======================================================================
// Memberships and gift cards
// ======================================================================

function renderClub() {
  const wa = (text) => `https://wa.me/${SHOP.whatsapp}?text=${encodeURIComponent(text)}`;
  $('#club-grid').innerHTML = MEMBERSHIPS.map(
    (m, i) => `<article class="tier${m.featured ? ' is-featured' : ''}" data-reveal style="--rd:${i * 90}">
      ${m.featured ? '<p class="tier-flag">Most chosen</p>' : ''}
      <h3>${esc(m.name)}</h3>
      <p class="tier-price"><strong>€${m.price}</strong><span>a month</span></p>
      <ul>${m.perks.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
      <a class="btn ${m.featured ? 'btn-neon' : 'btn-ghost'}" href="${wa(`Hello ${SHOP.name}, I would like to join ${m.name} (€${m.price} a month).`)}" target="_blank" rel="noopener">Join ${esc(m.name)}</a>
    </article>`
  ).join('');

  const chips = $('#gift-amounts');
  let amount = GIFT_AMOUNTS[1] ?? GIFT_AMOUNTS[0];
  chips.innerHTML = GIFT_AMOUNTS.map(
    (a) => `<button type="button" class="chip-btn" data-amount="${a}" aria-pressed="${a === amount}">€${a}</button>`
  ).join('');
  const send = $('#gift-send');
  const update = () => {
    $('#gift-value').textContent = `€${amount}`;
    send.href = wa(`Hello ${SHOP.name}, I would like a €${amount} gift card. Please tell me how to pay and pick it up.`);
    $$('[data-amount]', chips).forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.amount) === amount)));
  };
  chips.addEventListener('click', (e) => {
    const b = e.target.closest('[data-amount]');
    if (!b) return;
    amount = Number(b.dataset.amount);
    update();
  });
  update();

  // The gift card leans toward the pointer.
  const card = $('#gift-card');
  if (finePointer && !reduced) {
    const zone = card.parentElement;
    zone.addEventListener('pointermove', (e) => {
      const r = zone.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `rotateY(${x * 22}deg) rotateX(${-y * 16}deg)`;
      card.style.setProperty('--gx', `${(x + 0.5) * 100}%`);
    });
    zone.addEventListener('pointerleave', () => (card.style.transform = ''));
  }
}

// ======================================================================
// After hours: house lights down, neon up
// ======================================================================

let afterHours = store.get('barbershop.afterHours', false) === true;

function applyAfterHours() {
  root.classList.toggle('is-after-hours', afterHours);
  $$('[data-neon-toggle]').forEach((b) => {
    b.setAttribute('aria-pressed', String(afterHours));
    const label = b.querySelector('[data-neon-label]');
    if (label) label.textContent = afterHours ? 'After hours on' : 'After hours';
  });
  stage?.setAfterHours(afterHours);
}

function initAfterHours() {
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-neon-toggle]')) return;
    afterHours = !afterHours;
    store.set('barbershop.afterHours', afterHours);
    applyAfterHours();
    toast(afterHours ? 'House lights down. Neon on.' : 'House lights back on.');
  });
  applyAfterHours();
}

function initFooterNeon() {
  const word = $('.footer-word');
  if (reduced || !('IntersectionObserver' in window)) {
    word.classList.add('is-lit');
    return;
  }
  new IntersectionObserver(
    ([e], io) => {
      if (!e.isIntersecting) return;
      word.classList.add('is-lit');
      io.disconnect();
    },
    { threshold: 0.4 }
  ).observe(word);
}

// ======================================================================
// Pool table controls
// ======================================================================

function initPool() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pool]');
    if (!btn) return;
    if (!stage?.pool.ready()) {
      toast('The pool table needs 3D graphics, which this device has turned off.');
      return;
    }
    if (btn.dataset.pool === 'break') stage.pool.breakShot();
    else if (btn.dataset.pool === 'rack') stage.pool.rack();
  });
}

// ======================================================================
// Reviews: a 3D ring
// ======================================================================

function initRing() {
  const ring = $('#ring');
  const stageEl = $('#ring-stage');
  const n = REVIEWS.length;
  const step = 360 / n;
  ring.innerHTML = REVIEWS.map(
    (r) => `<figure class="review" role="group">
      <span class="review-mark" aria-hidden="true">“</span>
      <p>${esc(r.text)}</p>
      <footer><strong>${esc(r.name)}</strong><span>${esc(r.service)}</span></footer>
    </figure>`
  ).join('');
  const cards = $$('.review', ring);
  stageEl.tabIndex = 0;
  stageEl.setAttribute('aria-label', 'Client reviews. Use the arrow keys to turn.');

  let radius = 300;
  let angle = 0;
  let target = 0;
  let front = -1;
  let visible = false;
  let drag = null;
  let lastAuto = performance.now();

  function layout() {
    const w = ring.offsetWidth;
    radius = Math.round(w / 2 / Math.tan(Math.PI / n) + 24);
    cards.forEach((c, i) => (c.style.transform = `rotateY(${i * step}deg) translateZ(${radius}px)`));
  }

  function go(delta) {
    target = Math.round(target / step) * step - delta * step;
    lastAuto = performance.now();
  }

  $('#ring-prev').addEventListener('click', () => go(-1));
  $('#ring-next').addEventListener('click', () => go(1));
  stageEl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
    else return;
    e.preventDefault();
  });

  stageEl.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, start: target, id: e.pointerId, moved: false };
    stageEl.setPointerCapture(e.pointerId);
    stageEl.classList.add('is-dragging');
  });
  stageEl.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 3) drag.moved = true;
    target = drag.start + dx * 0.22;
  });
  const end = () => {
    if (!drag) return;
    target = Math.round(target / step) * step;
    drag = null;
    lastAuto = performance.now();
    stageEl.classList.remove('is-dragging');
  };
  stageEl.addEventListener('pointerup', end);
  stageEl.addEventListener('pointercancel', end);

  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(stageEl);
  layout();
  window.addEventListener('resize', layout);

  return function tick(now) {
    if (!visible) return;
    if (!drag && !reduced && now - lastAuto > 5200 && !stageEl.matches(':hover, :focus-within')) go(1);
    angle = reduced ? target : lerp(angle, target, 0.08);
    ring.style.transform = `translateZ(${-radius}px) rotateY(${angle}deg)`;
    const f = (((Math.round(-angle / step) % n) + n) % n);
    if (f !== front) {
      front = f;
      cards.forEach((c, i) => {
        c.classList.toggle('is-front', i === f);
        c.setAttribute('aria-hidden', String(i !== f));
      });
      $('#ring-pos').textContent = `${f + 1} / ${n}`;
    }
  };
}

// ======================================================================
// Booking
// ======================================================================

const B = { step: 0, service: null, barber: 'any', date: null, time: null, name: '', phone: '', email: '', notes: '', products: [], result: null, errors: {} };
const STEP_NEXT = ['Choose a barber', 'Choose a time', 'Your details', 'Request booking'];

const svcById = (id) => SERVICES.find((s) => s.id === id);
const productById = (id) => PRODUCTS.find((p) => p.id === id);
const productsTotal = (ids) => ids.reduce((sum, id) => sum + (productById(id)?.price || 0), 0);
const productNames = (ids) => ids.map((id) => productById(id)?.name).filter(Boolean).join(', ');
const barberById = (id) => BARBERS.find((b) => b.id === id);
const barberLabel = (id) => (id === 'any' ? 'First free chair' : barberById(id)?.name || '');

function slotsFor(iso) {
  const svc = svcById(B.service);
  const h = SHOP.hours[weekday(iso)];
  if (!svc || !h) return [];
  const b = barberById(B.barber);
  if (b && b.daysOff.includes(weekday(iso))) return [];
  const now = shopNow();
  const out = [];
  for (let m = toMin(h[0]); m + svc.minutes <= toMin(h[1]); m += SHOP.slotMinutes) {
    const past = iso === now.date && m < now.minutes + 30;
    out.push({ time: fromMin(m), m, past });
  }
  return out;
}

function bookableDates() {
  const start = shopNow().date;
  return Array.from({ length: SHOP.bookingDays }, (_, i) => {
    const iso = addDays(start, i);
    const slots = slotsFor(iso);
    return { iso, open: slots.some((s) => !s.past) };
  });
}

function canReach(step) {
  if (B.result) return false;
  if (step <= 0) return true;
  if (step <= 2) return !!B.service;
  if (step === 3) return !!(B.service && B.date && B.time);
  return false;
}

function goStep(step) {
  if (!canReach(step)) return;
  B.step = step;
  renderBooker(true);
}

function renderSteps() {
  $$('#booker-steps li').forEach((li) => {
    const s = Number(li.dataset.step);
    li.classList.toggle('is-current', s === B.step && !B.result);
    li.classList.toggle('is-done', !!B.result || s < B.step);
    const btn = li.querySelector('button');
    btn.disabled = !canReach(s);
    btn.setAttribute('aria-current', s === B.step ? 'step' : 'false');
  });
}

function renderSummary() {
  const svc = svcById(B.service);
  const when = B.date && B.time ? `${fmtDay.format(parseIso(B.date))}, ${B.time}` : '';
  const row = (k, v) => `<div><dt>${k}</dt><dd class="${v ? '' : 'is-empty'}">${v ? esc(v) : 'Not chosen yet'}</dd></div>`;
  $('#booker-summary').innerHTML = `
    <p class="sum-title">Your booking</p>
    <dl class="sum-list">
      ${row('Service', svc?.name)}
      ${row('Barber', svc ? barberLabel(B.barber) : '')}
      ${row('When', when)}
      ${row('Length', svc ? `${svc.minutes} min` : '')}
      ${B.products.length ? `<div><dt>Pick up</dt><dd>${esc(productNames(B.products))}</dd></div>` : ''}
    </dl>
    <div class="sum-total"><span>Total</span><strong>${svc || B.products.length ? money.format((svc?.price || 0) + productsTotal(B.products)) : '–'}</strong></div>`;
}

function renderBooker(focus = false) {
  renderSteps();
  renderSummary();
  const main = $('#booker-main');
  let html = '';
  if (B.result) html = paneDone();
  else if (B.step === 0) html = paneService();
  else if (B.step === 1) html = paneBarber();
  else if (B.step === 2) html = paneTime();
  else html = paneDetails();
  main.innerHTML = html;
  if (!B.result) main.insertAdjacentHTML('beforeend', paneActions());
  if (B.step === 2 && !B.result) $('.date[aria-pressed="true"]', main)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  if (focus) main.querySelector('.pane-title')?.focus({ preventScroll: true });
  renderMine();
}

function paneService() {
  const groups = GROUPS.filter((g) => g.id !== 'all');
  return `<div class="pane"><h3 class="pane-title" tabindex="-1">Choose a service</h3>
    ${groups
      .map(
        (g) => `<div class="pane-group"><span class="pane-label">${esc(g.label)}</span><div class="opt-list">
        ${SERVICES.filter((s) => s.group === g.id)
          .map(
            (s) => `<label class="opt"><input type="radio" name="b-service" value="${s.id}" ${B.service === s.id ? 'checked' : ''}>
            <span class="opt-name">${esc(s.name)}</span><span class="opt-sub">${s.minutes} min · ${esc(s.grade)}</span>
            <span class="opt-price">€${s.price}</span></label>`
          )
          .join('')}</div></div>`
      )
      .join('')}</div>`;
}

function paneBarber() {
  const opts = [{ id: 'any', name: 'First free chair', role: 'Whoever is free at your time', tone: '#d2a75a', daysOff: [] }, ...BARBERS];
  return `<div class="pane"><h3 class="pane-title" tabindex="-1">Choose a barber</h3>
    <div class="opt-grid">${opts
      .map((b) => {
        const off = b.id === 'any' ? [] : offDays(b);
        const sub = b.id === 'any' ? b.role : `${b.role}${off.length ? ` · off ${off.map((d) => dayName(d, true)).join(', ')}` : ''}`;
        return `<label class="opt opt-barber" style="--tone:${b.tone}"><input type="radio" name="b-barber" value="${b.id}" ${B.barber === b.id ? 'checked' : ''}>
          <span class="avatar" aria-hidden="true">${b.id === 'any' ? '★' : esc(b.name[0])}</span>
          <span class="opt-name">${esc(b.name)}</span><span class="opt-sub">${esc(sub)}</span></label>`;
      })
      .join('')}</div></div>`;
}

function paneTime() {
  const dates = bookableDates();
  if (!B.date || !dates.find((d) => d.iso === B.date && d.open)) {
    B.date = dates.find((d) => d.open)?.iso || null;
    B.time = null;
  }
  const slots = B.date ? slotsFor(B.date) : [];
  if (B.time && !slots.find((s) => s.time === B.time && !s.past)) B.time = null;
  const parts = [
    ['Morning', (m) => m < 720],
    ['Afternoon', (m) => m >= 720 && m < 1020],
    ['Evening', (m) => m >= 1020],
  ];
  const slotHtml = parts
    .map(([label, test]) => {
      const list = slots.filter((s) => test(s.m));
      if (!list.length) return '';
      return `<div class="pane-group"><span class="pane-label">${label}</span><div class="slots">${list
        .map((s) => `<button type="button" class="slot" data-time="${s.time}" aria-pressed="${B.time === s.time}" ${s.past ? 'disabled' : ''}>${s.time}</button>`)
        .join('')}</div></div>`;
    })
    .join('');
  return `<div class="pane"><h3 class="pane-title" tabindex="-1">Choose a time</h3>
    <div class="pane-group"><span class="pane-label">Day</span><div class="dates" role="group" aria-label="Day">${dates
      .map((d) => {
        const dt = parseIso(d.iso);
        return `<button type="button" class="date" data-date="${d.iso}" aria-pressed="${B.date === d.iso}" ${d.open ? '' : 'disabled'} aria-label="${fmtDayLong.format(dt)}${d.open ? '' : ', unavailable'}">
          <small>${fmtWeekdayShort.format(dt)}</small><strong>${dt.getUTCDate()}</strong><small>${fmtMonth.format(dt)}</small></button>`;
      })
      .join('')}</div></div>
    ${B.date ? slotHtml || '<p class="empty-note">No times left on this day.</p>' : '<p class="empty-note">No days available in the next two weeks with this barber.</p>'}
    </div>`;
}

function paneDetails() {
  const e = B.errors;
  const field = (id, label, type, value, extra = '', wide = false) => `<div class="field${wide ? ' field-wide' : ''}">
      <label for="b-${id}">${label}</label>
      ${type === 'textarea'
        ? `<textarea id="b-${id}" name="${id}" ${extra}>${esc(value)}</textarea>`
        : `<input id="b-${id}" name="${id}" type="${type}" value="${esc(value)}" ${extra} ${e[id] ? 'aria-invalid="true"' : ''} aria-describedby="b-${id}-err">`}
      <span class="field-error" id="b-${id}-err">${e[id] ? esc(e[id]) : ''}</span></div>`;
  return `<form class="pane" id="b-form" novalidate><h3 class="pane-title" tabindex="-1">Your details</h3>
    <div class="form">
      ${field('name', 'Name', 'text', B.name, 'autocomplete="name" required')}
      ${field('phone', 'Mobile', 'tel', B.phone, 'autocomplete="tel" inputmode="tel" required placeholder="+30 69…"')}
      ${field('email', 'Email (optional)', 'email', B.email, 'autocomplete="email"', true)}
      ${field('notes', 'Anything we should know? (optional)', 'textarea', B.notes, 'maxlength="400" placeholder="A photo you like, a cowlick, sensitive skin…"', true)}
    </div></form>`;
}

function paneActions() {
  const next = STEP_NEXT[B.step];
  const ready = B.step === 0 ? !!B.service : B.step === 1 ? true : B.step === 2 ? !!(B.date && B.time) : true;
  return `<div class="pane-actions">
    ${B.step > 0 ? '<button class="btn btn-ghost" type="button" data-b-back>Back</button>' : '<span class="spacer"></span>'}
    <button class="btn btn-brass" type="button" data-b-next ${ready ? '' : 'disabled'}>${next}</button></div>`;
}

function paneDone() {
  const r = B.result;
  const svc = svcById(r.service);
  const titles = {
    sent: ['Request sent', 'The shop has your request. You will get a confirmation message on your phone shortly.'],
    whatsapp: ['One last step', 'Send this request to the shop on WhatsApp and we will confirm your chair by reply.'],
    error: ['Not sent yet', `We could not reach the booking system. Send the request on WhatsApp instead, or call ${SHOP.phone}.`],
  };
  const [title, text] = titles[r.status];
  return `<div class="pane done"><h3 class="pane-title" tabindex="-1">${title}</h3>
    <div class="ticket">
      <div class="ticket-head"><span>${esc(SHOP.name)}</span><small>Booking request</small></div>
      <div class="ticket-body">
        <p class="ticket-code">${r.code}</p>
        <dl class="ticket-rows">
          <div><dt>Service</dt><dd>${esc(svc.name)}</dd></div>
          <div><dt>Barber</dt><dd>${esc(barberLabel(r.barber))}</dd></div>
          <div><dt>Day</dt><dd>${fmtDay.format(parseIso(r.date))}</dd></div>
          <div><dt>Time</dt><dd>${r.time} · ${svc.minutes} min</dd></div>
          <div><dt>Name</dt><dd>${esc(r.name)}</dd></div>
          <div><dt>Total</dt><dd>${money.format(r.total)}</dd></div>
          ${r.products.length ? `<div class="ticket-wide"><dt>Pick up</dt><dd>${esc(productNames(r.products))}</dd></div>` : ''}
        </dl>
      </div>
      <div class="ticket-cut" aria-hidden="true"></div>
      <div class="ticket-foot"><p>Pay at the shop. Free to move up to 2 hours before.</p><span class="ticket-bars" aria-hidden="true"></span></div>
    </div>
    <p class="done-text">${esc(text)}</p>
    <div class="done-actions">
      ${r.status !== 'sent' ? `<a class="btn btn-brass" href="${whatsappLink(r)}" target="_blank" rel="noopener">Send on WhatsApp</a>` : ''}
      <a class="btn btn-ghost" href="${icsHref(r)}" download="barbershop-${r.code}.ics">Add to calendar</a>
      <button class="btn btn-ghost" type="button" data-b-reset>Book another</button>
    </div></div>`;
}

function bookingText(r) {
  const svc = svcById(r.service);
  return [
    `Hello ${SHOP.name}, I would like to book:`,
    `${svc.name} with ${barberLabel(r.barber)}`,
    `${fmtDayLong.format(parseIso(r.date))} at ${r.time}`,
    `Name: ${r.name}`,
    `Mobile: ${r.phone}`,
    r.products.length ? `Please put aside: ${productNames(r.products)}` : '',
    r.notes ? `Notes: ${r.notes}` : '',
    `Ref: ${r.code}`,
  ]
    .filter(Boolean)
    .join('\n');
}

const whatsappLink = (r) => `https://wa.me/${SHOP.whatsapp}?text=${encodeURIComponent(bookingText(r))}`;

let icsUrl = '';
function icsHref(r) {
  const svc = svcById(r.service);
  const start = shopTimeToUtc(r.date, r.time);
  const end = new Date(start.getTime() + svc.minutes * 60000);
  const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const line = (s) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Barbershop Athens//Booking//EN',
    'BEGIN:VEVENT',
    `UID:${r.code}@barbershop`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${line(`${svc.name} at ${SHOP.fullName}`)}`,
    `LOCATION:${line(`${SHOP.street}, ${SHOP.postcode} ${SHOP.city}`)}`,
    `DESCRIPTION:${line(`With ${barberLabel(r.barber)}. Ref ${r.code}. Booking request: wait for the shop's confirmation.`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  if (icsUrl) URL.revokeObjectURL(icsUrl);
  icsUrl = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  return icsUrl;
}

function makeCode() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const s = [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
  return `B-${s.slice(0, 3)}-${s.slice(3)}`;
}

function validate() {
  const e = {};
  if (B.name.trim().length < 2) e.name = 'Enter your name so we know who is in the chair.';
  const digits = B.phone.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) e.phone = 'Enter a mobile number we can message, for example +30 691 234 5678.';
  if (B.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(B.email)) e.email = 'Check the email address, or leave it empty.';
  B.errors = e;
  return Object.keys(e).length === 0;
}

async function submitBooking() {
  if (!validate()) {
    renderBooker();
    const first = Object.keys(B.errors)[0];
    $(`#b-${first}`)?.focus();
    return;
  }
  const svc = svcById(B.service);
  const r = {
    code: makeCode(),
    service: B.service,
    barber: B.barber,
    date: B.date,
    time: B.time,
    minutes: svc.minutes,
    price: svc.price,
    products: [...B.products],
    total: svc.price + productsTotal(B.products),
    name: B.name.trim(),
    phone: B.phone.trim(),
    email: B.email.trim(),
    notes: B.notes.trim(),
    createdAt: new Date().toISOString(),
    status: 'whatsapp',
  };
  if (SHOP.bookingEndpoint) {
    const btn = $('[data-b-next]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Sending…';
    }
    try {
      const res = await fetch(SHOP.bookingEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(r),
      });
      r.status = res.ok ? 'sent' : 'error';
    } catch {
      r.status = 'error';
    }
  }
  const mine = store.get('barbershop.bookings', []);
  mine.push({ code: r.code, service: r.service, barber: r.barber, date: r.date, time: r.time, status: r.status });
  store.set('barbershop.bookings', mine.slice(-10));
  B.result = r;
  renderBooker(true);
  stage?.celebrate();
}

function renderMine() {
  const box = $('#mine');
  const today = shopNow().date;
  const list = store.get('barbershop.bookings', []).filter((b) => b.date >= today && svcById(b.service));
  if (!list.length) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  box.innerHTML = `<h3>Your requests on this device</h3><ul>${list
    .map(
      (b) => `<li><span>${fmtDay.format(parseIso(b.date))} · ${b.time} · ${esc(svcById(b.service).name)} with ${esc(barberLabel(b.barber))} · <strong>${b.code}</strong></span>
      <button class="text-btn" type="button" data-forget="${b.code}">Remove from this list</button></li>`
    )
    .join('')}</ul>`;
}

function initBooker() {
  const main = $('#booker-main');

  main.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'b-service') {
      B.service = t.value;
      B.time = null;
      renderSteps();
      renderSummary();
      $('[data-b-next]').disabled = false;
    } else if (t.name === 'b-barber') {
      B.barber = t.value;
      B.time = null;
      renderSteps();
      renderSummary();
    }
  });

  // A mouse or touch pick moves straight on; keyboard users press Continue.
  main.addEventListener('click', (e) => {
    const opt = e.target.closest('.opt');
    if (opt && e.detail > 0 && (B.step === 0 || B.step === 1)) {
      setTimeout(() => goStep(B.step + 1), 260);
      return;
    }
    const date = e.target.closest('.date');
    if (date && !date.disabled) {
      B.date = date.dataset.date;
      B.time = null;
      renderBooker();
      $(`.date[data-date="${B.date}"]`)?.focus({ preventScroll: true });
      return;
    }
    const slot = e.target.closest('.slot');
    if (slot && !slot.disabled) {
      B.time = slot.dataset.time;
      $$('.slot', main).forEach((s) => s.setAttribute('aria-pressed', String(s === slot)));
      renderSteps();
      renderSummary();
      $('[data-b-next]').disabled = false;
      return;
    }
    if (e.target.closest('[data-b-back]')) return goStep(B.step - 1);
    if (e.target.closest('[data-b-next]')) {
      if (B.step < 3) return goStep(B.step + 1);
      return submitBooking();
    }
    if (e.target.closest('[data-b-reset]')) {
      Object.assign(B, { step: 0, service: null, barber: 'any', date: null, time: null, notes: '', products: [], result: null, errors: {} });
      renderBooker(true);
      syncShelf();
    }
  });

  main.addEventListener('input', (e) => {
    const t = e.target;
    if (['name', 'phone', 'email', 'notes'].includes(t.name)) {
      B[t.name] = t.value;
      if (B.errors[t.name]) {
        delete B.errors[t.name];
        t.removeAttribute('aria-invalid');
        const err = $(`#b-${t.name}-err`);
        if (err) err.textContent = '';
      }
    }
  });

  main.addEventListener('submit', (e) => {
    e.preventDefault();
    submitBooking();
  });

  $('#booker-steps').addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (li) goStep(Number(li.dataset.step));
  });

  $('#mine').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-forget]');
    if (!btn) return;
    store.set('barbershop.bookings', store.get('barbershop.bookings', []).filter((b) => b.code !== btn.dataset.forget));
    renderMine();
  });

  // "Book this" on a service card, "Book with" on a barber card.
  document.addEventListener('click', (e) => {
    const s = e.target.closest('[data-book-service]');
    const b = e.target.closest('[data-book-barber]');
    if (!s && !b) return;
    if (B.result) {
      Object.assign(B, { result: null, date: null, time: null, products: [] });
      syncShelf();
    }
    if (s) {
      B.service = s.dataset.bookService;
      B.step = 1;
    }
    if (b) {
      B.barber = b.dataset.bookBarber;
      B.step = B.service ? 2 : 0;
    }
    renderBooker();
    $('#book').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    setTimeout(() => $('#booker-main .pane-title')?.focus({ preventScroll: true }), reduced ? 0 : 900);
  });

  renderBooker();
}

// ======================================================================
// Marquee tape
// ======================================================================

function initTape() {
  const words = ['Skin fades', 'Hot towel shaves', 'Beard sculpting', 'Scissor cuts', 'Walk-ins welcome', 'Junior cuts', 'Straight razor'];
  return $$('[data-marquee]').map((track) => {
    const dir = Number(track.dataset.marquee);
    const set = (dir > 0 ? words : [...words].reverse()).map((w) => `<span>${w}</span>`).join('');
    track.innerHTML = set + set + set + set;
    let x = 0;
    return (dt, vel) => {
      const unit = track.scrollWidth / 4;
      if (!unit) return;
      const speed = reduced ? 0 : 50 + Math.min(Math.abs(vel) * 0.25, 600);
      x -= dir * speed * dt;
      if (x <= -unit) x += unit;
      if (x > 0) x -= unit;
      const skew = reduced ? 0 : clamp(-vel * 0.006, -7, 7);
      track.style.transform = `translate3d(${x}px,0,0) skewX(${skew}deg)`;
    };
  });
}

// ======================================================================
// Reveal + counters
// ======================================================================

function initReveal() {
  if (reduced || !('IntersectionObserver' in window)) return;
  root.classList.add('js-anim');
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
  );
  $$('[data-reveal]').forEach((el) => {
    if (!el.style.getPropertyValue('--rd')) {
      const sibs = [...el.parentElement.children].filter((c) => c.hasAttribute('data-reveal'));
      el.style.setProperty('--rd', String(sibs.indexOf(el) * 80));
    }
    io.observe(el);
  });
}

function initCounters() {
  const els = $$('[data-count]');
  if (reduced || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const el = e.target;
      const to = Number(el.dataset.count || el.textContent);
      const t0 = performance.now();
      const tick = (now) => {
        const k = clamp((now - t0) / 1400, 0, 1);
        el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(tick);
      };
      el.textContent = '0';
      requestAnimationFrame(tick);
    }
  }, { threshold: 0.6 });
  els.forEach((el) => io.observe(el));
}

// ======================================================================
// Nav + mobile menu
// ======================================================================

function initMenu() {
  const btn = $('#menu-btn');
  const menu = $('#menu');
  const set = (open) => {
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    btn.querySelector('.menu-btn-text').textContent = open ? 'Close' : 'Menu';
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) menu.querySelector('a')?.focus();
  };
  btn.addEventListener('click', () => set(menu.hidden));
  menu.addEventListener('click', (e) => {
    if (e.target.closest('a')) set(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) {
      set(false);
      btn.focus();
    }
  });
  return () => !menu.hidden;
}

// ======================================================================
// Cursor, chair spin, magnetic buttons
// ======================================================================

const pointer = { x: innerWidth / 2, y: innerHeight / 2, rx: innerWidth / 2, ry: innerHeight / 2, overUi: false, label: '' };

function initPointer() {
  const cursor = $('#cursor');
  const dot = $('.cursor-dot', cursor);
  const ring = $('.cursor-ring', cursor);
  const labelEl = $('#cursor-label');
  if (finePointer) root.classList.add('has-cursor');

  window.addEventListener(
    'pointermove',
    (e) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      if (e.pointerType === 'mouse') cursor.classList.add('is-live');
      if (e.pointerType === 'mouse') stage?.setPointer((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
    },
    { passive: true }
  );

  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest('a, button, label, summary, input, textarea, [data-cursor], .ring-stage');
    pointer.overUi = !!el;
    const lab = el?.dataset.cursor || (el?.classList.contains('ring-stage') ? 'Drag' : '');
    pointer.label = lab;
    cursor.classList.toggle('is-link', !!el && !lab);
    cursor.classList.toggle('is-label', !!lab);
    labelEl.textContent = lab;
  });

  // Magnetic pull on primary buttons.
  if (finePointer && !reduced) {
    for (const el of $$('[data-magnetic]')) {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) * 0.25;
        const y = (e.clientY - r.top - r.height / 2) * 0.35;
        el.style.transform = `translate(${x}px, ${y}px)`;
      });
      el.addEventListener('pointerleave', () => (el.style.transform = ''));
    }
  }

  // Tap or click the pool table to shoot the cue ball at that spot.
  const loungeEl = $('#lounge');
  const inLounge = () => {
    const r = loungeEl.getBoundingClientRect();
    return r.top < innerHeight * 0.5 && r.bottom > innerHeight * 0.5;
  };
  document.addEventListener('click', (e) => {
    if (!stage?.pool.ready() || !inLounge()) return;
    if (e.target.closest('a, button, input, textarea, label, summary, .menu, .nav, [data-no-shoot]')) return;
    stage.pool.shootAt(e.clientX, e.clientY);
  });

  // Spin the chair by dragging it in the hero.
  let drag = null;
  const hint = $('#spin-hint');
  const inHero = () => scrollY < innerHeight * 0.85;
  document.addEventListener('pointerdown', (e) => {
    if (!stage || e.button !== 0 || !inHero()) return;
    if (e.target.closest('a, button, input, textarea, label, summary, .menu, .nav')) return;
    if (!stage.hitsChair(e.clientX, e.clientY)) return;
    drag = { x: e.clientX, t: performance.now(), id: e.pointerId };
    stage.grab();
    root.classList.add('grabbing');
    hint?.classList.add('is-done');
  });
  document.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const now = performance.now();
    stage.drag(e.clientX - drag.x, now - drag.t);
    drag.x = e.clientX;
    drag.t = now;
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    stage.release();
    root.classList.remove('grabbing');
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);

  let hoverCheck = 0;
  return function tick() {
    if (finePointer) {
      pointer.rx = lerp(pointer.rx, pointer.x, reduced ? 1 : 0.18);
      pointer.ry = lerp(pointer.ry, pointer.y, reduced ? 1 : 0.18);
      dot.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0)`;
      ring.style.transform = `translate3d(${pointer.rx}px, ${pointer.ry}px, 0)`;

      // Hovering the chair shows a "Spin" label.
      if (stage && ++hoverCheck % 4 === 0) {
        const over = !drag && !pointer.overUi && inHero() && stage.hitsChair(pointer.x, pointer.y);
        const cue = !over && !pointer.overUi && stage.pool.ready() && inLounge() && stage.pool.hits(pointer.x, pointer.y);
        root.classList.toggle('grab-chair', over || !!drag);
        if (!pointer.label) {
          cursor.classList.toggle('is-label', over || !!drag || cue);
          labelEl.textContent = over || drag ? 'Spin' : cue ? 'Shoot' : '';
        }
      }
    }
  };
}

// ======================================================================
// Scroll engine: drives the camera, the veil, the craft carousel
// ======================================================================

function initScroll(menuOpen) {
  const nav = $('#nav');
  const bar = $('#progress');
  const veil = $('#veil');
  const craft = $('#craft');
  const panels = $$('.craft-panel');
  const dots = $$('#craft-dots li');
  const count = $('#craft-count');
  const navLinks = $$('.nav-links a');
  const navTargets = navLinks.map((a) => $(a.getAttribute('href')));

  let anchors = [];
  let maxScroll = 1;
  let lastY = scrollY;
  let vel = 0;
  let dim = 0;
  let activeTool = 0;
  let navHidden = false;

  function measure() {
    const vh = innerHeight;
    maxScroll = Math.max(1, root.scrollHeight - vh);
    anchors = [];
    for (const s of $$('[data-scene]')) {
      const r = s.getBoundingClientRect();
      const top = r.top + scrollY;
      const view = s.dataset.scene;
      if (r.height > vh * 1.4) {
        anchors.push({ y: top, view }, { y: top + r.height - vh, view });
      } else {
        anchors.push({ y: top + r.height / 2 - vh / 2, view });
      }
    }
    anchors.forEach((a) => (a.y = clamp(a.y, 0, maxScroll)));
    anchors[0].y = 0;
    anchors.sort((a, b) => a.y - b.y);
  }

  function sceneAt(y) {
    if (!anchors.length) return ['hero', 'hero', 0];
    if (y <= anchors[0].y) return [anchors[0].view, anchors[0].view, 0];
    for (let i = 0; i < anchors.length - 1; i++) {
      const a = anchors[i];
      const b = anchors[i + 1];
      if (y < b.y) {
        const span = b.y - a.y;
        const t = span > 1 ? (y - a.y) / span : 1;
        return [a.view, b.view, clamp((t - 0.12) / 0.76, 0, 1)];
      }
    }
    const last = anchors[anchors.length - 1];
    return [last.view, last.view, 0];
  }

  measure();
  window.addEventListener('resize', () => {
    measure();
    stage?.resize();
  });
  if ('ResizeObserver' in window) new ResizeObserver(() => measure()).observe($('#main'));
  measureSoon = () => requestAnimationFrame(measure);

  return function tick(dt) {
    const y = scrollY;
    const vh = innerHeight;
    vel = lerp(vel, (y - lastY) / Math.max(dt, 0.001), 0.15);
    const delta = y - lastY;
    lastY = y;

    // Camera.
    const [from, to, t] = sceneAt(y);
    stage?.setView(from, to, t);
    const dims = portrait.matches ? DIM_PORTRAIT : DIM;
    const target = lerp(dims[from] ?? 0, dims[to] ?? 0, ease(t));
    dim = lerp(dim, stage ? target : Math.max(target, 0.35), 0.12);
    veil.style.setProperty('--dim', dim.toFixed(3));

    // Craft carousel: four tools, a quarter of the section each.
    const r = craft.getBoundingClientRect();
    const p = clamp(-r.top / Math.max(1, r.height - vh), 0, 1);
    const raw = clamp(p * panels.length - 0.5, 0, panels.length - 1);
    const i = Math.floor(raw);
    const f = raw - i;
    const val = Math.min(i + ease(clamp((f - 0.2) / 0.6, 0, 1)), panels.length - 1);
    stage?.setCraft(val);
    const tool = Math.round(val);
    if (tool !== activeTool) {
      activeTool = tool;
      panels.forEach((el, k) => el.classList.toggle('is-active', k === tool));
      dots.forEach((el, k) => el.classList.toggle('is-active', k === tool));
      count.textContent = `${tool + 1} / ${panels.length}`;
    }

    // Progress bar and nav.
    bar.style.transform = `scaleX(${clamp(y / maxScroll, 0, 1)})`;
    nav.classList.toggle('is-solid', y > 40);
    if (!menuOpen()) {
      if (delta > 4 && y > vh * 0.6) navHidden = true;
      else if (delta < -4 || y < vh * 0.6) navHidden = false;
    } else navHidden = false;
    nav.classList.toggle('is-hidden', navHidden && !nav.contains(document.activeElement));

    // Active link.
    const mid = vh * 0.45;
    navLinks.forEach((a, k) => {
      const s = navTargets[k];
      if (!s) return;
      const rr = s.getBoundingClientRect();
      a.classList.toggle('is-active', rr.top <= mid && rr.bottom > mid);
    });

    return vel;
  };
}

let measureSoon = () => {};

// ======================================================================
// Boot
// ======================================================================

// Loads a module that adds to the page; if it fails, the page carries on.
async function loadOptional(path, use) {
  try {
    use(await import(path));
  } catch (err) {
    console.warn(`${path} skipped:`, err);
  }
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

async function boot() {
  fillShopDetails();
  updateOpenStatus();
  setInterval(updateOpenStatus, 30000);
  splitHero();
  renderServices();
  renderTeam();
  renderShelf();
  renderClub();
  await loadOptional('./sections.js', (m) => m.mountSections({ SHOP, SERVICES, BARBERS, reduced, finePointer, toast }));
  initBooker();
  initAfterHours();
  initFooterNeon();
  initPool();
  const ringTick = initRing();
  const tapeTicks = initTape();
  await loadOptional('./fx.js', (m) => m.initFx({ reduced, finePointer, toast }));
  initReveal();
  initCounters();
  const menuOpen = initMenu();
  const pointerTick = initPointer();
  const scrollTick = initScroll(menuOpen);

  // Loader: count up while the scene builds.
  const num = $('#loader-num');
  const fill = $('#loader-fill');
  let shown = 0;
  let target = 0.12;
  let finished = false;
  const t0 = performance.now();
  const minTime = reduced ? 200 : 1400;

  (function loaderTick() {
    if (finished) return;
    shown = lerp(shown, target, 0.08);
    const pct = Math.min(99, Math.round(shown * 100));
    num.textContent = String(pct).padStart(2, '0');
    fill.style.height = `${pct}%`;
    if (target < 0.9) target += 0.0025;
    requestAnimationFrame(loaderTick);
  })();

  const buildStage = async () => {
    if (!webglAvailable()) throw new Error('WebGL 2 unavailable');
    const mod = await import('./scene.js');
    target = 0.6;
    const s = await mod.createStage($('#stage'), { reducedMotion: reduced });
    target = 1;
    return s;
  };
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('Scene took too long')), 12000));
  try {
    stage = await Promise.race([buildStage(), timeout]);
    stage.setAfterHours(afterHours);
    $('#stage').addEventListener('webglcontextlost', () => {
      stage?.stop();
      stage = null;
      root.classList.add('no-webgl');
    });
  } catch (err) {
    console.warn('3D scene off:', err.message);
    root.classList.add('no-webgl');
  }

  await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 2500))]);
  const wait = minTime - (performance.now() - t0);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));

  // Main loop.
  let last = performance.now();
  stage?.start();
  (function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const vel = scrollTick(dt);
    for (const t of tapeTicks) t(dt, vel);
    ringTick(now);
    pointerTick();
    requestAnimationFrame(loop);
  })(performance.now());

  finished = true;
  num.textContent = '100';
  fill.style.height = '100%';
  await new Promise((r) => setTimeout(r, reduced ? 0 : 280));
  root.classList.add('is-loaded');
  stage?.intro();
  setTimeout(() => root.classList.add('is-ready'), reduced ? 0 : 350);
  setTimeout(() => $('#loader').classList.add('is-gone'), 1300);
  setTimeout(() => $('#spin-hint')?.classList.add('is-done'), 14000);
}

boot();
