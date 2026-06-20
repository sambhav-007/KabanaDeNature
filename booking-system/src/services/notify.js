'use strict';

// Placeholder notifications. Swap the bodies for real email (SMTP/Resend) and
// WhatsApp Business Cloud API calls when ready — the call sites stay the same.

function bookingConfirmed(booking, guest, room) {
  const rupees = (booking.total / 100).toFixed(2);
  console.log(
    `[notify] ✅ Booking ${booking.code} CONFIRMED — ${guest.name} (${guest.phone || guest.email}) · ` +
    `${room.name} · ${booking.check_in}→${booking.check_out} · ₹${rupees}`
  );
  // TODO: send guest email + WhatsApp confirmation here.
}

module.exports = { bookingConfirmed };
