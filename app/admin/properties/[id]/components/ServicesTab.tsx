'use client'

// Bills & services (5 Nov 2026, migration 264): every account at the house — internet, energy, water, council tax,
// appliance cover, cleaning … — with the details that get lost (account number, login email, who it's in the name
// of, contract end, meter numbers) and what's actually been paid for it, from the expenses and statements. Costs that
// keep coming up with nothing recorded are offered as suggestions. The internet account's network, WiFi password and
// fault line are what tenants see in their app — written there from here, so there's one copy.
import { useCallback, useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'
import { SERVICE_KINDS, WHO_PAYS, kindLabel, type ServiceView, type Suggestion } from '@/lib/properties/services'

const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const EMPTY = { id: '', kind: 'internet', supplier: '', account_number: '', account_holder: '', login_email: '', support_phone: '', who_pays: 'we_recharge', payment_method: '', monthly_cost: '', contract_start: '', contract_end: '', meter_refs: '', wifi_network: '', wifi_password: '', notes: '' }
type Form = typeof EMPTY

export default function ServicesTab({ propertyId }: { propertyId: string }) {
  const [d, setD] = useState<{ ready: boolean; services: ServiceView[]; suggestions: Suggestion[] } | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => adminFetch(`/api/admin/property-services?propertyId=${propertyId}`).then(r => r.json()).then(j => { if (!j.error) setD(j) }), [propertyId])
  useEffect(() => { load() }, [load])

  async function save() {
    if (!form) return
    setBusy(true); setErr('')
    const r = await adminFetch('/api/admin/property-services', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId, service: { ...form, id: form.id || undefined } }) })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setErr(j.error ?? 'Not saved'); return }
    setForm(null); load()
  }
  async function act(action: 'end' | 'delete', id: string, what: string) {
    if (!window.confirm(action === 'end' ? `Mark ${what} as closed? It stays on record.` : `Delete ${what}? Only for one added by mistake.`)) return
    await adminFetch('/api/admin/property-services', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id }) })
    load()
  }
  const edit = (x: ServiceView) => setForm(Object.fromEntries(Object.keys(EMPTY).map(k => [k, (x as any)[k] == null ? '' : String((x as any)[k])])) as Form)
  const fromSuggestion = (g: Suggestion) => setForm({ ...EMPTY, kind: g.kind, supplier: g.supplier ?? '', monthly_cost: g.perMonth != null ? g.perMonth.toFixed(2) : '', wifi_network: g.wifi?.network ?? '', wifi_password: g.wifi?.password ?? '', support_phone: g.wifi?.phone ?? '' })

  if (!d) return <p className="text-sm text-neutral-500">Loading…</p>
  const live = d.services.filter(x => !x.ended_at), closed = d.services.filter(x => x.ended_at)
  const monthly = live.filter(x => x.who_pays !== 'tenants' && x.who_pays !== 'landlord').reduce((n, x) => n + (x.monthly_cost ?? x.paid.perMonth ?? 0), 0)
  const input = 'mt-xs w-full rounded-lg border border-neutral-300 px-sm py-xs text-sm font-normal'
  const field = (k: keyof Form, label: string, o: { type?: string; ph?: string; wide?: boolean } = {}) => (
    <label className={`text-xs font-semibold text-neutral-600 ${o.wide ? 'sm:col-span-2' : ''}`}>{label}
      <input type={o.type ?? 'text'} value={form![k]} placeholder={o.ph} onChange={e => setForm({ ...form!, [k]: e.target.value })} className={input} />
    </label>
  )

  return (
    <div className="space-y-lg">
      {!d.ready && <p className="rounded-xl border border-amber-200 bg-amber-50 px-md py-sm text-sm text-amber-900">Run migration 264 in Supabase to record bills & services.</p>}

      <div className="flex flex-wrap items-center justify-between gap-sm">
        <p className="text-sm text-neutral-600">{live.length ? `${live.length} account${live.length === 1 ? '' : 's'} · about ${gbp(monthly)} a month paid by us` : 'The accounts at this house — internet, energy, water and the rest — with the details that are easy to lose.'}</p>
        {d.ready && <button type="button" onClick={() => { setForm({ ...EMPTY }); setErr('') }} className="rounded-xl bg-neutral-900 px-md py-sm text-sm font-bold text-white">+ Add a bill or service</button>}
      </div>

      {/* costs that keep coming up with no account recorded */}
      {d.ready && d.suggestions.length > 0 && !form && (
        <section className="rounded-2xl border border-blue-200 bg-blue-50/60 px-lg py-md">
          <p className="text-sm font-bold text-blue-950">Found on the statements and house information — add the account details?</p>
          <ul className="mt-sm space-y-xs">{d.suggestions.map(g => (
            <li key={g.kind} className="flex flex-wrap items-center justify-between gap-sm text-sm">
              <span><b>{kindLabel(g.kind)}</b>{g.supplier ? ` · ${g.supplier}` : ''} — {g.why}{g.perMonth ? ` · about ${gbp(g.perMonth)} a month` : ''}</span>
              <button type="button" onClick={() => fromSuggestion(g)} className="rounded-lg border border-blue-300 bg-white px-md py-xs text-xs font-semibold text-blue-900">Add it</button>
            </li>
          ))}</ul>
        </section>
      )}

      {form && (
        <section className="rounded-2xl border border-neutral-200 bg-white p-lg space-y-md">
          <h3 className="text-base font-bold">{form.id ? `${kindLabel(form.kind)} — edit` : 'Add a bill or service'}</h3>
          <div className="grid gap-md sm:grid-cols-2">
            <label className="text-xs font-semibold text-neutral-600">What it’s for
              <select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })} className={input}>{SERVICE_KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}</select>
            </label>
            {field('supplier', 'Supplier', { ph: 'e.g. Community Fibre' })}
            {field('account_number', 'Account number')}
            {field('account_holder', 'Account in the name of', { ph: 'e.g. Capital Rooms Ltd' })}
            {field('login_email', 'Online account login (email)', { type: 'email', ph: 'e.g. bills@capitalrooms.co.uk' })}
            {field('support_phone', form.kind === 'internet' ? 'Fault line (shown to tenants)' : 'Supplier phone', { type: 'tel' })}
            <label className="text-xs font-semibold text-neutral-600">Who pays
              <select value={form.who_pays} onChange={e => setForm({ ...form, who_pays: e.target.value })} className={input}>{WHO_PAYS.map(w => <option key={w.key} value={w.key}>{w.label}</option>)}</select>
            </label>
            {field('monthly_cost', 'Cost a month (£)', { ph: 'e.g. 23.00' })}
            {field('payment_method', 'Paid by', { ph: 'e.g. Direct debit from the office account' })}
            {field('contract_start', 'Contract start', { type: 'date' })}
            {field('contract_end', 'Contract end — we remind you before', { type: 'date' })}
            {form.kind !== 'internet' && form.kind !== 'cleaning' && form.kind !== 'gardening' && field('meter_refs', 'Meter / supply numbers', { ph: 'MPAN, MPRN, meter serial, water supply number', wide: true })}
            {form.kind === 'internet' && <>
              {field('wifi_network', 'WiFi network name (tenants see this)')}
              {field('wifi_password', 'WiFi password (tenants see this)')}
            </>}
            <label className="text-xs font-semibold text-neutral-600 sm:col-span-2">Notes
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className={input} placeholder="e.g. Router in the kitchen cupboard; password for the online account is in the office password manager" />
            </label>
          </div>
          <p className="text-xs text-neutral-500">The online account’s password isn’t kept here — keep it in your password manager. {form.kind === 'internet' ? 'The network, WiFi password and fault line replace the WiFi details in the tenant app’s house information.' : ''}</p>
          {err && <p className="text-sm text-red-700">{err}</p>}
          <div className="flex gap-sm">
            <button type="button" disabled={busy} onClick={save} className="rounded-xl bg-neutral-900 px-lg py-sm text-sm font-bold text-white disabled:opacity-40">{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" onClick={() => setForm(null)} className="rounded-xl border border-neutral-300 px-md py-sm text-sm font-semibold">Cancel</button>
          </div>
        </section>
      )}

      {live.map(x => (
        <section key={x.id} className="rounded-2xl border border-neutral-200 bg-white">
          <div className="flex flex-wrap items-start justify-between gap-sm px-lg py-md">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-neutral-500">{kindLabel(x.kind)}</p>
              <p className="text-lg font-bold text-neutral-900">{x.supplier || 'Supplier not recorded'}</p>
              <p className="text-sm text-neutral-600">{WHO_PAYS.find(w => w.key === x.who_pays)?.label}{x.monthly_cost != null ? ` · ${gbp(x.monthly_cost)} a month` : ''}{x.payment_method ? ` · ${x.payment_method}` : ''}</p>
            </div>
            <div className="flex gap-sm">
              {x.contractEndsSoon && <span className="rounded-full bg-amber-100 px-sm py-0.5 text-[11px] font-bold text-amber-900">Contract ends {day(x.contract_end!)}</span>}
              <button type="button" onClick={() => edit(x)} className="text-sm font-semibold text-blue-700 hover:underline">Edit</button>
            </div>
          </div>
          <dl className="grid gap-x-lg gap-y-xs border-t border-neutral-100 px-lg py-md text-sm sm:grid-cols-2">
            {([['Account number', x.account_number], ['In the name of', x.account_holder], ['Online login', x.login_email], [x.kind === 'internet' ? 'Fault line' : 'Phone', x.support_phone],
              ['Contract', x.contract_start || x.contract_end ? [x.contract_start ? `from ${day(x.contract_start)}` : null, x.contract_end ? `to ${day(x.contract_end)}` : null].filter(Boolean).join(' ') : null],
              ['Meter / supply numbers', x.meter_refs], ['WiFi network', x.wifi_network], ['WiFi password', x.wifi_password], ['Notes', x.notes]] as [string, string | null][])
              .filter(([, v]) => v).map(([k, v]) => <div key={k} className="flex gap-sm"><dt className="w-40 shrink-0 text-neutral-500">{k}</dt><dd className="min-w-0 break-words font-medium">{v}</dd></div>)}
            {!x.account_number && !x.login_email && <p className="text-amber-800 sm:col-span-2">Account number and login not recorded yet — <button type="button" onClick={() => edit(x)} className="font-semibold underline">add them</button>.</p>}
          </dl>
          {/* what's actually been paid, from the expenses and statements */}
          <div className="border-t border-neutral-100 px-lg py-sm text-sm">
            <button type="button" onClick={() => setOpen(open === x.id ? null : x.id)} className="flex w-full flex-wrap items-center justify-between gap-sm text-left">
              <span className="text-neutral-700">{x.paid.count12 ? <>Paid {gbp(x.paid.last12)} over the last 12 months ({x.paid.count12} charge{x.paid.count12 === 1 ? '' : 's'}{x.paid.perMonth ? `, about ${gbp(x.paid.perMonth)} a month` : ''}){x.paid.last ? ` · last ${gbp(x.paid.last.amount)} on ${day(x.paid.last.date)}` : ''}</> : 'No charges found on the expenses or statements yet'}</span>
              {x.paid.payments.length > 0 && <span className="text-xs font-semibold text-blue-700">{open === x.id ? 'Hide' : 'Show'} charges</span>}
            </button>
            {open === x.id && (
              <ul className="mt-sm divide-y divide-neutral-100">{x.paid.payments.map((p, i) => (
                <li key={i} className="flex justify-between gap-sm py-1"><span className="min-w-0 truncate">{day(p.date)} · {p.description}{p.ref ? <span className="text-neutral-500"> · {p.ref}</span> : null}</span><span className="tabular-nums font-semibold">{gbp(p.amount)}</span></li>
              ))}</ul>
            )}
          </div>
          <div className="flex gap-md border-t border-neutral-100 px-lg py-sm text-xs">
            <button type="button" onClick={() => act('end', x.id, `${kindLabel(x.kind)} (${x.supplier ?? 'this account'})`)} className="font-semibold text-neutral-600 hover:underline">Account closed or moved</button>
            <button type="button" onClick={() => act('delete', x.id, `${kindLabel(x.kind)} (${x.supplier ?? 'this account'})`)} className="font-semibold text-red-700 hover:underline">Delete</button>
          </div>
        </section>
      ))}

      {closed.length > 0 && (
        <details className="rounded-2xl border border-neutral-200 bg-white px-lg py-md text-sm">
          <summary className="cursor-pointer font-semibold text-neutral-700">Closed accounts · {closed.length}</summary>
          <ul className="mt-sm space-y-xs">{closed.map(x => <li key={x.id}>{kindLabel(x.kind)} · {x.supplier ?? '—'}{x.account_number ? ` · ${x.account_number}` : ''} · closed {day(x.ended_at!)}</li>)}</ul>
        </details>
      )}
    </div>
  )
}
