const express = require('express');
const { body } = require('express-validator');
const multer = require('multer');
const {
  addAttendee, listAttendees, importAttendees, getAttendeeQR, exportAttendees,
} = require('../controllers/attendeeController');
const { requireAuth, requireEventOwner } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router({ mergeParams: true });

// In-memory storage for CSV uploads (max 5MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed.'));
    }
  },
});

// All attendee routes require auth + event ownership
router.use(requireAuth, requireEventOwner);

// Export must come before :attendeeId routes to avoid route conflict
router.get('/export', exportAttendees);

router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Attendee name is required.'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required.'),
  ],
  validate,
  addAttendee
);

router.get('/', listAttendees);

router.post('/import', upload.single('file'), importAttendees);

router.get('/:attendeeId/qr', getAttendeeQR);

module.exports = router;
