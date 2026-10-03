/* Parkareto — animated myDATA receipt (landing page, #mydata).
   Prints a Greek ΑΠΟΔΕΙΞΗ ΠΑΡΟΧΗΣ ΥΠΗΡΕΣΙΩΝ line by line, computes its UID,
   "transmits" it to myDATA, shows the ΜΑΡΚ, draws a scannable QR and stamps it. */
(function () {
  "use strict";
  const stage = document.getElementById("rcStage");
  if (!stage) return;

  const $ = (s, r = document) => r.querySelector(s);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pad = (n, l = 2) => String(n).padStart(l, "0");
  const money = (n) => n.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  let fast = false; // true while rendering the finished receipt instantly on load
  const sleep = (ms) => new Promise((r) => setTimeout(r, reduce || fast ? 0 : ms));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  // Sample issuer: deliberately fictitious, and the receipt carries a SAMPLE watermark.
  const ISSUER = { name: "PARKARETO ΣΤΑΘΜΕΥΣΗ", line: "Δείγμα επιχείρησης · Αθήνα", afm: "999123456", doy: "Α' ΑΘΗΝΩΝ", branch: 0 };
  const LETTERS = "ABEZHIKMNOPTXY";
  const RATE = 2.0;

  let seq = 418, mark = 400001928374651;
  function makeReceipt(first) {
    const now = new Date();
    const mins = first ? 134 : 25 + Math.floor(Math.random() * 300);
    const exit = new Date(now.getTime());
    const entry = new Date(exit.getTime() - mins * 60000);
    const hours = Math.max(1, Math.ceil(mins / 60));
    const total = Math.min(22, hours * RATE);
    const net = Math.round((total / 1.24) * 100) / 100;
    seq += first ? 0 : 1;
    mark += first ? 0 : 1 + Math.floor(Math.random() * 40);
    return {
      series: "Α", aa: seq, type: "11.2", date: exit,
      plate: first ? "XHT-6666" : Array.from({ length: 3 }, () => pick(LETTERS)).join("") + "-" + (1000 + Math.floor(Math.random() * 9000)),
      ticket: "TK-" + pad(seq, 5), entry, exit, mins, hours, total, net, vat: Math.round((total - net) * 100) / 100,
      card: pad(1000 + Math.floor(Math.random() * 9000), 4), tid: "7731" + pad(Math.floor(Math.random() * 100), 2),
      mark: String(mark),
    };
  }

  // UID as AADE defines it: SHA-1 of issuer ΑΦΜ, issue date, branch, type, series and number.
  async function uidOf(r) {
    const d = r.date;
    const src = [ISSUER.afm, `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, ISSUER.branch, r.type, r.series, r.aa].join("-");
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(src));
      return [...new Uint8Array(buf)].map((b) => pad(b.toString(16))).join("").toUpperCase();
    }
    let h = 0x811c9dc5, out = "";
    for (let k = 0; k < 5; k++) { for (const ch of src + k) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; out += pad(h.toString(16), 8); }
    return out.toUpperCase();
  }
  const authCode = (uid, mark) => {
    let h = 2166136261, s = "";
    for (let k = 0; k < 4; k++) { for (const ch of uid + mark + k) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; s += pad(h.toString(16), 8); }
    return s.toUpperCase();
  };

  function qrSvg(text) {
    if (!window.qrcode) return "";
    qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];
    const q = qrcode(0, "M");
    q.addData(text);
    q.make();
    const n = q.getModuleCount();
    let cells = "";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) cells += `<rect x="${x}" y="${y}" width="1.02" height="1.02" style="--d:${((x + y) * 9 + Math.random() * 120) | 0}ms"/>`;
    return `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" role="img" aria-label="QR code with the ΜΑΡΚ and UID of this receipt"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><g fill="#15171c">${cells}</g></svg>`;
  }

  // Decorative Code 128-style barcode for the ticket number.
  function barcode(text) {
    let h = 7, x = 0, bars = "";
    for (const ch of text + "*") for (let k = 0; k < 6; k++) {
      h = (h * 31 + ch.charCodeAt(0) + k) >>> 0;
      const w = 1 + (h % 3);
      if (k % 2 === 0) bars += `<rect x="${x}" width="${w}" height="38"/>`;
      x += w;
    }
    return `<svg viewBox="0 0 ${x} 38" preserveAspectRatio="none" aria-hidden="true"><g fill="#15171c">${bars}</g></svg>`;
  }

  const fmtDate = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  const fmtTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  // Each entry is one printed line (or block), in print order.
  function lines(r) {
    const dur = `${Math.floor(r.mins / 60)}ω ${pad(r.mins % 60)}λ`;
    return [
      `<div class="rc-logo"><img src="assets/logo.svg" alt="" width="84" height="50"></div>`,
      `<div class="rc-c rc-name">${ISSUER.name}</div>`,
      `<div class="rc-c rc-sm">${ISSUER.line}</div>`,
      `<div class="rc-c rc-sm">ΑΦΜ ${ISSUER.afm} · ΔΟΥ ${ISSUER.doy}</div>`,
      `<div class="rc-sep"></div>`,
      `<div class="rc-c rc-doc">ΑΠΟΔΕΙΞΗ ΠΑΡΟΧΗΣ ΥΠΗΡΕΣΙΩΝ</div>`,
      `<div class="rc-row"><span>Τύπος ${r.type} · Σειρά ${r.series}</span><b>Α/Α ${r.aa}</b></div>`,
      `<div class="rc-row"><span>${fmtDate(r.date)}</span><b>${fmtTime(r.date)}</b></div>`,
      `<div class="rc-sep"></div>`,
      `<div class="rc-row"><span>Εισιτήριο</span><b>#${r.ticket}</b></div>`,
      `<div class="rc-row"><span>Πινακίδα</span><b class="rc-plate">${esc(r.plate)}</b></div>`,
      `<div class="rc-row"><span>Είσοδος → Έξοδος</span><b>${fmtTime(r.entry)} → ${fmtTime(r.exit)}</b></div>`,
      `<div class="rc-row"><span>Διάρκεια</span><b>${dur}</b></div>`,
      `<div class="rc-sep dot"></div>`,
      `<div class="rc-item"><span>ΣΤΑΘΜΕΥΣΗ ΩΡΙΑΙΑ</span></div>`,
      `<div class="rc-row"><span>${r.hours} × ${money(RATE)}</span><b>${money(r.total)}</b></div>`,
      `<div class="rc-sep"></div>`,
      `<div class="rc-vat"><span>ΦΠΑ</span><span>ΚΑΘΑΡΗ</span><span>ΦΠΑ</span><span>ΣΥΝΟΛΟ</span><b>24%</b><b>${money(r.net)}</b><b>${money(r.vat)}</b><b>${money(r.total)}</b></div>`,
      `<div class="rc-sep"></div>`,
      `<div class="rc-total"><span>ΣΥΝΟΛΟ</span><b>${money(r.total)}</b></div>`,
      `<div class="rc-row rc-sm"><span>ΚΑΡΤΑ POS ****${r.card}</span><b>TID ${r.tid}</b></div>`,
      `<div class="rc-sep"></div>`,
      `<div class="rc-mydata" id="rcMy">
         <div class="rc-my-head"><span class="rc-my-logo">my<b>DATA</b></span><span class="rc-my-state" id="rcState">ΕΚΔΟΣΗ…</span></div>
         <div class="rc-kv"><span>ΜΑΡΚ</span><b id="rcMark" class="rc-mono">···············</b></div>
         <div class="rc-kv"><span>UID</span><b id="rcUid" class="rc-mono rc-uid">········································</b></div>
         <div class="rc-kv"><span>Κωδ. Αυθεντικοποίησης</span><b id="rcAuth" class="rc-mono rc-uid">································</b></div>
         <div class="rc-qr-row"><div class="rc-qr" id="rcQr"><i class="rc-qr-wait"></i></div>
           <div class="rc-qr-note">Σαρώστε για επαλήθευση<br><small>Scan to verify</small></div></div>
       </div>`,
      `<div class="rc-sep"></div>`,
      `<div class="rc-bar">${barcode(r.ticket)}<small>${r.ticket}</small></div>`,
      `<div class="rc-c rc-thanks">ΕΥΧΑΡΙΣΤΟΥΜΕ · ΚΑΛΟ ΔΡΟΜΟ</div>`,
      `<div class="rc-c rc-sm">Έκδοση μέσω Parkareto · διαβίβαση myDATA</div>`,
    ];
  }

  const paper = $("#rcPaper"), body = $("#rcBody"), printer = $("#rcPrinter"), btn = $("#rcReprint"), steps = [...document.querySelectorAll("#rcSteps li")];
  let running = false, first = true;

  function setStep(i, state) {
    steps.forEach((s, k) => s.classList.toggle("done", k < i || (k === i && state === "done")));
    steps.forEach((s, k) => s.classList.toggle("now", k === i && state !== "done"));
  }

  async function scramble(el, final, ms, alphabet) {
    if (reduce || fast) { el.textContent = final; return; }
    const t0 = performance.now();
    await new Promise((res) => {
      (function tick(t) {
        const k = Math.min(1, (t - t0) / ms);
        el.textContent = [...final].map((c, i) => (i < k * final.length ? c : alphabet[(Math.random() * alphabet.length) | 0])).join("");
        if (k < 1) requestAnimationFrame(tick); else res();
      })(t0);
    });
  }

  async function print(instant) {
    if (running) return;
    fast = !!instant;
    running = true;
    btn.disabled = true;
    const r = makeReceipt(first);
    first = false;
    paper.classList.remove("torn", "stamped", "sent");
    paper.classList.toggle("instant", fast);
    $(".rc-stamp", paper).classList.remove("slam");
    body.innerHTML = "";
    printer.classList.add("busy");
    setStep(0, "now");

    // 1. Print line by line
    for (const html of lines(r)) {
      const row = document.createElement("div");
      row.className = "rc-line";
      row.innerHTML = `<div class="rc-in">${html}</div>`;
      if (fast) row.classList.add("rc-static");
      body.appendChild(row);
      await sleep(html.includes("rc-mydata") ? 220 : html.includes("rc-sep") ? 50 : 95);
    }
    setStep(0, "done");

    // 2. UID (SHA-1 of the document keys)
    setStep(1, "now");
    $("#rcState").textContent = "ΥΠΟΓΡΑΦΗ UID…";
    const uid = await uidOf(r);
    await scramble($("#rcUid"), uid, 900, "0123456789ABCDEF");
    setStep(1, "done");

    // 3. Transmission to AADE
    setStep(2, "now");
    const state = $("#rcState");
    state.innerHTML = 'ΔΙΑΒΙΒΑΣΗ ΣΤΗΝ ΑΑΔΕ <i class="rc-dots"><i></i><i></i><i></i></i>';
    $("#rcMy").classList.add("sending");
    await sleep(1300);
    $("#rcMy").classList.remove("sending");
    setStep(2, "done");

    // 4. ΜΑΡΚ comes back
    setStep(3, "now");
    await scramble($("#rcMark"), r.mark, 700, "0123456789");
    await scramble($("#rcAuth"), authCode(uid, r.mark), 500, "0123456789ABCDEF");
    state.textContent = "ΔΙΑΒΙΒΑΣΤΗΚΕ ✓";
    state.classList.add("ok");
    paper.classList.add("sent");
    setStep(3, "done");

    // 5. QR code, stamp, tear
    setStep(4, "now");
    $("#rcQr").innerHTML = qrSvg(`ΜΑΡΚ:${r.mark}|UID:${uid}|ΑΦΜ:${ISSUER.afm}|ΣΥΝΟΛΟ:${r.total.toFixed(2)}|ΗΜ/ΝΙΑ:${fmtDate(r.date)}|ΔΕΙΓΜΑ`);
    if (!fast) $("#rcQr").classList.add("draw");
    await sleep(900);
    $(".rc-stamp", paper).classList.add("slam");
    paper.classList.add("stamped");
    await sleep(500);
    printer.classList.remove("busy");
    paper.classList.add("torn");
    setStep(4, "done");
    running = false;
    fast = false;
    btn.disabled = false;
  }

  btn.addEventListener("click", () => print());

  // Subtle 3D tilt that follows the pointer
  const tilt = $("#rcTilt");
  if (!reduce && window.matchMedia("(hover: hover)").matches) {
    stage.addEventListener("pointermove", (e) => {
      const b = stage.getBoundingClientRect();
      const x = (e.clientX - b.left) / b.width - 0.5, y = (e.clientY - b.top) / b.height - 0.5;
      tilt.style.transform = `rotateY(${(x * 10).toFixed(2)}deg) rotateX(${(-y * 6).toFixed(2)}deg)`;
    });
    stage.addEventListener("pointerleave", () => (tilt.style.transform = ""));
  }

  // Show the finished receipt straight away, then print a fresh one when the section scrolls into view.
  const ready = print(true);
  if (!reduce && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { io.disconnect(); ready.then(() => print()); } }, { threshold: 0.35 });
    io.observe(stage);
  }
})();
