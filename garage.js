/* Parkareto — live 3D car park. Builds the floor in CSS 3D and runs a small parking simulation. */
(function () {
  "use strict";
  const root = document.getElementById("g3d");
  if (!root) return;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const pad = (n) => String(n).padStart(2, "0");
  const clock = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const euro = (n) => "€" + n.toFixed(2);
  const LETTERS = "ABEZHIKMNOPTXY";
  const plate = () => Array.from({ length: 3 }, () => pick(LETTERS)).join("") + "-" + (1000 + Math.floor(Math.random() * 9000));
  const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
  const CUBE = '<i class="t"></i><i class="l"></i><i class="r"></i><i class="f"></i><i class="b"></i>';

  // ---------- Geometry (floor coordinates, px) ----------
  const W = 680, BAY_W = 60, BAY_H = 118, X0 = 40, TOP_Y = 18, BOT_Y = 284;
  const LANE_IN = 176, LANE_OUT = 242, PARK_TOP = 68, PARK_BOT = 344;
  const FLOORS = { "-1": "Όροφος −1", "0": "Ισόγειο", "1": "Όροφος 1" };
  const LEVEL = { "-1": "ΥΠΟΓΕΙΟ −1", "0": "ΙΣΟΓΕΙΟ", "1": "ΟΡΟΦΟΣ 1" };
  const PAINTS = [
    { c: "#e5e9f0", hi: "#ffffff", lo: "#8b95a7" },
    { c: "#b91c1c", hi: "#ef6b6b", lo: "#4a0909" },
    { c: "#1d2b4a", hi: "#4a6292", lo: "#0b1222" },
    { c: "#f2c200", hi: "#ffe46b", lo: "#7a5f00", taxi: true },
    { c: "#2b2f36", hi: "#5b6270", lo: "#0c0e12" },
    { c: "#8a96a8", hi: "#d3dae6", lo: "#3b4352" },
    { c: "#2563eb", hi: "#7aa2ff", lo: "#13306f" },
    { c: "#f2c200", hi: "#ffe46b", lo: "#7a5f00", taxi: true },
    { c: "#0f766e", hi: "#5eead4", lo: "#063b37" },
  ];

  const scale = $("#gScale"), floor = $("#floor3d"), feed = $("#gFeed");

  // ---------- Per-floor state ----------
  const bayMeta = [];
  ["top", "bot"].forEach((row) => {
    for (let i = 0; i < 10; i++) {
      bayMeta.push({
        row, i,
        id: (row === "top" ? "A" : "B") + pad(i + 1),
        x: X0 + i * BAY_W + BAY_W / 2,
        y: row === "top" ? PARK_TOP : PARK_BOT,
        left: X0 + i * BAY_W,
        top: row === "top" ? TOP_Y : BOT_Y,
      });
    }
  });
  const RES = { "-1": [4, 13], "0": [6, 14], "1": [2, 16] };
  const FILL = { "-1": 0.72, "0": 0.55, "1": 0.3 };
  function newCar() {
    return { paint: pick(PAINTS), plate: plate(), since: Date.now() - Math.floor(Math.random() * 3 * 3600e3), charge: 20 + Math.floor(Math.random() * 60) };
  }
  const floors = {};
  Object.keys(FLOORS).forEach((f) => {
    floors[f] = bayMeta.map((m, k) => {
      let type = "std";
      if (m.row === "top" && m.i < 2) type = "dis";
      else if (m.row === "bot" && m.i > 7) type = "ev";
      else if (RES[f].includes(k)) type = "res";
      const p = type === "dis" ? FILL[f] * 0.4 : FILL[f];
      return { type, car: Math.random() < p ? newCar() : null, busy: false };
    });
  });
  let active = "0";

  // ---------- Static scenery ----------
  el("i", "slab-b", floor); el("i", "slab-r", floor);
  el("i", "wall wall-t", floor); el("i", "wall wall-l a", floor); el("i", "wall wall-l b", floor);
  el("i", "paint lane-line", floor);
  el("i", "paint xing", floor);
  el("span", "paint word w-in", floor, "ENTRY →");
  el("span", "paint word w-out", floor, "EXIT →");
  el("span", "paint zone", floor, "A");
  el("span", "paint arrow a1", floor, "➜"); el("span", "paint arrow a2", floor, "➜");

  const bays = bayMeta.map((m) => {
    const b = el("div", "bay3d " + m.row, floor);
    b.style.left = m.left + "px"; b.style.top = m.top + "px";
    el("span", "num", b, m.id);
    el("span", "sym", b);
    el("i", "stop", b);
    el("i", "beacon", b);
    return b;
  });

  // Corner columns that join the floors in the stacked view
  [[0, 0], [W - 8, 0], [0, 412], [W - 8, 412]].forEach(([x, y]) => {
    const c = el("div", "cube col", floor, CUBE);
    c.style.left = x + "px"; c.style.top = y + "px";
  });
  [[X0 + 5 * BAY_W - 9, TOP_Y + BAY_H + 2], [X0 + 5 * BAY_W - 9, BOT_Y - 20]].forEach(([x, y]) => {
    const p = el("div", "cube pillar", floor, CUBE);
    p.style.left = x + "px"; p.style.top = y + "px";
  });

  function gate(kind, x, y) {
    const g = el("div", "gate " + kind, floor);
    g.style.cssText = "left:0;top:0;width:0;height:0;transform-style:preserve-3d";
    const post = el("div", "cube gate-post", g, CUBE + '<i class="led"></i>');
    post.style.left = x + "px"; post.style.top = y + "px";
    el("i", "gate-arm", g);
    return g;
  }
  const gateIn = gate("in", 5, 128), gateOut = gate("out", 657, 288);
  function pulseGate(g, delay, hold) {
    setTimeout(() => { g.classList.add("open"); setTimeout(() => g.classList.remove("open"), hold); }, delay);
  }

  // EV chargers on the two EV bays (bottom row, last two)
  const chargers = {};
  bayMeta.forEach((m, k) => {
    if (!(m.row === "bot" && m.i > 7)) return;
    const c = el("div", "cube charger", floor, CUBE + '<i class="scr"></i>');
    c.style.left = m.x - 8 + "px"; c.style.top = BOT_Y + BAY_H - 13 + "px";
    const cable = el("i", "cable", floor);
    cable.style.left = m.x + 8 + "px"; cable.style.top = BOT_Y + BAY_H - 10 + "px"; cable.style.width = "16px";
    cable.style.transform = "translateZ(1px) rotate(-120deg)";
    chargers[k] = { c, cable };
  });

  // Tooltip billboard
  const tip = el("div", "bill tip3d", floor, "<span></span>");

  // ---------- Cars ----------
  const pose = (x, y, r) => `translate(${x - 21}px, ${y - 42}px) rotate(${r}deg)`;
  function makeCar(car) {
    const c = el("div", "car3d", floor,
      '<i class="cs"></i><i class="beam"></i><i class="tail"></i>' +
      '<i class="wh fl"></i><i class="wh fr"></i><i class="wh rl"></i><i class="wh rr"></i>' +
      '<i class="cube body">' + CUBE + "</i>" +
      '<i class="cube cab">' + CUBE + "</i>" +
      (car.paint.taxi ? '<i class="cube sign">' + CUBE + "</i>" : ""));
    c.style.setProperty("--c", car.paint.c);
    c.style.setProperty("--c-hi", car.paint.hi);
    c.style.setProperty("--c-lo", car.paint.lo);
    return c;
  }
  const carEls = new Map(); // bay index -> element
  const evChips = new Map();

  function setBay(k) {
    const s = floors[active][k], b = bays[k];
    b.className = "bay3d " + bayMeta[k].row + (s.type !== "std" ? " " + s.type : "") + (s.car ? " taken" : "");
    $(".sym", b).textContent = s.type === "res" ? "RES" : s.type === "dis" ? "♿︎" : s.type === "ev" ? "EV" : "";
    if (chargers[k]) {
      const on = !!(s.car && s.type === "ev");
      chargers[k].c.classList.toggle("on", on);
      chargers[k].cable.classList.toggle("on", on);
      let chip = evChips.get(k);
      if (on && !s.busy) {
        if (!chip) {
          chip = el("div", "bill", floor, '<span class="chip3d"></span>');
          chip.style.left = bayMeta[k].x + "px"; chip.style.top = bayMeta[k].y + "px";
          chip.style.setProperty("--bz", "62px");
          evChips.set(k, chip);
        }
        $(".chip3d", chip).textContent = "⚡ " + s.car.charge + "%";
      } else if (chip) { chip.remove(); evChips.delete(k); }
    }
  }

  function renderFloor() {
    carEls.forEach((c) => c.remove()); carEls.clear();
    evChips.forEach((c) => c.remove()); evChips.clear();
    floors[active].forEach((s, k) => {
      s.busy = false;
      if (s.car) {
        const c = makeCar(s.car);
        const m = bayMeta[k];
        c.style.transform = pose(m.x, m.y, m.row === "top" ? 0 : 180);
        carEls.set(k, c);
      }
      setBay(k);
    });
    $("#gLevel").textContent = LEVEL[active] + " · ZONE A";
    counts();
    ghosts();
  }

  // ---------- Stats + feed ----------
  function bumpSet(id, v) {
    const e = $("#" + id);
    if (e.textContent === String(v)) return;
    e.textContent = v; e.classList.remove("bump"); void e.offsetWidth; e.classList.add("bump");
  }
  function counts() {
    const f = floors[active];
    const occ = f.filter((s) => s.car).length;
    bumpSet("gFree", f.filter((s) => !s.car && (s.type === "std" || s.type === "ev")).length);
    bumpSet("gOcc", occ);
    bumpSet("gRes", f.filter((s) => s.type === "res" && !s.car).length);
    bumpSet("gEv", f.filter((s) => s.type === "ev" && s.car).length);
    $("#gOccBar").style.width = Math.round((occ / f.length) * 100) + "%";
  }
  function log(html) {
    const li = el("li", "", null, `${clock()} ${html}`);
    feed.prepend(li);
    while (feed.children.length > 4) feed.lastChild.remove();
  }

  // ---------- Movement ----------
  let moving = 0;
  function animate(car, frames, ms, done) {
    car.classList.add("moving");
    moving++;
    const a = car.animate(frames, { duration: reduce ? 1 : ms, easing: "cubic-bezier(.4,.05,.3,1)", fill: "forwards" });
    a.onfinish = () => {
      car.style.transform = frames[frames.length - 1].transform;
      a.cancel();
      car.classList.remove("moving");
      moving--;
      done && done();
    };
  }

  function driveIn() {
    const f = floors[active];
    const free = f.map((s, k) => k).filter((k) => !f[k].car && !f[k].busy && f[k].type !== "dis");
    if (!free.length) return false;
    const k = pick(free), m = bayMeta[k], s = f[k];
    s.car = newCar(); s.car.since = Date.now(); s.car.charge = 8 + Math.floor(Math.random() * 25);
    s.busy = true;
    const car = makeCar(s.car);
    const top = m.row === "top", bx = m.x;
    const frames = top ? [
      { transform: pose(-70, LANE_IN, 90), offset: 0 },
      { transform: pose(30, LANE_IN, 90), offset: 0.14 },
      { transform: pose(bx - 40, LANE_IN, 90), offset: 0.56 },
      { transform: pose(bx - 12, LANE_IN - 18, 45), offset: 0.68 },
      { transform: pose(bx, 128, 0), offset: 0.8 },
      { transform: pose(bx, m.y, 0), offset: 1 },
    ] : [
      { transform: pose(-70, LANE_IN, 90), offset: 0 },
      { transform: pose(30, LANE_IN, 90), offset: 0.14 },
      { transform: pose(bx - 40, LANE_IN, 90), offset: 0.56 },
      { transform: pose(bx - 12, LANE_IN + 22, 135), offset: 0.68 },
      { transform: pose(bx, 236, 180), offset: 0.8 },
      { transform: pose(bx, m.y, 180), offset: 1 },
    ];
    car.style.transform = frames[0].transform;
    pulseGate(gateIn, 0, 1700);
    animate(car, frames, 4600, () => { s.busy = false; carEls.set(k, car); setBay(k); counts(); ghosts(); });
    carEls.set(k, car);
    setBay(k); counts();
    log(`<span class="in">IN </span> <b>${s.car.plate}</b> → ${m.id}${s.type === "ev" ? ' <span class="ev">· charging</span>' : s.type === "res" ? " · reservation" : ""}`);
    return true;
  }

  function driveOut() {
    const f = floors[active];
    const taken = f.map((s, k) => k).filter((k) => f[k].car && !f[k].busy);
    if (!taken.length) return false;
    const k = pick(taken), m = bayMeta[k], s = f[k];
    const car = carEls.get(k);
    if (!car) return false;
    const mins = Math.max(12, Math.round((Date.now() - s.car.since) / 60000));
    const fee = Math.min(22, Math.ceil(mins / 60) * 2.5);
    const p = s.car.plate;
    s.car = null; s.busy = true;
    carEls.delete(k);
    setBay(k); counts();
    const top = m.row === "top", bx = m.x;
    const frames = top ? [
      { transform: pose(bx, m.y, 0), offset: 0 },
      { transform: pose(bx, 158, 0), offset: 0.3 },
      { transform: pose(bx + 22, 226, 60), offset: 0.45 },
      { transform: pose(bx + 56, LANE_OUT, 90), offset: 0.56 },
      { transform: pose(780, LANE_OUT, 90), offset: 1 },
    ] : [
      { transform: pose(bx, m.y, 180), offset: 0 },
      { transform: pose(bx, 262, 180), offset: 0.3 },
      { transform: pose(bx + 24, LANE_OUT + 4, 120), offset: 0.45 },
      { transform: pose(bx + 56, LANE_OUT, 90), offset: 0.56 },
      { transform: pose(780, LANE_OUT, 90), offset: 1 },
    ];
    const ms = 4800;
    const tGate = ms * (0.56 + 0.44 * ((640 - (bx + 56)) / (780 - (bx + 56))));
    pulseGate(gateOut, reduce ? 0 : Math.max(0, tGate - 700), 1500);
    animate(car, frames, ms, () => { car.remove(); s.busy = false; ghosts(); });
    const h = Math.floor(mins / 60), mm = mins % 60;
    log(`<span class="out">OUT</span> <b>${p}</b> ← ${m.id} · ${h ? h + "h " : ""}${mm}m · ${euro(fee)}`);
    return true;
  }

  function tick() {
    if (document.hidden || !visible) return;
    const f = floors[active];
    // EV charging progress
    f.forEach((s, k) => { if (s.car && s.type === "ev" && !s.busy && s.car.charge < 100) { s.car.charge = Math.min(100, s.car.charge + 3); setBay(k); } });
    // Other floors change quietly
    const other = pick(Object.keys(floors).filter((x) => x !== active));
    const ob = pick(floors[other]);
    if (ob.type !== "dis") ob.car = ob.car ? null : newCar();
    ghosts();
    if (moving > 1) return;
    const occ = f.filter((s) => s.car).length;
    if (occ < 7 || (occ < 16 && Math.random() < 0.55)) driveIn() || driveOut();
    else driveOut() || driveIn();
  }

  // ---------- Tooltip ----------
  bays.forEach((b, k) => {
    b.addEventListener("pointerenter", () => {
      if (dragging) return;
      const s = floors[active][k], m = bayMeta[k];
      b.classList.add("hover");
      const label = { std: "Standard bay", res: "Reserved bay", dis: "Accessible bay", ev: "EV charging bay" }[s.type];
      let body;
      if (s.car) {
        const mins = Math.max(1, Math.round((Date.now() - s.car.since) / 60000));
        const dur = (mins >= 60 ? Math.floor(mins / 60) + "h " : "") + (mins % 60) + "m";
        body = `<b>${s.car.plate}</b> <em>· parked ${dur}</em>` + (s.type === "ev" ? `<br><em>Charging</em> ${s.car.charge}%` : "");
      } else body = s.type === "res" ? "<em>Held for a reservation</em>" : "<em>Free now</em>";
      $("span", tip).innerHTML = `${m.id} · ${label}<br>${body}`;
      tip.style.left = m.x + "px"; tip.style.top = m.y + "px";
      tip.classList.add("show");
    });
    b.addEventListener("pointerleave", () => { b.classList.remove("hover"); tip.classList.remove("show"); });
  });

  // ---------- Stacked floors ----------
  const ghostEls = {};
  Object.keys(FLOORS).forEach((f) => {
    const g = el("div", "ghost", scale);
    g.dataset.floor = f;
    bayMeta.forEach((m) => {
      const t = el("i", "gt", g);
      t.style.left = m.left + 2 + "px"; t.style.top = m.top + 3 + "px";
    });
    el("i", "ramp", g);
    const anchor = el("i", "anchor", g);
    const gl = el("div", "glabel", root, "<span></span>");
    gl.anchor = anchor;
    gl.addEventListener("click", () => switchFloor(f));
    g.label = gl;
    g.addEventListener("click", () => switchFloor(f));
    ghostEls[f] = g;
  });
  function ghosts() {
    Object.keys(ghostEls).forEach((f) => {
      const g = ghostEls[f];
      const isActive = f === active;
      const gz = (Number(f) - Number(active)) * 330 + "px";
      g.style.setProperty("--gz", gz);
      g.style.visibility = isActive ? "hidden" : "";
      g.label.classList.toggle("cur", isActive);
      const tiles = $$(".gt", g);
      floors[f].forEach((s, k) => { tiles[k].className = "gt " + (s.car ? "taken" : "free"); });
      const free = floors[f].filter((s) => !s.car && s.type !== "dis" && s.type !== "res").length;
      $("span", g.label).innerHTML = isActive ? `${FLOORS[f]}<small>${free} free · live view</small>` : `${FLOORS[f]}<small>${free} free · click to open</small>`;
    });
  }

  // ---------- Floor switching ----------
  function switchFloor(f) {
    if (f === active) return;
    active = f;
    $$(".g-controls [data-floor]").forEach((b) => { const on = b.dataset.floor === f; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    floor.classList.remove("flip"); void floor.offsetWidth; floor.classList.add("flip");
    setTimeout(renderFloor, reduce ? 0 : 360);
    log(`<b>${FLOORS[f]}</b> opened`);
  }
  $$(".g-controls [data-floor]").forEach((b) => b.addEventListener("click", () => switchFloor(b.dataset.floor)));
  const stackBtn = $("#gStack");
  stackBtn.addEventListener("click", () => {
    const on = root.classList.toggle("stack");
    if (on) { savedRx = rx; rx = 70; } else rx = savedRx;
    apply(sway);
    if (on) { const t0 = performance.now(); (function follow(t) { placeLabels(); if (t - t0 < 1000) requestAnimationFrame(follow); })(t0); }
    stackBtn.classList.toggle("on", on);
    stackBtn.setAttribute("aria-pressed", on);
  });

  // ---------- Camera: drag to rotate, idle sway ----------
  let savedRx = 58, rx = 58, rz = -32, dragging = false, sx = 0, sy = 0, lastInput = 0;
  root.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".ghost, .glabel")) return;
    dragging = true; sx = e.clientX; sy = e.clientY;
    root.classList.add("dragging");
    root.setPointerCapture(e.pointerId);
    tip.classList.remove("show");
  });
  root.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    rz += (e.clientX - sx) * 0.35;
    rx = Math.max(30, Math.min(74, rx - (e.clientY - sy) * 0.25));
    sx = e.clientX; sy = e.clientY;
    lastInput = performance.now();
    apply(0);
  });
  const stopDrag = () => { dragging = false; root.classList.remove("dragging"); lastInput = performance.now(); };
  root.addEventListener("pointerup", stopDrag);
  root.addEventListener("pointercancel", stopDrag);

  let sway = 0;
  function apply(sw) {
    scale.style.setProperty("--rx", rx.toFixed(2) + "deg");
    scale.style.setProperty("--rz", (rz + sw).toFixed(2) + "deg");
    placeLabels();
  }
  // Floor labels are a flat overlay pinned to each floor's projected left edge.
  function placeLabels() {
    if (!root.classList.contains("stack")) return;
    const g = root.getBoundingClientRect();
    Object.values(ghostEls).forEach((gh) => {
      const r = gh.label.anchor.getBoundingClientRect();
      gh.label.style.transform = `translate(${(r.left - g.left).toFixed(1)}px, ${(r.top - g.top).toFixed(1)}px)`;
    });
  }
  let visible = false, raf = 0;
  function loop(t) {
    raf = 0;
    if (!visible) return;
    if (!dragging && t - lastInput > 2500) {
      sway += (Math.sin(t / 4200) * 6 - sway) * 0.05;
      apply(sway);
    }
    raf = requestAnimationFrame(loop);
  }
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !reduce && !raf) raf = requestAnimationFrame(loop);
    }, { threshold: 0.05 }).observe(root);
  } else visible = true;

  function fit() {
    const w = root.clientWidth;
    scale.style.setProperty("--gs", Math.min(1, (w - 10) / 880).toFixed(3));
  }
  fit();
  window.addEventListener("resize", fit);

  // ---------- Start ----------
  apply(0);
  renderFloor();
  log(`<span class="in">IN </span> <b>XHT-6666</b> → A07`);
  if (!reduce) setInterval(tick, 2600);
  else visible = true;
})();
