# ParkAthens — Parking Manager website

A static website for the Parking Manager app, covering parking across Athens, Greece.

## Features
- **Live map** (Leaflet + OpenStreetMap) with 18 sample garages from Syntagma, Plaka and Kolonaki out to Piraeus, Glyfada, Kifisia and the airport. Pins are colour-coded by availability.
- **Search & filters**: neighbourhood search, covered / 24/7 / EV / accessible / valet / has-free-spots chips, and sorting by price, free spots, name or distance from you (uses geolocation).
- **Reservations**: pick a date, time, duration and plate (Greek or Latin letters). The price uses the hourly rate, capped at the daily rate. Bookings are saved in the browser under **My bookings**, where you can cancel them.
- **Street parking info**: controlled zones, Daktylios (traffic ring) and Park & Ride, plus a cost estimator.
- Simulated live availability updates, responsive layout and a mobile menu.

## Run locally
No build step. Serve the folder with any static server:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Files
- `index.html`: page markup
- `styles.css`: styles
- `app.js`: map, filters, booking logic
- `data.js`: parking locations (edit this file or replace it with your app's API)
- `vendor/leaflet/`: bundled Leaflet 1.9.4 (BSD-2-Clause)

> Locations, prices and availability are demo data.
