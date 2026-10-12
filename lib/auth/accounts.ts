// Sign-in accounts for everyone CROS knows (12 Oct 2026, Harry: "these things should all be possible for the user or
// admin to do" — never in Supabase). Server only — needs the service key.
//   accountStatuses(s)      — per email: has a login, last signed in, invited, turned off, two-step on
//   sendAccountEmail(...)   — no login yet → an invite (they choose a password); has one → a password reset link
//   setAccess(...)          — turn someone's sign-in off (their records stay) or back on
// Nobody — not the office, not Supabase — can see a password: they're stored scrambled. Resets replace them.
import type { SupabaseClient } from '@supabase/supabase-js'
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

/** Invite (no login yet) or password reset (has one). Never returns the link. */
export async function sendAccountEmail(s: SupabaseClient, person: { email: string; first_name?: string | null; role: string }, req?: Request | null, users?: Map<string, any>)
  : Promise<{ ok: boolean; sent?: 'invite' | 'reset'; error?: string }> {
  const email = person.email.trim().toLowerCase()
  users = users ?? await authUsersByEmail(s)
  const existing = users.get(email)
  if (existing && statusOf(existing).off) return { ok: false, error: 'their sign-in is turned off — turn it back on first' }
  const hi = person.first_name ? `Hi ${person.first_name},` : 'Hello,'
  const app = APP_NAME[person.role] ?? 'Capital Rooms'

  if (!existing || !statusOf(existing).confirmed) {
    // a brand-new login, or one invited before but never used: a fresh invite (an old one may have expired)
    // /auth/confirm signs them in, then /account asks them to choose a password
    const link = existing ? await authLink(s, email, 'magiclink', '/account?setup=1') : await authLink(s, email, 'invite', '/account?setup=1')
    if (!link) return { ok: false, error: 'Supabase would not make an invite link' }
    const r = await sendEmail(email, 'Your Capital Rooms account is ready', `
      <p style="margin:0 0 14px;font-size:15px;color:#1c1917;">${hi}</p>
      <p style="margin:0 0 14px;font-size:15px;color:#1c1917;">You’ve been given access to ${app}. Tap below to sign in and choose your password.</p>
      ${button(link, 'Set up my account')}
      <p style="margin:0 0 8px;font-size:13px;color:#57534e;">The link works once. If it has expired, go to ${PORTAL_URL}/login and use “Forgot password”.</p>
      <p style="margin:0;font-size:13px;color:#57534e;">Your browser or phone can save the password for you, so you never need to remember it.</p>`, { req, signature: false })
    return r.ok ? { ok: true, sent: 'invite' } : { ok: false, error: r.error }
  }

  const link = await authLink(s, email, 'recovery')
  if (!link) return { ok: false, error: 'Supabase would not make a reset link' }
  const r = await sendEmail(email, 'Choose a new Capital Rooms password', `
    <p style="margin:0 0 14px;font-size:15px;color:#1c1917;">${hi}</p>
    <p style="margin:0 0 14px;font-size:15px;color:#1c1917;">The Capital Rooms office has sent you a link to choose a new password for ${app}.</p>
    ${button(link, 'Choose a new password')}
    <p style="margin:0 0 8px;font-size:13px;color:#57534e;">The link works once and expires within the hour. Your current password keeps working until you change it.</p>
    <p style="margin:0;font-size:13px;color:#57534e;">If you weren’t expecting this, you can ignore it.</p>`, { req, signature: false })
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
