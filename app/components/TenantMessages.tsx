'use client'

// "Message tenant" on a tenancy (1 Nov 2026): pick a ready message — rent due, rent overdue, inspection, gas check,
// move-out… — already filled from the tenancy (rent, what's owed, the account they pay into, their reference), check
// it, choose email / text / app, and send. Nothing goes until Send is pressed. lib/tenancy/quickMessages.
import { useEffect, useMemo, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

interface Msg { id: string; group: string; name: string; subject: string; email: string; sms: string }
interface Facts {
  tenants: { name: string; email: string | null; phone: string | null }[]
  rent: number | null; owed: number; owedMonths: string[]; nextDue: string | null; paymentRef: string | null
  account: { label: string; name: string; sortCode: string; accountNo: string } | null; letOnly: boolean
}
type Channel = 'email' | 'sms' | 'push'

const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const day = (d: string | null) => d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
const gaps = (t: string) => [...new Set(t.match(/\[[^\]\n]{2,60}\]/g) ?? [])]

export default function TenantMessages({ tenancyId }: { tenancyId: string }) {
  const [facts, setFacts] = useState<Facts | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [error, setError] = useState('')
  const [open, setOpen] = useState<Msg | null>(null)
  const [subject, setSubject] = useState(''), [email, setEmail] = useState(''), [sms, setSms] = useState('')
  const [channels, setChannels] = useState<Channel[]>(['email'])
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState('')

  useEffect(() => {
    adminFetch(`/api/admin/tenancy-messages?tenancyId=${tenancyId}`).then(async r => {
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error ?? 'Could not load'); return }
      setFacts(d.facts); setMsgs(d.messages)
    })
  }, [tenancyId])

  const groups = useMemo(() => [...new Set(msgs.map(m => m.group))], [msgs])
  function pick(m: Msg) {
    setOpen(m); setSubject(m.subject); setEmail(m.email); setSms(m.sms); setResult('')
    const hasPhone = facts?.tenants.some(t => t.phone)
    setChannels(m.group === 'Rent' && hasPhone ? ['email', 'sms', 'push'] : ['email', 'push'])
  }
  const missing = open ? gaps([subject, channels.includes('email') ? email : '', channels.some(c => c !== 'email') ? sms : ''].join('\n')) : []

  async function send() {
    if (!open || !facts) return
    const who = facts.tenants.map(t => t.name).join(' & ')
    if (!window.confirm(`Send “${open.name}” to ${who} by ${channels.map(c => c === 'sms' ? 'text' : c === 'push' ? 'app' : 'email').join(', ')}?`)) return
    setSending(true); setResult('')
    const r = await adminFetch('/api/admin/tenancy-messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenancyId, subject, email, sms, channels }) })
    const d = await r.json().catch(() => ({}))
    setSending(false)
    if (!r.ok) { setResult(d.error ?? 'Not sent'); return }
    setResult((d.results as any[]).map(x => `${x.name}: ${[x.email && `email ${x.email}`, x.sms && `text ${x.sms}`, x.push && `app ${x.push}`].filter(Boolean).join(', ')}`).join(' · '))
  }

  if (error) return <p className="text-sm text-red-700">{error}</p>
  if (!facts) return <p className="text-sm text-neutral-400">Loading…</p>
  const inp = 'w-full rounded-lg border border-neutral-200 bg-white px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900'
  return (
    <div className="space-y-md">
      <div className="flex flex-wrap gap-x-lg gap-y-xs rounded-xl bg-neutral-50 px-md py-sm text-sm text-neutral-700">
        <span>Rent <strong>{facts.rent != null ? gbp(facts.rent) : '—'}</strong>, next due {day(facts.nextDue)}</span>
        <span className={facts.owed > 0 ? 'font-semibold text-red-700' : 'text-green-700'}>{facts.owed > 0 ? `Owes ${gbp(facts.owed)} (${facts.owedMonths.join(', ')})` : 'Rent account up to date'}</span>
        <span>Pays to {facts.account ? `${facts.account.label} · ${facts.account.sortCode} ${facts.account.accountNo}` : <span className="text-amber-700">no account on file</span>}</span>
        <span>Ref {facts.paymentRef ?? '—'}</span>
      </div>

      {groups.map(g => (
        <div key={g}>
          <p className="mb-xs text-xs font-semibold uppercase tracking-wide text-neutral-500">{g}</p>
          <div className="flex flex-wrap gap-xs">
            {msgs.filter(m => m.group === g).map(m => (
              <button key={m.id} type="button" onClick={() => pick(m)}
                className={`rounded-lg border px-md py-xs text-sm font-medium ${open?.id === m.id ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-800 hover:border-neutral-400'}`}>{m.name}</button>
            ))}
          </div>
        </div>
      ))}

      {open && (
        <div className="space-y-sm rounded-xl border border-neutral-200 bg-white p-md">
          <div className="flex flex-wrap items-center gap-md text-sm">
            <span className="font-semibold">Send by</span>
            {(['email', 'sms', 'push'] as Channel[]).map(c => (
              <label key={c} className="flex items-center gap-xs">
                <input type="checkbox" checked={channels.includes(c)} onChange={e => setChannels(x => e.target.checked ? [...x, c] : x.filter(y => y !== c))} />
                {c === 'email' ? 'Email' : c === 'sms' ? 'Text' : 'App notification'}
                {c === 'email' && !facts.tenants.some(t => t.email) && <span className="text-xs text-amber-700">(no email)</span>}
                {c === 'sms' && !facts.tenants.some(t => t.phone) && <span className="text-xs text-amber-700">(no mobile)</span>}
              </label>
            ))}
          </div>
          {channels.includes('email') && (<>
            <input className={inp} value={subject} onChange={e => setSubject(e.target.value)} />
            <textarea className={inp} rows={10} value={email} onChange={e => setEmail(e.target.value)} />
            <p className="text-xs text-neutral-500">“Dear …” and “Kind regards” are added. **Bold** and “- ” lists show as formatted.</p>
          </>)}
          {channels.some(c => c !== 'email') && (<>
            <label className="block text-xs font-semibold text-neutral-500">Text / app message <span className="font-normal">· {sms.length} characters</span></label>
            <textarea className={inp} rows={3} value={sms} onChange={e => setSms(e.target.value)} />
          </>)}
          {missing.length > 0 && <p className="text-sm text-amber-800">Fill in {missing.join(', ')} before sending.</p>}
          <div className="flex items-center gap-md">
            <button type="button" onClick={send} disabled={sending || !channels.length || missing.length > 0}
              className="rounded-lg bg-neutral-900 px-lg py-sm text-sm font-bold text-white disabled:opacity-40">{sending ? 'Sending…' : 'Send'}</button>
            <button type="button" onClick={() => setOpen(null)} className="text-sm text-neutral-600 hover:underline">Cancel</button>
          </div>
          {result && <p className="text-sm text-neutral-800">{result}</p>}
        </div>
      )}
    </div>
  )
}
