'use client'
// Statements in (13 Nov 2026) — everything that arrives at statements@ (or is uploaded) waits here until someone checks
// it against its PDF, property by property, month by month: Agree, Remove (a wrong upload), or move it to the right
// property. Two statements for the same property and month are flagged. /api/admin/statements/review, migration 284.
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import PageHero from '@/components/PageHero'
import { financeTabs } from '@/lib/financeTabs'
import { adminFetch } from '@/lib/adminFetch'
import { createClient } from '@/lib/supabase'

type Row = { id: string; propertyId: string; property: string; landlord: string; reference: string; date: string; receivedAt: string; via: string | null; gross: number; fees: number; costs: number; net: number; status: string; reviewedAt: string | null; reviewedBy: string | null; hasPdf: boolean; duplicate: boolean }
type Detail = {
  statement: { id: string; reference: string; date: string; periodStart: string | null; periodEnd: string | null; property: { id: string; name: string }; landlord: { id: string; name: string }; gross: number; fees: number; costs: number; net: number; status: string; reviewedAt: string | null; reviewedBy: string | null; note: string | null; receivedAt: string; via: string | null; pdf: string | null; locked: boolean }
  rooms: { room_number: string | null; tenant_name: string | null; rent_income: number; management_fee: number; letting_fee: number | null; other_deductions: number | null; net_to_landlord: number }[]
  lines: { description: string; amount: number; category: string; category_type: string; room_label: string | null }[]
  twin: { id: string; statement_reference: string; statement_date: string; gross_rent: number; net_to_landlord: number; review_status: string; created_at: string } | null
}

