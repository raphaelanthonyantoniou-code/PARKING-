"use strict";
class HttpError extends Error {
  constructor(status, message, fields) { super(message); this.status = status; this.fields = fields; }
}

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
// Greek and Latin capitals, digits, space and dash, as printed on plates.
const PLATE = /^[A-ZΑ-Ω0-9][A-ZΑ-Ω0-9 -]{1,11}$/u;

function plate(v) {
  const p = str(v, 12).toUpperCase().replace(/\s+/g, " ");
  return PLATE.test(p) ? p : null;
}
function email(v, required) {
  const e = str(v, 254).toLowerCase();
  if (!e) return required ? null : "";
  return EMAIL.test(e) ? e : null;
}

module.exports = { HttpError, str, plate, email };
