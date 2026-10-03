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
  const plate = () => Array.from({ length: 3 }, () => pick(L)).join("") + "-" + (1000 + Math.floor(Math.random() * 9000));

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

  // ---------- ANPR scanner ----------
  const cam = $(".cam"), consoleEl = $("#console"), bbox = $(".bbox");
  let ticket = 418;
  const log = (html) => {
    const d = document.createElement("div");
    d.innerHTML = `<span class="t">${nowS()}</span> ${html}`;
    consoleEl.appendChild(d);
    while (consoleEl.children.length > 7) consoleEl.firstChild.remove();
  };
  function anprCycle() {
    const p = plate();
    const conf = (97 + Math.random() * 2.9).toFixed(1);
    const sub = Math.random() < 0.3;
    $("#plateText").textContent = p;
    cam.classList.remove("locked");
    log(`<span class="w">CAM-01</span> vehicle detected · lane 1`);
    setTimeout(() => {
      bbox.dataset.l = `${p} · ${conf}%`;
      cam.classList.add("locked");
      log(`<span class="am">ANPR</span> read <span class="w">${p}</span> · confidence ${conf}%`);
    }, 1100);
    setTimeout(() => {
      if (sub) log(`<span class="ok">MATCH</span> subscriber · monthly pass valid`);
      else log(`<span class="ok">TICKET</span> #TK-${String(++ticket).padStart(5, "0")} issued`);
    }, 2000);
    setTimeout(() => log(`<span class="ok">GATE</span> barrier OPEN · bay map updated`), 2700);
  }
  $("#camTime").textContent = nowS();
  setInterval(() => ($("#camTime").textContent = nowS()), 1000);
  anprCycle();
  if (!reduce) setInterval(anprCycle, 6000);

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
  $$(".tile").forEach((t) =>
    t.addEventListener("pointermove", (e) => {
      const r = t.getBoundingClientRect();
      t.style.setProperty("--mx", e.clientX - r.left + "px");
      t.style.setProperty("--my", e.clientY - r.top + "px");
    })
  );

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
    window.location.href = `mailto:sales@sinaparking.example?subject=${encodeURIComponent("SINA Parking demo request")}&body=${encodeURIComponent(body)}`;
    msg.className = "form-msg ok";
    msg.textContent = `Thanks, ${d.name.split(" ")[0]}. Your email app is opening with the request filled in. Send it and we'll get back to you.`;
  });

  $("#year").textContent = new Date().getFullYear();
})();
