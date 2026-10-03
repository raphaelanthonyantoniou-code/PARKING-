(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const euro = (n) => "€" + Number(n).toFixed(2);
  const when = (iso) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  let token = "";
  try { token = sessionStorage.getItem("pk-admin") || ""; } catch (_) {}
  let data = { leads: [], bookings: [], garages: [] };

  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2600);
  }
  async function api(path, opts = {}) {
    const res = await fetch(path, { ...opts, headers: { Authorization: "Bearer " + token, ...(opts.body ? { "Content-Type": "application/json" } : {}) } });
    if (res.status === 401) { signOut(); throw new Error("Your session ended. Sign in again."); }
    const body = res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text();
    if (!res.ok) throw new Error(body.error || "Request failed.");
    return body;
  }

  function signOut() {
    token = ""; try { sessionStorage.removeItem("pk-admin"); } catch (_) {}
    $("#app").hidden = true; $("#login").hidden = false; $("#logout").hidden = true;
  }
  $("#logout").addEventListener("click", signOut);
  $("#login").addEventListener("submit", async (e) => {
    e.preventDefault();
    token = $("#token").value.trim();
    try { await load(); try { sessionStorage.setItem("pk-admin", token); } catch (_) {} }
    catch (err) { $("#loginMsg").textContent = err.message === "Your session ended. Sign in again." ? "That token is not right." : err.message; }
  });

  async function load() {
    const [summary, leads, bookings, garages] = await Promise.all([api("/api/admin/summary"), api("/api/admin/demo-requests"), api("/api/admin/bookings"), api("/api/parkings")]);
    data = { leads, bookings, garages };
    $("#login").hidden = true; $("#app").hidden = false; $("#logout").hidden = false; $("#loginMsg").textContent = "";
    $("#kpis").innerHTML = [
      ["New demo requests", summary.new_leads], ["Requests, last 7 days", summary.leads_7d],
      ["Active bookings", summary.active_bookings], ["Booked revenue", euro(summary.booked_revenue)],
      ["Free spaces now", `${summary.free_spaces} / ${summary.total_spaces}`],
      ["Driver accounts", `${summary.users} (${summary.users_app_2fa} with app 2FA)`],
    ].map(([k, v]) => `<div class="kpi"><small>${k}</small><b>${esc(v)}</b></div>`).join("");
    renderLeads(); renderBookings(); renderGarages();
  }

  function renderLeads() {
    const q = $("#leadSearch").value.toLowerCase();
    const rows = data.leads.filter((l) => !q || [l.name, l.company, l.email].join(" ").toLowerCase().includes(q));
    $("#leads").innerHTML = rows.length ? rows.map((l) => `<tr>
      <td>${when(l.created_at)}</td><td><b>${esc(l.name)}</b></td><td>${esc(l.company)}</td>
      <td><a href="mailto:${esc(l.email)}">${esc(l.email)}</a><small>${esc(l.phone)}</small></td>
      <td class="num">${esc(l.bays)}</td><td>${esc(l.plan)}</td><td class="msg-cell">${esc(l.message)}</td>
      <td><select data-lead="${l.id}" aria-label="Status for ${esc(l.name)}">${["new", "contacted", "won", "lost"].map((s) => `<option${s === l.status ? " selected" : ""}>${s}</option>`).join("")}</select></td></tr>`).join("")
      : `<tr><td colspan="8" class="empty">No demo requests yet. They appear here as soon as someone sends the form on the landing page.</td></tr>`;
  }
  function renderBookings() {
    const q = $("#bookSearch").value.toLowerCase();
    const rows = data.bookings.filter((b) => !q || [b.code, b.plate, b.garage_name].join(" ").toLowerCase().includes(q));
    $("#bookings").innerHTML = rows.length ? rows.map((b) => `<tr>
      <td class="mono">${esc(b.code)}</td><td>${esc(b.garage_name)}</td><td class="mono">${esc(b.plate)}</td>
      <td>${when(b.start_at)}</td><td class="num">${b.hours}</td><td class="num">${euro(b.total)}</td>
      <td><span class="st ${esc(b.status)}">${esc(b.status)}</span></td>
      <td>${b.status === "active" ? `<button class="ghost" data-cancel="${esc(b.code)}">Cancel</button>` : ""}</td></tr>`).join("")
      : `<tr><td colspan="8" class="empty">No bookings yet.</td></tr>`;
  }
  function renderGarages() {
    $("#garages").innerHTML = data.garages.map((g) => `<tr data-g="${g.id}">
      <td><b>${esc(g.name)}</b></td><td>${esc(g.area)}</td>
      <td><input type="number" min="0" data-f="free" value="${g.free}" aria-label="Free spaces at ${esc(g.name)}"></td>
      <td><input type="number" min="1" data-f="total" value="${g.total}" aria-label="Total spaces at ${esc(g.name)}"></td>
      <td><input type="number" min="0" step="0.5" data-f="price_hour" value="${g.price}" aria-label="Hourly price at ${esc(g.name)}"></td>
      <td><input type="number" min="0" step="0.5" data-f="price_day" value="${g.daily}" aria-label="Daily price at ${esc(g.name)}"></td>
      <td><a href="/parking/${esc(g.slug)}" target="_blank" rel="noopener">View</a></td></tr>`).join("");
  }

  $("#leadSearch").addEventListener("input", renderLeads);
  $("#bookSearch").addEventListener("input", renderBookings);
  $("#leads").addEventListener("change", async (e) => {
    const id = e.target.dataset.lead; if (!id) return;
    try { await api(`/api/admin/demo-requests/${id}`, { method: "PATCH", body: JSON.stringify({ status: e.target.value }) }); data.leads.find((l) => l.id == id).status = e.target.value; e.target.closest("tr").classList.add("saved"); toast("Status saved"); }
    catch (err) { toast(err.message); }
  });
  $("#bookings").addEventListener("click", async (e) => {
    const code = e.target.dataset.cancel; if (!code) return;
    try { await api(`/api/admin/bookings/${code}/cancel`, { method: "POST" }); toast(`Booking ${code} cancelled`); await load(); }
    catch (err) { toast(err.message); }
  });
  async function saveGarage(input) {
    const tr = input.closest("tr");
    try {
      const g = await api(`/api/admin/garages/${tr.dataset.g}`, { method: "PATCH", body: JSON.stringify({ [input.dataset.f]: Number(input.value) }) });
      Object.assign(data.garages.find((x) => x.id === g.id), g);
      tr.classList.remove("saved"); void tr.offsetWidth; tr.classList.add("saved");
      toast(`${g.name} saved`);
    } catch (err) { toast(err.message); }
  }
  $("#garages").addEventListener("change", (e) => { if (e.target.dataset.f) saveGarage(e.target); });
  $("#garages").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.dataset.f) e.target.blur(); });
  $("#csv").addEventListener("click", async () => {
    try {
      const text = await api("/api/admin/demo-requests.csv");
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([text], { type: "text/csv" })), download: "parkareto-demo-requests.csv" });
      a.click(); URL.revokeObjectURL(a.href);
    } catch (err) { toast(err.message); }
  });
  document.querySelector(".tabs").addEventListener("click", (e) => {
    const t = e.target.dataset.tab; if (!t) return;
    document.querySelectorAll(".tabs button").forEach((b) => { b.classList.toggle("on", b.dataset.tab === t); b.setAttribute("aria-selected", b.dataset.tab === t); });
    ["leads", "bookings", "garages"].forEach((x) => ($("#tab-" + x).hidden = x !== t));
  });

  if (token) load().catch(signOut);
})();
