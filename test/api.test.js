"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const { createApp, config } = require("../server/server");

let app, base;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "parkareto-test-"));

before(async () => {
  const cfg = config({ PORT: "0", DB_FILE: path.join(dir, "t.db"), SITE_URL: "https://parkareto.test", ADMIN_TOKEN: "admin-secret", OPERATOR_KEY: "op-secret", SIMULATE: "0", LOG: "0", APP_SECRET: "test-app-secret", DEV_MAILBOX: "1", LIMIT_SCALE: "20" });
  app = createApp(cfg);
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${app.server.address().port}`;
});
after(async () => { await app.close(); fs.rmSync(dir, { recursive: true, force: true }); });

const post = (p, body, headers = {}) => fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const soon = () => new Date(Date.now() + 3600e3).toISOString();

test("health and car park list", async () => {
  assert.equal((await (await fetch(base + "/api/health")).json()).ok, true);
  const list = await (await fetch(base + "/api/parkings")).json();
  assert.equal(list.length, 18);
  assert.equal(list[0].slug, "syntagma-square-garage");
  assert.ok(Array.isArray(list[0].features));
});

// ---------- Account helpers ----------
const S = require("../server/security");
const cookieOf = (res) => (res.headers.get("set-cookie") || "").split(";")[0];
const lastCode = async (to) => (await (await fetch(`${base}/api/dev/outbox?to=${encodeURIComponent(to)}`)).json())[0];
async function signUp(email, password = "Plaka-Moon-2026!", name = "Eleni Test") {
  const r = await post("/api/auth/signup", { name, email, password, accept: true });
  assert.equal(r.status, 200);
  const { challenge } = await r.json();
  const v = await post("/api/auth/verify", { challenge, code: (await lastCode(email)).code });
  assert.equal(v.status, 200);
  return cookieOf(v);
}
const authed = (cookie) => ({ Cookie: cookie });

test("booking: needs an account; price on server; owner-only cancel", async () => {
  assert.equal((await post("/api/bookings", { parkingId: 1, start: soon(), hours: 1, plate: "ABC-1234" })).status, 401);
  const me = await signUp("driver1@example.gr");
  const other = await signUp("driver2@example.gr");
  const before = (await (await fetch(base + "/api/parkings/1")).json()).free;
  const res = await post("/api/bookings", { parkingId: 1, start: new Date(Date.now() + 3 * 3600e3).toISOString(), hours: 24, plate: "ικχ-1234", total: 0.01 }, authed(me));
  assert.equal(res.status, 201);
  const b = await res.json();
  assert.match(b.code, /^ATH-[0-9A-F]{6}$/);
  assert.equal(b.total, 22); // day cap, client total ignored
  assert.equal(b.plate, "ΙΚΧ-1234");
  assert.equal((await (await fetch(base + "/api/parkings/1")).json()).free, before - 1);
  const mine = await (await fetch(base + "/api/account/bookings", { headers: authed(me) })).json();
  assert.equal(mine[0].code, b.code);
  const prof = await (await fetch(base + "/api/auth/me", { headers: authed(me) })).json();
  assert.deepEqual(prof.user.plates, ["ΙΚΧ-1234"]);

  assert.equal((await post(`/api/account/bookings/${b.code}/cancel`, {}, authed(other))).status, 404);
  assert.equal((await post(`/api/account/bookings/${b.code}/cancel`, {}, authed(me))).status, 200);
  assert.equal((await post(`/api/account/bookings/${b.code}/cancel`, {}, authed(me))).status, 409);
  assert.equal((await (await fetch(base + "/api/parkings/1")).json()).free, before);

  const late = await (await post("/api/bookings", { parkingId: 1, start: new Date(Date.now() + 10 * 60e3).toISOString(), hours: 1, plate: "ABC-1234" }, authed(me))).json();
  assert.equal((await post(`/api/account/bookings/${late.code}/cancel`, {}, authed(me))).status, 409); // within 30 minutes
});

test("sign-up: weak passwords, verification code, no account enumeration", async () => {
  const weak = await post("/api/auth/signup", { name: "A", email: "weak@example.gr", password: "password123", accept: true });
  assert.equal(weak.status, 422);
  assert.ok((await weak.json()).fields.password);
  assert.equal((await post("/api/auth/signup", { name: "A", email: "x@example.gr", password: "Plaka-Moon-2026!" })).status, 422); // terms

  const r = await post("/api/auth/signup", { name: "Nikos", email: "nikos@example.gr", password: "Plaka-Moon-2026!", accept: true });
  const { challenge, to } = await r.json();
  assert.equal(to, "n***s@example.gr");
  const wrong = await post("/api/auth/verify", { challenge, code: "000000" });
  assert.equal(wrong.status, 401);
  assert.match((await wrong.json()).error, /4 tries left/);
  const ok = await post("/api/auth/verify", { challenge, code: (await lastCode("nikos@example.gr")).code });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get("set-cookie"), /pk_session=.+HttpOnly; SameSite=Lax/);

  // Same email again: same response shape, an "already have an account" email, and no way through.
  const again = await post("/api/auth/signup", { name: "Mallory", email: "nikos@example.gr", password: "Another-Pass-77!", accept: true });
  assert.equal(again.status, 200);
  const j = await again.json();
  assert.ok(j.challenge);
  assert.equal((await lastCode("nikos@example.gr")).template, "exists");
  assert.equal((await post("/api/auth/verify", { challenge: j.challenge, code: "123456" })).status, 401);
});

test("sign-in: generic errors and an emailed second step", async () => {
  await signUp("maria@example.gr");
  const bad = await post("/api/auth/login", { email: "maria@example.gr", password: "nope-nope-nope" });
  const unknown = await post("/api/auth/login", { email: "ghost@example.gr", password: "nope-nope-nope" });
  assert.equal(bad.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal((await bad.json()).error, (await unknown.json()).error);

  const r = await post("/api/auth/login", { email: "maria@example.gr", password: "Plaka-Moon-2026!" });
  const { challenge, method } = await r.json();
  assert.equal(method, "email");
  assert.equal((await post("/api/auth/resend", { challenge })).status, 429); // cooldown
  const v = await post("/api/auth/verify", { challenge, code: (await lastCode("maria@example.gr")).code });
  assert.equal(v.status, 200);
  const me = await (await fetch(base + "/api/auth/me", { headers: authed(cookieOf(v)) })).json();
  assert.equal(me.user.twoFactor, "email");
  // A used challenge can't be replayed
  assert.equal((await post("/api/auth/verify", { challenge, code: "000000" })).status, 410);
});

test("authenticator app: setup, sign-in, replay protection, recovery codes, disable", async () => {
  const c = await signUp("kostas@example.gr");
  assert.equal((await post("/api/account/2fa/setup", { password: "wrong" }, authed(c))).status, 401);
  const { secret, otpauth } = await (await post("/api/account/2fa/setup", { password: "Plaka-Moon-2026!" }, authed(c))).json();
  assert.match(otpauth, /^otpauth:\/\/totp\/Parkareto%3Akostas%40example\.gr\?secret=/);
  assert.equal((await post("/api/account/2fa/enable", { code: "000000" }, authed(c))).status, 401);
  const en = await post("/api/account/2fa/enable", { code: S.totpNow(secret) }, authed(c));
  const { recoveryCodes } = await en.json();
  assert.equal(recoveryCodes.length, 10);

  const login = async () => (await (await post("/api/auth/login", { email: "kostas@example.gr", password: "Plaka-Moon-2026!" })).json());
  let ch = await login();
  assert.equal(ch.method, "totp");
  // The code already used to enable can't be used again (replay); the next one works.
  assert.equal((await post("/api/auth/verify", { challenge: ch.challenge, code: S.totpNow(secret) })).status, 401);
  assert.equal((await post("/api/auth/verify", { challenge: ch.challenge, code: S.totpNow(secret, Date.now() + 30000) })).status, 200);

  ch = await login();
  const rc = await post("/api/auth/verify", { challenge: ch.challenge, recoveryCode: recoveryCodes[0].toLowerCase() });
  assert.equal(rc.status, 200);
  assert.equal((await rc.json()).recoveryCodesLeft, 9);
  ch = await login();
  assert.equal((await post("/api/auth/verify", { challenge: ch.challenge, recoveryCode: recoveryCodes[0] })).status, 401); // single use

  assert.equal((await post("/api/account/2fa/disable", { password: "Plaka-Moon-2026!", code: "000000" }, authed(c))).status, 401);
});

test("five wrong codes end the challenge", async () => {
  await signUp("eva@example.gr");
  const { challenge } = await (await post("/api/auth/login", { email: "eva@example.gr", password: "Plaka-Moon-2026!" })).json();
  for (let i = 0; i < 5; i++) await post("/api/auth/verify", { challenge, code: "999999" });
  const end = await post("/api/auth/verify", { challenge, code: (await lastCode("eva@example.gr")).code });
  assert.equal(end.status, 429);
  assert.equal((await end.json()).fields.restart, true);
});

test("password reset signs out every device", async () => {
  const c = await signUp("reset@example.gr");
  const { challenge } = await (await post("/api/auth/forgot", { email: "reset@example.gr" })).json();
  const code = (await lastCode("reset@example.gr")).code;
  assert.equal((await post("/api/auth/reset", { challenge, code, password: "short" })).status, 422);
  assert.equal((await post("/api/auth/reset", { challenge, code, password: "Brand-New-Pass-88!" })).status, 200);
  assert.equal((await (await fetch(base + "/api/auth/me", { headers: authed(c) })).json()).user, null);
  assert.equal((await post("/api/auth/login", { email: "reset@example.gr", password: "Brand-New-Pass-88!" })).status, 200);
  // Unknown emails get the same answer
  assert.equal((await post("/api/auth/forgot", { email: "nobody@example.gr" })).status, 200);
});

test("cross-site requests are refused; sessions can be listed and revoked; account deletion", async () => {
  const c = await signUp("sessions@example.gr");
  assert.equal((await post("/api/auth/logout", {}, { ...authed(c), Origin: "https://evil.example" })).status, 403);
  const { challenge } = await (await post("/api/auth/login", { email: "sessions@example.gr", password: "Plaka-Moon-2026!" })).json();
  const second = cookieOf(await post("/api/auth/verify", { challenge, code: (await lastCode("sessions@example.gr")).code }));
  const list = await (await fetch(base + "/api/account/sessions", { headers: authed(c) })).json();
  assert.equal(list.length, 2);
  const other = list.find((s) => !s.current);
  assert.equal((await fetch(base + "/api/account/sessions/" + other.id, { method: "DELETE", headers: authed(c) })).status, 200);
  assert.equal((await (await fetch(base + "/api/auth/me", { headers: authed(second) })).json()).user, null);

  const del = (body) => fetch(base + "/api/account", { method: "DELETE", headers: { "Content-Type": "application/json", ...authed(c) }, body: JSON.stringify(body) });
  assert.equal((await del({ password: "Plaka-Moon-2026!" })).status, 422);
  assert.equal((await del({ password: "Plaka-Moon-2026!", confirm: "DELETE" })).status, 200);
  assert.equal((await post("/api/auth/login", { email: "sessions@example.gr", password: "Plaka-Moon-2026!" })).status, 401);
});

test("booking validation", async () => {
  const c = await signUp("valid@example.gr");
  const r = await post("/api/bookings", { parkingId: 1, start: "2001-01-01T00:00:00Z", hours: 5, plate: "<script>" }, authed(c));
  assert.equal(r.status, 422);
  const { fields } = await r.json();
  assert.deepEqual(Object.keys(fields).sort(), ["hours", "plate", "start"]);
  assert.equal((await post("/api/bookings", { parkingId: 999, start: soon(), hours: 1, plate: "ABC-1234" }, authed(c))).status, 404);
  assert.equal((await fetch(base + "/api/bookings", { method: "POST", headers: authed(c), body: "x" })).status, 415);
});

test("full car park refuses bookings", async () => {
  const auth = { Authorization: "Bearer op-secret" };
  const put = (body) => fetch(base + "/api/operator/garages/2", { method: "PUT", headers: { "Content-Type": "application/json", ...auth }, body: JSON.stringify(body) });
  assert.equal((await put({ free: 0 })).status, 200);
  assert.equal((await post("/api/bookings", { parkingId: 2, start: soon(), hours: 1, plate: "ABC-1234" }, authed(await signUp("full@example.gr")))).status, 409);
  assert.equal((await put({ free: 9999 })).status, 422);
  assert.equal((await fetch(base + "/api/operator/garages/2", { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 401);
});

test("demo requests: validation, honeypot, admin listing and CSV", async () => {
  assert.equal((await post("/api/demo-requests", { name: "", email: "x" })).status, 422);
  assert.equal((await post("/api/demo-requests", { name: "Bot", email: "bot@x.com", website: "spam" })).status, 201);
  assert.equal((await post("/api/demo-requests", { name: "Γιώργος", company: "=HYPERLINK(1)", email: "g@park.gr", bays: "120", plan: "Pro" })).status, 201);

  assert.equal((await fetch(base + "/api/admin/demo-requests")).status, 401);
  const auth = { headers: { Authorization: "Bearer admin-secret" } };
  const leads = await (await fetch(base + "/api/admin/demo-requests", auth)).json();
  assert.equal(leads.length, 1); // honeypot entry not stored
  assert.equal(leads[0].bays, 120);
  const csv = await (await fetch(base + "/api/admin/demo-requests.csv", auth)).text();
  assert.match(csv, /"'=HYPERLINK\(1\)"/); // formula injection neutralised
  const patch = await fetch(base + `/api/admin/demo-requests/${leads[0].id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: "Bearer admin-secret" }, body: JSON.stringify({ status: "contacted" }) });
  assert.equal(patch.status, 200);
  const sum = await (await fetch(base + "/api/admin/summary", auth)).json();
  assert.equal(sum.new_leads, 0);
});

