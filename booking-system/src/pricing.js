'use strict';

const inventory = require('./inventory');
const { eachNight } = require('./util/dates');

// ── Meal plans (from the Kabana De Nature tariff sheet) ─────────────────
// Each room's nightly "base" price (room_types.base_price / rate overrides) is the
// CPAI rate. MAPAI / APAI add a fixed per-room-per-night supplement on top.
const PLANS = [
  { code: 'CPAI',  label: 'Buffet breakfast included',         supplement: 0 },
  { code: 'MAPAI', label: 'Breakfast + lunch or dinner',       supplement: 100000 }, // +₹1,000
  { code: 'APAI',  label: 'All meals — breakfast, lunch & dinner', supplement: 200000 } // +₹2,000
];
const PLAN_CODES = PLANS.map((p) => p.code);
const SUPPLEMENT = Object.fromEntries(PLANS.map((p) => [p.code, p.supplement]));

// Base occupancy included in the room rate.
const INCLUDED_ADULTS_PER_ROOM = 2;

// Extra occupancy, per person per night, by plan (paise). Child < 5 is free.
const EXTRA = {
  child_5_12: { CPAI: 120000, MAPAI: 150000, APAI: 180000 },
  adult:      { CPAI: 200000, MAPAI: 250000, APAI: 300000 }
};

function planLabel(code) {
  const p = PLANS.find((x) => x.code === code);
  return p ? p.label : code;
}

/**
 * Compute the price breakdown for a stay.
 * occ = { units, adults, children5to12, childrenUnder5 }
 * Returns paise amounts. Pricing is always recomputed server-side — never trust the client.
 */
async function computeQuote(roomTypeId, plan, occ, checkIn, checkOut) {
  if (!PLAN_CODES.includes(plan)) plan = 'CPAI';
  const nights = eachNight(checkIn, checkOut);
  const n = nights.length;
  const units = Math.max(1, parseInt(occ.units || 1, 10));
  const adults = Math.max(1, parseInt(occ.adults || INCLUDED_ADULTS_PER_ROOM, 10));
  const children5to12 = Math.max(0, parseInt(occ.children5to12 || 0, 10));
  const childrenUnder5 = Math.max(0, parseInt(occ.childrenUnder5 || 0, 10)); // free

  const extraAdults = Math.max(0, adults - INCLUDED_ADULTS_PER_ROOM * units);

  let roomCost = 0;
  const perNight = [];
  for (const date of nights) {
    const base = await inventory.nightlyPrice(roomTypeId, date); // CPAI base (incl. per-date overrides)
    const planRate = base + SUPPLEMENT[plan];
    roomCost += planRate * units;
    perNight.push({ date, planRate });
  }

  const extraAdultCost = extraAdults * EXTRA.adult[plan] * n;
  const extraChildCost = children5to12 * EXTRA.child_5_12[plan] * n;
  const total = roomCost + extraAdultCost + extraChildCost;

  return {
    plan, planLabel: planLabel(plan),
    nights: n, units, adults, children5to12, childrenUnder5,
    extraAdults, roomCost, extraAdultCost, extraChildCost, total, perNight
  };
}

module.exports = {
  PLANS, PLAN_CODES, SUPPLEMENT, EXTRA, INCLUDED_ADULTS_PER_ROOM,
  planLabel, computeQuote
};
