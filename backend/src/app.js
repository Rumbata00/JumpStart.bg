const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const authRoutes = require('./routes/auth.routes');
const jobsRoutes = require('./routes/jobs.routes');
const applicationsRoutes = require('./routes/applications.routes');
const savedRoutes = require('./routes/saved.routes');
const cvRoutes = require('./routes/cv.routes');
const chatRoutes = require('./routes/chat.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();

// Render (and most cloud hosts) sit behind a reverse proxy that sets
// X-Forwarded-For. Without this, express-rate-limit can't safely read the
// real client IP and throws on every request.
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/applications', applicationsRoutes);
app.use('/api/saved', savedRoutes);
app.use('/api/cv', cvRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);

// 404 for unknown API routes
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Centralized error handler (catches anything thrown/rejected and missed above)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Възникна неочаквана грешка на сървъра.' });
});

module.exports = app;
