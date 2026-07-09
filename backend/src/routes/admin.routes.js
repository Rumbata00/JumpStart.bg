const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/admin/stats — admin-only overview of signups and site activity.
router.get('/stats', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const [totals, byRole, byDay, recent] = await Promise.all([
      db.query(`
        SELECT
          (SELECT COUNT(*) FROM users)::int        AS total_users,
          (SELECT COUNT(*) FROM jobs)::int          AS total_jobs,
          (SELECT COUNT(*) FROM applications)::int  AS total_applications
      `),
      db.query(`SELECT role, COUNT(*)::int AS count FROM users GROUP BY role`),
      db.query(`
        SELECT to_char(created_at, 'YYYY-MM-DD') AS date, COUNT(*)::int AS count
        FROM users
        WHERE created_at >= now() - interval '30 days'
        GROUP BY date
        ORDER BY date
      `),
      db.query(`
        SELECT id, name, email, role, created_at
        FROM users
        ORDER BY created_at DESC
        LIMIT 20
      `),
    ]);

    const roleCounts = { candidate: 0, employer: 0, admin: 0 };
    byRole.rows.forEach((r) => { roleCounts[r.role] = r.count; });

    res.json({
      totalUsers: totals.rows[0].total_users,
      totalJobs: totals.rows[0].total_jobs,
      totalApplications: totals.rows[0].total_applications,
      roleCounts,
      registrationsByDay: byDay.rows,
      recentUsers: recent.rows.map((u) => ({
        id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.created_at,
      })),
    });
  } catch (err) {
    console.error('GET /admin/stats failed:', err);
    res.status(500).json({ error: 'Възникна грешка при зареждане на статистиката.' });
  }
});

// GET /api/admin/users — full user list for moderation.
router.get('/users', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, email, role, is_banned, created_at FROM users ORDER BY created_at DESC`
    );
    res.json({
      users: result.rows.map((u) => ({
        id: u.id, name: u.name, email: u.email, role: u.role, isBanned: u.is_banned, createdAt: u.created_at,
      })),
    });
  } catch (err) {
    console.error('GET /admin/users failed:', err);
    res.status(500).json({ error: 'Възникна грешка при зареждане на потребителите.' });
  }
});

// PATCH /api/admin/users/:id/ban — toggle a user's banned status.
router.patch('/users/:id/ban', requireAuth, requireRole('admin'), async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Невалиден идентификатор.' });
  const { banned } = req.body || {};
  if (typeof banned !== 'boolean') return res.status(400).json({ error: 'Невалидна стойност.' });
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'Не можете да блокирате собствения си профил.' });
  }

  try {
    const result = await db.query(
      'UPDATE users SET is_banned = $1 WHERE id = $2 RETURNING id, is_banned',
      [banned, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Потребителят не е намерен.' });
    res.json({ id: result.rows[0].id, isBanned: result.rows[0].is_banned });
  } catch (err) {
    console.error('PATCH /admin/users/:id/ban failed:', err);
    res.status(500).json({ error: 'Възникна грешка при обновяването на потребителя.' });
  }
});

// GET /api/admin/jobs — all jobs, for moderation.
router.get('/jobs', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT j.id, j.title, j.company, j.city, j.created_at, u.name AS owner_name, u.email AS owner_email
      FROM jobs j
      LEFT JOIN users u ON u.id = j.owner_id
      ORDER BY j.created_at DESC
    `);
    res.json({
      jobs: result.rows.map((j) => ({
        id: j.id, title: j.title, company: j.company, city: j.city, createdAt: j.created_at,
        ownerName: j.owner_name, ownerEmail: j.owner_email,
      })),
    });
  } catch (err) {
    console.error('GET /admin/jobs failed:', err);
    res.status(500).json({ error: 'Възникна грешка при зареждане на обявите.' });
  }
});

// DELETE /api/admin/jobs/:id — admin override, not restricted to the owner.
router.delete('/jobs/:id', requireAuth, requireRole('admin'), async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Невалиден идентификатор.' });
  try {
    const result = await db.query('DELETE FROM jobs WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Обявата не е намерена.' });
    res.json({ deleted: true });
  } catch (err) {
    console.error('DELETE /admin/jobs/:id failed:', err);
    res.status(500).json({ error: 'Възникна грешка при изтриването на обявата.' });
  }
});

module.exports = router;
