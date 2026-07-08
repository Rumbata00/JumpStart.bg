const express = require('express');
const rateLimit = require('express-rate-limit');
const { sendContactMessage } = require('../mailer');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Keeps the form from being used to spam the inbox.
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Твърде много съобщения. Опитайте отново по-късно.' },
});

router.post('/', contactLimiter, async (req, res) => {
  const { name, email, message } = req.body || {};

  if (!name || String(name).trim().length < 2) {
    return res.status(400).json({ error: 'Моля, въведете вашето име.' });
  }
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Въведете валиден имейл адрес.' });
  }
  if (!message || String(message).trim().length < 5) {
    return res.status(400).json({ error: 'Съобщението е твърде кратко.' });
  }

  try {
    await sendContactMessage({
      name: String(name).trim(),
      email: String(email).trim(),
      message: String(message).trim(),
    });
    res.json({ sent: true });
  } catch (err) {
    console.error('POST /contact failed:', err);
    res.status(500).json({ error: 'Възникна грешка при изпращането. Опитайте отново.' });
  }
});

module.exports = router;
