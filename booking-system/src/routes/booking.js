'use strict';

const express = require('express');
const inventory = require('../inventory');
const pricing = require('../pricing');
const rzp = require('../services/razorpay');
const svc = require('../services/bookingService');
const { col } = require('../mongo');
const { isValidDate } = require('../util/dates');

const router = express.Router();

// Public config for the front-end (no secrets).
router.get('/config', (req, res) => {
  res.json({
    currency: process.env.CURRENCY || 'INR',
    mockPayments: rzp.MOCK,
    razorpayKeyId: rzp.KEY_ID || null,
    holdMinutes: svc.HOLD_MINUTES,
    provider: inventory.name,
    siteUrl: process.env.SITE_URL || '/',
    plans: pricing.PLANS.map((p) => ({ code: p.code, label: p.label })),
    includedAdults: pricing.INCLUDED_ADULTS_PER_ROOM
  });
});

function readOccupancy(src) {
  return {
    units: Math.max(1, parseInt(src.units || 1, 10)),
    adults: Math.max(1, parseInt(src.adults || 2, 10)),
    children5to12: Math.max(0, parseInt(src.children5to12 || 0, 10)),
    childrenUnder5: Math.max(0, parseInt(src.childrenUnder5 || 0, 10))
  };
}

function publicRoom(room) {
  return {
    id: room._id,
    slug: room.slug,
    name: room.name,
    description: room.description,
    maxOccupancy: room.max_occupancy,
    size: room.size_sqm,
    beds: room.bed_config,
    amenities: room.amenities || [],
    image: room.image_url,
    basePriceDisplay: (room.base_price / 100).toFixed(0)
  };
}

router.get('/rooms', async (req, res, next) => {
  try {
    const rooms = await inventory.listRoomTypes();
    res.json(rooms.map(publicRoom));
  } catch (e) { next(e); }
});

// Availability + per-plan pricing for a date range across all room types.
router.get('/availability', async (req, res, next) => {
  try {
    const { checkIn, checkOut } = req.query;
    if (!isValidDate(checkIn) || !isValidDate(checkOut) || checkOut <= checkIn) {
      return res.status(400).json({ error: 'Provide valid checkIn and checkOut (checkOut after checkIn).' });
    }
    const occ = readOccupancy(req.query);
    const roomDocs = await inventory.listRoomTypes();
    const rooms = await Promise.all(roomDocs.map(async (room) => {
      const available = await inventory.availableUnits(room._id, checkIn, checkOut);
      const fits = (occ.adults + occ.children5to12 + occ.childrenUnder5) <= room.max_occupancy * occ.units;
      const plans = await Promise.all(pricing.PLAN_CODES.map(async (code) => {
        const q = await pricing.computeQuote(room._id, code, occ, checkIn, checkOut);
        return { code, label: pricing.planLabel(code), total: q.total, totalDisplay: (q.total / 100).toFixed(0), nights: q.nights };
      }));
      return { ...publicRoom(room), available, fits, plans };
    }));
    res.json({ checkIn, checkOut, occupancy: occ, rooms });
  } catch (e) { next(e); }
});

// Create a pending booking + payment order.
router.post('/bookings', async (req, res, next) => {
  try {
    const { roomTypeId, checkIn, checkOut, plan, guest } = req.body || {};
    const occ = readOccupancy(req.body || {});
    const booking = await svc.createPending({
      roomTypeId: parseInt(roomTypeId, 10),
      checkIn, checkOut, plan,
      units: occ.units, adults: occ.adults,
      children5to12: occ.children5to12, childrenUnder5: occ.childrenUnder5,
      guest
    });

    const order = await rzp.createOrder({ amount: booking.total, receipt: booking.code, notes: { bookingCode: booking.code } });

    const payments = await col('payments');
    await payments.insertOne({
      booking_id: booking._id, provider: 'razorpay', order_id: order.id,
      amount: booking.total, status: 'created', signature_verified: false,
      created_at: new Date().toISOString()
    });

    res.status(201).json({
      bookingId: booking.id,
      code: booking.code,
      amount: booking.total,
      amountDisplay: (booking.total / 100).toFixed(0),
      currency: process.env.CURRENCY || 'INR',
      order,
      mockPayments: rzp.MOCK,
      razorpayKeyId: rzp.KEY_ID || null,
      holdMinutes: svc.HOLD_MINUTES
    });
  } catch (err) {
    if (err instanceof svc.BookingError) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

// Release a pending hold when the guest cancels Checkout or payment fails.
router.post('/bookings/:id/release', async (req, res, next) => {
  try {
    const released = await svc.releasePending(req.params.id);
    res.json({ released });
  } catch (e) { next(e); }
});

module.exports = router;
