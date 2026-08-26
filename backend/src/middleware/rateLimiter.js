const rateLimit = require('express-rate-limit');

/**
 * Strict rate limiter for the check-in endpoint
 * 60 requests per minute per IP (configurable via env)
 */
const checkInLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    status: 'RATE_LIMITED',
    message: 'Too many scan requests. Please slow down.',
  },
});

/**
 * General API rate limiter
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP. Try again later.' },
});

module.exports = { checkInLimiter, generalLimiter };
