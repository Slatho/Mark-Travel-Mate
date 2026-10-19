// backend/database/seed.js
// Seeds the database with real Gaborone routes, stops, buses, and demo data.
require('dotenv').config();
const db = require('./db');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

console.log('🌱 Seeding CRESCITA database...');

// ─── HELPERS ──────────────────────────────────────────────
const id = () => uuidv4();
const now = () => new Date().toISOString();
const future = (mins) => new Date(Date.now() + mins * 60000).toISOString();

// ─── USERS ────────────────────────────────────────────────
const hashedPwd = bcrypt.hashSync('Demo1234!', 10);
const adminPwd  = bcrypt.hashSync('Admin@CFS2026', 10);

const adminId    = id();
const op1UserId  = id();
const op2UserId  = id();
const passUserId = id();

db.prepare(`INSERT OR IGNORE INTO users (id,name,email,phone,password,role) VALUES (?,?,?,?,?,?)`).run(
  adminId, 'Mark Nkanokang', 'admin@crescitaforzasegno.com', '74109102', adminPwd, 'admin'
);
db.prepare(`INSERT OR IGNORE INTO users (id,name,email,phone,password,role) VALUES (?,?,?,?,?,?)`).run(
  op1UserId, 'Thato Molosiwa', 'thato@btctours.co.bw', '71234567', hashedPwd, 'operator'
);
db.prepare(`INSERT OR IGNORE INTO users (id,name,email,phone,password,role) VALUES (?,?,?,?,?,?)`).run(
  op2UserId, 'Rethabile Seabe', 'rethabile@turatours.co.bw', '77654321', hashedPwd, 'operator'
);
db.prepare(`INSERT OR IGNORE INTO users (id,name,email,phone,password,role) VALUES (?,?,?,?,?,?)`).run(
  passUserId, 'Demo Passenger', 'demo@crescitaforzasegno.com', '72480818', hashedPwd, 'passenger'
);

// ─── OPERATORS ────────────────────────────────────────────
const op1Id = id();
const op2Id = id();

db.prepare(`INSERT OR IGNORE INTO operators (id,user_id,company_name,license_no,verified) VALUES (?,?,?,?,?)`).run(
  op1Id, op1UserId, 'BTC Tours & Transfers', 'BOT-OPR-001-2024', 1
);
db.prepare(`INSERT OR IGNORE INTO operators (id,user_id,company_name,license_no,verified) VALUES (?,?,?,?,?)`).run(
  op2Id, op2UserId, 'Tura Travel Botswana', 'BOT-OPR-002-2024', 1
);

