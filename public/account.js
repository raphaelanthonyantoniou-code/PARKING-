/* Parkareto account page: profile, vehicles, password, two-step sign-in, devices, bookings, deletion. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const euro = (n) => "€" + Number(n).toFixed(2);
  const when = (iso) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const EYE = '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  let user = null;

  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 3000);
  }
  function errors(form, res) {
    $$(".am-err", form).forEach((e) => (e.textContent = ""));
    $$(".am-field", form).forEach((e) => e.classList.remove("bad"));
    let shown = false;
    for (const [k, v] of Object.entries((res.data && res.data.fields) || {})) {
      const box = $(`[data-field="${k}"]`, form);
      if (box && typeof v === "string") { box.classList.add("bad"); $(".am-err", box).textContent = v; shown = true; }
    }
    const a = $(".am-alert", form);
    if (a) a.textContent = shown ? "" : res.data.error || "Something went wrong.";
    else if (!shown) toast(res.data.error || "Something went wrong.");
  }
  function busy(form, on) { const b = $("button[type=submit]", form); b.disabled = on; b.classList.toggle("loading", on); }
  const clearForm = (f) => { f.reset(); $$(".am-err", f).forEach((e) => (e.textContent = "")); const a = $(".am-alert", f); if (a) a.textContent = ""; };

  // ---------- Rendering ----------
  function renderUser() {
    $("#aName").textContent = user.name;
    $("#aEmail").textContent = user.email;
    $("#aAvatar").textContent = user.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
    $("#pName").value = user.name;
    $("#pEmail").value = user.email;
    $("#plates").innerHTML = user.plates.length
      ? user.plates.map((p) => `<li><span class="plate-badge"><i>GR</i>${esc(p)}</span><button type="button" class="link-danger" data-del="${esc(p)}" aria-label="Remove ${esc(p)}">Remove</button></li>`).join("")
      : `<li class="muted">No vehicles yet. Add one, or it's saved automatically on your first booking.</li>`;
    $("#fPlate").hidden = user.plates.length >= 5;

    const app = user.twoFactor === "app";
    $("#tfText").innerHTML = app
      ? `Each sign-in asks for a code from your <b>authenticator app</b>. Recovery codes left: <b>${user.recoveryCodesLeft}</b>${user.recoveryCodesLeft <= 3 ? ' <span class="warn">— create new ones soon</span>' : ""}.`
      : "Each sign-in asks for a code we <b>email</b> you. An authenticator app is stronger: it works without email and can't be intercepted.";
    $("#tfActions").innerHTML = app
      ? `<button class="am-btn small ghost" type="button" id="tfMove">Move to a new phone</button><button class="am-btn small ghost" type="button" data-toggle="fRegen">New recovery codes</button><button class="am-btn small ghost" type="button" data-toggle="fDisable">Remove app</button>`
      : `<button class="am-btn small" type="button" id="tfSetup">Set up authenticator app</button>`;
    const move = $("#tfMove");
    if (move) move.addEventListener("click", () => PKAuth.setup2fa(async () => { await refresh(); toast("Authenticator moved. The old phone's codes no longer work."); }));
    const setup = $("#tfSetup");
    if (setup) setup.addEventListener("click", () => PKAuth.setup2fa(async () => { await refresh(); toast("Authenticator app turned on"); }));
    wireToggles($("#tfActions"));

    const checks = [
      { ok: true, t: "Email confirmed" },
      { ok: true, t: "Two-step sign-in on" },
      { ok: app, t: "Authenticator app" },
      { ok: !app || user.recoveryCodesLeft > 3, t: "Recovery codes saved" },
    ];
    const score = checks.filter((c) => c.ok).length;
    $("#aScore").innerHTML = `<div class="score-ring" style="--p:${score / checks.length}"><b>${score}/${checks.length}</b></div><div><b>${score === checks.length ? "Strong protection" : "Good protection"}</b><ul>${checks.map((c) => `<li class="${c.ok ? "ok" : ""}">${c.t}</li>`).join("")}</ul></div>`;
  }

  async function renderDevices() {
    const r = await PKAuth.api("GET", "/api/account/sessions");
    if (!r.ok) return;
    const ua = (s) => {
      const b = /Edg\//.test(s) ? "Edge" : /Chrome\//.test(s) ? "Chrome" : /Firefox\//.test(s) ? "Firefox" : /Safari\//.test(s) ? "Safari" : "Browser";
      const os = /iPhone|iPad/.test(s) ? "iOS" : /Android/.test(s) ? "Android" : /Mac OS X/.test(s) ? "macOS" : /Windows/.test(s) ? "Windows" : /Linux/.test(s) ? "Linux" : "";
      return `${b}${os ? " on " + os : ""}`;
    };
    $("#deviceList").innerHTML = r.data.map((s) => `<li><div class="dev-ic">${/iPhone|iPad|Android/.test(s.userAgent || "") ? '<svg viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/></svg>' : '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>'}</div>
      <div><b>${esc(ua(s.userAgent || ""))}</b>${s.current ? ' <span class="pill-on">This device</span>' : ""}<small>Signed in ${when(s.createdAt)} · last active ${when(s.lastSeen)}${s.ip ? " · " + esc(s.ip) : ""}</small></div>
      ${s.current ? "" : `<button type="button" class="link-danger" data-revoke="${esc(s.id)}">Sign out</button>`}</li>`).join("");
    $("#revokeOthers").hidden = r.data.length < 2;
  }

  async function renderBookings() {
    const r = await PKAuth.api("GET", "/api/account/bookings");
    const list = r.ok ? r.data : [];
    const now = Date.now();
    $("#bookList").innerHTML = list.length ? list.map((b) => {
      const start = new Date(b.start), end = new Date(start.getTime() + b.hours * 3600000);
      const past = end < now, cancelled = b.status === "cancelled";
      const canCancel = !past && !cancelled && start - now > 30 * 60000;
      const tag = cancelled ? ["cancelled", "Cancelled"] : past ? ["past", "Completed"] : start <= now ? ["live", "Now"] : ["up", "Upcoming"];
      return `<div class="bk ${cancelled || past ? "dim" : ""}"><div><b>${esc(b.name)}</b> <span class="bk-tag ${tag[0]}">${tag[1]}</span><small>${esc(b.area)} · ${esc(b.plate)} · <span class="code">${esc(b.code)}</span></small><small>${when(b.start)} → ${when(end.toISOString())}</small></div>
        <div class="bk-r"><strong>${euro(b.total)}</strong>${canCancel ? `<button type="button" class="link-danger" data-cancel="${esc(b.code)}">Cancel</button>` : ""}</div></div>`;
    }).join("") : `<p class="muted">No bookings yet.</p>`;
  }

  async function refresh() {
    user = await PKAuth.refresh();
    if (!user) return gate();
    renderUser();
  }

  // ---------- Forms ----------
  function wireToggles(root = document) {
    $$("[data-toggle]", root).forEach((b) => b.addEventListener("click", () => {
      const f = document.getElementById(b.dataset.toggle);
      f.hidden = !f.hidden;
      if (!f.hidden) { clearForm(f); const i = $("input", f); if (i) i.focus(); }
    }));
  }
  function wireEyes() {
    $$(".am-eye").forEach((b) => {
      b.innerHTML = EYE;
      b.addEventListener("click", () => {
        const i = b.previousElementSibling, show = i.type === "password";
        i.type = show ? "text" : "password"; b.setAttribute("aria-pressed", show);
      });
    });
  }
  function wireMeter() {
    const input = $("#pwNew"), meter = $("#fPassword .am-meter"), list = $("#fPassword .am-rules");
    const labels = ["Too weak", "Weak", "Fair", "Strong", "Very strong"];
    const upd = () => {
      const r = PKAuth.passwordCheck(input.value, user && user.email, user && user.name);
      meter.dataset.score = input.value ? r.score : "";
      $(".am-meter-label", meter).textContent = input.value ? labels[r.score] : "";
      list.innerHTML = r.rules.map((x) => `<li class="${x.ok ? "ok" : ""}"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>${x.text}</li>`).join("");
    };
    input.addEventListener("input", upd); upd();
  }

  function wire() {
    wireToggles(); wireEyes(); wireMeter();
    $("#fProfile").addEventListener("submit", async (e) => {
      e.preventDefault(); const f = e.target; busy(f, true);
      const r = await PKAuth.api("PATCH", "/api/account", { name: f.name.value });
      busy(f, false);
      if (!r.ok) return errors(f, r);
      user = r.data.user; renderUser(); await PKAuth.refresh(); toast("Profile saved");
    });
    $("#fPlate").addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = $("#newPlate").value.trim();
      if (!v) return;
      const r = await PKAuth.api("PATCH", "/api/account", { plates: [...user.plates, v] });
      if (!r.ok) return toast(r.data.error);
      $("#newPlate").value = ""; user = r.data.user; renderUser(); toast("Vehicle added");
    });
    $("#plates").addEventListener("click", async (e) => {
      const p = e.target.dataset.del; if (!p) return;
      const r = await PKAuth.api("PATCH", "/api/account", { plates: user.plates.filter((x) => x !== p) });
      if (!r.ok) return toast(r.data.error);
      user = r.data.user; renderUser(); toast(`${p} removed`);
    });
    $("#fPassword").addEventListener("submit", async (e) => {
      e.preventDefault(); const f = e.target; busy(f, true);
      const r = await PKAuth.api("POST", "/api/account/password", { current: f.current.value, next: f.next.value });
      busy(f, false);
      if (!r.ok) return errors(f, r);
      clearForm(f); f.hidden = true; toast("Password changed. Other devices were signed out."); renderDevices();
    });
    $("#fDisable").addEventListener("submit", async (e) => {
      e.preventDefault(); const f = e.target; busy(f, true);
      const r = await PKAuth.api("POST", "/api/account/2fa/disable", { password: f.password.value, code: f.code.value });
      busy(f, false);
      if (!r.ok) return errors(f, r);
      clearForm(f); f.hidden = true; await refresh(); toast("Authenticator app removed. Sign-in now uses emailed codes.");
    });
    $("#fRegen").addEventListener("submit", async (e) => {
      e.preventDefault(); const f = e.target; busy(f, true);
      const r = await PKAuth.api("POST", "/api/account/2fa/recovery-codes", { password: f.password.value });
      busy(f, false);
      if (!r.ok) return errors(f, r);
      clearForm(f); f.hidden = true;
      PKAuth.stepRecovery(r.data.recoveryCodes, "New recovery codes");
      refresh();
    });
    $("#deviceList").addEventListener("click", async (e) => {
      const id = e.target.dataset.revoke; if (!id) return;
      const r = await PKAuth.api("DELETE", "/api/account/sessions/" + encodeURIComponent(id));
      toast(r.ok ? "Device signed out" : r.data.error); renderDevices();
    });
    $("#revokeOthers").addEventListener("click", async () => {
      const r = await PKAuth.api("POST", "/api/account/sessions/revoke-others", {});
      toast(r.ok ? "Other devices signed out" : r.data.error); renderDevices();
    });
    $("#bookList").addEventListener("click", async (e) => {
      const code = e.target.dataset.cancel; if (!code) return;
      e.target.disabled = true;
      if (PKAuth.mode === "server") {
        const r = await PKAuth.api("POST", `/api/account/bookings/${encodeURIComponent(code)}/cancel`, {});
        if (!r.ok) { e.target.disabled = false; return toast(r.data.error); }
      } else {
        try { const k = "parkareto.marketplace.bookings"; localStorage.setItem(k, JSON.stringify((JSON.parse(localStorage.getItem(k)) || []).filter((b) => b.code !== code))); } catch (_) {}
      }
      toast(`Booking ${code} cancelled`); renderBookings();
    });
    $("#fDelete").addEventListener("submit", async (e) => {
      e.preventDefault(); const f = e.target; busy(f, true);
      const r = await PKAuth.api("DELETE", "/api/account", { password: f.password.value, confirm: f.confirm.value.trim() });
      busy(f, false);
      if (!r.ok) return errors(f, r);
      await PKAuth.refresh();
      document.body.innerHTML = `<main class="container acct-bye"><img src="assets/logo.svg" alt="" width="120" height="72"><h1>Your account has been deleted</h1><p>Thanks for parking with Parkareto.</p><a class="am-btn small" href="${home()}">Back to Parkareto</a></main>`;
    });
  }

  const home = () => (PKAuth.mode === "server" ? "/marketplace" : "marketplace.html");
  function gate() {
    $("#acct").hidden = true;
    $("#acctWait").hidden = true;
    PKAuth.open({ reason: "Sign in to manage your account.", then: start, onClose: () => (location.href = home()) });
  }
  async function start() {
    user = PKAuth.user;
    $("#acctWait").hidden = true;
    $("#acct").hidden = false;
    renderUser();
    renderDevices();
    renderBookings();
    if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
  }

  PKAuth.ready().then(() => {
    $$("[data-home]").forEach((a) => (a.href = home()));
    wire();
    PKAuth.onChange((u) => { if (!u) location.href = home(); });
    PKAuth.user ? start() : gate();
  });
})();
