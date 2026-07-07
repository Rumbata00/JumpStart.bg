const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { signToken } = require('../utils/jwt');
const { requireAuth } = require('../middleware/auth');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../mailer');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_TTL_MS = 15 * 60 * 1000;

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

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function issueCode(userId, purpose) {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  await db.query(
    'INSERT INTO verification_codes (user_id, code, purpose, expires_at) VALUES ($1, $2, $3, $4)',
    [userId, code, purpose, expiresAt]
  );
  return code;
}

async function consumeCode(userId, purpose, submittedCode) {
  const result = await db.query(
    `SELECT * FROM verification_codes
     WHERE user_id = $1 AND purpose = $2
     ORDER BY created_at DESC LIMIT 1`,
    [userId, purpose]
  );
  const record = result.rows[0];
  const valid = record && record.code === String(submittedCode).trim() && new Date(record.expires_at) >= new Date();
  if (valid) {
    await db.query('DELETE FROM verification_codes WHERE user_id = $1 AND purpose = $2', [userId, purpose]);
  }
  return valid;
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
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role`,
      [String(name).trim(), normalizedEmail, passwordHash, role]
    );

    const user = result.rows[0];
    const code = await issueCode(user.id, 'verify_email');
    try {
      await sendVerificationEmail(user.email, code);
    } catch (err) {
      console.error('Failed to send verification email:', err);
    }

    res.status(201).json({ pendingVerification: true, email: user.email });
  } catch (err) {
    console.error('POST /auth/register failed:', err);
    res.status(500).json({ error: 'Възникна грешка при регистрацията. Опитайте отново.' });
  }
});

router.post('/verify-email', authLimiter, async (req, res) => {
  const { email, code } = req.body || {};
  if (!email || !code) {
    return res.status(400).json({ error: 'Въведете имейл и код за потвърждение.' });
  }

  const normalizedEmail = String(email).toLowerCase().trim();

  try {
    const userResult = await db.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
    const user = userResult.rows[0];
    if (!user) return res.status(400).json({ error: 'Невалиден имейл или код.' });
    if (user.email_verified) {
      return res.status(400).json({ error: 'Профилът вече е потвърден. Опитайте да влезете.' });
    }

    const valid = await consumeCode(user.id, 'verify_email', code);
    if (!valid) {
      return res.status(400).json({ error: 'Невалиден или изтекъл код. Изпратете нов.' });
    }

    await db.query('UPDATE users SET email_verified = true WHERE id = $1', [user.id]);

    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error('POST /auth/verify-email failed:', err);
    res.status(500).json({ error: 'Възникна грешка при потвърждаването. Опитайте отново.' });
  }
});

router.post('/resend-code', authLimiter, async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Въведете имейл адрес.' });

  const normalizedEmail = String(email).toLowerCase().trim();

  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
    const user = result.rows[0];
    if (user && !user.email_verified) {
      const code = await issueCode(user.id, 'verify_email');
      try {
        await sendVerificationEmail(user.email, code);
      } catch (err) {
        console.error('Failed to resend verification email:', err);
      }
    }
    // Same response whether or not the account exists/is already verified —
    // avoids leaking which emails are registered.
    res.json({ sent: true });
  } catch (err) {
    console.error('POST /auth/resend-code failed:', err);
    res.status(500).json({ error: 'Възникна грешка. Опитайте отново.' });
  }
});

router.post('/forgot-password', authLimiter, async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Въведете имейл адрес.' });

  const normalizedEmail = String(email).toLowerCase().trim();

  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
    const user = result.rows[0];
    if (user) {
      const code = await issueCode(user.id, 'reset_password');
      try {
        await sendPasswordResetEmail(user.email, code);
      } catch (err) {
        console.error('Failed to send password reset email:', err);
      }
    }
    // Same response regardless — avoids leaking which emails are registered.
    res.json({ sent: true });
  } catch (err) {
    console.error('POST /auth/forgot-password failed:', err);
    res.status(500).json({ error: 'Възникна грешка. Опитайте отново.' });
  }
});

router.post('/reset-password', authLimiter, async (req, res) => {
  const { email, code, newPassword } = req.body || {};
  if (!email || !code) {
    return res.status(400).json({ error: 'Въведете имейл и код за потвърждение.' });
  }
  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ error: 'Паролата трябва да е поне 6 символа.' });
  }

  const normalizedEmail = String(email).toLowerCase().trim();

  try {
    const userResult = await db.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
    const user = userResult.rows[0];
    if (!user) return res.status(400).json({ error: 'Невалиден имейл или код.' });

    const valid = await consumeCode(user.id, 'reset_password', code);
    if (!valid) {
      return res.status(400).json({ error: 'Невалиден или изтекъл код. Изпратете нов.' });
    }

    const passwordHash = await bcrypt.hash(String(newPassword), 10);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, user.id]);

    res.json({ success: true });
  } catch (err) {
    console.error('POST /auth/reset-password failed:', err);
    res.status(500).json({ error: 'Възникна грешка при смяната на паролата. Опитайте отново.' });
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

    if (!user.email_verified) {
      return res.status(403).json({
        error: 'Моля, потвърдете имейл адреса си, за да влезете.',
        needsVerification: true,
        email: user.email,
      });
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
