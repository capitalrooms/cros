'use client'

// Properties › Bills & services (5 Nov 2026): every account at every house in one list — internet, energy, water,
// council tax… — so contracts about to end and accounts missing their details stand out. Each row opens the house's
// Bills & services tab, where they're kept. Data: /api/admin/property-services?all=1 (lib/properties/services).
import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import ExportButtons from '@/app/components/ExportButtons'
import { adminFetch } from '@/lib/adminFetch'
import { one, type PageSearchParams } from '@/lib/pageSearchParams'
import { SERVICE_KINDS, WHO_PAYS, kindLabel, type ServiceRow } from '@/lib/properties/services'

type Row = ServiceRow & { property: string; endsInDays: number | null }
const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const SHOWS = [['all', 'All accounts'], ['ending', 'Contracts ending'], ['missing', 'Missing details']] as const

export default function BillsAndServicesPage({ searchParams }: { searchParams: PageSearchParams }) {
  const sp = use(searchParams)
  const [d, setD] = useState<{ ready: boolean; rows: Row[] } | null>(null)
  const [show, setShow] = useState<string>(SHOWS.some(s => s[0] === one(sp.show)) ? one(sp.show)! : 'all')
  const [kind, setKind] = useState('')
  useEffect(() => { adminFetch('/api/admin/property-services?all=1').then(r => r.json()).then(j => { if (!j.error) setD(j) }) }, [])

  const missing = (r: Row) => !r.account_number || !r.login_email || !r.supplier
  const rows = useMemo(() => (d?.rows ?? [])
    .filter(r => (!kind || r.kind === kind) && (show === 'all' || (show === 'ending' ? r.endsInDays != null && r.endsInDays <= 60 : missing(r))))
    .sort((a, b) => show === 'ending' ? (a.endsInDays ?? 9e9) - (b.endsInDays ?? 9e9) : a.property.localeCompare(b.property, undefined, { numeric: true }) || a.kind.localeCompare(b.kind)), [d, show, kind])
  const all = d?.rows ?? []
  const ourCost = all.filter(r => r.who_pays === 'we_recharge' || r.who_pays === 'included').reduce((n, r) => n + (r.monthly_cost ?? 0), 0)

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin/active-rooms" />} title="Bills & services" />
      <PageHero trail={[{ label: 'Properties', href: '/admin/active-rooms' }]} title="Bills & services"
        subtitle="Every account at every house — internet, energy, water, council tax and the rest"
        stats={d?.ready ? [
          { label: 'Accounts', value: String(all.length) },
          { label: 'Paid by us a month', value: gbp(ourCost) },
          ...(all.filter(r => r.endsInDays != null && r.endsInDays <= 60).length ? [{ label: 'Contracts ending in 60 days', value: String(all.filter(r => r.endsInDays != null && r.endsInDays <= 60).length), tone: 'warn' as const }] : []),
          ...(all.filter(missing).length ? [{ label: 'Missing account details', value: String(all.filter(missing).length), tone: 'warn' as const }] : []),
        ] : undefined}
        tabs={SHOWS.map(([k, l]) => ({ key: k, label: l, active: show === k, onClick: () => setShow(k) }))} />
      <main className="mx-auto max-w-6xl space-y-md px-lg py-xl">
        {d && !d.ready && <p className="rounded-xl border border-amber-200 bg-amber-50 px-lg py-sm text-sm text-amber-900">Run migration 264 in Supabase to record bills & services.</p>}
        {d?.ready && <>
          <div className="flex flex-wrap items-center gap-sm">
            <select value={kind} onChange={e => setKind(e.target.value)} className="rounded-xl border border-neutral-200 bg-white px-md py-sm text-sm" aria-label="Type">
              <option value="">Every type</option>{SERVICE_KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
            <ExportButtons className="ml-auto" title="Bills and services" filename="bills-and-services"
              columns={[{ key: 'property', label: 'Property' }, { key: 'type', label: 'Type' }, { key: 'supplier', label: 'Supplier' }, { key: 'account_number', label: 'Account number' }, { key: 'login_email', label: 'Login email' }, { key: 'who', label: 'Who pays' }, { key: 'monthly_cost', label: 'A month', money: true }, { key: 'contract_end', label: 'Contract end' }]}
              rows={rows.map(r => ({ ...r, type: kindLabel(r.kind), who: WHO_PAYS.find(w => w.key === r.who_pays)?.label ?? '', contract_end: r.contract_end ? day(r.contract_end) : '' }))} />
          </div>
          <section className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-neutral-200 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-neutral-500">
                <th className="px-md py-sm">Property</th><th className="px-md py-sm">Type</th><th className="px-md py-sm">Supplier · account</th><th className="px-md py-sm">Who pays</th><th className="px-md py-sm text-right">A month</th><th className="px-md py-sm">Contract end</th>
              </tr></thead>
              <tbody>{rows.map(r => (
                <tr key={r.id} className="relative border-t border-neutral-100 hover:bg-neutral-50">
                  <td className="px-md py-sm font-semibold"><Link href={`/admin/properties/${r.property_id}?tab=services`} className="after:absolute after:inset-0 hover:underline">{r.property}</Link></td>
                  <td className="px-md py-sm">{kindLabel(r.kind)}</td>
                  <td className="px-md py-sm">{r.supplier ?? <span className="text-amber-800">Supplier not recorded</span>}<span className="block text-xs text-neutral-500">{[r.account_number, r.login_email].filter(Boolean).join(' · ') || <span className="text-amber-800">No account number or login</span>}</span></td>
                  <td className="px-md py-sm text-neutral-600">{WHO_PAYS.find(w => w.key === r.who_pays)?.label.split(' —')[0]}</td>
                  <td className="px-md py-sm text-right tabular-nums">{r.monthly_cost != null ? gbp(r.monthly_cost) : '—'}</td>
                  <td className="px-md py-sm">{r.contract_end ? <span className={r.endsInDays != null && r.endsInDays <= 60 ? 'font-semibold text-amber-800' : ''}>{day(r.contract_end)}{r.endsInDays != null && r.endsInDays < 0 ? ' · ended' : r.endsInDays != null && r.endsInDays <= 60 ? ` · ${r.endsInDays} days` : ''}</span> : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
            {!rows.length && <p className="px-md py-lg text-sm text-neutral-500">{all.length ? 'Nothing here for this choice.' : 'No accounts recorded yet — add them on each property’s Bills & services tab (CROS suggests the ones on the statements).'}</p>}
          </section>
        </>}
      </main>
    </div>
  )
}
