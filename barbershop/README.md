# Kairos Barber House

An animated 3D website for a barbershop. A fully modelled shop (hydraulic chair, spinning barber pole, working mirror, neon sign, tools) sits behind the page, and the camera moves through it as you scroll.

Static files only: no build step, no npm install.

## What's on the page

| Section | What happens |
|---|---|
| Loader | Barber-pole progress bar while the 3D scene builds, then the lights come up and the neon flickers on |
| Hero | Chair under a spotlight, framed by the round mirror. Drag the chair to spin it |
| The house | Camera drifts to the barber pole; story and stats |
| Menu | Price board with filters (Hair, Beard & shave, Rituals), 3D tilt cards, "Book this" preselects the service |
| The craft | Pinned section: straight razor, shears, clipper and comb slide in one at a time and rotate as you scroll |
| Barbers | Flip cards with specialties, days off and "Book with …" |
| Reviews | 3D carousel you can drag or step through |
| Book | Four steps: service, barber, time, details. Ends with a printed ticket, "Send on WhatsApp" and "Add to calendar" (.ics) |
| Visit | Address, live open/closed status in the shop's time zone, opening hours, FAQ |

Also: custom cursor, magnetic buttons, scroll-speed tape marquee, nav that hides on scroll, `prefers-reduced-motion` support, and a CSS barber pole if the device has no WebGL.

## Run it

ES modules need a web server (opening `index.html` from disk won't load the 3D scene):

```bash
npx serve barbershop            # or
python3 -m http.server --directory barbershop 8080
```

## Deploy

Upload the `barbershop/` folder to any static host: Netlify, Cloudflare Pages, GitHub Pages, Vercel or plain shared hosting.

## Make it yours

Almost everything lives in **`js/config.js`**:

- `SHOP`: name, address, phone, WhatsApp number, email, Instagram, time zone, opening hours, booking window and slot length
- `SERVICES`, `GROUPS`: the menu and its filters
- `BARBERS`: names, roles, years, specialties, days off, card colour
- `REVIEWS`, `FAQ`
- `demo`: shows a "placeholder content" line in the footer. Set it to `false` once the real details are in.

Text that lives in `index.html`: the page title and description, the structured data (`HairSalon`) in the `<head>`, the hero, "The house" story and the four craft panels.

## Bookings

- **Default:** the visitor's request is turned into a WhatsApp message to `SHOP.whatsapp` (service, barber, day, time, name, mobile, notes, reference code). The shop confirms by reply. The visitor can also add it to their calendar.
- **With a backend:** set `SHOP.bookingEndpoint` to a URL that accepts `POST` JSON:
  `{ code, service, barber, date, time, minutes, price, name, phone, email, notes, createdAt }`.
  A 2xx answer shows "Request sent"; anything else falls back to WhatsApp.

Time slots only hide past times and the barber's days off. Live availability needs a booking system behind `bookingEndpoint`.

## 3D scene

`js/scene.js` builds everything in code with [three.js](https://threejs.org) r170 (MIT, vendored in `vendor/three`). Camera positions per section are in `VIEWS` at the top of the file.

- Quality adapts: smaller screens get a lighter mirror and shadows, and the resolution drops automatically if frames get slow.
- With reduced motion turned on, the tools stop orbiting and the camera moves without drift.

## Before going live

- Replace every placeholder in `js/config.js` and the structured data in `index.html`.
- Replace the sample reviews with real ones, then set `demo: false`.
- Fonts load from Google Fonts. Self-host them if you need to avoid third-party requests.
