'use strict';

const express = require('express');
const { col } = require('../mongo');
const rzp = require('../services/razorpay');
const svc = require('../services/bookingService');
const notify = require('../services/notify');

const router = express.Router();

async function markPaid(orderId, paymentId, raw) {
  const payments = await col('payments');
  await payments.updateOne(
    { order_id: orderId },
    { $set: { payment_id: paymentId, status: 'paid', signature_verified: true, raw } }
  );
}

async function finalize(booking) {
  const confirmed = await svc.confirmBooking(booking);
  const rooms = await col('room_types');
  const room = await rooms.findOne({ _id: confirmed.room_type_id });
  notify.bookingConfirmed(confirmed, confirmed.guest, room || { name: 'Room' });
  return confirmed;
}

// Browser success callback from Razorpay Checkout.
router.post('/verify', async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, bookingId } = req.body || {};
    const booking = await svc.getBooking(bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.status === 'confirmed') return res.json({ status: 'confirmed', code: booking.code });

    const ok = rzp.verifyPaymentSignature({ orderId: razorpay_order_id, paymentId: razorpay_payment_id, signature: razorpay_signature });
    if (!ok) return res.status(400).json({ error: 'Payment signature verification failed' });

    await markPaid(razorpay_order_id, razorpay_payment_id || 'mock', JSON.stringify(req.body));
    const confirmed = await finalize(booking);
    res.json({ status: 'confirmed', code: confirmed.code });
  } catch (e) { next(e); }
});

// Server-to-server webhook (authoritative confirmation in production).
router.post('/webhook', async (req, res, next) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const raw = req.rawBody || JSON.stringify(req.body);
    if (!rzp.verifyWebhookSignature(raw, signature)) {
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }
    const event = req.body;
    const entity = event && event.payload && event.payload.payment && event.payload.payment.entity;
    if (event && event.event === 'payment.captured' && entity) {
      const payments = await col('payments');
      const payment = await payments.findOne({ order_id: entity.order_id });
      if (payment) {
        await markPaid(entity.order_id, entity.id, JSON.stringify(event));
        const booking = await svc.getBooking(payment.booking_id);
        if (booking && booking.status !== 'confirmed') await finalize(booking);
      }
    }
    res.json({ received: true });
  } catch (e) { next(e); }
});

module.exports = router;
