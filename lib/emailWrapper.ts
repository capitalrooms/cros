/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  Capital Rooms — THE single email wrapper                                ║
 * ║                                                                          ║
 * ║  ▸ EVERY outbound email must go through buildEmail() or wrapEmail().     ║
 * ║  ▸ Logo, header, and footer are LOCKED — not editable per-template.      ║
 * ║  ▸ Business details (address / email / phone / logo) come from the       ║
 * ║    business_settings DB table — change once → every email updates.       ║
 * ║  ▸ Two approved theme variants: 'dark' (Option E) and 'light'.           ║
 * ║    Theme is admin-selected globally in /admin/settings.                  ║
 * ║                                                                          ║
 * ║  DO NOT:                                                                 ║
 * ║    • Copy-paste header/footer HTML into route files                      ║
 * ║    • Build a new <html> wrapper in a route file                          ║
 * ║    • Call Resend directly — use lib/sendEmail.ts instead                 ║
 * ║    • Add a per-template header/footer option in Message Templates        ║
 * ║                                                                          ║
 * ║  TO ADD A NEW EMAIL TYPE:                                                ║
 * ║    1. Build the body HTML (just the inner content)                       ║
 * ║    2. const html = await buildEmail(bodyHtml)                            ║
 * ║    3. Call sendEmail(to, subject, bodyHtml) from lib/sendEmail.ts        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import { createClient } from '@supabase/supabase-js'
import { fullSignatureHtml, SIGNATURE_ASSET_BASE } from '@/lib/brand/signature'
import { nameDisplayWidth } from '@/lib/brand/nameImage'
import { defaultSender, senderFor, type EmailSender } from '@/lib/email/sender'

// ─── Business details type ────────────────────────────────────────────────────

export interface BusinessSettings {
  company_name: string
  address_line1: string
  address_line2: string
  city: string
  postcode: string
  email: string
  phone: string
  /** URL of logo for dark theme (white logo on black background) */
  logo_url: string
  /** URL of logo for light theme (dark/black logo on white background) */
  logo_url_light: string
  /** 'dark' = Option E (white logo on black band) | 'light' = dark logo on white band */
  email_theme: 'dark' | 'light'
}

// Hard-coded fallback — only used when DB is unreachable.
// Live values live in business_settings table (migrations 129 + 130).
export const BUSINESS_DEFAULTS: BusinessSettings = {
  company_name: 'Capital Rooms',
  address_line1: 'Hoxton Mix, 66 Paul Street',
  address_line2: '',
  city: 'London',
  postcode: 'EC2A 4NA',
  email: 'management@capitalrooms.co.uk',
  phone: '0207 112 9163',
  logo_url: 'https://cros-sigma.vercel.app/footer-logo.png',
  logo_url_light: 'https://cros-sigma.vercel.app/logo.png',
  email_theme: 'dark',
}

// Simple in-process cache — 5-minute TTL so changes propagate quickly.
let _biz: BusinessSettings | null = null
let _bizAt = 0
const CACHE_MS = 5 * 60 * 1000

export async function getBusinessSettings(): Promise<BusinessSettings> {
  if (_biz && Date.now() - _bizAt < CACHE_MS) return _biz
  try {
    const supa = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data } = await supa
      .from('business_settings')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) {
      _biz = { ...BUSINESS_DEFAULTS, ...data }
      _bizAt = Date.now()
      return _biz
    }
  } catch {
    // fall through to defaults
  }
  return BUSINESS_DEFAULTS
}

