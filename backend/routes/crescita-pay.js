// backend/routes/crescita-pay.js
// Crescita Pay — unified payment wallet system
const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const db   = require('../database/db');
const auth = require('../middleware/auth');

// Ensure wallet tables exist
db.exec(`
  CREATE TABLE IF NOT EXISTS cp_wallets (
    id         TEXT PRIMARY KEY,
    user_id    TEXT UNIQUE NOT NULL REFERENCES users(id),
    balance    REAL NOT NULL DEFAULT 0,
    pin_hash   TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cp_transactions (
    id           TEXT PRIMARY KEY,
    wallet_id    TEXT NOT NULL REFERENCES cp_wallets(id),
    type         TEXT NOT NULL CHECK(type IN ('topup','payment','send','receive','refund')),
    amount       REAL NOT NULL,
    method       TEXT NOT NULL,
    description  TEXT,
    reference    TEXT,
    status       TEXT DEFAULT 'completed',
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cp_linked_methods (
    id         TEXT PRIMARY KEY,
    wallet_id  TEXT NOT NULL REFERENCES cp_wallets(id),
    method     TEXT NOT NULL CHECK(method IN ('orange_money','myzaka','smega','card')),
    number     TEXT NOT NULL,
    label      TEXT,
    active     INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(wallet_id, method)
  );
`);

// Helper: get or create wallet for user
function getOrCreateWallet(userId) {
  let wallet = db.prepare('SELECT * FROM cp_wallets WHERE user_id=?').get(userId);
  if (!wallet) {
    const id = uuidv4();
    db.prepare('INSERT INTO cp_wallets (id,user_id,balance) VALUES (?,?,?)').run(id, userId, 0);
    wallet = db.prepare('SELECT * FROM cp_wallets WHERE id=?').get(id);
  }
  return wallet;
}

// GET /api/crescita-pay/wallet — get wallet + balance
router.get('/wallet', auth(), (req, res) => {
  const wallet = getOrCreateWallet(req.user.id);
  const methods = db.prepare('SELECT * FROM cp_linked_methods WHERE wallet_id=? AND active=1').all(wallet.id);
  const stats = db.prepare(`
    SELECT 
      SUM(CASE WHEN type='topup' THEN amount ELSE 0 END) AS total_topup,
      SUM(CASE WHEN type='payment' THEN amount ELSE 0 END) AS total_spent,
      COUNT(CASE WHEN type='payment' THEN 1 END) AS payment_count
    FROM cp_transactions WHERE wallet_id=?
  `).get(wallet.id);

  res.json({
    wallet_id: wallet.id,
    balance: wallet.balance,
    linked_methods: methods,
    stats: stats || {},
  });
});

// POST /api/crescita-pay/topup — add funds via mobile money or card
router.post('/topup',
  auth(),
  body('amount').isFloat({ min: 5, max: 5000 }),
  body('method').isIn(['orange_money','myzaka','smega','card']),
  body('number').optional().trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { amount, method, number } = req.body;
    const wallet = getOrCreateWallet(req.user.id);

    // Simulate mobile money top-up initiation
    // In production: call Orange/Mascom/Smega API to push USSD request
    const ref = `CPTUP-${uuidv4().slice(0,8).toUpperCase()}`;

    const txId = uuidv4();
    db.prepare(`
      INSERT INTO cp_transactions (id,wallet_id,type,amount,method,description,reference,status)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(txId, wallet.id, 'topup', amount, method, `Top up via ${method}`, ref, 'processing');

    // Simulate async confirmation (5s)
    setTimeout(() => {
      db.prepare('UPDATE cp_wallets SET balance = balance + ? WHERE id=?').run(amount, wallet.id);
      db.prepare(`UPDATE cp_transactions SET status='completed' WHERE id=?`).run(txId);
    }, 5000);

    const methodLabels = { orange_money:'Orange Money', myzaka:'MyZaka (Mascom)', smega:'Smega', card:'Card' };
    res.json({
      transaction_id: txId,
      reference: ref,
      status: 'processing',
      amount,
      method,
      message: method === 'card'
        ? `Card payment of P${amount} is being processed.`
        : `A top-up request of P${amount} has been sent to your ${methodLabels[method]} number. Enter your PIN to confirm.`,
    });
  }
);

// POST /api/crescita-pay/pay — pay for a booking from wallet or mobile method
router.post('/pay',
  auth(),
  body('booking_id').notEmpty(),
  body('method').isIn(['wallet','orange_money','myzaka','smega','card']),
  body('number').optional().trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { booking_id, method, number } = req.body;
    const booking = db.prepare('SELECT * FROM bookings WHERE id=? AND user_id=?').get(booking_id, req.user.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.status !== 'pending') return res.status(400).json({ error: 'Booking not pending payment' });

    const wallet = getOrCreateWallet(req.user.id);
    const amount = booking.total_bwp;

    if (method === 'wallet') {
      if (wallet.balance < amount) {
        return res.status(402).json({ error: 'Insufficient wallet balance', balance: wallet.balance, required: amount });
      }
      db.prepare('UPDATE cp_wallets SET balance = balance - ? WHERE id=?').run(amount, wallet.id);
    }

    const ref = `CPPAY-${uuidv4().slice(0,8).toUpperCase()}`;
    const txId = uuidv4();
    const status = method === 'wallet' ? 'completed' : 'processing';

    db.prepare(`
      INSERT INTO cp_transactions (id,wallet_id,type,amount,method,description,reference,status)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(txId, wallet.id, 'payment', amount, method, `Payment for booking ${booking.qr_code}`, ref, status);

    // For mobile money: simulate 5s confirmation
    const confirm = () => {
      if (method !== 'wallet') {
        db.prepare(`UPDATE cp_transactions SET status='completed' WHERE id=?`).run(txId);
      }
      db.prepare(`UPDATE payments SET status='completed', paid_at=datetime('now') WHERE booking_id=?`).run(booking_id);
      db.prepare(`UPDATE bookings SET status='confirmed', updated_at=datetime('now') WHERE id=?`).run(booking_id);
    };

    if (method === 'wallet') {
      confirm();
    } else {
      setTimeout(confirm, 5000);
    }

    res.json({
      transaction_id: txId,
      reference: ref,
      status,
      amount,
      method,
      booking_qr: booking.qr_code,
      new_balance: method === 'wallet' ? wallet.balance - amount : null,
      message: method === 'wallet'
        ? `P${amount} deducted from Crescita Wallet. Booking confirmed!`
        : `Payment request of P${amount} sent. Enter PIN to confirm.`,
    });
  }
);

