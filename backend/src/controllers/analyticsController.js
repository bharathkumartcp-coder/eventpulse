const supabase = require('../config/supabase');

/**
 * GET /api/events/:eventId/dashboard
 * Live stats: attendee count, checked-in count, duplicates, invalid scans
 * All counts come directly from DB queries — never from frontend state
 */
async function getDashboard(req, res) {
  try {
    const { eventId } = req.params;

    // Run all counts in parallel for performance
    const [
      attendeesResult,
      checkinsResult,
      duplicateAttemptsResult,
      invalidScansResult,
      recentCheckinsResult,
    ] = await Promise.all([
      // Total registered attendees
      supabase
        .from('attendees')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId),

      // Total successful check-ins
      supabase
        .from('checkins')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId),

      // Duplicate scan attempts
      supabase
        .from('invalid_scan_logs')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('reason', 'ALREADY_CHECKED_IN'),

      // All invalid scans (unknown, mismatch, failures)
      supabase
        .from('invalid_scan_logs')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .neq('reason', 'ALREADY_CHECKED_IN'),

      // Recent 10 check-ins
      supabase
        .from('checkins')
        .select(`
          id,
          entry_point,
          checked_in_at,
          attendees(name, email)
        `)
        .eq('event_id', eventId)
        .order('checked_in_at', { ascending: false })
        .limit(10),
    ]);

    const totalAttendees   = attendeesResult.count ?? 0;
    const totalCheckedIn   = checkinsResult.count ?? 0;
    const duplicateAttempts = duplicateAttemptsResult.count ?? 0;
    const unknownScans     = invalidScansResult.count ?? 0;
    const remaining        = totalAttendees - totalCheckedIn;
    const percentage       = totalAttendees > 0
      ? Math.round((totalCheckedIn / totalAttendees) * 100)
      : 0;

    return res.json({
      stats: {
        totalAttendees,
        totalCheckedIn,
        remaining,
        attendancePercentage: percentage,
        duplicateAttempts,
        unknownScans,
      },
      recentCheckIns: recentCheckinsResult.data || [],
    });
  } catch (err) {
    console.error('Dashboard exception:', err);
    return res.status(500).json({ error: 'Failed to fetch dashboard data.' });
  }
}

/**
 * GET /api/events/:eventId/analytics
 * Full analytics: timeline, entry-point breakdown, scan issues
 */
async function getAnalytics(req, res) {
  try {
    const { eventId } = req.params;

    const [
      checkinsResult,
      invalidLogsResult,
      entryPointResult,
    ] = await Promise.all([
      // All check-ins for timeline
      supabase
        .from('checkins')
        .select('checked_in_at, entry_point')
        .eq('event_id', eventId)
        .order('checked_in_at', { ascending: true }),

      // All invalid scan logs for issue breakdown
      supabase
        .from('invalid_scan_logs')
        .select('reason, created_at, entry_point')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false }),

      // Entry-point breakdown
      supabase
        .from('checkins')
        .select('entry_point')
        .eq('event_id', eventId),
    ]);

    const checkins     = checkinsResult.data || [];
    const invalidLogs  = invalidLogsResult.data || [];
    const allCheckins  = entryPointResult.data || [];

    // Build hourly timeline (group by hour)
    const timelineMap = {};
    checkins.forEach(ci => {
      const d = new Date(ci.checked_in_at);
      // Round to the nearest 15 min for finer granularity
      const mins = Math.floor(d.getMinutes() / 15) * 15;
      const key = `${d.getHours().toString().padStart(2,'0')}:${mins.toString().padStart(2,'0')}`;
      timelineMap[key] = (timelineMap[key] || 0) + 1;
    });
    const timeline = Object.entries(timelineMap)
      .map(([time, count]) => ({ time, count }))
      .sort((a, b) => a.time.localeCompare(b.time));

    // Entry-point breakdown
    const entryPointMap = {};
    allCheckins.forEach(ci => {
      entryPointMap[ci.entry_point] = (entryPointMap[ci.entry_point] || 0) + 1;
    });
    const entryPoints = Object.entries(entryPointMap)
      .map(([name, count]) => ({ name, count }));

    // Scan issue breakdown
    const issueMap = {};
    invalidLogs.forEach(log => {
      issueMap[log.reason] = (issueMap[log.reason] || 0) + 1;
    });
    const scanIssues = Object.entries(issueMap)
      .map(([reason, count]) => ({ reason, count }));

    return res.json({
      timeline,
      entryPoints,
      scanIssues,
      totalInvalidScans: invalidLogs.length,
    });
  } catch (err) {
    console.error('Analytics exception:', err);
    return res.status(500).json({ error: 'Failed to fetch analytics.' });
  }
}

/**
 * GET /api/events/:eventId/checkins
 * Full check-in list with attendee details
 */
async function listCheckIns(req, res) {
  try {
    const { eventId } = req.params;
    const { search, entry_point, limit = 100, offset = 0 } = req.query;

    let query = supabase
      .from('checkins')
      .select(`
        id,
        entry_point,
        checked_in_at,
        attendees(id, name, email)
      `)
      .eq('event_id', eventId)
      .order('checked_in_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (entry_point) {
      query = query.eq('entry_point', entry_point);
    }

    const { data: checkins, error, count } = await query;

    if (error) {
      console.error('List checkins error:', error);
      return res.status(500).json({ error: 'Failed to fetch check-ins.' });
    }

    let results = checkins || [];
    if (search) {
      const s = search.toLowerCase();
      results = results.filter(ci =>
        ci.attendees?.name?.toLowerCase().includes(s) ||
        ci.attendees?.email?.toLowerCase().includes(s)
      );
    }

    return res.json({ checkins: results, total: count });
  } catch (err) {
    console.error('List checkins exception:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

/**
 * GET /api/events/:eventId/invalid-scans
 * Invalid scan log list
 */
async function listInvalidScans(req, res) {
  try {
    const { eventId } = req.params;
    const { limit = 100, offset = 0, reason } = req.query;

    let query = supabase
      .from('invalid_scan_logs')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (reason) {
      query = query.eq('reason', reason);
    }

    const { data: logs, error } = await query;

    if (error) {
      console.error('List invalid scans error:', error);
      return res.status(500).json({ error: 'Failed to fetch invalid scan logs.' });
    }

    return res.json({ logs: logs || [] });
  } catch (err) {
    console.error('List invalid scans exception:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

module.exports = { getDashboard, getAnalytics, listCheckIns, listInvalidScans };
