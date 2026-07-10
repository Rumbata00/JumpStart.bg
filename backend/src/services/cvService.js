const db = require('../db');

function serializeCv(row) {
  if (!row) return null;
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

async function getCv(userId) {
  const result = await db.query('SELECT * FROM cvs WHERE user_id = $1', [userId]);
  return result.rows[0] || null;
}

// Merges `patch` on top of the user's existing CV (if any) and upserts.
// Only keys present in `patch` overwrite the existing value — everything
// else is left untouched, so callers can save partial updates.
async function upsertCv(userId, patch) {
  const existing = await getCv(userId);
  const merged = {
    fullName: patch.fullName !== undefined ? patch.fullName : existing?.full_name || '',
    email: patch.email !== undefined ? patch.email : existing?.email || '',
    phone: patch.phone !== undefined ? patch.phone : existing?.phone || '',
    city: patch.city !== undefined ? patch.city : existing?.city || '',
    summary: patch.summary !== undefined ? patch.summary : existing?.summary || '',
    skills: patch.skills !== undefined ? patch.skills : existing?.skills || [],
    experience: patch.experience !== undefined ? patch.experience : existing?.experience || [],
    education: patch.education !== undefined ? patch.education : existing?.education || [],
    languages: patch.languages !== undefined ? patch.languages : existing?.languages || [],
  };

  if (!merged.fullName || String(merged.fullName).trim().length < 2) {
    throw Object.assign(new Error('Моля, въведете вашето име.'), { status: 400 });
  }

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
      userId,
      String(merged.fullName).trim(),
      merged.email ? String(merged.email).trim() : '',
      merged.phone ? String(merged.phone).trim() : '',
      merged.city ? String(merged.city).trim() : '',
      merged.summary ? String(merged.summary) : '',
      JSON.stringify(Array.isArray(merged.skills) ? merged.skills : []),
      JSON.stringify(Array.isArray(merged.experience) ? merged.experience : []),
      JSON.stringify(Array.isArray(merged.education) ? merged.education : []),
      JSON.stringify(Array.isArray(merged.languages) ? merged.languages : []),
    ]
  );
  return result.rows[0];
}

module.exports = { serializeCv, getCv, upsertCv };
