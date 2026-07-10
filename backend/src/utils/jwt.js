const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  // Fail loudly rather than silently signing tokens with a guessable default.
  throw new Error('JWT_SECRET is not set. Add it to your .env file (see .env.example).');
}

// Users are expected to stay logged in until they explicitly log out, so
// this is intentionally long rather than a typical short-lived session.
const EXPIRES_IN = '180d';

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, SECRET, { expiresIn: EXPIRES_IN });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { signToken, verifyToken };
