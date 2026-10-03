(function () {
  "use strict";
  document.documentElement.classList.add("js");

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const pad = (n) => String(n).padStart(2, "0");
  const euro = (n, d = 2) => "€" + n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const now = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const nowS = () => { const d = new Date(); return `${now()}:${pad(d.getSeconds())}`; };

  // Letters shared by the Greek and Latin alphabets, as used on Greek plates.
  const L = "ABEZHIKMNOPTXY";
  const CAR_TINTS = ["#e8ecf3", "#c9d2e3", "#1f2a40", "#b91c1c", "#2563eb", "#f2c200", "#6b7280", "#0f172a"];
  const plate = () => Array.from({ length: 3 }, () => pick(L)).join("") + "-" + (1000 + Math.floor(Math.random() * 9000));

  // ---------- Intro loader ----------
  const loader = $("#loader");
  const hideLoader = () => loader && loader.classList.add("done");
  if (reduce) hideLoader();
  else {
    window.addEventListener("load", () => setTimeout(hideLoader, 700));
    setTimeout(hideLoader, 2600);
  }

  // ---------- Scroll progress + cursor glow ----------
  const progress = $("#progress");
  const onProgress = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.setProperty("--p", max > 0 ? (window.scrollY / max).toFixed(4) : 0);
  };
  window.addEventListener("scroll", onProgress, { passive: true });
  onProgress();
  const glowEl = $("#cursorGlow");
  window.addEventListener("pointermove", (e) => {
    glowEl.style.setProperty("--cx", e.clientX + "px");
    glowEl.style.setProperty("--cy", e.clientY + "px");
  }, { passive: true });

  // ---------- Rotating headline ----------
  const WORDS = ["on autopilot.", "in real time.", "paper-free.", "myDATA-ready."];
  const rot = $("#rotator");
  let wi = 0;
  if (!reduce) setInterval(() => {
    const cur = $(".rot-word", rot);
    cur.classList.add("out");
    setTimeout(() => {
      wi = (wi + 1) % WORDS.length;
      cur.textContent = WORDS[wi];
      cur.classList.remove("out");
      cur.classList.add("in");
      setTimeout(() => cur.classList.remove("in"), 650);
    }, 430);
  }, 3200);

  // ---------- Nav ----------
  const nav = $("#nav");
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 10);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  const burger = $("#burger"), links = $("#links");
  burger.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    nav.classList.toggle("menu-open", open);
    burger.setAttribute("aria-expanded", open);
  });
  $$("a", links).forEach((a) => a.addEventListener("click", () => { links.classList.remove("open"); nav.classList.remove("menu-open"); burger.setAttribute("aria-expanded", "false"); }));

  // ---------- Hero device tilt ----------
  const device = $("#device"), stage = $("#stage");
  function tilt() {
    const r = stage.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, 1 - (r.top - 80) / (window.innerHeight * 0.7)));
    const base = window.innerWidth < 900 ? 8 : 18;
    device.style.setProperty("--tilt", (base * (1 - p)).toFixed(2) + "deg");
    device.style.setProperty("--scale", (0.94 + 0.06 * p).toFixed(3));
  }
  if (!reduce) { window.addEventListener("scroll", tilt, { passive: true }); window.addEventListener("resize", tilt); tilt(); }
  else device.style.setProperty("--tilt", "0deg");

  // ---------- Live dashboard simulation ----------
  const lot = $("#lot");
  const ROWS = 4, COLS = 12;
  const bays = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const el = document.createElement("i");
      let s = Math.random() < 0.6 ? "o" : "g";
      if (r === 0 && c < 2) s = "b";
      if (r === ROWS - 1 && c > 9) s = "r";
      el.className = "bay " + s;
      el.style.setProperty("--cc", pick(CAR_TINTS));
      el.dataset.s = s;
      lot.appendChild(el);
      bays.push(el);
    }
    if (r % 2 === 1 && r < ROWS - 1) lot.appendChild(Object.assign(document.createElement("i"), { className: "lane-gap" }));
  }
  const stats = { total: bays.length, ins: 212, outs: 183, rev: 1284.5 };
  const inside = [];
  const recent = $("#recent");

  function updateStats() {
    const occ = bays.filter((b) => b.dataset.s === "o").length;
    const free = bays.filter((b) => b.dataset.s === "g").length;
    $("#mTotal").textContent = stats.total;
    $("#mFree").textContent = free;
    $("#mOcc").textContent = occ;
    $("#mFreePct").textContent = ((free / stats.total) * 100).toFixed(1) + "% available";
    $("#mOccPct").textContent = ((occ / stats.total) * 100).toFixed(1) + "% occupied";
    $("#mRev").textContent = euro(stats.rev);
    $("#mIO").textContent = `${stats.ins} in · ${stats.outs} out`;
    $("#liveMeter").style.width = Math.round((occ / stats.total) * 100) + "%";
  }

  function pushRecent(p, out, extra) {
    const li = document.createElement("li");
    if (out) li.className = "out";
    li.innerHTML = `<span class="car-ic"><svg><use href="#i-car"/></svg></span><div><b></b><small></small></div><em></em>`;
    li.querySelector("b").textContent = p;
    li.querySelector("small").textContent = (out ? "Exit: " : "Entry: ") + now();
    li.querySelector("em").textContent = extra;
    recent.prepend(li);
    while (recent.children.length > 4) recent.lastChild.remove();
  }

  function typePlate(p, done) {
    const el = $("#gatePlate");
    el.classList.add("typing");
    el.textContent = "";
    let i = 0;
    const t = setInterval(() => {
      el.textContent = p.slice(0, ++i);
      if (i >= p.length) {
        clearInterval(t);
        const rec = $(".rec");
        rec.classList.add("flash");
        setTimeout(() => { rec.classList.remove("flash"); el.classList.remove("typing"); el.textContent = "PLATE"; }, 700);
        done();
      }
    }, 70);
  }

  function simulate() {
    const free = bays.filter((b) => b.dataset.s === "g");
    const occ = bays.filter((b) => b.dataset.s === "o");
    const enter = free.length > 6 && (occ.length < 12 || Math.random() < 0.55);
    if (enter) {
      const p = plate();
      $("#floatPlate").textContent = p;
      typePlate(p, () => {
        const bay = pick(free);
        bay.dataset.s = "o";
        bay.style.setProperty("--cc", pick(CAR_TINTS));
        bay.className = "bay o pulse";
        setTimeout(() => bay.classList.remove("pulse"), 1400);
        inside.push(p);
        stats.ins++;
        pushRecent(p, false, "Zone " + pick(["A", "A", "B"]));
        updateStats();
      });
    } else if (occ.length) {
      const bay = pick(occ);
      bay.dataset.s = "g";
      bay.className = "bay g pulse";
      setTimeout(() => bay.classList.remove("pulse"), 1400);
      const fee = pick([2, 3, 4, 4.5, 6, 8, 10]);
      stats.outs++;
      stats.rev += fee;
      pushRecent(inside.shift() || plate(), true, euro(fee));
      updateStats();
    }
  }
  ["XHT-3424", "XHT-3343", "XHT-6666"].forEach((p) => pushRecent(p, false, "Zone A"));
  $$("#recent small").forEach((s, i) => (s.textContent = "Entry: " + ["20:55", "19:57", "15:15"][i]));
  updateStats();
  if (!reduce) setInterval(simulate, 2600);

  // Session clock
  let secs = 43 * 60 + 7;
  setInterval(() => {
    secs++;
    $("#mockClock").textContent = `${pad(Math.floor(secs / 3600))}:${pad(Math.floor((secs % 3600) / 60))}:${pad(secs % 60)}`;
  }, 1000);

  // ---------- ANPR camera scene ----------
  const cam = $("#cam"), consoleEl = $("#console"), carG = $("#car"), camStatus = $("#camStatus");
  const CAR_PAINTS = [
    ["#1d2b4a", "#4a6292", "#0b1222"], // midnight blue
    ["#b91c1c", "#ef6b6b", "#4a0909"], // red
    ["#e5e9f0", "#ffffff", "#8b95a7"], // white
    ["#f2c200", "#ffe46b", "#7a5f00"], // Athens taxi yellow
    ["#2b2f36", "#5b6270", "#0c0e12"], // graphite
    ["#8a96a8", "#d3dae6", "#3b4352"], // silver
  ];
  let ticket = 418, paint = 0;
  const log = (html) => {
    const d = document.createElement("div");
    d.innerHTML = `<span class="t">${nowS()}</span> ${html}`;
    consoleEl.appendChild(d);
    while (consoleEl.children.length > 6) consoleEl.firstChild.remove();
  };
  const status = (txt, ok) => { camStatus.textContent = txt; camStatus.classList.toggle("ok", !!ok); };
  const later = (ms, fn) => setTimeout(fn, reduce ? 0 : ms);
  function anprCycle() {
    const p = plate();
    const conf = (97 + Math.random() * 2.9).toFixed(1);
    const sub = Math.random() < 0.3;
    const [c, hi, lo] = CAR_PAINTS[paint++ % CAR_PAINTS.length];
    cam.style.setProperty("--car", c); cam.style.setProperty("--car-hi", hi); cam.style.setProperty("--car-lo", lo);
    $("#plateText").textContent = p;
    cam.classList.remove("locked", "open");
    carG.classList.remove("leave");
    void carG.getBoundingClientRect();
    carG.classList.add("arrive");
    cam.classList.add("scanning");
    status("VEHICLE APPROACHING");
    log(`<span class="w">CAM-01</span> vehicle detected · lane 1`);
    later(1700, () => {
      $("#bboxText").textContent = `${p} · ${conf}%`;
      cam.classList.add("locked");
      cam.classList.remove("scanning");
      status("PLATE READ " + p, true);
      log(`<span class="am">ANPR</span> read <span class="w">${p}</span> · confidence ${conf}%`);
    });
    later(2500, () => {
      if (sub) log(`<span class="ok">MATCH</span> subscriber · monthly pass valid`);
      else log(`<span class="ok">TICKET</span> #TK-${String(++ticket).padStart(5, "0")} issued`);
    });
    later(3100, () => { cam.classList.add("open"); status("BARRIER OPEN", true); log(`<span class="ok">GATE</span> barrier OPEN · bay map updated`); });
    later(4400, () => { cam.classList.remove("locked"); carG.classList.remove("arrive"); carG.classList.add("leave"); });
    later(5700, () => { cam.classList.remove("open"); status("SCANNING"); });
    later(6400, () => { carG.classList.remove("leave"); });
  }
  $("#camTime").textContent = nowS();
  setInterval(() => ($("#camTime").textContent = nowS()), 1000);
  anprCycle();
  if (!reduce) setInterval(anprCycle, 7200);

  // ---------- 3D garage ----------
  const g3d = $("#g3d"), floor = $("#floor3d"), gScale = $("#gScale");
  const BAY_W = 60, BAY_H = 118, X0 = 40, TOP_Y = 18, BOT_Y = 284, LANE_IN = 178, LANE_OUT = 240;
  const G_PAINTS = [["#e5e9f0", "#9aa6ba", "#8b95a7"], ["#b91c1c", "#2a0c0c", "#5c0f0f"], ["#1d2b4a", "#0e1628", "#0b1222"], ["#f2c200", "#3a2f05", "#7a5f00"], ["#2b2f36", "#14171c", "#0c0e12"], ["#8a96a8", "#2b3240", "#3b4352"], ["#2563eb", "#0d1b3d", "#13306f"]];
  const gBays = [];
  floor.insertAdjacentHTML("beforeend", '<i class="slab-b"></i><i class="slab-r"></i>');
  ["top", "bot"].forEach((row) => {
    for (let i = 0; i < 10; i++) {
      const el = document.createElement("div");
      el.className = "bay3d " + row;
      el.style.left = X0 + i * BAY_W + "px";
      el.style.top = (row === "top" ? TOP_Y : BOT_Y) + "px";
      el.innerHTML = '<i class="beacon"></i>';
      floor.appendChild(el);
      gBays.push({ el, row, i, x: X0 + i * BAY_W + BAY_W / 2, y: (row === "top" ? TOP_Y : BOT_Y) + BAY_H / 2, type: "std", car: null, busy: false });
    }
  });
  [[X0 + 5 * BAY_W - 9, TOP_Y + BAY_H + 2], [X0 + 5 * BAY_W - 9, BOT_Y - 20]].forEach(([x, y]) => {
    const p = document.createElement("div");
    p.className = "pillar";
    p.style.left = x + "px"; p.style.top = y + "px";
    p.innerHTML = '<i class="p1"></i><i class="p2"></i><i class="p3"></i><i class="p4"></i><i class="pt"></i>';
    floor.appendChild(p);
  });

  function carPose(x, y, rot) { return `translate(${x - 21}px, ${y - 42}px) rotate(${rot}deg)`; }
  function makeCar() {
    const c = document.createElement("div");
    const [col, hi, lo] = pick(G_PAINTS);
    c.className = "car3d";
    c.style.setProperty("--c", col); c.style.setProperty("--c-hi", hi); c.style.setProperty("--c-lo", lo);
    c.innerHTML = '<i class="cs"></i><i class="cl"></i><i class="cr"></i><i class="cf"></i><i class="cb"></i><i class="ct"></i>';
    floor.appendChild(c);
    return c;
  }
  function parkAt(b) {
    b.car = makeCar();
    b.car.style.transform = carPose(b.x, b.y, b.row === "top" ? 0 : 180);
    b.el.classList.add("taken");
  }
  const counts = () => ({
    free: gBays.filter((b) => !b.car && b.type !== "res" && b.type !== "dis").length,
    occ: gBays.filter((b) => b.car).length,
    res: gBays.filter((b) => b.type === "res").length,
    ev: gBays.filter((b) => b.type === "ev" && b.car).length,
  });
  function renderCounts() {
    const c = counts();
    [["gFree", c.free], ["gOcc", c.occ], ["gRes", c.res], ["gEv", c.ev]].forEach(([id, v]) => {
      const el = $("#" + id);
      if (el.textContent !== String(v)) { el.textContent = v; el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
    });
  }
  const feed = $("#gFeed");
  function feedLine(html) {
    const li = document.createElement("li");
    li.innerHTML = `${now()} ${html}`;
    feed.prepend(li);
    while (feed.children.length > 4) feed.lastChild.remove();
  }
  const bayName = (b) => (b.row === "top" ? "A" : "B") + String(b.i + 1).padStart(2, "0");

  let floorNo = 0;
  function layoutFloor(n) {
    gBays.forEach((b) => {
      if (b.car) { b.car.remove(); b.car = null; }
      b.busy = false;
      b.el.classList.remove("taken", "res", "dis", "ev");
      b.type = "std";
    });
    const seed = (n + 2) * 7;
    gBays.forEach((b, k) => {
      if (b.row === "top" && b.i < 2) b.type = "dis";
      else if (b.row === "bot" && b.i > 7) b.type = "ev";
      else if ((k * 13 + seed) % 11 === 0) b.type = "res";
      if (b.type !== "std") b.el.classList.add(b.type);
      if (b.type !== "dis" && Math.random() < (n === 1 ? 0.35 : 0.6)) parkAt(b);
    });
    renderCounts();
  }

  function driveIn() {
    const free = gBays.filter((b) => !b.car && !b.busy && b.type !== "dis");
    if (!free.length) return false;
    const b = pick(free);
    const p = plate();
    b.busy = true;
    const car = makeCar();
    const top = b.row === "top";
    const laneY = top ? LANE_IN : LANE_OUT - 12;
    const frames = [
      { transform: carPose(-60, LANE_IN, 90), offset: 0 },
      { transform: carPose(b.x - 34, laneY, 90), offset: 0.55 },
      { transform: carPose(b.x, laneY + (top ? -26 : 26), top ? 0 : 180), offset: 0.75 },
      { transform: carPose(b.x, b.y, top ? 0 : 180), offset: 1 },
    ];
    const anim = car.animate(frames, { duration: reduce ? 1 : 3600, easing: "cubic-bezier(.45,.05,.35,1)", fill: "forwards" });
    anim.onfinish = () => {
      car.style.transform = carPose(b.x, b.y, top ? 0 : 180);
      anim.cancel();
      b.car = car; b.busy = false;
      b.el.classList.add("taken");
      renderCounts();
    };
    feedLine(`<span class="in">IN </span> <b>${p}</b> → bay ${bayName(b)}${b.type === "ev" ? " · charging" : b.type === "res" ? " · reservation" : ""}`);
    return true;
  }
  function driveOut() {
    const taken = gBays.filter((b) => b.car && !b.busy);
    if (!taken.length) return false;
    const b = pick(taken);
    const car = b.car;
    const top = b.row === "top";
    b.busy = true; b.car = null;
    b.el.classList.remove("taken");
    renderCounts();
    const rot = top ? 0 : 180;
    const frames = [
      { transform: carPose(b.x, b.y, rot), offset: 0 },
      { transform: carPose(b.x, top ? LANE_IN + 10 : LANE_OUT - 10, rot), offset: 0.35 },
      { transform: carPose(b.x + 40, LANE_OUT - 8, 90), offset: 0.55 },
      { transform: carPose(760, LANE_OUT - 8, 90), offset: 1 },
    ];
    const anim = car.animate(frames, { duration: reduce ? 1 : 3400, easing: "cubic-bezier(.45,.05,.35,1)", fill: "forwards" });
    anim.onfinish = () => { car.remove(); b.busy = false; };
    feedLine(`<span class="out">OUT</span> <b>${plate()}</b> ← bay ${bayName(b)} · ${euro(pick([2, 3, 4.5, 6, 8]))}`);
    return true;
  }
  layoutFloor(floorNo);
  feedLine(`<span class="in">IN </span> <b>XHT-6666</b> → bay A07`);
  if (!reduce) setInterval(() => {
    if (document.hidden) return;
    const occ = counts().occ;
    if (occ < 6 || (occ < 16 && Math.random() < 0.55)) driveIn() || driveOut();
    else driveOut() || driveIn();
  }, 2300);

  $$(".floors button").forEach((btn) => btn.addEventListener("click", () => {
    if (btn.classList.contains("on")) return;
    $$(".floors button").forEach((x) => { x.classList.toggle("on", x === btn); x.setAttribute("aria-selected", x === btn); });
    floorNo = Number(btn.dataset.floor);
    floor.classList.remove("flip"); void floor.offsetWidth; floor.classList.add("flip");
    later(360, () => layoutFloor(floorNo));
    feedLine(`<b>${btn.textContent}</b> selected`);
  }));

  function fitGarage() {
    const w = g3d.clientWidth;
    gScale.style.setProperty("--gs", Math.min(1, (w - 10) / 900).toFixed(3));
  }
  fitGarage();
  window.addEventListener("resize", fitGarage);
  if (!reduce && window.matchMedia("(hover: hover)").matches) {
    g3d.addEventListener("pointermove", (e) => {
      const r = g3d.getBoundingClientRect();
      const dx = (e.clientX - r.left) / r.width - 0.5, dy = (e.clientY - r.top) / r.height - 0.5;
      floor.style.setProperty("--rz", (-32 + dx * 24).toFixed(1) + "deg");
      floor.style.setProperty("--rx", (58 - dy * 14).toFixed(1) + "deg");
    });
    g3d.addEventListener("pointerleave", () => { floor.style.removeProperty("--rz"); floor.style.removeProperty("--rx"); });
  }

  // ---------- Floor designer ----------
  const designer = $("#designer");
  const cycle = { g: "r", r: "b", b: "e", e: "g" };
  const names = { g: "available", r: "reserved", b: "disabled", e: "EV charging" };
  for (let r = 0; r < 3; r++) {
    if (r === 1) {
      const lane = document.createElement("div");
      lane.className = "lane";
      lane.innerHTML = "<span>→</span><span>→</span><span>→</span><span>→</span>";
      designer.appendChild(lane);
    }
    for (let c = 0; c < 14; c++) {
      const b = document.createElement("button");
      let s = "g";
      if (r === 0 && c < 2) s = "b";
      if (r === 2 && c > 11) s = "e";
      if (r === 0 && (c === 6 || c === 7)) s = "r";
      b.className = s;
      b.type = "button";
      b.setAttribute("aria-label", `Bay ${r + 1}-${c + 1}: ${names[s]}`);
      b.addEventListener("click", () => {
        const n = cycle[b.className];
        b.className = n;
        b.setAttribute("aria-label", `Bay ${r + 1}-${c + 1}: ${names[n]}`);
      });
      designer.appendChild(b);
    }
  }

  // ---------- Accounting bars ----------
  const bars = $("#bars");
  [32, 45, 38, 52, 61, 48, 70, 66, 58, 74, 81, 69, 88, 96].forEach((h, i) => {
    const el = document.createElement("i");
    el.style.setProperty("--h", h + "%");
    el.style.animationDelay = i * 0.05 + "s";
    bars.appendChild(el);
  });

  // ---------- Tile spotlight ----------
  const canHover = window.matchMedia("(hover: hover)").matches && !reduce;
  $$(".tile").forEach((t) => {
    t.addEventListener("pointermove", (e) => {
      const r = t.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      t.style.setProperty("--mx", x + "px");
      t.style.setProperty("--my", y + "px");
      if (!canHover) return;
      t.classList.add("tilting");
      t.style.transform = `perspective(900px) rotateX(${((y / r.height) - 0.5) * -7}deg) rotateY(${((x / r.width) - 0.5) * 7}deg) translateY(-4px)`;
    });
    t.addEventListener("pointerleave", () => { t.classList.remove("tilting"); t.style.transform = ""; });
  });

  // ---------- Magnetic buttons ----------
  if (canHover) $$(".btn-amber, .btn-glass").forEach((b) => {
    b.addEventListener("pointermove", (e) => {
      const r = b.getBoundingClientRect();
      b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.18}px, ${(e.clientY - r.top - r.height / 2) * 0.25 - 2}px)`;
    });
    b.addEventListener("pointerleave", () => (b.style.transform = ""));
  });

  // ---------- Reveal + counters ----------
  const revealTargets = $$(".sec-head, .sec-copy, .tile, .flow li, .plan, .nums div, .anpr, .receipt-wrap, .est-out, .market-card, .demo");
  revealTargets.forEach((el) => el.classList.add("rv"));
  function countUp(el) {
    const end = Number(el.dataset.count), pre = el.dataset.prefix || "", suf = el.dataset.suffix || "";
    if (reduce || end === 0) { el.textContent = pre + end + suf; return; }
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 1200);
      el.textContent = pre + Math.round(end * (1 - Math.pow(1 - k, 3))) + suf;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("in");
        $$("[data-count]", e.target).forEach(countUp);
        io.unobserve(e.target);
      });
    }, { threshold: 0.12 });
    revealTargets.forEach((el) => io.observe(el));
  } else {
    revealTargets.forEach((el) => el.classList.add("in"));
    $$("[data-count]").forEach(countUp);
  }

  // ---------- Pricing toggle ----------
  function setBilling(period) {
    $$(".billing button").forEach((b) => b.classList.toggle("on", b.dataset.bill === period));
    $$(".price b[data-m]").forEach((b) => (b.textContent = "€" + Number(period === "year" ? b.dataset.y : b.dataset.m).toLocaleString("en-US")));
    $$(".price .per").forEach((s) => (s.textContent = period === "year" ? "/ year" : "/ month"));
    $$(".addons em[data-m]").forEach((e) => (e.textContent = "€" + (period === "year" ? e.dataset.y + " / year" : e.dataset.m + " / month")));
  }
  $$(".billing button").forEach((b) => b.addEventListener("click", () => setBilling(b.dataset.bill)));
  $$("[data-plan]").forEach((a) => a.addEventListener("click", () => { $("#fPlan").value = a.dataset.plan === "Enterprise" ? "Enterprise" : a.dataset.plan; }));

  // ---------- Revenue estimator ----------
  function estimate() {
    const bays = +$("#eBays").value, occ = +$("#eOcc").value / 100, rate = +$("#eRate").value, hours = +$("#eHours").value;
    $("#eBaysV").textContent = bays;
    $("#eOccV").textContent = Math.round(occ * 100) + "%";
    $("#eRateV").textContent = euro(rate);
    $("#eHoursV").textContent = hours + " h";
    const carHoursDay = bays * occ * hours;
    $("#eOut").textContent = euro(carHoursDay * rate * 30, 0);
    $("#eDay").textContent = euro(carHoursDay * rate, 0);
    $("#eCarH").textContent = Math.round(carHoursDay * 30).toLocaleString("en-US");
    let plan = "Starter", why = "Fits up to 60 bays on one floor.";
    if (bays > 400) { plan = "Enterprise"; why = "More than 400 bays: unlimited capacity and on-site setup."; }
    else if (bays > 60) { plan = "Pro"; why = `€129 / month is ${((129 / (carHoursDay * rate * 30)) * 100).toFixed(1)}% of this estimate.`; }
    $("#ePlan").textContent = plan;
    $("#ePlanWhy").textContent = why;
  }
  $$(".sliders input").forEach((i) => i.addEventListener("input", estimate));
  estimate();

  // ---------- Demo form ----------
  const form = $("#demoForm"), msg = $("#formMsg");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const required = [$("#fName"), $("#fEmail")];
    let ok = true;
    required.forEach((f) => { const bad = !f.value.trim() || !f.checkValidity(); f.classList.toggle("invalid", bad); if (bad) ok = false; });
    if (!ok) {
      msg.className = "form-msg err";
      msg.textContent = "Add your name and a valid email so we can reach you.";
      return;
    }
    const d = Object.fromEntries(new FormData(form));
    const body = `Name: ${d.name}\nCompany: ${d.company}\nEmail: ${d.email}\nPhone: ${d.phone}\nBays: ${d.bays}\nPlan: ${d.plan}\n\n${d.message}`;
    window.location.href = `mailto:sales@parkareto.example?subject=${encodeURIComponent("Parkareto demo request")}&body=${encodeURIComponent(body)}`;
    msg.className = "form-msg ok";
    msg.textContent = `Thanks, ${d.name.split(" ")[0]}. Your email app is opening with the request filled in. Send it and we'll get back to you.`;
  });

  $("#year").textContent = new Date().getFullYear();
})();
