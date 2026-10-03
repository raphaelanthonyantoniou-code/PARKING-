"use strict";
// Password hashing, TOTP (RFC 6238), secret encryption and token helpers. Node crypto only.
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const scrypt = promisify(crypto.scrypt);

// ---------- Passwords (scrypt) ----------
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 });
  return ["s1", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), key.toString("base64")].join("$");
}
async function verifyPassword(password, stored) {
  const [v, N, r, p, salt, hash] = String(stored).split("$");
  if (v !== "s1") return false;
  const want = Buffer.from(hash, "base64");
  const got = await scrypt(password.normalize("NFKC"), Buffer.from(salt, "base64"), want.length, { N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  return crypto.timingSafeEqual(want, got);
}
// Used for unknown emails so a failed login takes as long as a real one.
const DUMMY_HASH = "s1$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(64).toString("base64");

const COMMON = new Set(("123456 123456789 12345678 password qwerty123 qwerty 1234567890 1234567 password1 12345 iloveyou 111111 123123 abc123 " +
  "qwertyuiop 000000 1q2w3e4r 654321 superman 1qaz2wsx 7777777 121212 123qwe password123 qwerty12345 football monkey letmein dragon " +
  "baseball sunshine princess welcome shadow master michael 666666 trustno1 passw0rd zaq12wsx 987654321 aa123456 1234qwer asdfghjkl " +
  "asdf1234 q1w2e3r4t5 admin123 administrator changeme parkareto parking123 athens2024 hellas olympiakos panathinaikos").split(" "));
function passwordProblem(pw, email, name) {
  if (typeof pw !== "string" || pw.length < 10) return "Use at least 10 characters.";
  if (pw.length > 200) return "Use 200 characters or fewer.";
  const low = pw.toLowerCase();
  if (COMMON.has(low) || COMMON.has(low.replace(/[^a-z0-9]/g, ""))) return "That password is too common. Choose something harder to guess.";
  if (/^(.)\1+$/.test(pw)) return "Don't repeat a single character.";
  const local = String(email || "").split("@")[0].toLowerCase();
  if (local.length >= 4 && low.includes(local)) return "Don't include your email address in the password.";
  const first = String(name || "").trim().split(/\s+/)[0].toLowerCase();
  if (first.length >= 4 && low.includes(first)) return "Don't include your name in the password.";
  const kinds = [/[a-zα-ω]/, /[A-ZΑ-Ω]/, /\d/, /[^\w\s]/].filter((r) => r.test(pw)).length;
  if (pw.length < 14 && kinds < 3) return "Mix upper and lower case letters, numbers or symbols, or use 14+ characters.";
  return null;
}

// ---------- TOTP ----------
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Encode(buf) {
  let bits = 0, value = 0, out = "";
  for (const b of buf) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0; const out = [];
  for (const c of clean) { value = (value << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
function hotp(key, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac("sha1", key).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1e6).padStart(6, "0");
}
const newTotpSecret = () => base32Encode(crypto.randomBytes(20));
// Returns the matched time step (for replay protection) or -1.
function verifyTotp(secretB32, code, lastStep = 0, now = Date.now()) {
  if (!/^\d{6}$/.test(String(code))) return -1;
  const key = base32Decode(secretB32);
  const step = Math.floor(now / 30000);
  for (const d of [0, -1, 1]) {
    const s = step + d;
    if (s <= lastStep) continue;
    const want = Buffer.from(hotp(key, s)), got = Buffer.from(String(code));
    if (crypto.timingSafeEqual(want, got)) return s;
  }
  return -1;
}
const totpNow = (secretB32, now = Date.now()) => hotp(base32Decode(secretB32), Math.floor(now / 30000));
const otpauthUrl = (secret, email) => `otpauth://totp/${encodeURIComponent("Parkareto:" + email)}?secret=${secret}&issuer=Parkareto&algorithm=SHA1&digits=6&period=30`;

// ---------- Encryption at rest (AES-256-GCM) ----------
function makeCipher(appSecret) {
  const key = crypto.createHash("sha256").update("parkareto-secrets:" + appSecret).digest();
  return {
    encrypt(text) {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv("aes-256-gcm", key, iv);
      const data = Buffer.concat([c.update(text, "utf8"), c.final()]);
      return ["g1", iv.toString("base64"), c.getAuthTag().toString("base64"), data.toString("base64")].join(".");
    },
    decrypt(blob) {
      const [v, iv, tag, data] = String(blob).split(".");
      if (v !== "g1") throw new Error("Unknown secret format");
      const d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
      d.setAuthTag(Buffer.from(tag, "base64"));
      return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
    },
  };
}

// ---------- Tokens and codes ----------
const token = () => crypto.randomBytes(32).toString("base64url");
const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const sixDigits = () => String(crypto.randomInt(0, 1e6)).padStart(6, "0");
const sameHash = (a, b) => typeof a === "string" && typeof b === "string" && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
function recoveryCodes(n = 10) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: n }, () => {
    const raw = Array.from(crypto.randomBytes(10), (b) => alphabet[b % alphabet.length]).join("");
    return raw.slice(0, 5) + "-" + raw.slice(5);
  });
}
const normRecovery = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

module.exports = {
  hashPassword, verifyPassword, DUMMY_HASH, passwordProblem,
  newTotpSecret, verifyTotp, totpNow, otpauthUrl, base32Encode, base32Decode,
  makeCipher, token, sha256, sixDigits, sameHash, recoveryCodes, normRecovery,
};
