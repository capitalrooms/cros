// Email themes (6 Nov 2026, Harry: "switch all emails to new theme, there could be a christmas theme one day"). Every
// email CROS sends goes through the house wrapper (lib/emailWrapper), so a theme there restyles all of them at once —
// the page around the email, the bar with the logo, the body type, links, and (for seasonal ones) a band under the bar.
// Each theme is named after a design Capital Rooms already uses:
//   house      the house email since 27 Sep — white bar, ink logo, Lato (the default)
//   editorial  the landlord new-let email ("C+", 6 Nov) — charcoal bar, white logo, cream page, Instrument Sans
//   forest     the tenant emails' building blocks (lib/email/blocks) — forest bar, gold rule, mint page
//   couture    the public pages (apply, reserve, move-in pack) — white, a black rule, Instrument Sans
//   christmas  seasonal — deep green bar, a red band with a line of greeting, gold rule
//   website    capitalrooms.co.uk (11 Nov 2026) — cream bar, gold rule, Bricolage headings and Figtree text, and the
//              inside of the designed emails recoloured to the site's forest, ink, cream and sage (restyle below)
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
  /** a full-width photo under the bar (public path) */
  photo?: { src: string; alt: string }
  /** a full-width picture above the footer (public path) — the Christmas holly */
  footerArt?: { src: string; alt: string }
  /** body text size (default 14.5px) */
  size?: string
  /** recolours / re-fonts the email's own content too (the website theme) — the other themes leave it as designed */
  restyle?: (html: string) => string
}

