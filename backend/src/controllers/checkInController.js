const supabase = require('../config/supabase');

/**
 * Parse and validate the QR payload format
 * Expected: "eventpulse:{eventId}:{qrToken}"
 * Returns { eventId, qrToken } or null if invalid
 */
function parseQrPayload(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const parts = raw.trim().split(':');
  // Format: eventpulse:{uuid}:{hex_token}
  if (parts.length !== 3 || parts[0] !== 'eventpulse') return null;
  const [, eventId, qrToken] = parts;
  if (!eventId || !qrToken) return null;
  return { eventId, qrToken };
}

/**
 * Log an invalid or duplicate scan attempt to invalid_scan_logs
 */
async function logInvalidScan({ eventId, scannedValue, entryPoint, reason }) {
  try {
    await supabase
      .from('invalid_scan_logs')
      .insert({
        event_id: eventId || null,
        scanned_value: scannedValue ? scannedValue.substring(0, 500) : null,
        entry_point: entryPoint || 'Main Gate',
        reason,
      });
  } catch (logErr) {
    // Non-critical — don't fail the main request
    console.error('Failed to log invalid scan:', logErr.message);
  }
}

/**
 * POST /api/events/:eventId/check-in
 *
 * Core check-in logic:
 *  1. Parse + validate QR format
 *  2. Find attendee by qr_token
 *  3. Verify attendee belongs to this event
 *  4. Atomic INSERT into checkins (UNIQUE constraint prevents duplicates)
 *  5. If constraint violation → ALREADY_CHECKED_IN
 *  6. Return explicit status codes
 *
 * Body: { qrToken: string, entryPoint?: string }
 */
async function checkIn(req, res) {
  const { eventId } = req.params;
  const { qrToken: rawQrToken, entryPoint = 'Main Gate' } = req.body;

  // ── Step 1: Validate QR payload format ──────────────────────────────────
  if (!rawQrToken || typeof rawQrToken !== 'string') {
    await logInvalidScan({ eventId, scannedValue: rawQrToken, entryPoint, reason: 'INVALID_FORMAT' });
    return res.status(400).json({
      success: false,
      status: 'INVALID_FORMAT',
      message: 'QR code data is missing or malformed.',
    });
  }

  // Accept either the raw token or the full payload "eventpulse:{eid}:{token}"
  let qrToken = rawQrToken;
  const parsed = parseQrPayload(rawQrToken);
  if (parsed) {
    // Full payload format – validate that embedded eventId matches URL param
    if (parsed.eventId !== eventId) {
      await logInvalidScan({ eventId, scannedValue: rawQrToken, entryPoint, reason: 'EVENT_MISMATCH' });
      return res.status(400).json({
        success: false,
        status: 'EVENT_MISMATCH',
        message: 'This QR code belongs to a different event.',
      });
    }
    qrToken = parsed.qrToken;
  }

  try {
    // ── Step 2: Find attendee by qr_token ───────────────────────────────────
    const { data: attendee, error: attendeeError } = await supabase
      .from('attendees')
      .select('id, name, email, event_id, registration_status')
      .eq('qr_token', qrToken)
      .single();

    if (attendeeError || !attendee) {
      // Unknown QR — log it
      await logInvalidScan({ eventId, scannedValue: rawQrToken, entryPoint, reason: 'UNKNOWN_QR' });
      return res.status(404).json({
        success: false,
        status: 'UNKNOWN_ATTENDEE',
        message: 'This QR code is not registered for this event.',
      });
    }

    // ── Step 3: Verify attendee belongs to this event ────────────────────────
    if (attendee.event_id !== eventId) {
      await logInvalidScan({ eventId, scannedValue: rawQrToken, entryPoint, reason: 'EVENT_MISMATCH' });
      return res.status(400).json({
        success: false,
        status: 'EVENT_MISMATCH',
        message: 'This QR code belongs to a different event.',
      });
    }

    // ── Step 4: Atomic INSERT — DB UNIQUE(event_id, attendee_id) prevents duplicates
    //   The server/DB generates the timestamp via DEFAULT NOW()
    const { data: checkin, error: insertError } = await supabase
      .from('checkins')
      .insert({
        event_id: eventId,
        attendee_id: attendee.id,
        entry_point: entryPoint,
        // checked_in_at is NOT sent from frontend — DB DEFAULT NOW() handles it
      })
      .select('id, entry_point, checked_in_at')
      .single();

    // ── Step 5: Handle unique constraint violation (duplicate scan) ──────────
    if (insertError) {
      if (insertError.code === '23505') {
        // Unique constraint on (event_id, attendee_id) was violated → duplicate
        // Fetch the original check-in for context
        const { data: existingCheckin } = await supabase
          .from('checkins')
          .select('entry_point, checked_in_at')
          .eq('event_id', eventId)
          .eq('attendee_id', attendee.id)
          .single();

        // Log as duplicate attempt
        await logInvalidScan({ eventId, scannedValue: rawQrToken, entryPoint, reason: 'ALREADY_CHECKED_IN' });

        return res.status(200).json({
          success: false,
          status: 'ALREADY_CHECKED_IN',
          message: 'This attendee has already checked in.',
          attendee: { name: attendee.name },
          originalCheckIn: existingCheckin || null,
        });
      }

      // Some other DB error
      console.error('Check-in insert error:', insertError);
      await logInvalidScan({ eventId, scannedValue: rawQrToken, entryPoint, reason: 'BACKEND_FAILURE' });
      return res.status(500).json({
        success: false,
        status: 'CHECK_IN_FAILED',
        message: 'Unable to complete check-in. Please try again.',
      });
    }

    // ── Step 6: Success ──────────────────────────────────────────────────────
    return res.status(201).json({
      success: true,
      status: 'CHECKED_IN',
      message: `${attendee.name} successfully checked in.`,
      attendee: {
        id: attendee.id,
        name: attendee.name,
        email: attendee.email,
      },
      checkIn: {
        id: checkin.id,
        entryPoint: checkin.entry_point,
        timestamp: checkin.checked_in_at, // server/DB generated
      },
    });

  } catch (err) {
    console.error('Check-in exception:', err);
    await logInvalidScan({ eventId, scannedValue: rawQrToken, entryPoint, reason: 'BACKEND_FAILURE' });
    return res.status(500).json({
      success: false,
      status: 'CHECK_IN_FAILED',
      message: 'Unable to complete check-in. Server error.',
    });
  }
}

module.exports = { checkIn };
