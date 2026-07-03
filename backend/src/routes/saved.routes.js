const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function serializeJob(row) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    category: row.category,
    company: row.company,
    companyColor: row.company_color,
    companyInit: row.company_init,
    city: row.city,
    isRemote: row.is_remote,
    type: row.type,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    experience: row.experience,
    description: row.description,
    responsibilities: row.responsibilities,
    requirements: row.requirements,
    benefits: row.benefits,
    createdAt: row.created_at,
  };
}

// GET /api/saved — full job objects the user has saved.
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT j.* FROM saved_jobs s
       JOIN jobs j ON j.id = s.job_id
       WHERE s.user_id = $1
       ORDER BY s.saved_at DESC`,
      [req.user.id]
    );
    res.json({ jobs: result.rows.map(serializeJob) });
  } catch (err) {
    console.error('GET /saved failed:', err);
    res.status(500).json({ error: 'Възникна грешка при зареждане на запазените обяви.' });
  }
});

// POST /api/saved/:jobId
router.post('/:jobId', requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.jobId)) return res.status(400).json({ error: 'Невалиден идентификатор.' });
  try {
    await db.query(
      `INSERT INTO saved_jobs (user_id, job_id) VALUES ($1, $2)
       ON CONFLICT (user_id, job_id) DO NOTHING`,
      [req.user.id, req.params.jobId]
    );
    res.status(201).json({ saved: true });
  } catch (err) {
    console.error('POST /saved/:jobId failed:', err);
    res.status(500).json({ error: 'Възникна грешка.' });
  }
});

// DELETE /api/saved/:jobId
router.delete('/:jobId', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM saved_jobs WHERE user_id = $1 AND job_id = $2', [req.user.id, req.params.jobId]);
    res.json({ saved: false });
  } catch (err) {
    console.error('DELETE /saved/:jobId failed:', err);
    res.status(500).json({ error: 'Възникна грешка.' });
  }
});

module.exports = router;
