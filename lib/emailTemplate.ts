/**
 * Shared Capital Rooms email template — Courier brand style.
 *
 * All tenant-facing emails use emailHtml() as their outer wrapper.
 * Changing this file changes every email at once.
 *
 * Usage:
 *   import { emailHtml } from '@/lib/emailTemplate'
 *   const html = emailHtml(`<h2>Hello</h2><p>…</p>`)
 */

export const FROM = 'Capital Rooms <noreply@capitalrooms.co.uk>'
export const PORTAL_URL = 'https://cros-sigma.vercel.app'

const FOOTER = `
  <div style="background:#0a0a0a;color:#aaa;text-align:center;padding:20px 28px;font-size:11px;line-height:1.9;letter-spacing:0.03em;font-family:'Courier New',Courier,monospace;">
    Capital Rooms<br>
    Third Floor | 86–90 Paul Street | London | EC2A 4NE<br>
    management@capitalrooms.co.uk &nbsp;|&nbsp; 0207 112 9163
  </div>`

/**
 * Wrap any HTML content in the Capital Rooms branded email shell.
 * `content` goes inside a white card between the header and footer.
 */
export function emailHtml(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#d6d5d1;font-family:'Courier New',Courier,monospace;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#d6d5d1;padding:24px 0;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;font-family:'Courier New',Courier,monospace;">

        <!-- Header -->
        <tr>
          <td style="background:#0a0a0a;padding:18px 28px;text-align:center;border-radius:0;">
            <span style="font-size:15px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#FFE000;">Capital Rooms</span>
          </td>
        </tr>

        <!-- Content card -->
        <tr>
          <td style="background:#ffffff;padding:28px 28px 32px;font-family:'Courier New',Courier,monospace;font-size:14px;line-height:1.75;color:#0a0a0a;">
            ${content}
          </td>
        </tr>

        <!-- Footer -->
        <tr><td style="padding:0;">${FOOTER}</td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

/**
 * A standard detail row for job/booking summary tables.
 */
export function tableRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:7px 0;color:#555552;font-size:13px;width:120px;vertical-align:top;font-family:'Courier New',Courier,monospace;">${label}</td>
    <td style="padding:7px 0;color:#0a0a0a;font-size:13px;font-weight:700;font-family:'Courier New',Courier,monospace;">${value}</td>
  </tr>`
}

/**
 * A standard CTA button.
 */
export function ctaButton(label: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;background:#0a0a0a;color:#FFE000;font-size:13px;font-weight:700;padding:12px 24px;text-decoration:none;letter-spacing:0.04em;text-transform:uppercase;font-family:'Courier New',Courier,monospace;">${label}</a>`
}