/** Force a settings cache refresh (call after admin saves settings) */
export function invalidateBusinessSettingsCache() {
  _biz = null
  _bizAt = 0
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────

/** Standard detail-row in a summary table */
export function tableRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 0;color:#78716c;font-size:13px;width:130px;vertical-align:top;">${label}</td>
    <td style="padding:8px 0;color:#1c1917;font-size:13px;font-weight:600;">${value}</td>
  </tr>`
}

/** CTA button — house black, rounded */
export function ctaButton(label: string, href: string): string {
  return `<div style="margin:24px 0;text-align:center;">
    <a href="${href}" style="display:inline-block;background:#1a1a1a;color:#ffffff;font-size:14px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none;">${label}</a>
  </div>`
}

/** @deprecated Senders are per person now — use senderFields()/senderFor() from lib/email/sender.
 *  Kept as a safety net: a real, monitored mailbox rather than noreply@. */
export const FROM = 'Capital Rooms <management@capitalrooms.co.uk>'
export const PORTAL_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cros-sigma.vercel.app'

// ─── The house email (agreed 27 Sep 2026) ─────────────────────────────────────
// A white top bar with the black Capital Rooms logo and a fine rule (option C, chosen 28 Sep 2026 — so it's clear
// who the email is from before the sign-off), a clean white page, then the sender's
// house-style signature as the footer (dark card: disc logo, name in Space Grotesk, monospace details,
// credentials, website). Who the sender is: lib/email/sender.ts.


const BODY_FONT = "Lato,'Helvetica Neue',Arial,sans-serif"

/** Footer for emails with no person behind them (kept for completeness — buildEmail always has a sender). */
function companyFooter(biz: BusinessSettings): string {
  const addr = [biz.address_line1, biz.address_line2, `${biz.city} ${biz.postcode}`.trim()].filter(x => x && x.trim()).join(', ')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0d0d0d" style="width:100%;background:#0d0d0d;border-collapse:collapse;">
    <tr><td align="center" style="padding:28px 22px 12px;"><img src="${SIGNATURE_ASSET_BASE}/brand/disc-footer.png" width="96" alt="${biz.company_name}" style="display:block;margin:0 auto;border:0;width:96px;max-width:100%;height:auto;"></td></tr>
    <tr><td align="center" style="padding:0 22px 24px;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:9px;letter-spacing:.14em;text-transform:uppercase;line-height:1.8;color:#57554f;">
      <a href="https://www.capitalrooms.co.uk" style="color:#9a978f;text-decoration:none;">www.capitalrooms.co.uk</a><br>${addr}
    </td></tr></table>`
}

/** The signature block for a sender, sized for the email footer. */
export function senderFooter(sender: EmailSender): string {
  return fullSignatureHtml(sender, nameDisplayWidth(sender.name), SIGNATURE_ASSET_BASE, { disclaimer: false })
}

/**
 * Wrap body HTML in the Capital Rooms email.
 * Always call via buildEmail() (or sendEmail()) so the right sender's footer is used.
 */
export function wrapEmail(content: string, biz: BusinessSettings = BUSINESS_DEFAULTS, footerHtml?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
</head>
<body style="margin:0;padding:0;background:#f5f4f2;-webkit-text-size-adjust:100%;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f5f4f2;padding:24px 0;">
<tr><td align="center">
<table cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;background:#ffffff;">
  <tr><td style="padding:24px 32px 18px;border-bottom:1px solid #efedea;"><img src="${SIGNATURE_ASSET_BASE}/brand/lockup-ink.png" width="150" alt="${biz.company_name}" style="display:block;border:0;width:150px;max-width:60%;height:auto;"></td></tr>
  <tr>
    <td style="padding:34px 32px 30px;font-family:${BODY_FONT};font-size:14.5px;line-height:1.7;color:#2b2a27;">
      ${content}
    </td>
  </tr>
  <tr><td style="padding:0;">${footerHtml ?? companyFooter(biz)}</td></tr>
</table>
<p style="max-width:600px;margin:10px auto 0;padding:0 16px;font-family:${BODY_FONT};font-size:10px;line-height:1.55;color:#9a978f;text-align:left;">This email and any attachments are intended for the recipient only. If you have received it in error, please tell the sender and delete it.</p>
</td></tr>
</table>
</body>
</html>`
}

/**
 * ══ USE THIS IN EVERY ROUTE ══
 * Wraps body HTML in the house email with the sender's signature as the footer.
 * Pass `req` (or `sender`) so the person who triggered it signs it; with neither, the main administrator does.
 * `signature: false` → company footer instead (e.g. the marketing mailer, which signs itself).
 */
export async function buildEmail(content: string, opts: { sender?: EmailSender; signature?: boolean; req?: Request | null } = {}): Promise<string> {
  const biz = await getBusinessSettings()
  if (opts.signature === false) return wrapEmail(content, biz)
  // the signed-in staff member behind the request signs it (same person as the From address); otherwise the main administrator
  const sender = opts.sender ?? (opts.req ? await senderFor(opts.req) : await defaultSender())
  return wrapEmail(content, biz, senderFooter(sender))
}
