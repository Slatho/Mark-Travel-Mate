// backend/routes/payments.js
const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const db     = require('../database/db');
const auth   = require('../middleware/auth');

// Lazy-init Stripe so server can start without key set
let stripe;
const getStripe = () => {
  if (!stripe && process.env.STRIPE_SECRET_KEY) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
};

// ─── CARD PAYMENT (Stripe) ────────────────────────────────────────────────────
// POST /api/payments/card/intent — create Stripe PaymentIntent
router.post('/card/intent',
  auth(['passenger','admin']),
  body('booking_id').notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { booking_id } = req.body;
    const booking = db.prepare('SELECT * FROM bookings WHERE id=? AND user_id=?').get(booking_id, req.user.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.status !== 'pending') return res.status(400).json({ error: 'Booking is not pending payment' });

    const s = getStripe();
    if (!s) {
      // Demo mode — return a mock client secret
      const payId = uuidv4();
      db.prepare(`INSERT INTO payments (id,booking_id,user_id,amount_bwp,method,status,provider_ref,stripe_client_secret) VALUES (?,?,?,?,?,?,?,?)`).run(
        payId, booking_id, req.user.id, booking.total_bwp, 'card', 'pending',
        'demo_pi_' + payId.slice(0,8), 'demo_secret_' + payId.slice(0,16)
      );
      return res.json({
        payment_id: payId,
        client_secret: 'demo_secret_' + payId.slice(0, 16),
        amount: booking.total_bwp,
        currency: 'bwp',
        demo_mode: true,
        message: 'Demo mode: No Stripe key configured. Payment will be simulated.'
      });
    }

    try {
      // Convert BWP to thebe (smallest unit, like cents)
      const amount = Math.round(booking.total_bwp * 100);

      const intent = await s.paymentIntents.create({
        amount,
        currency: 'bwp',
        automatic_payment_methods: { enabled: true },
        metadata: { booking_id, user_id: req.user.id, platform: 'crescita-travel-mate' },
        description: `CRESCITA Travel Mate — Booking ${booking.qr_code}`,
      });

      const payId = uuidv4();
      db.prepare(`INSERT INTO payments (id,booking_id,user_id,amount_bwp,method,status,provider_ref,stripe_client_secret) VALUES (?,?,?,?,?,?,?,?)`).run(
        payId, booking_id, req.user.id, booking.total_bwp, 'card', 'pending', intent.id, intent.client_secret
      );

      res.json({ payment_id: payId, client_secret: intent.client_secret, amount: booking.total_bwp, currency: 'bwp' });
    } catch (err) {
      console.error('Stripe error:', err);
      res.status(502).json({ error: 'Payment gateway error', detail: err.message });
    }
  }
);

// POST /api/payments/card/confirm — called after Stripe confirms payment
router.post('/card/confirm',
  auth(['passenger','admin']),
  body('payment_id').notEmpty(),
  body('payment_intent_id').notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { payment_id, payment_intent_id } = req.body;
    const payment = db.prepare('SELECT * FROM payments WHERE id=? AND user_id=?').get(payment_id, req.user.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    const s = getStripe();
    let confirmed = false;

    if (s && !payment_intent_id.startsWith('demo_')) {
      try {
        const intent = await s.paymentIntents.retrieve(payment_intent_id);
        confirmed = intent.status === 'succeeded';
      } catch (err) {
        return res.status(502).json({ error: 'Could not verify payment', detail: err.message });
      }
    } else {
      // Demo mode: auto-confirm
      confirmed = true;
    }

    if (confirmed) {
      db.prepare(`UPDATE payments SET status='completed', paid_at=datetime('now') WHERE id=?`).run(payment_id);
      db.prepare(`UPDATE bookings SET status='confirmed', updated_at=datetime('now') WHERE id=?`).run(payment.booking_id);
      const booking = db.prepare('SELECT * FROM bookings WHERE id=?').get(payment.booking_id);
      return res.json({ success: true, booking: { ...booking, seats: JSON.parse(booking.seats || '[]') } });
    }

    res.status(402).json({ success: false, error: 'Payment not completed' });
  }
);

