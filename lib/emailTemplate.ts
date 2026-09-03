/**
 * Shared Capital Rooms email template — Footer B style.
 *
 * Dark `#1c1917` footer bar with:
 *   - circle emblem badge (logo inverted, centred)
 *   - capitalrooms.co.uk
 *   - © 2026 Capital Rooms
 *
 * Usage:
 *   import { emailHtml } from '@/lib/emailTemplate'
 *   const html = emailHtml(`<h2>Hello</h2><p>…</p>`)
 */

export const FROM = 'Capital Rooms <noreply@capitalrooms.co.uk>'
export const PORTAL_URL = 'https://cros-sigma.vercel.app'

const LOGO_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/maintenance-photos/brand/logo.png`
    : 'https://fihjzzxxhprxgjuefgtb.supabase.co/storage/v1/object/public/maintenance-photos/brand/logo.png'

const footer = `
  <div style="background:#1c1917;padding:22px 24px;text-align:center;">
    <div style="width:40px;height:40px;border-radius:20px;background:rgba(255,255,255,0.10);margin:0 auto 10px;overflow:hidden;text-align:center;line-height:40px;">
      <img src="${LOGO_URL}" alt="" width="24" style="height:24px;width:auto;vertical-align:middle;filter:brightness(0) invert(1);display:inline-block;"/>
    </div>
    <p style="font-size:13px;color:#f0ede8;margin:0 0 3px;font-family:Helvetica,Arial,sans-serif;">capitalrooms.co.uk</p>
    <p style="font-size:11px;color:#57534e;margin:0;font-family:Helvetica,Arial,sans-serif;">© 2026 Capital Rooms</p>
  </div>`

/**
 * Wrap any HTML content in the standard Capital Rooms email shell.
 * `content` goes into a white padded card between the header strip and footer bar.
 */
export function emailHtml(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0ede8;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0ede8;padding:24px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;font-family:Helvetica,Arial,sans-serif;">
        <tr>
          <td style="padding:28px 28px 24px;">
            ${content}
          </td>
        </tr>
        <tr>
          <td style="padding:0;">${footer}</td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

/**
 * Convenience: a standard detail row for job/booking summary tables.
 */
export function tableRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;color:#78716c;font-size:14px;width:110px;vertical-align:top;">${label}</td>
    <td style="padding:6px 0;color:#1c1917;font-size:14px;font-weight:600;">${value}</td>
  </tr>`
}

/**
 * A standard CTA button.
 */
export function ctaButton(label: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;background:#1c1917;color:#ffffff;font-size:14px;font-weight:600;padding:12px 22px;border-radius:8px;text-decoration:none;">${label}</a>`
}
