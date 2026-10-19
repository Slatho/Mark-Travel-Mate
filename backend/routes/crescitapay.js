// backend/routes/crescitapay.js
// CRESCITA PAY — Unified in-app payment gateway
// Handles MyZaka, Orange Money, Smega, and card payments under one brand.

const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const db   = require('../database/db');
const auth = require('../middleware/auth');

// ─── SUPPORTED METHODS ────────────────────────────────────────────────────────
const METHODS = {
  myzaka: {
    label: 'MyZaka',
    provider: 'Mascom',
    icon: '📱',
    type: 'mobile',
    prefix: '+267',
    networks: ['Mascom'],
    processing_time: '< 30 seconds',
    fee_pct: 0,
  },
  orange_money: {
    label: 'Orange Money',
    provider: 'Orange Botswana',
    icon: '🟠',
    type: 'mobile',
    prefix: '+267',
    networks: ['Orange'],
    processing_time: '< 30 seconds',
    fee_pct: 0,
  },
  smega: {
    label: 'Smega',
    provider: 'Botswana Telecommunications',
    icon: '💜',
    type: 'mobile',
    prefix: '+267',
    networks: ['BTC'],
    processing_time: '< 30 seconds',
    fee_pct: 0,
  },
  card: {
    label: 'Debit / Credit Card',
    provider: 'Visa / Mastercard',
    icon: '💳',
    type: 'card',
    networks: ['Visa', 'Mastercard'],
    processing_time: 'Instant',
    fee_pct: 1.5, // 1.5% card processing fee
  },
};

// GET /api/crescitapay/methods — list available payment methods
router.get('/methods', (req, res) => {
  res.json({
    gateway: 'CRESCITA PAY',
    currency: 'BWP',
    methods: Object.entries(METHODS).map(([key, m]) => ({ id: key, ...m })),
  });
});

// POST /api/crescitapay/initiate — start a Crescita Pay transaction
router.post('/initiate',
  auth(['passenger', 'admin']),
  body('booking_id').notEmpty(),
  body('method').isIn(Object.keys(METHODS)),
  body('mobile_number').optional().trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { booking_id, method, mobile_number, card_token } = req.body;

    // Validate booking belongs to user and is pending
    const booking = db.prepare(
      `SELECT b.*, r.fare_bwp, r.name AS route_name, r.origin, r.destination,
              t.departure_time, bs.plate_no, bs.model
       FROM bookings b
       JOIN trips t ON b.trip_id = t.id
       JOIN routes r ON t.route_id = r.id
       JOIN buses bs ON t.bus_id = bs.id
       WHERE b.id=? AND b.user_id=? AND b.status='pending'`
    ).get(booking_id, req.user.id);

    if (!booking) return res.status(404).json({ error: 'Booking not found or already paid' });

    // Calculate amount with any applicable fee
    const baseFare  = booking.total_bwp;
    const feePct    = METHODS[method].fee_pct;
    const feeAmount = parseFloat((baseFare * feePct / 100).toFixed(2));
    const totalAmount = parseFloat((baseFare + feeAmount).toFixed(2));

    // Create Crescita Pay transaction record
    const txId  = uuidv4();
    const txRef = `CPAY-${txId.slice(0, 8).toUpperCase()}`;

    // Check for existing pending payment and cancel it
    db.prepare(`UPDATE payments SET status='failed' WHERE booking_id=? AND status='pending'`).run(booking_id);

    db.prepare(`
      INSERT INTO payments (id, booking_id, user_id, amount_bwp, currency, method, provider_ref, status, mobile_number)
      VALUES (?, ?, ?, ?, 'BWP', ?, ?, 'processing', ?)
    `).run(txId, booking_id, req.user.id, totalAmount, method, txRef, mobile_number || null);

    // ── MOBILE MONEY FLOW ──────────────────────────────────────────────────────
    // In production: call the respective provider's push-payment API here.
    //
    // MyZaka (Mascom):  POST https://api.mascom.bw/myzaka/v1/payments
    //   { merchant_id, amount, currency, msisdn, reference, callback_url }
    //
    // Orange Money:     POST https://api.orange.com/orange-money-webpay/bw/v1/webpayment
    //   { merchant_key, amount, notif_token, return_url, cancel_url, lang, reference }
    //
    // Smega (BTC):      POST https://api.btc.bw/smega/v1/charge
    //   { merchant_id, phone, amount, reference }
    //
    // For demo: simulate 5-second approval
    if (method !== 'card') {
      setTimeout(() => {
        db.prepare(`UPDATE payments SET status='completed', paid_at=datetime('now') WHERE id=?`).run(txId);
        db.prepare(`UPDATE bookings SET status='confirmed', updated_at=datetime('now') WHERE id=?`).run(booking_id);
      }, 5000);
    }

    const methodInfo = METHODS[method];
    res.status(201).json({
      tx_id:        txId,
      tx_ref:       txRef,
      status:       method === 'card' ? 'awaiting_card' : 'push_sent',
      method,
      method_label: methodInfo.label,
      amount:       totalAmount,
      base_fare:    baseFare,
      fee_amount:   feeAmount,
      fee_pct:      feePct,
      currency:     'BWP',
      booking: {
        id:         booking.id,
        qr_code:    booking.qr_code,
        route:      booking.route_name,
        origin:     booking.origin,
        destination: booking.destination,
        departure:  booking.departure_time,
        seats:      JSON.parse(booking.seats || '[]'),
        bus:        `${booking.plate_no} · ${booking.model}`,
      },
      message: method === 'card'
        ? 'Enter your card details to complete payment.'
        : `A payment request of P${totalAmount.toFixed(2)} has been sent to ${mobile_number}. Enter your ${methodInfo.label} PIN to confirm.`,
      expires_at: new Date(Date.now() + 5 * 60000).toISOString(), // 5 min timeout
    });
  }
);

