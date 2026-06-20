'use strict';

// All dates are 'YYYY-MM-DD' strings, treated as calendar dates (no timezone math).

function isValidDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
}

function toUTC(s) {
  return new Date(s + 'T00:00:00Z');
}

function addDays(s, n) {
  const d = toUTC(s);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function diffNights(checkIn, checkOut) {
  return Math.round((toUTC(checkOut) - toUTC(checkIn)) / 86400000);
}

// Nights occupied by a stay: [checkIn, checkOut) — checkout day is not a night.
function eachNight(checkIn, checkOut) {
  const out = [];
  let cur = checkIn;
  while (cur < checkOut) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = { isValidDate, addDays, diffNights, eachNight, today, toUTC };
