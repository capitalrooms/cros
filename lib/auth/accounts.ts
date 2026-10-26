// Sign-in accounts for everyone CROS knows (12 Oct 2026, Harry: "these things should all be possible for the user or
// admin to do" — never in Supabase). Server only — needs the service key.
//   accountStatuses(s)      — per email: has a login, last signed in, invited, turned off, two-step on
//   sendAccountEmail(...)   — no login yet → an invite (they choose a password); has one → a password reset link
//   setAccess(...)          — turn someone's sign-in off (their records stay) or back on
// Nobody — not the office, not Supabase — can see a password: they're stored scrambled. Resets replace them.
import type { SupabaseClient } from '@supabase/supabase-js'
import { dearLine } from '@/lib/people'
import { authLink } from '@/lib/auth/links'
import { sendEmail } from '@/lib/sendEmail'
import { PORTAL_URL } from '@/lib/emailWrapper'

export interface AccountStatus {
  hasLogin: boolean
  confirmed: boolean          // has signed in / set a password at least once
  lastSignIn: string | null
  invitedAt: string | null
  off: boolean                // sign-in turned off by the office
  twoStep: boolean            // a verified authenticator app
}

const OFF_FOR = '876000h'     // ~100 years: Supabase's way to turn a login off without deleting it

/** Every login, keyed by lower-case email. */
export async function authUsersByEmail(s: SupabaseClient): Promise<Map<string, any>> {
  const out = new Map<string, any>()
  for (let page = 1; page < 50; page++) {
    const { data, error } = await s.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(error.message)
    for (const u of data.users) if (u.email) out.set(u.email.toLowerCase(), u)
    if (data.users.length < 1000) break
  }
  return out
}

export function statusOf(u: any | undefined): AccountStatus {
  if (!u) return { hasLogin: false, confirmed: false, lastSignIn: null, invitedAt: null, off: false, twoStep: false }
  return {
    hasLogin: true,
    confirmed: !!(u.last_sign_in_at || u.email_confirmed_at && !u.invited_at),
    lastSignIn: u.last_sign_in_at ?? null,
    invitedAt: u.invited_at ?? null,
    off: !!u.banned_until && Date.parse(u.banned_until) > Date.now(),
    twoStep: (u.factors ?? []).some((f: any) => f.status === 'verified'),
  }
}

const APP_NAME: Record<string, string> = {
  administrator: 'the Capital Rooms office app', admin: 'the Capital Rooms office app', lettings: 'the Capital Rooms lettings app',
  tenant: 'your Capital Rooms tenant app', landlord: 'your Capital Rooms landlord account', contractor: 'the Capital Rooms contractor app',
  cleaner: 'the Capital Rooms cleaner app',
}

const button = (href: string, label: string) =>
  `<p style="margin:0 0 22px;"><a href="${href}" style="display:inline-block;background:#181614;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;">${label}</a></p>`
const para = (t: string) => `<p style="margin:0 0 14px;font-size:15px;color:#1c1917;line-height:1.6;">${t}</p>`
const note = (t: string, last = false) => `<p style="margin:0 0 ${last ? 0 : 8}px;font-size:13px;color:#57534e;line-height:1.5;">${t}</p>`

/** What each app is for, and how to put it on the phone's home screen (26 Oct 2026, Harry: "send her an email saying how
 *  to download the app and save it as a web app"). Only the phone apps — office logins don't need it. */
const USES: Record<string, string[]> = {
  cleaner: ['See the houses and cleans you’ve been booked for', 'Book a clean, or move one — the tenants are told for you', 'Tap “Arrived” and “Finished”, add photos and notes for the office', 'Pick your finished cleans and send Capital Rooms one invoice for them'],
  contractor: ['See the jobs you’ve been sent, with photos and access details', 'Book the visit — the tenants are told for you', 'Finish the job with before and after photos'],
  tenant: ['Report a repair, with photos', 'See when visits and cleans are booked', 'Messages from the office in one place'],
}
function appGuide(role?: string | null): string {
  const uses = USES[role ?? '']
  if (!uses) return ''
  const li = (t: string) => `<li style="margin:0 0 6px;">${t}</li>`
  return `<div style="margin:6px 0 22px;padding:16px 18px;border:1px solid #e7e5e4;border-radius:12px;">`
    + `<p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#1c1917;">Put the app on your phone</p>`
    + `<p style="margin:0 0 10px;font-size:14px;color:#44403c;line-height:1.55;">There’s nothing to download from an app store. After you’ve chosen your password, open <strong>${PORTAL_URL.replace(/^https?:\/\//, '')}</strong> on your phone, then:</p>`
    + `<ul style="margin:0 0 12px;padding-left:20px;font-size:14px;color:#44403c;line-height:1.55;">`
    + li('<strong>iPhone</strong> — in Safari, tap the Share button (the square with an arrow), then <strong>Add to Home Screen</strong>, then <strong>Add</strong>.')
    + li('<strong>Android</strong> — in Chrome, tap the ⋮ menu, then <strong>Add to Home screen</strong> or <strong>Install app</strong>.')
    + `</ul><p style="margin:0 0 6px;font-size:14px;color:#44403c;line-height:1.55;">It then opens like any other app. Allow notifications when it asks, so you hear about new work straight away. With it you can:</p>`
    + `<ul style="margin:0;padding-left:20px;font-size:14px;color:#44403c;line-height:1.55;">${uses.map(li).join('')}</ul></div>`
}

