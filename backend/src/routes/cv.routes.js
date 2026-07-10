const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('../middleware/auth');
const cvService = require('../services/cvService');

const router = express.Router();

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Твърде много заявки. Опитайте отново по-късно.' },
});

// GET /api/cv — the logged-in user's CV, or null if they haven't created one.
router.get('/', requireAuth, async (req, res) => {
  try {
    const cv = await cvService.getCv(req.user.id);
    res.json({ cv: cvService.serializeCv(cv) });
  } catch (err) {
    console.error('GET /cv failed:', err);
    res.status(500).json({ error: 'Възникна грешка при зареждане на автобиографията.' });
  }
});

// PUT /api/cv — create or update (upsert) the logged-in user's CV.
router.put('/', writeLimiter, requireAuth, async (req, res) => {
  const { fullName, email, phone, city, summary, skills, experience, education, languages } = req.body || {};
  try {
    const row = await cvService.upsertCv(req.user.id, { fullName, email, phone, city, summary, skills, experience, education, languages });
    res.json({ cv: cvService.serializeCv(row) });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('PUT /cv failed:', err);
    res.status(500).json({ error: 'Възникна грешка при запазването на автобиографията.' });
  }
});

module.exports = router;
