'use client'
// "Sort out" a tenant's rent (12 Oct 2026) — one panel on the Rent Roll, Arrears and the letting file's Money tab.
// Everything it does is checked and recorded by lib/rent/resolve (via /api/admin/rent-resolve).
import { useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

const gbp = (n: number) => `£${Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const monthName = (iso: string) => iso ? new Date(`${iso.slice(0, 7)}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''
const day = (iso: string | null) => iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

type Form = { kind: 'direct' | 'reduce' | 'refund' | 'reverse'; chargeId?: string; key?: string } | null

export default function RentSortOut({ tenancyId, onClose, onChanged }: { tenancyId: string; onClose: () => void; onChanged?: () => void }) {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<Form>(null)
  const [f, setF] = useState<Record<string, any>>({})
  const [tell, setTell] = useState({ email: true, text: false, extra: '' })

  async function load() {
    const r = await adminFetch(`/api/admin/rent-resolve?tenancy=${tenancyId}`)
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error || 'Could not load the rent'); return }
    setData(d); setTell(t => ({ ...t, email: !!d.position.tenancy.email, text: !d.position.tenancy.email && !!d.position.tenancy.phone }))
  }
  useEffect(() => { load() }, [tenancyId])   // eslint-disable-line react-hooks/exhaustive-deps

  async function act(body: Record<string, unknown>, ok: (d: any) => string) {
    setBusy(true); setError(''); setDone('')
    const r = await adminFetch('/api/admin/rent-resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenancy: tenancyId, ...body }) })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setError(d.error || 'That didn’t work'); return }
    setDone(ok(d)); setForm(null); setF({}); await load(); onChanged?.()
  }

  const pos = data?.position, t = pos?.tenancy
  const plan = (pos?.plans ?? []).find((p: any) => p.status === 'active')
  const inp = 'w-full rounded-lg border border-neutral-300 bg-white px-sm py-xs text-sm text-neutral-900'
  const small = 'rounded-lg border border-neutral-300 px-sm py-0.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-md md:p-xl" onClick={() => !busy && onClose()}>
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <header className="flex items-start justify-between gap-md border-b border-neutral-100 px-lg py-md">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Adjust rent account</p>
            <h2 className="text-lg font-bold text-neutral-900">{t ? `${t.tenant} · ${t.room}, ${t.property}` : 'Loading…'}</h2>
            {t && <p className="text-xs text-neutral-500">Rent {gbp(t.rent)} a month · pays with reference <span className="font-mono">{t.reference ?? '—'}</span></p>}
          </div>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-neutral-400 hover:text-neutral-800">×</button>
        </header>

        <div className="space-y-lg px-lg py-md">
          {error && <p className="rounded-lg border border-red-200 bg-red-50 p-sm text-sm text-red-800">{error}</p>}
          {done && <p className="rounded-lg border border-green-200 bg-green-50 p-sm text-sm text-green-900">{done}</p>}
          {!pos ? <p className="text-sm text-neutral-500">Loading…</p> : <>
            <div className="flex flex-wrap gap-sm">
              <span className={`rounded-full px-md py-xs text-sm font-bold ${pos.owed > 0.005 ? 'bg-amber-100 text-amber-900' : 'bg-green-100 text-green-900'}`}>{pos.owed > 0.005 ? `${gbp(pos.owed)} still owed` : 'Nothing owed'}</span>
              {pos.over > 0.005 && <span className="rounded-full bg-blue-100 px-md py-xs text-sm font-bold text-blue-900">{gbp(pos.over)} paid over</span>}
              {plan && <span className="rounded-full bg-violet-100 px-md py-xs text-sm font-bold text-violet-900">Plan: {gbp(plan.instalment)} a month from {day(plan.starts_on)}</span>}
              {pos.told[0] && <span className="rounded-full bg-neutral-100 px-md py-xs text-sm text-neutral-700">Last told {day(pos.told[0].at)}</span>}
            </div>

            {/* months */}
            <section>
              <h3 className="mb-xs text-sm font-bold text-neutral-900">Month by month</h3>
              <div className="overflow-x-auto rounded-xl border border-neutral-200">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 text-left text-[11px] uppercase tracking-wide text-neutral-500"><tr><th className="px-sm py-xs">Month</th><th className="px-sm py-xs text-right">Due</th><th className="px-sm py-xs text-right">Received</th><th className="px-sm py-xs">Position</th><th className="px-sm py-xs" /></tr></thead>
                  <tbody className="divide-y divide-neutral-100">
                    {pos.months.length === 0 && <tr><td colSpan={5} className="px-sm py-sm text-neutral-500">No rent charged yet.</td></tr>}
                    {pos.months.map((m: any) => (
                      <tr key={m.chargeId} className="align-top">
                        <td className="px-sm py-xs">{monthName(m.month)}{m.note && <span className="block text-[11px] text-neutral-500">{m.note}</span>}</td>
                        <td className="px-sm py-xs text-right tabular-nums">{gbp(m.due)}</td>
                        <td className="px-sm py-xs text-right tabular-nums">{gbp(m.received)}</td>
                        <td className="px-sm py-xs">{m.outstanding > 0.005 ? <span className="font-semibold text-amber-800">{gbp(m.outstanding)} {m.received > 0 ? 'short' : 'unpaid'}{m.status === 'overdue' ? ' · overdue' : ''}</span> : m.over > 0.005 ? <span className="font-semibold text-blue-800">{gbp(m.over)} over</span> : <span className="text-green-800">Paid</span>}{m.remitted > 0 && <span className="block text-[11px] text-neutral-500">{gbp(m.remitted)} paid to landlord</span>}</td>
                        <td className="px-sm py-xs text-right"><span className="flex flex-wrap justify-end gap-xs">
                          {m.outstanding > 0.005 && <button type="button" className={small} onClick={() => { setForm({ kind: 'direct', chargeId: m.chargeId }); setF({ amount: m.outstanding, date: today(), takeFee: true }) }}>Paid landlord direct</button>}
                          {m.outstanding > 0.005 && <button type="button" className={small} onClick={() => { setForm({ kind: 'reduce', chargeId: m.chargeId }); setF({ newDue: m.received }) }}>Reduce / write off</button>}
                          {m.over > 0.005 && <button type="button" className={small} onClick={() => { setForm({ kind: 'refund', chargeId: m.chargeId }); setF({ amount: m.over }) }}>Refund overpayment</button>}
                        </span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* the inline form for the chosen fix */}
            {form && (() => {
              const m = pos.months.find((x: any) => x.chargeId === form.chargeId)
              const rec = pos.receipts.find((x: any) => x.key === form.key)
              return (
                <section className="rounded-xl border-2 border-neutral-900 p-md space-y-sm">
                  {form.kind === 'direct' && <>
                    <h3 className="text-sm font-bold">{monthName(m.month)} — the tenant paid the landlord directly</h3>
                    <p className="text-xs text-neutral-600">The month counts as settled outside CROS: the tenant isn’t chased, the landlord isn’t paid it again, and the client account isn’t touched.</p>
                    <div className="grid grid-cols-2 gap-sm">
                      <label className="text-xs font-semibold text-neutral-600">Amount they paid the landlord<input type="number" step="0.01" className={inp} value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></label>
                      <label className="text-xs font-semibold text-neutral-600">Date paid<input type="date" className={inp} value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></label>
                    </div>
                    <label className="flex items-center gap-xs text-sm"><input type="checkbox" checked={!!f.takeFee} onChange={e => setF({ ...f, takeFee: e.target.checked })} /> Charge our management fee on it (deducted on the landlord’s next statement)</label>
                    <label className="block text-xs font-semibold text-neutral-600">Note (how you know)<input className={inp} value={f.note ?? ''} onChange={e => setF({ ...f, note: e.target.value })} placeholder="e.g. landlord confirmed by email 14 Oct" /></label>
                    <div className="flex gap-sm"><button type="button" disabled={busy} className="rounded-lg bg-neutral-900 px-md py-xs text-sm font-bold text-white disabled:opacity-40" onClick={() => act({ action: 'direct', chargeId: form.chargeId, amount: Number(f.amount), date: f.date, note: f.note ?? '', takeFee: !!f.takeFee }, d => `Settled — ${gbp(d.settled)} paid to the landlord directly${d.fee ? `; our fee of ${gbp(d.fee)} is on their next statement` : ''}.`)}>Record it</button><button type="button" className="text-sm text-neutral-600" onClick={() => setForm(null)}>Cancel</button></div>
                  </>}
                  {form.kind === 'reduce' && <>
                    <h3 className="text-sm font-bold">{monthName(m.month)} — reduce what’s due (was {gbp(m.due)})</h3>
                    <p className="text-xs text-neutral-600">For an agreed reduction, or writing off what won’t be paid. The landlord’s statement shows the lower rent; the original stays on record.</p>
                    <div className="grid grid-cols-2 gap-sm">
                      <label className="text-xs font-semibold text-neutral-600">New amount due<input type="number" step="0.01" className={inp} value={f.newDue} onChange={e => setF({ ...f, newDue: e.target.value })} /></label>
                      <label className="text-xs font-semibold text-neutral-600">Why<input className={inp} value={f.reason ?? ''} onChange={e => setF({ ...f, reason: e.target.value })} placeholder="e.g. landlord agreed £50 off — no hot water 3 days" /></label>
                    </div>
                    <div className="flex gap-sm"><button type="button" disabled={busy} className="rounded-lg bg-neutral-900 px-md py-xs text-sm font-bold text-white disabled:opacity-40" onClick={() => act({ action: 'reduce', chargeId: form.chargeId, newDue: Number(f.newDue), reason: f.reason ?? '' }, d => `${monthName(m.month)} reduced from ${gbp(d.from)} to ${gbp(d.to)}.`)}>Reduce it</button><button type="button" className="text-sm text-neutral-600" onClick={() => setForm(null)}>Cancel</button></div>
                  </>}
                  {form.kind === 'refund' && <>
                    <h3 className="text-sm font-bold">{monthName(m.month)} — refund the overpayment</h3>
                    <p className="text-xs text-neutral-600">Only for money not yet paid over to the landlord. Left alone, an overpayment goes towards their next rent automatically.</p>
                    <div className="grid grid-cols-2 gap-sm">
                      <label className="text-xs font-semibold text-neutral-600">Amount refunded<input type="number" step="0.01" className={inp} value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></label>
                      <label className="text-xs font-semibold text-neutral-600">How it was refunded<input className={inp} value={f.reason ?? ''} onChange={e => setF({ ...f, reason: e.target.value })} placeholder="e.g. bank transfer to the tenant 14 Oct" /></label>
                    </div>
                    <div className="flex gap-sm"><button type="button" disabled={busy} className="rounded-lg bg-neutral-900 px-md py-xs text-sm font-bold text-white disabled:opacity-40" onClick={() => act({ action: 'refund', chargeId: form.chargeId, amount: Number(f.amount), reason: f.reason ?? '' }, d => `${gbp(d.refunded)} refund recorded.`)}>Record the refund</button><button type="button" className="text-sm text-neutral-600" onClick={() => setForm(null)}>Cancel</button></div>
                  </>}
                  {form.kind === 'reverse' && rec && <>
                    <h3 className="text-sm font-bold">Reverse the {gbp(rec.amount)} payment of {day(rec.date)}</h3>
                    <p className="text-xs text-neutral-600">It comes off {rec.parts.map((p: any) => `${monthName(p.month)} (${gbp(p.amount)})`).join(' and ')}.{rec.txnId ? ' The bank line goes back to Bank & Matching so it can be put against the right tenant or month.' : ''}</p>
                    <label className="block text-xs font-semibold text-neutral-600">Why<input className={inp} value={f.reason ?? ''} onChange={e => setF({ ...f, reason: e.target.value })} placeholder="e.g. matched to the wrong tenant" /></label>
                    <div className="flex gap-sm"><button type="button" disabled={busy} className="rounded-lg bg-red-700 px-md py-xs text-sm font-bold text-white disabled:opacity-40" onClick={() => act({ action: 'reverse', key: form.key, reason: f.reason ?? '' }, d => `${gbp(d.amount)} payment reversed.${d.backToMatching ? ' It’s back in Bank & Matching.' : ''}`)}>Reverse it</button><button type="button" className="text-sm text-neutral-600" onClick={() => setForm(null)}>Cancel</button></div>
                  </>}
                </section>
              )
            })()}

            {/* payments */}
            <section>
              <h3 className="mb-xs text-sm font-bold text-neutral-900">Payments</h3>
              {pos.receipts.length === 0 ? <p className="text-sm text-neutral-500">No payments recorded yet.</p> : (
                <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
                  {pos.receipts.map((r: any) => (
                    <li key={r.key} className="flex flex-wrap items-center justify-between gap-sm px-sm py-xs text-sm">
                      <span><b className="tabular-nums">{gbp(r.amount)}</b> · {day(r.date)} · {r.how === 'bank' ? 'bank' : r.how}<span className="block text-[11px] text-neutral-500">→ {r.parts.map((p: any) => `${monthName(p.month)} ${gbp(p.amount)}`).join(', ')}</span></span>
                      {r.reversed ? <span className="text-xs text-neutral-500">Reversed</span>
                        : r.paidOver ? <span className="text-xs text-neutral-500" title="Already paid over to the landlord — correct it on their next statement">Paid over · can’t reverse here</span>
                        : <button type="button" className={small} onClick={() => { setForm({ kind: 'reverse', key: r.key }); setF({}) }}>Reverse…</button>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* tell the tenant */}
            {data.message && (
              <section className="rounded-xl border border-neutral-200 p-md space-y-sm">
                <h3 className="text-sm font-bold text-neutral-900">📨 Tell the tenant what’s due</h3>
                <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-neutral-50 p-sm text-xs text-neutral-800">{data.message.sms}</pre>
                <textarea className={inp} rows={2} placeholder="Add a line of your own (optional)" value={tell.extra} onChange={e => setTell({ ...tell, extra: e.target.value })} />
                <div className="flex flex-wrap items-center gap-md text-sm">
                  <label className="flex items-center gap-xs"><input type="checkbox" disabled={!t.email} checked={tell.email} onChange={e => setTell({ ...tell, email: e.target.checked })} /> Email {t.email ? '' : '(none on file)'}</label>
                  <label className="flex items-center gap-xs"><input type="checkbox" disabled={!t.phone} checked={tell.text} onChange={e => setTell({ ...tell, text: e.target.checked })} /> Text {t.phone ? '' : '(no mobile)'}</label>
                  <button type="button" disabled={busy || !data.commsLive || (!tell.email && !tell.text)} className="ml-auto rounded-lg bg-neutral-900 px-md py-xs text-sm font-bold text-white disabled:opacity-40"
                    onClick={() => confirm(`Send this to ${t.tenant}?`) && act({ action: 'tell', ...tell }, d => `Sent by ${d.sent.join(' and ')} — ${gbp(d.owed)} still owed.`)}>Send</button>
                </div>
                {!data.commsLive && <p className="text-xs text-amber-800">Messages you choose to send are paused in Settings, so this can’t be sent right now.</p>}
              </section>
            )}

            {/* payment plan */}
            <section className="rounded-xl border border-neutral-200 p-md space-y-sm">
              <h3 className="text-sm font-bold text-neutral-900">🗓 Payment plan</h3>
              {plan ? <>
                <p className="text-sm">Agreed {day(plan.created_at)}: <b>{gbp(plan.arrears)}</b> owed, paid off at <b>{gbp(plan.instalment)} a month</b> on top of the rent from {day(plan.starts_on)}.{plan.note ? ` ${plan.note}` : ''}</p>
                <div className="flex flex-wrap gap-xs">
                  {(['completed', 'broken', 'cancelled'] as const).map(o => <button key={o} type="button" className={small} disabled={busy}
                    onClick={() => { const note = prompt(o === 'broken' ? 'What happened? (e.g. missed the November instalment)' : 'Any note? (optional)') ?? ''; act({ action: 'end_plan', planId: plan.id, outcome: o, note }, () => `Plan marked ${o}.`) }}>{o === 'completed' ? 'Cleared — plan done' : o === 'broken' ? 'Not kept to' : 'Cancel plan'}</button>)}
                </div>
              </> : pos.owed > 0.005 ? <>
                <p className="text-xs text-neutral-600">Agree how the {gbp(pos.owed)} will be paid off. It shows in Arrears, and any message to the tenant includes it.</p>
                <div className="grid grid-cols-3 gap-sm">
                  <label className="text-xs font-semibold text-neutral-600">Extra each month (£)<input type="number" step="0.01" className={inp} value={f.instalment ?? ''} onChange={e => setF({ ...f, instalment: e.target.value })} /></label>
                  <label className="text-xs font-semibold text-neutral-600">Starting<input type="date" className={inp} value={f.startsOn ?? ''} onChange={e => setF({ ...f, startsOn: e.target.value })} /></label>
                  <label className="text-xs font-semibold text-neutral-600">Note<input className={inp} value={f.planNote ?? ''} onChange={e => setF({ ...f, planNote: e.target.value })} placeholder="e.g. agreed by phone" /></label>
                </div>
                <button type="button" disabled={busy || !(Number(f.instalment) > 0) || !f.startsOn} className="rounded-lg bg-neutral-900 px-md py-xs text-sm font-bold text-white disabled:opacity-40"
                  onClick={() => act({ action: 'plan', instalment: Number(f.instalment), startsOn: f.startsOn, note: f.planNote ?? '' }, d => `Plan agreed — about ${d.months} month${d.months === 1 ? '' : 's'} to clear.`)}>Agree the plan</button>
              </> : <p className="text-sm text-neutral-500">Nothing owed, so no plan needed.</p>}
            </section>

            {pos.told.length > 0 && <p className="text-xs text-neutral-500">Told about arrears: {pos.told.map((x: any) => day(x.at)).join(', ')}</p>}
          </>}
        </div>
      </div>
    </div>
  )
}
