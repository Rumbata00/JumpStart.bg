const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { signToken } = require('../utils/jwt');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Slows down credential-stuffing / brute-force attempts against auth
// endpoints without affecting normal use.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Твърде много опити. Опитайте отново след няколко минути.' },
});

function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

router.post('/register', authLimiter, async (req, res) => {
  const { name, email, password, role } = req.body || {};

  if (!name || String(name).trim().length < 2) {
    return res.status(400).json({ error: 'Моля, въведете вашето име.' });
  }
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Въведете валиден имейл адрес.' });
  }
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: 'Паролата трябва да е поне 6 символа.' });
  }
  if (!['candidate', 'employer'].includes(role)) {
    return res.status(400).json({ error: 'Невалидна роля.' });
  }

  const normalizedEmail = String(email).toLowerCase().trim();

  try {
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Вече има регистрация с този имейл.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await db.query(
      `INSERT INTO users (name, email, password_hash, role, email_verified)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, name, email, role`,
      [String(name).trim(), normalizedEmail, passwordHash, role]
    );

    const user = result.rows[0];
    const token = signToken(user);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    console.error('POST /auth/register failed:', err);
    res.status(500).json({ error: 'Възникна грешка при регистрацията. Опитайте отново.' });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Въведете имейл и парола.' });
  }

  const normalizedEmail = String(email).toLowerCase().trim();

  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Грешен имейл или парола.' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Грешен имейл или парола.' });
    }

    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error('POST /auth/login failed:', err);
    res.status(500).json({ error: 'Възникна грешка при входа. Опитайте отново.' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await db.query('SELECT id, name, email, role FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Потребителят не е намерен.' });
    res.json({ user: publicUser(result.rows[0]) });
  } catch (err) {
    console.error('GET /auth/me failed:', err);
    res.status(500).json({ error: 'Възникна грешка.' });
  }
});

module.exports = router;
