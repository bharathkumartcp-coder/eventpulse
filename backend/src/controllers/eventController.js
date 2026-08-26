const supabase = require('../config/supabase');

/**
 * POST /api/events
 * Create a new event
 */
async function createEvent(req, res) {
  try {
    const { name, description, venue, event_date, start_time } = req.body;

    const { data: event, error } = await supabase
      .from('events')
      .insert({
        name: name.trim(),
        description: description?.trim(),
        venue: venue?.trim(),
        event_date: event_date || null,
        start_time: start_time || null,
        created_by: req.user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('Create event error:', error);
      return res.status(500).json({ error: 'Failed to create event.' });
    }

    return res.status(201).json({ message: 'Event created.', event });
  } catch (err) {
    console.error('Create event exception:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

/**
 * GET /api/events
 * List all events for the authenticated organizer
 */
async function listEvents(req, res) {
  try {
    const { data: events, error } = await supabase
      .from('events')
      .select(`
        *,
        attendees(count),
        checkins(count)
      `)
      .eq('created_by', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('List events error:', error);
      return res.status(500).json({ error: 'Failed to fetch events.' });
    }

    return res.json({ events });
  } catch (err) {
    console.error('List events exception:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

/**
 * GET /api/events/:eventId
 * Get a single event (ownership enforced by requireEventOwner middleware)
 */
async function getEvent(req, res) {
  try {
    const { eventId } = req.params;

    const { data: event, error } = await supabase
      .from('events')
      .select(`
        *,
        attendees(count),
        checkins(count)
      `)
      .eq('id', eventId)
      .eq('created_by', req.user.id)
      .single();

    if (error || !event) {
      return res.status(404).json({ error: 'Event not found.' });
    }

    return res.json({ event });
  } catch (err) {
    console.error('Get event exception:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

/**
 * PUT /api/events/:eventId
 * Update an event
 */
async function updateEvent(req, res) {
  try {
    const { eventId } = req.params;
    const { name, description, venue, event_date, start_time } = req.body;

    const updates = {};
    if (name)        updates.name        = name.trim();
    if (description !== undefined) updates.description = description?.trim();
    if (venue !== undefined)       updates.venue       = venue?.trim();
    if (event_date !== undefined)  updates.event_date  = event_date;
    if (start_time !== undefined)  updates.start_time  = start_time;

    const { data: event, error } = await supabase
      .from('events')
      .update(updates)
      .eq('id', eventId)
      .eq('created_by', req.user.id)
      .select()
      .single();

    if (error || !event) {
      return res.status(404).json({ error: 'Event not found or update failed.' });
    }

    return res.json({ message: 'Event updated.', event });
  } catch (err) {
    console.error('Update event exception:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

/**
 * DELETE /api/events/:eventId
 * Delete an event (cascades to attendees, checkins)
 */
async function deleteEvent(req, res) {
  try {
    const { eventId } = req.params;

    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', eventId)
      .eq('created_by', req.user.id);

    if (error) {
      console.error('Delete event error:', error);
      return res.status(500).json({ error: 'Failed to delete event.' });
    }

    return res.json({ message: 'Event deleted.' });
  } catch (err) {
    console.error('Delete event exception:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

module.exports = { createEvent, listEvents, getEvent, updateEvent, deleteEvent };
