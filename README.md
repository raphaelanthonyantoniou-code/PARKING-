# Parkareto

Website, driver marketplace and backend for **Parkareto**, the smart parking system.

| URL | What it is |
|---|---|
| `/` | Landing page for the app: live dashboard demo, ANPR camera scene, interactive 3D car park, features, myDATA, plans and pricing, revenue estimator, FAQ and demo request form. |
| `/marketplace` | Driver marketplace for Athens: live map, search and filters, online booking with a printed ticket, My bookings. |
| `/parking` and `/parking/<car-park>` | Server-rendered pages for search engines: one page per car park with live free spaces, prices, map, FAQ and nearby car parks. |
| `/admin` | Dashboard for demo requests, bookings and car parks (needs `ADMIN_TOKEN`). |

## Run it

Needs **Node.js 22.13 or newer**. There are no npm dependencies; the database is Node's built-in SQLite.

```bash
cp .env.example .env        # then edit the values
export $(grep -v '^#' .env | xargs)
npm start                   # http://localhost:3000
npm test                    # API, SEO and security tests
```

With Docker:

```bash
docker build -t parkareto .
docker run -p 3000:3000 -v parkareto-data:/data \
  -e SITE_URL=https://parkareto.gr -e ADMIN_TOKEN=change-me -e OPERATOR_KEY=change-me parkareto
```

The database is created and filled from `public/data.js` on first start. Keep `DB_FILE` (or the `/data` volume) on persistent storage.

### Settings

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Port to listen on |
| `SITE_URL` | `http://localhost:PORT` | Public address, used for canonical links, sitemap and social cards |
| `DB_FILE` | `./data/parkareto.db` | SQLite database file |
| `ADMIN_TOKEN` | empty (admin off) | Unlocks `/admin` and `/api/admin/*` |
| `OPERATOR_KEY` | empty (off) | Lets garages push live free-space counts |
| `SIMULATE` | on, off when `NODE_ENV=production` | Randomly changes availability so the demo looks alive |
| `NOTIFY_WEBHOOK_URL` | empty | Slack, Teams or Zapier webhook that gets each demo request |
| `TRUST_PROXY` | `0` | Set to `1` behind a reverse proxy so rate limits use the real client IP |

## API

| Method and path | Notes |
|---|---|
| `GET /api/health` | Health check |
| `GET /api/parkings`, `GET /api/parkings/:id` | Car parks with live free spaces |
| `GET /api/stream` | Server-Sent Events: `snapshot`, then `availability` `{id, free}` on every change |
| `POST /api/bookings` | `{parkingId, start (ISO), hours, plate, email?}`. Price is calculated on the server. Returns the booking code. |
| `GET /api/bookings/:code?plate=` | Look up a booking (code and plate must match) |
| `POST /api/bookings/:code/cancel` | `{plate}` |
| `POST /api/demo-requests` | `{name, email, company?, phone?, bays?, plan?, message?}` |
| `PUT /api/operator/garages/:id` | `Authorization: Bearer OPERATOR_KEY`, body `{free}`: garages running Parkareto push live counts |
| `/api/admin/*` | `Authorization: Bearer ADMIN_TOKEN`: summary, demo requests (+ CSV), bookings, car park edits |

Errors are JSON `{error, fields?}` with a matching status (401, 404, 409 full, 413, 415, 422 validation, 429 rate limited).

## Security

- Content Security Policy with hashed inline scripts, `frame-ancestors 'none'`, nosniff, strict referrer policy, HSTS on HTTPS.
- Only files inside `public/` are served; dotfiles and path traversal are refused.
- Rate limits on every API route, stricter on bookings and demo requests; a honeypot field stops form bots.
- Admin and operator secrets are compared in constant time. CSV export neutralises spreadsheet formulas.
- Bookings run in a database transaction, so two people can't take the last space.

## SEO

- Unique titles and descriptions, canonical URLs, Open Graph and Twitter cards with a 1200×630 preview image.
- Structured data: Organization, WebSite, SoftwareApplication with prices, FAQPage, BreadcrumbList, ItemList and a ParkingFacility per car park (address, coordinates, prices, hours, amenities).
- `/sitemap.xml` and `/robots.txt` are generated from the database. Each car park page links to its nearest neighbours.
- Fonts are self-hosted (`public/fonts`, SIL OFL) with preloads: no third-party font requests. Text is brotli/gzip compressed, static files carry ETags and cache headers.
- `.html` URLs redirect to clean URLs (`/marketplace.html` → `/marketplace`).

## Files

- `server/`: `server.js` (HTTP server, API, security), `db.js` (SQLite schema and seed), `ssr.js` (SEO pages, sitemap), `pricing.js`, `validate.js`
- `test/api.test.js`: run with `npm test`
- `public/`: the site. `index.html` + `landing.*`, `garage.*` (3D car park), `marketplace.*`, `data.js` (seed and offline data), `admin.*`, `pages.css` + `page-live.js` (car park pages), `404.html`, `fonts/`, `assets/` (logo, icons, social image), `vendor/leaflet/`

The pages also work without the server (for example opened as static files): the marketplace then uses `public/data.js`, keeps bookings in the browser, and the demo form opens the visitor's email app.

## Before going live

- Plan prices and limits in `public/index.html` (`#pricing`) are placeholders.
- Replace `sales@parkareto.example` in `public/index.html` and `public/landing.js`.
- Set `SITE_URL` to the real domain; it replaces `https://parkareto.example` in the pages at serve time.
