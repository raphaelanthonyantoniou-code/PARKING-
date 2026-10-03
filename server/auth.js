"use strict";
// Accounts for the driver marketplace: sign-up with email verification, sign-in with a
// mandatory second step (authenticator app, or an emailed code), recovery codes, password
// reset, session management and account deletion.

const S = require("./security");
const { HttpError, str, email: validEmail, plate: validPlate } = require("./validate");

const HOUR = 3600e3, MIN = 60e3;
const SESSION_SHORT = 12 * HOUR, SESSION_LONG = 30 * 24 * HOUR;
const CODE_TTL = 10 * MIN, MAX_ATTEMPTS = 5, RESEND_AFTER = 30e3;

function maskEmail(e) {
  const [u, d] = e.split("@");
  return (u.length <= 2 ? u[0] + "*" : u[0] + "*".repeat(Math.min(6, u.length - 2)) + u[u.length - 1]) + "@" + d;
}
const iso = (ms = Date.now()) => new Date(ms).toISOString();

function authModule({ db, cfg, mailer, readJson, limit, ip, tx }) {
  const cipher = S.makeCipher(cfg.appSecret);
  const secure = cfg.site.startsWith("https://");
  const COOKIE = secure ? "__Host-pk_session" : "pk_session";

  const q = {
    userByEmail: db.prepare("SELECT * FROM users WHERE email = ?"),
    user: db.prepare("SELECT * FROM users WHERE id = ?"),
    insUser: db.prepare("INSERT INTO users (email, name, password_hash, created_at, password_changed_at) VALUES (?, ?, ?, ?, ?)"),
    insSession: db.prepare("INSERT INTO sessions (id, user_id, created_at, last_seen, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)"),
    session: db.prepare("SELECT * FROM sessions WHERE id = ?"),
    touch: db.prepare("UPDATE sessions SET last_seen = ?, expires_at = ? WHERE id = ?"),
    delSession: db.prepare("DELETE FROM sessions WHERE id = ?"),
    delSessions: db.prepare("DELETE FROM sessions WHERE user_id = ?"),
    delOtherSessions: db.prepare("DELETE FROM sessions WHERE user_id = ? AND id <> ?"),
    sessions: db.prepare("SELECT * FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen DESC"),
    insChallenge: db.prepare("INSERT INTO auth_challenges (id, user_id, purpose, method, code_hash, remember, sent_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"),
    challenge: db.prepare("SELECT * FROM auth_challenges WHERE id = ?"),
    bumpAttempts: db.prepare("UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = ?"),
    newCode: db.prepare("UPDATE auth_challenges SET code_hash = ?, sent_at = ?, attempts = 0 WHERE id = ?"),
    delChallenge: db.prepare("DELETE FROM auth_challenges WHERE id = ?"),
    purge: db.prepare("DELETE FROM auth_challenges WHERE expires_at < ?"),
    purgeSessions: db.prepare("DELETE FROM sessions WHERE expires_at < ?"),
    recovery: db.prepare("SELECT rowid, * FROM recovery_codes WHERE user_id = ? AND used_at IS NULL"),
    useRecovery: db.prepare("UPDATE recovery_codes SET used_at = ? WHERE rowid = ?"),
    delRecovery: db.prepare("DELETE FROM recovery_codes WHERE user_id = ?"),
    insRecovery: db.prepare("INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, ?)"),
    myBookings: db.prepare("SELECT b.*, g.name AS garage_name, g.area AS garage_area, g.slug AS garage_slug FROM bookings b JOIN garages g ON g.id = b.garage_id WHERE b.user_id = ? ORDER BY b.start_at DESC LIMIT 200"),
  };
  const sweep = setInterval(() => { q.purge.run(iso()); q.purgeSessions.run(iso()); }, 10 * MIN);
  sweep.unref();

  // ---------- Cookies and sessions ----------
  function cookies(req) {
    const out = {};
    for (const part of String(req.headers.cookie || "").split(";")) {
      const i = part.indexOf("=");
      if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
    return out;
  }
  function setCookie(res, value, maxAgeMs) {
    const attrs = [`${COOKIE}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${Math.floor(maxAgeMs / 1000)}`];
    if (secure) attrs.push("Secure");
    res.setHeader("Set-Cookie", attrs.join("; "));
  }
  const clearCookie = (res) => setCookie(res, "", 0);

  function startSession(req, res, userId, remember) {
    const t = S.token();
    const life = remember ? SESSION_LONG : SESSION_SHORT;
    q.insSession.run(S.sha256(t), userId, iso(), iso(), iso(Date.now() + life), ip(req).slice(0, 64), String(req.headers["user-agent"] || "").slice(0, 200));
    setCookie(res, t, life);
  }

  // Returns { user, sid } or null. Sliding expiry, refreshed at most every 10 minutes.
  function current(req) {
    const t = cookies(req)[COOKIE];
    if (!t || t.length > 100) return null;
    const sid = S.sha256(t);
    const s = q.session.get(sid);
    if (!s || s.expires_at < iso()) return null;
    const user = q.user.get(s.user_id);
    if (!user) return null;
    if (Date.now() - Date.parse(s.last_seen) > 10 * MIN) {
      const life = Date.parse(s.expires_at) - Date.parse(s.created_at) > SESSION_SHORT ? SESSION_LONG : SESSION_SHORT;
      q.touch.run(iso(), iso(Math.min(Date.now() + life, Date.parse(s.created_at) + 90 * 24 * HOUR)), sid);
    }
    return { user, sid };
  }
  function requireUser(req) {
    const c = current(req);
    if (!c) throw new HttpError(401, "Sign in to continue.", { auth: "required" });
    return c;
  }

  const publicUser = (u) => ({
    id: u.id, name: u.name, email: u.email, emailVerified: !!u.email_verified,
    twoFactor: u.totp_secret ? "app" : "email", plates: JSON.parse(u.plates),
    recoveryCodesLeft: u.totp_secret ? q.recovery.all(u.id).length : 0, createdAt: u.created_at,
  });

  // ---------- Challenges (one-time codes) ----------
  async function challenge({ user, purpose, method, remember, sendTo, name }) {
    const t = S.token(), id = S.sha256(t);
    let codeHash = null;
    if (method === "email") {
      const code = S.sixDigits();
      codeHash = S.sha256(id + ":" + code);
      if (user) await mailer.send(user.email, purpose, { name: user.name, code });
    }
    q.insChallenge.run(id, user ? user.id : null, purpose, method, codeHash, remember ? 1 : 0, iso(), iso(Date.now() + CODE_TTL));
    return { challenge: t, method, to: maskEmail(sendTo || (user && user.email) || "") , name };
  }
  function loadChallenge(t, purposes) {
    const c = typeof t === "string" && t.length < 100 ? q.challenge.get(S.sha256(t)) : null;
    if (!c || !purposes.includes(c.purpose)) throw new HttpError(410, "This step has expired. Start again.", { restart: true });
    if (c.expires_at < iso()) { q.delChallenge.run(c.id); throw new HttpError(410, "This code has expired. Start again.", { restart: true }); }
    if (c.attempts >= MAX_ATTEMPTS) { q.delChallenge.run(c.id); throw new HttpError(429, "Too many wrong codes. Start again.", { restart: true }); }
    return c;
  }
  // Checks the code for a challenge. Accepts an authenticator code, an emailed code or a recovery code.
  function checkCode(c, body) {
    const user = c.user_id ? q.user.get(c.user_id) : null;
    const code = String(body.code || "").replace(/\s/g, "");
    const rc = S.normRecovery(body.recoveryCode);
    let ok = false;
    if (user && rc && c.method === "totp") {
      const hit = q.recovery.all(user.id).find((r) => S.sameHash(r.code_hash, S.sha256(rc)));
      if (hit) { q.useRecovery.run(iso(), hit.rowid); ok = "recovery"; }
    } else if (user && c.method === "totp" && user.totp_secret) {
      const step = S.verifyTotp(cipher.decrypt(user.totp_secret), code, user.totp_last_step);
      if (step > 0) { db.prepare("UPDATE users SET totp_last_step = ? WHERE id = ?").run(step, user.id); ok = "totp"; }
    } else if (c.method === "email" && /^\d{6}$/.test(code)) {
      ok = !!user && S.sameHash(c.code_hash, S.sha256(c.id + ":" + code)) && "email";
    }
    if (!ok) {
      q.bumpAttempts.run(c.id);
      const left = MAX_ATTEMPTS - c.attempts - 1;
      throw new HttpError(401, left > 0 ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` : "That code isn't right. Start again.", left > 0 ? { code: "wrong" } : { restart: true });
    }
    return { user, via: ok };
  }

  const alert = (u, what) => mailer.send(u.email, "security", { name: u.name, what });

  // ---------- Routes ----------
  const routes = {
    "GET /api/auth/me": (req) => { const c = current(req); return { user: c ? publicUser(c.user) : null }; },

    "POST /api/auth/signup": async (req) => {
      limit("signup:" + ip(req), 6, HOUR);
      const b = await readJson(req);
      const name = str(b.name, 80), em = validEmail(b.email, true), pw = typeof b.password === "string" ? b.password : "";
      const fields = {};
      if (!name) fields.name = "Add your name.";
      if (!em) fields.email = "Enter a valid email address.";
      const problem = S.passwordProblem(pw, em, name);
      if (problem) fields.password = problem;
      if (!b.accept) fields.accept = "Accept the terms to create an account.";
      if (Object.keys(fields).length) throw new HttpError(422, Object.values(fields)[0], fields);
      limit("signup-email:" + em, 3, HOUR);
      const existing = q.userByEmail.get(em);
      if (existing) {
        // Same response as a new sign-up, so nobody can test which emails have accounts.
        await S.hashPassword(pw);
        await mailer.send(existing.email, "exists", { name: existing.name });
        return challenge({ user: null, purpose: "verify", method: "email", sendTo: em });
      }
      const hash = await S.hashPassword(pw);
      const id = Number(q.insUser.run(em, name, hash, iso(), iso()).lastInsertRowid);
      return challenge({ user: q.user.get(id), purpose: "verify", method: "email", remember: !!b.remember });
    },

    "POST /api/auth/login": async (req) => {
      limit("login:" + ip(req), 30, 15 * MIN);
      const b = await readJson(req);
      const em = validEmail(b.email, true), pw = typeof b.password === "string" ? b.password.slice(0, 200) : "";
      if (!em || !pw) throw new HttpError(422, "Enter your email and password.");
      limit("login-email:" + em, 8, 15 * MIN);
      const u = q.userByEmail.get(em);
      const ok = await S.verifyPassword(pw, u ? u.password_hash : S.DUMMY_HASH);
      if (!u || !ok) throw new HttpError(401, "Wrong email or password.");
      return challenge({ user: u, purpose: "login", method: u.totp_secret && u.email_verified ? "totp" : "email", remember: !!b.remember });
    },

    // Second step for both sign-up (verify email) and sign-in.
    "POST /api/auth/verify": async (req, p, url, res) => {
      limit("verify:" + ip(req), 30, 15 * MIN);
      const b = await readJson(req);
      const c = loadChallenge(b.challenge, ["verify", "login"]);
      const { user, via } = checkCode(c, b);
      q.delChallenge.run(c.id);
      if (via === "email" && !user.email_verified) db.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").run(user.id);
      startSession(req, res, user.id, !!c.remember || !!b.remember);
      if (via === "recovery") alert(user, "A recovery code was used to sign in");
      const fresh = q.user.get(user.id);
      return { user: publicUser(fresh), via, recoveryCodesLeft: via === "recovery" ? q.recovery.all(user.id).length : undefined };
    },

    "POST /api/auth/resend": async (req) => {
      limit("resend:" + ip(req), 10, 15 * MIN);
      const b = await readJson(req);
      const c = loadChallenge(b.challenge, ["verify", "login", "reset"]);
      if (c.method !== "email") throw new HttpError(400, "This step uses your authenticator app, not email.");
      const wait = RESEND_AFTER - (Date.now() - Date.parse(c.sent_at));
      if (wait > 0) throw new HttpError(429, `You can ask for a new code in ${Math.ceil(wait / 1000)} seconds.`, { retryIn: Math.ceil(wait / 1000) });
      const code = S.sixDigits();
      q.newCode.run(S.sha256(c.id + ":" + code), iso(), c.id);
      const user = c.user_id ? q.user.get(c.user_id) : null;
      if (user) await mailer.send(user.email, c.purpose, { name: user.name, code });
      return { ok: true };
    },

    "POST /api/auth/forgot": async (req) => {
      limit("forgot:" + ip(req), 6, HOUR);
      const b = await readJson(req);
      const em = validEmail(b.email, true);
      if (!em) throw new HttpError(422, "Enter a valid email address.", { email: "Enter a valid email address." });
      limit("forgot-email:" + em, 3, HOUR);
      const u = q.userByEmail.get(em);
      return challenge({ user: u || null, purpose: "reset", method: "email", sendTo: em });
    },

    "POST /api/auth/reset": async (req) => {
      limit("reset:" + ip(req), 20, 15 * MIN);
      const b = await readJson(req);
      const c = loadChallenge(b.challenge, ["reset"]);
      const u0 = c.user_id ? q.user.get(c.user_id) : null;
      const problem = S.passwordProblem(b.password, u0 && u0.email, u0 && u0.name);
      if (problem) throw new HttpError(422, problem, { password: problem });
      const { user } = checkCode(c, b);
      const hash = await S.hashPassword(b.password);
      tx(db, () => {
        db.prepare("UPDATE users SET password_hash = ?, password_changed_at = ?, email_verified = 1 WHERE id = ?").run(hash, iso(), user.id);
        q.delSessions.run(user.id);
        q.delChallenge.run(c.id);
      });
      alert(user, "Your password was reset and every device was signed out");
      return { ok: true };
    },

    "POST /api/auth/logout": (req, p, url, res) => {
      const c = current(req);
      if (c) q.delSession.run(c.sid);
      clearCookie(res);
      return { ok: true };
    },

    // ---------- Account ----------
    "PATCH /api/account": async (req) => {
      const { user } = requireUser(req);
      const b = await readJson(req);
      const name = b.name === undefined ? user.name : str(b.name, 80);
      if (!name) throw new HttpError(422, "Add your name.", { name: "Add your name." });
      let plates = JSON.parse(user.plates);
      if (Array.isArray(b.plates)) {
        plates = [];
        for (const raw of b.plates.slice(0, 5)) {
          const pl = validPlate(raw);
          if (!pl) throw new HttpError(422, `"${String(raw).slice(0, 12)}" doesn't look like a plate. Use the format ΙΚΧ-1234.`, { plates: "Check the plate format." });
          if (!plates.includes(pl)) plates.push(pl);
        }
      }
      db.prepare("UPDATE users SET name = ?, plates = ? WHERE id = ?").run(name, JSON.stringify(plates), user.id);
      return { user: publicUser(q.user.get(user.id)) };
    },

    "POST /api/account/password": async (req) => {
      const { user, sid } = requireUser(req);
      limit("pw:" + user.id, 6, 15 * MIN);
      const b = await readJson(req);
      if (!(await S.verifyPassword(String(b.current || ""), user.password_hash))) throw new HttpError(401, "Your current password isn't right.", { current: "Your current password isn't right." });
      const problem = S.passwordProblem(b.next, user.email, user.name);
      if (problem) throw new HttpError(422, problem, { next: problem });
      if (await S.verifyPassword(b.next, user.password_hash)) throw new HttpError(422, "Choose a password you haven't used here.", { next: "Choose a different password." });
      db.prepare("UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?").run(await S.hashPassword(b.next), iso(), user.id);
      q.delOtherSessions.run(user.id, sid);
      alert(user, "Your password was changed and other devices were signed out");
      return { ok: true };
    },

    "POST /api/account/2fa/setup": async (req) => {
      const { user } = requireUser(req);
      limit("2fa:" + user.id, 10, 15 * MIN);
      const b = await readJson(req);
      if (!(await S.verifyPassword(String(b.password || ""), user.password_hash))) throw new HttpError(401, "Your password isn't right.", { password: "Your password isn't right." });
      const secret = S.newTotpSecret();
      db.prepare("UPDATE users SET totp_pending = ? WHERE id = ?").run(cipher.encrypt(secret), user.id);
      return { secret, otpauth: S.otpauthUrl(secret, user.email) };
    },

    "POST /api/account/2fa/enable": async (req) => {
      const { user } = requireUser(req);
      limit("2fa:" + user.id, 10, 15 * MIN);
      const b = await readJson(req);
      if (!user.totp_pending) throw new HttpError(409, "Start the setup again.", { restart: true });
      const secret = cipher.decrypt(user.totp_pending);
      const step = S.verifyTotp(secret, String(b.code || "").replace(/\s/g, ""), 0);
      if (step < 0) throw new HttpError(401, "That code isn't right. Check the time on your phone and try the newest code.", { code: "wrong" });
      const codes = S.recoveryCodes();
      tx(db, () => {
        db.prepare("UPDATE users SET totp_secret = totp_pending, totp_pending = NULL, totp_last_step = ? WHERE id = ?").run(step, user.id);
        q.delRecovery.run(user.id);
        for (const c of codes) q.insRecovery.run(user.id, S.sha256(S.normRecovery(c)));
      });
      alert(user, "Two-step sign-in with an authenticator app was turned on");
      return { recoveryCodes: codes, user: publicUser(q.user.get(user.id)) };
    },

    "POST /api/account/2fa/disable": async (req) => {
      const { user } = requireUser(req);
      limit("2fa:" + user.id, 10, 15 * MIN);
      const b = await readJson(req);
      if (!user.totp_secret) throw new HttpError(409, "The authenticator app isn't turned on.");
      if (!(await S.verifyPassword(String(b.password || ""), user.password_hash))) throw new HttpError(401, "Your password isn't right.", { password: "Your password isn't right." });
      const step = S.verifyTotp(cipher.decrypt(user.totp_secret), String(b.code || "").replace(/\s/g, ""), user.totp_last_step);
      if (step < 0) throw new HttpError(401, "That code isn't right.", { code: "wrong" });
      tx(db, () => {
        db.prepare("UPDATE users SET totp_secret = NULL, totp_pending = NULL, totp_last_step = 0 WHERE id = ?").run(user.id);
        q.delRecovery.run(user.id);
      });
      alert(user, "The authenticator app was removed. Sign-in now uses emailed codes");
      return { user: publicUser(q.user.get(user.id)) };
    },

    "POST /api/account/2fa/recovery-codes": async (req) => {
      const { user } = requireUser(req);
      limit("2fa:" + user.id, 10, 15 * MIN);
      const b = await readJson(req);
      if (!user.totp_secret) throw new HttpError(409, "Turn on the authenticator app first.");
      if (!(await S.verifyPassword(String(b.password || ""), user.password_hash))) throw new HttpError(401, "Your password isn't right.", { password: "Your password isn't right." });
      const codes = S.recoveryCodes();
      tx(db, () => { q.delRecovery.run(user.id); for (const c of codes) q.insRecovery.run(user.id, S.sha256(S.normRecovery(c))); });
      alert(user, "New recovery codes were created; the old ones no longer work");
      return { recoveryCodes: codes };
    },

    "GET /api/account/sessions": (req) => {
      const { user, sid } = requireUser(req);
      return q.sessions.all(user.id, iso()).map((s) => ({ id: s.id.slice(0, 16), current: s.id === sid, createdAt: s.created_at, lastSeen: s.last_seen, ip: s.ip, userAgent: s.user_agent }));
    },
    "DELETE /api/account/sessions/:id": (req, p) => {
      const { user, sid } = requireUser(req);
      const target = q.sessions.all(user.id, iso()).find((s) => s.id.slice(0, 16) === String(p.id));
      if (!target) throw new HttpError(404, "That device is already signed out.");
      if (target.id === sid) throw new HttpError(400, "Use Sign out to end this session.");
      q.delSession.run(target.id);
      return { ok: true };
    },
    "POST /api/account/sessions/revoke-others": (req) => {
      const { user, sid } = requireUser(req);
      q.delOtherSessions.run(user.id, sid);
      return { ok: true };
    },

    "GET /api/account/bookings": (req) => {
      const { user } = requireUser(req);
      return q.myBookings.all(user.id).map((b) => ({ code: b.code, parkingId: b.garage_id, name: b.garage_name, area: b.garage_area, slug: b.garage_slug, plate: b.plate, start: b.start_at, hours: b.hours, total: b.total, status: b.status, createdAt: b.created_at }));
    },

    "DELETE /api/account": async (req, p, url, res) => {
      const { user } = requireUser(req);
      limit("delete:" + user.id, 5, 15 * MIN);
      const b = await readJson(req);
      if (!(await S.verifyPassword(String(b.password || ""), user.password_hash))) throw new HttpError(401, "Your password isn't right.", { password: "Your password isn't right." });
      if (b.confirm !== "DELETE") throw new HttpError(422, 'Type DELETE to confirm.', { confirm: 'Type DELETE to confirm.' });
      tx(db, () => {
        db.prepare("UPDATE bookings SET email = NULL, user_id = NULL WHERE user_id = ?").run(user.id);
        db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
      });
      clearCookie(res);
      return { ok: true };
    },
  };

  return { routes, current, requireUser, publicUser, close: () => clearInterval(sweep) };
}

module.exports = { authModule, maskEmail };