export const THEMES: EmailTheme[] = [
  { key: 'house', name: 'House', from: 'The house email (since September)', page: '#f5f4f2', bar: '#ffffff', logo: 'ink', rule: '#efedea', body: '#ffffff', font: "Lato,'Helvetica Neue',Arial,sans-serif", text: '#2b2a27', link: '#1F3B2E' },
  { key: 'editorial', name: 'Editorial', from: 'The landlord new-let email', page: '#E8E4DB', bar: '#1C1C1B', logo: 'white', rule: '#1C1C1B', body: '#FBF9F4', font: "'Instrument Sans','Helvetica Neue',Arial,sans-serif", text: '#2E2C28', link: '#1F3B2E' },
  { key: 'forest', name: 'Forest', from: 'The tenant emails', page: '#E6EFE8', bar: '#1F3B2E', logo: 'white', rule: '#C4922A', body: '#ffffff', font: "Lato,'Helvetica Neue',Arial,sans-serif", text: '#3A4A40', link: '#1F3B2E' },
  { key: 'couture', name: 'Couture', from: 'The website and application pages', page: '#ffffff', bar: '#ffffff', logo: 'ink', rule: '#111111', body: '#ffffff', font: "'Instrument Sans','Helvetica Neue',Arial,sans-serif", text: '#111111', link: '#111111' },
  // redrawn 13 Nov 2026 (Harry: "really bad and not even christmassy"): festive green around the email, a gold line, an
  // illustrated header (London at night under snow, a lit tree, fairy lights — scripts/christmas-email.mjs), red links,
  // holly above the footer
  { key: 'christmas', name: 'Christmas', from: 'Seasonal', page: '#163A27', bar: '#0E2418', logo: 'white', rule: '#D4AF37', body: '#ffffff', font: "Lato,'Helvetica Neue',Arial,sans-serif", text: '#2b2a27', link: '#A31D24', size: '15.5px',
    photo: { src: '/email/themes/christmas-header.png', alt: 'Season’s greetings from all of us at Capital Rooms — London at night under snow, with a Christmas tree' },
    footerArt: { src: '/email/themes/christmas-holly.png', alt: '' } },
  // clean like the site (Harry, 11 Nov 2026: "white background … cleaner than a cream"): white, the dark logo, a gold rule
  { key: 'website', name: 'Website', from: 'capitalrooms.co.uk', page: '#F2F5F1', bar: '#ffffff', logo: 'ink', rule: '#E8B931', body: '#ffffff', font: "Figtree,'Helvetica Neue',Arial,sans-serif", text: '#22332A', link: '#1F3B2E', size: '16px',
    restyle: websiteRestyle },
  { key: 'website-photo', name: 'Website with photo', from: 'capitalrooms.co.uk', page: '#F2F5F1', bar: '#ffffff', logo: 'ink', rule: '#E8B931', body: '#ffffff', font: "Figtree,'Helvetica Neue',Arial,sans-serif", text: '#22332A', link: '#1F3B2E', size: '16px',
    photo: { src: '/website/photos/email-thames.jpg', alt: 'Tower Bridge and the Thames' }, restyle: websiteRestyle },
]
// ── the website theme's restyle: the designed emails' black, cream and serif become the site's forest, ink, cream,
// sage, Bricolage and Figtree. Order matters: dark panels and buttons (background black) go forest before the
// remaining black text goes ink.
const SITE_DISPLAY = "'Bricolage Grotesque','Helvetica Neue',Arial,sans-serif"
const SITE_TEXT = "Figtree,'Helvetica Neue',Arial,sans-serif"
function websiteRestyle(html: string): string {
  return html
    // the big intro line reads as the site's lead: Figtree, not a heavy heading
    .replace(/font-family:'Instrument Serif',Georgia,'Times New Roman',serif;font-size:23px;line-height:1.3/g, `font-family:${SITE_TEXT};font-size:19px;line-height:1.5;font-weight:500`)
    .replace(/font-family:'Instrument Serif',Georgia,'Times New Roman',serif;font-weight:400/g, `font-family:${SITE_DISPLAY};font-weight:700`)
    .replace(/font-family:'Instrument Serif',Georgia,'Times New Roman',serif/g, `font-family:${SITE_DISPLAY};font-weight:700;letter-spacing:-.01em`)
    .replace(/font-family:'Instrument Sans','Helvetica Neue',Arial,sans-serif/g, `font-family:${SITE_TEXT}`)
    .replace(/font-family:Lato,'Helvetica Neue',Arial,sans-serif/g, `font-family:${SITE_TEXT}`)
    .replace(/bgcolor="#111111"/gi, 'bgcolor="#1F3B2E"').replace(/background:#111111/gi, 'background:#1F3B2E')
    // (the signature stays black: its round logo is a picture on black, which shows as a square on green)
    .replace(/background:#1a1a1a/gi, 'background:#1F3B2E')             // the standard button
    .replace(/#111111/gi, '#132219')
    .replace(/#F3F0EA/gi, '#F4F7F3').replace(/#F3EEE3/gi, '#F4F7F3').replace(/#F7F3EA/gi, '#F7F9F6')   // creams → a whisper of sage on the white page
    .replace(/#F4F1EB/gi, '#EEF3EC')      // paper → pale sage
    .replace(/#DDD6C8/gi, '#DCE3DA').replace(/#1C1C1B/gi, '#132219').replace(/#2E2C28/gi, '#22332A').replace(/#8A8478/gi, '#6B7A70').replace(/#6F6A60/gi, '#56665C')   // the landlord updates' palette
    // the plain-text emails: the site's 16px body text in its ink (best practice 2026: 16px, one column)
    .replace(/font-size:15px;color:#333;line-height:1.6/g, 'font-size:16px;color:#22332A;line-height:1.65').replace(/font-size:15px;color:#333;line-height:1.7/g, 'font-size:16px;color:#22332A;line-height:1.7')
    .replace(/#D9D5CD/gi, '#DCE3DA').replace(/#E4E0D8/gi, '#DCE3DA')      // fine rules
    .replace(/#4A4741/gi, '#3B4A41')      // soft text
    .replace(/#6F6B64/gi, '#56665C')      // muted text
    .replace(/#C9C4BA/gi, '#C9D6CC')      // text on dark panels
}

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

// ── each landlord's own look for their updates (7 Nov 2026, Harry: "i dont get to choose options on this email to let
// only landlord") — chosen in the Landlord updates popup, "make it theirs" keeps it; system_settings 'landlord_email_look'
export const LANDLORD_LOOK = 'landlord_email_look'
export async function landlordLooks(): Promise<Record<string, string>> {
  try {
    const { data } = await createServiceClient().from('system_settings').select('value').eq('key', LANDLORD_LOOK).maybeSingle()
    const v = JSON.parse(String((data as any)?.value ?? 'null'))
    return v && typeof v === 'object' ? v : {}
  } catch { return {} }
}
export async function setLandlordLook(landlordId: string, theme: string | null): Promise<void> {
  const all = await landlordLooks()
  if (theme && THEMES.some(t => t.key === theme)) all[landlordId] = theme; else delete all[landlordId]
  await createServiceClient().from('system_settings').upsert({ key: LANDLORD_LOOK, value: JSON.stringify(all) }, { onConflict: 'key' })
}
