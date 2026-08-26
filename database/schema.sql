-- ============================================================
-- EventPulse Database Schema
-- Run this in your Supabase SQL Editor (or any PostgreSQL DB)
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ORGANIZERS (app-level users, separate from attendees)
-- If using Supabase Auth, created_by references auth.users
-- For standalone JWT, this table manages organizers
-- ============================================================
CREATE TABLE IF NOT EXISTS organizers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  email      TEXT UNIQUE NOT NULL,
  password   TEXT NOT NULL,  -- bcrypt hashed
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- EVENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  venue       TEXT,
  event_date  DATE,
  start_time  TIME,
  created_by  UUID REFERENCES organizers(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_created_by ON events(created_by);

-- ============================================================
-- ATTENDEES
-- ============================================================
CREATE TABLE IF NOT EXISTS attendees (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  email               TEXT NOT NULL,
  qr_token            TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  registration_status TEXT NOT NULL DEFAULT 'registered'
                        CHECK (registration_status IN ('registered','cancelled','waitlisted')),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendees_event_id  ON attendees(event_id);
CREATE INDEX IF NOT EXISTS idx_attendees_qr_token  ON attendees(qr_token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendees_email_event ON attendees(event_id, email);

-- ============================================================
-- CHECK-INS
-- UNIQUE(event_id, attendee_id) is the core duplicate guard
-- ============================================================
CREATE TABLE IF NOT EXISTS checkins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  attendee_id   UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  entry_point   TEXT NOT NULL DEFAULT 'Main Gate',
  checked_in_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_checkin_per_event_attendee UNIQUE (event_id, attendee_id)
);

CREATE INDEX IF NOT EXISTS idx_checkins_event_id    ON checkins(event_id);
CREATE INDEX IF NOT EXISTS idx_checkins_attendee_id ON checkins(attendee_id);
CREATE INDEX IF NOT EXISTS idx_checkins_time        ON checkins(checked_in_at);

-- ============================================================
-- INVALID SCAN LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS invalid_scan_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       UUID REFERENCES events(id) ON DELETE SET NULL,
  scanned_value  TEXT,
  entry_point    TEXT DEFAULT 'Main Gate',
  reason         TEXT NOT NULL
                   CHECK (reason IN ('UNKNOWN_QR','ALREADY_CHECKED_IN','EVENT_MISMATCH','INVALID_FORMAT','BACKEND_FAILURE')),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invalid_logs_event_id ON invalid_scan_logs(event_id);

-- ============================================================
-- HELPER: auto-update updated_at on events
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- SUPABASE REALTIME: Enable replication for live dashboard
-- Run these in Supabase SQL Editor
-- ============================================================
-- ALTER TABLE checkins REPLICA IDENTITY FULL;
-- ALTER TABLE attendees REPLICA IDENTITY FULL;
-- ALTER PUBLICATION supabase_realtime ADD TABLE checkins;
-- ALTER PUBLICATION supabase_realtime ADD TABLE attendees;

-- ============================================================
-- ROW LEVEL SECURITY (if using Supabase Auth directly)
-- Uncomment if you switch to Supabase Auth instead of custom JWT
-- ============================================================
-- ALTER TABLE events ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE attendees ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE invalid_scan_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SEED: Sample data for testing
-- ============================================================
-- INSERT INTO organizers (name, email, password)
-- VALUES ('Demo Organizer', 'demo@eventpulse.dev', '<bcrypt_hash>');
