# JumpStart — Job Board

A Bulgarian job-board site with a real backend.

## Structure

- **`frontend/rabotabg.html`** — the site (React, single file, no build step). Open it directly in a browser, or serve it as a static file from any host.
- **`backend/`** — Node.js + Express + PostgreSQL API (auth, job postings, applications, saved jobs). See `backend/README.md` for setup, local development, and deployment instructions.

## Quick start

```bash
cd backend
npm install
cp .env.example .env    # then edit JWT_SECRET and DB credentials
npm run migrate
npm run seed             # optional demo data
npm run dev
```

Then open `frontend/rabotabg.html` in a browser — it already points at
`http://localhost:4000/api` by default.

Full details, deployment options, and the API reference are in
[`backend/README.md`](backend/README.md).
