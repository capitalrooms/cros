// Where CROS tells the office something has happened — a new repair, a booking, notice given, a tenant's text reply
// (25 Oct 2026). Seven routes each read their own setting: NEXT_PUBLIC_ADMIN_EMAIL was never set on the live site, so
// none of those office emails went, and notice / rescind alerts went to admin@capitalrooms.co.uk. One address now;
// OFFICE_ALERT_EMAIL (or the old setting) can still change it.
export const OFFICE_ALERT_EMAIL = (process.env.OFFICE_ALERT_EMAIL || process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'harry@capitalrooms.co.uk').trim()
