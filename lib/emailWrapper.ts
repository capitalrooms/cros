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
  address_line1: 'Third Floor',
  address_line2: '86–90 Paul Street',
  city: 'London',
  postcode: 'EC2A 4NE',
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

/** CTA button — crimson, rounded */
export function ctaButton(label: string, href: string): string {
  return `<div style="margin:24px 0;text-align:center;">
    <a href="${href}" style="display:inline-block;background:#86284a;color:#ffffff;font-size:14px;font-weight:600;padding:14px 32px;border-radius:6px;text-decoration:none;">${label}</a>
  </div>`
}

export const FROM = 'Capital Rooms <noreply@capitalrooms.co.uk>'
export const PORTAL_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cros-sigma.vercel.app'

// ─── Theme definitions ────────────────────────────────────────────────────────

interface ThemeTokens {
  headerBg: string
  headerPad: string
  logoHeight: number
  footerBg: string
  footerColor: string
  footerLinkColor: string
  footerLogoPad: string
  footerLogoHeight: number
}

const DARK_THEME: ThemeTokens = {
  headerBg: '#0a0a0a',
  headerPad: '20px 0',
  logoHeight: 80,
  footerBg: '#0a0a0a',
  footerColor: '#aaaaaa',
  footerLinkColor: '#aaaaaa',
  footerLogoPad: '24px 28px 20px',
  footerLogoHeight: 44,
}

const LIGHT_THEME: ThemeTokens = {
  headerBg: '#ffffff',
  headerPad: '24px 0 16px',
  logoHeight: 72,
  footerBg: '#f5f5f4',
  footerColor: '#78716c',
  footerLinkColor: '#555552',
  footerLogoPad: '20px 28px 18px',
  footerLogoHeight: 40,
}

// ─── The wrapper ──────────────────────────────────────────────────────────────

/**
 * Wrap HTML body content in the Capital Rooms email shell.
 *
 * Theme is controlled by biz.email_theme:
 *   'dark'  → Option E — white logo on black band header/footer
 *   'light' → dark logo on white/grey band header/footer
 *
 * Always call via buildEmail() so live DB settings are used.
 * Do NOT call wrapEmail() directly in route files — use buildEmail() or sendEmail().
 */
export function wrapEmail(content: string, biz: BusinessSettings = BUSINESS_DEFAULTS): string {
  const isDark = biz.email_theme !== 'light'
  const t = isDark ? DARK_THEME : LIGHT_THEME
  const logoUrl = isDark ? biz.logo_url : biz.logo_url_light
  const fullAddress = `${biz.address_line1}, ${biz.address_line2}, ${biz.city} ${biz.postcode}`

  // Light theme needs a visible border between white header and white body
  const headerBorder = isDark ? '' : 'border-bottom:1px solid #e7e5e4;'

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
</head>
<body style="margin:0;padding:0;background:#f5f5f4;-webkit-text-size-adjust:100%;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:24px 0;">
<tr><td align="center">
<table cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">

  <!-- ░ HEADER ░ -->
  <!-- height is LOCKED — the container clips any oversized image; width:auto preserves aspect ratio -->
  <tr>
    <td style="background:${t.headerBg};text-align:center;padding:${t.headerPad};line-height:0;mso-line-height-rule:exactly;overflow:hidden;${headerBorder}">
      <img src="${logoUrl}" alt="${biz.company_name}" height="${t.logoHeight}"
           style="display:inline-block;height:${t.logoHeight}px;max-height:${t.logoHeight}px;width:auto;max-width:580px;border:0;outline:none;text-decoration:none;" />
    </td>
  </tr>

  <!-- ░ BODY ░ -->
  <tr>
    <td style="background:#ffffff;padding:36px 40px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:14px;line-height:1.75;color:#3f3f46;">
      ${content}
    </td>
  </tr>

  <!-- ░ FOOTER ░ -->
  <tr>
    <td style="background:${t.footerBg};text-align:center;padding:${t.footerLogoPad};font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.9;letter-spacing:0.03em;color:${t.footerColor};">
      <img src="${logoUrl}" alt="${biz.company_name}" height="${t.footerLogoHeight}"
           style="display:block;margin:0 auto 14px;height:${t.footerLogoHeight}px;max-height:${t.footerLogoHeight}px;width:auto;max-width:580px;border:0;" />${biz.company_name}<br>
      ${fullAddress}<br>
      <a href="mailto:${biz.email}" style="color:${t.footerLinkColor};text-decoration:none;">${biz.email}</a>
      &nbsp;|&nbsp; ${biz.phone}
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`
}

/**
 * ══ USE THIS IN EVERY ROUTE ══
 *
 * Async convenience: fetches live business settings then wraps.
 * The await is cheap (5-min cache); the result is always the correct
 * branded wrapper with live address/logo/theme from the DB.
 *
 * @example
 *   const html = await buildEmail(`<h2>Hello</h2><p>…</p>`)
 */
export async function buildEmail(content: string): Promise<string> {
  const biz = await getBusinessSettings()
  return wrapEmail(content, biz)
}
