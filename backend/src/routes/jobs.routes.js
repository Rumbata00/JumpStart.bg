const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Only guards the write endpoints below (create/edit/delete/apply) — job
// search/browsing (GET) stays unlimited.
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Твърде много заявки. Опитайте отново по-късно.' },
});

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

// GET /api/jobs/:id/applicants — candidates who applied, for the job's owner only.
// The CV (if the candidate has created one) is included so the employer can
// judge fit without a separate request per applicant.
router.get('/:id/applicants', requireAuth, requireRole('employer'), async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Невалиден идентификатор.' });
  try {
    const jobResult = await db.query('SELECT owner_id FROM jobs WHERE id = $1', [req.params.id]);
    if (jobResult.rows.length === 0) return res.status(404).json({ error: 'Обявата не е намерена.' });
    if (jobResult.rows[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Нямате права да видите кандидатите за тази обява.' });
    }

    const result = await db.query(
      `SELECT u.id, u.name, u.email, a.id AS application_id, a.applied_at, a.status,
              c.full_name, c.phone, c.city, c.summary, c.skills, c.experience, c.education, c.languages
       FROM applications a
       JOIN users u ON u.id = a.user_id
       LEFT JOIN cvs c ON c.user_id = u.id
       WHERE a.job_id = $1
       ORDER BY a.applied_at DESC`,
      [req.params.id]
    );

    const applicants = result.rows.map((row) => ({
      id: row.id,
      applicationId: row.application_id,
      name: row.name,
      email: row.email,
      appliedAt: row.applied_at,
      status: row.status,
      cv: row.full_name === null ? null : {
        fullName: row.full_name,
        phone: row.phone,
        city: row.city,
        summary: row.summary,
        skills: row.skills,
        experience: row.experience,
        education: row.education,
        languages: row.languages,
      },
    }));

    res.json({ applicants });
  } catch (err) {
    console.error('GET /jobs/:id/applicants failed:', err);
    res.status(500).json({ error: 'Възникна грешка при зареждане на кандидатите.' });
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
router.post('/', writeLimiter, requireAuth, requireRole('employer'), async (req, res) => {
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

// PUT /api/jobs/:id — owner-only edit.
router.put('/:id', writeLimiter, requireAuth, requireRole('employer'), async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Невалиден идентификатор.' });

  const {
    title, company, city, type, category,
    salaryMin, salaryMax, description,
    responsibilities, requirements, benefits,
  } = req.body || {};

  if (!title || !company || !description) {
    return res.status(400).json({ error: 'Длъжност, компания и описание са задължителни.' });
  }

  try {
    const existing = await db.query('SELECT owner_id FROM jobs WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Обявата не е намерена.' });
    if (existing.rows[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Нямате права да редактирате тази обява.' });
    }

    const companyInit = String(company).trim().slice(0, 2).toUpperCase();
    const min = parseInt(salaryMin, 10) || null;
    const max = parseInt(salaryMax, 10) || (min ? min + 500 : null);

    const result = await db.query(
      `UPDATE jobs SET
        title = $1, category = $2, company = $3, company_init = $4,
        city = $5, is_remote = $6, type = $7, salary_min = $8, salary_max = $9,
        description = $10, responsibilities = $11, requirements = $12, benefits = $13
       WHERE id = $14
       RETURNING *`,
      [
        title, category || 'it', company, companyInit,
        city || 'София', type === 'Дистанционна работа', type || 'Пълен работен ден',
        min, max,
        description,
        JSON.stringify(responsibilities && responsibilities.length ? responsibilities : ['Изпълнение на задачите, описани от работодателя']),
        JSON.stringify(requirements && requirements.length ? requirements : ['Виж пълно описание по-горе']),
        JSON.stringify(benefits && benefits.length ? benefits : ['Обсъжда се на интервю']),
        req.params.id,
      ]
    );
    res.json({ job: serializeJob(result.rows[0]) });
  } catch (err) {
    console.error('PUT /jobs/:id failed:', err);
    res.status(500).json({ error: 'Възникна грешка при редактирането на обявата.' });
  }
});

// DELETE /api/jobs/:id — owner-only. Cascades to applications/saved_jobs
// referencing this job (schema.sql has ON DELETE CASCADE on both).
router.delete('/:id', writeLimiter, requireAuth, requireRole('employer'), async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Невалиден идентификатор.' });
  try {
    const existing = await db.query('SELECT owner_id FROM jobs WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Обявата не е намерена.' });
    if (existing.rows[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Нямате права да изтриете тази обява.' });
    }

    await db.query('DELETE FROM jobs WHERE id = $1', [req.params.id]);
    res.json({ deleted: true });
  } catch (err) {
    console.error('DELETE /jobs/:id failed:', err);
    res.status(500).json({ error: 'Възникна грешка при изтриването на обявата.' });
  }
});

// POST /api/jobs/:id/apply
router.post('/:id/apply', writeLimiter, requireAuth, async (req, res) => {
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
