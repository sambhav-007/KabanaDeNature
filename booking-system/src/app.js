'use strict';

const path = require('path');
// Load local .env (booking-system/.env) for dev; on Vercel, env comes from the dashboard.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');

const app = express();

// Capture raw body for Razorpay webhook signature verification.
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); } }));
app.use(express.urlencoded({ extended: false }));

// API (the only thing the Vercel function handles; static is served by the platform).
app.use('/api', require('./routes/booking'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/admin', require('./routes/admin'));

app.get('/health', (_req, res) => res.json({ ok: true }));

// Static files (used in local dev; on Vercel these are served directly by the CDN).
// Repo root holds index.html, book.html, booking.css, booking.js, /admin, /images, /vids.
app.use(express.static(path.join(__dirname, '..', '..')));

// Error handler
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
