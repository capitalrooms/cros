// Where CROS tells the office something has happened — a new repair, a booking, notice given, a tenant's text reply
// (25 Oct 2026). Seven routes each read their own setting: NEXT_PUBLIC_ADMIN_EMAIL was never set on the live site, so
// none of those office emails went, and notice / rescind alerts went to admin@capitalrooms.co.uk. One address now;
// OFFICE_ALERT_EMAIL (or the old setting) can still change it.
export const OFFICE_ALERT_EMAIL = (process.env.OFFICE_ALERT_EMAIL || process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'harry@capitalrooms.co.uk').trim()

/** "Open this job" etc. under an office alert (25 Oct 2026, Harry: "would be better if these types of emails always
 *  took you to the job from the email"). Added after the body, so a saved template can't leave it out. */
export function officeButton(path: string, label: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://cros-sigma.vercel.app').replace(/\/$/, '')
  return `<p style="margin:28px 0 0"><a href="${base}${path}" style="display:inline-block;background:#181614;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:10px">${label} →</a></p>`
}