const gbp = (n: number) => `£${Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const day = (s: string | null | undefined) => s ? new Date(s.length > 10 ? s : `${s}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
const monthOf = (s: string) => new Date(`${s.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

export default function StatementsReview() {
  const [status, setStatus] = useState<'to_review' | 'agreed' | 'all'>('to_review')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [toReview, setToReview] = useState(0)
  const [setup, setSetup] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [d, setD] = useState<Detail | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [removing, setRemoving] = useState(false)
  const [reason, setReason] = useState('')
  const [moving, setMoving] = useState(false)
  const [props, setProps] = useState<{ id: string; name: string }[]>([])
  const [moveTo, setMoveTo] = useState('')
  const [removed, setRemoved] = useState<{ auditId: string; reference: string; property: string; removedAt: string; removedBy: string; reason: string; gross: number; lines: number }[]>([])
  const loadRemoved = useCallback(() => { adminFetch('/api/admin/statements/review?removed=1').then(r => r.json()).then(j => setRemoved(j.removed ?? [])).catch(() => null) }, [])
  useEffect(() => { loadRemoved() }, [loadRemoved])

  const load = useCallback(async () => {
    const r = await adminFetch(`/api/admin/statements/review?status=${status}`)
    const j = await r.json().catch(() => ({}))
    if (j.setupNeeded) { setSetup(true); setRows([]); return }
    setRows(j.statements ?? []); setToReview(j.toReview ?? 0)
  }, [status])
  useEffect(() => { load() }, [load])

  const open = useCallback(async (id: string) => {
    setOpenId(id); setD(null); setErr(''); setMsg(''); setNote(''); setRemoving(false); setReason(''); setMoving(false)
    const r = await adminFetch(`/api/admin/statements/review?id=${id}`)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(j.error || 'Couldn’t open it'); return }
    setD(j)
    window.scrollTo({ top: 0 })
  }, [])

  const queue = useMemo(() => (rows ?? []).filter(r => r.status === 'to_review'), [rows])
  const next = () => { const i = queue.findIndex(r => r.id === openId); const n = queue[i + 1] ?? queue.find(r => r.id !== openId); if (n) open(n.id); else { setOpenId(null); setD(null) } }

  async function act(body: any, done: string) {
    setBusy(true); setErr('')
    const r = await adminFetch('/api/admin/statements/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setErr(j.error || 'That didn’t work'); return false }
    setMsg(done); await load(); return true
  }

  const groups = useMemo(() => {
    const m = new Map<string, Row[]>()
    for (const r of rows ?? []) { const k = r.landlord || 'No landlord'; m.set(k, [...(m.get(k) ?? []), r]) }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [rows])

  const s = d?.statement
  const rentLines = (d?.lines ?? []).filter(l => l.category_type === 'income' || l.category === 'rent_income')
  const feeLines = (d?.lines ?? []).filter(l => /management|letting/i.test(l.category) && !(l.category_type === 'income'))
  const costLines = (d?.lines ?? []).filter(l => !rentLines.includes(l) && !feeLines.includes(l))

  return (
    <div className="min-h-screen fin pb-3xl">
      <AppBar left={<BackButton href="/admin/statements" label="Statements" />} />
      <PageHero look="olive" eyebrow="Monthly cycle" title="Statements in"
        subtitle="Everything that came in to statements@ or was uploaded — check each one against its PDF and agree it, property by property, month by month."
        tabs={financeTabs('statements')} />
      <main className="mx-auto max-w-6xl px-lg py-lg">
        {setup && <p className="mb-md rounded-xl border-2 border-neutral-900 bg-white p-md text-sm">Run migration 284 in Supabase to switch this on.</p>}

        {!openId && (<>
          <div className="mb-md flex flex-wrap items-center gap-sm">
            {([['to_review', `To review${toReview ? ` (${toReview})` : ''}`], ['agreed', 'Agreed'], ['all', 'All']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setStatus(k)} className={`rounded-full px-md py-xs text-sm font-semibold ${status === k ? 'bg-neutral-900 text-white' : 'border border-neutral-300 bg-white text-neutral-700'}`}>{l}</button>
            ))}
            {status === 'to_review' && queue.length > 0 && <button type="button" onClick={() => open(queue[0].id)} className="ml-auto rounded-lg bg-neutral-900 px-lg py-sm text-sm font-semibold text-white">Start checking →</button>}
          </div>
          {removed.length > 0 && (
            <details className="mb-md rounded-xl bg-white ring-1 ring-neutral-200">
              <summary className="cursor-pointer px-md py-sm text-sm font-semibold text-neutral-800">Removed — {removed.length} can be put back</summary>
              <ul className="divide-y divide-neutral-100 text-sm">
                {removed.map(r => (
                  <li key={r.auditId} className="flex flex-wrap items-center justify-between gap-sm px-md py-sm">
                    <span><b>{r.property}</b> — {r.reference} · {gbp(r.gross)} rent, {r.lines} lines<span className="block text-xs text-neutral-500">Removed {day(r.removedAt)} by {r.removedBy}{r.reason ? ` — “${r.reason}”` : ''}</span></span>
                    <button type="button" disabled={busy} onClick={async () => { if (!window.confirm(`Put ${r.reference} back on ${r.property}, exactly as it was?`)) return; if (await act({ action: 'restore', auditId: r.auditId }, `${r.reference} is back — it’s in To review.`)) loadRemoved() }} className="rounded-lg border border-neutral-300 px-md py-xs text-xs font-semibold">Put it back</button>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {msg && !openId && <p className="mb-md rounded-lg bg-emerald-50 px-md py-sm text-sm text-emerald-800">{msg}</p>}
          {err && !openId && <p className="mb-md rounded-lg bg-red-50 px-md py-sm text-sm text-red-800">{err}</p>}
          {rows && !rows.length && !setup && <p className="rounded-xl bg-white p-lg text-sm text-neutral-600 ring-1 ring-neutral-200">{status === 'to_review' ? 'Nothing waiting — every statement that has come in has been checked.' : 'None yet.'}</p>}
          <div className="space-y-md">
            {groups.map(([who, list]) => (
              <section key={who} className="overflow-hidden rounded-xl bg-white ring-1 ring-neutral-200">
                <p className="border-b border-neutral-100 px-md py-sm text-sm font-bold text-neutral-900">{who} <span className="font-normal text-neutral-500">· {list.length}</span></p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-[11px] uppercase tracking-wider text-neutral-500"><th className="px-md py-xs">Property</th><th className="px-sm py-xs">Statement</th><th className="px-sm py-xs text-right">Rent in</th><th className="px-sm py-xs text-right">Fees</th><th className="px-sm py-xs text-right">Costs</th><th className="px-sm py-xs text-right">To landlord</th><th className="px-md py-xs" /></tr></thead>
                    <tbody>
                      {list.map(r => (
                        <tr key={r.id} onClick={() => open(r.id)} className="cursor-pointer border-t border-neutral-100 hover:bg-neutral-50">
                          <td className="px-md py-sm font-semibold text-neutral-900">{r.property}{r.duplicate && <span className="ml-xs rounded bg-amber-100 px-xs text-[11px] font-semibold text-amber-900">same month twice</span>}</td>
                          <td className="px-sm py-sm text-neutral-700">{r.reference}<span className="block text-xs text-neutral-500">{monthOf(r.date)} · in {day(r.receivedAt)}{r.hasPdf ? '' : ' · no PDF'}</span></td>
                          <td className="px-sm py-sm text-right tabular-nums">{gbp(r.gross)}</td>
                          <td className="px-sm py-sm text-right tabular-nums">{gbp(r.fees)}</td>
                          <td className="px-sm py-sm text-right tabular-nums">{gbp(r.costs)}</td>
                          <td className="px-sm py-sm text-right font-semibold tabular-nums">{gbp(r.net)}</td>
                          <td className="px-md py-sm text-right text-xs">{r.status === 'agreed' ? <span className="font-semibold text-emerald-700">✓ Agreed</span> : <span className="font-semibold text-neutral-900">Check →</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        </>)}

        {openId && (
          <div>
            <div className="mb-md flex flex-wrap items-center gap-sm">
              <button type="button" onClick={() => { setOpenId(null); setD(null) }} className="rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm font-semibold">← All statements</button>
              {queue.length > 0 && <span className="text-sm text-neutral-600">{queue.length} to review</span>}
            </div>
            {err && <p className="mb-md rounded-lg bg-red-50 px-md py-sm text-sm text-red-800">{err}</p>}
            {msg && <p className="mb-md rounded-lg bg-emerald-50 px-md py-sm text-sm text-emerald-800">{msg}</p>}
            {!d && !err && <p className="text-sm text-neutral-500">Opening…</p>}
            {s && d && (
              <div className="grid items-start gap-lg lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
                {/* the PDF as received */}
                <section className="overflow-hidden rounded-xl bg-white ring-1 ring-neutral-200 lg:sticky lg:top-md">
                  {s.pdf ? <iframe title="The statement PDF" src={s.pdf} className="h-[78vh] w-full" />
                    : <div className="p-lg text-sm text-neutral-600"><p className="font-semibold text-neutral-900">No PDF kept for this one</p><p className="mt-xs">It came in before CROS kept statement PDFs. Forward the email to statements@ again and the PDF is attached here — nothing is added twice.</p></div>}
                </section>

                {/* what CROS read from it */}
                <section className="space-y-md">
                  <div className="rounded-xl bg-white p-md ring-1 ring-neutral-200">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">{s.landlord.name}</p>
                    <h2 className="text-xl font-bold text-neutral-900">{s.property.name}</h2>
                    <p className="text-sm text-neutral-600">{s.reference} · {monthOf(s.date)} · came in {day(s.receivedAt)}{s.via ? ` by ${s.via === 'import' ? 'import' : s.via}` : ''}</p>
                    <dl className="mt-sm grid grid-cols-4 gap-xs text-center">
                      {([['Rent in', s.gross], ['Fees', s.fees], ['Costs', s.costs], ['To landlord', s.net]] as const).map(([k, v]) => (
                        <div key={k} className="rounded-lg bg-neutral-50 px-xs py-sm"><dt className="text-[11px] uppercase tracking-wider text-neutral-500">{k}</dt><dd className="text-sm font-bold tabular-nums text-neutral-900">{gbp(v)}</dd></div>
                      ))}
                    </dl>
                    <Link href={`/admin/properties/${s.property.id}`} className="mt-sm inline-block text-xs font-semibold underline">Open the property</Link>
                  </div>

                  {d.twin && (
                    <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-md text-sm text-amber-950">
                      <p className="font-bold">The same property and month is already on file</p>
                      <p className="mt-xs">{d.twin.statement_reference} — {gbp(Number(d.twin.gross_rent))} rent in, {gbp(Number(d.twin.net_to_landlord))} to the landlord, came in {day(d.twin.created_at)}. If one of them is a wrong upload, remove it; if both are right (two statements that month), agree both.</p>
                      <button type="button" onClick={() => open(d.twin!.id)} className="mt-sm rounded-lg border border-amber-400 bg-white px-md py-xs text-xs font-semibold">Open {d.twin.statement_reference.split(' ·')[0]} to compare</button>
                    </div>
                  )}

                  {d.rooms.length > 0 && (
                    <div className="overflow-hidden rounded-xl bg-white ring-1 ring-neutral-200">
                      <p className="border-b border-neutral-100 px-md py-sm text-sm font-bold">Room by room</p>
                      <table className="w-full text-sm"><tbody>
                        {d.rooms.map((r, i) => (
                          <tr key={i} className="border-t border-neutral-100 first:border-0"><td className="px-md py-xs">{r.room_number ? `Room ${String(r.room_number).replace(/^room\s*/i, '')}` : 'Room'}<span className="block text-xs text-neutral-500">{r.tenant_name || '—'}</span></td><td className="px-sm py-xs text-right tabular-nums">{gbp(r.rent_income)}<span className="block text-xs text-neutral-500">fee {gbp(Number(r.management_fee) + Number(r.letting_fee ?? 0))}</span></td></tr>
                        ))}
                      </tbody></table>
                    </div>
                  )}

                  {([['Rent', rentLines], ['Fees', feeLines], ['Costs and repairs', costLines]] as const).map(([title, list]) => list.length > 0 && (
                    <div key={title} className="overflow-hidden rounded-xl bg-white ring-1 ring-neutral-200">
                      <p className="border-b border-neutral-100 px-md py-sm text-sm font-bold">{title} <span className="font-normal text-neutral-500">· {list.length} line{list.length === 1 ? '' : 's'}</span></p>
                      <ul className="divide-y divide-neutral-100 text-sm">
                        {list.map((l, i) => <li key={i} className="flex justify-between gap-md px-md py-xs"><span className="min-w-0 text-neutral-800">{l.description}</span><span className="shrink-0 tabular-nums">{gbp(l.amount)}</span></li>)}
                      </ul>
                    </div>
                  ))}

                  <div className="rounded-xl bg-white p-md ring-1 ring-neutral-200">
                    {s.status === 'agreed' ? (
                      <div className="flex flex-wrap items-center justify-between gap-sm">
                        <p className="text-sm text-emerald-800">✓ Agreed {day(s.reviewedAt)}{s.reviewedBy ? ` by ${s.reviewedBy}` : ''}{s.note ? ` — “${s.note}”` : ''}</p>
                        <button type="button" disabled={busy} onClick={async () => { if (await act({ id: s.id, action: 'unagree' }, 'Back in To review.')) open(s.id) }} className="text-xs font-semibold underline">Undo</button>
                      </div>
                    ) : (<>
                      <p className="text-sm font-semibold text-neutral-900">Does this match the PDF for {s.property.name} in {monthOf(s.date)}?</p>
                      <input value={note} onChange={e => setNote(e.target.value)} placeholder="A note, if anything (optional)" className="mt-sm w-full rounded-lg border border-neutral-300 px-md py-sm text-sm" />
                      <div className="mt-sm flex flex-wrap gap-sm">
                        <button type="button" disabled={busy} onClick={async () => { if (await act({ id: s.id, action: 'agree', note }, `Agreed: ${s.property.name}, ${monthOf(s.date)}.`)) next() }} className="rounded-lg bg-emerald-700 px-lg py-sm text-sm font-bold text-white disabled:opacity-50">Agree — it matches</button>
                        <button type="button" onClick={() => next()} className="rounded-lg border border-neutral-300 px-md py-sm text-sm font-semibold">Skip for now</button>
                      </div>
                    </>)}
                    {!s.locked && (
                      <div className="mt-md flex flex-wrap gap-md border-t border-neutral-100 pt-sm text-xs">
                        <button type="button" onClick={() => { setRemoving(!removing); setMoving(false) }} className="font-semibold text-red-700 underline">Remove — wrong upload</button>
                        <button type="button" onClick={async () => { setMoving(!moving); setRemoving(false); if (!props.length) { const { data } = await createClient().from('properties').select('id, name').order('name'); setProps(((data ?? []) as any[]).map(p => ({ id: p.id, name: String(p.name ?? '').split(/\n|,/)[0] }))) } }} className="font-semibold underline">Filed under the wrong property</button>
                      </div>
                    )}
                    {s.locked && <p className="mt-sm text-xs text-neutral-500">Approved, sent or paid — it can’t be removed or moved from here.</p>}
                    {removing && (
                      <div className="mt-sm rounded-lg bg-red-50 p-sm">
                        <p className="text-xs text-red-900">Removes {s.reference} and all its lines from {s.property.name}. A full copy is kept in the audit log.</p>
                        <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Why — e.g. uploaded twice, wrong statement" className="mt-xs w-full rounded-lg border border-red-200 bg-white px-md py-xs text-sm" />
                        <button type="button" disabled={busy || reason.trim().length < 3} onClick={async () => { if (!window.confirm(`Remove ${s.reference} from ${s.property.name}? This can’t be undone here (a copy stays in the audit log).`)) return; if (await act({ id: s.id, action: 'remove', reason }, `Removed ${s.reference}. If that was the wrong one, it can be put back under “Removed”.`)) { setOpenId(null); setD(null); loadRemoved() } }} className="mt-xs rounded-lg bg-red-700 px-md py-xs text-sm font-bold text-white disabled:opacity-40">Remove it</button>
                      </div>
                    )}
                    {moving && (
                      <div className="mt-sm rounded-lg bg-neutral-50 p-sm">
                        <select value={moveTo} onChange={e => setMoveTo(e.target.value)} className="w-full rounded-lg border border-neutral-300 bg-white px-md py-xs text-sm">
                          <option value="">Choose the right property…</option>
                          {props.filter(p => p.id !== s.property.id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <button type="button" disabled={busy || !moveTo} onClick={async () => { if (await act({ id: s.id, action: 'move', propertyId: moveTo }, 'Moved.')) open(s.id) }} className="mt-xs rounded-lg bg-neutral-900 px-md py-xs text-sm font-bold text-white disabled:opacity-40">Move it there</button>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
