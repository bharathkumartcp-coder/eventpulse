const { verifyToken } = require('../config/jwt');
const supabase = require('../config/supabase');

/**
 * Middleware: verify Bearer JWT and attach organizer to req.user
 */
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    // Verify the organizer still exists in DB
    const { data: organizer, error } = await supabase
      .from('organizers')
      .select('id, name, email')
      .eq('id', decoded.id)
      .single();

    if (error || !organizer) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }

    req.user = organizer;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid token.' });
  }
}

/**
 * Middleware: verify the authenticated user owns the event
 * Must be used after requireAuth. Reads :eventId from params.
 */
async function requireEventOwner(req, res, next) {
  try {
    const { eventId } = req.params;
    const { data: event, error } = await supabase
      .from('events')
      .select('id, created_by')
      .eq('id', eventId)
      .single();

    if (error || !event) {
      return res.status(404).json({ error: 'Event not found.' });
    }

    if (event.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied. You do not own this event.' });
    }

    req.event = event;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Authorization check failed.' });
  }
}

module.exports = { requireAuth, requireEventOwner };
