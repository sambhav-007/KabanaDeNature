'use strict';

const crypto = require('crypto');
const { ObjectId } = require('mongodb');
const { getDb } = require('../mongo');
const inventory = require('../inventory');
const pricing = require('../pricing');
const { isValidDate, diffNights, today } = require('../util/dates');

const HOLD_MINUTES = parseInt(process.env.HOLD_MINUTES || '15', 10);

function genCode() {
  return 'KDN-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

class BookingError extends Error {
  constructor(message, code = 400) { super(message); this.statusCode = code; }
}

function oid(id) {
  try { return new ObjectId(String(id)); } catch { return null; }
}

/**
 * Create a PENDING booking that holds inventory until paid (or the hold expires).
 * MongoDB M0 has no easy row-locking, so we use an optimistic guard: insert the
 * hold, then re-check availability — if we oversold, delete it and fail. The
 * window is tiny and concurrency at a single small resort is low.
 */
async function createPending({ roomTypeId, checkIn, checkOut, units, plan, adults, children5to12, childrenUnder5, guest }) {
  const db = await getDb();
  const room = await db.collection('room_types').findOne({ _id: roomTypeId, active: true });
  if (!room) throw new BookingError('Room type not found', 404);

  if (!isValidDate(checkIn) || !isValidDate(checkOut)) throw new BookingError('Invalid dates');
  if (checkOut <= checkIn) throw new BookingError('Check-out must be after check-in');
  if (checkIn < today()) throw new BookingError('Check-in cannot be in the past');

  const nights = diffNights(checkIn, checkOut);
  units = Math.max(1, parseInt(units || 1, 10));
  plan = pricing.PLAN_CODES.includes(plan) ? plan : 'CPAI';
  adults = Math.max(1, parseInt(adults || 2, 10));
  children5to12 = Math.max(0, parseInt(children5to12 || 0, 10));
  childrenUnder5 = Math.max(0, parseInt(childrenUnder5 || 0, 10));

  const headcount = adults + children5to12 + childrenUnder5;
  if (headcount > room.max_occupancy * units) {
    throw new BookingError(`Up to ${room.max_occupancy} guest(s) per room — please add more rooms`, 400);
  }

  if (!guest || !guest.name || !(guest.phone || guest.email)) {
    throw new BookingError('Guest name and a phone or email are required');
  }

  const avail = await inventory.availableUnits(roomTypeId, checkIn, checkOut);
  if (avail < units) throw new BookingError('Not enough availability for the selected dates', 409);

  const q = await pricing.computeQuote(roomTypeId, plan, { units, adults, children5to12, childrenUnder5 }, checkIn, checkOut);

  const doc = {
    code: genCode(),
    room_type_id: roomTypeId,
    guest: { name: guest.name, email: guest.email || null, phone: guest.phone || null },
    check_in: checkIn, check_out: checkOut, nights, units,
    plan, adults, children: children5to12, children_free: childrenUnder5,
    total: q.total,
    status: 'pending', source: 'website',
    hold_expires_at: new Date(Date.now() + HOLD_MINUTES * 60000).toISOString(),
    cm_booking_id: null,
    created_at: new Date().toISOString()
  };
  const { insertedId } = await db.collection('bookings').insertOne(doc);

  // Optimistic oversell guard: re-check now that our hold is counted.
  const stillOk = await inventory.availableUnits(roomTypeId, checkIn, checkOut);
  if (stillOk < 0) {
    await db.collection('bookings').deleteOne({ _id: insertedId });
    throw new BookingError('Those dates just sold out — please try again', 409);
  }

  return { ...doc, _id: insertedId, id: insertedId.toString() };
}

async function getBooking(id) {
  const db = await getDb();
  const _id = oid(id);
  if (!_id) return null;
  const b = await db.collection('bookings').findOne({ _id });
  return b ? { ...b, id: b._id.toString() } : null;
}

async function confirmBooking(booking) {
  const db = await getDb();
  let cmId = null;
  try { cmId = await inventory.pushBooking(booking); }
  catch (e) { console.error('[booking] pushBooking failed:', e.message); }
  await db.collection('bookings').updateOne(
    { _id: booking._id },
    { $set: { status: 'confirmed', cm_booking_id: cmId, hold_expires_at: null } }
  );
  return getBooking(booking._id);
}

async function setStatus(id, status) {
  const db = await getDb();
  const _id = oid(id);
  if (!_id) return null;
  await db.collection('bookings').updateOne({ _id }, { $set: { status } });
  return getBooking(_id);
}

// Release a still-pending hold (guest cancelled / payment failed). Never touches paid bookings.
async function releasePending(id) {
  const db = await getDb();
  const _id = oid(id);
  if (!_id) return false;
  const res = await db.collection('bookings').updateOne(
    { _id, status: 'pending' },
    { $set: { status: 'cancelled', hold_expires_at: null } }
  );
  return res.modifiedCount > 0;
}

module.exports = {
  BookingError,
  HOLD_MINUTES,
  createPending,
  getBooking,
  confirmBooking,
  setStatus,
  releasePending
};