// ─── ROUTES ───────────────────────────────────────────────
// Real Gaborone coordinates
const routes = [
  {
    id: id(), name: 'CBD → Game City Express',
    origin: 'Gaborone Bus Rank', destination: 'Game City Mall',
    distance_km: 8.2, duration_min: 25, fare_bwp: 8.00,
    stops: [
      { name: 'Gaborone Bus Rank',   order: 1, lat: -24.6535, lng: 25.9077, fare: 0.00 },
      { name: 'Main Mall',           order: 2, lat: -24.6479, lng: 25.9112, fare: 2.50 },
      { name: 'Masa Square',         order: 3, lat: -24.6504, lng: 25.9148, fare: 3.00 },
      { name: 'Rail Park Mall',      order: 4, lat: -24.6489, lng: 25.9234, fare: 5.00 },
      { name: 'Game City Mall',      order: 5, lat: -24.6162, lng: 25.8978, fare: 8.00 },
    ]
  },
  {
    id: id(), name: 'CBD → Riverwalk Express',
    origin: 'Gaborone Bus Rank', destination: 'Riverwalk Mall',
    distance_km: 5.4, duration_min: 18, fare_bwp: 6.50,
    stops: [
      { name: 'Gaborone Bus Rank',   order: 1, lat: -24.6535, lng: 25.9077, fare: 0.00 },
      { name: 'Main Mall',           order: 2, lat: -24.6479, lng: 25.9112, fare: 2.00 },
      { name: 'Riverwalk Mall',      order: 3, lat: -24.6345, lng: 25.9067, fare: 6.50 },
    ]
  },
  {
    id: id(), name: 'CBD → Airport Shuttle',
    origin: 'Gaborone Bus Rank', destination: 'Sir Seretse Khama Airport',
    distance_km: 14.6, duration_min: 35, fare_bwp: 25.00,
    stops: [
      { name: 'Gaborone Bus Rank',   order: 1, lat: -24.6535, lng: 25.9077, fare: 0.00 },
      { name: 'University of Botswana', order: 2, lat: -24.6558, lng: 25.9316, fare: 5.00 },
      { name: 'Broadhurst Mall',     order: 3, lat: -24.6133, lng: 25.9213, fare: 10.00 },
      { name: 'Airport Terminal',    order: 4, lat: -24.5551, lng: 25.9182, fare: 25.00 },
    ]
  },
  {
    id: id(), name: 'CBD → Molapo Loop',
    origin: 'Gaborone Bus Rank', destination: 'Molapo Crossing',
    distance_km: 6.1, duration_min: 22, fare_bwp: 7.00,
    stops: [
      { name: 'Gaborone Bus Rank',   order: 1, lat: -24.6535, lng: 25.9077, fare: 0.00 },
      { name: 'Village',             order: 2, lat: -24.6612, lng: 25.9043, fare: 2.50 },
      { name: 'Tlokweng Road',       order: 3, lat: -24.6681, lng: 25.9012, fare: 4.00 },
      { name: 'Molapo Crossing',     order: 4, lat: -24.6706, lng: 25.8956, fare: 7.00 },
    ]
  },
  {
    id: id(), name: 'Airport → Rail Park Express',
    origin: 'Sir Seretse Khama Airport', destination: 'Rail Park Mall',
    distance_km: 13.8, duration_min: 30, fare_bwp: 22.00,
    stops: [
      { name: 'Airport Terminal',    order: 1, lat: -24.5551, lng: 25.9182, fare: 0.00 },
      { name: 'Broadhurst Mall',     order: 2, lat: -24.6133, lng: 25.9213, fare: 8.00 },
      { name: 'Rail Park Mall',      order: 3, lat: -24.6489, lng: 25.9234, fare: 22.00 },
    ]
  }
];

const routeIds = [];
routes.forEach(r => {
  routeIds.push(r.id);
  db.prepare(`INSERT OR IGNORE INTO routes (id,name,origin,destination,distance_km,duration_min,fare_bwp) VALUES (?,?,?,?,?,?,?)`).run(
    r.id, r.name, r.origin, r.destination, r.distance_km, r.duration_min, r.fare_bwp
  );
  r.stops.forEach(s => {
    db.prepare(`INSERT OR IGNORE INTO route_stops (id,route_id,stop_name,stop_order,lat,lng,fare_from_origin) VALUES (?,?,?,?,?,?,?)`).run(
      id(), r.id, s.name, s.order, s.lat, s.lng, s.fare
    );
  });
});

// ─── BUSES ────────────────────────────────────────────────
const busData = [
  { op: op1Id, plate: 'B101CTM', model: 'Toyota Coaster 30-Seater', capacity: 30, type: 'standard',  amenities: ['AC','USB Charging','WiFi'] },
  { op: op1Id, plate: 'B102CTM', model: 'Toyota Coaster 30-Seater', capacity: 30, type: 'standard',  amenities: ['AC','USB Charging'] },
  { op: op1Id, plate: 'B201LUX', model: 'Mercedes Sprinter Luxury',  capacity: 18, type: 'luxury',   amenities: ['AC','USB Charging','WiFi','Reclining Seats','Snacks'] },
  { op: op2Id, plate: 'T301TUR', model: 'Toyota HiAce Combi',        capacity: 15, type: 'combi',    amenities: ['AC'] },
  { op: op2Id, plate: 'T302TUR', model: 'Toyota HiAce Combi',        capacity: 15, type: 'combi',    amenities: ['AC'] },
  { op: op2Id, plate: 'T401EXP', model: 'Isuzu NPR City Bus',        capacity: 45, type: 'standard', amenities: ['AC','USB Charging','WiFi','CCTV'] },
];

