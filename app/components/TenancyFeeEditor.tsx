'use client'

// Shows and edits a tenancy's management fee: the property's default, or the tenancy's own agreed fee.
import { useState } from 'react'
import { resolveFee, describeFee } from '@/lib/fees/managementFee'

type FeeFields = { management_fee_type?: string | null; management_fee_pct?: number | string | null; management_fee_fixed?: number | string | null }

export default function TenancyFeeEditor({ tenancyId, tenancy, property, onSaved }: {
  tenancyId: string; tenancy: FeeFields; property: FeeFields | null | undefined; onSaved?: () => void
}) {
  const effective = resolveFee(tenancy, property)
  const propFee = resolveFee(null, property)
  const [editing, setEditing] = useState(false)
  const [type, setType] = useState<string>(effective.source === 'tenancy' ? effective.type : 'property')
  const [value, setValue] = useState(effective.source === 'tenancy' ? String(effective.type === 'fixed' ? effective.fixed : effective.pct) : '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function save() {
    setBusy(true); setMsg('')
    try {
      const res = await fetch(`/api/admin/tenancies/${tenancyId}/fee`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, pct: type === 'fixed' ? undefined : value, fixed: type === 'fixed' ? value : undefined }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Could not save')
      setEditing(false); setMsg('Saved ✓'); onSaved?.()
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not save') }
    finally { setBusy(false) }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-md">
        <div>
          <p className="text-sm font-semibold text-neutral-900">Management fee</p>
          <p className={`text-xs mt-xs ${effective.source === 'none' ? 'font-semibold text-red-700' : 'text-neutral-500'}`}>
            {effective.source === 'none' ? 'Not set — add it here or on the property' : `${describeFee(effective)} · ${effective.source === 'tenancy' ? 'agreed for this tenancy' : 'the property’s standard fee'}`}
            {msg && <span className="ml-sm text-green-700">{msg}</span>}
          </p>
        </div>
        {!editing && <button onClick={() => setEditing(true)} className="text-xs font-semibold text-neutral-700 border border-neutral-300 rounded-lg px-sm py-xs hover:bg-neutral-50">Change</button>}
      </div>
      {editing && (
        <div className="mt-sm flex flex-wrap items-center gap-sm">
          <select value={type} onChange={e => setType(e.target.value)} className="rounded-lg border border-neutral-300 px-sm py-xs text-sm">
            <option value="property">Property’s standard fee{propFee.source !== 'none' ? ` (${describeFee(propFee)})` : ' (not set)'}</option>
            <option value="pct_received">% of rent received</option>
            <option value="pct_charged">% of rent charged</option>
            <option value="fixed">Fixed £ a month</option>
          </select>
          {type !== 'property' && (
            <span className="flex items-center gap-xs text-sm">
              {type === 'fixed' && '£'}
              <input type="number" min="0" step={type === 'fixed' ? '0.01' : '0.5'} value={value} onChange={e => setValue(e.target.value)} className="w-20 rounded-lg border border-neutral-300 px-sm py-xs text-sm" />
              {type !== 'fixed' && '%'}
            </span>
          )}
          <button onClick={save} disabled={busy || (type !== 'property' && value === '')} className="rounded-lg bg-neutral-900 px-md py-xs text-xs font-semibold text-white disabled:opacity-40">{busy ? 'Saving…' : 'Save'}</button>
          <button onClick={() => setEditing(false)} className="text-xs text-neutral-500">Cancel</button>
        </div>
      )}
    </div>
  )
}
