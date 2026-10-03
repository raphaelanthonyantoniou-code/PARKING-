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
  const cfg = config({ PORT: "0", DB_FILE: path.join(dir, "t.db"), SITE_URL: "https://parkareto.test", ADMIN_TOKEN: "admin-secret", OPERATOR_KEY: "op-secret", SIMULATE: "0", LOG: "0" });
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

test("booking: price is computed on the server and a space is taken", async () => {
  const before = (await (await fetch(base + "/api/parkings/1")).json()).free;
  const res = await post("/api/bookings", { parkingId: 1, start: soon(), hours: 24, plate: "ικχ-1234", email: "a@b.gr", total: 0.01 });
  assert.equal(res.status, 201);
  const b = await res.json();
  assert.match(b.code, /^ATH-[0-9A-F]{6}$/);
  assert.equal(b.total, 22); // day cap, client total ignored
  assert.equal(b.plate, "ΙΚΧ-1234");
  assert.equal((await (await fetch(base + "/api/parkings/1")).json()).free, before - 1);

  const look = await fetch(`${base}/api/bookings/${b.code}?plate=${encodeURIComponent("ΙΚΧ-1234")}`);
  assert.equal(look.status, 200);
  assert.equal((await fetch(`${base}/api/bookings/${b.code}?plate=WRONG-1`)).status, 404);

  assert.equal((await post(`/api/bookings/${b.code}/cancel`, { plate: "XXX-0000" })).status, 404);
  assert.equal((await post(`/api/bookings/${b.code}/cancel`, { plate: "ΙΚΧ-1234" })).status, 200);
  assert.equal((await post(`/api/bookings/${b.code}/cancel`, { plate: "ΙΚΧ-1234" })).status, 409);
  assert.equal((await (await fetch(base + "/api/parkings/1")).json()).free, before);
});

test("booking validation", async () => {
  const r = await post("/api/bookings", { parkingId: 1, start: "2001-01-01T00:00:00Z", hours: 5, plate: "<script>", email: "nope" });
  assert.equal(r.status, 422);
  const { fields } = await r.json();
  assert.deepEqual(Object.keys(fields).sort(), ["email", "hours", "plate", "start"]);
  assert.equal((await post("/api/bookings", { parkingId: 999, start: soon(), hours: 1, plate: "ABC-1234" })).status, 404);
  assert.equal((await fetch(base + "/api/bookings", { method: "POST", body: "x" })).status, 415);
});

test("full car park refuses bookings", async () => {
  const auth = { Authorization: "Bearer op-secret" };
  const put = (body) => fetch(base + "/api/operator/garages/2", { method: "PUT", headers: { "Content-Type": "application/json", ...auth }, body: JSON.stringify(body) });
  assert.equal((await put({ free: 0 })).status, 200);
  assert.equal((await post("/api/bookings", { parkingId: 2, start: soon(), hours: 1, plate: "ABC-1234" })).status, 409);
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
