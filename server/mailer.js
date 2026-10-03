"use strict";
// Sends account emails. Uses Resend's HTTP API when RESEND_API_KEY is set; otherwise
// writes the email to the server log (development) and keeps it in an in-memory outbox
// that tests and local development can read when DEV_MAILBOX=1.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function layout(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:#070b14;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#e9eef7">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
  <table role="presentation" width="480" cellspacing="0" cellpadding="0" style="max-width:480px;background:#0f1728;border:1px solid #233049;border-radius:16px">
  <tr><td style="padding:28px 28px 8px;font-size:22px;letter-spacing:4px;color:#c9ced6">PARKARETO</td></tr>
  <tr><td style="padding:8px 28px 28px;font-size:15px;line-height:1.6">
  <h1 style="font-size:20px;margin:0 0 12px;color:#fff">${esc(title)}</h1>${bodyHtml}
  <p style="color:#8d99ad;font-size:13px;margin-top:24px">If you didn't ask for this, you can ignore this email. Your account stays safe.</p>
  </td></tr></table></td></tr></table></body></html>`;
}
const codeBlock = (code) => `<p style="font-size:34px;letter-spacing:10px;font-weight:bold;color:#f6b70b;margin:18px 0;font-family:'Courier New',monospace">${esc(code)}</p>`;

const TEMPLATES = {
  verify: ({ name, code }) => ({
    subject: `${code} is your Parkareto verification code`,
    text: `Hi ${name},\n\nYour code to confirm your email is: ${code}\nIt expires in 10 minutes.\n\nParkareto`,
    html: layout("Confirm your email", `<p>Hi ${esc(name)}, enter this code to finish creating your account:</p>${codeBlock(code)}<p>It expires in 10 minutes.</p>`),
  }),
  login: ({ name, code }) => ({
    subject: `${code} is your Parkareto sign-in code`,
    text: `Hi ${name},\n\nYour sign-in code is: ${code}\nIt expires in 10 minutes. Never share it with anyone.\n\nParkareto`,
    html: layout("Your sign-in code", `<p>Hi ${esc(name)}, use this code to finish signing in:</p>${codeBlock(code)}<p>It expires in 10 minutes. Parkareto will never ask you for this code by phone or chat.</p>`),
  }),
  reset: ({ name, code }) => ({
    subject: `${code} is your Parkareto password reset code`,
    text: `Hi ${name},\n\nYour password reset code is: ${code}\nIt expires in 10 minutes.\n\nParkareto`,
    html: layout("Reset your password", `<p>Hi ${esc(name)}, enter this code to choose a new password:</p>${codeBlock(code)}<p>It expires in 10 minutes. Resetting your password signs you out on every device.</p>`),
  }),
  exists: ({ name }) => ({
    subject: "You already have a Parkareto account",
    text: `Hi ${name},\n\nSomeone tried to create a Parkareto account with this email. You already have one, so sign in instead, or reset your password if you've forgotten it.\n\nParkareto`,
    html: layout("You already have an account", `<p>Hi ${esc(name)}, someone tried to create a Parkareto account with this email address. You already have one: sign in instead, or reset your password if you've forgotten it.</p>`),
  }),
  security: ({ name, what }) => ({
    subject: `Parkareto security alert: ${what}`,
    text: `Hi ${name},\n\n${what}.\nIf this wasn't you, reset your password straight away.\n\nParkareto`,
    html: layout("Security alert", `<p>Hi ${esc(name)}, this change was just made to your account:</p><p style="font-weight:bold;color:#fff">${esc(what)}</p><p>If this wasn't you, reset your password straight away.</p>`),
  }),
};

function createMailer(cfg) {
  const outbox = [];
  async function send(to, template, data) {
    const msg = TEMPLATES[template](data);
    if (cfg.resendKey) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${cfg.resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: cfg.mailFrom, to: [to], subject: msg.subject, text: msg.text, html: msg.html }),
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) console.error(`Email to ${to} failed: ${res.status} ${await res.text()}`);
      } catch (e) {
        console.error(`Email to ${to} failed: ${e.message}`);
      }
      return;
    }
    outbox.push({ to, template, subject: msg.subject, text: msg.text, at: new Date().toISOString(), code: data.code || null });
    if (outbox.length > 200) outbox.shift();
    if (cfg.log) console.log(`[mail] to=${to} subject="${msg.subject}"`);
  }
  return { send, outbox };
}

module.exports = { createMailer };
