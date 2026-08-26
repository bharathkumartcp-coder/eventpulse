const supabase = require('../config/supabase');
const QRCode = require('qrcode');
const { parse } = require('csv-parse');
const crypto = require('crypto');

/**
 * Generate a unique QR token for an attendee
 * Uses cryptographically random bytes
 */
function generateQrToken() {
  return crypto.randomBytes(24).toString('hex');
}

/**
 * POST /api/events/:eventId/attendees
 * Add a single attendee to an event
 */
async function addAttendee(req, res) {
  try {
    const { eventId } = req.params;
    const { name, email } = req.body;

    const qrToken = generateQrToken();

    const { data: attendee, error } = await supabase
      .from('attendees')
      .insert({
        event_id: eventId,
        name: name.trim(),
        email: email.toLowerCase().trim(),
        qr_token: qrToken,
        registration_status: 'registered',
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'An attendee with this email is already registered for this event.' });
      }
      console.error('Add attendee error:', error);
      return res.status(500).json({ error: 'Failed to add attendee.' });
    }

    return res.status(201).json({ message: 'Attendee added.', attendee });
  } catch (err) {
    console.error('Add attendee exception:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

/**
 * GET /api/events/:eventId/attendees
 * List all attendees for an event, with check-in status joined
 */
async function listAttendees(req, res) {
  try {
    const { eventId } = req.params;
    const { search, status } = req.query;

    let query = supabase
      .from('attendees')
      .select(`
        *,
        checkins(id, entry_point, checked_in_at)
      `)
      .eq('event_id', eventId)
      .order('name', { ascending: true });

    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    if (status === 'checked_in') {
      query = query.not('checkins', 'is', null);
    } else if (status === 'not_checked_in') {
      query = query.is('checkins', null);
    }

    const { data: attendees, error } = await query;

    if (error) {
      console.error('List attendees error:', error);
      return res.status(500).json({ error: 'Failed to fetch attendees.' });
    }

    return res.json({ attendees });
  } catch (err) {
    console.error('List attendees exception:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

/**
 * POST /api/events/:eventId/attendees/import
 * Bulk import attendees from a CSV file
 * Expected CSV columns: name, email
 */
async function importAttendees(req, res) {
  try {
    const { eventId } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'CSV file is required.' });
    }

    const csvContent = req.file.buffer.toString('utf-8');
    const records = await new Promise((resolve, reject) => {
      parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    if (!records.length) {
      return res.status(400).json({ error: 'CSV file is empty or has no valid rows.' });
    }

    const attendeesToInsert = records.map((row) => ({
      event_id: eventId,
      name: row.name || row.Name || '',
      email: (row.email || row.Email || '').toLowerCase().trim(),
      qr_token: generateQrToken(),
      registration_status: 'registered',
    })).filter(a => a.name && a.email);

    if (!attendeesToInsert.length) {
      return res.status(400).json({ error: 'No valid attendees found in CSV. Required columns: name, email.' });
    }

    // Upsert to skip duplicates gracefully
    const { data: inserted, error } = await supabase
      .from('attendees')
      .upsert(attendeesToInsert, {
        onConflict: 'event_id,email',
        ignoreDuplicates: true,
      })
      .select();

    if (error) {
      console.error('Import attendees error:', error);
      return res.status(500).json({ error: 'Failed to import attendees.' });
    }

    return res.status(201).json({
      message: `Imported ${inserted?.length || 0} attendees.`,
      totalProcessed: attendeesToInsert.length,
      imported: inserted?.length || 0,
    });
  } catch (err) {
    console.error('Import attendees exception:', err);
    return res.status(500).json({ error: 'CSV import failed. Please check file format.' });
  }
}

/**
 * GET /api/events/:eventId/attendees/:attendeeId/qr
 * Generate and return a QR code image (PNG) for an attendee
 */
async function getAttendeeQR(req, res) {
  try {
    const { eventId, attendeeId } = req.params;
    const { format = 'png' } = req.query;

    const { data: attendee, error } = await supabase
      .from('attendees')
      .select('id, name, email, qr_token, event_id')
      .eq('id', attendeeId)
      .eq('event_id', eventId)
      .single();

    if (error || !attendee) {
      return res.status(404).json({ error: 'Attendee not found for this event.' });
    }

    // QR payload: structured token, not raw PII
    const qrPayload = `eventpulse:${eventId}:${attendee.qr_token}`;

    if (format === 'json') {
      return res.json({ qrPayload, attendee: { id: attendee.id, name: attendee.name } });
    }

    // Generate PNG QR code
    const qrBuffer = await QRCode.toBuffer(qrPayload, {
      type: 'png',
      width: 400,
      margin: 2,
      color: {
        dark: '#1e293b',
        light: '#ffffff',
      },
    });

    res.set('Content-Type', 'image/png');
    res.set('Content-Disposition', `inline; filename="${attendee.name.replace(/\s/g, '_')}_qr.png"`);
    return res.send(qrBuffer);
  } catch (err) {
    console.error('QR generation exception:', err);
    return res.status(500).json({ error: 'Failed to generate QR code.' });
  }
}

/**
 * GET /api/events/:eventId/attendees/export
 * Export attendees as CSV
 */
async function exportAttendees(req, res) {
  try {
    const { eventId } = req.params;

    const { data: attendees, error } = await supabase
      .from('attendees')
      .select(`*, checkins(entry_point, checked_in_at)`)
      .eq('event_id', eventId)
      .order('name');

    if (error) {
      return res.status(500).json({ error: 'Failed to export attendees.' });
    }

    const header = 'Name,Email,Registration Status,Checked In,Entry Point,Check-In Time\n';
    const rows = attendees.map(a => {
      const ci = a.checkins && a.checkins[0];
      return [
        `"${a.name}"`,
        `"${a.email}"`,
        a.registration_status,
        ci ? 'Yes' : 'No',
        ci ? `"${ci.entry_point}"` : '',
        ci ? `"${new Date(ci.checked_in_at).toISOString()}"` : '',
      ].join(',');
    });

    const csv = header + rows.join('\n');
    res.set('Content-Type', 'text/csv');
    res.set('Content-Disposition', `attachment; filename="attendees_${eventId}.csv"`);
    return res.send(csv);
  } catch (err) {
    console.error('Export exception:', err);
    return res.status(500).json({ error: 'Export failed.' });
  }
}

module.exports = { addAttendee, listAttendees, importAttendees, getAttendeeQR, exportAttendees };
