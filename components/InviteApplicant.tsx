'use client'

// Email a prospective tenant — ONE panel, used by Invite to apply (Available rooms) and by an applicant's own record on
// Applicants (23 Oct 2026, Harry: "invite to apply and sending emails via the applicant entry need to marry up").
// The same three choices everywhere, the rent you confirm (with the one-week holding deposit worked out), and the
// exact email (and text) shown before anything goes. All sending: POST /api/lettings/invite-to-apply.
import { useEffect, useRef, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

export type InviteTarget = { viewingId: string } | { applicantId: string } | { manual: Record<string, unknown> }
export type InviteMode = 'apply' | 'fasttrack' | 'reserve'
type Method = 'email' | 'sms' | 'both'
type Preview = { office?: { name: string; email: string }[]; to: string | null; phone: string | null; subject: string; html: string; sms: string; rent: number | null; deposit: number | null; asking: number | null; pinned: number | null; earlier: { at: string; rent: number | null } | null; existingApplicant: boolean }

export const INVITE_MODES: { key: InviteMode; title: string; hint: string }[] = [
  { key: 'apply', title: 'Make an offer', hint: 'The application form. You review it, then decide whether to accept.' },
  { key: 'fasttrack', title: 'Fast-track', hint: 'They fill in their details, then go straight on to pay the holding deposit — no review step.' },
  { key: 'reserve', title: 'Reserve only', hint: 'The holding deposit and how to pay it. For an offer you’ve already accepted.' },
]
const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const oneWeek = (m: number) => Math.round(((m * 12) / 52) * 100) / 100

export default function InviteApplicant({ target, initialMode = 'apply', onSent }: { target: InviteTarget; initialMode?: InviteMode; onSent?: (r: any) => void }) {
  const [mode, setMode] = useState<InviteMode>(initialMode)
  const [method, setMethod] = useState<Method>('email')
  const [rent, setRent] = useState('')
  const [p, setP] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [copied, setCopied] = useState(false)
  // colleagues copied in — remembered on this device (23 Oct 2026, Harry: "cc other staff on all these emails")
  const [cc, setCc] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('cros.invite.cc') || '[]') } catch { return [] } })
  const toggleCc = (e: string) => setCc(list => { const next = list.includes(e) ? list.filter(x => x !== e) : [...list, e]; try { localStorage.setItem('cros.invite.cc', JSON.stringify(next)) } catch {} ; return next })
  // once it's gone, Send locks until you choose to send again — no accidental second email
  const [sentOnce, setSentOnce] = useState(false)
  const seeded = useRef(false)
  const key = JSON.stringify(target)
  const n = Number(rent.replace(/[£,\s]/g, ''))
  const needsRent = mode !== 'apply'

  const post = (extra: Record<string, unknown>) => adminFetch('/api/lettings/invite-to-apply', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...target, method, mode, cc, ...(needsRent && n > 0 ? { rent: n } : {}), ...extra }),
  })

  // the preview follows every change (debounced); the first one fills the rent from the offer, else the asking rent
  useEffect(() => {
    setResult(null); setSentOnce(false)
    const t = setTimeout(async () => {
      const r = await post({ preview: true }).catch(() => null)
      const d = r ? await r.json().catch(() => ({})) : {}
      if (!r?.ok) { setError(d.error ?? 'The email couldn’t be prepared.'); setP(null); return }
      setError(null); setP(d)
      if (!seeded.current && (d.pinned ?? d.asking)) { seeded.current = true; if (!rent) setRent(String(d.pinned ?? d.asking)) }
    }, 350)
    return () => clearTimeout(t)
  }, [key, mode, method, rent])

  async function send() {
    if (needsRent && !(n > 0)) { setError('Enter the monthly rent that’s been agreed.'); return }
    setSending(true); setError(null)
    try {
      const r = await post({})
      const d = await r.json().catch(() => ({}))
      setResult(d)
      if (r.ok && (d.emailSent || d.smsSent)) { setSentOnce(true); onSent?.(d) }
      else if (!r.ok) setError(d.error ?? 'Not sent')
    } catch { setError('Couldn’t reach CROS — check your connection.') }
    finally { setSending(false) }
  }

  const changed = p?.earlier?.rent && n > 0 && Math.abs(p.earlier.rent - n) > 0.004
  const card = (on: boolean) => `rounded-xl border-2 p-md text-left transition ${on ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 bg-white hover:border-neutral-400'}`

  return (
    <div className="space-y-lg">
      <section>
        <p className="mb-sm text-xs font-bold uppercase tracking-wide text-neutral-500">What to send</p>
        <div className="grid gap-sm sm:grid-cols-3">
          {INVITE_MODES.map(m => (
            <button key={m.key} type="button" onClick={() => setMode(m.key)} className={card(mode === m.key)}>
              <span className="block text-sm font-bold text-neutral-900">{m.title}</span>
              <span className="mt-xs block text-xs text-neutral-500">{m.hint}</span>
            </button>
          ))}
        </div>
      </section>

      {needsRent && (
        <section className="grid gap-sm sm:grid-cols-3">
          <label className="block text-xs font-semibold text-neutral-700">Monthly rent agreed (£)
            <input inputMode="decimal" value={rent} onChange={e => setRent(e.target.value)} className="mt-xs w-full rounded-lg border border-neutral-300 px-md py-sm text-lg font-bold" />
          </label>
          <div className="rounded-lg bg-neutral-50 px-md py-sm"><p className="text-xs text-neutral-500">Holding deposit (one week)</p><p className="text-lg font-bold tabular-nums">{n > 0 ? gbp(oneWeek(n)) : '—'}</p></div>
          <div className="rounded-lg bg-neutral-50 px-md py-sm text-xs text-neutral-600">
            {p?.asking ? <p>Asking rent: <strong>{gbp(p.asking)}</strong></p> : <p>No asking rent on the room</p>}
            {p?.pinned ? <p>On their offer: <strong>{gbp(p.pinned)}</strong></p> : null}
            {p?.asking && n > 0 && Math.abs(p.asking - n) > 0.004 && (
              <button type="button" onClick={() => setRent(String(p.asking))} className="mt-xs rounded-md border border-neutral-300 bg-white px-sm py-[2px] text-xs font-semibold text-neutral-800">Use the asking rent ({gbp(p.asking)})</button>
            )}
          </div>
        </section>
      )}
      {changed && <p className="rounded-lg bg-amber-50 px-md py-sm text-sm text-amber-900">They were emailed {gbp(p!.earlier!.rent!)} on {new Date(p!.earlier!.at).toLocaleString('en-GB', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })}. This one is headed “Updated” and says it replaces that email.</p>}

      <section>
        <p className="mb-sm text-xs font-bold uppercase tracking-wide text-neutral-500">Send by</p>
        <div className="flex flex-wrap gap-sm">
          {([['email', 'Email'], ['sms', 'Text'], ['both', 'Email + text']] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setMethod(v)} className={`rounded-lg border-2 px-md py-sm text-sm font-semibold ${method === v ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-700'}`}>{l}</button>
          ))}
        </div>
        {method !== 'sms' && (p?.office?.length ?? 0) > 0 && (
          <div className="mt-sm flex flex-wrap items-center gap-xs text-xs">
            <span className="font-semibold text-neutral-600">Copy in:</span>
            {p!.office!.map(o => (
              <label key={o.email} className={`flex cursor-pointer items-center gap-xs rounded-full border px-sm py-[3px] ${cc.includes(o.email) ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 text-neutral-700'}`}>
                <input type="checkbox" className="sr-only" checked={cc.includes(o.email)} onChange={() => toggleCc(o.email)} />{o.name}
              </label>
            ))}
          </div>
        )}
        <p className="mt-xs text-xs text-neutral-500">To {[method !== 'sms' ? (p?.to || 'no email recorded') : null, method !== 'email' ? (p?.phone || 'no mobile recorded') : null].filter(Boolean).join(' · ')}{p?.existingApplicant ? ' · already an applicant — their one record is used' : ''}</p>
      </section>

      <section>
        <p className="mb-sm text-xs font-bold uppercase tracking-wide text-neutral-500">What they’ll get</p>
        {!p ? <p className="text-sm text-neutral-400">{error ? '' : 'Preparing the preview…'}</p> : <>
          {method !== 'sms' && <>
            <p className="mb-xs text-sm"><span className="text-neutral-500">Subject:</span> <strong>{p.subject || '—'}</strong></p>
            {p.html ? <iframe title="Email preview" srcDoc={p.html} sandbox="allow-same-origin" className="h-[440px] w-full rounded-lg border border-neutral-200 bg-white" /> : <p className="text-sm text-amber-800">Enter the rent to see the email.</p>}
          </>}
          {method !== 'email' && p.sms && <p className="mt-sm rounded-xl bg-neutral-100 px-md py-sm text-sm text-neutral-800"><span className="mb-xs block text-[11px] font-bold uppercase tracking-wide text-neutral-500">Text message</span>{p.sms}</p>}
        </>}
      </section>

      {error && <p className="rounded-lg bg-red-50 px-md py-sm text-sm font-semibold text-red-800">{error}</p>}
      {result && (result.emailSent || result.smsSent || result.emailError || result.smsError) && (
        <div className="space-y-xs rounded-lg border border-neutral-200 bg-neutral-50 p-md text-sm">
          {result.emailSent && <p className="font-semibold text-green-700">✓ Email sent to {p?.to}{result.cc?.length ? ` (copy to ${result.cc.join(', ')})` : ''}</p>}
          {result.emailError && <p className="font-medium text-amber-700">⚠ Email: {result.emailError}</p>}
          {result.smsSent && <p className="font-semibold text-green-700">✓ Text sent to {p?.phone}</p>}
          {result.smsError && <p className="font-medium text-amber-700">⚠ Text: {result.smsError}</p>}
          {result.link && (
            <div className="flex items-center gap-sm border-t border-neutral-200 pt-xs">
              <p className="min-w-0 flex-1 break-all rounded border border-neutral-200 bg-white px-sm py-xs text-xs text-neutral-600">{result.link}</p>
              <button type="button" onClick={async () => { await navigator.clipboard.writeText(result.link); setCopied(true); setTimeout(() => setCopied(false), 2000) }} className="shrink-0 rounded bg-neutral-900 px-sm py-xs text-xs font-medium text-white">{copied ? 'Copied!' : 'Copy link'}</button>
            </div>
          )}
        </div>
      )}

      {sentOnce && <button type="button" onClick={() => { if (confirm('Send it again? They’ll get a second copy.')) setSentOnce(false) }} className="w-full text-center text-xs font-semibold text-neutral-500 underline">Send again…</button>}
      <button type="button" onClick={send} disabled={sending || sentOnce || !p || (needsRent && !(n > 0))}
        className="w-full rounded-lg bg-neutral-900 py-md text-sm font-bold text-white hover:bg-neutral-800 disabled:opacity-40">
        {sending ? 'Sending…' : sentOnce ? '✓ Sent' : `Send — ${INVITE_MODES.find(m => m.key === mode)!.title}${needsRent && n > 0 ? ` · ${gbp(n)} a month` : ''}`}
      </button>
    </div>
  )
}
