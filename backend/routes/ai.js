// backend/routes/ai.js
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const Anthropic = require('@anthropic-ai/sdk');

let client;
const getClient = () => {
  if (!client && process.env.ANTHROPIC_API_KEY) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
};

const MARK_SYSTEM_PROMPT = `You are Mark, the friendly AI travel assistant for CRESCITA Travel Mate — Gaborone's all-in-one urban travel and tourism platform. You speak in a warm, helpful, professional tone.

Your expertise:
- All bus routes in Gaborone: CBD/Bus Rank → Game City, Riverwalk, Rail Park, Airport, Molapo Crossing, Main Mall, UB, Masa Square
- Real-time bus tracking, seat availability, departure times
- Ticket booking and payment (Stripe card, Orange Money, MyZaka, Smega)
- Gaborone attractions: Main Mall, Game City, Riverwalk, Rail Park, Sir Seretse Khama Airport (BNIA), University of Botswana, Gaborone Dam, Mokolodi Nature Reserve, Three Dikgosi Monument
- Local tips: traffic hours (7-8:30am, 4:30-6pm), weekend services, public holidays
- Fares: BWP 6.50–25.00 depending on route (airport shuttle is P25)
- Safety, accessibility, and tourist guidance

Keep responses concise (2-4 sentences max unless explaining something complex). Use P for Pula (currency). If the user asks to book, tell them to use the booking flow on the app. Always be helpful and positive about Gaborone.

If you don't know something specific, say so honestly and suggest they check the app for live data.`;

// POST /api/ai/chat — Mark AI conversation
router.post('/chat',
  body('message').trim().notEmpty().isLength({ max: 1000 }),
  body('history').optional().isArray({ max: 20 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { message, history = [] } = req.body;

    const ai = getClient();
    if (!ai) {
      // Demo mode — pattern-matched responses
      return res.json({ reply: getDemoReply(message), demo_mode: true });
    }

    try {
      const messages = [
        ...history.slice(-10).map(h => ({
          role: h.role,
          content: h.content,
        })),
        { role: 'user', content: message },
      ];

      const response = await ai.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 300,
        system: MARK_SYSTEM_PROMPT,
        messages,
      });

      const reply = response.content[0]?.text || "I'm sorry, I couldn't process that. Please try again.";
      res.json({ reply });
    } catch (err) {
      console.error('Anthropic error:', err);
      res.json({ reply: getDemoReply(message), demo_mode: true });
    }
  }
);

// Pattern-matched demo replies for when AI is unavailable
function getDemoReply(msg) {
  const m = msg.toLowerCase();
  if (m.includes('game city') || m.includes('gamecity')) {
    return "The CBD → Game City Express departs every 25 minutes from Gaborone Bus Rank. The fare is P8.00 and the journey takes about 25 minutes. It runs daily from 5:30am to 9pm. 🚌";
  }
  if (m.includes('airport') || m.includes('bnia') || m.includes('flight')) {
    return "The Airport Shuttle runs directly from Gaborone Bus Rank to Sir Seretse Khama Airport. Fare is P25.00 and it takes about 35 minutes. I recommend booking at least 30 minutes before your flight! ✈️";
  }
  if (m.includes('riverwalk')) {
    return "Riverwalk Mall is on the CBD → Riverwalk Express route. Fare is P6.50 from the Bus Rank and the journey is about 18 minutes. The mall has great dining options and is a favourite with locals! 🛍️";
  }
  if (m.includes('pay') || m.includes('orange money') || m.includes('myzaka')) {
    return "We accept Orange Money, MyZaka (Mascom), Smega, and all major credit/debit cards via Stripe. Simply select your payment method in the checkout flow. All payments are secured and instant! 💳";
  }
  if (m.includes('track') || m.includes('where') || m.includes('bus location')) {
    return "After booking, tap 'Track Bus Live' on your confirmation screen to see your bus's real-time location on the map. You'll also get notified when it's 2 stops away! 📍";
  }
  if (m.includes('hello') || m.includes('hi') || m.includes('hey')) {
    return "Hello! I'm Mark, your CRESCITA travel assistant. I can help you find routes, check fares, and guide you around Gaborone. Where are you heading today? 😊";
  }
  if (m.includes('fare') || m.includes('price') || m.includes('cost') || m.includes('much')) {
    return "Fares in Gaborone range from P6.50 (CBD → Riverwalk) to P25.00 (CBD → Airport). Most inner-city routes are P7–P8. You get the best rates when you book ahead on the app! 💰";
  }
  return "Great question! I'm here to help with routes, fares, and getting around Gaborone. Try asking me about a specific destination like Game City, the Airport, or Riverwalk. 🗺️";
}

// POST /api/ai/suggest-route — smart route suggestion
router.post('/suggest-route',
  body('from').trim().notEmpty(),
  body('to').trim().notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { from, to } = req.body;
    const db = require('../database/db');

    const routes = db.prepare(`
      SELECT r.*, rs_origin.stop_name AS nearest_origin
      FROM routes r
      JOIN route_stops rs_origin ON rs_origin.route_id = r.id
      WHERE (r.origin LIKE '%'||?||'%' OR rs_origin.stop_name LIKE '%'||?||'%')
        AND (r.destination LIKE '%'||?||'%' OR EXISTS (
          SELECT 1 FROM route_stops rs2 WHERE rs2.route_id = r.id AND rs2.stop_name LIKE '%'||?||'%'
        ))
      GROUP BY r.id
      LIMIT 3
    `).all(from, from, to, to);

    res.json({ routes, from, to });
  }
);

module.exports = router;
