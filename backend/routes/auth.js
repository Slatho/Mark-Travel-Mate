// backend/routes/auth.js
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const db      = require('../database/db');
const auth    = require('../middleware/auth');

const sign = (user) => jwt.sign(
  { id: user.id, email: user.email, role: user.role, name: user.name },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
);

// POST /api/auth/register
router.post('/register',
  body('name').trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('phone').trim().notEmpty(),
  body('password').isLength({ min: 6 }),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, email, phone, password, role = 'passenger' } = req.body;
    const existing = db.prepare('SELECT id FROM users WHERE email=? OR phone=?').get(email, phone);
    if (existing) return res.status(409).json({ error: 'Email or phone already registered' });

    const hashed = bcrypt.hashSync(password, 10);
    const id = uuidv4();
    db.prepare('INSERT INTO users (id,name,email,phone,password,role) VALUES (?,?,?,?,?,?)').run(
      id, name, email, phone, hashed, ['admin','operator','passenger'].includes(role) ? role : 'passenger'
    );

    const user = db.prepare('SELECT id,name,email,phone,role,created_at FROM users WHERE id=?').get(id);
    res.status(201).json({ token: sign(user), user });
  }
);

// POST /api/auth/login
router.post('/login',
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const { password: _, ...safeUser } = user;
    res.json({ token: sign(safeUser), user: safeUser });
  }
);

// GET /api/auth/me
router.get('/me', auth(), (req, res) => {
  const user = db.prepare('SELECT id,name,email,phone,role,created_at FROM users WHERE id=?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// GET /api/auth/bookings — passenger booking history
router.get('/bookings', auth(['passenger','admin']), (req, res) => {
  const bookings = db.prepare(`
    SELECT b.*, t.departure_time, t.arrival_time, t.status AS trip_status,
           r.name AS route_name, r.origin, r.destination, r.fare_bwp,
           bs.plate_no, bs.model, bs.bus_type,
           p.method AS payment_method, p.status AS payment_status
    FROM bookings b
    JOIN trips t ON b.trip_id = t.id
    JOIN routes r ON t.route_id = r.id
    JOIN buses bs ON t.bus_id = bs.id
    LEFT JOIN payments p ON p.booking_id = b.id
    WHERE b.user_id = ?
    ORDER BY b.booked_at DESC
    LIMIT 20
  `).all(req.user.id);
  res.json(bookings);
});

module.exports = router;
