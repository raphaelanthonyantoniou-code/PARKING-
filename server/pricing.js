"use strict";
// Same rule as the marketplace UI: hourly rate, capped at the daily rate for each 24h block.
const ALLOWED_HOURS = [1, 2, 3, 4, 6, 8, 12, 24, 72, 168];

function bookingCost(garage, hours) {
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  const total = days * garage.price_day + Math.min(rest * garage.price_hour, garage.price_day);
  return Math.round(total * 100) / 100;
}

module.exports = { ALLOWED_HOURS, bookingCost };
