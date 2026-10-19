// backend/routes/bookings.js
const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const db   = require('../database/db');
const auth = require('../middleware/auth');

// POST /api/bookings — create a new booking
router.post('/',
  auth(['passenger','admin']),
  body('trip_id').notEmpty(),
  body('seats').isArray({ min: 1, max: 10 }),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { trip_id, seats } = req.body;

    // Verify trip exists and is available
    const trip = db.prepare(
      `SELECT t.*, r.fare_bwp FROM trips t JOIN routes r ON t.route_id = r.id WHERE t.id=? AND t.status NOT IN ('cancelled','completed')`
    ).get(trip_id);
    if (!trip) return res.status(404).json({ error: 'Trip not found or unavailable' });

    // Check seats aren't already booked
    const existing = db.prepare(
      `SELECT seats FROM bookings WHERE trip_id=? AND status IN ('confirmed','pending')`
    ).all(trip_id);

    const taken = new Set();
    existing.forEach(b => JSON.parse(b.seats || '[]').forEach(s => taken.add(s)));

    const conflict = seats.find(s => taken.has(s));
    if (conflict) return res.status(409).json({ error: `Seat ${conflict} is already booked` });

    // Verify seats exist on this bus
    const validSeats = db.prepare(
      `SELECT seat_no FROM seats WHERE bus_id=? AND seat_no IN (${seats.map(() => '?').join(',')})`
    ).all(trip.bus_id, ...seats);
    if (validSeats.length !== seats.length) {
      return res.status(400).json({ error: 'One or more seat numbers are invalid' });
    }

    const total = parseFloat((trip.fare_bwp * seats.length).toFixed(2));
    const id = uuidv4();
    const qr = `CTM-${id.slice(0, 8).toUpperCase()}`;

    db.prepare(
      `INSERT INTO bookings (id,user_id,trip_id,seats,total_bwp,status,qr_code) VALUES (?,?,?,?,?,?,?)`
    ).run(id, req.user.id, trip_id, JSON.stringify(seats), total, 'pending', qr);

    const booking = db.prepare('SELECT * FROM bookings WHERE id=?').get(id);
    res.status(201).json({ ...booking, seats: JSON.parse(booking.seats), qr_code: qr });
  }
);

// GET /api/bookings/:id — get booking details
router.get('/:id', auth(), (req, res) => {
  const booking = db.prepare(`
    SELECT b.*,
      t.departure_time, t.arrival_time, t.status AS trip_status,
      t.current_lat, t.current_lng,
      r.name AS route_name, r.origin, r.destination, r.fare_bwp,
      r.distance_km, r.duration_min,
      bs.plate_no, bs.model, bs.bus_type, bs.amenities,
      op.company_name AS operator_name,
      p.method AS payment_method, p.status AS payment_status, p.paid_at,
      u.name AS passenger_name, u.phone AS passenger_phone
    FROM bookings b
    JOIN trips t ON b.trip_id = t.id
    JOIN routes r ON t.route_id = r.id
    JOIN buses bs ON t.bus_id = bs.id
    JOIN operators op ON bs.operator_id = op.id
    LEFT JOIN payments p ON p.booking_id = b.id
    JOIN users u ON b.user_id = u.id
    WHERE b.id=?
  `).get(req.params.id);

  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }

  res.json({
    ...booking,
    seats: JSON.parse(booking.seats || '[]'),
    amenities: JSON.parse(booking.amenities || '[]'),
  });
});

// DELETE /api/bookings/:id — cancel booking
router.delete('/:id', auth(['passenger','admin']), (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id=?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }
  if (booking.status === 'cancelled') {
    return res.status(400).json({ error: 'Booking already cancelled' });
  }

  db.prepare(`UPDATE bookings SET status='cancelled', updated_at=datetime('now') WHERE id=?`).run(req.params.id);

  // If payment was completed, flag for refund
  const payment = db.prepare(`SELECT * FROM payments WHERE booking_id=? AND status='completed'`).get(req.params.id);
  if (payment) {
    db.prepare(`UPDATE payments SET status='refunded' WHERE id=?`).run(payment.id);
  }

  res.json({ message: 'Booking cancelled', refund_initiated: !!payment });
});

module.exports = router;
