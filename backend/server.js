// backend/server.js — CRESCITA Travel Mate API Server
require('dotenv').config();
const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const morgan      = require('morgan');
const rateLimit   = require('express-rate-limit');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── SECURITY & MIDDLEWARE ────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:5500',
    'https://boga1999.github.io',
    /localhost/,
  ],
  credentials: true,
}));

// Raw body needed for Stripe webhook BEFORE json parser
app.use('/api/payments/webhook/stripe', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// General rate limit — 200 req/min per IP
app.use('/api/', rateLimit({ windowMs: 60_000, max: 200, standardHeaders: true }));
// Stricter for AI chat
app.use('/api/ai/', rateLimit({ windowMs: 60_000, max: 20, message: { error: 'Too many AI requests, slow down.' } }));

// ─── ROUTES ───────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/routes',    require('./routes/buses'));
app.use('/api/bookings',  require('./routes/bookings'));
app.use('/api/payments',  require('./routes/payments'));
app.use('/api/tracking',  require('./routes/tracking'));
app.use('/api/ai',        require('./routes/ai'));
app.use('/api/operator',  require('./routes/operator'));
app.use('/api/crescita-pay', require('./routes/crescita-pay'));
app.use('/api/crescitapay', require('./routes/crescitapay'));

// ─── HEALTH CHECK ─────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'CRESCITA Travel Mate API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  });
});

// ─── 404 ──────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Endpoint not found' }));

// ─── ERROR HANDLER ────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', detail: process.env.NODE_ENV === 'development' ? err.message : undefined });
});

// ─── START ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚌 CRESCITA Travel Mate API`);
  console.log(`   Running on http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Stripe: ${process.env.STRIPE_SECRET_KEY ? '✅ Configured' : '⚠️  Demo mode'}`);
  console.log(`   Mark AI: ${process.env.ANTHROPIC_API_KEY ? '✅ Configured' : '⚠️  Demo mode'}\n`);
});

module.exports = app;
