# Parkareto website

The marketing site for **Parkareto**, the smart parking system, plus the **Parkareto Marketplace**, a public page where drivers in Athens find and book parking at Parkareto garages.

## Pages
| Page | What it is |
|---|---|
| `index.html` | Landing page for the app: intro loader, live dashboard demo, ANPR camera scene (car, plate read, barrier), interactive 3D garage with cars parking live, the 12 modules, the visit flow, myDATA / AADE receipts, plans and pricing (monthly / yearly), a revenue estimator, a marketplace preview, FAQ and a demo request form. |
| `marketplace.html` | Driver marketplace: live map of Athens car parks (dark map tiles), search and filters, reservations, My bookings, street-parking info and a cost estimator. |

## Run locally
No build step. Serve the folder with any static server:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Files
- `assets/logo.svg`: the Parkareto logo, used in both pages, the favicon and the car grille. Replace this file to change the logo everywhere.
- `index.html`, `landing.css`, `landing.js`: landing page
- `garage.css`, `garage.js`: the Live Parking 3D car park (CSS 3D, no libraries)
- `marketplace.html`, `marketplace.css`, `marketplace.js`: marketplace
- `data.js`: marketplace car parks (replace with your API)
- `vendor/leaflet/`: bundled Leaflet 1.9.4 (BSD-2-Clause)

## Before going live
- **Pricing**: the plan prices, limits and add-ons in `index.html` (`#pricing`) are placeholders. Set your real ones. The yearly price is in each `data-y` attribute.
- **Demo form**: it opens the visitor's email app addressed to `sales@parkareto.example`. Change the address in `landing.js`, or point the form at your CRM or backend.
- **Marketplace data**: `data.js` is sample data and availability changes are simulated. Bookings are saved only in the visitor's browser.
- **Contact details** in both footers are placeholders.
