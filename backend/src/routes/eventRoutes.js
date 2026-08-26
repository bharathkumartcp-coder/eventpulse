const express = require('express');
const { body } = require('express-validator');
const {
  createEvent, listEvents, getEvent, updateEvent, deleteEvent,
} = require('../controllers/eventController');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router();

// All event routes require authentication
router.use(requireAuth);

router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Event name is required.'),
    body('event_date').optional().isISO8601().withMessage('Invalid date format.'),
  ],
  validate,
  createEvent
);

router.get('/', listEvents);

router.get('/:eventId', getEvent);

router.put(
  '/:eventId',
  [
    body('name').optional().trim().notEmpty().withMessage('Event name cannot be empty.'),
    body('event_date').optional().isISO8601().withMessage('Invalid date format.'),
  ],
  validate,
  updateEvent
);

router.delete('/:eventId', deleteEvent);

module.exports = router;
