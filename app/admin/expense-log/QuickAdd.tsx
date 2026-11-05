'use client'

// Quick add (5 Nov 2026): paste a house's address and its items under it, check what CROS read, add them all.
// Each house shows its landlord's VAT position and how we handle VAT on their costs (their setting, changeable for
// this batch); each item records the VAT on its receipt. Every item goes through the same route as adding one
// expense (POST /api/admin/expenses → lib/expenses/create): duplicates, numbering and the statement month as usual.
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { adminFetch } from '@/lib/adminFetch'
import { parseQuickAdd, type QuickDraft, type QuickProperty, type QuickRoom } from '@/lib/expenses/quickAdd'
import { VAT_TREATMENTS, chargeFor, vatInside, type VatTreatment } from '@/lib/expenses/vat'
import { PROPERTY_WIDE_CATEGORIES, ROOM_SPECIFIC_CATEGORY_TYPES } from '@/lib/expense-categories'

const CATS = [...PROPERTY_WIDE_CATEGORIES.filter(c => c.type !== 'income' && !['management_fee', 'letting_fee'].includes(c.slug)).map(c => ({ slug: c.slug, label: c.label })), ...ROOM_SPECIFIC_CATEGORY_TYPES.map(c => ({ slug: c.slug, label: `Room: ${c.label}` }))]
const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const EXAMPLE = '4 Willis Road\nMattress protector Room 2 £15.99 Amazon\nLight bulbs x4 £8.50 from Screwfix 3/11\n\n12 Saltwell Street\nSmoke alarm £22.00 Toolstation'

type Row = QuickDraft & { vat: string; status?: { kind: 'added' | 'dup' | 'error'; text: string } }
interface Landlord { name: string; registered: boolean; number: string | null; treatment: VatTreatment }

