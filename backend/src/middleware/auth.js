const { verifyToken } = require('../utils/jwt');
const db = require('../db');

/**
 * Reads the Bearer token if present and attaches req.user ({id, role}).
 * Does NOT reject the request if no token is present — use requireAuth
 * for that. Useful for endpoints that behave differently when logged in
 * but are still public (e.g. job listing, to know save-state later).
 */
async function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, role: payload.role };
  } catch (err) {
    // Invalid/expired token on an optional route: proceed as anonymous.
  }
  next();
}

/** Rejects the request with 401 unless a valid Bearer token is present. */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Изисква се вход в профила.' });
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Невалидна или изтекла сесия. Моля, влезте отново.' });
  }
}

/** Use after requireAuth. Restricts a route to one or more roles. */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Нямате права за това действие.' });
    }
    next();
  };
}

module.exports = { requireAuth, optionalAuth, requireRole };
