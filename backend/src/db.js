const { Pool } = require('pg');
require('dotenv').config();

// A single shared connection pool for the whole app.
// Connection info comes from DATABASE_URL if present (standard for most
// hosts: Railway, Render, Supabase, Neon, etc.), otherwise falls back to
// individual PG* vars for local development.
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
    })
  : new Pool({
      host: process.env.PGHOST || 'localhost',
      port: process.env.PGPORT || 5432,
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'postgres',
      database: process.env.PGDATABASE || 'jumpstart',
    });

pool.on('error', (err) => {
  // Errors on idle clients shouldn't crash the whole process.
  console.error('Unexpected error on idle PG client', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