export default function QuickAdd({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [text, setText] = useState('')
  const [props, setProps] = useState<(QuickProperty & { landlord_id: string | null })[]>([])
  const [rooms, setRooms] = useState<QuickRoom[]>([])
  const [rows, setRows] = useState<Row[] | null>(null)
  const [landlords, setLandlords] = useState<Record<string, Landlord>>({})
  const [ours, setOurs] = useState<{ from: string; rate: number } | null>(null)
  const [vatReady, setVatReady] = useState(true)
  const [treat, setTreat] = useState<Record<string, VatTreatment>>({})   // per house, for this batch
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const sb = createClient()
    Promise.all([
      sb.from('properties').select('id, name, address, property_code, landlord_id'),
      sb.from('rooms').select('id, name, property_id'),
    ]).then(([p, r]) => { setProps((p.data ?? []) as any); setRooms((r.data ?? []) as any) })
  }, [])

  async function read() {
    const drafts = parseQuickAdd(text, props, rooms)
    setRows(drafts.map(d => ({ ...d, vat: '' })))
    const ids = [...new Set(drafts.map(d => props.find(p => p.id === d.property_id)?.landlord_id).filter(Boolean))] as string[]
    if (!ids.length) return
    const r = await adminFetch(`/api/admin/landlord-vat?landlordIds=${ids.join(',')}`)
    const d = await r.json().catch(() => ({}))
    if (!r.ok) return
    setLandlords(d.byId ?? {}); setOurs(d.ours ?? null); setVatReady(d.ready !== false)
    // each house starts with its landlord's setting; a recharge only once we're VAT registered
    const t: Record<string, VatTreatment> = {}
    for (const x of drafts) if (x.property_id) { const l = d.byId?.[props.find(p => p.id === x.property_id)?.landlord_id ?? '']; t[x.property_id] = l?.treatment === 'recharge' && d.ours ? 'recharge' : 'disbursement' }
    setTreat(t)
    setRows(drafts.map(x => ({ ...x, vat: x.property_id && t[x.property_id] === 'recharge' && x.amount ? vatInside(x.amount, d.ours?.rate ?? 20).toFixed(2) : '' })))
  }

  const groups = useMemo(() => {
    const m = new Map<string, Row[]>()
    for (const r of rows ?? []) { const k = r.property_id ?? `?${r.line}`; m.set(k, [...(m.get(k) ?? []), r]) }
    return [...m.entries()]
  }, [rows])
  const set = (line: number, patch: Partial<Row>) => setRows(rs => rs!.map(r => r.line === line ? { ...r, ...patch } : r))
  const ready = (rows ?? []).filter(r => !r.problem && r.property_id && r.amount && r.description && r.status?.kind !== 'added')

  async function addAll(confirmLine?: number) {
    setBusy(true)
    for (const r of ready.filter(x => confirmLine == null || x.line === confirmLine)) {
      const t = treat[r.property_id!] ?? 'disbursement'
      const res = await adminFetch('/api/admin/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        property_id: r.property_id, room_id: r.room_id, description: r.description, amount: r.amount, expense_date: r.expense_date,
        supplier: r.supplier, category: r.category, vat_treatment: t, vat_on_receipt: r.vat === '' ? null : Number(r.vat), confirm_duplicate: confirmLine === r.line,
      }) })
      const j = await res.json().catch(() => ({}))
      set(r.line, { status: res.ok ? { kind: 'added', text: j.message } : res.status === 409 && j.duplicates ? { kind: 'dup', text: `Looks like ${j.duplicates[0]?.description} (${gbp(Number(j.duplicates[0]?.amount))}, ${j.duplicates[0]?.date})` } : { kind: 'error', text: j.error ?? 'Not added' } })
    }
    setBusy(false); onAdded()
  }

  const input = 'w-full rounded-md border border-neutral-300 px-xs py-1 text-sm'
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-lg space-y-md">
      <div className="flex items-start justify-between gap-md">
        <div>
          <h2 className="text-base font-bold text-neutral-900">Quick add</h2>
          <p className="text-sm text-neutral-600">Write the house on one line and its items under it — amount, and where you like the room, shop and date. Then check what CROS read before anything is added.</p>
        </div>
        <button type="button" onClick={onClose} className="text-sm font-semibold text-neutral-500 hover:text-neutral-900">Close</button>
      </div>

      {!rows ? <>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={8} placeholder={EXAMPLE} className="w-full rounded-xl border border-neutral-300 px-md py-sm font-mono text-sm" />
        <div className="flex gap-sm">
          <button type="button" disabled={!text.trim() || !props.length} onClick={read} className="rounded-xl bg-neutral-900 px-lg py-sm text-sm font-bold text-white disabled:opacity-40">Read the list</button>
          <button type="button" onClick={() => setText(EXAMPLE)} className="rounded-xl border border-neutral-300 px-md py-sm text-sm font-semibold">Show an example</button>
        </div>
      </> : <>
        {!vatReady && <p className="rounded-lg bg-amber-50 px-md py-sm text-sm text-amber-900">Run migration 263 to record VAT — until then items are added at cost without their VAT.</p>}
        {groups.map(([key, items]) => {
          const prop = props.find(p => p.id === items[0].property_id)
          const ll = prop?.landlord_id ? landlords[prop.landlord_id] : undefined
          const t = prop ? treat[prop.id] ?? 'disbursement' : 'disbursement'
          return (
            <div key={key} className="rounded-xl border border-neutral-200">
              <div className="flex flex-wrap items-center justify-between gap-sm border-b border-neutral-100 bg-neutral-50 px-md py-sm">
                <div>
                  <p className="font-bold text-neutral-900">{items[0].property ?? items[0].text}</p>
                  {prop && <p className="text-xs text-neutral-500">{ll ? `${ll.name} · ${ll.registered ? `VAT registered${ll.number ? ` (${ll.number})` : ''}` : 'not VAT registered'}` : 'No landlord linked'}</p>}
                </div>
                {prop && (
                  <label className="text-xs font-semibold text-neutral-600">VAT on these costs
                    <select value={t} onChange={e => { const v = e.target.value as VatTreatment; setTreat(x => ({ ...x, [prop.id]: v })); setRows(rs => rs!.map(r => r.property_id === prop.id && r.amount ? { ...r, vat: v === 'recharge' && r.vat === '' ? vatInside(r.amount, ours?.rate ?? 20).toFixed(2) : r.vat } : r)) }} className="ml-sm rounded-md border border-neutral-300 bg-white px-xs py-1 text-sm font-normal">
                      {VAT_TREATMENTS.map(o => <option key={o.key} value={o.key} disabled={o.key === 'recharge' && !ours}>{o.label}{o.key === 'recharge' && !ours ? ' — once we’re VAT registered' : ''}</option>)}
                    </select>
                  </label>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-[11px] font-bold uppercase tracking-[0.06em] text-neutral-500">
                    <th className="px-sm py-xs">Description</th><th className="px-sm py-xs">Room</th><th className="px-sm py-xs">Supplier</th><th className="px-sm py-xs">Date</th><th className="px-sm py-xs">Category</th><th className="px-sm py-xs text-right">Receipt total</th><th className="px-sm py-xs text-right">VAT on receipt</th><th className="px-sm py-xs text-right">Landlord pays</th>
                  </tr></thead>
                  <tbody>{items.map(r => {
                    if (r.problem && !r.amount) return <tr key={r.line}><td colSpan={8} className="px-sm py-xs text-sm text-amber-800">Line {r.line}: “{r.text}” — {r.problem}</td></tr>
                    const c = r.amount ? chargeFor(r.amount, r.vat === '' ? 0 : Number(r.vat), t, ours?.rate ?? 20) : null
                    return (
                      <tr key={r.line} className="border-t border-neutral-100 align-top">
                        <td className="px-sm py-xs min-w-[200px]"><input value={r.description} onChange={e => set(r.line, { description: e.target.value })} className={input} />
                          {r.problem && <p className="text-xs text-amber-800">{r.problem}</p>}
                          {r.status && <p className={`text-xs ${r.status.kind === 'added' ? 'text-green-800' : r.status.kind === 'dup' ? 'text-amber-800' : 'text-red-700'}`}>{r.status.text}{r.status.kind === 'dup' && <button type="button" onClick={() => addAll(r.line)} className="ml-sm font-semibold underline">Add anyway</button>}</p>}</td>
                        <td className="px-sm py-xs min-w-[110px]"><select value={r.room_id ?? ''} onChange={e => set(r.line, { room_id: e.target.value || null })} className={input}><option value="">Whole house</option>{rooms.filter(x => x.property_id === r.property_id).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></td>
                        <td className="px-sm py-xs min-w-[110px]"><input value={r.supplier ?? ''} onChange={e => set(r.line, { supplier: e.target.value || null })} className={input} /></td>
                        <td className="px-sm py-xs"><input type="date" value={r.expense_date} onChange={e => set(r.line, { expense_date: e.target.value })} className={input} /></td>
                        <td className="px-sm py-xs min-w-[150px]"><select value={r.category ?? ''} onChange={e => set(r.line, { category: e.target.value || null })} className={input}><option value="">—</option>{CATS.map(x => <option key={x.slug} value={x.slug}>{x.label}</option>)}</select></td>
                        <td className="px-sm py-xs w-[100px]"><input inputMode="decimal" value={r.amount ?? ''} onChange={e => set(r.line, { amount: Number(e.target.value) || null })} className={`${input} text-right`} /></td>
                        <td className="px-sm py-xs w-[110px]"><input inputMode="decimal" value={r.vat} placeholder="none" onChange={e => set(r.line, { vat: e.target.value })} className={`${input} text-right`} />
                          {r.amount && r.vat === '' && <button type="button" onClick={() => set(r.line, { vat: vatInside(r.amount!, ours?.rate ?? 20).toFixed(2) })} className="text-[11px] text-blue-700 hover:underline">20% inside</button>}</td>
                        <td className="px-sm py-xs text-right tabular-nums">{c ? <><b>{gbp(c.charged)}</b>{c.vatCharged ? <span className="block text-[11px] text-neutral-500">{gbp(c.net)} + {gbp(c.vatCharged)} VAT</span> : null}
                          {t === 'recharge' && r.vat === '' && <span className="block text-[11px] text-amber-800">No VAT on the receipt — they pay VAT on top</span>}</> : '—'}</td>
                      </tr>
                    )
                  })}</tbody>
                </table>
              </div>
            </div>
          )
        })}
        <p className="text-xs text-neutral-500">VAT on receipt: only what the receipt shows (some Amazon Marketplace sellers aren’t VAT registered). At cost, the landlord pays the receipt total and the VAT stays theirs; with Recharge with VAT, we reclaim it and charge net + VAT.</p>
        <div className="flex flex-wrap gap-sm">
          <button type="button" disabled={busy || !ready.length} onClick={() => addAll()} className="rounded-xl bg-neutral-900 px-lg py-sm text-sm font-bold text-white disabled:opacity-40">{busy ? 'Adding…' : `Add ${ready.length} expense${ready.length === 1 ? '' : 's'}`}</button>
          <button type="button" onClick={() => setRows(null)} className="rounded-xl border border-neutral-300 px-md py-sm text-sm font-semibold">Back to the list</button>
        </div>
      </>}
    </section>
  )
}
