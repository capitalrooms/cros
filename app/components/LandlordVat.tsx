'use client'

// A landlord's VAT, on their Summary (5 Nov 2026, Harry: "build it based on whether the landlord is VAT registered and
// allow us to click the options for how we are managing the VAT"). Their registration, and how we handle VAT on costs
// we pay for them — used by Quick add and every expense added for their houses (lib/expenses/vat).
import { useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'
import { VAT_TREATMENTS, type VatTreatment } from '@/lib/expenses/vat'

interface State { ready: boolean; ours: { from: string; rate: number } | null; registered: boolean; number: string | null; treatment: VatTreatment }

export default function LandlordVat({ landlordId }: { landlordId: string }) {
  const [st, setSt] = useState<State | null>(null)
  const [edit, setEdit] = useState<State | null>(null)
  const [msg, setMsg] = useState('')
  const load = () => adminFetch(`/api/admin/landlord-vat?landlordId=${landlordId}`).then(r => r.json()).then(d => { if (!d.error) setSt(d) })
  useEffect(() => { load() }, [landlordId])   // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!edit) return
    setMsg('')
    const r = await adminFetch('/api/admin/landlord-vat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ landlordId, registered: edit.registered, number: edit.number, treatment: edit.treatment }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setMsg(d.error ?? 'Not saved'); return }
    setEdit(null); load()
  }
  if (!st) return null
  const t = VAT_TREATMENTS.find(x => x.key === st.treatment)!
  return (
    <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
      <div className="px-xl py-lg border-b border-neutral-100 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">VAT</p>
        {st.ready && !edit && <button onClick={() => setEdit({ ...st })} className="text-xs font-semibold text-blue-600 hover:underline">Edit →</button>}
      </div>
      <div className="px-xl py-lg space-y-md text-sm">
        {!st.ready && <p className="text-amber-800">Run migration 263 in Supabase to record VAT for landlords.</p>}
        {st.ready && !edit && <>
          <div><p className="text-xs text-neutral-400">VAT registered</p><p className="font-semibold text-neutral-900">{st.registered ? `Yes${st.number ? ` · ${st.number}` : ''}` : 'No'}</p></div>
          <div><p className="text-xs text-neutral-400">Costs we pay for them</p><p className="font-semibold text-neutral-900">{t.label}</p><p className="text-xs text-neutral-500">{t.hint}</p></div>
        </>}
        {edit && <>
          <label className="flex items-center gap-sm"><input type="checkbox" checked={edit.registered} onChange={e => setEdit({ ...edit, registered: e.target.checked })} /> VAT registered</label>
          {edit.registered && <label className="block text-xs font-semibold text-neutral-600">VAT number<input value={edit.number ?? ''} onChange={e => setEdit({ ...edit, number: e.target.value })} placeholder="GB 123 4567 89" className="mt-xs block w-full rounded-lg border border-neutral-300 px-md py-sm text-sm font-normal" /></label>}
          <fieldset className="space-y-sm">
            <legend className="text-xs font-semibold text-neutral-600">How we handle VAT on costs we pay for them</legend>
            {VAT_TREATMENTS.map(o => {
              const off = o.key === 'recharge' && !st.ours
              return (
                <label key={o.key} className={`flex gap-sm rounded-lg border px-md py-sm ${edit.treatment === o.key ? 'border-neutral-900' : 'border-neutral-200'} ${off ? 'opacity-50' : 'cursor-pointer'}`}>
                  <input type="radio" name="vat-treatment" disabled={off} checked={edit.treatment === o.key} onChange={() => setEdit({ ...edit, treatment: o.key })} className="mt-1" />
                  <span><span className="block font-semibold">{o.label}</span><span className="block text-xs text-neutral-500">{off ? 'Available once Capital Rooms’ VAT registration date is set in Finance › Transactions.' : o.hint}</span></span>
                </label>
              )
            })}
          </fieldset>
          {msg && <p className="text-sm text-red-700">{msg}</p>}
          <div className="flex gap-sm">
            <button onClick={save} className="rounded-lg bg-neutral-900 px-md py-xs text-sm font-bold text-white">Save</button>
            <button onClick={() => { setEdit(null); setMsg('') }} className="rounded-lg border border-neutral-300 px-md py-xs text-sm font-semibold">Cancel</button>
          </div>
        </>}
      </div>
    </div>
  )
}