// POST /api/crescita-pay/send — send money wallet→wallet
router.post('/send',
  auth(),
  body('to').trim().notEmpty(),
  body('amount').isFloat({ min: 1 }),
  body('note').optional().trim(),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { to, amount, note } = req.body;
    const wallet = getOrCreateWallet(req.user.id);

    if (wallet.balance < amount) {
      return res.status(402).json({ error: 'Insufficient balance', balance: wallet.balance });
    }

    const recipient = db.prepare('SELECT * FROM users WHERE phone=? OR email=?').get(to, to);
    if (!recipient) return res.status(404).json({ error: 'Recipient not found on Crescita Pay' });
    if (recipient.id === req.user.id) return res.status(400).json({ error: 'Cannot send to yourself' });

    const recipientWallet = getOrCreateWallet(recipient.id);
    const ref = `CPSND-${uuidv4().slice(0,8).toUpperCase()}`;

    db.prepare('UPDATE cp_wallets SET balance = balance - ? WHERE id=?').run(amount, wallet.id);
    db.prepare('UPDATE cp_wallets SET balance = balance + ? WHERE id=?').run(amount, recipientWallet.id);

    const txSend = uuidv4();
    const txReceive = uuidv4();
    db.prepare(`INSERT INTO cp_transactions (id,wallet_id,type,amount,method,description,reference) VALUES (?,?,?,?,?,?,?)`).run(
      txSend, wallet.id, 'send', amount, 'wallet', `Sent to ${recipient.name}${note?': '+note:''}`, ref
    );
    db.prepare(`INSERT INTO cp_transactions (id,wallet_id,type,amount,method,description,reference) VALUES (?,?,?,?,?,?,?)`).run(
      txReceive, recipientWallet.id, 'receive', amount, 'wallet', `Received from ${req.user.name}${note?': '+note:''}`, ref
    );

    res.json({
      reference: ref,
      amount,
      recipient: { name: recipient.name, phone: recipient.phone },
      new_balance: wallet.balance - amount,
      message: `P${amount} sent to ${recipient.name} successfully!`,
    });
  }
);

// GET /api/crescita-pay/transactions — transaction history
router.get('/transactions', auth(), (req, res) => {
  const wallet = getOrCreateWallet(req.user.id);
  const { type, limit = 30 } = req.query;

  const txns = db.prepare(`
    SELECT * FROM cp_transactions
    WHERE wallet_id=? ${type ? `AND type=?` : ''}
    ORDER BY created_at DESC LIMIT ?
  `).all(...(type ? [wallet.id, type, parseInt(limit)] : [wallet.id, parseInt(limit)]));

  res.json({ transactions: txns, balance: wallet.balance });
});

// POST /api/crescita-pay/link — link a mobile money method
router.post('/link',
  auth(),
  body('method').isIn(['orange_money','myzaka','smega','card']),
  body('number').trim().notEmpty(),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { method, number, label } = req.body;
    const wallet = getOrCreateWallet(req.user.id);

    db.prepare(`
      INSERT INTO cp_linked_methods (id,wallet_id,method,number,label)
      VALUES (?,?,?,?,?)
      ON CONFLICT(wallet_id,method) DO UPDATE SET number=excluded.number, label=excluded.label, active=1
    `).run(uuidv4(), wallet.id, method, number, label || method);

    res.json({ message: `${method} linked successfully`, method, number });
  }
);

// GET /api/crescita-pay/status/:txId — poll transaction status
router.get('/status/:txId', auth(), (req, res) => {
  const tx = db.prepare('SELECT * FROM cp_transactions WHERE id=?').get(req.params.txId);
  if (!tx) return res.status(404).json({ error: 'Transaction not found' });
  res.json(tx);
});

module.exports = router;
