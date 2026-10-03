/* Parkareto accounts in the browser: sign in / create account window with two-step
   verification, authenticator setup and recovery codes.
   Talks to the Parkareto server when there is one; otherwise runs a clearly labelled
   demo that keeps accounts in this browser so the flow can still be tried. */
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const listeners = new Set();
  const state = { user: null, mode: null, ready: null };

  // =====================================================================
  // Password rules (mirror of the server's; the server has the final say)
  // =====================================================================
  const COMMON = new Set("123456 123456789 12345678 password qwerty123 qwerty 1234567890 1234567 password1 12345 iloveyou 111111 123123 abc123 qwertyuiop 000000 1q2w3e4r 654321 superman 1qaz2wsx 7777777 121212 123qwe password123 qwerty12345 football monkey letmein dragon baseball sunshine princess welcome shadow master michael 666666 trustno1 passw0rd zaq12wsx 987654321 aa123456 1234qwer asdfghjkl asdf1234 q1w2e3r4t5 admin123 administrator changeme parkareto parking123 athens2024 hellas olympiakos panathinaikos".split(" "));
  function passwordCheck(pw, email, name) {
    const low = pw.toLowerCase();
    const kinds = [/[a-zα-ω]/, /[A-ZΑ-Ω]/, /\d/, /[^\w\s]/].filter((r) => r.test(pw)).length;
    const local = String(email || "").split("@")[0].toLowerCase();
    const first = String(name || "").trim().split(/\s+/)[0].toLowerCase();
    const rules = [
      { ok: pw.length >= 10, text: "At least 10 characters" },
      { ok: kinds >= 3 || pw.length >= 14, text: "Mix of letters, numbers or symbols (or 14+ characters)" },
      { ok: pw.length > 0 && !COMMON.has(low) && !COMMON.has(low.replace(/[^a-z0-9]/g, "")) && !/^(.)\1+$/.test(pw), text: "Not a common password" },
      { ok: pw.length > 0 && !(local.length >= 4 && low.includes(local)) && !(first.length >= 4 && low.includes(first)), text: "Doesn't contain your name or email" },
    ];
    let score = 0;
    if (pw.length >= 10) score++;
    if (pw.length >= 14) score++;
    if (kinds >= 3) score++;
    if (pw.length >= 18 || (kinds === 4 && pw.length >= 12)) score++;
    if (!rules.every((r) => r.ok)) score = Math.min(score, 1);
    return { rules, score, ok: rules.every((r) => r.ok) };
  }

  // =====================================================================
  // Crypto helpers for the in-browser demo (TOTP, password hashing)
  // =====================================================================
  const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  function b32enc(bytes) { let bits = 0, v = 0, out = ""; for (const b of bytes) { v = (v << 8) | b; bits += 8; while (bits >= 5) { out += B32[(v >>> (bits - 5)) & 31]; bits -= 5; } } if (bits) out += B32[(v << (5 - bits)) & 31]; return out; }
  function b32dec(s) { let bits = 0, v = 0; const out = []; for (const c of s.replace(/[^A-Z2-7]/gi, "").toUpperCase()) { v = (v << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } } return new Uint8Array(out); }
  async function hotp(secret, counter) {
    const key = await crypto.subtle.importKey("raw", b32dec(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
    const msg = new ArrayBuffer(8); new DataView(msg).setUint32(4, counter);
    const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
    const o = h[19] & 15;
    return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, "0");
  }
  async function totpCheck(secret, code, last) {
    const step = Math.floor(Date.now() / 30000);
    for (const d of [0, -1, 1]) if (step + d > last && (await hotp(secret, step + d)) === code) return step + d;
    return -1;
  }
  const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  async function pbkdf2(pw, saltHex) {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw.normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);
    const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
    return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 150000 }, key, 256));
  }
  const sha = async (s) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  const sixDigits = () => String(new Uint32Array(rand(4).buffer)[0] % 1e6).padStart(6, "0");
  const recoveryCodes = () => Array.from({ length: 10 }, () => { const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const r = [...rand(10)].map((b) => a[b % a.length]).join(""); return r.slice(0, 5) + "-" + r.slice(5); });
  const normRc = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const mask = (e) => { const [u, d] = e.split("@"); return (u.length <= 2 ? u[0] + "*" : u[0] + "*".repeat(Math.min(6, u.length - 2)) + u[u.length - 1]) + "@" + d; };

  // =====================================================================
  // Demo backend: same endpoints and answers as the server, kept in this browser
  // =====================================================================
  const Demo = (function () {
    const KEY = "pk-demo-accounts", SKEY = "pk-demo-session";
    const challenges = new Map();
    const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { users: [], next: 1 }; } catch (_) { return { users: [], next: 1 }; } };
    const save = (db) => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (_) {} };
    const sessionUser = (db) => { let id = null; try { id = Number(localStorage.getItem(SKEY)); } catch (_) {} return db.users.find((u) => u.id === id) || null; };
    const setSession = (id) => { try { id ? localStorage.setItem(SKEY, String(id)) : localStorage.removeItem(SKEY); } catch (_) {} };
    const err = (status, error, fields) => ({ ok: false, status, data: { error, ...(fields ? { fields } : {}) } });
    const ok = (data, status = 200) => ({ ok: true, status, data });
    const pub = (u) => ({ id: u.id, name: u.name, email: u.email, emailVerified: u.verified, twoFactor: u.totp ? "app" : "email", plates: u.plates, recoveryCodesLeft: u.totp ? u.recovery.filter((r) => !r.used).length : 0, createdAt: u.createdAt });
    function mail(to, subject, code) { inbox(to, subject, code); }
    function newChallenge(user, purpose, method, remember, sendTo) {
      const id = hex(rand(16));
      const c = { id, userId: user ? user.id : null, purpose, method, attempts: 0, remember, sentAt: Date.now(), expires: Date.now() + 600000 };
      if (method === "email") { c.code = sixDigits(); if (user) mail(user.email, { verify: "Confirm your email", login: "Your sign-in code", reset: "Reset your password" }[purpose], c.code); }
      challenges.set(id, c);
      return { challenge: id, method, to: mask(sendTo || (user && user.email) || "") };
    }
    async function check(c, body, db) {
      const u = db.users.find((x) => x.id === c.userId);
      const code = String(body.code || "").replace(/\s/g, "");
      let via = false;
      if (u && body.recoveryCode && c.method === "totp") {
        const h = await sha(normRc(body.recoveryCode));
        const r = u.recovery.find((x) => !x.used && x.hash === h);
        if (r) { r.used = true; via = "recovery"; }
      } else if (u && c.method === "totp" && u.totp) {
        const step = await totpCheck(u.totp, code, u.lastStep || 0);
        if (step > 0) { u.lastStep = step; via = "totp"; }
      } else if (c.method === "email" && u && code === c.code) via = "email";
      if (!via) {
        c.attempts++;
        const left = 5 - c.attempts;
        if (left <= 0) challenges.delete(c.id);
        return { fail: err(401, left > 0 ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` : "That code isn't right. Start again.", left > 0 ? { code: "wrong" } : { restart: true }) };
      }
      return { user: u, via };
    }
    function getChallenge(id, purposes) {
      const c = challenges.get(id);
      if (!c || !purposes.includes(c.purpose) || c.expires < Date.now()) return null;
      return c;
    }
    async function call(method, path, body = {}) {
      await new Promise((r) => setTimeout(r, 250 + Math.random() * 250));
      const db = load();
      const me = sessionUser(db);
      const R = method + " " + path;
      const needUser = () => (me ? null : err(401, "Sign in to continue.", { auth: "required" }));
      if (R === "GET /api/auth/me") return ok({ user: me ? pub(me) : null });
      if (R === "POST /api/auth/signup") {
        const email = String(body.email || "").trim().toLowerCase(), name = String(body.name || "").trim(), pw = String(body.password || "");
        const f = {};
        if (!name) f.name = "Add your name.";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) f.email = "Enter a valid email address.";
        const pc = passwordCheck(pw, email, name);
        if (!pc.ok) f.password = pc.rules.find((r) => !r.ok).text + ".";
        if (!body.accept) f.accept = "Accept the terms to create an account.";
        if (Object.keys(f).length) return err(422, Object.values(f)[0], f);
        const exists = db.users.find((u) => u.email === email);
        if (exists) { mail(email, "You already have a Parkareto account", null); return ok(newChallenge(null, "verify", "email", false, email)); }
        const salt = hex(rand(16));
        const u = { id: db.next++, email, name, salt, pw: await pbkdf2(pw, salt), verified: false, totp: null, totpPending: null, lastStep: 0, plates: [], recovery: [], createdAt: new Date().toISOString() };
        db.users.push(u); save(db);
        return ok(newChallenge(u, "verify", "email", !!body.remember));
      }
      if (R === "POST /api/auth/login") {
        const email = String(body.email || "").trim().toLowerCase();
        const u = db.users.find((x) => x.email === email);
        if (!u || (await pbkdf2(String(body.password || ""), u.salt)) !== u.pw) return err(401, "Wrong email or password.");
        return ok(newChallenge(u, "login", u.totp && u.verified ? "totp" : "email", !!body.remember));
      }
      if (R === "POST /api/auth/verify") {
        const c = getChallenge(body.challenge, ["verify", "login"]);
        if (!c) return err(410, "This step has expired. Start again.", { restart: true });
        const r = await check(c, body, db);
        if (r.fail) { save(db); return r.fail; }
        challenges.delete(c.id);
        if (r.via === "email") r.user.verified = true;
        save(db); setSession(r.user.id);
        return ok({ user: pub(r.user), via: r.via, recoveryCodesLeft: r.via === "recovery" ? r.user.recovery.filter((x) => !x.used).length : undefined });
      }
      if (R === "POST /api/auth/resend") {
        const c = getChallenge(body.challenge, ["verify", "login", "reset"]);
        if (!c) return err(410, "This step has expired. Start again.", { restart: true });
        const wait = 30000 - (Date.now() - c.sentAt);
        if (wait > 0) return err(429, `You can ask for a new code in ${Math.ceil(wait / 1000)} seconds.`, { retryIn: Math.ceil(wait / 1000) });
        c.code = sixDigits(); c.sentAt = Date.now(); c.attempts = 0;
        const u = db.users.find((x) => x.id === c.userId);
        if (u) mail(u.email, "Your new code", c.code);
        return ok({ ok: true });
      }
      if (R === "POST /api/auth/forgot") {
        const email = String(body.email || "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return err(422, "Enter a valid email address.", { email: "Enter a valid email address." });
        return ok(newChallenge(db.users.find((x) => x.email === email) || null, "reset", "email", false, email));
      }
      if (R === "POST /api/auth/reset") {
        const c = getChallenge(body.challenge, ["reset"]);
        if (!c) return err(410, "This step has expired. Start again.", { restart: true });
        const u0 = db.users.find((x) => x.id === c.userId);
        const pc = passwordCheck(String(body.password || ""), u0 && u0.email, u0 && u0.name);
        if (!pc.ok) return err(422, pc.rules.find((r) => !r.ok).text + ".", { password: "Choose a stronger password." });
        const r = await check(c, body, db);
        if (r.fail) return r.fail;
        r.user.salt = hex(rand(16)); r.user.pw = await pbkdf2(body.password, r.user.salt); r.user.verified = true;
        challenges.delete(c.id); save(db); setSession(null);
        return ok({ ok: true });
      }
      if (R === "POST /api/auth/logout") { setSession(null); return ok({ ok: true }); }
      if (R === "PATCH /api/account") {
        const f = needUser(); if (f) return f;
        if (body.name !== undefined) { if (!String(body.name).trim()) return err(422, "Add your name.", { name: "Add your name." }); me.name = String(body.name).trim().slice(0, 80); }
        if (Array.isArray(body.plates)) {
          const out = [];
          for (const p of body.plates.slice(0, 5)) {
            const v = String(p).trim().toUpperCase().replace(/\s+/g, " ");
            if (!/^[A-ZΑ-Ω0-9][A-ZΑ-Ω0-9 -]{1,11}$/u.test(v)) return err(422, `"${v.slice(0, 12)}" doesn't look like a plate. Use the format ΙΚΧ-1234.`, { plates: "Check the plate format." });
            if (!out.includes(v)) out.push(v);
          }
          me.plates = out;
        }
        save(db); return ok({ user: pub(me) });
      }
      if (R === "POST /api/account/password") {
        const f = needUser(); if (f) return f;
        if ((await pbkdf2(String(body.current || ""), me.salt)) !== me.pw) return err(401, "Your current password isn't right.", { current: "Your current password isn't right." });
        const pc = passwordCheck(String(body.next || ""), me.email, me.name);
        if (!pc.ok) return err(422, pc.rules.find((r) => !r.ok).text + ".", { next: "Choose a stronger password." });
        me.salt = hex(rand(16)); me.pw = await pbkdf2(body.next, me.salt); save(db);
        return ok({ ok: true });
      }
      if (R === "POST /api/account/2fa/setup") {
        const f = needUser(); if (f) return f;
        if ((await pbkdf2(String(body.password || ""), me.salt)) !== me.pw) return err(401, "Your password isn't right.", { password: "Your password isn't right." });
        me.totpPending = b32enc(rand(20)); save(db);
        return ok({ secret: me.totpPending, otpauth: `otpauth://totp/${encodeURIComponent("Parkareto:" + me.email)}?secret=${me.totpPending}&issuer=Parkareto&algorithm=SHA1&digits=6&period=30` });
      }
      if (R === "POST /api/account/2fa/enable") {
        const f = needUser(); if (f) return f;
        if (!me.totpPending) return err(409, "Start the setup again.", { restart: true });
        const step = await totpCheck(me.totpPending, String(body.code || ""), 0);
        if (step < 0) return err(401, "That code isn't right. Check the time on your phone and try the newest code.", { code: "wrong" });
        const codes = recoveryCodes();
        me.totp = me.totpPending; me.totpPending = null; me.lastStep = step;
        me.recovery = await Promise.all(codes.map(async (c) => ({ hash: await sha(normRc(c)), used: false })));
        save(db); return ok({ recoveryCodes: codes, user: pub(me) });
      }
      if (R === "POST /api/account/2fa/disable") {
        const f = needUser(); if (f) return f;
        if ((await pbkdf2(String(body.password || ""), me.salt)) !== me.pw) return err(401, "Your password isn't right.", { password: "Your password isn't right." });
        if ((await totpCheck(me.totp, String(body.code || ""), me.lastStep)) < 0) return err(401, "That code isn't right.", { code: "wrong" });
        me.totp = null; me.recovery = []; save(db); return ok({ user: pub(me) });
      }
      if (R === "POST /api/account/2fa/recovery-codes") {
        const f = needUser(); if (f) return f;
        if ((await pbkdf2(String(body.password || ""), me.salt)) !== me.pw) return err(401, "Your password isn't right.", { password: "Your password isn't right." });
        const codes = recoveryCodes();
        me.recovery = await Promise.all(codes.map(async (c) => ({ hash: await sha(normRc(c)), used: false })));
        save(db); return ok({ recoveryCodes: codes });
      }
      if (R === "GET /api/account/sessions") {
        const f = needUser(); if (f) return f;
        return ok([{ id: "this-browser", current: true, createdAt: me.createdAt, lastSeen: new Date().toISOString(), ip: "this browser (demo)", userAgent: navigator.userAgent }]);
      }
      if (R === "POST /api/account/sessions/revoke-others") return ok({ ok: true });
      if (R === "GET /api/account/bookings") {
        const f = needUser(); if (f) return f;
        let list = []; try { list = JSON.parse(localStorage.getItem("parkareto.marketplace.bookings")) || []; } catch (_) {}
        return ok(list.filter((b) => b.userId === me.id).map((b) => ({ status: "active", ...b })));
      }
      if (R === "DELETE /api/account") {
        const f = needUser(); if (f) return f;
        if ((await pbkdf2(String(body.password || ""), me.salt)) !== me.pw) return err(401, "Your password isn't right.", { password: "Your password isn't right." });
        if (body.confirm !== "DELETE") return err(422, "Type DELETE to confirm.", { confirm: "Type DELETE to confirm." });
        db.users = db.users.filter((u) => u.id !== me.id); save(db); setSession(null);
        return ok({ ok: true });
      }
      return err(404, "Not available in demo mode.");
    }
    return { call };
  })();

  // Demo inbox: shows the emails the demo would have sent.
  function inbox(to, subject, code) {
    let box = $("#pkInbox");
    if (!box) { box = document.createElement("div"); box.id = "pkInbox"; box.className = "pk-inbox"; box.setAttribute("aria-live", "polite"); document.body.appendChild(box); }
    const m = document.createElement("div");
    m.className = "pk-mail";
    m.innerHTML = `<div class="pk-mail-top"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg><b>Demo inbox</b><span>to ${esc(to)}</span><button type="button" aria-label="Dismiss">×</button></div>
      <div class="pk-mail-sub">${esc(subject)}</div>${code ? `<div class="pk-mail-code">${esc(code)}</div><small>In the live site this arrives by email.</small>` : `<small>Someone tried to sign up with an email that already has an account.</small>`}`;
    $("button", m).addEventListener("click", () => m.remove());
    box.prepend(m);
    while (box.children.length > 3) box.lastChild.remove();
    setTimeout(() => m.classList.add("fade"), 60000);
  }

  // =====================================================================
  // API client
  // =====================================================================
  async function detect() {
    if (/^https?:$/.test(location.protocol)) {
      try {
        const r = await fetch("/api/auth/me", { headers: { Accept: "application/json" }, credentials: "same-origin", signal: AbortSignal.timeout(3000) });
        if ((r.headers.get("content-type") || "").includes("json")) { state.mode = "server"; state.user = (await r.json()).user; return; }
      } catch (_) {}
    }
    state.mode = "demo";
    state.user = (await Demo.call("GET", "/api/auth/me")).data.user;
  }
  async function api(method, path, body) {
    await state.ready;
    if (state.mode === "demo") return Demo.call(method, path, body);
    try {
      const r = await fetch(path, { method, credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
      const data = (r.headers.get("content-type") || "").includes("json") ? await r.json() : {};
      if (r.status === 401 && data.fields && data.fields.auth) setUser(null);
      return { ok: r.ok, status: r.status, data };
    } catch (_) {
      return { ok: false, status: 0, data: { error: "Couldn't reach Parkareto. Check your connection and try again." } };
    }
  }
  function setUser(u) { state.user = u; listeners.forEach((fn) => fn(u)); renderSlot(); }

  // =====================================================================
  // Sign-in window
  // =====================================================================
  let modal, flow = {};
  const ICON = {
    mail: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    phone: '<svg viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>',
    key: '<svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/></svg>',
    lock: '<svg viewBox="0 0 24 24"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
  };

  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "am";
    modal.hidden = true;
    modal.innerHTML = `<div class="am-box" role="dialog" aria-modal="true" aria-labelledby="amTitle">
      <button type="button" class="am-x" aria-label="Close">×</button>
      <div class="am-brand"><img src="${assetBase()}assets/logo.svg" alt="" width="54" height="32"><span class="chrome">PARKARETO</span></div>
      <div class="am-demo" hidden>Demo mode: accounts live in this browser only. Codes appear in the demo inbox instead of your email.</div>
      <div class="am-body" id="amBody"></div></div>`;
    document.body.appendChild(modal);
    $(".am-x", modal).addEventListener("click", () => close(false));
    modal.addEventListener("mousedown", (e) => { if (e.target === modal) close(false); });
    modal.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !flow.locked) close(false);
      if (e.key === "Tab") { // keep focus inside the window
        const f = $$("button, input, a[href], select", modal).filter((x) => !x.disabled && x.offsetParent);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    });
    return modal;
  }
  function assetBase() { return location.pathname.startsWith("/parking/") ? "/" : ""; }

  function open(opts = {}) {
    ensureModal();
    flow = { reason: opts.reason || "", then: opts.then, onClose: opts.onClose, locked: !!opts.locked };
    $(".am-demo", modal).hidden = state.mode !== "demo";
    $(".am-x", modal).hidden = flow.locked;
    flow.prevFocus = document.activeElement;
    modal.hidden = false;
    document.documentElement.classList.add("am-open");
    if (opts.step === "setup2fa") step2faIntro(opts.password, true);
    else (opts.tab === "signup" ? stepSignup : stepSignin)();
  }
  function close(success) {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.documentElement.classList.remove("am-open");
    clearInterval(flow.timer);
    const f = flow;
    flow = {};
    if (f.prevFocus && f.prevFocus.focus) f.prevFocus.focus();
    if (success && f.then) f.then(state.user);
    else if (!success && f.onClose) f.onClose();
  }
  function render(html, focusSel) {
    const body = $("#amBody", modal);
    body.innerHTML = html;
    body.classList.remove("am-in"); void body.offsetWidth; body.classList.add("am-in");
    const f = focusSel ? $(focusSel, body) : $("input, button", body);
    if (f) setTimeout(() => f.focus(), 30);
    return body;
  }
  function fieldErrors(form, res) {
    $$(".am-err", form).forEach((e) => (e.textContent = ""));
    $$(".am-field", form).forEach((e) => e.classList.remove("bad"));
    const fields = (res.data && res.data.fields) || {};
    let shown = false;
    for (const [k, v] of Object.entries(fields)) {
      const box = $(`[data-field="${k}"]`, form);
      if (box && typeof v === "string") { box.classList.add("bad"); $(".am-err", box).textContent = v; shown = true; }
    }
    const top = $(".am-alert", form);
    if (top) top.textContent = shown && res.status === 422 ? "" : res.data.error || "Something went wrong. Try again.";
  }
  function busy(form, on) {
    const b = $("button[type=submit]", form);
    if (b) { b.disabled = on; b.classList.toggle("loading", on); }
  }
  const field = (name, label, input, extra = "") => `<div class="am-field" data-field="${name}"><label for="am-${name}">${label}</label>${input}${extra}<p class="am-err" role="alert"></p></div>`;
  const pwInput = (name, auto) => `<div class="am-pw"><input id="am-${name}" name="${name}" type="password" autocomplete="${auto}" required maxlength="200"><button type="button" class="am-eye" aria-label="Show password" aria-pressed="false">${ICON.eye}</button></div>`;
  function wirePw(root) {
    $$(".am-eye", root).forEach((b) => b.addEventListener("click", () => {
      const i = b.previousElementSibling, show = i.type === "password";
      i.type = show ? "text" : "password";
      b.setAttribute("aria-pressed", show); b.setAttribute("aria-label", show ? "Hide password" : "Show password");
    }));
  }
  function wireMeter(root, input, getCtx) {
    const meter = $(".am-meter", root), list = $(".am-rules", root);
    const labels = ["Too weak", "Weak", "Fair", "Strong", "Very strong"];
    const upd = () => {
      const ctx = getCtx();
      const r = passwordCheck(input.value, ctx.email, ctx.name);
      meter.dataset.score = input.value ? r.score : "";
      $(".am-meter-label", meter).textContent = input.value ? labels[r.score] : "";
      list.innerHTML = r.rules.map((x) => `<li class="${x.ok ? "ok" : ""}">${ICON.check}${x.text}</li>`).join("");
    };
    input.addEventListener("input", upd);
    upd();
  }
  const meterHtml = `<div class="am-meter"><i></i><i></i><i></i><i></i><span class="am-meter-label"></span></div><ul class="am-rules"></ul>`;

  // ---------- Sign in ----------
  function stepSignin(prefill) {
    const body = render(`
      <h2 id="amTitle">Sign in</h2>
      ${flow.reason ? `<p class="am-reason">${ICON.lock}${esc(flow.reason)}</p>` : `<p class="am-sub">Welcome back. Sign in to book and manage your parking.</p>`}
      <form class="am-form" novalidate>
        <p class="am-alert" role="alert"></p>
        ${field("email", "Email", `<input id="am-email" name="email" type="email" autocomplete="username" required value="${esc(prefill || "")}">`)}
        ${field("password", 'Password <a href="#" class="am-link am-forgot">Forgot password?</a>', pwInput("password", "current-password"))}
        <label class="am-check"><input type="checkbox" name="remember"><span>Keep me signed in on this device for 30 days</span></label>
        <button type="submit" class="am-btn">Continue</button>
      </form>
      <p class="am-switch">New to Parkareto? <a href="#" class="am-link am-to-signup">Create an account</a></p>`, prefill ? "#am-password" : "#am-email");
    wirePw(body);
    $(".am-to-signup", body).addEventListener("click", (e) => { e.preventDefault(); stepSignup(); });
    $(".am-forgot", body).addEventListener("click", (e) => { e.preventDefault(); stepForgot($("#am-email", body).value); });
    $("form", body).addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      busy(f, true);
      const res = await api("POST", "/api/auth/login", { email: f.email.value, password: f.password.value, remember: f.remember.checked });
      busy(f, false);
      if (!res.ok) return fieldErrors(f, res);
      flow.email = f.email.value.trim().toLowerCase();
      stepCode(res.data, "login");
    });
  }

  // ---------- Create account ----------
  function stepSignup() {
    const body = render(`
      <h2 id="amTitle">Create your account</h2>
      ${flow.reason ? `<p class="am-reason">${ICON.lock}${esc(flow.reason)}</p>` : `<p class="am-sub">Book parking across Athens and manage your bookings in one place.</p>`}
      <form class="am-form" novalidate>
        <p class="am-alert" role="alert"></p>
        ${field("name", "Full name", `<input id="am-name" name="name" autocomplete="name" required maxlength="80">`)}
        ${field("email", "Email", `<input id="am-email" name="email" type="email" autocomplete="email" required>`)}
        ${field("password", "Password", pwInput("password", "new-password"), meterHtml)}
        <div class="am-field" data-field="accept"><label class="am-check"><input type="checkbox" name="accept"><span>I accept the <a href="${legal("terms")}" target="_blank" rel="noopener" class="am-link">Terms</a> and <a href="${legal("privacy")}" target="_blank" rel="noopener" class="am-link">Privacy Policy</a></span></label><p class="am-err" role="alert"></p></div>
        <button type="submit" class="am-btn">Create account</button>
      </form>
      <p class="am-switch">Already have an account? <a href="#" class="am-link am-to-signin">Sign in</a></p>`, "#am-name");
    const f = $("form", body);
    wirePw(body);
    wireMeter(body, f.password, () => ({ email: f.email.value, name: f.name.value }));
    $(".am-to-signin", body).addEventListener("click", (e) => { e.preventDefault(); stepSignin(f.email.value); });
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      busy(f, true);
      const res = await api("POST", "/api/auth/signup", { name: f.name.value, email: f.email.value, password: f.password.value, accept: f.accept.checked });
      busy(f, false);
      if (!res.ok) return fieldErrors(f, res);
      flow.email = f.email.value.trim().toLowerCase();
      flow.password = f.password.value; // kept only for the optional authenticator setup right after
      stepCode(res.data, "verify");
    });
  }

  // ---------- Code entry (email code, authenticator code or recovery code) ----------
  function otpBoxes() { return `<div class="am-otp" role="group" aria-label="6-digit code">${Array.from({ length: 6 }, (_, i) => `<input inputmode="numeric" pattern="[0-9]*" maxlength="1" aria-label="Digit ${i + 1}"${i === 0 ? ' autocomplete="one-time-code"' : ""}>`).join("")}</div>`; }
  function wireOtp(root, onFull) {
    const boxes = $$(".am-otp input", root);
    const value = () => boxes.map((b) => b.value).join("");
    boxes.forEach((b, i) => {
      b.addEventListener("input", () => {
        const digits = b.value.replace(/\D/g, "");
        if (digits.length > 1) { // autofill or paste of the whole code
          digits.slice(0, 6 - i).split("").forEach((d, k) => (boxes[i + k].value = d));
          (boxes[Math.min(5, i + digits.length)] || b).focus();
        } else { b.value = digits; if (digits && boxes[i + 1]) boxes[i + 1].focus(); }
        b.parentElement.classList.remove("bad");
        if (value().length === 6) onFull(value());
      });
      b.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !b.value && boxes[i - 1]) { boxes[i - 1].focus(); boxes[i - 1].value = ""; }
        if (e.key === "ArrowLeft" && boxes[i - 1]) boxes[i - 1].focus();
        if (e.key === "ArrowRight" && boxes[i + 1]) boxes[i + 1].focus();
      });
      b.addEventListener("paste", (e) => {
        const t = (e.clipboardData || window.clipboardData).getData("text").replace(/\D/g, "").slice(0, 6);
        if (!t) return;
        e.preventDefault();
        t.split("").forEach((d, k) => boxes[k] && (boxes[k].value = d));
        (boxes[t.length] || boxes[5]).focus();
        if (t.length === 6) onFull(t);
      });
    });
    return { clear() { boxes.forEach((b) => (b.value = "")); boxes[0].focus(); }, shake() { const g = $(".am-otp", root); g.classList.remove("bad"); void g.offsetWidth; g.classList.add("bad"); } };
  }

  function stepCode(ch, purpose) {
    flow.challenge = ch.challenge;
    const app = ch.method === "totp";
    const title = purpose === "verify" ? "Confirm your email" : app ? "Two-step verification" : "Check your email";
    const text = app ? "Open your authenticator app and enter the 6-digit code for Parkareto." : `We sent a 6-digit code to <b>${esc(ch.to)}</b>. It expires in 10 minutes.`;
    const body = render(`
      <div class="am-icon">${app ? ICON.phone : ICON.mail}</div>
      <h2 id="amTitle">${title}</h2>
      <p class="am-sub">${text}</p>
      <form class="am-form am-code" novalidate>
        <p class="am-alert" role="alert"></p>
        <div class="am-code-main">${otpBoxes()}</div>
        <div class="am-rc" hidden>${field("recoveryCode", "Recovery code", `<input id="am-recoveryCode" name="recoveryCode" autocomplete="off" placeholder="XXXXX-XXXXX" maxlength="11">`)}</div>
        <button type="submit" class="am-btn">Verify</button>
      </form>
      <div class="am-alt">
        ${app ? `<a href="#" class="am-link am-use-rc">Use a recovery code instead</a>` : `<button type="button" class="am-link am-resend" disabled>Resend code</button>`}
        <a href="#" class="am-link am-back">Back</a>
      </div>`, ".am-otp input");
    const f = $("form", body);
    let useRc = false, sending = false;
    const otp = wireOtp(body, () => submit());
    async function submit() {
      if (sending) return;
      const code = $$(".am-otp input", body).map((b) => b.value).join("");
      if (!useRc && code.length < 6) { otp.shake(); $(".am-alert", f).textContent = "Enter all 6 digits."; return; }
      sending = true; busy(f, true);
      const res = await api("POST", "/api/auth/verify", useRc ? { challenge: flow.challenge, recoveryCode: f.recoveryCode.value } : { challenge: flow.challenge, code });
      sending = false; busy(f, false);
      if (!res.ok) {
        if (res.data.fields && res.data.fields.restart) { $(".am-alert", f).textContent = res.data.error; setTimeout(() => stepSignin(flow.email), 1600); return; }
        fieldErrors(f, res); otp.shake(); otp.clear(); return;
      }
      setUser(res.data.user);
      if (res.data.via === "recovery") return stepDone(`Signed in with a recovery code. You have ${res.data.recoveryCodesLeft} left. If you've lost your phone, set up the authenticator again from your account page.`);
      if (purpose === "verify" && res.data.user.twoFactor !== "app") return step2faOffer();
      flow.password = null;
      success();
    }
    f.addEventListener("submit", (e) => { e.preventDefault(); submit(); });
    $(".am-back", body).addEventListener("click", (e) => { e.preventDefault(); purpose === "verify" ? stepSignup() : stepSignin(flow.email); });
    const rcLink = $(".am-use-rc", body);
    if (rcLink) rcLink.addEventListener("click", (e) => {
      e.preventDefault();
      useRc = !useRc;
      $(".am-rc", body).hidden = !useRc; $(".am-code-main", body).hidden = useRc;
      rcLink.textContent = useRc ? "Use my authenticator app" : "Use a recovery code instead";
      (useRc ? f.recoveryCode : $(".am-otp input", body)).focus();
    });
    const resend = $(".am-resend", body);
    if (resend) {
      let left = 30;
      const tick = () => { resend.textContent = left > 0 ? `Resend code in ${left}s` : "Resend code"; resend.disabled = left > 0; left--; };
      tick(); clearInterval(flow.timer); flow.timer = setInterval(tick, 1000);
      resend.addEventListener("click", async () => {
        resend.disabled = true;
        const res = await api("POST", "/api/auth/resend", { challenge: flow.challenge });
        $(".am-alert", f).textContent = res.ok ? "" : res.data.error;
        if (res.ok) { $(".am-sub", body).insertAdjacentHTML("beforeend", ' <span class="am-sent">New code sent.</span>'); otp.clear(); }
        left = res.ok ? 30 : (res.data.fields && res.data.fields.retryIn) || 10; tick();
      });
    }
  }

  // ---------- Forgot password ----------
  function stepForgot(prefill) {
    const body = render(`
      <div class="am-icon">${ICON.key}</div>
      <h2 id="amTitle">Reset your password</h2>
      <p class="am-sub">Enter your account email and we'll send you a code to choose a new password.</p>
      <form class="am-form" novalidate>
        <p class="am-alert" role="alert"></p>
        ${field("email", "Email", `<input id="am-email" name="email" type="email" autocomplete="username" required value="${esc(prefill || "")}">`)}
        <button type="submit" class="am-btn">Send code</button>
      </form>
      <div class="am-alt"><a href="#" class="am-link am-back">Back to sign in</a></div>`, "#am-email");
    $(".am-back", body).addEventListener("click", (e) => { e.preventDefault(); stepSignin(prefill); });
    $("form", body).addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      busy(f, true);
      const res = await api("POST", "/api/auth/forgot", { email: f.email.value });
      busy(f, false);
      if (!res.ok) return fieldErrors(f, res);
      flow.email = f.email.value.trim().toLowerCase();
      stepReset(res.data);
    });
  }
  function stepReset(ch) {
    flow.challenge = ch.challenge;
    const body = render(`
      <div class="am-icon">${ICON.mail}</div>
      <h2 id="amTitle">Choose a new password</h2>
      <p class="am-sub">If <b>${esc(ch.to)}</b> has an account, we've sent it a 6-digit code.</p>
      <form class="am-form" novalidate>
        <p class="am-alert" role="alert"></p>
        <div class="am-field" data-field="code"><label>Code from the email</label>${otpBoxes()}<p class="am-err" role="alert"></p></div>
        ${field("password", "New password", pwInput("password", "new-password"), meterHtml)}
        <button type="submit" class="am-btn">Save new password</button>
      </form>
      <div class="am-alt"><a href="#" class="am-link am-back">Back to sign in</a></div>`, ".am-otp input");
    const f = $("form", body);
    wirePw(body);
    wireMeter(body, f.password, () => ({ email: flow.email, name: "" }));
    const otp = wireOtp(body, () => f.password.focus());
    $(".am-back", body).addEventListener("click", (e) => { e.preventDefault(); stepSignin(flow.email); });
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      busy(f, true);
      const res = await api("POST", "/api/auth/reset", { challenge: flow.challenge, code: $$(".am-otp input", body).map((b) => b.value).join(""), password: f.password.value });
      busy(f, false);
      if (!res.ok) {
        fieldErrors(f, res);
        if (res.data.fields && res.data.fields.restart) setTimeout(() => stepForgot(flow.email), 1600);
        else if (res.status === 401) { otp.shake(); otp.clear(); }
        return;
      }
      render(`<div class="am-icon ok">${ICON.check}</div><h2 id="amTitle">Password changed</h2><p class="am-sub">You've been signed out everywhere. Sign in with your new password.</p><button type="button" class="am-btn">Sign in</button>`).querySelector(".am-btn").addEventListener("click", () => stepSignin(flow.email));
    });
  }

  // ---------- Authenticator app ----------
  function step2faOffer() {
    const body = render(`
      <div class="am-icon ok">${ICON.check}</div>
      <h2 id="amTitle">Email confirmed</h2>
      <p class="am-sub">Your account is ready. Each sign-in asks for a code we email you.</p>
      <div class="am-offer">${ICON.shield}<div><b>Make it stronger with an authenticator app</b><p>Use Google Authenticator, Microsoft Authenticator, Authy or 1Password for codes that work even without email.</p></div></div>
      <button type="button" class="am-btn am-yes">Set up authenticator app</button>
      <button type="button" class="am-btn ghost am-no">Not now</button>`);
    $(".am-yes", body).addEventListener("click", () => step2faIntro(flow.password));
    $(".am-no", body).addEventListener("click", () => { flow.password = null; success(); });
  }
  async function step2faIntro(password, standalone) {
    flow.standalone = !!standalone;
    if (!password) return step2faPassword();
    const body = render(`<div class="am-loading"><i></i>Preparing your secure key…</div>`);
    const res = await api("POST", "/api/account/2fa/setup", { password });
    flow.password = null;
    if (!res.ok) { if (res.status === 401 && res.data.fields && res.data.fields.password) return step2faPassword(res.data.error); body.innerHTML = `<p class="am-alert">${esc(res.data.error)}</p>`; return; }
    step2faScan(res.data);
  }
  function step2faPassword(error) {
    const body = render(`
      <div class="am-icon">${ICON.lock}</div>
      <h2 id="amTitle">Confirm it's you</h2>
      <p class="am-sub">Enter your password to set up the authenticator app.</p>
      <form class="am-form" novalidate>
        <p class="am-alert" role="alert">${esc(error || "")}</p>
        ${field("password", "Password", pwInput("password", "current-password"))}
        <button type="submit" class="am-btn">Continue</button>
      </form>`, "#am-password");
    wirePw(body);
    $("form", body).addEventListener("submit", (e) => { e.preventDefault(); step2faIntro(e.target.password.value, flow.standalone); });
  }
  function qrSvg(text) {
    if (!window.qrcode) return "";
    qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];
    const q = qrcode(0, "M"); q.addData(text); q.make();
    const n = q.getModuleCount(); let d = "";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`;
    return `<svg viewBox="-3 -3 ${n + 6} ${n + 6}" role="img" aria-label="QR code to add Parkareto to your authenticator app"><rect x="-3" y="-3" width="${n + 6}" height="${n + 6}" fill="#fff"/><path d="${d}" fill="#0b0c10"/></svg>`;
  }
  function step2faScan(setup) {
    const pretty = setup.secret.match(/.{1,4}/g).join(" ");
    const body = render(`
      <h2 id="amTitle">Set up your authenticator app</h2>
      <ol class="am-steps">
        <li>Open your authenticator app and add a new account.</li>
        <li>Scan this QR code, or enter the key by hand.</li>
      </ol>
      <div class="am-qr-wrap"><div class="am-qr">${qrSvg(setup.otpauth)}</div>
        <div class="am-key"><small>Setup key</small><code>${pretty}</code><button type="button" class="am-link am-copy">Copy key</button>
        <a class="am-link" href="${esc(setup.otpauth)}">Open in an app on this device</a></div></div>
      <form class="am-form" novalidate>
        <p class="am-alert" role="alert"></p>
        <div class="am-field" data-field="code"><label>3. Enter the 6-digit code it shows</label>${otpBoxes()}<p class="am-err" role="alert"></p></div>
        <button type="submit" class="am-btn">Turn on</button>
      </form>
      ${flow.standalone ? "" : `<div class="am-alt"><a href="#" class="am-link am-skip">Skip for now</a></div>`}`, ".am-otp input");
    const f = $("form", body);
    const otp = wireOtp(body, () => submit());
    $(".am-copy", body).addEventListener("click", (e) => {
      navigator.clipboard && navigator.clipboard.writeText(setup.secret).then(() => (e.target.textContent = "Copied"), () => {});
    });
    const skip = $(".am-skip", body);
    if (skip) skip.addEventListener("click", (e) => { e.preventDefault(); success(); });
    let sending = false;
    async function submit() {
      if (sending) return;
      sending = true; busy(f, true);
      const res = await api("POST", "/api/account/2fa/enable", { code: $$(".am-otp input", body).map((b) => b.value).join("") });
      sending = false; busy(f, false);
      if (!res.ok) { fieldErrors(f, res); otp.shake(); otp.clear(); return; }
      setUser(res.data.user);
      stepRecovery(res.data.recoveryCodes, "Authenticator app turned on");
    }
    f.addEventListener("submit", (e) => { e.preventDefault(); submit(); });
  }
  function stepRecovery(codes, title) {
    const text = "Parkareto recovery codes\n" + (state.user ? state.user.email + "\n" : "") + "Each code works once.\n\n" + codes.join("\n") + "\n";
    const body = render(`
      <div class="am-icon ok">${ICON.shield}</div>
      <h2 id="amTitle">${esc(title || "Your recovery codes")}</h2>
      <p class="am-sub">Save these codes somewhere safe. If you lose your phone, each one lets you sign in once. They won't be shown again.</p>
      <ol class="am-codes">${codes.map((c) => `<li><code>${esc(c)}</code></li>`).join("")}</ol>
      <div class="am-row"><button type="button" class="am-btn ghost am-copy">Copy all</button><button type="button" class="am-btn ghost am-dl">Download .txt</button></div>
      <label class="am-check"><input type="checkbox" class="am-saved"><span>I've saved my recovery codes</span></label>
      <button type="button" class="am-btn am-done" disabled>Done</button>`);
    flow.locked = true; $(".am-x", modal).hidden = true;
    $(".am-copy", body).addEventListener("click", (e) => navigator.clipboard && navigator.clipboard.writeText(text).then(() => (e.target.textContent = "Copied"), () => {}));
    $(".am-dl", body).addEventListener("click", () => {
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([text], { type: "text/plain" })), download: "parkareto-recovery-codes.txt" });
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    $(".am-saved", body).addEventListener("change", (e) => ($(".am-done", body).disabled = !e.target.checked));
    $(".am-done", body).addEventListener("click", () => { flow.locked = false; success(); });
  }
  function stepDone(msg) {
    const body = render(`<div class="am-icon ok">${ICON.check}</div><h2 id="amTitle">You're signed in</h2><p class="am-sub">${esc(msg)}</p><button type="button" class="am-btn">Continue</button>`);
    $(".am-btn", body).addEventListener("click", success);
  }
  function success() { close(true); }

  // =====================================================================
  // Header slot: "Sign in" or the account menu
  // =====================================================================
  function legal(page) { return state.mode === "server" ? "/" + page : page + ".html"; }
  function accountUrl() { return state.mode === "server" ? "/account" : "account.html"; }
  function renderSlot() {
    $$("[data-auth-slot]").forEach((slot) => {
      const u = state.user;
      if (!u) { slot.innerHTML = `<button type="button" class="pk-signin">Sign in</button>`; $(".pk-signin", slot).addEventListener("click", () => open()); return; }
      const initials = u.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
      slot.innerHTML = `<div class="pk-acct"><button type="button" class="pk-avatar" aria-haspopup="menu" aria-expanded="false"><i>${esc(initials)}</i><span>${esc(u.name.split(" ")[0])}</span></button>
        <div class="pk-menu" role="menu" hidden><div class="pk-menu-head"><b>${esc(u.name)}</b><small>${esc(u.email)}</small><em>${u.twoFactor === "app" ? "Authenticator app on" : "Email codes on"}</em></div>
        <a role="menuitem" href="${accountUrl()}">Account &amp; security</a><a role="menuitem" href="${accountUrl()}#bookings">My bookings</a><button role="menuitem" type="button" class="pk-out">Sign out</button></div></div>`;
      const btn = $(".pk-avatar", slot), menu = $(".pk-menu", slot);
      btn.addEventListener("click", (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute("aria-expanded", !menu.hidden); });
      document.addEventListener("click", (e) => { if (!slot.contains(e.target)) { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); } });
      $(".pk-out", slot).addEventListener("click", signOut);
    });
  }
  async function signOut() {
    await api("POST", "/api/auth/logout", {});
    setUser(null);
    if (/account(\.html)?$/.test(location.pathname)) location.href = state.mode === "server" ? "/marketplace" : "marketplace.html";
  }

  // =====================================================================
  // Public API
  // =====================================================================
  state.ready = detect().then(renderSlot);
  window.PKAuth = {
    ready: () => state.ready,
    get user() { return state.user; },
    get mode() { return state.mode; },
    api, open, signOut, passwordCheck, stepRecovery: (codes, title) => { open({}); stepRecovery(codes, title); },
    setup2fa: (then) => open({ step: "setup2fa", then }),
    onChange: (fn) => listeners.add(fn),
    refresh: async () => { const r = await api("GET", "/api/auth/me"); setUser(r.ok ? r.data.user : null); return state.user; },
    // Run fn now if signed in, otherwise ask the visitor to sign in first.
    require(fn, reason) { state.ready.then(() => (state.user ? fn(state.user) : open({ reason, then: fn }))); },
  };
})();