type AccountPerson = { email: string; role?: string | null; salutation?: string | null; first_name?: string | null; last_name?: string | null }

/** "Dear Mr Smith," — titles always (Harry, 14 Oct 2026); first name only when there's no title on file. */
export function greeting(p?: Partial<AccountPerson> | null): string {
  return p && (p.last_name || p.first_name) ? dearLine(p) : 'Hello,'   // lib/people — never a lone first name
}

/**
 * The one sign-in link for a person (14 Oct 2026, "a standard way for all users"): someone with no login, or one
 * they've never used, signs in and is asked to choose a password (/account?setup=1); anyone already set up just signs
 * in. Used by every welcome/invite email, so nobody is ever left with an account they have no password for.
 */
export async function welcomeLink(s: SupabaseClient, email: string, users?: Map<string, any>): Promise<string | null> {
  const e = email.trim().toLowerCase()
  users = users ?? await authUsersByEmail(s)
  const u = users.get(e)
  if (u && statusOf(u).off) return null
  if (!u) return authLink(s, e, 'invite', '/account?setup=1')
  return statusOf(u).confirmed ? authLink(s, e, 'magiclink', '/') : authLink(s, e, 'magiclink', '/account?setup=1')
}

/**
 * Every sign-in email CROS sends goes through here, so they all look and read the same:
 *   no login yet (or never used)  → "Set up my account" (sign in → choose a password)
 *   has a login                    → "Choose a new password" (one-time reset link)
 * by: 'office' when staff pressed the button (People), 'self' when the person used "Forgot password?".
 * Never returns the link.
 */
export async function sendAccountEmail(s: SupabaseClient, person: AccountPerson, req?: Request | null, users?: Map<string, any>, by: 'office' | 'self' = 'office')
  : Promise<{ ok: boolean; sent?: 'invite' | 'reset'; error?: string }> {
  const email = person.email.trim().toLowerCase()
  users = users ?? await authUsersByEmail(s)
  const existing = users.get(email)
  if (existing && statusOf(existing).off) return { ok: false, error: 'their sign-in is turned off — turn it back on first' }
  const app = APP_NAME[person.role ?? ''] ?? 'your Capital Rooms account'
  const hi = para(greeting(person))

  if (!existing || !statusOf(existing).confirmed) {
    const link = await welcomeLink(s, email, users)
    if (!link) return { ok: false, error: 'Supabase would not make an invite link' }
    const r = await sendEmail(email, 'Set up your Capital Rooms account', hi
      + para(by === 'self'
        ? `You asked to sign in to ${app}, but your account hasn’t been set up yet. Tap below to sign in and choose your password.`
        : `You’ve been given access to ${app}. Tap below to sign in and choose your password.`)
      + button(link, 'Set up my account')
      + appGuide(person.role)
      + note(`The link works once. If it has expired, go to ${PORTAL_URL}/login and use “Forgot password?”.`)
      + note('Your browser or phone can save the password for you, so you never need to remember it.', true), { req, signature: false })
    return r.ok ? { ok: true, sent: 'invite' } : { ok: false, error: r.error }
  }

  const link = await authLink(s, email, 'recovery')
  if (!link) return { ok: false, error: 'Supabase would not make a reset link' }
  const r = await sendEmail(email, 'Reset your Capital Rooms password', hi
    + para(by === 'self'
      ? `We received a request to reset the password for ${app}.`
      : `The Capital Rooms office has sent you a link to choose a new password for ${app}.`)
    + button(link, 'Choose a new password')
    + note('The link works once and expires within the hour. Your current password keeps working until you change it.')
    + note(by === 'self' ? 'If this wasn’t you, ignore this email — your password stays as it is.' : 'If you weren’t expecting this, you can ignore it.', true), { req, signature: false })
  return r.ok ? { ok: true, sent: 'reset' } : { ok: false, error: r.error }
}

/** Turn a login off (records kept, can't sign in; existing sessions end within the hour) or back on. */
export async function setAccess(s: SupabaseClient, email: string, on: boolean): Promise<{ ok: boolean; error?: string }> {
  const u = (await authUsersByEmail(s)).get(email.trim().toLowerCase())
  if (!u) return on ? { ok: true } : { ok: false, error: 'they have no login to turn off' }
  const { error } = await s.auth.admin.updateUserById(u.id, { ban_duration: on ? 'none' : OFF_FOR } as any)
  return error ? { ok: false, error: error.message } : { ok: true }
}

/** Remove someone's two-step sign-in (lost phone). They sign in with their password alone until they set it up again. */
export async function clearTwoStep(s: SupabaseClient, email: string): Promise<{ ok: boolean; removed: number; error?: string }> {
  const u = (await authUsersByEmail(s)).get(email.trim().toLowerCase())
  if (!u) return { ok: false, removed: 0, error: 'no login' }
  let removed = 0
  for (const f of u.factors ?? []) {
    const { error } = await (s.auth.admin as any).mfa.deleteFactor({ userId: u.id, id: f.id })
    if (error) return { ok: false, removed, error: error.message }
    removed++
  }
  return { ok: true, removed }
}
