// backend/routes/operator.js
const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db   = require('../database/db');
const auth = require('../middleware/auth');

// GET /api/operator/dashboard — operator stats
router.get('/dashboard', auth(['operator','admin']), (req, res) => {
  // Get operator record
  const operator = db.prepare(
    'SELECT * FROM operators WHERE user_id=?'
  ).get(req.user.id);

  if (!operator && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Operator profile not found' });
  }

  const opId = operator?.id;
  const opFilter = req.user.role === 'admin' ? '' : `AND b.operator_id = '${opId}'`;

  // Today's stats
  const today = db.prepare(`
    SELECT 
      COUNT(DISTINCT t.id) AS trips_today,
      COUNT(DISTINCT bk.id) AS bookings_today,
      COALESCE(SUM(p.amount_bwp), 0) AS revenue_today,
      COALESCE(AVG(
        CAST(SUM(json_array_length(bk2.seats)) AS REAL) / b2.total_seats * 100
      ), 0) AS avg_occupancy
    FROM trips t
    JOIN buses b ON t.bus_id = b.id
    LEFT JOIN bookings bk ON bk.trip_id = t.id AND bk.status = 'confirmed'
    LEFT JOIN payments p ON p.booking_id = bk.id AND p.status = 'completed'
    LEFT JOIN bookings bk2 ON bk2.trip_id = t.id AND bk2.status = 'confirmed'
    LEFT JOIN buses b2 ON t.bus_id = b2.id
    WHERE date(t.departure_time) = date('now')
    ${opFilter}
  `).get();

  // Last 7 days revenue
  const weeklyRevenue = db.prepare(`
    SELECT date(t.departure_time) AS day,
           COALESCE(SUM(p.amount_bwp), 0) AS revenue,
           COUNT(DISTINCT bk.id) AS bookings
    FROM trips t
    JOIN buses b ON t.bus_id = b.id
    LEFT JOIN bookings bk ON bk.trip_id = t.id AND bk.status = 'confirmed'
    LEFT JOIN payments p ON p.booking_id = bk.id AND p.status = 'completed'
    WHERE t.departure_time >= date('now', '-7 days')
    ${opFilter}
    GROUP BY day ORDER BY day ASC
  `).all();

  // Top routes by revenue
  const topRoutes = db.prepare(`
    SELECT r.name AS route_name, r.origin, r.destination,
           COUNT(DISTINCT bk.id) AS bookings,
           COALESCE(SUM(p.amount_bwp), 0) AS revenue
    FROM routes r
    JOIN trips t ON t.route_id = r.id
    JOIN buses b ON t.bus_id = b.id
    LEFT JOIN bookings bk ON bk.trip_id = t.id AND bk.status = 'confirmed'
    LEFT JOIN payments p ON p.booking_id = bk.id AND p.status = 'completed'
    WHERE t.departure_time >= date('now', '-30 days')
    ${opFilter}
    GROUP BY r.id ORDER BY revenue DESC LIMIT 5
  `).all();

  // Fleet status
  const fleet = db.prepare(`
    SELECT b.id, b.plate_no, b.model, b.bus_type, b.total_seats,
           t.status AS current_status, t.departure_time,
           r.name AS current_route,
           COALESCE(SUM(json_array_length(bk.seats)), 0) AS seats_booked
    FROM buses b
    LEFT JOIN trips t ON t.bus_id = b.id AND t.departure_time >= datetime('now') 
      AND t.status NOT IN ('completed','cancelled')
    LEFT JOIN routes r ON t.route_id = r.id
    LEFT JOIN bookings bk ON bk.trip_id = t.id AND bk.status IN ('confirmed','pending')
    WHERE b.active = 1 ${opFilter.replace(/b\.operator_id/, 'b.operator_id')}
    GROUP BY b.id
    ORDER BY b.plate_no
  `).all();

  // Payment method breakdown
  const paymentMethods = db.prepare(`
    SELECT p.method, COUNT(*) AS count, SUM(p.amount_bwp) AS total
    FROM payments p
    JOIN bookings bk ON p.booking_id = bk.id
    JOIN trips t ON bk.trip_id = t.id
    JOIN buses b ON t.bus_id = b.id
    WHERE p.status = 'completed' AND t.departure_time >= date('now', '-30 days')
    ${opFilter}
    GROUP BY p.method ORDER BY total DESC
  `).all();

  // All-time totals
  const allTime = db.prepare(`
    SELECT COUNT(DISTINCT bk.id) AS total_bookings,
           COALESCE(SUM(p.amount_bwp), 0) AS total_revenue,
           COUNT(DISTINCT t.id) AS total_trips
    FROM trips t
    JOIN buses b ON t.bus_id = b.id
    LEFT JOIN bookings bk ON bk.trip_id = t.id AND bk.status = 'confirmed'
    LEFT JOIN payments p ON p.booking_id = bk.id AND p.status = 'completed'
    ${opFilter ? `WHERE ${opFilter.replace('AND ','')}` : ''}
  `).get();

  res.json({
    operator: operator || { company_name: 'All Operators (Admin View)' },
    today: today || {},
    weekly_revenue: weeklyRevenue,
    top_routes: topRoutes,
    fleet: fleet.map(f => ({
      ...f,
      occupancy_pct: f.total_seats ? Math.round((f.seats_booked / f.total_seats) * 100) : 0,
    })),
    payment_methods: paymentMethods,
    all_time: allTime || {},
  });
});

