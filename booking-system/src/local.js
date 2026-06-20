'use strict';

// Local development entry point. On Vercel, api/index.js imports app.js directly.
const app = require('./app');
const PORT = parseInt(process.env.PORT || '4000', 10);

app.listen(PORT, () => {
  console.log(`\n  Kabana booking system → http://localhost:${PORT}`);
  console.log(`  Site          → http://localhost:${PORT}/`);
  console.log(`  Booking page  → http://localhost:${PORT}/book.html`);
  console.log(`  Admin panel   → http://localhost:${PORT}/admin/\n`);
});
