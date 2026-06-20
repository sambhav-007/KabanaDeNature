'use strict';

const crypto = require('crypto');

const KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';
const MOCK = !KEY_ID || !KEY_SECRET;

let client = null;
if (!MOCK) {
  const Razorpay = require('razorpay');
  client = new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });
}

if (MOCK) {
  console.warn('[razorpay] MOCK PAYMENT MODE — no real Razorpay keys set. Payments are simulated.');
}

async function createOrder({ amount, receipt, notes }) {
  if (MOCK) {
    return {
      id: 'order_mock_' + crypto.randomBytes(8).toString('hex'),
      amount,
      currency: process.env.CURRENCY || 'INR',
      receipt,
      status: 'created',
      mock: true
    };
  }
  return client.orders.create({
    amount,
    currency: process.env.CURRENCY || 'INR',
    receipt,
    notes: notes || {}
  });
}

// Verify the Checkout handler signature: HMAC_SHA256(order_id|payment_id, key_secret)
function verifyPaymentSignature({ orderId, paymentId, signature }) {
  if (MOCK) return signature === 'mock';
  const expected = crypto
    .createHmac('sha256', KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return safeEqual(expected, signature);
}

// Verify the webhook signature: HMAC_SHA256(rawBody, webhook_secret)
function verifyWebhookSignature(rawBody, signature) {
  if (!WEBHOOK_SECRET) return false;
  const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

module.exports = {
  MOCK,
  KEY_ID,
  createOrder,
  verifyPaymentSignature,
  verifyWebhookSignature
};
