// Vercel serverless entry. All /api/* requests are routed here (see vercel.json),
// and handled by the Express app. Static files (site, booking page, admin) are
// served directly by Vercel's filesystem handler.
module.exports = require('../booking-system/src/app');
