'use client'

// The bank calendar (1 Nov 2026, Harry): every day of the client account as a tile — green when an import covered the
// whole day, amber when it was imported part-way through the day, red when nothing covers it — with the number of
// lines on it. Click a day to see what came in and what each is matched to; a holding deposit that's exactly what an
// applicant owes can be reconciled there and its receipt emailed. The search finds a tenant's rent history (when each
// month landed, how late) or a landlord's payments out. /api/admin/bank-import/calendar.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import { bankTabs } from '@/lib/financeTabs'
import BackButton from '@/app/components/BackButton'
import { adminFetch } from '@/lib/adminFetch'
import { CAL, todayYmd } from '@/components/calendar/look'

interface Suggestion { applicantId: string; name: string; email: string | null; room: string; house: string; expected: number }
interface Credit { id: string; amount: number; description: string; ref: string | null; status: string; matched: string | null; tenancyId: string | null; suggestions: Suggestion[]; nearDuplicate: boolean }
interface Day { date: string; lines: number; in: number; out: number; state: 'full' | 'part' | 'gap' | 'future'; note: string; credits: Credit[] }
interface Found {
  tenants: { tenancyId: string; name: string; room: string; house: string; ref: string | null; sentence: string; months: { month: string; due: string; amount: number; paidIn: string | null; daysLate: number | null; how: string }[] }[]
  landlords: { name: string; payments: { date: string; amount: number; reference: string; property: string }[] }[]
}