const busIds = [];
busData.forEach(b => {
  const bid = id();
  busIds.push(bid);
  db.prepare(`INSERT OR IGNORE INTO buses (id,operator_id,plate_no,model,capacity,total_seats,bus_type,amenities) VALUES (?,?,?,?,?,?,?,?)`).run(
    bid, b.op, b.plate, b.model, b.capacity, b.capacity, b.type, JSON.stringify(b.amenities)
  );

  // Generate seats based on bus type
  const rows = b.type === 'combi' ? 5 : (b.type === 'luxury' ? 6 : Math.ceil(b.capacity / 4));
  const cols = b.type === 'combi' ? 3 : (b.type === 'luxury' ? 3 : 4);
  let seatNum = 1;
  for (let r = 1; r <= rows && seatNum <= b.capacity; r++) {
    for (let c = 1; c <= cols && seatNum <= b.capacity; c++) {
      const cls = (b.type === 'luxury' && r <= 2) ? 'premium' : 'standard';
      db.prepare(`INSERT OR IGNORE INTO seats (id,bus_id,seat_no,seat_row,seat_col,seat_class) VALUES (?,?,?,?,?,?)`).run(
        id(), bid, String(seatNum).padStart(2,'0'), r, c, cls
      );
      seatNum++;
    }
  }
});

// ─── TRIPS (Next 2 hours of departures) ───────────────────
const tripCombos = [
  { busIdx: 0, routeIdx: 0 }, { busIdx: 1, routeIdx: 1 },
  { busIdx: 5, routeIdx: 0 }, { busIdx: 2, routeIdx: 2 },
  { busIdx: 3, routeIdx: 3 }, { busIdx: 4, routeIdx: 3 },
  { busIdx: 5, routeIdx: 4 }, { busIdx: 0, routeIdx: 1 },
];

const tripIds = [];
tripCombos.forEach((combo, i) => {
  const route = routes[combo.routeIdx];
  const busId = busIds[combo.busIdx];
  const depart = new Date(Date.now() + (i * 15 + 5) * 60000);
  const arrive = new Date(depart.getTime() + route.duration_min * 60000);
  const firstStop = route.stops[0];
  const tid = id();
  tripIds.push(tid);
  db.prepare(`INSERT OR IGNORE INTO trips (id,bus_id,route_id,departure_time,arrival_time,status,current_lat,current_lng,current_stop) VALUES (?,?,?,?,?,?,?,?,?)`).run(
    tid, busId, route.id,
    depart.toISOString(), arrive.toISOString(),
    i === 0 ? 'boarding' : 'scheduled',
    firstStop.lat, firstStop.lng, 1
  );
});

// ─── DEMO BOOKING ─────────────────────────────────────────
const demoBookingId = id();
db.prepare(`INSERT OR IGNORE INTO bookings (id,user_id,trip_id,seats,total_bwp,status,qr_code) VALUES (?,?,?,?,?,?,?)`).run(
  demoBookingId, passUserId, tripIds[0],
  JSON.stringify(['01','02']), 16.00, 'confirmed',
  `CTM-${demoBookingId.slice(0,8).toUpperCase()}`
);

db.prepare(`INSERT OR IGNORE INTO payments (id,booking_id,user_id,amount_bwp,method,status,paid_at) VALUES (?,?,?,?,?,?,?)`).run(
  id(), demoBookingId, passUserId, 16.00, 'orange_money', 'completed', now()
);

console.log('✅ Database seeded successfully!');
console.log('\n📋 Demo credentials:');
console.log('   Passenger: demo@crescitaforzasegno.com / Demo1234!');
console.log('   Operator:  thato@btctours.co.bw / Demo1234!');
console.log('   Admin:     admin@crescitaforzasegno.com / Admin@CFS2026');
