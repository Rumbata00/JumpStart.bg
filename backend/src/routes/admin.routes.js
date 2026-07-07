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

module.exports = router;