// POST /api/crescitapay/card/confirm — confirm card payment after form submit
router.post('/card/confirm',
  auth(['passenger', 'admin']),
  body('tx_id').notEmpty(),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { tx_id } = req.body;
    const payment = db.prepare(`SELECT * FROM payments WHERE id=? AND user_id=? AND method='card'`).get(tx_id, req.user.id);
    if (!payment) return res.status(404).json({ error: 'Transaction not found' });

    // In production: verify Stripe PaymentIntent or card processor confirmation here
    // For demo: confirm directly
    db.prepare(`UPDATE payments SET status='completed', paid_at=datetime('now') WHERE id=?`).run(tx_id);
    db.prepare(`UPDATE bookings SET status='confirmed', updated_at=datetime('now') WHERE id=?`).run(payment.booking_id);

    const booking = db.prepare('SELECT * FROM bookings WHERE id=?').get(payment.booking_id);
    res.json({
      success:   true,
      tx_ref:    payment.provider_ref,
      paid_at:   new Date().toISOString(),
      amount:    payment.amount_bwp,
      booking: {
        ...booking,
        seats: JSON.parse(booking.seats || '[]'),
      },
    });
  }
);

// GET /api/crescitapay/status/:txId — poll transaction status
router.get('/status/:txId', auth(), (req, res) => {
  const payment = db.prepare('SELECT * FROM payments WHERE id=?').get(req.params.txId);
  if (!payment) return res.status(404).json({ error: 'Transaction not found' });
  if (payment.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }

  const booking = payment.status === 'completed'
    ? db.prepare('SELECT * FROM bookings WHERE id=?').get(payment.booking_id)
    : null;

  res.json({
    tx_id:     payment.id,
    tx_ref:    payment.provider_ref,
    status:    payment.status,
    method:    payment.method,
    amount:    payment.amount_bwp,
    paid_at:   payment.paid_at,
    booking_status: booking?.status || null,
    booking_qr:    booking?.qr_code || null,
  });
});

// GET /api/crescitapay/history — user's Crescita Pay transaction history
router.get('/history', auth(), (req, res) => {
  const txs = db.prepare(`
    SELECT p.*, b.qr_code, r.name AS route_name, r.origin, r.destination
    FROM payments p
    JOIN bookings b ON p.booking_id = b.id
    JOIN trips t ON b.trip_id = t.id
    JOIN routes r ON t.route_id = r.id
    WHERE p.user_id=?
    ORDER BY p.created_at DESC LIMIT 20
  `).all(req.user.id);
  res.json(txs);
});

module.exports = router;
module.exports.METHODS = METHODS;
