'use strict';

const { MongoClient } = require('mongodb');

// mongodb+srv needs SRV DNS lookups. Some local networks' resolvers refuse these
// (querySrv ECONNREFUSED). Use reliable public DNS for SRV in non-production; on
// Vercel the platform resolver works, so we leave it alone. Override with DNS_SERVERS.
const dns = require('dns');
if (process.env.DNS_SERVERS) {
  dns.setServers(process.env.DNS_SERVERS.split(',').map((s) => s.trim()));
} else if (process.env.NODE_ENV !== 'production') {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
}

// Cache the connection across warm serverless invocations (Vercel reuses the
// process between requests, so we must not open a new pool every call).
let cached = global.__kdnMongo;
if (!cached) cached = global.__kdnMongo = { db: null, promise: null };

const DB_NAME = process.env.MONGODB_DB || 'kabana';

async function ensureSetup(db) {
  await Promise.all([
    db.collection('bookings').createIndex({ code: 1 }, { unique: true }),
    db.collection('bookings').createIndex({ room_type_id: 1, check_in: 1, check_out: 1 }),
    db.collection('bookings').createIndex({ status: 1 }),
    db.collection('rate_overrides').createIndex({ room_type_id: 1, date: 1 }, { unique: true }),
    db.collection('blocked_dates').createIndex({ room_type_id: 1, date: 1 }, { unique: true }),
    db.collection('date_inventory').createIndex({ room_type_id: 1, date: 1 }, { unique: true }),
    db.collection('payments').createIndex({ order_id: 1 })
  ]);

  const rooms = db.collection('room_types');
  if (await rooms.countDocuments() === 0) {
    await rooms.insertMany([
      {
        _id: 1, slug: 'tent', name: 'Tent',
        description: 'A cosy tent with a private entrance, seating area, and a balcony with garden and mountain views.',
        size_sqm: 15, bed_config: '1 large double bed',
        amenities: ['Balcony', 'Garden view', 'Mountain view', 'Patio', 'Free WiFi'],
        base_price: 400000, max_occupancy: 2, total_units: 3,
        images: ['/images/image1.webp', '/images/image3.webp', '/images/image8.webp', '/images/Cottages%20at%20Night1.webp'],
        image_url: '/images/image1.webp', cm_room_id: null, active: true
      },
      {
        _id: 2, slug: 'family-studio', name: 'Family Studio',
        description: 'An entire studio with a private entrance, a seating area, and a balcony with garden and mountain views. En-suite private bathroom with a bath.',
        size_sqm: 23, bed_config: '2 single beds & 1 double bed',
        amenities: ['Balcony', 'Garden view', 'Mountain view', 'Patio', 'Private bathroom', 'Free WiFi'],
        base_price: 750000, max_occupancy: 4, total_units: 9,
        images: ['/images/image2.webp', '/images/image4.webp', '/images/image5.webp', '/images/image6.webp'],
        image_url: '/images/image2.webp', cm_room_id: null, active: true
      }
    ]);
    console.log('[mongo] Seeded 2 room types (Tent, Family Studio).');
  }
}

async function getDb() {
  if (cached.db) return cached.db;
  if (!cached.promise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI is not set');
    cached.promise = MongoClient.connect(uri, { maxPoolSize: 5 }).then(async (client) => {
      const db = client.db(DB_NAME);
      await ensureSetup(db);
      cached.client = client;
      return db;
    });
  }
  cached.db = await cached.promise;
  return cached.db;
}

// Convenience: collection getters
const col = (name) => getDb().then((db) => db.collection(name));

module.exports = { getDb, col };
