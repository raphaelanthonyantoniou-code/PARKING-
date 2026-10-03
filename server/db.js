"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { DatabaseSync } = require("node:sqlite");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS garages (
  id          INTEGER PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  area        TEXT NOT NULL,
  lat         REAL NOT NULL,
  lng         REAL NOT NULL,
  price_hour  REAL NOT NULL,
  price_day   REAL NOT NULL,
  total       INTEGER NOT NULL,
  free        INTEGER NOT NULL,
  features    TEXT NOT NULL DEFAULT '[]',
  updated_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bookings (
  code        TEXT PRIMARY KEY,
  garage_id   INTEGER NOT NULL REFERENCES garages(id),
  plate       TEXT NOT NULL,
  email       TEXT,
  start_at    TEXT NOT NULL,
  hours       INTEGER NOT NULL,
  total       REAL NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS bookings_garage ON bookings(garage_id, status);
CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  email          TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  password_hash  TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  totp_secret    TEXT,            -- AES-256-GCM encrypted
  totp_pending   TEXT,            -- secret being set up, not active yet
  totp_last_step INTEGER NOT NULL DEFAULT 0,
  plates         TEXT NOT NULL DEFAULT '[]',
  created_at     TEXT NOT NULL,
  password_changed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,   -- sha256 of the cookie token
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  last_seen   TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  ip          TEXT,
  user_agent  TEXT
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS auth_challenges (
  id          TEXT PRIMARY KEY,   -- sha256 of the challenge token
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  purpose     TEXT NOT NULL,      -- verify | login | reset
  method      TEXT NOT NULL,      -- email | totp
  code_hash   TEXT,
  attempts    INTEGER NOT NULL DEFAULT 0,
  remember    INTEGER NOT NULL DEFAULT 0,
  sent_at     TEXT,
  expires_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS recovery_codes (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,
  used_at     TEXT
);
CREATE INDEX IF NOT EXISTS recovery_user ON recovery_codes(user_id);
CREATE TABLE IF NOT EXISTS demo_requests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  company     TEXT,
  email       TEXT NOT NULL,
  phone       TEXT,
  bays        INTEGER,
  plan        TEXT,
  message     TEXT,
  status      TEXT NOT NULL DEFAULT 'new',
  created_at  TEXT NOT NULL
);
`;

const slugify = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// The browser's public/data.js is the single source of seed data.
function loadSeed(file) {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), ctx, { timeout: 1000 });
  return ctx.window.PARKINGS || [];
}

function open(dbFile, seedFile) {
  if (dbFile !== ":memory:") fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = new DatabaseSync(dbFile);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;");
  db.exec(SCHEMA);
  // Migrations for databases created before accounts existed
  const cols = db.prepare("PRAGMA table_info(bookings)").all().map((c) => c.name);
  if (!cols.includes("user_id")) db.exec("ALTER TABLE bookings ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL");
  db.exec("CREATE INDEX IF NOT EXISTS bookings_user ON bookings(user_id, created_at)");
  const count = db.prepare("SELECT COUNT(*) AS n FROM garages").get().n;
  if (count === 0 && seedFile) {
    const ins = db.prepare(`INSERT INTO garages (id, slug, name, area, lat, lng, price_hour, price_day, total, free, features, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const now = new Date().toISOString();
    db.exec("BEGIN");
    for (const p of loadSeed(seedFile)) {
      ins.run(p.id, slugify(p.name), p.name, p.area, p.lat, p.lng, p.price, p.daily, p.total, p.free, JSON.stringify(p.features || []), now);
    }
    db.exec("COMMIT");
  }
  return db;
}

// Run fn inside a transaction; roll back on any throw.
function tx(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

module.exports = { open, tx, slugify };
