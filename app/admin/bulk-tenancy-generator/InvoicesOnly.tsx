'use client'

// Invoices only: bill tenancy work already done (no agreements). The parsed lines are grouped into
// one invoice per property per payer — the landlord's invoices ticked, tenant/other payers unticked.

import { useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'
import { createClient } from '@/lib/supabase'
import RecipientSend, { type RecipientDoc } from './RecipientSend'

export interface InvoiceLine {
  ref: string | null
  property: string | null
  room_number: number | null
  tenant_name: string | null
  service: string | null
  amount: number | null
  payer_type: 'landlord' | 'tenant' | 'other' | null
  payer_name: string | null
}

interface Item { description: string; detail: string; amount: string }
interface Group {
  id: string
  include: boolean
  isLandlord: boolean
  payerNote: string
  recipient: string
  address: string
  addressFollowsProperty: boolean   // tenants/others: correspondence address = the tenancy address
  room: string                      // "Room 2, " when all lines are for one room
  email: string
  property: string
  invoiceNumber: string
  items: Item[]
  msg?: { ok: boolean; text: string }
  busy?: boolean
}

interface Props {
  lines: InvoiceLine[]
  landlordName: string
  landlordAddress: string
  landlordEmail: string
  landlordGreeting: string          // "Nigel" / "Harry and Adam"
  propertyCode: (property: string) => string   // "11 Hicks Street, …" → "011HIS"
  tidy: (property: string) => string
  onBack: () => void
}

const money = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = (s: string) => { const n = Number(String(s).replace(/[£,\s]/g, '')); return Number.isFinite(n) ? n : NaN }
const looksLikeAddress = (p: string) => /\s/.test(p.trim())
const tenancyAddress = (room: string, property: string) => (looksLikeAddress(property) ? `${room}${property}` : '')
// "Mr Joel Smith & Miss Ana Lee" → "Joel and Ana"
const greetingFor = (name: string) => name.split(/\s*(?:&|\/|,|\band\b)\s*/i)
  .map(p => p.replace(/^(mr|mrs|miss|ms|mx|dr|prof)\.?\s+/i, '').trim().split(/\s+/)[0]).filter(Boolean).join(' and ')

function buildGroups(p: Props): Group[] {
  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const map = new Map<string, Group>()
  const used = new Set<string>()
  for (const l of p.lines) {
    const property = (l.property ?? l.ref ?? '').trim()
    const isLandlord = (l.payer_type ?? 'landlord') === 'landlord'
    const payer = isLandlord ? 'landlord' : (l.payer_name || (l.payer_type === 'tenant' ? 'Tenants' : 'Other')).trim()
    const key = `${property.toLowerCase()}|${payer.toLowerCase()}`
    let g = map.get(key)
    if (!g) {
      const code = property ? (looksLikeAddress(property) ? p.propertyCode(property) : property.replace(/[^a-z0-9]/gi, '').toUpperCase()) : 'INV'
      let number = `${code}${stamp}${isLandlord ? '' : '-T'}`
      for (let i = 2; used.has(number); i++) number = `${code}${stamp}-${i}`
      used.add(number)
      const prop = looksLikeAddress(property) ? p.tidy(property) : property
      const room = l.room_number != null ? `Room ${l.room_number}, ` : ''
      g = {
        id: key, include: isLandlord, isLandlord,
        payerNote: isLandlord ? '' : `Paid by ${payer} — not the landlord`,
        recipient: isLandlord ? p.landlordName : (l.payer_type === 'tenant' ? (l.tenant_name ?? '') : payer),
        address: isLandlord ? p.landlordAddress : tenancyAddress(room, prop),
        addressFollowsProperty: !isLandlord, room,
        email: isLandlord ? p.landlordEmail : '',
        property: prop,
        invoiceNumber: number, items: [],
      }
      map.set(key, g)
    }
    // several rooms on one tenant invoice → address the property, not one room
    if (!isLandlord && g.items.length && g.room !== (l.room_number != null ? `Room ${l.room_number}, ` : '')) {
      g.room = ''; g.address = tenancyAddress('', g.property)
    }
    if (!isLandlord && l.payer_type === 'tenant' && l.tenant_name && !g.recipient.includes(l.tenant_name)) {
      g.recipient = g.recipient ? `${g.recipient} & ${l.tenant_name}` : l.tenant_name
    }
    g.items.push({
      description: l.service || 'Tenancy set-up',
      detail: [l.room_number != null ? `Room ${l.room_number}` : '', l.tenant_name ?? '', l.ref ? `Ref ${l.ref}` : ''].filter(Boolean).join(' — '),
      amount: l.amount != null ? String(l.amount) : '',
    })
  }
  for (const g of map.values()) if (!g.recipient.trim() && !g.isLandlord) g.recipient = 'The Tenants'
  return [...map.values()].sort((a, b) => Number(b.isLandlord) - Number(a.isLandlord))
}

export default function InvoicesOnly(props: Props) {
  const [groups, setGroups] = useState<Group[]>(() => buildGroups(props))
  // Property codes (e.g. "090ROS") → the property's full address, when the property is in the system
  useEffect(() => {
    const codes = Array.from(new Set(groups.filter(g => g.property && !looksLikeAddress(g.property)).map(g => g.property.toUpperCase())))
    if (!codes.length) return
    const variants = Array.from(new Set(codes.flatMap(c => [c, c.replace(/^(\d{1,2})(?=[A-Z])/, d => d.padStart(3, '0'))])))
    ;(createClient().from('properties') as any).select('property_code, address, postcode').in('property_code', variants)
      .then(({ data }: { data: { property_code: string; address: string | null; postcode: string | null }[] | null }) => {
        if (!data?.length) return
        const full = (r: { address: string | null; postcode: string | null }) => {
          const a = (r.address ?? '').replace(/\s*\n\s*/g, ', ').trim(), pc = (r.postcode ?? '').trim()
          return props.tidy(pc && !a.toUpperCase().includes(pc.toUpperCase()) ? `${a}, ${pc}` : a)
        }
        setGroups(prev => prev.map(g => {
          const c = g.property.toUpperCase()
          const hit = data.find(r => r.property_code?.toUpperCase() === c || r.property_code?.toUpperCase() === c.replace(/^(\d{1,2})(?=[A-Z])/, d => d.padStart(3, '0')))
          if (!hit?.address) return g
          const property = full(hit)
          return { ...g, property, address: g.addressFollowsProperty ? tenancyAddress(g.room, property) : g.address }
        }))
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Typing the landlord's address on one invoice fills their other invoices that are blank or matched it
  const setAddress = (g: Group, value: string) => setGroups(prev => prev.map(x =>
    x.id === g.id || (g.isLandlord && x.isLandlord && (!x.address.trim() || x.address === g.address)) ? { ...x, address: value, addressFollowsProperty: false } : x))
  const setProperty = (g: Group, value: string) => set(g.id, { property: value, ...(g.addressFollowsProperty ? { address: tenancyAddress(g.room, value.trim()) } : {}) })

  const set = (id: string, patch: Partial<Group>) => setGroups(prev => prev.map(g => (g.id === id ? { ...g, ...patch } : g)))
  const setItem = (id: string, i: number, patch: Partial<Item>) =>
    setGroups(prev => prev.map(g => (g.id === id ? { ...g, items: g.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) } : g)))

  const total = (g: Group) => g.items.reduce((t, it) => t + (num(it.amount) || 0), 0)
  const problem = (g: Group) =>
    !g.recipient.trim() ? 'Add who the invoice is to'
    : !g.address.trim() ? 'Add their correspondence address'
    : !g.items.length ? 'No lines to invoice'
    : g.items.some(it => !it.description.trim() || !(num(it.amount) > 0)) ? 'Every line needs a description and an amount'
    : ''

  const bodyOf = (g: Group) => ({
    landlordName: g.recipient.trim(),
    addressLines: g.address.split(/\n|,/).map(x => x.trim()).filter(Boolean),
    propertyAddress: g.property.trim(),
    invoiceNumber: g.invoiceNumber.trim(),
    invoiceDate: new Date().toISOString().slice(0, 10),
    title: 'Tenancy services',
    items: g.items.map(it => ({ description: it.description.trim(), detail: it.detail.trim() || undefined, qty: 1, unitPrice: num(it.amount) })),
  })

  async function download(g: Group) {
    const issue = problem(g)
    if (issue) { set(g.id, { msg: { ok: false, text: issue } }); return false }
    set(g.id, { busy: true, msg: undefined })
    try {
      const res = await adminFetch('/api/admin/landlord-invoice', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyOf(g)),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Error ${res.status}`)
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a'); a.href = url; a.download = `Invoice ${g.invoiceNumber.trim()}.pdf`; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      set(g.id, { busy: false, msg: { ok: true, text: `Invoice ${g.invoiceNumber.trim()} downloaded` } })
      return true
    } catch (e) {
      set(g.id, { busy: false, msg: { ok: false, text: e instanceof Error ? e.message : 'Could not create the invoice' } })
      return false
    }
  }

  async function downloadAll() {
    for (const g of groups.filter(x => x.include)) await download(g)
  }

  const included = groups.filter(g => g.include)
  // One email per recipient: the landlord's invoices go together; each tenant/other payer gets their own
  const recipients = Array.from(included.reduce((m, g) => {
    const k = g.email.trim().toLowerCase() || `name:${g.recipient.trim().toLowerCase()}|${g.id}`
    m.set(k, [...(m.get(k) ?? []), g]); return m
  }, new Map<string, Group[]>()).values())
  const recipientMessage = (gs: Group[]) => {
    const first = gs[0]
    const greeting = first.isLandlord && props.landlordGreeting ? props.landlordGreeting : greetingFor(first.recipient) || 'there'
    const sum = gs.reduce((t, g) => t + total(g), 0)
    return [
      `Dear ${greeting},`,
      gs.length === 1
        ? `Please find attached our invoice for ${first.items.map(i => i.description.trim().toLowerCase()).filter(Boolean).join(' and ') || 'tenancy services'}${first.property ? ` at ${first.property}` : ''}, totalling ${money(sum)}.`
        : `Please find attached our invoices for tenancy services:`,
      ...(gs.length > 1 ? [gs.map(g => `• ${g.property || 'Property'} — ${money(total(g))} (invoice ${g.invoiceNumber.trim()})`).join('\n'), `Total due: ${money(sum)}.`] : []),
      `Our bank details are on the invoice${gs.length > 1 ? 's' : ''} — please quote the invoice number as your payment reference. Payment is due within 14 days.`,
      'If you have any questions, just reply to this email.',
      'Kind regards,',
    ].join('\n\n')
  }
  const input = 'w-full rounded-lg border border-neutral-200 bg-white px-sm py-xs text-sm text-neutral-900'
  const label = 'block text-[11px] font-semibold text-neutral-500 uppercase tracking-wide mb-[2px]'

  return (
    <div className="space-y-lg">
      <div className="flex flex-wrap items-center justify-between gap-md">
        <div>
          <p className="text-sm font-bold text-neutral-900">{groups.length} invoice{groups.length === 1 ? '' : 's'} from your notes</p>
          <p className="text-xs text-neutral-500 mt-xs">One per property and payer. Check the recipient, address and each line, then download.</p>
        </div>
        <div className="flex items-center gap-md">
          <button type="button" onClick={props.onBack} className="text-sm text-neutral-500 hover:text-neutral-800">← Back to notes</button>
          <button type="button" onClick={downloadAll} disabled={!included.length}
            className="rounded-lg bg-neutral-900 text-white px-lg py-sm text-sm font-semibold hover:bg-neutral-700 disabled:opacity-40">
            Download {included.length} invoice{included.length === 1 ? '' : 's'} · {money(included.reduce((t, g) => t + total(g), 0))}
          </button>
        </div>
      </div>

      {groups.map(g => (
        <div key={g.id} className={`bg-white rounded-xl border p-lg space-y-md ${g.include ? 'border-neutral-200' : 'border-neutral-100 opacity-70'}`}>
          <div className="flex flex-wrap items-start justify-between gap-md">
            <label className="flex items-start gap-sm">
              <input type="checkbox" className="mt-1 w-4 h-4" checked={g.include} onChange={e => set(g.id, { include: e.target.checked })} />
              <span>
                <span className="block text-sm font-bold text-neutral-900">{g.property || 'Property not stated'}</span>
                {g.payerNote && <span className="block text-xs text-amber-700 mt-[2px]">{g.payerNote} — tick to invoice them separately</span>}
              </span>
            </label>
            <p className="text-sm text-neutral-700 tabular-nums">Total <strong>{money(total(g))}</strong></p>
          </div>

          <div className="grid gap-md md:grid-cols-3">
            <div>
              <label className={label}>Invoice to</label>
              <input className={input} value={g.recipient} onChange={e => set(g.id, { recipient: e.target.value })} placeholder="Name" />
              <label className={`${label} mt-sm`}>Email</label>
              <input className={input} type="email" value={g.email} onChange={e => set(g.id, { email: e.target.value })} placeholder="For sending from here (optional)" />
            </div>
            <div>
              <label className={label}>Correspondence address</label>
              <textarea rows={2} className={input} value={g.address} onChange={e => setAddress(g, e.target.value)} placeholder={'House number and street\nTown, postcode'} />
            </div>
            <div className="grid grid-cols-1 gap-sm">
              <div>
                <label className={label}>Property</label>
                <input className={input} value={g.property} onChange={e => setProperty(g, e.target.value)} placeholder="Full property address" />
              </div>
              <div>
                <label className={label}>Invoice number</label>
                <input className={`${input} font-mono`} value={g.invoiceNumber} onChange={e => set(g.id, { invoiceNumber: e.target.value })} />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-neutral-500">
                  <th className="py-xs pr-sm font-semibold">Service</th>
                  <th className="py-xs px-sm font-semibold">Detail (room, tenant, ref)</th>
                  <th className="py-xs px-sm font-semibold w-28 text-right">Amount £</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {g.items.map((it, i) => (
                  <tr key={i}>
                    <td className="py-[3px] pr-sm min-w-[180px]"><input className={input} value={it.description} onChange={e => setItem(g.id, i, { description: e.target.value })} /></td>
                    <td className="py-[3px] px-sm min-w-[200px]"><input className={input} value={it.detail} onChange={e => setItem(g.id, i, { detail: e.target.value })} /></td>
                    <td className="py-[3px] px-sm"><input className={`${input} text-right tabular-nums`} inputMode="decimal" value={it.amount} onChange={e => setItem(g.id, i, { amount: e.target.value })} /></td>
                    <td className="py-[3px] text-center">
                      <button type="button" aria-label="Remove line" onClick={() => set(g.id, { items: g.items.filter((_, j) => j !== i) })} className="text-neutral-400 hover:text-red-600">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" onClick={() => set(g.id, { items: [...g.items, { description: '', detail: '', amount: '' }] })}
              className="mt-xs text-xs font-semibold text-neutral-700 hover:underline">+ Add a line</button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-md pt-sm border-t border-neutral-100">
            <p className={`text-xs ${g.msg ? (g.msg.ok ? 'text-green-700' : 'text-red-700') : 'text-neutral-400'}`}>{g.msg?.text ?? problem(g)}</p>
            <button type="button" onClick={() => download(g)} disabled={g.busy}
              className="rounded-lg border border-neutral-300 px-md py-xs text-sm font-semibold text-neutral-900 hover:bg-neutral-50 disabled:opacity-40">
              {g.busy ? 'Creating…' : 'Download invoice (PDF)'}
            </button>
          </div>
        </div>
      ))}

      {recipients.length > 0 && (
        <div className="space-y-sm">
          <div>
            <p className="text-sm font-bold text-neutral-900">Send by email</p>
            <p className="text-xs text-neutral-500 mt-xs">
              {recipients.length} email{recipients.length === 1 ? '' : 's'} — one per recipient. Preview each one (invoices and message), then send. You are copied in by default.
            </p>
          </div>
          {recipients.map(gs => {
            const docs: RecipientDoc[] = gs.map(g => ({ key: g.id, label: `${g.invoiceNumber} · ${money(total(g))}`, body: bodyOf(g) }))
            const sum = money(gs.reduce((t, g) => t + total(g), 0))
            return (
              <RecipientSend
                key={gs.map(g => g.id).join(',')}
                name={gs[0].recipient}
                to={gs[0].email}
                docs={docs}
                total={sum}
                suggestedSubject={gs.length === 1 ? `Invoice ${gs[0].invoiceNumber.trim()}${gs[0].property ? ` — ${gs[0].property}` : ''}` : 'Your invoices from Capital Rooms'}
                suggestedMessage={recipientMessage(gs)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
