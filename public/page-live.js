// Car park page: small map and live free-space count from the server stream.
(function () {
  "use strict";
  var m = document.getElementById("gpMap");
  if (m && window.L) {
    var ll = [Number(m.dataset.lat), Number(m.dataset.lng)];
    var map = L.map(m, { scrollWheelZoom: false }).setView(ll, 16);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19, subdomains: "abcd",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(map);
    L.marker(ll, { icon: L.divIcon({ className: "", html: '<div class="pin high"><span>P</span></div>', iconSize: [34, 34], iconAnchor: [17, 34] }), title: m.dataset.name }).addTo(map);
  }
  var live = document.querySelector(".gp-live");
  if (!live || !window.EventSource) return;
  var id = Number(live.dataset.garage), total = Number(live.dataset.total);
  function show(free) {
    var el = document.getElementById("gpFree");
    el.className = "avail " + (free === 0 ? "full" : free / total < 0.1 ? "low" : "high");
    el.textContent = (free === 0 ? "Full" : free + " free") + " of " + total;
    document.getElementById("gpOcc").style.width = Math.round(((total - free) / total) * 100) + "%";
    live.classList.remove("flash"); void live.offsetWidth; live.classList.add("flash");
  }
  var es = new EventSource("/api/stream");
  es.addEventListener("availability", function (e) { var d = JSON.parse(e.data); if (d.id === id) show(d.free); });
})();
