/**
 * POST /api/auth/sign-in-alert — called straight after someone signs in (lib/auth signIn, /auth/confirm).
 * Security without extra steps for users (Harry, 14 Oct 2026: "one password fine — the app itself needs to be
 * secure"): when an office account signs in from a browser/device it hasn't used before, the account
 * owner gets an email (and the administrators too) — so a stolen password is noticed at once.
 * Known devices are kept on the login itself (auth app_metadata.known_devices: a hash of the browser, never the IP).
 * The first sign-in after this went live is recorded quietly, so nobody gets a flood of alerts on day one.
 */
import crypto from 'node:crypto'
import { dearName } from '@/lib/people'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/sendEmail'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// office accounts only — tenants and landlords get no automatic emails while their messages are paused
const OFFICE = ['administrator', 'admin', 'lettings']
const SITE = process.env.NEXT_PUBLIC_APP_URL || 'https://cros-sigma.vercel.app'
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

function describe(ua: string) {
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'an unknown device'
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'a browser'
  return `${br} on ${os}`
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return NextResponse.json({ ok: false }, { status: 401 })
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: { user } } = await svc.auth.getUser(token)
  if (!user?.email) return NextResponse.json({ ok: false }, { status: 401 })
  const { data: p } = await svc.from('people').select('id, role, salutation, first_name, last_name').ilike('email', user.email).order('created_at').limit(1).maybeSingle()
  if (!p || !OFFICE.includes(p.role)) return NextResponse.json({ ok: true, skipped: true })

  const ua = req.headers.get('user-agent') ?? ''
  const device = describe(ua)
  const hash = crypto.createHash('sha256').update(`${user.id}|${ua}`).digest('hex').slice(0, 24)
  const known = ((user.app_metadata?.known_devices as Array<{ h: string; name: string; first: string; last: string }>) ?? [])
  const now = new Date().toISOString()
  const seen = known.find(d => d.h === hash)
  const next = seen
    ? known.map(d => (d.h === hash ? { ...d, last: now } : d))
    : [...known, { h: hash, name: device, first: now, last: now }].slice(-12)
  await svc.auth.admin.updateUserById(user.id, { app_metadata: { ...(user.app_metadata ?? {}), known_devices: next } })
  if (seen || !known.length) return NextResponse.json({ ok: true, alerted: false })

  // a new device: tell the owner (and the administrators, for office accounts)
  const city = decodeURIComponent(req.headers.get('x-vercel-ip-city') ?? '')
  const country = req.headers.get('x-vercel-ip-country') ?? ''
  const where = [city, country].filter(Boolean).join(', ') || 'an unknown location'
  const when = new Date().toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })
  const name = [p.salutation, p.first_name, p.last_name].filter(Boolean).join(' ') || user.email
  const greet = dearName(p)
  const html = `
<p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.6">Dear ${esc(greet)},</p>
<p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.6">Your Capital Rooms account was just signed in to from a device we haven’t seen before:</p>
<table style="font-size:14px;color:#333;margin:0 0 18px"><tr><td style="padding:3px 14px 3px 0;color:#78716c">When</td><td>${esc(when)}</td></tr>
<tr><td style="padding:3px 14px 3px 0;color:#78716c">Device</td><td>${esc(device)}</td></tr><tr><td style="padding:3px 14px 3px 0;color:#78716c">Near</td><td>${esc(where)}</td></tr></table>
<p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.6"><strong>If this was you</strong>, there’s nothing to do.</p>
<p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.6"><strong>If it wasn’t you</strong>, change your password straight away at <a href="${SITE}/account">${SITE}/account</a> (or use “Forgot password?” on the sign-in page), and let the office know.</p>`
  await sendEmail(user.email, 'New sign-in to your Capital Rooms account', html, { signature: false }).catch(() => null)
  {
    const { data: admins } = await svc.from('people').select('email').in('role', ['administrator', 'admin'])
    const to = ((admins ?? []) as { email: string | null }[]).map(a => a.email).filter((e): e is string => !!e && e.toLowerCase() !== user.email!.toLowerCase())
    if (to.length) await sendEmail(to, `New-device sign-in: ${name}`, `<p style="font-size:15px;color:#333;line-height:1.6">${esc(name)} (${esc(p.role)}) signed in to CROS from a new device: ${esc(device)}, near ${esc(where)}, ${esc(when)}. They have been emailed too. If it wasn’t them, reset their password from People › Office.</p>`, { signature: false }).catch(() => null)
  }
  return NextResponse.json({ ok: true, alerted: true })
}