// ─── MOBILE MONEY (Orange Money / MyZaka / Smega) ─────────────────────────────
// POST /api/payments/mobilemoney/initiate
router.post('/mobilemoney/initiate',
  auth(['passenger','admin']),
  body('booking_id').notEmpty(),
  body('method').isIn(['orange_money', 'myzaka', 'smega']),
  body('mobile_number').trim().notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { booking_id, method, mobile_number } = req.body;
    const booking = db.prepare('SELECT * FROM bookings WHERE id=? AND user_id=?').get(booking_id, req.user.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.status !== 'pending') return res.status(400).json({ error: 'Booking is not pending payment' });

    // Check for existing pending payment
    const existing = db.prepare(`SELECT id FROM payments WHERE booking_id=? AND status='pending'`).get(booking_id);
    if (existing) {
      db.prepare(`UPDATE payments SET method=?, mobile_number=? WHERE id=?`).run(method, mobile_number, existing.id);
      return res.json({ payment_id: existing.id, status: 'pending', message: 'Enter your PIN to confirm payment', amount: booking.total_bwp, method });
    }

    const payId = uuidv4();

    // In production, call the actual Orange Money / Mascom / Smega API here.
    // Orange Money Botswana uses the USSD push flow:
    //   POST /orange-money-webpay/bw/v1/webpayment  with merchant_key, amount, notif_token, return_url
    // MyZaka (Mascom) uses merchant payment API with similar push to customer.
    // For now we simulate the initiation and return a reference number.

    const providerRef = `${method.toUpperCase().replace('_','')}${Date.now().toString().slice(-8)}`;

    db.prepare(`INSERT INTO payments (id,booking_id,user_id,amount_bwp,method,status,provider_ref,mobile_number) VALUES (?,?,?,?,?,?,?,?)`).run(
      payId, booking_id, req.user.id, booking.total_bwp, method, 'processing', providerRef, mobile_number
    );

    // Simulate async mobile money approval (5s in demo)
    // In production this is handled via webhook from the provider
    setTimeout(() => {
      db.prepare(`UPDATE payments SET status='completed', paid_at=datetime('now') WHERE id=?`).run(payId);
      db.prepare(`UPDATE bookings SET status='confirmed', updated_at=datetime('now') WHERE id=?`).run(booking_id);
    }, 5000);

    const methodLabels = { orange_money: 'Orange Money', myzaka: 'MyZaka (Mascom)', smega: 'Smega' };
    res.json({
      payment_id: payId,
      provider_ref: providerRef,
      status: 'processing',
      method,
      amount: booking.total_bwp,
      message: `A payment request of P${booking.total_bwp.toFixed(2)} has been sent to ${mobile_number} via ${methodLabels[method]}. Enter your PIN to confirm.`,
    });
  }
);

// GET /api/payments/:id/status — poll payment status
router.get('/:id/status', auth(), (req, res) => {
  const payment = db.prepare('SELECT * FROM payments WHERE id=?').get(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  if (payment.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }

  const booking = db.prepare('SELECT * FROM bookings WHERE id=?').get(payment.booking_id);
  res.json({
    payment_id: payment.id,
    status: payment.status,
    method: payment.method,
    amount: payment.amount_bwp,
    paid_at: payment.paid_at,
    booking_status: booking?.status,
    booking_qr: booking?.qr_code,
  });
});

// POST /api/payments/webhook/stripe — Stripe webhook handler
router.post('/webhook/stripe', require('express').raw({ type: 'application/json' }), (req, res) => {
  const s = getStripe();
  if (!s) return res.sendStatus(200);

  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = s.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object;
    const payment = db.prepare(`SELECT * FROM payments WHERE provider_ref=?`).get(intent.id);
    if (payment) {
      db.prepare(`UPDATE payments SET status='completed', paid_at=datetime('now') WHERE id=?`).run(payment.id);
      db.prepare(`UPDATE bookings SET status='confirmed', updated_at=datetime('now') WHERE id=?`).run(payment.booking_id);
    }
  }

  res.sendStatus(200);
});

module.exports = router;
