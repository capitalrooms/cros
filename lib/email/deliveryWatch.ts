// Did it actually arrive? (16 Oct 2026) — the email service accepts an email and only finds out later that it
// bounced, or blocks it outright because that address bounced before (a "suppressed" address: every later email to
// it is silently dropped — Claire Wambugu's complaint reply, 16 Oct). Nothing in CROS noticed. This looks at what
// the service reports for recent emails and tells the office once about each one that didn't arrive.
// Called every 5 minutes from the database's every-minute tick (app/api/emergencies/tick).
import type { SupabaseClient } from '@supabase/supabase-js'
import { deliverEmail, COPY_TO } from '@/lib/sendEmail'

const BAD: Record<string, string> = {
  bounced: 'Bounced — their email provider rejected it (usually a wrong or closed address).',
  suppressed: 'Blocked — this address bounced before, so the email service no longer sends to it at all.',
  failed: 'Failed — the email service couldn’t send it.',
  complained: 'Marked as spam by the recipient.',
}
const KEY = 'email_delivery_watch'

export async function checkDeliveries(s: SupabaseClient, opts: { force?: boolean } = {}) {
  const key = process.env.RESEND_API_KEY
  if (!key) return { checked: 0, alerted: 0 }
  const { data: row } = await s.from('system_settings').select('value').eq('key', KEY).maybeSingle()
  const state = (() => { try { return JSON.parse((row as any)?.value || '{}') } catch { return {} } })() as { lastRun?: string; reported?: string[] }
  if (!opts.force && state.lastRun && Date.now() - Date.parse(state.lastRun) < 3 * 60_000) return { checked: 0, alerted: 0, skipped: true }
  const reported = new Set(state.reported ?? [])
  // claim this run first, so a second tick in the same minute doesn't send the same alert
  await s.from('system_settings').upsert({ key: KEY, value: JSON.stringify({ ...state, lastRun: new Date().toISOString() }) }, { onConflict: 'key' })

  const since = Date.now() - 3 * 86_400_000
  const emails: any[] = []
  let after = ''
  for (let page = 0; page < 5; page++) {
    const r = await fetch(`https://api.resend.com/emails?limit=100${after ? `&after=${after}` : ''}`, { headers: { Authorization: `Bearer ${key}` } })
    if (!r.ok) break
    const j: any = await r.json().catch(() => ({}))
    const list: any[] = j.data ?? []
    emails.push(...list)
    if (!j.has_more || !list.length || Date.parse(list[list.length - 1].created_at) < since) break
    after = list[list.length - 1].id
  }
  const recent = emails.filter(e => Date.parse(e.created_at) >= since)
  const late = (e: any) => e.last_event === 'delivery_delayed' && Date.now() - Date.parse(e.created_at) > 60 * 60_000
  const problems = recent.filter(e => (BAD[e.last_event] || late(e)) && !reported.has(`${e.id}:${e.last_event}`)
    && !/^(Not sent|Didn’t arrive)/.test(String(e.subject)))

  if (problems.length) {
    const addrs = [...new Set(problems.flatMap(e => e.to ?? []).map((a: string) => a.toLowerCase()))]
    const { data: people } = await s.from('people').select('email, salutation, first_name, last_name, full_name, role').in('email', addrs)
    const { data: apps } = await s.from('applicants').select('email, full_name').in('email', addrs)
    const who = (a: string) => {
      const p: any = (people ?? []).find((x: any) => String(x.email).toLowerCase() === a)
      if (p) return `${[p.salutation, p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name} (${p.role})`
      const ap: any = (apps ?? []).find((x: any) => String(x.email).toLowerCase() === a)
      return ap ? `${ap.full_name} (applicant)` : ''
    }
    const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
    const rows = problems.map(e => {
      const to = (e.to ?? []).join(', ')
      const name = (e.to ?? []).map((a: string) => who(a.toLowerCase())).filter(Boolean).join(', ')
      const when = new Date(e.created_at).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      return `<tr><td style="padding:8px;border-bottom:1px solid #eee;vertical-align:top"><b>${esc(name || to)}</b>${name ? `<br><span style="color:#666">${esc(to)}</span>` : ''}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;vertical-align:top">${esc(e.subject)}<br><span style="color:#666">${esc(when)}</span></td>
        <td style="padding:8px;border-bottom:1px solid #eee;vertical-align:top">${esc(BAD[e.last_event] ?? 'Still not delivered after an hour — their provider is holding it.')}</td></tr>`
    }).join('')
    const res = await deliverEmail({
      to: [COPY_TO], noCopy: true,
      subject: `Didn’t arrive: ${problems.length === 1 ? `${problems[0].subject}`.slice(0, 120) : `${problems.length} emails from CROS`}`,
      html: `<p>${problems.length === 1 ? 'This email' : 'These emails'} from CROS did <b>not</b> reach the person:</p>
        <table style="border-collapse:collapse;font-size:14px;width:100%"><tr style="text-align:left;color:#666"><th style="padding:8px">To</th><th style="padding:8px">Email</th><th style="padding:8px">What happened</th></tr>${rows}</table>
        <p><b>What to do:</b> check the email address with them (phone or text) and correct it in CROS, then send again.
        If the address was right all along, remove it from the blocked list in the email service (Resend › Suppressions) before sending again.</p>`,
    })
    if (res.ok) for (const e of problems) reported.add(`${e.id}:${e.last_event}`)
  }
  await s.from('system_settings').upsert({ key: KEY, value: JSON.stringify({ lastRun: new Date().toISOString(), reported: [...reported].slice(-500) }) }, { onConflict: 'key' })
  return { checked: recent.length, alerted: problems.length }
}
