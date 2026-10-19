// backend/middleware/auth.js
const jwt = require('jsonwebtoken');

const auth = (roles = []) => (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (roles.length && !roles.includes(decoded.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

module.exports = auth;