test("admin can edit a car park", async () => {
  const r = await fetch(base + "/api/admin/garages/3", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: "Bearer admin-secret" }, body: JSON.stringify({ price_hour: 3.25, total: 10, free: 50 }) });
  const g = await r.json();
  assert.equal(g.price, 3.25);
  assert.equal(g.free, 10); // clamped to total
});

test("live stream sends a snapshot", async () => {
  const ac = new AbortController();
  const res = await fetch(base + "/api/stream", { signal: ac.signal });
  assert.equal(res.headers.get("content-type"), "text/event-stream");
  const { value } = await res.body.getReader().read();
  assert.match(Buffer.from(value).toString(), /event: snapshot/);
  ac.abort();
});

test("SEO pages, sitemap, robots and canonical URLs", async () => {
  const home = await fetch(base + "/");
  const html = await home.text();
  assert.match(html, /<link rel="canonical" href="https:\/\/parkareto\.test\/">/);
  assert.match(html, /"@type":\s*"SoftwareApplication"/);
  assert.match(home.headers.get("content-security-policy"), /script-src 'self' 'sha256-/);

  const g = await fetch(base + "/parking/plaka-old-town-parking");
  assert.equal(g.status, 200);
  const gh = await g.text();
  assert.match(gh, /"@type":\s*"ParkingFacility"/);
  assert.match(gh, /<h1>Plaka Old Town Parking<\/h1>/);

  assert.equal((await fetch(base + "/parking")).status, 200);
  const sm = await (await fetch(base + "/sitemap.xml")).text();
  assert.match(sm, /https:\/\/parkareto\.test\/parking\/syntagma-square-garage/);
  assert.match(await (await fetch(base + "/robots.txt")).text(), /Sitemap: https:\/\/parkareto\.test\/sitemap\.xml/);

  const r = await fetch(base + "/marketplace.html", { redirect: "manual" });
  assert.equal(r.status, 301);
  assert.equal(r.headers.get("location"), "/marketplace");
  assert.equal((await fetch(base + "/parking/no-such-place")).status, 404);
  assert.equal((await fetch(base + "/privacy")).status, 200);
  assert.equal((await fetch(base + "/terms.html", { redirect: "manual" })).headers.get("location"), "/terms");
  assert.match(await (await fetch(base + "/robots.txt")).text(), /Disallow: \/account/);
});

test("static files: compression, caching and no path traversal", async () => {
  const css = await fetch(base + "/landing.css", { headers: { "Accept-Encoding": "br" } });
  assert.equal(css.status, 200);
  assert.ok(css.headers.get("etag"));
  const again = await fetch(base + "/landing.css", { headers: { "If-None-Match": css.headers.get("etag") } });
  assert.equal(again.status, 304);
  for (const p of ["/../server/server.js", "/%2e%2e/package.json", "/..%2fserver/db.js", "/.env"]) {
    assert.equal((await fetch(base + p)).status, 404, p);
  }
});
