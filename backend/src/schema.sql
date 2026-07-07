-- JumpStart job board — database schema
-- Run via: npm run migrate  (see src/migrate.js)

CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(255)  NOT NULL,
  email          VARCHAR(255)  NOT NULL UNIQUE,
  password_hash  VARCHAR(255)  NOT NULL,
  role           VARCHAR(20)   NOT NULL CHECK (role IN ('candidate','employer','admin')),
  email_verified BOOLEAN       NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;

-- Widen the role check to allow 'admin' (originally just candidate/employer).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('candidate','employer','admin'));

-- Shared by both the registration-verification and forgot-password flows.
CREATE TABLE IF NOT EXISTS verification_codes (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code        VARCHAR(6)  NOT NULL,
  purpose     VARCHAR(20) NOT NULL CHECK (purpose IN ('verify_email','reset_password')),
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id              SERIAL PRIMARY KEY,
  owner_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  title           VARCHAR(255)  NOT NULL,
  category        VARCHAR(50)   NOT NULL,
  company         VARCHAR(255)  NOT NULL,
  company_color   VARCHAR(20)   NOT NULL DEFAULT '#16233F',
  company_init    VARCHAR(4)    NOT NULL DEFAULT '',
  city            VARCHAR(100)  NOT NULL,
  is_remote       BOOLEAN       NOT NULL DEFAULT false,
  type            VARCHAR(60)   NOT NULL,
  salary_min      INTEGER,
  salary_max      INTEGER,
  experience      VARCHAR(60)   NOT NULL DEFAULT 'Всяко ниво',
  description     TEXT          NOT NULL DEFAULT '',
  responsibilities JSONB        NOT NULL DEFAULT '[]',
  requirements    JSONB         NOT NULL DEFAULT '[]',
  benefits        JSONB         NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS applications (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id      INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, job_id)
);

CREATE TABLE IF NOT EXISTS saved_jobs (
  id        SERIAL PRIMARY KEY,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id    INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  saved_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, job_id)
);

CREATE TABLE IF NOT EXISTS cvs (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  full_name   VARCHAR(255) NOT NULL DEFAULT '',
  email       VARCHAR(255) NOT NULL DEFAULT '',
  phone       VARCHAR(60)  NOT NULL DEFAULT '',
  city        VARCHAR(100) NOT NULL DEFAULT '',
  summary     TEXT         NOT NULL DEFAULT '',
  skills      JSONB        NOT NULL DEFAULT '[]',
  experience  JSONB        NOT NULL DEFAULT '[]',
  education   JSONB        NOT NULL DEFAULT '[]',
  languages   JSONB        NOT NULL DEFAULT '[]',
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_category   ON jobs(category);
CREATE INDEX IF NOT EXISTS idx_jobs_city        ON jobs(city);
CREATE INDEX IF NOT EXISTS idx_jobs_owner       ON jobs(owner_id);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at  ON jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_apps_user        ON applications(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_user       ON saved_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_cvs_user         ON cvs(user_id);
CREATE INDEX IF NOT EXISTS idx_verif_user       ON verification_codes(user_id, purpose);
