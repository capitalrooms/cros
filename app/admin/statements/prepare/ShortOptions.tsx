'use client'
// Short months on the statement screen (Harry, 22 Nov 2026): the office stays here and picks, case by case, what the
// tenant is asked — option A (pay the difference within 24 hours, so the statement can go in full) or option B (settle
// next month). Each send is recorded on the rent account. Nothing is sent without the click.
import { useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'
import type { Unpaid } from '@/lib/statements/draft'
import TenancyPayments from '@/components/TenancyPayments'

const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function ShortOptions({ unpaid }: { unpaid: Unpaid[] }) {
  const [text, setText] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<Record<string, string>>({})
  const [err, setErr] = useState<Record<string, string>>({})
  const [acct, setAcct] = useState<Record<string, any>>({})
  // every payment on each short tenancy is loaded as soon as the panel opens, so nothing needs a separate click to check
  async function loadPayments(u: Unpaid) {
    const r = await adminFetch(`/api/admin/rent-resolve?tenancy=${u.tenancyId}`).then(x => x.json()).catch(() => null)
    setAcct(a => ({ ...a, [u.chargeId]: r?.account ?? { lines: [], charged: 0, paid: 0, balance: 0 } }))
  }
  useEffect(() => { rows.forEach(u => loadPayments(u)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])
  function hidePayments(u: Unpaid) { setAcct(a => ({ ...a, [u.chargeId]: null })) }
  const rows = unpaid.filter(u => u.tenancyId)
  if (!rows.length) return null

  async function send(u: Unpaid, option: 'A' | 'B') {
    const key = `${u.chargeId}:${option}`
    const short = Math.round((u.due - u.received) * 100) / 100
    const what = option === 'A' ? `ask ${u.tenant} to pay ${gbp(short)} within 24 hours` : `tell ${u.tenant} to settle the ${gbp(short)} next month`
    if (!confirm(`Send this to ${u.tenant}? It will ${what}.`)) return
    setBusy(key); setErr(e => ({ ...e, [u.chargeId]: '' }))
    try {
      const r = await adminFetch('/api/admin/rent-resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenancy: u.tenancyId, action: 'short_option', chargeMonth: u.monthIso, option, email: true, text: !!text[u.chargeId] }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error ?? 'Not sent')
      setDone(d => ({ ...d, [u.chargeId]: `Option ${option} sent by ${j.sent.join(' and ')}.` }))
    } catch (e) {
      setErr(x => ({ ...x, [u.chargeId]: e instanceof Error ? e.message : 'Not sent' }))
    } finally { setBusy(null) }
  }

  return (
    <div className="mb-md space-y-sm rounded-xl border border-amber-200 bg-amber-50 p-md">
      <p className="text-sm font-semibold text-amber-900">Short this month — choose what the tenant is asked</p>
      {rows.map(u => {
        const short = Math.round((u.due - u.received) * 100) / 100
        return (
          <div key={u.chargeId} className="space-y-xs text-sm text-amber-900">
            <p><b>{u.room}</b> · {u.tenant}: {gbp(u.received)} of {gbp(u.due)} paid, {gbp(short)} short.</p>
            <div className="flex flex-wrap items-center gap-sm">
              <button type="button" disabled={!!busy} onClick={() => send(u, 'A')} className="rounded-lg bg-neutral-900 px-md py-xs text-xs font-bold text-white disabled:opacity-40">
                {busy === `${u.chargeId}:A` ? 'Sending…' : 'A · Pay within 24 hours'}
              </button>
              <button type="button" disabled={!!busy} onClick={() => send(u, 'B')} className="rounded-lg border border-neutral-400 bg-white px-md py-xs text-xs font-bold text-neutral-900 disabled:opacity-40">
                {busy === `${u.chargeId}:B` ? 'Sending…' : 'B · Settle next month'}
              </button>
              <button type="button" onClick={() => acct[u.chargeId] ? hidePayments(u) : loadPayments(u)} className="rounded-lg border border-neutral-300 bg-white px-md py-xs text-xs font-semibold text-neutral-800">{acct[u.chargeId] ? 'Hide payments' : 'See every payment'}</button>
              <label className="flex items-center gap-xs text-xs"><input type="checkbox" checked={!!text[u.chargeId]} onChange={e => setText(t => ({ ...t, [u.chargeId]: e.target.checked }))} /> also text</label>
            </div>
            {acct[u.chargeId] && <TenancyPayments account={acct[u.chargeId]} />}
            {done[u.chargeId] && <p className="text-xs font-semibold text-green-800">{done[u.chargeId]}</p>}
            {err[u.chargeId] && <p className="text-xs text-red-700">{err[u.chargeId]}</p>}
          </div>
        )
      })}
    </div>
  )
}
