(function () {
  "use strict";

  const parkings = window.PARKINGS;
  const ATHENS = [37.9838, 23.7275];
  const STORE_KEY = "parkareto.marketplace.bookings";
  const FEATURE_LABELS = { covered: "Covered", "24h": "24/7", ev: "EV", accessible: "Accessible", valet: "Valet" };

  const $ = (sel) => document.querySelector(sel);
  const euro = (n) => "€" + n.toFixed(2);
  const state = { query: "", filters: new Set(), sort: "price", activeId: null, userPos: null };
  // Set to true once the Parkareto server answers; otherwise the page runs on data.js alone.
  const API = { online: false };

  // ---------- Pricing ----------
  // Hourly rate, capped at the daily rate for each 24h block.
  function cost(p, hours) {
    const days = Math.floor(hours / 24);
    const rest = hours % 24;
    return days * p.daily + Math.min(rest * p.price, p.daily);
  }

  function level(p) {
    if (p.free === 0) return "full";
    return p.free / p.total < 0.1 ? "low" : "high";
  }

  function distanceKm(a, b) {
    const R = 6371, toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove("show"), 2800);
  }

  // ---------- Storage ----------
  function loadBookings() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; }
  }
  function saveBookings(list) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
    $("#bookingCount").textContent = list.length;
  }

  // ---------- Map ----------
  const map = L.map("map", { scrollWheelZoom: false }).setView(ATHENS, 13);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    subdomains: "abcd",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(map);

  const markers = {};
  function pinIcon(p, ping) {
    return L.divIcon({
      className: "",
      html: `<div class="pin ${level(p)}${ping ? " ping" : ""}"><span>P</span></div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 34],
      popupAnchor: [0, -30],
    });
  }
  function popupHtml(p) {
    return `<div class="popup"><b>${escapeHtml(p.name)}</b>${escapeHtml(p.area)} · ${euro(p.price)}/h<br>
      ${p.free} of ${p.total} spots free<br>
      <button class="btn btn-primary" data-book="${p.id}" ${p.free === 0 ? "disabled" : ""}>${p.free === 0 ? "Full" : "Reserve"}</button></div>`;
  }
  parkings.forEach((p) => {
    markers[p.id] = L.marker([p.lat, p.lng], { icon: pinIcon(p) })
      .addTo(map)
      .bindPopup(popupHtml(p))
      .on("click", () => setActive(p.id, false));
  });

  // ---------- List ----------
  function visible() {
    const q = state.query.trim().toLowerCase();
    let items = parkings.filter((p) => {
      if (q && !(p.name + " " + p.area).toLowerCase().includes(q)) return false;
      for (const f of state.filters) {
        if (f === "available" ? p.free === 0 : !p.features.includes(f)) return false;
      }
      return true;
    });
    const sorters = {
      price: (a, b) => a.price - b.price,
      free: (a, b) => b.free - a.free,
      name: (a, b) => a.name.localeCompare(b.name),
      distance: (a, b) => distanceKm(state.userPos, [a.lat, a.lng]) - distanceKm(state.userPos, [b.lat, b.lng]),
    };
    const sort = state.sort === "distance" && !state.userPos ? "price" : state.sort;
    return items.sort(sorters[sort]);
  }

  function render() {
    const items = visible();
    const ids = new Set(items.map((p) => p.id));
    const list = $("#list");

    list.innerHTML = items.length
      ? items.map((p, i) => {
          const lv = level(p);
          const availText = lv === "full" ? "Full" : `${p.free} free`;
          const dist = state.userPos ? ` · ${distanceKm(state.userPos, [p.lat, p.lng]).toFixed(1)} km` : "";
          const occ = Math.round(((p.total - p.free) / p.total) * 100);
          return `<article class="card ${p.id === state.activeId ? "active" : ""}" data-id="${p.id}" style="--i:${Math.min(i, 12)}">
            <div class="card-top">
              <div><h3>${escapeHtml(p.name)}</h3><div class="area">${escapeHtml(p.area)}${dist}</div></div>
              <div class="price"><strong>${euro(p.price)}</strong><small>/ hour · ${euro(p.daily)}/day</small></div>
            </div>
            <div class="occ" title="${occ}% occupied"><i style="width:${occ}%"></i></div>
            <div class="card-bottom">
              <span class="avail ${lv}">${availText} of ${p.total}</span>
              <div class="tags">${p.features.map((f) => `<span class="tag">${FEATURE_LABELS[f]}</span>`).join("")}</div>
              <button class="btn btn-primary" data-book="${p.id}" ${p.free === 0 ? "disabled" : ""}>${p.free === 0 ? "Full" : "Reserve"}</button>
            </div>
          </article>`;
        }).join("")
      : `<div class="empty">No parking matches your filters.<br>Try another neighbourhood.</div>`;

    parkings.forEach((p) => {
      const m = markers[p.id];
      if (ids.has(p.id)) { if (!map.hasLayer(m)) m.addTo(map); }
      else map.removeLayer(m);
    });

    $("#statGarages").textContent = parkings.length;
    $("#statFree").textContent = parkings.reduce((s, p) => s + p.free, 0).toLocaleString("en");
  }

  function setActive(id, fly) {
    state.activeId = id;
    const p = parkings.find((x) => x.id === id);
    if (fly && p) {
      map.flyTo([p.lat, p.lng], 16, { duration: 0.6 });
      markers[id].openPopup();
    }
    render();
    const el = document.querySelector(`.card[data-id="${id}"]`);
    if (el && !fly) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function fitVisible() {
    const items = visible();
    if (items.length) map.fitBounds(L.latLngBounds(items.map((p) => [p.lat, p.lng])), { padding: [40, 40], maxZoom: 16 });
  }

  // ---------- Booking ----------
  let booking = null;
  function openBooking(id) {
    const p = parkings.find((x) => x.id === id);
    if (!p || p.free === 0) return;
    booking = p;
    const now = new Date(Date.now() + 15 * 60000);
    $("#bookTitle").textContent = p.name;
    $("#bookArea").textContent = `${p.area} · ${euro(p.price)}/hour · max ${euro(p.daily)}/day`;
    $("#bDate").value = now.toISOString().slice(0, 10);
    $("#bDate").min = new Date().toISOString().slice(0, 10);
    $("#bTime").value = now.toTimeString().slice(0, 5);
    updateTotal();
    $("#bookModal").hidden = false;
    $("#bPlate").focus();
  }
  function updateTotal() {
    if (booking) $("#bTotal").textContent = euro(cost(booking, Number($("#bHours").value)));
  }

  $("#bHours").addEventListener("change", updateTotal);
  function afterBooked(rec) {
    const list = loadBookings();
    list.unshift(rec);
    saveBookings(list);
    $("#bookModal").hidden = true;
    $("#bookForm").reset();
    render();
    showTicket(rec);
  }

  $("#bookForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const hours = Number($("#bHours").value);
    const plate = $("#bPlate").value.trim().toUpperCase();
    const start = new Date(`${$("#bDate").value}T${$("#bTime").value}`);
    if (isNaN(start) || start < new Date(Date.now() - 5 * 60000)) {
      toast("Please choose a start time in the future.");
      return;
    }
    const btn = $("#bookForm button[type=submit]");
    if (API.online) {
      btn.disabled = true;
      try {
        const res = await fetch("/api/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parkingId: booking.id, start: start.toISOString(), hours, plate, email: $("#bEmail").value.trim() }),
        });
        const body = await res.json();
        if (!res.ok) {
          const first = body.fields && Object.values(body.fields)[0];
          toast(first || body.error || "Booking failed. Try again.");
          return;
        }
        booking.free = Math.max(0, booking.free - 1);
        markers[booking.id].setIcon(pinIcon(booking, true)).setPopupContent(popupHtml(booking));
        afterBooked({ ...body, server: true });
      } catch (_) {
        toast("Couldn't reach the server. Check your connection and try again.");
      } finally {
        btn.disabled = false;
      }
      return;
    }
    booking.free = Math.max(0, booking.free - 1);
    markers[booking.id].setIcon(pinIcon(booking)).setPopupContent(popupHtml(booking));
    afterBooked({
      code: "ATH-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
      parkingId: booking.id, name: booking.name, area: booking.area,
      start: start.toISOString(), hours, plate, total: cost(booking, hours),
    });
  });

  // ---------- Ticket confirmation ----------
  function qrCells(seed) {
    // Decorative code pattern derived from the booking code, with three finder squares.
    let h = 0; for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const n = 17, cells = [];
    const finder = (x, y) => [[0, 0], [n - 7, 0], [0, n - 7]].some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (finder(x, y)) continue;
      h = (h * 1103515245 + 12345) >>> 0;
      if (h & 0x10000) cells.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
    }
    const sq = (fx, fy) => `<rect x="${fx + .5}" y="${fy + .5}" width="6" height="6" fill="none" stroke="#0b0c10"/><rect x="${fx + 2}" y="${fy + 2}" width="3" height="3"/>`;
    return `<svg viewBox="-1 -1 ${n + 2} ${n + 2}" aria-hidden="true"><rect x="-1" y="-1" width="${n + 2}" height="${n + 2}" fill="#fff"/><g fill="#0b0c10">${cells.join("")}${sq(0, 0)}${sq(n - 7, 0)}${sq(0, n - 7)}</g></svg>`;
  }
  function showTicket(b) {
    const start = new Date(b.start), end = new Date(start.getTime() + b.hours * 3600000);
    const fmt = (d) => d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    $("#ticketBody").innerHTML = `
      <div class="tk-head"><img src="assets/logo.svg" alt="" width="60" height="36"><span>PARKING TICKET</span></div>
      <div class="tk-place">${escapeHtml(b.name)}<small>${escapeHtml(b.area)}</small></div>
      <div class="tk-row"><span>Plate</span><b>${escapeHtml(b.plate)}</b></div>
      <div class="tk-row"><span>From</span><b>${fmt(start)}</b></div>
      <div class="tk-row"><span>Until</span><b>${fmt(end)}</b></div>
      <div class="tk-row tk-total"><span>Total</span><b>${euro(b.total)}</b></div>
      <div class="tk-code">${qrCells(b.code)}<div><small>Booking code</small><b>${escapeHtml(b.code)}</b><em>${b.server ? "The gate camera will read your plate." : "Demo booking, saved in this browser."}</em></div></div>`;
    const m = $("#ticketModal");
    m.hidden = false;
    const t = $(".ticket", m);
    t.classList.remove("printing"); void t.offsetWidth; t.classList.add("printing");
  }

  function renderBookings() {
    const list = loadBookings();
    $("#bookingsList").innerHTML = list.length
      ? list.map((b, i) => {
          const start = new Date(b.start);
          const end = new Date(start.getTime() + b.hours * 3600000);
          const fmt = (d) => d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
          return `<div class="booking">
            <div class="booking-head"><b>${escapeHtml(b.name)}</b><strong>${euro(b.total)}</strong></div>
            <small>${escapeHtml(b.area)} · Plate ${escapeHtml(b.plate)}</small>
            <small>${fmt(start)} → ${fmt(end)}</small>
            <small>Code <span class="code">${escapeHtml(b.code)}</span></small>
            <button class="link-danger" data-cancel="${i}">Cancel booking</button>
          </div>`;
        }).join("")
      : `<p class="muted">No bookings yet. Find a spot and reserve it in seconds.</p>`;
  }

  $("#bookingsList").addEventListener("click", (e) => {
    const i = e.target.dataset.cancel;
    if (i === undefined) return;
    const list = loadBookings();
    const target = list[Number(i)];
    if (target && target.server && API.online) {
      fetch(`/api/bookings/${encodeURIComponent(target.code)}/cancel`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plate: target.plate }),
      }).then((r) => { if (!r.ok && r.status !== 409) toast("The server couldn't cancel it. Try again."); }).catch(() => toast("Couldn't reach the server."));
    }
    const [removed] = list.splice(Number(i), 1);
    const p = parkings.find((x) => x.id === removed.parkingId);
    if (p) {
      p.free = Math.min(p.total, p.free + 1);
      markers[p.id].setIcon(pinIcon(p)).setPopupContent(popupHtml(p));
    }
    saveBookings(list);
    renderBookings();
    render();
    toast("Booking cancelled.");
  });

  $("#openBookings").addEventListener("click", (e) => {
    e.preventDefault();
    renderBookings();
    $("#bookingsModal").hidden = false;
    $("#navLinks").classList.remove("open");
  });

  document.querySelectorAll(".modal").forEach((m) =>
    m.addEventListener("click", (e) => {
      if (e.target === m || e.target.hasAttribute("data-close")) m.hidden = true;
    })
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") document.querySelectorAll(".modal").forEach((m) => (m.hidden = true));
  });

  // ---------- Events ----------
  document.addEventListener("click", (e) => {
    const bookBtn = e.target.closest("[data-book]");
    if (bookBtn) { e.stopPropagation(); openBooking(Number(bookBtn.dataset.book)); return; }
    const card = e.target.closest(".card");
    if (card) setActive(Number(card.dataset.id), true);
  });

  function stagger() {
    const l = $("#list");
    l.classList.remove("stagger"); void l.offsetWidth; l.classList.add("stagger");
    clearTimeout(stagger.t); stagger.t = setTimeout(() => l.classList.remove("stagger"), 900);
  }
  $("#query").addEventListener("input", (e) => { state.query = e.target.value; render(); stagger(); });
  $("#query").addEventListener("change", fitVisible);

  $("#chips").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const f = chip.dataset.f;
    state.filters.has(f) ? state.filters.delete(f) : state.filters.add(f);
    chip.classList.toggle("on");
    render();
    stagger();
    fitVisible();
  });

  $("#sort").addEventListener("change", (e) => {
    state.sort = e.target.value;
    if (state.sort === "distance" && !state.userPos) {
      if (!navigator.geolocation) { toast("Location not available in this browser."); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          state.userPos = [pos.coords.latitude, pos.coords.longitude];
          L.circleMarker(state.userPos, { radius: 8, color: "#070b14", weight: 3, fillColor: "#f6b70b", fillOpacity: 1 })
            .addTo(map).bindPopup("You are here");
          render();
        },
        () => toast("Couldn't get your location — sorting by price.")
      );
    }
    render();
  });

  $("#heroSearch").addEventListener("submit", (e) => {
    e.preventDefault();
    state.query = $("#heroQuery").value;
    $("#query").value = state.query;
    render();
    document.getElementById("find").scrollIntoView();
    setTimeout(() => { map.invalidateSize(); fitVisible(); }, 400);
  });

  $("#menuBtn").addEventListener("click", () => $("#navLinks").classList.toggle("open"));
  document.querySelectorAll(".nav-links a[href^='#']:not(#openBookings)").forEach((a) =>
    a.addEventListener("click", () => $("#navLinks").classList.remove("open"))
  );

  // Area suggestions
  $("#areaList").innerHTML = [...new Set(parkings.map((p) => p.area))]
    .map((a) => `<option value="${escapeHtml(a)}">`).join("");

  // ---------- Cost estimator ----------
  $("#calcPlace").innerHTML = parkings
    .map((p) => `<option value="${p.id}">${escapeHtml(p.name)} (${euro(p.price)}/h)</option>`).join("");
  function updateCalc() {
    const p = parkings.find((x) => x.id === Number($("#calcPlace").value));
    const h = Number($("#calcHours").value);
    $("#calcHoursLabel").textContent = h + " h";
    $("#calcOut").textContent = euro(cost(p, h));
  }
  $("#calcPlace").addEventListener("change", updateCalc);
  $("#calcHours").addEventListener("input", updateCalc);

  // ---------- Simulated live availability ----------
  setInterval(() => {
    if (API.online) return;
    const p = parkings[Math.floor(Math.random() * parkings.length)];
    const delta = Math.random() < 0.5 ? -1 : 1;
    p.free = Math.min(p.total, Math.max(0, p.free + delta * Math.ceil(Math.random() * 3)));
    markers[p.id].setIcon(pinIcon(p)).setPopupContent(popupHtml(p));
    render();
  }, 4000);

  // Demo phone timer
  let secs = 1 * 3600 + 24 * 60 + 7;
  setInterval(() => {
    secs = secs > 0 ? secs - 1 : 2 * 3600;
    const pad = (n) => String(n).padStart(2, "0");
    $("#demoTimer").textContent = `${pad(Math.floor(secs / 3600))}:${pad(Math.floor((secs % 3600) / 60))}:${pad(secs % 60)}`;
  }, 1000);

  // ---------- Server connection ----------
  function applyFree(id, free) {
    const p = parkings.find((x) => x.id === id);
    if (!p || p.free === free) return;
    p.free = free;
    markers[p.id].setIcon(pinIcon(p, true)).setPopupContent(popupHtml(p));
    clearTimeout(markers[p.id].pingT);
    markers[p.id].pingT = setTimeout(() => markers[p.id].setIcon(pinIcon(p)), 1300);
  }
  async function connect() {
    if (!/^https?:$/.test(location.protocol)) return;
    try {
      const res = await fetch("/api/parkings", { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(3000) });
      if (!res.ok || !(res.headers.get("content-type") || "").includes("json")) return;
      const list = await res.json();
      list.forEach((g) => {
        const p = parkings.find((x) => x.id === g.id);
        if (p) Object.assign(p, { name: g.name, area: g.area, price: g.price, daily: g.daily, total: g.total, free: g.free, features: g.features });
      });
      API.online = true;
      parkings.forEach((p) => markers[p.id].setIcon(pinIcon(p)).setPopupContent(popupHtml(p)));
      render();
      if (window.EventSource) {
        const es = new EventSource("/api/stream");
        let pending = false;
        es.addEventListener("availability", (e) => {
          const d = JSON.parse(e.data);
          applyFree(d.id, d.free);
          if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; render(); }); }
        });
      }
    } catch (_) { /* no server: keep the built-in demo data */ }
  }

  $("#year").textContent = new Date().getFullYear();
  saveBookings(loadBookings());
  updateCalc();
  render();
  connect().finally(() => {
    const want = Number(new URLSearchParams(location.search).get("book"));
    if (want) {
      const p = parkings.find((x) => x.id === want);
      if (p) { setActive(p.id, true); openBooking(p.id); }
    }
  });
})();
