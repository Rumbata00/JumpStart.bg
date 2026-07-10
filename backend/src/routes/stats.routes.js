const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/stats — public, real-time platform numbers for the homepage.
// Active listings and hiring companies are already derivable client-side
// from the loaded job list, so this only serves what isn't: the total
// registered user count. No auth required; nothing here is sensitive.
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT COUNT(*)::int AS users FROM users');
    res.json({ users: result.rows[0].users });
  } catch (err) {
    console.error('GET /stats failed:', err);
    res.status(500).json({ error: 'Възникна грешка при зареждане на статистиката.' });
  }
});

module.exports = router;
