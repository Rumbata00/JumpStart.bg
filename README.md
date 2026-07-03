# JumpStart — Job Board

A Bulgarian job-board site with a real backend.

## Structure

- **`index.html`** — the site (React, single file, no build step). Open it directly in a browser, or serve it as a static file from any host (e.g. GitHub Pages).
- **`backend/`** — Node.js + Express + PostgreSQL API (auth, job postings, applications, saved jobs). See `backend/README.md` for setup, local development, and deployment instructions.
- **`assets/`** — logo source images (`logo.jpg`, `logo-transparent.png`). The site itself renders the logo as inline SVG (see the `RocketJLogo` component in `index.html`); these files are kept here as source assets — handy for a favicon, social preview image, or anywhere you need a flat image instead.

## Quick start

```bash
cd backend
npm install
cp .env.example .env    # then edit JWT_SECRET and DB credentials
npm run migrate
npm run seed             # optional demo data
npm run dev
```

Then open `index.html` in a browser — it already points at
`http://localhost:4000/api` by default.

Full details, deployment options, and the API reference are in
[`backend/README.md`](backend/README.md).
