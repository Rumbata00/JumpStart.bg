const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

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

// GET /api/jobs?kw=&city=&category=&experience=&type=&remote=true
router.get('/', async (req, res) => {
  const { kw, city, category, experience, type, remote } = req.query;

  const clauses = [];
  const params = [];

  if (kw) {
    params.push(`%${kw}%`);
    clauses.push(`(title ILIKE $${params.length} OR company ILIKE $${params.length})`);
  }
  if (city && city !== 'Всички градове') {
    params.push(city);
    clauses.push(`city = $${params.length}`);
  }
  if (category && category !== 'Всички категории') {
    params.push(category);
    clauses.push(`category = $${params.length}`);
  }
  if (experience && experience !== 'Всяко ниво') {
    params.push(experience);
    clauses.push(`experience = $${params.length}`);
  }
  if (type && type !== 'Всички') {
    params.push(type);
    clauses.push(`type = $${params.length}`);
  }
  if (remote === 'true') {
    clauses.push(`is_remote = true`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  try {
    const result = await db.query(
      `SELECT * FROM jobs ${where} ORDER BY created_at DESC LIMIT 500`,
      params
    );
    res.json({ jobs: result.rows.map(serializeJob) });
  } catch (err) {
    console.error('GET /jobs failed:', err);
    res.status(500).json({ error: 'Възникна грешка при зареждане на обявите.' });
  }
});

// GET /api/jobs/mine — jobs posted by the logged-in employer.
// Declared before "/:id" so "mine" is never parsed as an id.
router.get('/mine', requireAuth, requireRole('employer'), async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM jobs WHERE owner_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ jobs: result.rows.map(serializeJob) });
  } catch (err) {
    console.error('GET /jobs/mine failed:', err);
    res.status(500).json({ error: 'Възникна грешка при зареждане на вашите обяви.' });
  }
});

router.get('/:id', async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Невалиден идентификатор.' });
  try {
    const result = await db.query('SELECT * FROM jobs WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Обявата не е намерена.' });
    res.json({ job: serializeJob(result.rows[0]) });
  } catch (err) {
    console.error('GET /jobs/:id failed:', err);
    res.status(500).json({ error: 'Възникна грешка.' });
  }
});

// POST /api/jobs — employers only.
router.post('/', requireAuth, requireRole('employer'), async (req, res) => {
  const {
    title, company, city, type, category,
    salaryMin, salaryMax, description,
    responsibilities, requirements, benefits,
  } = req.body || {};

  if (!title || !company || !description) {
    return res.status(400).json({ error: 'Длъжност, компания и описание са задължителни.' });
  }

  const companyInit = String(company).trim().slice(0, 2).toUpperCase();
  const min = parseInt(salaryMin, 10) || null;
  const max = parseInt(salaryMax, 10) || (min ? min + 500 : null);

  try {
    const result = await db.query(
      `INSERT INTO jobs
        (owner_id, title, category, company, company_color, company_init,
         city, is_remote, type, salary_min, salary_max, experience,
         description, responsibilities, requirements, benefits)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        req.user.id, title, category || 'it', company, '#16233F', companyInit,
        city || 'София', type === 'Дистанционна работа', type || 'Пълен работен ден',
        min, max, 'Всяко ниво',
        description,
        JSON.stringify(responsibilities && responsibilities.length ? responsibilities : ['Изпълнение на задачите, описани от работодателя']),
        JSON.stringify(requirements && requirements.length ? requirements : ['Виж пълно описание по-горе']),
        JSON.stringify(benefits && benefits.length ? benefits : ['Обсъжда се на интервю']),
      ]
    );
    res.status(201).json({ job: serializeJob(result.rows[0]) });
  } catch (err) {
    console.error('POST /jobs failed:', err);
    res.status(500).json({ error: 'Възникна грешка при публикуването на обявата.' });
  }
});

// POST /api/jobs/:id/apply
router.post('/:id/apply', requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Невалиден идентификатор.' });
  try {
    const job = await db.query('SELECT id FROM jobs WHERE id = $1', [req.params.id]);
    if (job.rows.length === 0) return res.status(404).json({ error: 'Обявата не е намерена.' });

    await db.query(
      `INSERT INTO applications (user_id, job_id) VALUES ($1, $2)
       ON CONFLICT (user_id, job_id) DO NOTHING`,
      [req.user.id, req.params.id]
    );
    res.status(201).json({ applied: true });
  } catch (err) {
    console.error('POST /jobs/:id/apply failed:', err);
    res.status(500).json({ error: 'Възникна грешка при изпращане на кандидатурата.' });
  }
});

module.exports = router;
