// backend/database/db.js
const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'crescita.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── SCHEMA ───────────────────────────────────────────────────────────────────

db.exec(`
  -- Users (passengers and operators)
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT UNIQUE NOT NULL,
    phone       TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'passenger' CHECK(role IN ('passenger','operator','admin')),
    avatar_url  TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Operators (bus companies)
  CREATE TABLE IF NOT EXISTS operators (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id),
    company_name  TEXT NOT NULL,
    license_no    TEXT UNIQUE NOT NULL,
    verified      INTEGER DEFAULT 0,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Routes (e.g. Bus Rank → Game City)
  CREATE TABLE IF NOT EXISTS routes (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    origin        TEXT NOT NULL,
    destination   TEXT NOT NULL,
    distance_km   REAL NOT NULL,
    duration_min  INTEGER NOT NULL,
    fare_bwp      REAL NOT NULL,
    active        INTEGER DEFAULT 1,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Route stops (waypoints for a route)
  CREATE TABLE IF NOT EXISTS route_stops (
    id          TEXT PRIMARY KEY,
    route_id    TEXT NOT NULL REFERENCES routes(id),
    stop_name   TEXT NOT NULL,
    stop_order  INTEGER NOT NULL,
    lat         REAL NOT NULL,
    lng         REAL NOT NULL,
    fare_from_origin REAL NOT NULL DEFAULT 0
  );

  -- Buses
  CREATE TABLE IF NOT EXISTS buses (
    id            TEXT PRIMARY KEY,
    operator_id   TEXT NOT NULL REFERENCES operators(id),
    plate_no      TEXT UNIQUE NOT NULL,
    model         TEXT NOT NULL,
    capacity      INTEGER NOT NULL,
    total_seats   INTEGER NOT NULL,
    bus_type      TEXT NOT NULL DEFAULT 'standard' CHECK(bus_type IN ('combi','standard','luxury')),
    amenities     TEXT, -- JSON array
    active        INTEGER DEFAULT 1,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Seat layout per bus
  CREATE TABLE IF NOT EXISTS seats (
    id          TEXT PRIMARY KEY,
    bus_id      TEXT NOT NULL REFERENCES buses(id),
    seat_no     TEXT NOT NULL,
    seat_row    INTEGER NOT NULL,
    seat_col    INTEGER NOT NULL,
    seat_class  TEXT NOT NULL DEFAULT 'standard' CHECK(seat_class IN ('standard','premium')),
    UNIQUE(bus_id, seat_no)
  );

  -- Scheduled trips
  CREATE TABLE IF NOT EXISTS trips (
    id              TEXT PRIMARY KEY,
    bus_id          TEXT NOT NULL REFERENCES buses(id),
    route_id        TEXT NOT NULL REFERENCES routes(id),
    departure_time  DATETIME NOT NULL,
    arrival_time    DATETIME NOT NULL,
    status          TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','boarding','in_transit','completed','cancelled')),
    current_lat     REAL,
    current_lng     REAL,
    current_stop    INTEGER DEFAULT 0,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Bookings
  CREATE TABLE IF NOT EXISTS bookings (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id),
    trip_id         TEXT NOT NULL REFERENCES trips(id),
    seats           TEXT NOT NULL, -- JSON array of seat IDs
    total_bwp       REAL NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','cancelled','completed')),
    qr_code         TEXT,
    booked_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Payments
  CREATE TABLE IF NOT EXISTS payments (
    id                  TEXT PRIMARY KEY,
    booking_id          TEXT NOT NULL REFERENCES bookings(id),
    user_id             TEXT NOT NULL REFERENCES users(id),
    amount_bwp          REAL NOT NULL,
    currency            TEXT DEFAULT 'BWP',
    method              TEXT NOT NULL CHECK(method IN ('card','orange_money','myzaka','smega')),
    provider_ref        TEXT, -- Stripe payment intent ID or mobile money ref
    status              TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','completed','failed','refunded')),
    mobile_number       TEXT, -- for mobile money
    stripe_client_secret TEXT,
    paid_at             DATETIME,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Waitlist / early access signups
  CREATE TABLE IF NOT EXISTS waitlist (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT,
    phone       TEXT NOT NULL,
    role        TEXT DEFAULT 'passenger' CHECK(role IN ('passenger','operator')),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Operator analytics snapshots (cached daily)
  CREATE TABLE IF NOT EXISTS analytics_snapshots (
    id              TEXT PRIMARY KEY,
    operator_id     TEXT NOT NULL REFERENCES operators(id),
    snapshot_date   DATE NOT NULL,
    total_trips     INTEGER DEFAULT 0,
    total_bookings  INTEGER DEFAULT 0,
    total_revenue   REAL DEFAULT 0,
    avg_occupancy   REAL DEFAULT 0,
    top_route       TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(operator_id, snapshot_date)
  );
`);

module.exports = db;
