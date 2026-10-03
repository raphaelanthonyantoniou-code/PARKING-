"use strict";
// Parkareto web server: static site, server-rendered SEO pages and the JSON API.
// No external dependencies; needs Node.js 22.13+ for the built-in SQLite module.

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const crypto = require("node:crypto");
const { open, tx } = require("./db");
const { ALLOWED_HOURS, bookingCost } = require("./pricing");
const { HttpError, str, plate, email } = require("./validate");
const ssr = require("./ssr");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const PLACEHOLDER_SITE = "https://parkareto.example";

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".webp": "image/webp", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json", ".woff2": "font/woff2",
};
const COMPRESSIBLE = /^(text\/|application\/(json|xml|manifest\+json)|image\/svg)/;

function config(env = process.env) {
  const port = Number(env.PORT) || 3000;
  return {
    port,
    host: env.HOST || "0.0.0.0",
    dbFile: env.DB_FILE || path.join(ROOT, "data", "parkareto.db"),
    site: (env.SITE_URL || `http://localhost:${port}`).replace(/\/$/, ""),
    adminToken: env.ADMIN_TOKEN || "",
    operatorKey: env.OPERATOR_KEY || "",
    simulate: env.SIMULATE ? env.SIMULATE !== "0" : env.NODE_ENV !== "production",
    webhook: env.NOTIFY_WEBHOOK_URL || "",
    trustProxy: env.TRUST_PROXY === "1",
    log: env.LOG !== "0",
  };
}

