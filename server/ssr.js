"use strict";
// Server-rendered pages for search engines: one page per car park, an index of
// all car parks, the sitemap and robots.txt.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const euro = (n) => "€" + Number(n).toFixed(2);
const FEATURE = { covered: "Covered", "24h": "Open 24/7", ev: "EV charging", accessible: "Accessible bays", valet: "Valet" };
const jsonld = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;

function km(a, b) {
  const R = 6371, r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function layout({ site, path, title, description, body, ld = [], extraHead = "" }) {
  const url = site + path;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${esc(url)}">
  <meta name="theme-color" content="#070b14">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Parkareto">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(url)}">
  <meta property="og:image" content="${esc(site)}/assets/og-image.png">
  <meta property="og:locale" content="en_GB">
  <meta property="og:locale:alternate" content="el_GR">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="/assets/logo.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="preload" href="/fonts/manrope-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/fonts/unbounded-latin-800-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/fonts.css">
  <link rel="stylesheet" href="/marketplace.css">
  <link rel="stylesheet" href="/pages.css">
  ${extraHead}
  ${ld.map(jsonld).join("\n  ")}
</head>
<body>
  <header class="nav">
    <div class="container nav-inner">
      <a href="/" class="brand"><img class="logo-img" src="/assets/logo.svg" alt="" width="67" height="40"><span class="brand-t"><b class="chrome">PARKARETO</b><small>Parking in Athens</small></span></a>
      <nav class="nav-links" aria-label="Main">
        <a href="/marketplace">Find parking</a>
        <a href="/parking">All car parks</a>
        <a href="/">For garages</a>
      </nav>
    </div>
  </header>
  <main>${body}</main>
  <footer class="footer">
    <div class="container footer-inner">
      <div><a href="/" class="brand"><img class="logo-img" src="/assets/logo.svg" alt="" width="67" height="40"><span class="brand-t"><b class="chrome">PARKARETO</b><small>Parking in Athens</small></span></a><p>Live parking availability at Parkareto garages across Athens.</p></div>
      <div><b>Drivers</b><p><a href="/marketplace">Find parking</a><br><a href="/parking">All car parks</a></p></div>
      <div><b>Garages</b><p><a href="/">Parkareto for operators</a><br><a href="/#pricing">Plans &amp; pricing</a></p></div>
    </div>
    <div class="container copy">© ${new Date().getFullYear()} Parkareto.</div>
  </footer>
</body>
</html>`;
}

function garageLd(site, g) {
  const f = JSON.parse(g.features);
  return {
    "@context": "https://schema.org",
    "@type": "ParkingFacility",
    "@id": `${site}/parking/${g.slug}`,
    name: g.name,
    url: `${site}/parking/${g.slug}`,
    image: `${site}/assets/og-image.png`,
    address: { "@type": "PostalAddress", addressLocality: g.area, addressRegion: "Attica", addressCountry: "GR" },
    geo: { "@type": "GeoCoordinates", latitude: g.lat, longitude: g.lng },
    priceRange: `${euro(g.price_hour)}/hour · ${euro(g.price_day)}/day`,
    maximumAttendeeCapacity: g.total,
    isAccessibleForFree: false,
    ...(f.includes("24h") ? { openingHoursSpecification: { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"], opens: "00:00", closes: "23:59" } } : {}),
    amenityFeature: f.map((x) => ({ "@type": "LocationFeatureSpecification", name: FEATURE[x] || x, value: true })),
  };
}

function breadcrumbs(site, items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: site + path })),
  };
}

function garagePage(site, g, all) {
  const f = JSON.parse(g.features);
  const near = all.filter((x) => x.id !== g.id).map((x) => ({ ...x, d: km(g, x) })).sort((a, b) => a.d - b.d).slice(0, 4);
  const pct = Math.round(((g.total - g.free) / g.total) * 100);
  const lvl = g.free === 0 ? "full" : g.free / g.total < 0.1 ? "low" : "high";
  const title = `${g.name} parking in ${g.area}, Athens · from ${euro(g.price_hour)}/h | Parkareto`;
  const description = `Book parking at ${g.name} in ${g.area}, Athens. ${g.total} spaces, ${euro(g.price_hour)} per hour, max ${euro(g.price_day)} per day${f.length ? ", " + f.map((x) => (FEATURE[x] || x).toLowerCase()).join(", ") : ""}. See live free spaces and reserve online.`;
  const faq = [
    [`How much does parking at ${g.name} cost?`, `${euro(g.price_hour)} per hour, capped at ${euro(g.price_day)} per day. Multi-day bookings pay the day rate for each 24 hours.`],
    [`How many spaces does ${g.name} have?`, `${g.total} spaces. The number free right now is shown live on this page.`],
    [`Can I reserve a space at ${g.name} in advance?`, `Yes. Choose a start time, a duration and your plate, and the space is held for you. Cancellation is free up to 30 minutes before the start.`],
  ];
  const body = `
  <section class="gp-hero">
    <div class="container gp-grid">
      <div>
        <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Parkareto</a> › <a href="/parking">Car parks in Athens</a> › <span>${esc(g.area)}</span></nav>
        <h1>${esc(g.name)}</h1>
        <p class="gp-area">${esc(g.area)}, Athens</p>
        <div class="gp-live" data-garage="${g.id}" data-total="${g.total}">
          <span class="avail ${lvl}" id="gpFree">${g.free === 0 ? "Full" : `${g.free} free`} of ${g.total}</span>
          <div class="occ"><i id="gpOcc" style="width:${pct}%"></i></div>
          <small>Live · updates automatically</small>
        </div>
        <div class="gp-price"><div><strong>${euro(g.price_hour)}</strong><span>per hour</span></div><div><strong>${euro(g.price_day)}</strong><span>max per day</span></div></div>
        <div class="gp-cta"><a class="btn btn-primary" href="/marketplace?book=${g.id}">Reserve a space</a><a class="btn btn-ghost" href="https://www.google.com/maps/dir/?api=1&destination=${g.lat},${g.lng}" rel="noopener" target="_blank">Directions</a></div>
        ${f.length ? `<ul class="gp-feat">${f.map((x) => `<li>${esc(FEATURE[x] || x)}</li>`).join("")}</ul>` : ""}
      </div>
      <div class="gp-map" id="gpMap" data-lat="${g.lat}" data-lng="${g.lng}" data-name="${esc(g.name)}" role="img" aria-label="Map showing ${esc(g.name)} in ${esc(g.area)}"></div>
    </div>
  </section>
  <section class="section">
    <div class="container gp-cols">
      <div>
        <h2>About parking at ${esc(g.name)}</h2>
        <p>${esc(g.name)} is in ${esc(g.area)}, Athens, with ${g.total} spaces${f.includes("covered") ? " under cover" : ""}${f.includes("24h") ? ", open around the clock" : ""}. Parking costs ${euro(g.price_hour)} per hour and never more than ${euro(g.price_day)} for a full day.${f.includes("ev") ? " EV charging bays are available." : ""}${f.includes("accessible") ? " Accessible bays are close to the exits." : ""}</p>
        <p>The garage runs Parkareto, so the camera at the entry reads your plate: book here and the barrier opens for you when you arrive.</p>
        <h2>Questions</h2>
        ${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}
      </div>
      <aside>
        <h2>Nearby car parks</h2>
        <ul class="gp-near">${near.map((n) => `<li><a href="/parking/${n.slug}"><b>${esc(n.name)}</b><span>${esc(n.area)} · ${n.d.toFixed(1)} km · ${euro(n.price_hour)}/h</span></a></li>`).join("")}</ul>
      </aside>
    </div>
  </section>
  <script src="/vendor/leaflet/leaflet.js" defer></script>
  <script src="/page-live.js" defer></script>`;
  const ld = [
    garageLd(site, g),
    breadcrumbs(site, [["Parkareto", "/"], ["Car parks in Athens", "/parking"], [g.name, `/parking/${g.slug}`]]),
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
  ];
  return layout({ site, path: `/parking/${g.slug}`, title, description, body, ld, extraHead: '<link rel="stylesheet" href="/vendor/leaflet/leaflet.css">' });
}

function hubPage(site, all) {
  const byArea = {};
  all.forEach((g) => (byArea[g.area] = byArea[g.area] || []).push(g));
  const areas = Object.keys(byArea).sort();
  const cheapest = Math.min(...all.map((g) => g.price_hour));
  const body = `
  <section class="gp-hero">
    <div class="container">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Parkareto</a> › <span>Car parks in Athens</span></nav>
      <h1>Car parks in Athens</h1>
      <p class="gp-area">${all.length} car parks in ${areas.length} neighbourhoods, from ${euro(cheapest)} per hour. Free spaces update live.</p>
      <div class="gp-cta"><a class="btn btn-primary" href="/marketplace">Open the live map</a></div>
    </div>
  </section>
  <section class="section">
    <div class="container hub">
      ${areas.map((a) => `<div class="hub-area"><h2>Parking in ${esc(a)}</h2><ul>${byArea[a].map((g) => `<li><a href="/parking/${g.slug}"><b>${esc(g.name)}</b><span>${g.total} spaces · ${euro(g.price_hour)}/h · ${euro(g.price_day)}/day</span></a></li>`).join("")}</ul></div>`).join("")}
    </div>
  </section>`;
  const ld = [
    { "@context": "https://schema.org", "@type": "ItemList", name: "Car parks in Athens", itemListElement: all.map((g, i) => ({ "@type": "ListItem", position: i + 1, url: `${site}/parking/${g.slug}`, name: g.name })) },
    breadcrumbs(site, [["Parkareto", "/"], ["Car parks in Athens", "/parking"]]),
  ];
  return layout({ site, path: "/parking", title: `Car parks in Athens · live free spaces from ${euro(cheapest)}/h | Parkareto`, description: `Compare ${all.length} car parks across Athens: Syntagma, Plaka, Kolonaki, Piraeus, Glyfada, the airport and more. Prices, live free spaces and online booking.`, body, ld });
}

function sitemap(site, all) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [["/", "1.0", "weekly"], ["/marketplace", "0.9", "daily"], ["/parking", "0.8", "daily"]]
    .map(([p, pr, cf]) => `<url><loc>${site}${p}</loc><lastmod>${today}</lastmod><changefreq>${cf}</changefreq><priority>${pr}</priority></url>`)
    .concat(all.map((g) => `<url><loc>${site}/parking/${g.slug}</loc><lastmod>${g.updated_at.slice(0, 10)}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

function robots(site) {
  return `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\n\nSitemap: ${site}/sitemap.xml\n`;
}

module.exports = { garagePage, hubPage, sitemap, robots, esc };
