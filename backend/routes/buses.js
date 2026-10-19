// backend/routes/buses.js
const router = require('express').Router();
const db     = require('../database/db');
const auth   = require('../middleware/auth');

// GET /api/routes — list all active routes
router.get('/', (req, res) => {
  const routes = db.prepare(`
    SELECT r.*, 
      (SELECT COUNT(*) FROM trips t WHERE t.route_id = r.id AND t.departure_time > datetime('now') AND t.status != 'cancelled') AS upcoming_trips
    FROM routes r
    WHERE r.active = 1
    ORDER BY r.name
  `).all();
  res.json(routes);
});

// GET /api/routes/:id/stops
router.get('/:id/stops', (req, res) => {
  const stops = db.prepare(
    'SELECT * FROM route_stops WHERE route_id=? ORDER BY stop_order'
  ).all(req.params.id);
  if (!stops.length) return res.status(404).json({ error: 'Route not found' });
  res.json(stops);
});

// GET /api/routes/search?origin=X&destination=Y&date=YYYY-MM-DD
router.get('/search', (req, res) => {
  const { origin, destination, date } = req.query;
  if (!origin || !destination) {
    return res.status(400).json({ error: 'origin and destination are required' });
  }

  const dateFilter = date || new Date().toISOString().split('T')[0];

  const trips = db.prepare(`
    SELECT 
      t.id AS trip_id,
      t.departure_time,
      t.arrival_time,
      t.status,
      t.current_lat,
      t.current_lng,
      r.id AS route_id,
      r.name AS route_name,
      r.origin,
      r.destination,
      r.distance_km,
      r.duration_min,
      r.fare_bwp,
      b.id AS bus_id,
      b.plate_no,
      b.model,
      b.bus_type,
      b.amenities,
      b.total_seats,
      op.company_name AS operator_name,
      (SELECT COUNT(*) FROM bookings bk 
        WHERE bk.trip_id = t.id AND bk.status IN ('confirmed','pending')
        AND json_array_length(bk.seats) > 0
      ) AS booked_count,
      (b.total_seats - COALESCE(
        (SELECT SUM(json_array_length(bk.seats)) FROM bookings bk 
         WHERE bk.trip_id = t.id AND bk.status IN ('confirmed','pending')), 0
      )) AS available_seats
    FROM trips t
    JOIN routes r ON t.route_id = r.id
    JOIN buses b ON t.bus_id = b.id
    JOIN operators op ON b.operator_id = op.id
    WHERE (r.origin LIKE '%' || ? || '%' OR ? = '')
      AND (r.destination LIKE '%' || ? || '%' OR ? = '')
      AND date(t.departure_time) = ?
      AND t.status != 'cancelled'
    ORDER BY t.departure_time
  `).all(origin, origin, destination, destination, dateFilter);

  res.json(trips.map(t => ({
    ...t,
    amenities: JSON.parse(t.amenities || '[]'),
  })));
});

// GET /api/routes/trips/:tripId/seats — get seat layout with availability
router.get('/trips/:tripId/seats', (req, res) => {
  const trip = db.prepare('SELECT * FROM trips WHERE id=?').get(req.params.tripId);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });

  const seats = db.prepare('SELECT * FROM seats WHERE bus_id=? ORDER BY seat_row, seat_col').all(trip.bus_id);

  // Get all booked seat numbers for this trip
  const bookings = db.prepare(
    `SELECT seats FROM bookings WHERE trip_id=? AND status IN ('confirmed','pending')`
  ).all(req.params.tripId);

  const bookedSeats = new Set();
  bookings.forEach(b => {
    JSON.parse(b.seats || '[]').forEach(s => bookedSeats.add(s));
  });

  const seatsWithStatus = seats.map(s => ({
    ...s,
    status: bookedSeats.has(s.seat_no) ? 'occupied' : 'available',
  }));

  // Group by row
  const rows = {};
  seatsWithStatus.forEach(s => {
    if (!rows[s.seat_row]) rows[s.seat_row] = [];
    rows[s.seat_row].push(s);
  });

  res.json({
    trip_id: trip.id,
    bus_id: trip.bus_id,
    total_seats: seats.length,
    available: seats.length - bookedSeats.size,
    seats: seatsWithStatus,
    rows: Object.values(rows),
  });
});

// GET /api/routes/destinations — all unique destinations for search UI
router.get('/destinations', (req, res) => {
  const origins = db.prepare('SELECT DISTINCT origin AS name FROM routes WHERE active=1').all();
  const dests   = db.prepare('SELECT DISTINCT destination AS name FROM routes WHERE active=1').all();
  const stops   = db.prepare('SELECT DISTINCT stop_name AS name FROM route_stops').all();

  const all = [...new Set([...origins, ...dests, ...stops].map(r => r.name))].sort();
  res.json(all);
});

module.exports = router;
