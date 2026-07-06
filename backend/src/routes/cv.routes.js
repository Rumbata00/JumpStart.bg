const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function serializeCv(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    city: row.city,
    summary: row.summary,
    skills: row.skills,
    experience: row.experience,
    education: row.education,
    languages: row.languages,
    updatedAt: row.updated_at,
  };
}

// GET /api/cv — the logged-in user's CV, or null if they haven't created one.
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM cvs WHERE user_id = $1', [req.user.id]);
    res.json({ cv: result.rows[0] ? serializeCv(result.rows[0]) : null });
  } catch (err) {
    console.error('GET /cv failed:', err);
    res.status(500).json({ error: 'Възникна грешка при зареждане на автобиографията.' });
  }
});

// PUT /api/cv — create or update (upsert) the logged-in user's CV.
router.put('/', requireAuth, async (req, res) => {
  const { fullName, email, phone, city, summary, skills, experience, education, languages } = req.body || {};

  if (!fullName || String(fullName).trim().length < 2) {
    return res.status(400).json({ error: 'Моля, въведете вашето име.' });
  }

  try {
    const result = await db.query(
      `INSERT INTO cvs (user_id, full_name, email, phone, city, summary, skills, experience, education, languages, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
       ON CONFLICT (user_id) DO UPDATE SET
         full_name  = EXCLUDED.full_name,
         email      = EXCLUDED.email,
         phone      = EXCLUDED.phone,
         city       = EXCLUDED.city,
         summary    = EXCLUDED.summary,
         skills     = EXCLUDED.skills,
         experience = EXCLUDED.experience,
         education  = EXCLUDED.education,
         languages  = EXCLUDED.languages,
         updated_at = now()
       RETURNING *`,
      [
        req.user.id,
        String(fullName).trim(),
        email ? String(email).trim() : '',
        phone ? String(phone).trim() : '',
        city ? String(city).trim() : '',
        summary ? String(summary) : '',
        JSON.stringify(Array.isArray(skills) ? skills : []),
        JSON.stringify(Array.isArray(experience) ? experience : []),
        JSON.stringify(Array.isArray(education) ? education : []),
        JSON.stringify(Array.isArray(languages) ? languages : []),
      ]
    );
    res.json({ cv: serializeCv(result.rows[0]) });
  } catch (err) {
    console.error('PUT /cv failed:', err);
    res.status(500).json({ error: 'Възникна грешка при запазването на автобиографията.' });
  }
});

module.exports = router;
