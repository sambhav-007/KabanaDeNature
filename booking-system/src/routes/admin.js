'use strict';

const express = require('express');
const { col } = require('../mongo');
const inventory = require('../inventory');
const svc = require('../services/bookingService');
const { requireAdmin } = require('../middleware/auth');
const { sign, COOKIE } = require('../auth');
const { eachNight, isValidDate } = require('../util/dates');

const router = express.Router();
const PROD = process.env.NODE_ENV === 'production';

// ── Auth ───────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === (process.env.ADMIN_USER || 'admin') &&
      password === (process.env.ADMIN_PASSWORD || 'changeme')) {
    const token = sign({ admin: true, u: username, exp: Date.now() + 8 * 3600 * 1000 });
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: 8 * 3600 * 1000 });
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

router.post('/logout', (req, res) => { res.clearCookie(COOKIE); res.json({ ok: true }); });
router.get('/me', (req, res) => {
  const { verify, parseCookies, COOKIE: C } = require('../auth');
  const p = verify(parseCookies(req)[C]);
  res.json({ admin: p && p.admin ? { username: p.u } : null });
});

// ── Authenticated ──────────────────────────────────────
router.use(requireAdmin);

router.get('/bookings', async (req, res, next) => {
  try {
    const { status } = req.query;
    const query = status ? { status } : {};
    const bookings = await (await col('bookings')).find(query).sort({ created_at: -1 }).limit(500).toArray();
    const roomDocs = await inventory.listRoomTypes();
    const roomName = Object.fromEntries(roomDocs.map((r) => [r._id, r.name]));
    res.json(bookings.map((b) => ({
      id: b._id.toString(),
      code: b.code,
      guest_name: b.guest ? b.guest.name : '',
      guest_phone: b.guest ? b.guest.phone : '',
      guest_email: b.guest ? b.guest.email : '',
      room_name: roomName[b.room_type_id] || ('#' + b.room_type_id),
      plan: b.plan, adults: b.adults, children: b.children, children_free: b.children_free,
      check_in: b.check_in, check_out: b.check_out, nights: b.nights, units: b.units,
      total: b.total, status: b.status
    })));
  } catch (e) { next(e); }
});

router.post('/bookings/:id/status', async (req, res, next) => {
  try {
    const allowed = ['confirmed', 'cancelled', 'checked_in', 'checked_out'];
    const { status } = req.body || {};
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const updated = await svc.setStatus(req.params.id, status);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch (e) { next(e); }
});

router.get('/calendar', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    if (!isValidDate(from) || !isValidDate(to) || to <= from) {
      return res.status(400).json({ error: 'Provide valid from/to dates' });
    }
    const nights = eachNight(from, to);
    const roomDocs = await inventory.listRoomTypes();
    const rooms = await Promise.all(roomDocs.map(async (room) => ({
      id: room._id,
      name: room.name,
      totalUnits: room.total_units,
      days: await Promise.all(nights.map(async (date) => {
        const info = await inventory.dayInfo(room._id, date);
        return { date, available: info.available, capacity: info.capacity, booked: info.booked, blocked: info.blocked, price: (info.price / 100).toFixed(0) };
      }))
    })));
    res.json({ from, to, days: nights, rooms });
  } catch (e) { next(e); }
});

// Bulk-update many cells. body: { cells:[{roomTypeId,date}], setUnits?, setPrice?, blocked? }
router.post('/calendar/bulk', async (req, res, next) => {
  try {
    const { cells, setUnits, setPrice, blocked } = req.body || {};
    if (!Array.isArray(cells) || cells.length === 0) return res.status(400).json({ error: 'No cells selected' });

    const dateInv = await col('date_inventory');
    const rates = await col('rate_overrides');
    const blocks = await col('blocked_dates');

    for (const c of cells) {
      const rt = parseInt(c.roomTypeId, 10);
      const date = c.date;
      if (!Number.isInteger(rt) || !isValidDate(date)) continue;
      const key = { room_type_id: rt, date };

      if (setUnits !== undefined) {
        if (setUnits === '' || setUnits === null) await dateInv.deleteOne(key);
        else await dateInv.updateOne(key, { $set: { units: Math.max(0, parseInt(setUnits, 10)) } }, { upsert: true });
      }
      if (setPrice !== undefined) {
        if (setPrice === '' || setPrice === null) await rates.deleteOne(key);
        else await rates.updateOne(key, { $set: { price: Math.round(parseFloat(setPrice) * 100) } }, { upsert: true });
      }
      if (blocked !== undefined) {
        if (blocked) await blocks.updateOne(key, { $set: { reason: 'Closed via calendar' } }, { upsert: true });
        else await blocks.deleteOne(key);
      }
    }
    res.json({ ok: true, updated: cells.length });
  } catch (e) { next(e); }
});

router.get('/rooms', async (req, res, next) => {
  try {
    const rooms = await inventory.listRoomTypes();
    res.json(rooms.map((r) => ({ id: r._id, name: r.name, base_price: r.base_price, total_units: r.total_units })));
  } catch (e) { next(e); }
});

router.post('/rooms/:id', async (req, res, next) => {
  try {
    const { base_price, total_units } = req.body || {};
    const set = {};
    if (base_price != null) set.base_price = Math.round(base_price * 100);
    if (total_units != null) set.total_units = parseInt(total_units, 10);
    if (Object.keys(set).length) {
      await (await col('room_types')).updateOne({ _id: parseInt(req.params.id, 10) }, { $set: set });
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/summary', async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const bookings = await col('bookings');
    const [arrivalsToday, departuresToday, pending, confirmedUpcoming, revAgg] = await Promise.all([
      bookings.countDocuments({ check_in: today, status: { $in: ['confirmed', 'checked_in'] } }),
      bookings.countDocuments({ check_out: today, status: { $in: ['confirmed', 'checked_in', 'checked_out'] } }),
      bookings.countDocuments({ status: 'pending' }),
      bookings.countDocuments({ status: 'confirmed', check_out: { $gte: today } }),
      bookings.aggregate([
        { $match: { status: { $in: ['confirmed', 'checked_in', 'checked_out'] } } },
        { $group: { _id: null, s: { $sum: '$total' } } }
      ]).toArray()
    ]);
    res.json({
      arrivalsToday, departuresToday, pending, confirmedUpcoming,
      revenueConfirmed: revAgg.length ? revAgg[0].s : 0
    });
  } catch (e) { next(e); }
});

module.exports = router;
