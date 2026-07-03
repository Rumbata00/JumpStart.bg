# JumpStart API

Production backend for the JumpStart job board: Node.js + Express + PostgreSQL,
with JWT auth, job postings, applications, and saved jobs. Built to pair with
the `rabotabg.html` frontend.

Every route in this project has been run against a real PostgreSQL database
and tested end-to-end (34 automated checks: register/login, posting jobs,
applying, saving, permissions, and error cases) before delivery.

## Stack

- **Express** — HTTP server & routing
- **PostgreSQL** (via `pg`) — data storage
- **bcryptjs** — password hashing
- **jsonwebtoken** — auth sessions
- **helmet**, **cors**, **morgan** — standard production middleware

## Project structure

```
backend/
  src/
    app.js              Express app + middleware + route mounting
    server.js            Entry point (starts the HTTP server)
    db.js                PostgreSQL connection pool
    schema.sql            Table definitions
    migrate.js            Runs schema.sql against your database
    seed.js               Inserts 20 demo job listings (matches the old frontend mock data)
    middleware/auth.js    JWT verification, requireAuth / requireRole
    utils/jwt.js          Token sign/verify helpers
    routes/
      auth.routes.js       POST /register, POST /login, GET /me
      jobs.routes.js        GET /, GET /mine, GET /:id, POST /, POST /:id/apply
      applications.routes.js  GET / (my applications)
      saved.routes.js       GET /, POST /:jobId, DELETE /:jobId
  Dockerfile
  docker-compose.yml
  .env.example
```

## 1. Local setup (without Docker)

**Prerequisites:** Node.js 18+, PostgreSQL 14+ running locally.

```bash
cd backend
npm install
cp .env.example .env
```

Open `.env` and set:
- `JWT_SECRET` — generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `PGUSER` / `PGPASSWORD` / `PGDATABASE` — match your local Postgres

Create the database, then run migrations and seed demo data:

```bash
createdb jumpstart          # or: psql -c "CREATE DATABASE jumpstart;"
npm run migrate
npm run seed                # optional — adds 20 demo listings
npm run dev                 # starts on http://localhost:4000 (nodemon, auto-restart)
```

Confirm it's alive: `curl http://localhost:4000/api/health` → `{"ok":true}`

## 2. Local setup (with Docker Compose)

```bash
cd backend
docker compose up -d --build
docker compose exec api npm run migrate
docker compose exec api npm run seed     # optional
```

The API is now on `http://localhost:4000`, Postgres on `localhost:5432`.

## 3. Connecting the frontend

Open `rabotabg.html` and find this line near the top of the `<script>` block:

```js
const API_BASE = (window.JUMPSTART_API_BASE) || 'http://localhost:4000/api';
```

- **Local testing:** leave it as-is — it already points at your local server.
- **Production:** change the fallback URL to your deployed backend, e.g.
  `'https://api.yourdomain.com/api'`. Alternatively, leave the code untouched
  and add one line before the closing `</head>` tag:
  `<script>window.JUMPSTART_API_BASE = 'https://api.yourdomain.com/api';</script>`
  — useful if you serve the same HTML file against different backends
  (staging vs. production) without editing the file itself.

No other frontend changes are needed — job listings, registration/login,
posting jobs, applying, and saving all already call this API.

## 4. Deploying for real

Any host that runs Node + gives you a Postgres database works. Two easy paths:

**Railway / Render (simplest):**
1. Push this `backend/` folder to a GitHub repo.
2. Create a new Postgres database on the platform — it gives you a `DATABASE_URL`.
3. Create a new web service from your repo, set the start command to `node src/server.js`.
4. Set environment variables: `DATABASE_URL` (from step 2), `JWT_SECRET`, `CORS_ORIGIN` (your frontend's real URL).
5. After the first deploy, run `npm run migrate` and `npm run seed` once, either via the platform's shell/console or a one-off job.

**Any VM / your own server (Docker):**
1. Copy the `backend/` folder to the server.
2. Set real values in `docker-compose.yml` (`JWT_SECRET` especially) or override via a `.env` file.
3. `docker compose up -d --build`, then `docker compose exec api npm run migrate && docker compose exec api npm run seed`.
4. Put this behind a reverse proxy (nginx/Caddy) for HTTPS.

`db.js` already prefers `DATABASE_URL` when it's set (the standard most hosts
give you), so no code changes are needed for either path.

## 5. Security notes before going live

- Set a real, random `JWT_SECRET` — never reuse the one in `.env.example`.
- Set `CORS_ORIGIN` to your actual frontend domain instead of `*`.
- The database connection uses SSL by default when `DATABASE_URL` is set (`PGSSL=false` to disable, e.g. for a local Docker Postgres reached via a connection string).
- Consider adding rate limiting (e.g. `express-rate-limit`) on `/api/auth/*` before launch, to slow down credential-stuffing attempts.

## 6. API reference

All request/response bodies are JSON. Authenticated routes expect
`Authorization: Bearer <token>`.

| Method | Path                    | Auth            | Description                          |
|--------|-------------------------|-----------------|---------------------------------------|
| GET    | `/api/health`           | —               | Health check                          |
| GET    | `/api/jobs`             | —               | List jobs. Query: `kw, city, category, experience, type, remote` |
| GET    | `/api/jobs/:id`         | —               | Single job                            |
| GET    | `/api/jobs/mine`        | employer        | Jobs you've posted                    |
| POST   | `/api/jobs`             | employer        | Create a job                          |
| POST   | `/api/jobs/:id/apply`   | any logged-in   | Apply to a job                        |
| GET    | `/api/applications`     | any logged-in   | Job ids you've applied to             |
| GET    | `/api/saved`            | any logged-in   | Your saved jobs (full objects)        |
| POST   | `/api/saved/:jobId`     | any logged-in   | Save a job                            |
| DELETE | `/api/saved/:jobId`     | any logged-in   | Unsave a job                          |
| POST   | `/api/auth/register`    | —               | `{name, email, password, role}` → `{token, user}` |
| POST   | `/api/auth/login`       | —               | `{email, password}` → `{token, user}` |
| GET    | `/api/auth/me`          | any logged-in   | Current user                          |

Example:

```bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Ivan Petrov","email":"ivan@example.bg","password":"secret123","role":"candidate"}'
```
