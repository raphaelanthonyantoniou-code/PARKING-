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
| `APP_SECRET` | required in production | Encrypts authenticator keys. Long random string; never change it after launch |
| `RESEND_API_KEY`, `MAIL_FROM` | empty | Sends sign-in codes and alerts by email |
| `DEV_MAILBOX` | `0` | Development only: exposes `/api/dev/outbox` |
| `TRUST_PROXY` | `0` | Set to `1` behind a reverse proxy so rate limits use the real client IP |

## Driver accounts and two-step sign-in

Booking on the marketplace needs an account. Tapping **Reserve** while signed out opens the sign-in window and continues the booking afterwards.

- **Sign-up** asks for name, email and a password (10+ characters, not a common password, not containing the name or email; a live strength meter shows the rules). A 6-digit code is emailed to confirm the address.
- **Every sign-in has a second step**: a code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 1Password…) if set up, otherwise a code emailed to the account. Codes expire after 10 minutes and 5 wrong tries end the attempt.
- **Authenticator setup** shows a QR code and a manual key, needs a working code to turn on, and issues 10 single-use recovery codes (copy or download). Used authenticator codes can't be replayed.
- **Password reset** by emailed code; it signs out every device.
- **Account page** (`/account`): profile, up to 5 saved plates, password change (signs out other devices), authenticator on/off/move to a new phone, new recovery codes, signed-in devices with sign-out, booking history with cancellation (free until 30 minutes before the start), and account deletion.
- **Security**: scrypt password hashes; authenticator keys encrypted with AES-256-GCM using `APP_SECRET`; recovery codes and one-time codes stored only as hashes; session tokens stored as SHA-256 hashes and sent in an HttpOnly, SameSite=Lax cookie (`__Host-` prefixed and Secure on HTTPS); cross-site requests refused by Origin check; per-IP and per-email rate limits; identical answers for existing and unknown emails on sign-up, sign-in and reset; email alerts for security changes.
- **Emails** go through [Resend](https://resend.com) when `RESEND_API_KEY` is set. Without it they're written to the server log; with `DEV_MAILBOX=1` (never in production) `/api/dev/outbox` shows them for local testing.
- **Without the server** (static files or the preview) the pages run a labelled demo: accounts live in that browser and codes appear in an on-screen "demo inbox". Authenticator apps still work there.

`/privacy` and `/terms` describe what's stored and why; fill in the bracketed company details and have them reviewed before launch.

## API

| Method and path | Notes |
|---|---|
| `GET /api/health` | Health check |
| `GET /api/parkings`, `GET /api/parkings/:id` | Car parks with live free spaces |
| `GET /api/stream` | Server-Sent Events: `snapshot`, then `availability` `{id, free}` on every change |
| `POST /api/bookings` | Signed in. `{parkingId, start (ISO), hours, plate}`. Price is calculated on the server. Returns the booking code. |
| `POST /api/auth/signup`, `/login`, `/verify`, `/resend`, `/forgot`, `/reset`, `/logout`, `GET /api/auth/me` | Account sign-up and sign-in with the second step |
| `/api/account` (`PATCH`, `DELETE`), `/api/account/password`, `/api/account/2fa/*`, `/api/account/sessions`, `/api/account/bookings` | Signed-in account management |
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
