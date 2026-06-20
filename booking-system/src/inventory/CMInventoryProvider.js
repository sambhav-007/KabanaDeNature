'use strict';

/**
 * CMInventoryProvider — STUB.
 *
 * When you choose a channel-manager API (SaasAro / AxisRooms / eZee / Channex...),
 * implement these methods against its REST API. The rest of the app does not change:
 * server.js picks the provider via INVENTORY_PROVIDER=cm and everything else is identical.
 *
 * The channel manager becomes the single source of truth for availability/rates,
 * and pushBooking() decrements inventory across Booking.com / Agoda / Go-MMT automatically.
 *
 * Required env: CM_API_BASE, CM_API_KEY
 *
 * Implement:
 *   listRoomTypes()                                -> [{ id, name, ... }]  (map cm_room_id)
 *   nightlyPrice(roomTypeId, date)                 -> paise
 *   availableUnits(roomTypeId, checkIn, checkOut)  -> integer
 *   quote(roomTypeId, checkIn, checkOut)           -> { available, total, nights, perNight[] }
 *   pushBooking(booking)                           -> external CM booking id   (after payment)
 *   cancelBooking(booking)
 */

const notImplemented = (m) => () => {
  throw new Error(`CMInventoryProvider.${m}() not implemented yet. ` +
    `Pick a channel-manager API and implement this adapter, then set INVENTORY_PROVIDER=cm.`);
};

module.exports = {
  name: 'cm',
  listRoomTypes: notImplemented('listRoomTypes'),
  nightlyPrice: notImplemented('nightlyPrice'),
  availableUnits: notImplemented('availableUnits'),
  quote: notImplemented('quote'),
  pushBooking: notImplemented('pushBooking'),
  cancelBooking: notImplemented('cancelBooking')
};