// GET /api/operator/trips — list operator trips with bookings
router.get('/trips', auth(['operator','admin']), (req, res) => {
  const operator = db.prepare('SELECT id FROM operators WHERE user_id=?').get(req.user.id);
  const opFilter = operator ? `AND b.operator_id = '${operator.id}'` : '';
  const { date, status } = req.query;

  const trips = db.prepare(`
    SELECT t.id, t.departure_time, t.arrival_time, t.status,
           r.name AS route_name, r.origin, r.destination, r.fare_bwp,
           b.plate_no, b.model, b.total_seats,
           COALESCE(SUM(json_array_length(bk.seats)), 0) AS seats_filled,
           COUNT(DISTINCT bk.id) AS booking_count,
           COALESCE(SUM(p.amount_bwp), 0) AS revenue
    FROM trips t
    JOIN routes r ON t.route_id = r.id
    JOIN buses b ON t.bus_id = b.id
    LEFT JOIN bookings bk ON bk.trip_id = t.id AND bk.status IN ('confirmed','pending')
    LEFT JOIN payments p ON p.booking_id = bk.id AND p.status = 'completed'
    WHERE 1=1
      ${opFilter}
      ${date ? `AND date(t.departure_time) = '${date}'` : ''}
      ${status ? `AND t.status = '${status}'` : ''}
    GROUP BY t.id
    ORDER BY t.departure_time DESC
    LIMIT 50
  `).all();

  res.json(trips.map(t => ({
    ...t,
    occupancy_pct: t.total_seats ? Math.round((t.seats_filled / t.total_seats) * 100) : 0,
  })));
});

// POST /api/operator/waitlist — join the operator waitlist
router.post('/waitlist', (req, res) => {
  const { name, email, phone, role = 'passenger' } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required' });

  const existing = db.prepare('SELECT id FROM waitlist WHERE phone=?').get(phone);
  if (existing) return res.status(409).json({ error: 'Already registered', id: existing.id });

  const id = uuidv4();
  db.prepare('INSERT INTO waitlist (id,name,email,phone,role) VALUES (?,?,?,?,?)').run(
    id, name, email || null, phone, role
  );
  res.status(201).json({ id, message: 'You\'re on the list! We\'ll be in touch shortly. 🎉' });
});

// GET /api/operator/waitlist — admin only
router.get('/waitlist', auth(['admin']), (req, res) => {
  const list = db.prepare('SELECT * FROM waitlist ORDER BY created_at DESC').all();
  res.json(list);
});

module.exports = router;
