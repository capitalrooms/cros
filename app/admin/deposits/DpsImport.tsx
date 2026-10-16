'use client'

// Bring in what the DPS already holds: choose the DPS deposit list (CSV) or paste it off the DPS website; CROS matches
// each deposit to a tenancy for you to tick, then records the reference and date (lib/deposits/dpsImport).
import { useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

interface Match { line: { ref: string; tenant: string; address: string; postcode: string; amount: number | null; protectedOn: string | null }; tenancyId: string | null; tenancyLabel: string | null; score: number; why: string[]; already: boolean }
interface Choice { id: string; label: string }

const input = 'w-full rounded-lg border border-neutral-300 bg-white px-sm py-xs text-sm text-neutral-900'

export default function DpsImport({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [matches, setMatches] = useState<Match[] | null>(null)
  const [choices, setChoices] = useState<Choice[]>([])
  const [pick, setPick] = useState<Record<number, string>>({})
  const [tick, setTick] = useState<Record<number, boolean>>({})
  const [done, setDone] = useState('')

  async function read() {
    setBusy(true); setError(''); setDone('')
    const r = await adminFetch('/api/admin/deposits/dps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'read', text }) })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setError(d.error || 'Could not read it'); return }
    setMatches(d.matches); setChoices(d.choices ?? [])
    const p: Record<number, string> = {}, t: Record<number, boolean> = {}
    ;(d.matches as Match[]).forEach((m, i) => { if (m.tenancyId) p[i] = m.tenancyId; t[i] = !!m.tenancyId && !m.already })
    setPick(p); setTick(t)
  }

  async function confirm() {
    const items = (matches ?? []).map((m, i) => ({ m, i })).filter(({ i }) => tick[i] && pick[i]).map(({ m, i }) => ({ tenancyId: pick[i], ref: m.line.ref, protectedOn: m.line.protectedOn }))
    if (!items.length) return
    setBusy(true); setError('')
    const r = await adminFetch('/api/admin/deposits/dps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'confirm', items }) })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setError(d.error || 'Could not record them'); return }
    setDone(`Recorded ${d.done} deposit${d.done === 1 ? '' : 's'} as protected${d.failed?.length ? ` — ${d.failed.length} failed: ${d.failed.join('; ')}` : ''}.`)
    setMatches(null); setText(''); onDone()
  }

  async function file(f: File | undefined) { if (f) setText(await f.text()) }
  const ticked = Object.entries(tick).filter(([i, v]) => v && pick[Number(i)]).length

  return (
    <section className="rounded-2xl bg-white p-lg">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div>
          <h2 className="font-bold text-neutral-900">Bring in from the DPS</h2>
          <p className="text-sm text-neutral-600">Download your deposit list from the DPS (or copy it off their website) and CROS records each protection against its tenancy.</p>
        </div>
        {!open && <button onClick={() => setOpen(true)} className="rounded-lg bg-neutral-900 px-md py-xs text-sm font-bold text-white">Bring in from the DPS</button>}
      </div>
      {done && <p className="mt-sm rounded-lg bg-emerald-50 px-md py-sm text-sm text-emerald-800">{done}</p>}
      {open && (
        <div className="mt-md space-y-sm">
          <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={e => file(e.target.files?.[0])} className="text-sm" />
          <textarea className={`${input} h-28 font-mono text-xs`} placeholder="…or paste the DPS list here" value={text} onChange={e => setText(e.target.value)} />
          <div className="flex gap-sm">
            <button disabled={busy || text.trim().length < 10} onClick={read} className="rounded-lg bg-neutral-900 px-md py-xs text-sm font-bold text-white disabled:opacity-40">{busy && !matches ? 'Reading…' : 'Read it'}</button>
            <button onClick={() => { setOpen(false); setMatches(null); setText('') }} className="text-sm font-semibold text-neutral-600 underline">Close</button>
          </div>
          {error && <p className="rounded-lg bg-red-50 px-md py-sm text-sm text-red-700">{error}</p>}
          {matches && (
            <div className="space-y-sm">
              <p className="text-sm text-neutral-700">{matches.length} deposit{matches.length === 1 ? '' : 's'} found · {matches.filter(m => m.tenancyId).length} matched. Check each one — untick anything that isn’t right, or choose the tenancy yourself.</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead><tr className="border-b border-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-500">
                    <th className="px-sm py-xs"></th><th className="px-sm py-xs">DPS</th><th className="px-sm py-xs">Tenancy in CROS</th>
                  </tr></thead>
                  <tbody className="divide-y divide-neutral-100">
                    {matches.map((m, i) => (
                      <tr key={i} className="align-top">
                        <td className="px-sm py-xs"><input type="checkbox" checked={!!tick[i]} disabled={!pick[i]} onChange={e => setTick({ ...tick, [i]: e.target.checked })} /></td>
                        <td className="px-sm py-xs text-xs"><strong className="text-neutral-900">{m.line.ref}</strong> · {m.line.amount != null ? `£${m.line.amount.toFixed(2)}` : '—'}<br />{m.line.tenant}<br /><span className="text-neutral-500">{m.line.address}{m.line.postcode ? ` · ${m.line.postcode}` : ''}{m.line.protectedOn ? ` · protected ${m.line.protectedOn}` : ''}</span></td>
                        <td className="px-sm py-xs text-xs">
                          {m.already ? <span className="text-emerald-700">Already recorded — {m.tenancyLabel}</span> : (
                            <>
                              <select className={input} value={pick[i] ?? ''} onChange={e => { setPick({ ...pick, [i]: e.target.value }); setTick({ ...tick, [i]: !!e.target.value }) }}>
                                <option value="">— not matched —</option>
                                {m.tenancyId && m.tenancyLabel && !choices.some(c => c.id === m.tenancyId) && <option value={m.tenancyId}>{m.tenancyLabel}</option>}
                                {choices.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                              </select>
                              {m.tenancyId ? <span className="text-neutral-500">matched on {m.why.join(', ')}{!m.why.includes('amount') && !m.why.includes('already recorded') && <strong className="ml-xs text-amber-700">· amount differs — check it</strong>}</span> : m.tenancyLabel ? <span className="text-neutral-500">closest: {m.tenancyLabel}</span> : null}
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button disabled={busy || !ticked} onClick={confirm} className="rounded-lg bg-neutral-900 px-md py-xs text-sm font-bold text-white disabled:opacity-40">{busy ? 'Recording…' : `Record ${ticked} as protected`}</button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
