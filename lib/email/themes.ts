// Email themes (6 Nov 2026, Harry: "switch all emails to new theme, there could be a christmas theme one day"). Every
// email CROS sends goes through the house wrapper (lib/emailWrapper), so a theme there restyles all of them at once —
// the page around the email, the bar with the logo, the body type, links, and (for seasonal ones) a band under the bar.
// Each theme is named after a design Capital Rooms already uses:
//   house      the house email since 27 Sep — white bar, ink logo, Lato (the default)
//   editorial  the landlord new-let email ("C+", 6 Nov) — charcoal bar, white logo, cream page, Instrument Sans
//   forest     the tenant emails' building blocks (lib/email/blocks) — forest bar, gold rule, mint page
//   couture    the public pages (apply, reserve, move-in pack) — white, a black rule, Instrument Sans
//   christmas  seasonal — deep green bar, a red band with a line of greeting, gold rule
// Which one is in use — for all emails, on dates (Christmas), or for one kind of email — is set on the Email hub
// (/admin/email-hub) and kept in system_settings 'email_look'. Content inside an email keeps its own colours; the
// theme dresses everything around it and the plain-text emails entirely.
import { createServiceClient } from '@/lib/supabase'

export interface EmailTheme {
  key: string
  name: string
  from: string                 // which existing design it comes from
  page: string                 // background around the email
  bar: string                  // the logo bar's background
  logo: 'ink' | 'white'        // public/brand/lockup-ink-on-white.png or lockup-white-full.png
  rule: string                 // the line under the bar
  body: string                 // the email's own background
  font: string                 // body type
  text: string                 // body text colour
  link: string
  band?: { bg: string; text: string; line: string }   // a seasonal strip under the bar
}

export const THEMES: EmailTheme[] = [
  { key: 'house', name: 'House', from: 'The house email (since September)', page: '#f5f4f2', bar: '#ffffff', logo: 'ink', rule: '#efedea', body: '#ffffff', font: "Lato,'Helvetica Neue',Arial,sans-serif", text: '#2b2a27', link: '#1F3B2E' },
  { key: 'editorial', name: 'Editorial', from: 'The landlord new-let email', page: '#E8E4DB', bar: '#1C1C1B', logo: 'white', rule: '#1C1C1B', body: '#FBF9F4', font: "'Instrument Sans','Helvetica Neue',Arial,sans-serif", text: '#2E2C28', link: '#1F3B2E' },
  { key: 'forest', name: 'Forest', from: 'The tenant emails', page: '#E6EFE8', bar: '#1F3B2E', logo: 'white', rule: '#C4922A', body: '#ffffff', font: "Lato,'Helvetica Neue',Arial,sans-serif", text: '#3A4A40', link: '#1F3B2E' },
  { key: 'couture', name: 'Couture', from: 'The website and application pages', page: '#ffffff', bar: '#ffffff', logo: 'ink', rule: '#111111', body: '#ffffff', font: "'Instrument Sans','Helvetica Neue',Arial,sans-serif", text: '#111111', link: '#111111' },
  { key: 'christmas', name: 'Christmas', from: 'Seasonal', page: '#F4EFE6', bar: '#14321F', logo: 'white', rule: '#C4922A', body: '#ffffff', font: "Lato,'Helvetica Neue',Arial,sans-serif", text: '#2b2a27', link: '#8E1B1B',
    band: { bg: '#8E1B1B', text: '#FBEFD9', line: 'Season’s greetings from all of us at Capital Rooms' } },
]
export const themeByKey = (k: string | null | undefined) => THEMES.find(t => t.key === k) ?? THEMES[0]

export interface EmailLook {
  default: string
  /** dated themes, e.g. Christmas from 1 to 31 December — the first that covers today wins */
  schedule: { theme: string; from: string; to: string }[]
  /** one kind of email in its own theme (keys from lib/email/registry) */
  perEmail: Record<string, string>
}
export const EMPTY_LOOK: EmailLook = { default: 'house', schedule: [], perEmail: {} }
export const LOOK_SETTING = 'email_look'

let cache: { look: EmailLook; at: number } | null = null
export function forgetLook() { cache = null }

export async function currentLook(): Promise<EmailLook> {
  if (cache && Date.now() - cache.at < 60_000) return cache.look
  try {
    const { data } = await createServiceClient().from('system_settings').select('value').eq('key', LOOK_SETTING).maybeSingle()
    const v = JSON.parse(String((data as any)?.value ?? 'null'))
    const look: EmailLook = { ...EMPTY_LOOK, ...(v && typeof v === 'object' ? v : {}) }
    cache = { look, at: Date.now() }
    return look
  } catch { return EMPTY_LOOK }
}

/** The theme for one email: its own choice, else a dated one covering today, else the default. */
export function themeFor(look: EmailLook, kind?: string | null, today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })): EmailTheme {
  if (kind && look.perEmail[kind]) return themeByKey(look.perEmail[kind])
  const dated = look.schedule.find(s => s.from <= today && today <= s.to)
  return themeByKey(dated?.theme ?? look.default)
}
