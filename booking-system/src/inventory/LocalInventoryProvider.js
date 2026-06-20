'use strict';

const { getDb } = require('../mongo');
const { eachNight } = require('../util/dates');

/**
 * MongoDB-backed inventory provider (the default "db" provider).
 * All methods are async. Availability counts confirmed/checked-in/out bookings
 * plus still-valid pending holds, so expired holds free up automatically with
 * no background sweeper (important for serverless).
 */

const ACTIVE = ['confirmed', 'checked_in', 'checked_out'];

async function listRoomTypes() {
  const db = await getDb();
  return db.collection('room_types').find({ active: true }).sort({ base_price: 1 }).toArray();
}

async function getRoom(roomTypeId) {
  const db = await getDb();
  return db.collection('room_types').findOne({ _id: roomTypeId });
}

// CPAI base price for a date: per-date override, else the room's base.
async function nightlyPrice(roomTypeId, date) {
  const db = await getDb();
  const ov = await db.collection('rate_overrides').findOne({ room_type_id: roomTypeId, date });
  if (ov) return ov.price;
  const room = await db.collection('room_types').findOne({ _id: roomTypeId }, { projection: { base_price: 1 } });
  return room ? room.base_price : 0;
}

// Rooms sellable on a date: per-date allotment override, else room default.
async function capacityFor(db, room, date) {
  const inv = await db.collection('date_inventory').findOne({ room_type_id: room._id, date });
  return inv ? inv.units : room.total_units;
}

async function occupiedUnits(db, roomTypeId, date) {
  const nowIso = new Date().toISOString();
  const agg = await db.collection('bookings').aggregate([
    {
      $match: {
        room_type_id: roomTypeId,
        check_in: { $lte: date },
        check_out: { $gt: date },
        $or: [
          { status: { $in: ACTIVE } },
          { status: 'pending', hold_expires_at: { $gt: nowIso } }
        ]
      }
    },
    { $group: { _id: null, n: { $sum: '$units' } } }
  ]).toArray();
  return agg.length ? agg[0].n : 0;
}

async function availableUnits(roomTypeId, checkIn, checkOut) {
  const db = await getDb();
  const room = await db.collection('room_types').findOne({ _id: roomTypeId });
  if (!room) return 0;
  let minAvail = Infinity;
  for (const night of eachNight(checkIn, checkOut)) {
    const blocked = await db.collection('blocked_dates').findOne({ room_type_id: roomTypeId, date: night });
    if (blocked) return 0;
    const cap = await capacityFor(db, room, night);
    const occ = await occupiedUnits(db, roomTypeId, night);
    minAvail = Math.min(minAvail, cap - occ);
    if (minAvail <= 0) return 0;
  }
  return minAvail === Infinity ? 0 : Math.max(0, minAvail);
}

// Per-day snapshot for the admin calendar.
async function dayInfo(roomTypeId, date) {
  const db = await getDb();
  const room = await db.collection('room_types').findOne({ _id: roomTypeId });
  if (!room) return { capacity: 0, booked: 0, available: 0, blocked: false, price: 0 };
  const blocked = !!(await db.collection('blocked_dates').findOne({ room_type_id: roomTypeId, date }));
  const capacity = await capacityFor(db, room, date);
  const booked = await occupiedUnits(db, roomTypeId, date);
  const price = await nightlyPrice(roomTypeId, date);
  return { capacity, booked, available: blocked ? 0 : Math.max(0, capacity - booked), blocked, price };
}

// In db mode the booking already lives in our DB; nothing to push externally.
async function pushBooking() { return null; }
async function cancelBooking() { return null; }

module.exports = {
  name: 'mongo',
  listRoomTypes,
  getRoom,
  nightlyPrice,
  availableUnits,
  dayInfo,
  pushBooking,
  cancelBooking
};
