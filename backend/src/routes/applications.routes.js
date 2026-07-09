const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Твърде много заявки. Опитайте отново по-късно.' },
});

// GET /api/applications — job ids the current user has applied to.
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT job_id, applied_at, status FROM applications WHERE user_id = $1 ORDER BY applied_at DESC',
      [req.user.id]
    );
    res.json({
      jobIds: result.rows.map((r) => r.job_id),
      applications: result.rows.map((r) => ({ jobId: r.job_id, appliedAt: r.applied_at, status: r.status })),
    });
  } catch (err) {
    console.error('GET /applications failed:', err);
    res.status(500).json({ error: 'Възникна грешка при зареждане на кандидатурите.' });
  }
});

const VALID_STATUSES = ['pending', 'reviewed', 'rejected', 'hired'];

// PATCH /api/applications/:id/status — employer-only, and only for
// applications to a job they own.
router.patch('/:id/status', writeLimiter, requireAuth, requireRole('employer'), async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Невалиден идентификатор.' });
  const { status } = req.body || {};
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Невалиден статус.' });
  }

  try {
    const appResult = await db.query(
      `SELECT a.id, j.owner_id FROM applications a JOIN jobs j ON j.id = a.job_id WHERE a.id = $1`,
      [req.params.id]
    );
    if (appResult.rows.length === 0) return res.status(404).json({ error: 'Кандидатурата не е намерена.' });
    if (appResult.rows[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Нямате права да промените тази кандидатура.' });
    }

    const result = await db.query(
      'UPDATE applications SET status = $1 WHERE id = $2 RETURNING id, status',
      [status, req.params.id]
    );
    res.json({ application: result.rows[0] });
  } catch (err) {
    console.error('PATCH /applications/:id/status failed:', err);
    res.status(500).json({ error: 'Възникна грешка при обновяването на статуса.' });
  }
});

module.exports = router;
