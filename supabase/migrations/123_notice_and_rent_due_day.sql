-- Migration 123: Notice flow fields + rent due day
-- Adds: notice_received_date, rent_due_day, rescind tracking,
--        checkout email sent-at markers

ALTER TABLE tenancies
  ADD COLUMN IF NOT EXISTS notice_received_date DATE,
  ADD COLUMN IF NOT EXISTS rent_due_day         SMALLINT DEFAULT 1
    CHECK (rent_due_day BETWEEN 1 AND 28),
  ADD COLUMN IF NOT EXISTS rescind_requested_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rescind_note          TEXT,
  ADD COLUMN IF NOT EXISTS checkout_confirmation_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checkout_reminder_sent_at     TIMESTAMPTZ;

COMMENT ON COLUMN tenancies.notice_received_date IS 'Date notice was given (by tenant or recorded by admin) — distinct from end_date (move-out)';
COMMENT ON COLUMN tenancies.rent_due_day         IS 'Day of month rent is due, 1–28 (default 1st). Used for pro-rata final-period calculation.';
COMMENT ON COLUMN tenancies.rescind_requested_at IS 'Set when tenant requests to cancel notice; cleared on approval/rejection';
COMMENT ON COLUMN tenancies.rescind_note         IS 'Tenant reason for rescinding notice';
COMMENT ON COLUMN tenancies.checkout_confirmation_sent_at IS 'Timestamp of the immediate checkout confirmation email';
COMMENT ON COLUMN tenancies.checkout_reminder_sent_at     IS 'Timestamp of the 2-week-before reminder email';
