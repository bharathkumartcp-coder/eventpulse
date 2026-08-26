require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { generalLimiter } = require('./middleware/rateLimiter');

// Route imports
const authRoutes    = require('./routes/authRoutes');
const eventRoutes   = require('./routes/eventRoutes');
const attendeeRoutes = require('./routes/attendeeRoutes');
const checkInRoutes  = require('./routes/checkInRoutes');

const app = express();
const PORT = process.env.PORT || 4000;

// ── Security Headers ─────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.CORS_ORIGIN || 'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow mobile apps, curl, or server-to-server requests
    if (!origin) return callback(null, true);
    // Allow any localhost/127.0.0.1 or dev server
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) return callback(null, true);
    if (allowedOrigins.some(o => origin.startsWith(o) || o === '*')) return callback(null, true);
    // In development mode, allow all origins
    if (process.env.NODE_ENV !== 'production') return callback(null, true);
    return callback(null, true);
  },
  credentials: true,
}));

// ── Body Parsers ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── General Rate Limiting ─────────────────────────────────────────────────────
app.use(generalLimiter);

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',                                  authRoutes);
app.use('/api/events',                                eventRoutes);
app.use('/api/events/:eventId/attendees',             attendeeRoutes);
app.use('/api/events/:eventId',                       checkInRoutes);

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  // Don't expose internal error details in production
  const message = process.env.NODE_ENV === 'production'
    ? 'An unexpected error occurred.'
    : err.message;
  res.status(err.status || 500).json({ error: message });
});

// ── Start Server ──────────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🚀 EventPulse API running on port ${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Supabase:    ${process.env.SUPABASE_URL ? '✅ Connected' : '⚡ Local Database Mode'}`);
    console.log(`   Health:      http://localhost:${PORT}/health\n`);
  });
}

module.exports = app;
