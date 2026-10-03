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
