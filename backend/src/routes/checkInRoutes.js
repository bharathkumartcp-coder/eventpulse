const express = require('express');
const { body } = require('express-validator');
const { checkIn } = require('../controllers/checkInController');
const { getDashboard, getAnalytics, listCheckIns, listInvalidScans } = require('../controllers/analyticsController');
const { requireAuth, requireEventOwner } = require('../middleware/auth');
const { checkInLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validate');

const router = express.Router({ mergeParams: true });

// All routes require auth + event ownership
router.use(requireAuth, requireEventOwner);

/**
 * POST /api/events/:eventId/check-in
 * Rate-limited. Core check-in endpoint.
 */
router.post(
  '/check-in',
  checkInLimiter,
  [
    body('qrToken').trim().notEmpty().withMessage('QR token is required.'),
    body('entryPoint').optional().trim().isLength({ max: 100 }).withMessage('Entry point too long.'),
  ],
  validate,
  checkIn
);

router.get('/dashboard', getDashboard);
router.get('/analytics', getAnalytics);
router.get('/checkins', listCheckIns);
router.get('/invalid-scans', listInvalidScans);

module.exports = router;
