# Kabana de Nature — Direct Booking System

A self-contained reservation engine + admin panel + Razorpay payments for the resort
website. Runs locally out of the box (SQLite + mock payments). Built so the production
pieces — a hosted Postgres (Supabase) and a real **channel-manager API** — drop in
without rewriting the app.

## ⚠️ Before going live
Right now inventory is **local only**. If you point real guests at this while the resort
is also selling on Booking.com / Agoda / MakeMyTrip / Goibibo, you will oversell.
**Implement `CMInventoryProvider` and set `INVENTORY_PROVIDER=cm` before taking live
public bookings.** Until then this is for development, demos, and internal testing.

## Quick start
```bash
cd booking-system
cp .env.example .env        # (Windows: copy .env.example .env)
npm install
npm start
```
- Booking page → http://localhost:4000/book.html
- Admin panel  → http://localhost:4000/admin/  (login from `.env`: `admin` / `changeme`)

With no Razorpay keys set, the app runs in **mock payment mode** — bookings confirm
instantly with no real charge, so you can test the full flow immediately.

## Enabling real (test) payments
1. Create a free Razorpay account → Dashboard → Settings → API Keys → generate **Test** keys.
2. Put `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in `.env`, restart.
3. For server-verified confirmation, add a webhook (Dashboard → Webhooks):
   - URL: `https://<your-host>/api/payments/webhook`
   - Event: `payment.captured`
   - Secret: set the same value in `RAZORPAY_WEBHOOK_SECRET`.

## Architecture
```
public/            guest booking page + admin SPA (vanilla JS)
src/
  server.js        Express app, sessions, static, webhook raw-body
  db.js            SQLite schema + seed (swap for Postgres/Supabase later)
  inventory/       InventoryProvider adapter:
    LocalInventoryProvider.js   SQLite is source of truth (now)
    CMInventoryProvider.js      STUB — implement against your channel-manager API
  services/        razorpay (mock-aware), bookingService (atomic), notify
  routes/          booking (public), payments, admin (auth-gated)
```

### Pricing model (from the Kabana De Nature tariff sheet)
Defined in [`src/pricing.js`](src/pricing.js) — the single source of truth:
- **Meal plans** per room/night: **CPAI** (breakfast) = room base price; **MAPAI** (+₹1,000) breakfast + lunch/dinner; **APAI** (+₹2,000) all meals.
- **Base occupancy** = 2 adults per room (set `INCLUDED_ADULTS_PER_ROOM`).
- **Extra occupancy** per person/night by plan: child <5 free; child 5–12 ₹1,200/1,500/1,800; 12+ ₹2,000/2,500/3,000.
- **No automatic weekend supplement** — add ₹1,000 (or any amount) to specific dates via the admin calendar's "Set price". Festive/holiday rates are calendar overrides too.
- A room's editable **base price = its CPAI rate**; MAPAI/APAI are derived. Per-date overrides in the calendar adjust the CPAI base; plan supplements still apply on top.
- **Prices are always recomputed server-side** in `computeQuote()` — the client total is never trusted.

### How overbooking is prevented (local mode)
`bookingService.createPending` runs inside a SQLite transaction that re-checks
availability for every night before inserting the hold, so two simultaneous requests
can't grab the same last room. Unpaid holds expire after `HOLD_MINUTES` and are swept
back into availability.

### Swapping in the real channel manager
Implement the six methods in `CMInventoryProvider.js` against your chosen CM
(SaasAro / AxisRooms / eZee / Channex). Then `INVENTORY_PROVIDER=cm`. `pushBooking()`
runs **after** payment is verified, so the CM decrements inventory across all OTAs only
for paid bookings. Nothing else in the app changes.

### Production data layer
`db.js` is the only file that talks to SQLite. To move to Supabase/Postgres, replace the
queries there (and in the small raw `db.prepare(...)` call sites in `routes/` and
`services/`) with a Postgres client — the API and front-end are unaffected.

## API summary
| Method | Path | Purpose |
|---|---|---|
| GET  | `/api/config` | public front-end config |
| GET  | `/api/availability?checkIn&checkOut` | availability + price per room |
| POST | `/api/bookings` | create pending booking + payment order |
| POST | `/api/payments/verify` | confirm from Checkout callback |
| POST | `/api/payments/webhook` | server-verified confirmation |
| POST | `/admin/api/login` · `/logout` · `/me` | admin auth |
| GET  | `/admin/api/bookings` · `/summary` · `/calendar` · `/rooms` | admin reads |
| POST | `/admin/api/bookings/:id/status` · `/block` · `/rate` · `/rooms/:id` | admin writes |
