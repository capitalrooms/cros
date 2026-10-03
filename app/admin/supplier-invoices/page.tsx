'use client'

// Contractor & cleaner invoices made in CROS, waiting for approval. Approving a contractor's invoice adds it to that
// property's expenses (with the invoice attached); for a cleaner's, tick the cleans the landlord pays for — the rest
// are ours. Nothing reaches a landlord's statement until approved here. Data: /api/admin/supplier-invoices.

import { useCallback, useEffect, useState } from 'react'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import { adminFetch } from '@/lib/adminFetch'

type Tab = 'open' | 'all' | 'settings'
const card = 'rounded-2xl border border-neutral-200 bg-white'
const btn = 'rounded-lg border border-neutral-300 px-md py-xs text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-40'
const btnDark = 'rounded-lg bg-neutral-900 px-md py-xs text-sm font-bold text-white hover:bg-neutral-700 disabled:opacity-40'
const gbp = (n: number) => `£${Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const STATUS: Record<string, string> = { sent: 'To approve', approved: 'Approved', paid: 'Paid', void: 'Void' }

export default function SupplierInvoicesPage() {
  const [tab, setTab] = useState<Tab>('open')
  const [data, setData] = useState<any>(null)
  const [err, setErr] = useState('')
  const load = useCallback(async () => {
    const r = await adminFetch('/api/admin/supplier-invoices')
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(d.error ?? 'Could not load'); return }
    setData(d)
  }, [])
  useEffect(() => { load() }, [load])
  async function act(body: Record<string, unknown>) {
    const r = await adminFetch('/api/admin/supplier-invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { alert(d.error ?? 'Could not do that'); return false }
    await load(); return true
  }
  const invs: any[] = data?.invoices ?? []
  const open = invs.filter(i => i.status === 'sent')
  const shown = tab === 'open' ? open : invs
  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin/finance" />} title="Contractor & cleaner invoices" />
      <PageHero
        eyebrow="Finance"
        title="Contractor & cleaner invoices"
        subtitle="Invoices made in CROS by your contractors and cleaners. Approve to add them to the property’s expenses — nothing reaches a landlord until you do."
        stats={[{ label: 'To approve', value: open.length, tone: open.length ? 'warn' : undefined }, { label: 'To approve (£)', value: gbp(open.reduce((t, i) => t + Number(i.total), 0)) }, { label: 'Approved, not paid', value: invs.filter(i => i.status === 'approved').length }]}
        tabs={([['open', `To approve · ${open.length}`], ['all', 'All'], ['settings', 'Who can invoice']] as [Tab, string][]).map(([k, l]) => ({ key: k, label: l, active: tab === k, onClick: () => setTab(k) }))}
      />
      <div className="mx-auto max-w-6xl px-lg py-xl space-y-md">
        {err && <p className="rounded-xl border border-red-200 bg-red-50 px-lg py-sm text-sm text-red-800">{err}</p>}
        {data?.setupNeeded && <p className="rounded-xl border border-amber-200 bg-amber-50 px-lg py-sm text-sm text-amber-900">Run migration 205 in Supabase to switch invoicing on.</p>}
        {!data && !err && <p className="text-sm text-neutral-500">Loading…</p>}
        {data && tab !== 'settings' && (shown.length ? shown.map(i => <Invoice key={i.id} i={i} act={act} />) : <p className={`${card} p-lg text-sm text-neutral-500`}>{tab === 'open' ? 'Nothing waiting for approval.' : 'No invoices yet.'}</p>)}
        {data && tab === 'settings' && (
          <section className={`${card} p-lg space-y-md`}>
            <label className="flex items-center gap-sm text-sm font-semibold"><input type="checkbox" checked={data.enabled} onChange={e => act({ action: 'setting', on: e.target.checked })} /> Contractors and cleaners can make invoices in CROS</label>
            <p className="text-xs text-neutral-500">Contractors can invoice other clients only while every one of our jobs assigned to them has a booked date.</p>
            <ul className="divide-y divide-neutral-100">
              {(data.people ?? []).map((p: any) => (
                <li key={p.id} className="flex items-center justify-between py-xs text-sm">
                  <span>{p.name} <span className="text-xs text-neutral-500">{p.role}</span></span>
                  <label className="flex items-center gap-xs text-xs"><input type="checkbox" checked={p.on} onChange={e => act({ action: 'person', personId: p.id, on: e.target.checked })} /> can invoice</label>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}

function Invoice({ i, act }: { i: any; act: (b: Record<string, unknown>) => Promise<boolean> }) {
  const [charge, setCharge] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  async function pdf() {
    const win = window.open('', '_blank')
    const r = await adminFetch(`/api/admin/supplier-invoices?pdf=${i.id}`)
    if (!r.ok) { win?.close(); alert('No PDF'); return }
    const u = URL.createObjectURL(await r.blob()); if (win) win.location.href = u; else window.location.href = u
  }
  const charged = i.lines.reduce((t: number, l: any, idx: number) => t + (charge.has(idx) ? Number(l.labour || 0) + Number(l.parts || 0) : 0), 0)
  return (
    <section className={`${card} p-lg`}>
      <div className="flex flex-wrap items-start justify-between gap-sm">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">{i.kind === 'cleaner' ? 'Cleaner' : 'Contractor'} · No. {i.number} · {day(i.date)}</p>
          <h2 className="text-lg font-bold text-neutral-900">{i.supplier} — {gbp(i.total)}</h2>
          <p className="text-sm text-neutral-600">{i.property ?? (i.period ? `Cleans ${i.period}` : '')}{i.vat ? ` · incl. VAT ${gbp(i.vat)}` : ''} · due {day(i.due)}</p>
        </div>
        <span className={`rounded-full px-md py-xs text-xs font-bold ${i.status === 'sent' ? 'bg-amber-50 text-amber-800' : i.status === 'void' ? 'bg-neutral-100 text-neutral-500' : 'bg-green-50 text-green-800'}`}>{STATUS[i.status] ?? i.status}</span>
      </div>
      <table className="mt-md w-full text-sm">
        <thead><tr className="text-left text-[11px] uppercase tracking-wide text-neutral-500">{i.kind === 'cleaner' && i.status === 'sent' && <th className="w-24 py-xs">Landlord pays</th>}<th className="py-xs">Line</th><th className="py-xs text-right">Labour</th><th className="py-xs text-right">Parts</th></tr></thead>
        <tbody className="divide-y divide-neutral-100">
          {i.lines.map((l: any, idx: number) => (
            <tr key={idx}>
              {i.kind === 'cleaner' && i.status === 'sent' && <td className="py-xs"><input type="checkbox" checked={charge.has(idx)} onChange={e => { const n = new Set(charge); if (e.target.checked) n.add(idx); else n.delete(idx); setCharge(n) }} /></td>}
              <td className="py-xs">{l.description}{l.where ? <span className="block text-xs text-neutral-500">{l.where}</span> : null}{l.receipt ? <span className="block text-xs text-green-700">receipt attached</span> : null}</td>
              <td className="py-xs text-right tabular-nums">{l.labour ? gbp(l.labour) : '—'}</td>
              <td className="py-xs text-right tabular-nums">{l.parts ? gbp(l.parts) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {i.notes && <p className="mt-sm text-sm text-neutral-600">“{i.notes}”</p>}
      {i.voidReason && <p className="mt-sm text-sm text-neutral-500">Void: {i.voidReason}</p>}
      <div className="mt-md flex flex-wrap items-center gap-sm">
        <button type="button" className={btn} onClick={pdf}>View invoice</button>
        {i.status === 'sent' && (i.kind === 'contractor'
          ? <button type="button" className={btnDark} disabled={busy || !i.propertyId} onClick={async () => { setBusy(true); await act({ action: 'approve', id: i.id }); setBusy(false) }}>Approve — add {gbp(i.total)} to {i.property ?? 'the property'}’s expenses</button>
          : <button type="button" className={btnDark} disabled={busy} onClick={async () => { setBusy(true); await act({ action: 'approve', id: i.id, chargeLines: [...charge] }); setBusy(false) }}>{charge.size ? `Approve — ${gbp(charged)} to the landlords, the rest ours` : 'Approve — all ours (no landlord charge)'}</button>)}
        {i.status === 'approved' && <button type="button" className={btn} onClick={() => act({ action: 'paid', id: i.id })}>Mark paid</button>}
        {(i.status === 'sent') && <button type="button" className="rounded-lg border border-red-200 px-md py-xs text-sm font-semibold text-red-700 hover:bg-red-50" onClick={() => { const r = prompt('Void this invoice? Its jobs/cleans can then be invoiced again. Why?'); if (r !== null) act({ action: 'void', id: i.id, reason: r }) }}>Void</button>}
        {i.expenseIds?.length > 0 && <a href="/admin/expense-log" className="text-sm font-semibold text-blue-700 hover:underline">{i.expenseIds.length} expense{i.expenseIds.length === 1 ? '' : 's'} added →</a>}
      </div>
    </section>
  )
}