const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const longDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const shortDay = (d: string | null) => d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const monthLabel = (m: string) => new Date(`${m}-01T12:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
const shift = (m: string, n: number) => { const [y, mo] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mo - 1 + n, 1)); return d.toISOString().slice(0, 7) }
const TILE: Record<Day['state'], string> = {
  full: 'bg-green-50 border-green-300 text-green-900', part: 'bg-amber-50 border-amber-300 text-amber-900',
  gap: 'bg-red-50 border-red-300 text-red-900', future: 'bg-neutral-50 border-neutral-200 text-neutral-400',
}

export default function BankCalendarPage() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [days, setDays] = useState<Day[] | null>(null)
  const [breaks, setBreaks] = useState<{ after: string; before: string }[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [found, setFound] = useState<Found | null>(null)
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState('')
  const [done, setDone] = useState<Record<string, { holdingId: string; holdNo: string; applicantId: string; email: string | null; emailed?: string }>>({})

  async function load(m = month) {
    setDays(null); setError('')
    const r = await adminFetch(`/api/admin/bank-import/calendar?month=${m}`)
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'Could not load'); return }
    setDays(d.days); setBreaks(d.balanceBreaks ?? [])
  }
  useEffect(() => { load(month) }, [month]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (q.trim().length < 2) { setFound(null); return }
    const t = setTimeout(async () => {
      setSearching(true)
      const r = await adminFetch(`/api/admin/bank-import/calendar?q=${encodeURIComponent(q.trim())}`)
      setFound(r.ok ? await r.json() : null); setSearching(false)
    }, 450)
    return () => clearTimeout(t)
  }, [q])

  async function reconcile(c: Credit, date: string, sg: Suggestion) {
    if (!window.confirm(`Record ${gbp(c.amount)} received ${shortDay(date)} as ${sg.name}’s holding deposit for ${sg.room}, ${sg.house}? This updates their letting file. Nothing is emailed yet.`)) return
    setBusy(c.id); setError('')
    try {
      const r = await adminFetch('/api/lettings/holding-deposit', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicantId: sg.applicantId, action: 'send', amount: c.amount, receivedOn: date, method: 'bank_transfer', payerName: c.description.slice(0, 160), payerReference: c.ref ?? '' }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.holdingId) throw new Error(d.error ?? 'Could not record it')
      const l = await adminFetch('/api/admin/bank-import/calendar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'link_holding', transactionId: c.id, holdingId: d.holdingId }) })
      if (!l.ok) { const ld = await l.json().catch(() => ({})); setError(`Recorded as ${d.holdNo}, but the bank line wasn’t linked: ${ld.error ?? ''}`) }
      setDone(x => ({ ...x, [c.id]: { holdingId: d.holdingId, holdNo: d.holdNo, applicantId: sg.applicantId, email: sg.email } }))
      load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not record it') } finally { setBusy('') }
  }

  async function emailReceipt(txnId: string) {
    const h = done[txnId]
    if (!h?.email) return
    if (!window.confirm(`Email receipt ${h.holdNo} to ${h.email}?`)) return
    setBusy(txnId)
    const r = await adminFetch('/api/lettings/holding-deposit', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicantId: h.applicantId, action: 'send', holdingId: h.holdingId, receipt: { send: true, to: h.email } }) })
    const d = await r.json().catch(() => ({}))
    setBusy('')
    if (!r.ok || d.errors?.length) { setError(d.error ?? d.errors?.join(' · ') ?? 'Not sent'); return }
    setDone(x => ({ ...x, [txnId]: { ...h, emailed: d.receipt } }))
  }

  const firstDow = days?.length ? (new Date(`${days[0].date}T12:00:00`).getDay() + 6) % 7 : 0   // Monday first
  const openDay = days?.find(d => d.date === open) ?? null
  const counts = days ? { full: days.filter(d => d.state === 'full').length, part: days.filter(d => d.state === 'part').length, gap: days.filter(d => d.state === 'gap').length } : null

  return (
    <div className="min-h-screen fin">
      <AppBar left={<BackButton href="/admin/finance" />} title="Bank" />
      <PageHero look="olive" title="Bank" subtitle="Each day: whether the bank is imported, how many lines, and what they matched to" tabs={bankTabs('calendar')} />
      <div className="mx-auto max-w-6xl px-lg py-xl space-y-lg">
        <div className="flex flex-wrap items-end justify-between gap-md">
          <p className="text-sm text-neutral-600">Client account · every day the bank imports have covered.</p>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search a tenant, room, reference or landlord"
            className="w-full max-w-sm rounded-xl border border-neutral-300 bg-white px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
        </div>

        {q.trim().length >= 2 && (
          <section className="rounded-2xl border border-neutral-200 bg-white p-lg">
            {searching && <p className="text-sm text-neutral-400">Searching…</p>}
            {found && !found.tenants.length && !found.landlords.length && !searching && <p className="text-sm text-neutral-500">No tenant or landlord matches “{q}”.</p>}
            {found?.tenants.map(t => (
              <div key={t.tenancyId} className="mb-lg last:mb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-sm">
                  <p className="font-bold text-neutral-900"><Link href={`/admin/lettings/${t.tenancyId}?tab=money`} className="hover:underline">{t.name}</Link> <span className="font-normal text-neutral-500">· {t.room}, {t.house}{t.ref ? ` · ${t.ref}` : ''}</span></p>
                  <p className="text-sm font-semibold text-neutral-700">{t.sentence}</p>
                </div>
                <div className="mt-sm overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-neutral-500"><tr><th className="py-xs pr-md">Month</th><th className="py-xs pr-md">Due</th><th className="py-xs pr-md text-right">Rent</th><th className="py-xs pr-md">Landed in the bank</th><th className="py-xs">On time?</th></tr></thead>
                    <tbody className="divide-y divide-neutral-100">
                      {t.months.map(m => (
                        <tr key={m.month}>
                          <td className="py-xs pr-md">{monthLabel(m.month.slice(0, 7))}</td>
                          <td className="py-xs pr-md text-neutral-600">{shortDay(m.due)}</td>
                          <td className="py-xs pr-md text-right tabular-nums">{gbp(m.amount)}</td>
                          <td className="py-xs pr-md">{m.paidIn ? shortDay(m.paidIn) : m.how === 'part' ? 'Part paid' : 'Not paid'}</td>
                          <td className={`py-xs font-semibold ${m.daysLate == null ? (m.paidIn ? 'text-neutral-500' : 'text-red-700') : m.daysLate <= 0 ? 'text-green-700' : m.daysLate <= 3 ? 'text-amber-700' : 'text-red-700'}`}>
                            {m.daysLate == null ? (m.paidIn ? '—' : 'Outstanding') : m.daysLate <= 0 ? 'On time' : `${m.daysLate} day${m.daysLate === 1 ? '' : 's'} late`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            {found?.landlords.map(l => (
              <div key={l.name} className="mb-lg last:mb-0">
                <p className="font-bold text-neutral-900">{l.name} <span className="font-normal text-neutral-500">· payments out</span></p>
                {l.payments.length ? (
                  <ul className="mt-sm divide-y divide-neutral-100 text-sm">
                    {l.payments.map(p => <li key={p.reference} className="flex justify-between gap-md py-xs"><span>{shortDay(p.date)} · {p.reference} · {p.property}</span><span className="tabular-nums font-semibold">{gbp(p.amount)}</span></li>)}
                  </ul>
                ) : <p className="mt-xs text-sm text-neutral-500">No payments recorded yet.</p>}
              </div>
            ))}
          </section>
        )}

        <section className="rounded-2xl border border-neutral-200 bg-white p-lg">
          <div className="mb-md flex flex-wrap items-center justify-between gap-md">
            <div className="flex items-center gap-sm">
              <button type="button" onClick={() => { setMonth(shift(month, -1)); setOpen(null) }} className="rounded-lg border border-neutral-300 px-sm py-xs text-sm">‹</button>
              <h2 className="min-w-[10rem] text-center text-lg font-bold">{monthLabel(month)}</h2>
              <button type="button" onClick={() => { setMonth(shift(month, 1)); setOpen(null) }} className="rounded-lg border border-neutral-300 px-sm py-xs text-sm">›</button>
            </div>
            {counts && <p className="text-xs text-neutral-600"><span className="font-semibold text-green-800">{counts.full} covered</span> · <span className="font-semibold text-amber-800">{counts.part} part day</span> · <span className="font-semibold text-red-800">{counts.gap} not imported</span></p>}
          </div>
          {error && <p className="mb-md rounded-lg bg-red-50 px-md py-sm text-sm text-red-700">{error}</p>}
          {breaks.length > 0 && <p className="mb-md rounded-lg bg-red-50 px-md py-sm text-sm text-red-800">The running balance jumps {breaks.map(b => `between ${shortDay(b.after)} and ${shortDay(b.before)}`).join(', ')} — lines are missing there. Download and import that period again.</p>}
          {!days && !error && <p className="text-sm text-neutral-400">Loading…</p>}
          {days && (
            <div className="grid grid-cols-7 gap-xs text-center">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d} className="pb-xs text-[11px] font-semibold uppercase tracking-wider" style={{ color: CAL.muted }}>{d}</div>)}
              {Array.from({ length: firstDow }).map((_, i) => <div key={`b${i}`} />)}
              {days.map(d => (
                <button key={d.date} type="button" title={d.note} onClick={() => setOpen(open === d.date ? null : d.date)}
                  className={`flex aspect-square min-h-[52px] flex-col items-center justify-center rounded-lg border text-sm ${TILE[d.state]} ${open === d.date ? 'ring-2 ring-neutral-900' : ''}`}>
                  <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-0.5 text-[11px] ${d.date === todayYmd() ? 'font-bold text-white' : 'opacity-70'}`} style={d.date === todayYmd() ? { background: CAL.today } : undefined}>{Number(d.date.slice(8))}</span>
                  <span className="text-lg font-black leading-none">{d.state === 'future' ? '' : d.lines}</span>
                  {d.credits.some(c => c.status === 'unmatched') && <span className="mt-[2px] h-[6px] w-[6px] rounded-full bg-red-600" aria-label="unmatched" />}
                </button>
              ))}
            </div>
          )}
          <p className="mt-md text-xs text-neutral-500">The number is how many lines (in and out) the bank showed that day. Green: a whole-day import covers it. Amber: imported part-way through the day, so later payments may be missing. Red: not imported. A red dot: a payment in not yet matched.</p>
        </section>

        {openDay && (
          <section className="rounded-2xl border border-neutral-200 bg-white p-lg">
            <h3 className="text-base font-bold">{longDay(openDay.date)}</h3>
            <p className="text-sm text-neutral-600">{openDay.note}{openDay.state !== 'future' ? ` · ${openDay.in} in, ${openDay.out} out` : ''}</p>
            {!openDay.credits.length && <p className="mt-md text-sm text-neutral-500">No payments in recorded for this day.</p>}
            <ul className="mt-md divide-y divide-neutral-100">
              {openDay.credits.map(c => (
                <li key={c.id} className="py-sm">
                  <div className="flex flex-wrap items-start justify-between gap-md">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-neutral-900">{c.description}</p>
                      {c.matched ? <p className="text-sm text-green-800">Matched to {c.matched}{c.tenancyId && <> · <Link href={`/admin/lettings/${c.tenancyId}?tab=money`} className="underline">letting file</Link></>}</p>
                        : c.nearDuplicate ? <p className="text-sm text-amber-800">Looks like a line already imported — check it on <Link href="/admin/reconciliation" className="underline">the Matching tab</Link></p>
                        : c.status === 'ignored' ? <p className="text-sm text-neutral-500">Set aside (not rent)</p>
                        : <p className="text-sm text-red-700">Not matched yet</p>}
                    </div>
                    <p className="shrink-0 text-base font-bold tabular-nums">{gbp(c.amount)}</p>
                  </div>
                  {done[c.id] ? (
                    <div className="mt-sm flex flex-wrap items-center gap-md rounded-lg bg-green-50 px-md py-sm text-sm text-green-900">
                      <span>Recorded as holding deposit {done[c.id].holdNo}; letting file updated.</span>
                      {done[c.id].emailed ? <span className="font-semibold">Receipt emailed to {done[c.id].emailed}</span>
                        : done[c.id].email ? <button type="button" disabled={busy === c.id} onClick={() => emailReceipt(c.id)} className="rounded-lg bg-neutral-900 px-md py-xs text-xs font-bold text-white disabled:opacity-40">Email receipt to {done[c.id].email}</button>
                        : <span>No email on file for the receipt.</span>}
                    </div>
                  ) : c.status === 'unmatched' && c.suggestions.length > 0 && (
                    <div className="mt-sm space-y-xs">
                      {c.suggestions.map(sg => (
                        <div key={sg.applicantId} className="flex flex-wrap items-center gap-md rounded-lg bg-blue-50 px-md py-sm text-sm text-blue-900">
                          <span>Holding deposit of {gbp(sg.expected)} expected from <strong>{sg.name}</strong> for {sg.room}, {sg.house}</span>
                          <button type="button" disabled={busy === c.id} onClick={() => reconcile(c, openDay.date, sg)} className="rounded-lg bg-neutral-900 px-md py-xs text-xs font-bold text-white disabled:opacity-40">{busy === c.id ? 'Recording…' : 'Reconcile'}</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {c.status === 'unmatched' && !c.suggestions.length && !done[c.id] && <p className="mt-xs text-xs text-neutral-500">Match it on <Link href="/admin/reconciliation" className="underline">the Matching tab</Link>.</p>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
