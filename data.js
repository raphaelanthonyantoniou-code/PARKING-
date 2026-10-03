// Demo parking locations across Athens. Coordinates are approximate;
// prices and availability are sample data for the Parking Manager app.
window.PARKINGS = [
  { id: 1,  name: "Syntagma Square Garage",      area: "Syntagma",     lat: 37.9755, lng: 23.7348, price: 4.0, daily: 22, total: 320, free: 41,  features: ["covered", "24h", "ev"] },
  { id: 2,  name: "Plaka Old Town Parking",       area: "Plaka",        lat: 37.9722, lng: 23.7300, price: 3.5, daily: 18, total: 90,  free: 7,   features: ["covered"] },
  { id: 3,  name: "Monastiraki Station Lot",      area: "Monastiraki",  lat: 37.9761, lng: 23.7253, price: 3.0, daily: 16, total: 140, free: 23,  features: ["24h"] },
  { id: 4,  name: "Acropolis Museum Parking",     area: "Makrygianni",  lat: 37.9685, lng: 23.7286, price: 4.5, daily: 25, total: 200, free: 12,  features: ["covered", "ev", "accessible"] },
  { id: 5,  name: "Kolonaki Underground",         area: "Kolonaki",     lat: 37.9779, lng: 23.7437, price: 5.0, daily: 28, total: 180, free: 0,   features: ["covered", "valet", "ev"] },
  { id: 6,  name: "Omonia Central Garage",        area: "Omonia",       lat: 37.9842, lng: 23.7281, price: 2.5, daily: 14, total: 260, free: 88,  features: ["covered", "24h"] },
  { id: 7,  name: "Psyrri Night Parking",         area: "Psyrri",       lat: 37.9783, lng: 23.7226, price: 3.0, daily: 15, total: 75,  free: 19,  features: ["24h"] },
  { id: 8,  name: "Koukaki Residential Lot",      area: "Koukaki",      lat: 37.9640, lng: 23.7250, price: 2.0, daily: 12, total: 60,  free: 9,   features: ["accessible"] },
  { id: 9,  name: "Exarchia Park & Walk",         area: "Exarchia",     lat: 37.9866, lng: 23.7349, price: 2.0, daily: 11, total: 55,  free: 14,  features: [] },
  { id: 10, name: "Gazi Technopolis Parking",     area: "Gazi",         lat: 37.9780, lng: 23.7135, price: 2.5, daily: 13, total: 150, free: 52,  features: ["24h", "ev"] },
  { id: 11, name: "Ambelokipi Megaro Garage",     area: "Ambelokipi",   lat: 37.9870, lng: 23.7570, price: 3.0, daily: 16, total: 230, free: 64,  features: ["covered", "accessible"] },
  { id: 12, name: "Piraeus Port Gate E2",         area: "Piraeus",      lat: 37.9420, lng: 23.6400, price: 3.5, daily: 20, total: 500, free: 133, features: ["24h", "covered", "ev"] },
  { id: 13, name: "Glyfada Marina Parking",       area: "Glyfada",      lat: 37.8620, lng: 23.7530, price: 3.0, daily: 17, total: 210, free: 37,  features: ["ev", "accessible"] },
  { id: 14, name: "Kifisia Shopping Garage",      area: "Kifisia",      lat: 38.0740, lng: 23.8110, price: 2.5, daily: 14, total: 300, free: 96,  features: ["covered", "ev", "accessible"] },
  { id: 15, name: "Marousi Stadium Park & Ride",  area: "Marousi",      lat: 38.0360, lng: 23.7870, price: 1.5, daily: 6,  total: 600, free: 241, features: ["24h", "accessible"] },
  { id: 16, name: "Athens Airport Long-Term",     area: "Spata (AIA)",  lat: 37.9364, lng: 23.9445, price: 2.0, daily: 15, total: 1200,free: 410, features: ["24h", "covered", "ev", "accessible"] },
  { id: 17, name: "Pangrati Stadium Lot",         area: "Pangrati",     lat: 37.9680, lng: 23.7410, price: 2.0, daily: 11, total: 80,  free: 3,   features: [] },
  { id: 18, name: "Neos Kosmos Business Park",    area: "Neos Kosmos",  lat: 37.9570, lng: 23.7300, price: 2.0, daily: 10, total: 170, free: 58,  features: ["covered", "24h"] }
];