function createApp(cfg = config()) {
  const db = open(cfg.dbFile, path.join(PUBLIC, "data.js"));

  // ---------- Queries ----------
  const q = {
    garages: db.prepare("SELECT * FROM garages ORDER BY id"),
    garage: db.prepare("SELECT * FROM garages WHERE id = ?"),
    garageBySlug: db.prepare("SELECT * FROM garages WHERE slug = ?"),
    setFree: db.prepare("UPDATE garages SET free = ?, updated_at = ? WHERE id = ?"),
    insBooking: db.prepare("INSERT INTO bookings (code, garage_id, plate, email, start_at, hours, total, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)"),
    booking: db.prepare("SELECT b.*, g.name AS garage_name, g.area AS garage_area, g.slug AS garage_slug FROM bookings b JOIN garages g ON g.id = b.garage_id WHERE b.code = ?"),
    cancelBooking: db.prepare("UPDATE bookings SET status = 'cancelled' WHERE code = ? AND status = 'active'"),
    insLead: db.prepare("INSERT INTO demo_requests (name, company, email, phone, bays, plan, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"),
    leads: db.prepare("SELECT * FROM demo_requests ORDER BY id DESC LIMIT 500"),
    setLead: db.prepare("UPDATE demo_requests SET status = ? WHERE id = ?"),
    bookings: db.prepare("SELECT b.*, g.name AS garage_name FROM bookings b JOIN garages g ON g.id = b.garage_id ORDER BY b.created_at DESC LIMIT 500"),
    summary: db.prepare(`SELECT
      (SELECT COUNT(*) FROM demo_requests WHERE status = 'new') AS new_leads,
      (SELECT COUNT(*) FROM demo_requests WHERE created_at >= datetime('now', '-7 days')) AS leads_7d,
      (SELECT COUNT(*) FROM bookings WHERE status = 'active') AS active_bookings,
      (SELECT COALESCE(SUM(total), 0) FROM bookings WHERE status = 'active') AS booked_revenue,
      (SELECT SUM(free) FROM garages) AS free_spaces,
      (SELECT SUM(total) FROM garages) AS total_spaces`),
  };

  const publicGarage = (g) => ({
    id: g.id, slug: g.slug, name: g.name, area: g.area, lat: g.lat, lng: g.lng,
    price: g.price_hour, daily: g.price_day, total: g.total, free: g.free, features: JSON.parse(g.features),
  });

  // ---------- Live availability (Server-Sent Events) ----------
  const clients = new Set();
  function broadcast(event, data) {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) res.write(msg);
  }
  function setFree(id, free) {
    q.setFree.run(free, new Date().toISOString(), id);
    broadcast("availability", { id, free });
  }
  const heartbeat = setInterval(() => { for (const res of clients) res.write(": ping\n\n"); }, 25000);
  let sim = null;
  if (cfg.simulate) {
    // Demo mode: nudge availability so the marketplace looks alive without real garages connected.
    sim = setInterval(() => {
      const all = q.garages.all();
      const g = all[Math.floor(Math.random() * all.length)];
      const d = (Math.random() < 0.5 ? -1 : 1) * Math.ceil(Math.random() * 3);
      setFree(g.id, Math.max(0, Math.min(g.total, g.free + d)));
    }, 4000);
  }

  // ---------- Rate limiting ----------
  const buckets = new Map();
  function limit(key, max, perMs) {
    const now = Date.now();
    const b = buckets.get(key) || { n: 0, reset: now + perMs };
    if (now > b.reset) { b.n = 0; b.reset = now + perMs; }
    b.n++;
    buckets.set(key, b);
    if (b.n > max) throw new HttpError(429, "Too many requests. Try again in a minute.");
  }
  const sweep = setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now > b.reset) buckets.delete(k); }, 60000);

  // ---------- Helpers ----------
  const ip = (req) => (cfg.trustProxy && String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()) || req.socket.remoteAddress || "";
  const sameSecret = (given, secret) => {
    if (!secret || !given) return false;
    const a = crypto.createHash("sha256").update(given).digest(), b = crypto.createHash("sha256").update(secret).digest();
    return crypto.timingSafeEqual(a, b);
  };
  const bearer = (req) => (String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i) || [])[1] || "";
  function requireAdmin(req) {
    if (!cfg.adminToken) throw new HttpError(503, "Admin is disabled. Set ADMIN_TOKEN to enable it.");
    if (!sameSecret(bearer(req), cfg.adminToken)) throw new HttpError(401, "Wrong or missing admin token.");
  }

  function readJson(req) {
    return new Promise((resolve, reject) => {
      if (!/^application\/json/i.test(req.headers["content-type"] || "")) return reject(new HttpError(415, "Send JSON with Content-Type: application/json."));
      let size = 0; const chunks = [];
      req.on("data", (c) => { size += c.length; if (size > 16 * 1024) { reject(new HttpError(413, "Request body too large.")); req.destroy(); } else chunks.push(c); });
      req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch { reject(new HttpError(400, "Body is not valid JSON.")); } });
      req.on("error", reject);
    });
  }

  function security(res, extra = {}) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Permissions-Policy", "geolocation=(self), camera=(), microphone=()");
    if (cfg.site.startsWith("https://")) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  }

  // CSP: inline scripts are allowed only by hash, computed from each HTML page.
  function csp(html) {
    const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/g)]
      .map((m) => `'sha256-${crypto.createHash("sha256").update(m[1]).digest("base64")}'`);
    return [
      "default-src 'self'",
      `script-src 'self' ${hashes.join(" ")}`.trim(),
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self'",
      "img-src 'self' data: https://*.basemaps.cartocdn.com https://*.tile.openstreetmap.org",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self' mailto:",
    ].join("; ");
  }

  function send(req, res, status, body, type, headers = {}) {
    let buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const h = { "Content-Type": type, ...headers };
    const etag = '"' + crypto.createHash("sha1").update(buf).digest("base64url").slice(0, 20) + '"';
    if (status === 200) {
      h.ETag = etag;
      if (req.headers["if-none-match"] === etag) { res.writeHead(304, { ETag: etag, "Cache-Control": h["Cache-Control"] || "no-cache" }); return res.end(); }
    }
    const ae = String(req.headers["accept-encoding"] || "");
    if (buf.length > 1024 && COMPRESSIBLE.test(type)) {
      h.Vary = "Accept-Encoding";
      if (/\bbr\b/.test(ae)) { buf = zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }); h["Content-Encoding"] = "br"; }
      else if (/\bgzip\b/.test(ae)) { buf = zlib.gzipSync(buf, { level: 6 }); h["Content-Encoding"] = "gzip"; }
    }
    h["Content-Length"] = buf.length;
    res.writeHead(status, h);
    res.end(req.method === "HEAD" ? undefined : buf);
  }
  const json = (req, res, status, data) => send(req, res, status, JSON.stringify(data), TYPES[".json"], { "Cache-Control": "no-store" });

  // Static files from /public only. HTML is rewritten to the real site URL.
  const fileCache = new Map();
  function readPublic(rel) {
    const file = path.resolve(PUBLIC, "." + path.posix.normalize("/" + rel));
    if (!file.startsWith(PUBLIC + path.sep)) return null;
    if (file.split(path.sep).some((p) => p.startsWith("."))) return null;
    let st;
    try { st = fs.statSync(file); } catch { return null; }
    if (!st.isFile()) return null;
    const hit = fileCache.get(file);
    if (hit && hit.mtime === st.mtimeMs) return hit;
    const ext = path.extname(file).toLowerCase();
    let data = fs.readFileSync(file);
    if (ext === ".html" || ext === ".xml" || ext === ".webmanifest") data = Buffer.from(data.toString("utf8").split(PLACEHOLDER_SITE).join(cfg.site));
    const entry = { data, type: TYPES[ext] || "application/octet-stream", ext, mtime: st.mtimeMs, csp: ext === ".html" ? csp(data.toString("utf8")) : null };
    fileCache.set(file, entry);
    return entry;
  }
  function serveFile(req, res, rel, status = 200) {
    const f = readPublic(rel);
    if (!f) return false;
    security(res, f.csp ? { "Content-Security-Policy": f.csp } : {});
    const cache = f.ext === ".html" ? "no-cache" : rel.startsWith("vendor/") ? "public, max-age=2592000, immutable" : "public, max-age=86400";
    send(req, res, status, f.data, f.type, { "Cache-Control": cache });
    return true;
  }
  function page(req, res, html, status = 200) {
    security(res, { "Content-Security-Policy": csp(html) });
    send(req, res, status, html, TYPES[".html"], { "Cache-Control": "no-cache" });
  }
  function notFound(req, res) {
    if (!serveFile(req, res, "404.html", 404)) json(req, res, 404, { error: "Not found" });
  }

  function notify(lead) {
    if (!cfg.webhook) return;
    const text = `New Parkareto demo request: ${lead.name}${lead.company ? " (" + lead.company + ")" : ""} · ${lead.email}${lead.bays ? " · " + lead.bays + " bays" : ""} · ${lead.plan || "plan not set"}`;
    fetch(cfg.webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, lead }), signal: AbortSignal.timeout(5000) }).catch(() => {});
  }

  // Handlers return a body, or created(body) for 201 responses.
  const CREATED = Symbol("created");
  const created = (body) => ({ [CREATED]: true, body });

  // ---------- API handlers ----------
  const api = {
    "GET /api/health": () => ({ ok: true, time: new Date().toISOString() }),

    "GET /api/parkings": () => q.garages.all().map(publicGarage),

    "GET /api/parkings/:id": (req, p) => {
      const g = q.garage.get(Number(p.id));
      if (!g) throw new HttpError(404, "No car park with that id.");
      return publicGarage(g);
    },

    "POST /api/bookings": async (req) => {
      limit("book:" + ip(req), 10, 60000);
      const b = await readJson(req);
      const errors = {};
      const garageId = Number(b.parkingId);
      const hours = Number(b.hours);
      const pl = plate(b.plate);
      const em = email(b.email, false);
      const start = new Date(str(b.start, 40));
      if (!ALLOWED_HOURS.includes(hours)) errors.hours = "Choose one of the listed durations.";
      if (!pl) errors.plate = "Enter the plate as shown, for example ΙΚΧ-1234.";
      if (em === null) errors.email = "Enter a valid email or leave it empty.";
      if (isNaN(start)) errors.start = "Choose a start date and time.";
      else if (start < Date.now() - 5 * 60000) errors.start = "Choose a start time in the future.";
      else if (start > Date.now() + 90 * 86400000) errors.start = "Bookings open up to 90 days ahead.";
      if (Object.keys(errors).length) throw new HttpError(422, "Check the highlighted fields.", errors);

      const made = tx(db, () => {
        const g = q.garage.get(garageId);
        if (!g) throw new HttpError(404, "No car park with that id.");
        if (g.free <= 0) throw new HttpError(409, `${g.name} is full right now. Pick another car park.`);
        const code = "ATH-" + crypto.randomBytes(4).toString("hex").toUpperCase().slice(0, 6);
        const total = bookingCost(g, hours);
        q.insBooking.run(code, g.id, pl, em || null, start.toISOString(), hours, total, new Date().toISOString());
        q.setFree.run(g.free - 1, new Date().toISOString(), g.id);
        return { code, garage: g, total, free: g.free - 1 };
      });
      broadcast("availability", { id: made.garage.id, free: made.free });
      return created({ code: made.code, parkingId: made.garage.id, name: made.garage.name, area: made.garage.area, plate: pl, start: start.toISOString(), hours, total: made.total });
    },

    "GET /api/bookings/:code": (req, p, url) => {
      limit("lookup:" + ip(req), 30, 60000);
      const bk = q.booking.get(str(p.code, 20).toUpperCase());
      if (!bk || plate(url.searchParams.get("plate")) !== bk.plate) throw new HttpError(404, "No booking matches that code and plate.");
      return { code: bk.code, parkingId: bk.garage_id, name: bk.garage_name, area: bk.garage_area, plate: bk.plate, start: bk.start_at, hours: bk.hours, total: bk.total, status: bk.status };
    },

    "POST /api/bookings/:code/cancel": async (req, p) => {
      limit("cancel:" + ip(req), 10, 60000);
      const b = await readJson(req);
      const code = str(p.code, 20).toUpperCase();
      const free = tx(db, () => {
        const bk = q.booking.get(code);
        if (!bk || plate(b.plate) !== bk.plate) throw new HttpError(404, "No booking matches that code and plate.");
        if (bk.status !== "active") throw new HttpError(409, "This booking is already cancelled.");
        q.cancelBooking.run(code);
        const g = q.garage.get(bk.garage_id);
        const f = Math.min(g.total, g.free + 1);
        q.setFree.run(f, new Date().toISOString(), g.id);
        return { id: g.id, free: f };
      });
      broadcast("availability", free);
      return { code, status: "cancelled" };
    },

    "POST /api/demo-requests": async (req) => {
      limit("lead:" + ip(req), 5, 60000);
      const b = await readJson(req);
      if (str(b.website, 100)) return created({ ok: true }); // honeypot: bots fill the hidden field
      const name = str(b.name, 120), em = email(b.email, true);
      const errors = {};
      if (!name) errors.name = "Add your name.";
      if (!em) errors.email = "Add a valid email so we can reach you.";
      if (Object.keys(errors).length) throw new HttpError(422, "Add your name and a valid email so we can reach you.", errors);
      const bays = Number.isFinite(Number(b.bays)) && Number(b.bays) > 0 ? Math.min(100000, Math.round(Number(b.bays))) : null;
      const lead = { name, company: str(b.company, 160), email: em, phone: str(b.phone, 40), bays, plan: ["Starter", "Pro", "Enterprise", "Not sure yet"].includes(b.plan) ? b.plan : "", message: str(b.message, 2000) };
      q.insLead.run(lead.name, lead.company, lead.email, lead.phone, lead.bays, lead.plan, lead.message, new Date().toISOString());
      notify(lead);
      return created({ ok: true });
    },

    // Garages running Parkareto push live counts here.
    "PUT /api/operator/garages/:id": async (req, p) => {
      if (!cfg.operatorKey) throw new HttpError(503, "Operator API is disabled. Set OPERATOR_KEY to enable it.");
      if (!sameSecret(bearer(req), cfg.operatorKey)) throw new HttpError(401, "Wrong or missing operator key.");
      const b = await readJson(req);
      const g = q.garage.get(Number(p.id));
      if (!g) throw new HttpError(404, "No car park with that id.");
      const free = Number(b.free);
      if (!Number.isInteger(free) || free < 0 || free > g.total) throw new HttpError(422, `free must be a whole number from 0 to ${g.total}.`);
      setFree(g.id, free);
      return { id: g.id, free };
    },

    // ---------- Admin ----------
    "GET /api/admin/summary": (req) => { requireAdmin(req); return q.summary.get(); },
    "GET /api/admin/demo-requests": (req) => { requireAdmin(req); return q.leads.all(); },
    "PATCH /api/admin/demo-requests/:id": async (req, p) => {
      requireAdmin(req);
      const b = await readJson(req);
      if (!["new", "contacted", "won", "lost"].includes(b.status)) throw new HttpError(422, "status must be new, contacted, won or lost.");
      if (q.setLead.run(b.status, Number(p.id)).changes === 0) throw new HttpError(404, "No request with that id.");
      return { id: Number(p.id), status: b.status };
    },
    "GET /api/admin/bookings": (req) => { requireAdmin(req); return q.bookings.all(); },
    "POST /api/admin/bookings/:code/cancel": (req, p) => {
      requireAdmin(req);
      const code = str(p.code, 20).toUpperCase();
      const out = tx(db, () => {
        const bk = q.booking.get(code);
        if (!bk) throw new HttpError(404, "No booking with that code.");
        if (bk.status !== "active") throw new HttpError(409, "This booking is already cancelled.");
        q.cancelBooking.run(code);
        const g = q.garage.get(bk.garage_id);
        const f = Math.min(g.total, g.free + 1);
        q.setFree.run(f, new Date().toISOString(), g.id);
        return { id: g.id, free: f };
      });
      broadcast("availability", out);
      return { code, status: "cancelled" };
    },
    "PATCH /api/admin/garages/:id": async (req, p) => {
      requireAdmin(req);
      const b = await readJson(req);
      const g = q.garage.get(Number(p.id));
      if (!g) throw new HttpError(404, "No car park with that id.");
      const next = { total: g.total, free: g.free, price_hour: g.price_hour, price_day: g.price_day };
      for (const k of Object.keys(next)) {
        if (b[k] === undefined) continue;
        const v = Number(b[k]);
        if (!Number.isFinite(v) || v < 0) throw new HttpError(422, `${k} must be a positive number.`);
        next[k] = k.startsWith("price") ? Math.round(v * 100) / 100 : Math.round(v);
      }
      if (next.total < 1) throw new HttpError(422, "total must be at least 1.");
      next.free = Math.min(next.free, next.total);
      db.prepare("UPDATE garages SET total = ?, free = ?, price_hour = ?, price_day = ?, updated_at = ? WHERE id = ?")
        .run(next.total, next.free, next.price_hour, next.price_day, new Date().toISOString(), g.id);
      broadcast("availability", { id: g.id, free: next.free });
      return publicGarage(q.garage.get(g.id));
    },
  };
  // Compile "METHOD /path/:param" keys into matchers.
  const routes = Object.entries(api).map(([key, fn]) => {
    const [method, pattern] = key.split(" ");
    const names = [];
    const re = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, n) => { names.push(n); return "([^/]+)"; }) + "$");
    return { method, re, names, fn };
  });

  function csv(rows) {
    if (!rows.length) return "";
    const cols = Object.keys(rows[0]);
    const cell = (v) => { const s = v == null ? "" : String(v); return /[",\n]|^[=+\-@]/.test(s) ? '"' + s.replace(/"/g, '""').replace(/^([=+\-@])/, "'$1") + '"' : s; };
    return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n") + "\n";
  }

  // ---------- Request handler ----------
  async function handle(req, res) {
    const t0 = Date.now();
    const url = new URL(req.url, "http://x");
    const p = decodeURIComponent(url.pathname);
    res.on("finish", () => { if (cfg.log) console.log(`${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - t0}ms`); });
    try {
      if (p.startsWith("/api/")) {
        security(res);
        if (p === "/api/stream" && req.method === "GET") {
          res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" });
          res.write(`retry: 5000\nevent: snapshot\ndata: ${JSON.stringify(q.garages.all().map((g) => ({ id: g.id, free: g.free })))}\n\n`);
          clients.add(res);
          req.on("close", () => clients.delete(res));
          return;
        }
        if (p === "/api/admin/demo-requests.csv" && req.method === "GET") {
          requireAdmin(req);
          return send(req, res, 200, csv(q.leads.all()), "text/csv; charset=utf-8", { "Cache-Control": "no-store", "Content-Disposition": 'attachment; filename="parkareto-demo-requests.csv"' });
        }
        if (!["GET", "HEAD"].includes(req.method)) limit("api:" + ip(req), 60, 60000);
        else limit("read:" + ip(req), 300, 60000);
        for (const r of routes) {
          const m = p.match(r.re);
          if (!m || r.method !== req.method) continue;
          const params = Object.fromEntries(r.names.map((n, i) => [n, m[i + 1]]));
          const out = await r.fn(req, params, url);
          return out && out[CREATED] ? json(req, res, 201, out.body) : json(req, res, 200, out);
        }
        const exists = routes.some((r) => r.re.test(p));
        throw new HttpError(exists ? 405 : 404, exists ? "Method not allowed." : "No such API endpoint.");
      }

      if (!["GET", "HEAD"].includes(req.method)) throw new HttpError(405, "Method not allowed.");
      // Canonical URLs
      if (p === "/index.html") { res.writeHead(301, { Location: "/" }); return res.end(); }
      if (p === "/marketplace.html") { res.writeHead(301, { Location: "/marketplace" + url.search }); return res.end(); }
      if (p.length > 1 && p.endsWith("/")) { res.writeHead(301, { Location: p.slice(0, -1) + url.search }); return res.end(); }

      if (p === "/") return serveFile(req, res, "index.html") || notFound(req, res);
      if (p === "/marketplace") return serveFile(req, res, "marketplace.html") || notFound(req, res);
      if (p === "/admin") return serveFile(req, res, "admin.html") || notFound(req, res);
      if (p === "/robots.txt") return send(req, res, 200, ssr.robots(cfg.site), TYPES[".txt"], { "Cache-Control": "public, max-age=3600" });
      if (p === "/sitemap.xml") return send(req, res, 200, ssr.sitemap(cfg.site, q.garages.all()), TYPES[".xml"], { "Cache-Control": "public, max-age=3600" });
      if (p === "/parking") return page(req, res, ssr.hubPage(cfg.site, q.garages.all()));
      const gm = p.match(/^\/parking\/([a-z0-9-]+)$/);
      if (gm) {
        const g = q.garageBySlug.get(gm[1]);
        if (g) return page(req, res, ssr.garagePage(cfg.site, g, q.garages.all()));
        return notFound(req, res);
      }
      if (p.endsWith(".html")) return notFound(req, res); // pages only through their clean URLs
      if (!serveFile(req, res, p.slice(1))) notFound(req, res);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      if (res.headersSent) return res.end();
      json(req, res, status, { error: status === 500 ? "Something went wrong on our side." : e.message, ...(e.fields ? { fields: e.fields } : {}) });
    }
  }

  const server = http.createServer(handle);
  server.keepAliveTimeout = 65000;
  function close() {
    clearInterval(heartbeat); clearInterval(sweep); if (sim) clearInterval(sim);
    for (const res of clients) res.end();
    clients.clear();
    return new Promise((r) => server.close(() => { db.close(); r(); }));
  }
  return { server, db, close, cfg };
}

if (require.main === module) {
  const cfg = config();
  const app = createApp(cfg);
  app.server.listen(cfg.port, cfg.host, () => {
    console.log(`Parkareto running at ${cfg.site} (port ${cfg.port})`);
    if (!cfg.adminToken) console.log("Admin dashboard disabled: set ADMIN_TOKEN to enable /admin.");
    if (cfg.simulate) console.log("Demo mode: availability is simulated. Set SIMULATE=0 to turn it off.");
  });
  const stop = () => app.close().then(() => process.exit(0));
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

module.exports = { createApp, config };
