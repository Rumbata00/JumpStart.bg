const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/applications — job ids the current user has applied to.
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT job_id, applied_at FROM applications WHERE user_id = $1 ORDER BY applied_at DESC',
      [req.user.id]
    );
    res.json({
      jobIds: result.rows.map((r) => r.job_id),
      applications: result.rows.map((r) => ({ jobId: r.job_id, appliedAt: r.applied_at })),
    });
  } catch (err) {
    console.error('GET /applications failed:', err);
    res.status(500).json({ error: 'Възникна грешка при зареждане на кандидатурите.' });
  }
});

module.exports = router;
