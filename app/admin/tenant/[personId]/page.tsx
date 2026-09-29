'use client'

import { useState, useEffect, use, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import TenantCard, { TenantCardTenant, TenantCardTenancy, tenantDisplayName } from '@/app/components/TenantCard'
import EditPersonModal from '@/app/admin/components/EditPersonModal'
import DocUploadDrawer from '@/components/DocUploadDrawer'
import DocViewDrawer from '@/components/DocViewDrawer'
import { rentChargesForTenancies } from '@/lib/rentCharges'
import { downloadPdf } from '@/lib/adminFetch'
import DepositReturnPanel from '@/app/components/DepositReturnPanel'
import TenancyFeeEditor from '@/app/components/TenancyFeeEditor'

/* ── Types ── */

interface TenancyRow extends TenantCardTenancy {
  id: string
  room_id: string
  property_id: string
  start_date: string
  end_date: string | null
  deposit_amount?: number | null
  deposit_held_by?: string | null
  deposit_scheme_ref?: string | null
  lease_reference?: string | null
}

interface Communication {
  id: string
  title: string
  message: string
  notification_type: string
  status: string
  created_at: string
}

interface SafetyCheck {
  id: string
  check_type: string
  response: string
  created_at: string
}

interface TenantReference {
  id: string
  reference_source: string | null
  report_date: string | null
  overall_decision: string | null
  legal_name: string | null
  date_of_birth: string | null
  nationality: string | null
  right_to_rent_status: string | null
  right_to_rent_until: string | null
  right_to_rent_ref: string | null
  right_to_rent_check_date: string | null
  id_type_1: string | null
  id_type_2: string | null
  id_verified_1: boolean
  id_verified_2: boolean
  verified_income_annual: number | null
  max_affordable_rent_monthly: number | null
  credit_result: string | null
  prev_landlord_ref_result: string | null
  prev_landlord_ref_name: string | null
  aml_result: string | null
  previous_addresses: any[]
  imported_at: string
}

const MERGE_FIELDS: { key: string; label: string; format?: (v: any) => string }[] = [
  { key: 'legal_name',             label: 'Legal name' },
  { key: 'date_of_birth',          label: 'Date of birth' },
  { key: 'nationality',            label: 'Nationality' },
  { key: 'right_to_rent_until',    label: 'Right to rent until' },
  { key: 'right_to_rent_ref',      label: 'Right to rent ref' },
  { key: 'verified_income_annual', label: 'Verified annual income', format: (v) => `£${Number(v).toLocaleString()}` },
  { key: 'credit_result',          label: 'Credit check result' },
  { key: 'overall_decision',       label: 'Reference status' },
]

const PEOPLE_FIELD_MAP: Record<string, keyof TenantCardTenant> = {
  legal_name:             'name',
  date_of_birth:          'date_of_birth' as any,
  nationality:            'nationality' as any,
  right_to_rent_until:    'right_to_rent_until',
  right_to_rent_ref:      'right_to_rent_ref' as any,
  verified_income_annual: 'verified_income_annual' as any,
  credit_result:          'credit_check_result' as any,
  overall_decision:       'reference_status',
}

/* ── Badge helpers ── */

function decisionBadge(d: string | null | undefined) {
  if (!d) return null
  const c = d === 'Approved' ? 'bg-green-100 text-green-800 border-green-200'
          : d === 'Declined' ? 'bg-red-100 text-red-800 border-red-200'
          : 'bg-amber-100 text-amber-800 border-amber-200'
  return <span className={`text-xs font-semibold px-sm py-xs rounded-full border ${c}`}>{d}</span>
}

function creditBadge(r: string | null | undefined) {
  if (!r) return <span className="text-sm text-neutral-400">—</span>
  const ok = r === 'Clean' || r === 'Pass'
  return <span className={`text-xs font-semibold px-sm py-xs rounded-full border ${ok ? 'bg-green-100 text-green-800 border-green-200' : 'bg-amber-100 text-amber-800 border-amber-200'}`}>{r}</span>
}

function amlBadge(r: string | null | undefined) {
  if (!r) return <span className="text-sm text-neutral-400">—</span>
  const ok = r === 'Clear' || r === 'Pass'
  return <span className={`text-xs font-semibold px-sm py-xs rounded-full border ${ok ? 'bg-green-100 text-green-800 border-green-200' : 'bg-red-100 text-red-800 border-red-200'}`}>{r}</span>
}

/* ── Helpers ── */

function fmt(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
}

/** Returns an object URL for the first image file in the array, or null. */
function firstImageObjectUrl(files: File[]): string | null {
  const img = files.find(f => f.type.startsWith('image/'))
  return img ? URL.createObjectURL(img) : null
}

/** True if the id_type string looks like a passport or photo ID. */
function isPhotoId(t: string | null | undefined): boolean {
  if (!t) return false
  const lc = t.toLowerCase()
  return lc.includes('passport') || lc.includes('photo') || lc.includes('licence') || lc.includes('license')
}

/* ══════════════════════════════════════════════════════════════════════ */
/* PaymentsTab — real data only                                         */
/* ══════════════════════════════════════════════════════════════════════ */

/* ── Modal helpers ── */

type PayModal  = { chargeId: string; amountDue: number; dueDate: string } | null
type EditModal = { chargeId: string; currentAmount: number } | null
type VoidModal = { chargeId: string; period: string; amount: number } | null

function RecordPaymentModal({ modal, onClose, onSuccess }: {
  modal: PayModal
  onClose: () => void
  onSuccess: () => void
}) {
  const [amount, setAmount]   = useState(modal ? modal.amountDue.toFixed(2) : '')
  const [date, setDate]       = useState(new Date().toISOString().slice(0, 10))
  const [method, setMethod]   = useState('bank_transfer')
  const [notes, setNotes]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState<string | null>(null)

  if (!modal) return null

  async function submit() {
    if (!modal) return
    setSaving(true); setErr(null)
    const res = await fetch(`/api/admin/rent-charges/${modal.chargeId}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount_received: Number(amount), payment_date: date, payment_method: method, payment_notes: notes }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setErr(json.error || 'Failed'); return }
    onSuccess()
    onClose()
  }

  const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-lg p-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-lg">
          <h2 className="text-base font-bold text-neutral-900">Record Payment</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-lg leading-none">✕</button>
        </div>
        <p className="text-xs text-neutral-500 mb-lg">Charge due: <span className="font-semibold text-neutral-900">{gbp(modal.amountDue)}</span> · Due {modal.dueDate}</p>
        {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-md py-sm mb-md">{err}</p>}
        <div className="space-y-md">
          <div>
            <label className="block text-xs font-semibold text-neutral-600 mb-xs">Amount received (£)</label>
            <input type="number" step="0.01" min="0.01" value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full border border-neutral-200 rounded-lg px-md py-sm text-sm text-neutral-900 focus:outline-none focus:border-neutral-500"
              style={{ fontVariantNumeric: 'tabular-nums' }} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-600 mb-xs">Date received</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full border border-neutral-200 rounded-lg px-md py-sm text-sm text-neutral-900 focus:outline-none focus:border-neutral-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-600 mb-xs">Payment method</label>
            <select value={method} onChange={e => setMethod(e.target.value)}
              className="w-full border border-neutral-200 rounded-lg px-md py-sm text-sm text-neutral-900 focus:outline-none focus:border-neutral-500">
              <option value="bank_transfer">Bank Transfer</option>
              <option value="standing_order">Standing Order</option>
              <option value="cash">Cash</option>
              <option value="cheque">Cheque</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-600 mb-xs">Payment reference / notes</label>
            <input type="text" placeholder="Optional" value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full border border-neutral-200 rounded-lg px-md py-sm text-sm text-neutral-900 focus:outline-none focus:border-neutral-500" />
          </div>
        </div>
        <div className="flex gap-sm mt-lg justify-end">
          <button onClick={onClose} className="px-lg py-sm text-sm font-semibold text-neutral-600 border border-neutral-200 rounded-lg hover:bg-neutral-50">Cancel</button>
          <button onClick={submit} disabled={saving || !amount}
            className="px-lg py-sm text-sm font-semibold text-white bg-neutral-900 rounded-lg hover:bg-neutral-700 disabled:opacity-40">
            {saving ? 'Recording…' : 'Record Payment'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EditAmountModal({ modal, onClose, onSuccess }: {
  modal: EditModal
  onClose: () => void
  onSuccess: () => void
}) {
  const [amount, setAmount] = useState(modal ? modal.currentAmount.toFixed(2) : '')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState<string | null>(null)

  if (!modal) return null

  async function submit() {
    if (!modal) return
    setSaving(true); setErr(null)
    const res = await fetch(`/api/admin/rent-charges/${modal.chargeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount_due: Number(amount), note: reason }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setErr(json.error || 'Failed'); return }
    onSuccess()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-lg p-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-lg">
          <h2 className="text-base font-bold text-neutral-900">Edit Amount Due</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-lg leading-none">✕</button>
        </div>
        {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-md py-sm mb-md">{err}</p>}
        <div className="space-y-md">
          <div>
            <label className="block text-xs font-semibold text-neutral-600 mb-xs">New amount due (£)</label>
            <input type="number" step="0.01" min="0.01" value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full border border-neutral-200 rounded-lg px-md py-sm text-sm text-neutral-900 focus:outline-none focus:border-neutral-500"
              style={{ fontVariantNumeric: 'tabular-nums' }} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-600 mb-xs">Reason <span className="text-red-500">*</span></label>
            <textarea rows={2} placeholder="Required — e.g. pro-rata adjustment, concession agreed" value={reason} onChange={e => setReason(e.target.value)}
              className="w-full border border-neutral-200 rounded-lg px-md py-sm text-sm text-neutral-900 focus:outline-none focus:border-neutral-500 resize-none" />
          </div>
        </div>
        <div className="flex gap-sm mt-lg justify-end">
          <button onClick={onClose} className="px-lg py-sm text-sm font-semibold text-neutral-600 border border-neutral-200 rounded-lg hover:bg-neutral-50">Cancel</button>
          <button onClick={submit} disabled={saving || !amount || !reason.trim()}
            className="px-lg py-sm text-sm font-semibold text-white bg-neutral-900 rounded-lg hover:bg-neutral-700 disabled:opacity-40">
            {saving ? 'Saving…' : 'Save Change'}
          </button>
        </div>
      </div>
    </div>
  )
}

function VoidPaymentModal({ modal, onClose, onSuccess }: {
  modal: VoidModal
  onClose: () => void
  onSuccess: () => void
}) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState<string | null>(null)

  if (!modal) return null

  async function submit() {
    if (!modal) return
    setSaving(true); setErr(null)
    const res = await fetch(`/api/admin/rent-charges/${modal.chargeId}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: reason }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setErr(json.error || 'Failed'); return }
    onSuccess()
    onClose()
  }

  const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-lg p-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-lg">
          <h2 className="text-base font-bold text-neutral-900">Void Payment</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-lg leading-none">✕</button>
        </div>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-md py-sm mb-lg">
          This will reverse the payment of <strong>{gbp(modal.amount)}</strong> for {modal.period}. The charge will be reset to pending.
        </p>
        {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-md py-sm mb-md">{err}</p>}
        <div>
          <label className="block text-xs font-semibold text-neutral-600 mb-xs">Reason for void <span className="text-red-500">*</span></label>
          <textarea rows={2} placeholder="Required — e.g. recorded in error, wrong amount" value={reason} onChange={e => setReason(e.target.value)}
            className="w-full border border-neutral-200 rounded-lg px-md py-sm text-sm text-neutral-900 focus:outline-none focus:border-neutral-500 resize-none" />
        </div>
        <div className="flex gap-sm mt-lg justify-end">
          <button onClick={onClose} className="px-lg py-sm text-sm font-semibold text-neutral-600 border border-neutral-200 rounded-lg hover:bg-neutral-50">Cancel</button>
          <button onClick={submit} disabled={saving || !reason.trim()}
            className="px-lg py-sm text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40">
            {saving ? 'Voiding…' : 'Void Payment'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════ */
/* PaymentsTab — real data only                                         */
/* ══════════════════════════════════════════════════════════════════════ */

function PaymentsTab({ tenancies, rentIncreases, paymentRows, rentCharges }: {
  tenancies: TenancyRow[]
  rentIncreases: any[]
  paymentRows: any[]
  rentCharges: any[]
}) {
  const [selectedId, setSelectedId] = useState<string>(tenancies[0]?.id ?? '')
  const [payModal,  setPayModal]    = useState<PayModal>(null)
  const [editModal, setEditModal]   = useState<EditModal>(null)
  const [voidModal, setVoidModal]   = useState<VoidModal>(null)
  const [charges,   setCharges]     = useState<any[]>(rentCharges)
  const [auditLog,  setAuditLog]    = useState<any[]>([])
  const [auditLoading, setAuditLoading] = useState(false)

  const tenancy = tenancies.find(t => t.id === selectedId) ?? tenancies[0]

  const increases = rentIncreases.filter((r: any) => r.tenancy_id === tenancy?.id)
  // Rows attributed to this tenancy, or fall back to all rows if tenancy_id wasn't stored (pre-migration 162)
  const stmtRows = paymentRows.filter((p: any) => p.tenancy_id === tenancy?.id)
  const tenancyCharges = charges.filter((c: any) => c.tenancy_id === tenancy?.id)

  const totalReceived = stmtRows.reduce((s: number, p: any) => s + Number(p.rent_income || 0), 0)
  const totalFee      = stmtRows.reduce((s: number, p: any) => s + Number(p.management_fee || 0), 0)
  const totalNet      = stmtRows.reduce((s: number, p: any) => s + Number(p.net_to_landlord || 0), 0)

  const gbp = (n: number) => `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const fmtDate = (s: string | null) => s ? new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

  async function refreshCharges() {
    if (!tenancy?.id) return
    const res = await fetch(`/api/admin/rent-charges?tenancy_id=${tenancy.id}`)
    if (res.ok) {
      const j = await res.json()
      // Merge refreshed charges for this tenancy into state
      setCharges(prev => [
        ...prev.filter((c: any) => c.tenancy_id !== tenancy.id),
        ...(j.charges || []),
      ])
    }
    loadAuditLog()
  }

  async function loadAuditLog() {
    if (!tenancy?.id) return
    setAuditLoading(true)
    const res = await fetch(`/api/admin/payment-audit-log?tenancy_id=${tenancy.id}`)
    if (res.ok) {
      const j = await res.json()
      setAuditLog(j.entries || [])
    }
    setAuditLoading(false)
  }

  // Load audit log when tenancy changes
  useEffect(() => { if (tenancy?.id) loadAuditLog() }, [tenancy?.id])

  // Sync charges prop into state on first render / when prop changes
  useEffect(() => { setCharges(rentCharges) }, [rentCharges])

  return (
    <>
    <RecordPaymentModal modal={payModal}  onClose={() => setPayModal(null)}  onSuccess={refreshCharges} />
    <EditAmountModal    modal={editModal} onClose={() => setEditModal(null)} onSuccess={refreshCharges} />
    <VoidPaymentModal   modal={voidModal} onClose={() => setVoidModal(null)} onSuccess={refreshCharges} />
    <div className="space-y-xl">

      {/* Tenancy picker */}
      {tenancies.length > 1 && (
        <div className="flex gap-sm flex-wrap">
          {tenancies.map(t => (
            <button key={t.id} onClick={() => setSelectedId(t.id)}
              className={`text-xs font-semibold px-md py-xs rounded-full border transition ${
                selectedId === t.id ? 'bg-neutral-900 text-white border-neutral-900' : 'text-neutral-600 border-neutral-200 hover:border-neutral-400'
              }`}>
              {t.property?.address || '—'} · {t.room?.name || '—'} ({t.start_date ? new Date(t.start_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '?'})
            </button>
          ))}
        </div>
      )}

      {/* Section 13 rent history — real records only */}
      {increases.length > 0 && (
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-md">Rent history (Section 13 notices)</h2>
          <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden divide-y divide-neutral-100">
            {increases.map((r: any) => (
              <div key={r.id} className="px-lg py-md flex items-center justify-between gap-md">
                <div>
                  <p className="text-sm font-semibold text-neutral-900">
                    £{Number(r.old_rent).toLocaleString()} → £{Number(r.negotiated_rent || r.proposed_rent).toLocaleString()} pcm
                  </p>
                  <p className="text-xs text-neutral-400 mt-xs">Effective {fmt(r.effective_date)}</p>
                </div>
                <span className={`text-xs font-semibold px-sm py-xs rounded-full border shrink-0 ${
                  r.outcome === 'accepted' || r.outcome === 'negotiated' ? 'bg-green-100 text-green-800 border-green-200'
                  : r.outcome === 'withdrawn' ? 'bg-neutral-100 text-neutral-600 border-neutral-200'
                  : 'bg-amber-100 text-amber-800 border-amber-200'
                }`}>{r.outcome}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rent schedule */}
      {tenancy && (() => {
        const rentAmt = Number((tenancy as any).rent_amount || (tenancy as any).rent_monthly || 0)
        if (!rentAmt) return null
        const dueDay: number = (tenancy as any).rent_due_day || 1
        const startDate = new Date(tenancy.start_date + 'T00:00:00')
        const endBound = tenancy.end_date ? new Date(tenancy.end_date + 'T00:00:00') : new Date()

        type Period = { ref: string; rangeStart: Date; rangeEnd: Date; dueDate: Date; rentDue: number; partial: boolean }
        const periods: Period[] = []
        let periodStart = new Date(startDate)
        let idx = 1

        while (periodStart <= endBound && periods.length < 60) {
          const monthEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0)
          const rangeEnd = monthEnd < endBound ? monthEnd : endBound
          const daysInMonth = monthEnd.getDate()
          const daysActive = Math.round((rangeEnd.getTime() - periodStart.getTime()) / 86400000) + 1
          const isPartial = daysActive < daysInMonth
          const rentDue = isPartial ? Math.round((rentAmt / daysInMonth) * daysActive * 100) / 100 : rentAmt

          // Due date: rent_due_day of this month, capped to month end
          const dueDayInMonth = Math.min(dueDay, daysInMonth)
          const dueDate = new Date(periodStart.getFullYear(), periodStart.getMonth(), dueDayInMonth)

          periods.push({
            ref: `#${String(idx).padStart(5, '0')}`,
            rangeStart: new Date(periodStart),
            rangeEnd,
            dueDate,
            rentDue,
            partial: isPartial,
          })
          idx++
          periodStart = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 1)
        }

        const fmtD = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
        const totalDue = periods.reduce((s, p) => s + p.rentDue, 0)
        const totalRec = stmtRows.reduce((s: number, p: any) => s + Number(p.rent_income || 0), 0)
        const totalNet = stmtRows.reduce((s: number, p: any) => s + Number(p.net_to_landlord || 0), 0)

        return (
          <div>
            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden mb-sm">
              <div className="px-xl py-md border-b border-neutral-100 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">Rent definition</p>
                </div>
              </div>
              <div className="px-xl py-md grid grid-cols-2 md:grid-cols-4 gap-md text-sm">
                <div><p className="text-xs text-neutral-400 mb-xs">Contractual rent</p><p className="font-semibold text-neutral-900">£{rentAmt.toLocaleString()} pcm</p></div>
                <div><p className="text-xs text-neutral-400 mb-xs">Due day</p><p className="font-semibold text-neutral-900">{dueDay}{dueDay===1?'st':dueDay===2?'nd':dueDay===3?'rd':'th'} of month</p></div>
                <div><p className="text-xs text-neutral-400 mb-xs">Payment reference</p><p className="font-semibold text-neutral-900">{(tenancy as any).payment_reference || 'None'}</p></div>
                <div><p className="text-xs text-neutral-400 mb-xs">Periods</p><p className="font-semibold text-neutral-900">{periods.length}</p></div>
              </div>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
              <div className="px-xl py-md border-b border-neutral-100">
                <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">Rent schedule</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <thead>
                    <tr className="bg-neutral-50 border-b border-neutral-200 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                      <th className="px-md py-sm text-left">Rent period</th>
                      <th className="px-md py-sm text-left">Ref</th>
                      <th className="px-md py-sm text-left">Due date</th>
                      <th className="px-md py-sm text-right">Rent due</th>
                      <th className="px-md py-sm text-right">Received</th>
                      <th className="px-md py-sm text-right">Outstanding</th>
                      <th className="px-md py-sm text-right">Paid to L/L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {[...periods].reverse().map((p, i) => {
                      const matched = stmtRows.find((r: any) => {
                        const d = new Date((r.statement?.period_start || r.statement?.statement_date || '') + 'T00:00:00')
                        return d.getFullYear() === p.rangeStart.getFullYear() && d.getMonth() === p.rangeStart.getMonth()
                      })
                      const received = matched ? Number(matched.rent_income || 0) : null
                      const paidLL   = matched ? Number(matched.net_to_landlord || 0) : null
                      const outstanding = received !== null ? Math.round((p.rentDue - received) * 100) / 100 : null
                      return (
                        <tr key={i} className={outstanding !== null && outstanding > 0 ? 'bg-amber-50/20' : ''}>
                          <td className="px-md py-sm text-neutral-900 whitespace-nowrap">
                            {fmtD(p.rangeStart)} – {fmtD(p.rangeEnd)}
                            {p.partial && <span className="ml-xs text-xs text-neutral-400">(pro-rata)</span>}
                          </td>
                          <td className="px-md py-sm text-neutral-400 text-xs">{p.ref}</td>
                          <td className="px-md py-sm text-neutral-600 whitespace-nowrap">{fmtD(p.dueDate)}</td>
                          <td className="px-md py-sm text-right font-semibold text-neutral-900">£{p.rentDue.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="px-md py-sm text-right">{received !== null ? <span className="text-neutral-900">£{received.toLocaleString('en-GB', {minimumFractionDigits:2})}</span> : <span className="text-neutral-300">£0.00</span>}</td>
                          <td className="px-md py-sm text-right">
                            {outstanding !== null
                              ? <span className={outstanding > 0 ? 'font-semibold text-amber-700' : 'text-green-700'}>{outstanding > 0 ? `£${outstanding.toLocaleString('en-GB',{minimumFractionDigits:2})}` : '£0.00'}</span>
                              : <span className="text-neutral-300">£{p.rentDue.toLocaleString('en-GB',{minimumFractionDigits:2})}</span>}
                          </td>
                          <td className="px-md py-sm text-right">{paidLL !== null ? <span className="text-neutral-900">£{paidLL.toLocaleString('en-GB',{minimumFractionDigits:2})}</span> : <span className="text-neutral-300">£0.00</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-neutral-50 border-t-2 border-neutral-300 font-semibold text-sm">
                      <td className="px-md py-sm text-neutral-700" colSpan={3}>Total</td>
                      <td className="px-md py-sm text-right text-neutral-900">£{totalDue.toLocaleString('en-GB',{minimumFractionDigits:2})}</td>
                      <td className="px-md py-sm text-right text-neutral-900">£{totalRec.toLocaleString('en-GB',{minimumFractionDigits:2})}</td>
                      <td className="px-md py-sm text-right text-amber-700">£{(totalDue - totalRec).toLocaleString('en-GB',{minimumFractionDigits:2})}</td>
                      <td className="px-md py-sm text-right text-neutral-900">£{totalNet.toLocaleString('en-GB',{minimumFractionDigits:2})}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Rent charges — manual payment tracking */}
      {tenancyCharges.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-md">
            <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400">Rent charges</h2>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-200 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                    <th className="px-md py-sm text-left">Due date</th>
                    <th className="px-md py-sm text-right">Amount due</th>
                    <th className="px-md py-sm text-right">Amount received</th>
                    <th className="px-md py-sm text-left">Method</th>
                    <th className="px-md py-sm text-left">Status</th>
                    <th className="px-md py-sm text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {tenancyCharges.map((c: any) => {
                    const statusColour = c.voided
                      ? 'bg-neutral-100 text-neutral-500 border-neutral-200'
                      : c.status === 'paid'
                        ? 'bg-green-100 text-green-800 border-green-200'
                        : c.status === 'partial'
                          ? 'bg-amber-100 text-amber-800 border-amber-200'
                          : 'bg-neutral-100 text-neutral-600 border-neutral-200'
                    const statusLabel = c.voided ? 'voided' : (c.status || 'pending')
                    const methodLabel: Record<string, string> = {
                      bank_transfer: 'Bank transfer', standing_order: 'Standing order',
                      cash: 'Cash', cheque: 'Cheque', other: 'Other',
                    }
                    return (
                      <tr key={c.id} className={c.voided ? 'opacity-50' : ''}>
                        <td className="px-md py-sm text-neutral-700 whitespace-nowrap">{fmtDate(c.due_date)}</td>
                        <td className="px-md py-sm text-right font-semibold text-neutral-900">
                          {gbp(Number(c.amount_due))}
                          {c.amount_due_original && Number(c.amount_due_original) !== Number(c.amount_due) && (
                            <span className="ml-xs text-xs text-neutral-400 line-through">{gbp(Number(c.amount_due_original))}</span>
                          )}
                        </td>
                        <td className="px-md py-sm text-right">
                          {Number(c.amount_received) > 0
                            ? <span className="text-neutral-900">{gbp(Number(c.amount_received))}</span>
                            : <span className="text-neutral-300">—</span>}
                        </td>
                        <td className="px-md py-sm text-neutral-500 text-xs">
                          {c.payment_method ? methodLabel[c.payment_method] || c.payment_method : '—'}
                        </td>
                        <td className="px-md py-sm">
                          <span className={`text-xs font-semibold px-sm py-xs rounded-full border ${statusColour}`}>{statusLabel}</span>
                        </td>
                        <td className="px-md py-sm">
                          {!c.voided && (
                            <div className="flex items-center gap-xs">
                              {c.status !== 'paid' && (
                                <button
                                  onClick={() => setPayModal({ chargeId: c.id, amountDue: Math.max(0, Number(c.amount_due) - Number(c.amount_received || 0)), dueDate: fmtDate(c.due_date) })}
                                  className="text-xs font-semibold px-sm py-xs rounded border border-neutral-200 hover:bg-neutral-50 text-neutral-700 whitespace-nowrap">
                                  Record payment
                                </button>
                              )}
                              <button
                                onClick={() => setEditModal({ chargeId: c.id, currentAmount: Number(c.amount_due) })}
                                className="text-xs px-sm py-xs rounded border border-neutral-200 hover:bg-neutral-50 text-neutral-500"
                                title="Edit amount due">
                                Edit
                              </button>
                              {['paid', 'partial'].includes(c.status) && (<>
                                <button
                                  onClick={() => setVoidModal({ chargeId: c.id, period: fmtDate(c.due_date), amount: Number(c.amount_received) })}
                                  className="text-xs px-sm py-xs rounded border border-red-200 hover:bg-red-50 text-red-600"
                                  title="Void this payment">
                                  Void
                                </button>
                                <button type="button"
                                  onClick={() => downloadPdf(`/api/admin/rent-charges/${c.id}/receipt`, 'Rent receipt.pdf').catch(e => alert(e.message))}
                                  className="text-xs px-sm py-xs rounded border border-neutral-200 hover:bg-neutral-50 text-neutral-500"
                                  title="Download payment receipt">
                                  Receipt
                                </button>
                              </>)}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Statement records — what was actually received, from imported statements */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-md">Statement records</h2>
        {stmtRows.length === 0 ? (
          <div className="rounded-xl border border-neutral-200 bg-white px-xl py-lg">
            <p className="text-sm text-neutral-400">No statement records for this tenancy. Records are created when landlord statements are imported — only statements processed since the payment pipeline was set up will appear here.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-200">
                    <th className="px-lg py-sm text-left text-xs font-semibold uppercase tracking-wider text-neutral-400">Period</th>
                    <th className="px-lg py-sm text-left text-xs font-semibold uppercase tracking-wider text-neutral-400">Ref</th>
                    <th className="px-lg py-sm text-right text-xs font-semibold uppercase tracking-wider text-neutral-400">Rent received</th>
                    <th className="px-lg py-sm text-right text-xs font-semibold uppercase tracking-wider text-neutral-400">Mgmt fee</th>
                    <th className="px-lg py-sm text-right text-xs font-semibold uppercase tracking-wider text-neutral-400">Paid to landlord</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {stmtRows.map((p: any) => {
                    const s = p.statement
                    const period = s?.period_start && s?.period_end
                      ? `${fmt(s.period_start)} – ${fmt(s.period_end)}`
                      : fmt(s?.statement_date)
                    return (
                      <tr key={p.id}>
                        <td className="px-lg py-sm text-neutral-900">{period}</td>
                        <td className="px-lg py-sm text-neutral-400 text-xs">{s?.statement_reference || '—'}</td>
                        <td className="px-lg py-sm text-right font-semibold text-neutral-900">£{Number(p.rent_income).toLocaleString()}</td>
                        <td className="px-lg py-sm text-right text-neutral-500">£{Number(p.management_fee).toLocaleString()}</td>
                        <td className="px-lg py-sm text-right font-semibold text-neutral-900">£{Number(p.net_to_landlord).toLocaleString()}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-neutral-50 border-t-2 border-neutral-200">
                    <td className="px-lg py-sm font-semibold text-neutral-700" colSpan={2}>Total</td>
                    <td className="px-lg py-sm text-right font-semibold text-neutral-900">£{totalReceived.toLocaleString()}</td>
                    <td className="px-lg py-sm text-right text-neutral-500">£{totalFee.toLocaleString()}</td>
                    <td className="px-lg py-sm text-right font-semibold text-neutral-900">£{totalNet.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Audit log */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-md">Payment audit log</h2>
        {auditLoading ? (
          <div className="flex items-center justify-center py-lg">
            <div className="w-5 h-5 rounded-full border-2 border-neutral-200 border-t-neutral-600 animate-spin" />
          </div>
        ) : auditLog.length === 0 ? (
          <div className="rounded-xl border border-neutral-200 bg-white px-xl py-md">
            <p className="text-sm text-neutral-400">No audit entries for this tenancy.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden divide-y divide-neutral-100">
            {auditLog.map((entry: any) => {
              const actionLabel: Record<string, string> = {
                manually_paid: 'Payment recorded',
                amount_due_edited: 'Amount due edited',
                voided: 'Payment voided',
              }
              const actionColour: Record<string, string> = {
                manually_paid: 'bg-green-100 text-green-800 border-green-200',
                amount_due_edited: 'bg-blue-100 text-blue-800 border-blue-200',
                voided: 'bg-red-100 text-red-800 border-red-200',
              }
              const performer = entry.performed_by_person
                ? `${entry.performed_by_person.first_name || ''} ${entry.performed_by_person.last_name || ''}`.trim()
                : 'System'
              const when = new Date(entry.performed_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
              return (
                <div key={entry.id} className="px-lg py-md flex items-start gap-md">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-sm mb-xs">
                      <span className={`text-xs font-semibold px-sm py-0.5 rounded-full border ${actionColour[entry.action] || 'bg-neutral-100 text-neutral-600 border-neutral-200'}`}>
                        {actionLabel[entry.action] || entry.action}
                      </span>
                      <span className="text-xs text-neutral-400">{when} · {performer}</span>
                    </div>
                    {entry.note && <p className="text-xs text-neutral-500 mt-xs">{entry.note}</p>}
                    {entry.old_value && entry.new_value && (
                      <p className="text-xs text-neutral-400 mt-xs font-mono">
                        {JSON.stringify(entry.old_value)} → {JSON.stringify(entry.new_value)}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
    </>
  )
}

/* ══════════════════════════════════════════════════════════════════════ */

export default function TenantProfilePage({ params }: { params: Promise<{ personId: string }> }) {
  const router    = useRouter()
  const { personId } = use(params)

  const [tenant, setTenant]                     = useState<TenantCardTenant | null>(null)
  const [tenancies, setTenancies]               = useState<TenancyRow[]>([])
  const [communications, setCommunications]     = useState<Communication[]>([])
  const [safetyChecks, setSafetyChecks]         = useState<SafetyCheck[]>([])
  const [referenceHistory, setReferenceHistory] = useState<TenantReference[]>([])
  const [loading, setLoading]                   = useState(true)

  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<'overview' | 'tenancy' | 'documents' | 'communications' | 'safety' | 'reference' | 'history' | 'payments'>(
    (searchParams.get('tab') as any) || 'overview'
  )

  const [paymentRows, setPaymentRows]       = useState<any[]>([])
  const [rentCharges, setRentCharges]       = useState<any[]>([])
  const [rentIncreases, setRentIncreases]   = useState<any[]>([])
  const [tenancyDocs, setTenancyDocs]       = useState<any[]>([])
  const [propertyCompliance, setPropertyCompliance] = useState<any | null>(null)
  const [docUploadFile, setDocUploadFile]   = useState<File | null>(null)
  const [docUploadType, setDocUploadType]   = useState('tenancy_agreement')
  const [docUploading, setDocUploading]     = useState(false)
  const [docUploadError, setDocUploadError] = useState<string | null>(null)
  const [showDocDrawer, setShowDocDrawer]   = useState(false)
  const [viewingDoc, setViewingDoc]         = useState<{ fileName: string; storageUrl: string; docType: string } | null>(null)

  const [inviting, setInviting]   = useState(false)
  const [inviteMsg, setInviteMsg] = useState<string | null>(null)
  const [isEditOpen, setIsEditOpen] = useState(false)

  /* Reference import */
  const [uploadedFiles, setUploadedFiles]     = useState<File[]>([])
  const [extracting, setExtracting]           = useState(false)
  const [extractedData, setExtractedData]     = useState<Record<string, any> | null>(null)
  const [mergeSelections, setMergeSelections] = useState<Record<string, boolean>>({})
  const [applying, setApplying]               = useState(false)
  const [importSuccess, setImportSuccess]     = useState(false)
  const [importError, setImportError]         = useState<string | null>(null)

  /* ID photo acceptance */
  const [acceptingPhoto, setAcceptingPhoto] = useState(false)

  const supabase = createClient()

  /* ── Candidate ID photo: first image file uploaded when a photo ID type detected ── */
  const candidateIdPhotoUrl = useMemo(() => {
    if (!extractedData) return null
    if (!isPhotoId(extractedData.id_type_1) && !isPhotoId(extractedData.id_type_2)) return null
    return firstImageObjectUrl(uploadedFiles)
  }, [extractedData, uploadedFiles])

  /* ── Data loading ── */
  useEffect(() => {
    async function init() {
      const user = await getCurrentUser()
      if (!user || (user.assignment?.role !== 'administrator' && user.assignment?.role !== 'admin')) {
        router.push('/login')
        return
      }

      const { data: tenantData } = await supabase.from('people').select('*').eq('id', personId).single()
      setTenant(tenantData)

      const { data: tenanciesData } = await supabase
        .from('tenancies')
        .select('*, room:rooms(name), property:properties(address, name, management_fee_type, management_fee_pct, management_fee_fixed)')
        .eq('person_id', personId)
        .order('start_date', { ascending: false })
      setTenancies((tenanciesData || []) as TenancyRow[])

      const { data: commsData } = await supabase
        .from('notifications').select('*').eq('user_id', personId)
        .order('created_at', { ascending: false }).limit(50)
      setCommunications(commsData || [])

      const { data: checksData } = await supabase
        .from('tenant_self_checks').select('*')
        .eq('tenancy_id', (tenanciesData || [])[0]?.id || '')
        .order('created_at', { ascending: false })
      setSafetyChecks(checksData || [])

      const { data: refData } = await supabase
        .from('tenant_references').select('*').eq('person_id', personId)
        .order('imported_at', { ascending: false })
      setReferenceHistory(refData || [])

      // Payment history from landlord_statement_rooms
      const { data: pmtData } = await supabase
        .from('landlord_statement_rooms')
        .select('*, statement:landlord_statements(statement_date, period_start, period_end, statement_reference)')
        .eq('tenant_id', personId)
        .order('created_at', { ascending: false })
      setPaymentRows(pmtData || [])

      // Rent charges — manual payment tracking
      if ((tenanciesData || []).length > 0) {
        setRentCharges(await rentChargesForTenancies(supabase as any, tenanciesData as any).catch(() => []))
      }

      // Rent change history from rent_increase_notices (keyed to tenancy)
      const tenancyIds = (tenanciesData || []).map((t: any) => t.id)
      if (tenancyIds.length > 0) {
        const { data: rinData } = await supabase
          .from('rent_increase_notices')
          .select('*')
          .in('tenancy_id', tenancyIds)
          .order('effective_date', { ascending: false })
        setRentIncreases(rinData || [])
      }

      // Documents linked to any tenancy for this person
      const tenancyIdList = (tenanciesData || []).map((t: any) => t.id)
      if (tenancyIdList.length > 0) {
        const { data: docsData } = await supabase
          .from('property_documents')
          .select('*')
          .in('tenancy_id', tenancyIdList)
          .order('uploaded_at', { ascending: false })
        setTenancyDocs(docsData || [])
      }

      // Property compliance (cert dates) for the tenant's current property
      const propertyId = (tenanciesData || []).find((t: any) => t.property_id)?.property_id
      if (propertyId) {
        const { data: propData } = await supabase
          .from('properties')
          .select('gas_safe_cert_expiry, electrical_cert_expiry, fire_risk_assessment_expiry, fire_detection_expiry, pat_test_expiry, emergency_lighting_expiry, license_expiry, insurance_expiry, has_gas')
          .eq('id', propertyId)
          .single()
        setPropertyCompliance(propData || null)
      }

      setLoading(false)
    }
    init()
  }, [personId, router])

  /* ── Invite ── */
  async function handleInvite() {
    setInviting(true); setInviteMsg(null)
    const res  = await fetch('/api/invite-tenant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ personId }) })
    const json = await res.json()
    setInviting(false)
    setInviteMsg(res.ok ? `✓ Invite sent to ${json.sentTo}` : `⚠ ${json.error}`)
    setTimeout(() => setInviteMsg(null), 6000)
  }

  /* ── ID photo acceptance ── */
  async function handleAcceptIdPhoto(candidateUrl: string) {
    if (!tenant) return
    setAcceptingPhoto(true)
    try {
      // Fetch the object URL back as a blob, upload to Supabase storage
      const blob     = await fetch(candidateUrl).then(r => r.blob())
      const ext      = blob.type.includes('png') ? 'png' : 'jpg'
      const path     = `id-photos/${personId}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('property-photos')
        .upload(path, blob, { upsert: true, contentType: blob.type })
      if (uploadErr) throw uploadErr

      const { data: { publicUrl } } = supabase.storage.from('property-photos').getPublicUrl(path)
      await supabase.from('people').update({ id_photo_url: publicUrl }).eq('id', personId)
      setTenant(prev => prev ? { ...prev, id_photo_url: publicUrl } : prev)
    } catch (e) {
      console.error('Failed to accept ID photo', e)
    } finally {
      setAcceptingPhoto(false)
    }
  }

  /* ── Reference import ── */
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setUploadedFiles(prev => [...prev, ...Array.from(e.target.files ?? [])])
    setExtractedData(null); setImportError(null)
  }
  function removeFile(idx: number) {
    setUploadedFiles(prev => prev.filter((_, i) => i !== idx))
    setExtractedData(null)
  }
  async function handleExtract() {
    if (!uploadedFiles.length) return
    setExtracting(true); setImportError(null)
    const formData = new FormData()
    uploadedFiles.forEach(f => formData.append('files', f))
    const res  = await fetch('/api/reference-import/extract', { method: 'POST', body: formData })
    const json = await res.json()
    setExtracting(false)
    if (!res.ok) { setImportError(json.error ?? 'Extraction failed'); return }
    const data = json.extracted as Record<string, any>
    setExtractedData(data)
    const defaults: Record<string, boolean> = {}
    for (const mf of MERGE_FIELDS) {
      const extracted = data[mf.key]
      const current   = (tenant as any)?.[PEOPLE_FIELD_MAP[mf.key]]
      defaults[mf.key] = extracted != null && (current == null || current === '')
    }
    setMergeSelections(defaults)
  }
  async function handleApply() {
    if (!extractedData) return
    setApplying(true); setImportError(null)
    const currentTenancy = tenancies.find(t => !(t as any).notice_received_date)
    const appliedFields  = Object.entries(mergeSelections).filter(([, v]) => v).map(([k]) => k)
    const res  = await fetch('/api/reference-import/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personId, tenancyId: currentTenancy?.id ?? null, referenceData: extractedData, appliedFields }),
    })
    const json = await res.json()
    setApplying(false)
    if (!res.ok) { setImportError(json.error ?? 'Apply failed'); return }
    const { data: freshTenant } = await supabase.from('people').select('*').eq('id', personId).single()
    setTenant(freshTenant)
    const { data: refData } = await supabase.from('tenant_references').select('*').eq('person_id', personId).order('imported_at', { ascending: false })
    setReferenceHistory(refData || [])
    setExtractedData(null); setUploadedFiles([])
    setImportSuccess(true)
    setTimeout(() => setImportSuccess(false), 5000)
  }

  async function handleDocUpload() {
    if (!docUploadFile || !currentTenancy) return
    setDocUploading(true); setDocUploadError(null)
    try {
      const ext  = docUploadFile.name.split('.').pop() ?? 'bin'
      // filed with the property's documents (the inbox folder is private — migration 194)
      const path = `${currentTenancy.property_id}/tenancy-${currentTenancy.id}/${docUploadType}-${Date.now()}.${ext}`
      const { error: storageErr } = await supabase.storage.from('property-documents').upload(path, docUploadFile, { upsert: false })
      if (storageErr) throw storageErr
      const { data: { publicUrl } } = supabase.storage.from('property-documents').getPublicUrl(path)
      const { error: dbErr } = await supabase.from('property_documents').insert({
        property_id:   currentTenancy.property_id,
        tenancy_id:    currentTenancy.id,
        document_type: docUploadType,
        file_name:     docUploadFile.name,
        storage_url:   publicUrl,
        file_size:     docUploadFile.size,
      })
      if (dbErr) throw dbErr
      const { data: fresh } = await supabase.from('property_documents').select('*').eq('tenancy_id', currentTenancy.id).order('uploaded_at', { ascending: false })
      setTenancyDocs(fresh || [])
      setDocUploadFile(null)
    } catch (e: any) {
      setDocUploadError(e.message ?? 'Upload failed')
    } finally {
      setDocUploading(false)
    }
  }

  /* ── Derived ── */
  const todayStr = new Date().toISOString().slice(0, 10)
  const currentTenancy    = tenancies.find(t => !(t as any).notice_received_date && (!t.end_date || t.end_date >= todayStr)) ?? null
  const previousTenancies = tenancies.filter(t => t.id !== currentTenancy?.id)
  const latestRef         = referenceHistory[0]

  /* ── Loading / not found ── */
  if (loading) return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/people?tab=tenants" />} />
      <div className="flex items-center justify-center py-3xl"><p className="text-sm text-neutral-400">Loading…</p></div>
    </div>
  )
  if (!tenant) return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/people?tab=tenants" />} />
      <div className="flex items-center justify-center py-3xl"><p className="text-sm text-neutral-500">Tenant not found</p></div>
    </div>
  )

  /* ══════════════════════════════════════════════════════════════════════ */

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin/people?tab=tenants" />} />

      <main className="mx-auto max-w-6xl px-lg py-xl">

        {/* ── Canonical tenant card ──────────────────────────────────── */}
        <div className="mb-xl">
          <TenantCard
            tenant={tenant}
            currentTenancy={currentTenancy}
            onInvite={handleInvite}
            inviting={inviting}
            inviteMsg={inviteMsg}
            candidateIdPhotoUrl={candidateIdPhotoUrl}
            onAcceptIdPhoto={handleAcceptIdPhoto}
            acceptingPhoto={acceptingPhoto}
          />
        </div>

        {/* ── Previous tenancies ─────────────────────────────────────── */}
        {previousTenancies.length > 0 && (
          <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden mb-xl">
            <div className="px-xl py-lg border-b border-neutral-100">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Previous tenancies ({previousTenancies.length})</p>
            </div>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400 border-b border-neutral-100">
                  <th className="px-xl py-sm">Property</th>
                  <th className="px-xl py-sm hidden sm:table-cell">Room</th>
                  <th className="px-xl py-sm hidden md:table-cell">Period</th>
                  <th className="px-xl py-sm text-right">Rent</th>
                </tr>
              </thead>
              <tbody>
                {previousTenancies.map(t => (
                  <tr key={t.id} className="border-t border-neutral-100">
                    <td className="px-xl py-md text-neutral-700">{t.property?.address || '—'}</td>
                    <td className="px-xl py-md hidden sm:table-cell text-neutral-500">{t.room?.name || '—'}</td>
                    <td className="px-xl py-md hidden md:table-cell text-neutral-500 text-xs">{fmt(t.start_date)} – {fmt(t.end_date)}</td>
                    <td className="px-xl py-md text-right text-neutral-600 font-medium">
                      {Number((t as any).rent_amount || t.rent_monthly || 0) ? `£${Number((t as any).rent_amount || t.rent_monthly).toLocaleString()}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Onboarding / lifecycle tracker ────────────────────────── */}
        {currentTenancy && (() => {
          const ct = currentTenancy as any
          const hasRef = referenceHistory.length > 0
          const depositProtected = !!(ct.deposit_scheme_ref)
          const depositReceived = !!(ct.deposit_amount)
          const movedIn = ct.start_date && ct.start_date <= todayStr
          const steps: { label: string; done: boolean | null; key: string; notTracked?: boolean }[] = [
            { label: 'Holding deposit',   done: !!ct.holding_deposit_received, key: 'holding' },
            { label: 'Referencing',       done: hasRef,                        key: 'ref' },
            { label: 'Agreement sent',    done: null, notTracked: true,        key: 'agreement' },
            { label: 'Docs issued',       done: tenancyDocs.length > 0,        key: 'docs' },
            { label: 'Monies received',   done: depositReceived,               key: 'monies' },
            { label: 'Deposit protected', done: depositProtected,              key: 'deposit' },
            { label: 'Keys issued',       done: null, notTracked: true,        key: 'keys' },
            { label: 'Moved in',          done: movedIn,                       key: 'moved' },
          ]
          const outstanding = steps.filter(s => s.done === false).map(s => s.label)
          return (
            <div className="mb-xl rounded-xl border border-neutral-200 bg-white overflow-hidden">
              <div className="px-xl py-md border-b border-neutral-100 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">Onboarding checklist</p>
                {outstanding.length === 0
                  ? <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-sm py-xs rounded-full">Complete</span>
                  : <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-sm py-xs rounded-full">{outstanding.length} outstanding</span>
                }
              </div>
              <div className="px-xl py-md flex flex-wrap gap-sm">
                {steps.map((s, i) => (
                  <div key={s.key} className="flex items-center gap-xs">
                    {i > 0 && <span className="text-neutral-200 text-xs">›</span>}
                    <span className={`text-xs font-semibold px-sm py-xs rounded-full border flex items-center gap-xs ${
                      s.done === true  ? 'bg-green-50 text-green-800 border-green-200'
                      : s.done === false ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-neutral-100 text-neutral-400 border-neutral-200'
                    }`}>
                      {s.done === true ? '✓ ' : s.done === false ? '· ' : ''}{s.label}{s.notTracked ? ' (not tracked)' : ''}
                    </span>
                  </div>
                ))}
              </div>
              {outstanding.length > 0 && (
                <div className="px-xl pb-md">
                  <p className="text-xs text-amber-700">Outstanding: {outstanding.join(', ')}. Deposit fields can be updated on the Tenancy tab.</p>
                </div>
              )}
            </div>
          )
        })()}

        {/* ── Tabs ──────────────────────────────────────────────────── */}
        <div className="flex gap-xs mb-xl border-b border-neutral-200 overflow-x-auto">
          {[
            { id: 'overview'        as const, label: 'Overview' },
            { id: 'tenancy'         as const, label: 'Tenancy' },
            { id: 'documents'       as const, label: `Documents${tenancyDocs.length ? ` (${tenancyDocs.length})` : ''}` },
            { id: 'reference'       as const, label: `Reference${referenceHistory.length ? ` (${referenceHistory.length})` : ''}` },
            { id: 'communications'  as const, label: `Communications (${communications.length})` },
            { id: 'safety'          as const, label: `Safety Checks (${safetyChecks.length})` },
            { id: 'history'         as const, label: 'Timeline' },
            { id: 'payments'        as const, label: `Payments${paymentRows.length ? ` (${paymentRows.length})` : ''}` },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 px-lg py-md text-sm font-semibold transition whitespace-nowrap ${
                activeTab === tab.id ? 'text-neutral-900 border-b-2 border-neutral-900' : 'text-neutral-400 hover:text-neutral-700'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* OVERVIEW                                                      */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-xl">
            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
              <div className="px-xl py-lg border-b border-neutral-100 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Contact info</p>
                <button
                  onClick={() => setIsEditOpen(true)}
                  className="text-xs font-semibold text-blue-600 hover:underline"
                >
                  Edit details
                </button>
              </div>
              <div className="px-xl py-lg space-y-md text-sm">
                <div><p className="text-xs text-neutral-400 mb-xs">Email</p><p className="font-semibold text-neutral-900 break-all">{tenant.email}</p></div>
                <div><p className="text-xs text-neutral-400 mb-xs">Phone</p><p className="font-semibold text-neutral-900">{(tenant as any).phone_number || (tenant as any).phone || '—'}</p></div>
                {(tenant as any).nationality    && <div><p className="text-xs text-neutral-400 mb-xs">Nationality</p><p className="font-semibold text-neutral-900">{(tenant as any).nationality}</p></div>}
                {(tenant as any).date_of_birth  && <div><p className="text-xs text-neutral-400 mb-xs">Date of birth</p><p className="font-semibold text-neutral-900">{fmt((tenant as any).date_of_birth)}</p></div>}
                {(tenant as any).verified_income_annual && <div><p className="text-xs text-neutral-400 mb-xs">Verified income</p><p className="font-semibold text-neutral-900">£{Number((tenant as any).verified_income_annual).toLocaleString()}/yr</p></div>}
              </div>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
              <div className="px-xl py-lg border-b border-neutral-100">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Reference summary</p>
              </div>
              <div className="px-xl py-lg space-y-md text-sm">
                {latestRef ? (
                  <>
                    <div className="flex items-center justify-between"><p className="text-xs text-neutral-400">Decision</p>{decisionBadge(latestRef.overall_decision)}</div>
                    {latestRef.right_to_rent_status && <div className="flex items-center justify-between"><p className="text-xs text-neutral-400">Right to rent</p><span className="font-semibold text-neutral-900">{latestRef.right_to_rent_status}</span></div>}
                    {latestRef.right_to_rent_until  && <div className="flex items-center justify-between"><p className="text-xs text-neutral-400">RTR expires</p><span className="font-semibold text-neutral-900">{fmt(latestRef.right_to_rent_until)}</span></div>}
                    {latestRef.verified_income_annual && <div className="flex items-center justify-between"><p className="text-xs text-neutral-400">Verified income</p><span className="font-semibold text-neutral-900">£{Number(latestRef.verified_income_annual).toLocaleString()}/yr</span></div>}
                    {latestRef.max_affordable_rent_monthly && <div className="flex items-center justify-between"><p className="text-xs text-neutral-400">Max affordable rent</p><span className="font-semibold text-neutral-900">£{Number(latestRef.max_affordable_rent_monthly).toLocaleString()}/mo</span></div>}
                    <div className="flex items-center justify-between"><p className="text-xs text-neutral-400">Credit</p>{creditBadge(latestRef.credit_result)}</div>
                    {latestRef.aml_result && <div className="flex items-center justify-between"><p className="text-xs text-neutral-400">AML</p>{amlBadge(latestRef.aml_result)}</div>}
                    <p className="text-xs text-neutral-400 pt-sm border-t border-neutral-100">
                      {latestRef.reference_source ?? 'Unknown source'} · {latestRef.report_date ? fmt(latestRef.report_date) : fmt(latestRef.imported_at)}
                    </p>
                  </>
                ) : (
                  <div className="py-md text-center">
                    <p className="text-neutral-400 text-sm mb-sm">No reference imported yet.</p>
                    <button onClick={() => setActiveTab('reference')} className="text-sm text-blue-600 hover:underline font-medium">Import reference →</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TENANCY                                                       */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'tenancy' && (
          <div className="space-y-xl">
            {!currentTenancy ? (
              <div className="rounded-xl border border-neutral-200 bg-white p-xl text-center">
                <p className="text-neutral-400 text-sm">No active tenancy on record.</p>
              </div>
            ) : (() => {
              const t = currentTenancy as any
              const rent = Number(t.rent_amount || t.rent_monthly || 0)
              const deposit = Number(t.deposit_amount || 0)
              const lrc = t.last_rent_change_date as string | null
              const anchor = lrc || t.start_date
              const nextFrom = anchor ? new Date(anchor + 'T00:00:00') : null
              if (nextFrom) nextFrom.setDate(nextFrom.getDate() + 364)
              const nextFromStr = nextFrom?.toISOString().slice(0, 10) ?? null
              const today = new Date().toISOString().slice(0, 10)
              const rentEligible = nextFromStr ? nextFromStr <= today : false

              return (
                <>
                  {/* ── Complete tenancy facts ── */}
                  <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                    <div className="border-b border-neutral-100 px-xl py-lg flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Current tenancy</p>
                      <span className="text-xs font-semibold px-sm py-xs rounded-full bg-green-100 text-green-800 border border-green-200">Active</span>
                    </div>

                    {/* Block 1 — location & term */}
                    <div className="px-xl pt-lg pb-md border-b border-neutral-50">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-300 mb-md">Location &amp; term</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-lg text-sm">
                        <div><p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Property</p><p className="font-semibold text-neutral-900">{t.property?.address || t.property?.name || '—'}</p></div>
                        <div><p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Room</p><p className="font-semibold text-neutral-900">{t.room?.name || '—'}</p></div>
                        <div><p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Start date</p><p className="font-semibold text-neutral-900">{fmt(t.start_date)}</p></div>
                        <div><p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">End date</p><p className="font-semibold text-neutral-900">{t.end_date ? fmt(t.end_date) : 'Rolling (Assured Periodic Tenancy)'}</p></div>
                        {t.notice_received_date && <div><p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Notice given</p><p className="font-semibold text-amber-700">{fmt(t.notice_received_date)}</p></div>}
                        {t.lease_reference && <div><p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Lease ref</p><p className="font-semibold text-neutral-900">{t.lease_reference}</p></div>}
                      </div>
                    </div>

                    {/* Block 2 — rent */}
                    <div className="px-xl pt-lg pb-md border-b border-neutral-50">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-300 mb-md">Rent</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-lg text-sm">
                        <div><p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Monthly rent</p><p className="font-bold text-neutral-900 text-lg">£{rent ? rent.toLocaleString() : '—'}</p></div>
                        {t.rent_due_day && <div><p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Due day</p><p className="font-semibold text-neutral-900">{t.rent_due_day}{t.rent_due_day === 1 ? 'st' : t.rent_due_day === 2 ? 'nd' : t.rent_due_day === 3 ? 'rd' : 'th'} of month</p></div>}
                        {lrc && <div><p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Last increase</p><p className="font-semibold text-neutral-900">{fmt(lrc)}{t.previous_rent_amount ? <span className="text-xs text-neutral-400 ml-xs">was £{Number(t.previous_rent_amount).toLocaleString()}</span> : ''}</p></div>}
                        <div>
                          <p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Next increase eligible</p>
                          <p className={`font-semibold text-sm ${rentEligible ? 'text-green-700' : 'text-neutral-900'}`}>{rentEligible ? '✓ Now eligible' : nextFromStr ? fmt(nextFromStr) : '—'}</p>
                          <p className="text-xs text-neutral-400">52 weeks from {lrc ? 'last change' : 'tenancy start'}</p>
                        </div>
                      </div>
                    </div>

                    {/* Block 3 — deposit lifecycle */}
                    <div className="px-xl pt-lg pb-lg">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-300 mb-md">Deposit</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-lg text-sm mb-lg">
                        <div>
                          <p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Holding deposit</p>
                          <p className={`font-semibold ${t.holding_deposit_received ? 'text-green-700' : 'text-neutral-400'}`}>{t.holding_deposit_received ? `£${Number(t.holding_deposit_received).toLocaleString()}` : 'Not recorded'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Full deposit</p>
                          <p className={`font-bold text-lg ${deposit ? 'text-neutral-900' : 'text-red-600'}`}>{deposit ? `£${deposit.toLocaleString()}` : 'Not recorded'}</p>
                          {!deposit && <p className="text-xs text-red-500 mt-xs">Enter amount when received</p>}
                        </div>
                        <div><p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Held by</p><p className="font-semibold text-neutral-900">{t.deposit_held_by || '—'}</p></div>
                        <div>
                          <p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Scheme ref</p>
                          <p className={`font-semibold ${t.deposit_scheme_ref ? 'text-neutral-900' : t.deposit_protection_assumed ? 'text-amber-700' : 'text-red-600'}`}>{t.deposit_scheme_ref || (t.deposit_protection_assumed ? `${t.deposit_scheme || 'DPS'} (taken over — add the ID)` : 'Not protected')}</p>
                        </div>
                        <div>
                          <p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Return status</p>
                          <p className={`font-semibold capitalize ${t.deposit_release_status === 'released' ? 'text-green-700' : t.deposit_release_status ? 'text-amber-700' : 'text-neutral-400'}`}>{t.deposit_release_status || 'Not initiated'}</p>
                        </div>
                        {t.deposit_inspection_at && <div><p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Inspection</p><p className="font-semibold text-neutral-900">{fmt(t.deposit_inspection_at)}</p></div>}
                        {t.deposit_released_at && <div><p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Released</p><p className="font-semibold text-green-700">{fmt(t.deposit_released_at)}</p></div>}
                      </div>
                      <DepositReturnPanel tenancyId={t.id} />
                      {t.deposit_inspection_notes && (
                        <div className="rounded-lg bg-neutral-50 border border-neutral-200 px-md py-sm text-sm">
                          <p className="text-xs text-neutral-400 mb-xs font-semibold uppercase tracking-wide">Inspection notes</p>
                          <p className="text-neutral-700">{t.deposit_inspection_notes}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── Actions ── */}
                  <div className="flex gap-md flex-wrap">
                    <button
                      onClick={async () => {
                        if (!window.confirm(`Mark ${tenantDisplayName(tenant)} as on notice?`)) return
                        const endDate = window.prompt('Enter notice end date (YYYY-MM-DD):', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
                        if (!endDate) return
                        await supabase.from('tenancies').update({ end_date: endDate, notice_received_date: new Date().toISOString().slice(0, 10) }).eq('id', currentTenancy.id)
                        window.location.reload()
                      }}
                      className="px-lg py-sm rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm font-semibold hover:bg-amber-100 transition"
                    >
                      ⚠ Mark on Notice
                    </button>
                    <a href={`/admin/properties/${currentTenancy.property_id}`} className="px-lg py-sm rounded-lg border border-neutral-200 text-neutral-700 text-sm font-semibold hover:bg-neutral-50 transition">
                      View property →
                    </a>
                    <a href={`/admin/rent-increase/${currentTenancy.id}`} className="px-lg py-sm rounded-lg border border-blue-200 bg-blue-50 text-blue-800 text-sm font-semibold hover:bg-blue-100 transition">
                      📈 Rent review
                    </a>
                    <button type="button" onClick={() => downloadPdf(`/api/admin/tenancies/${currentTenancy.id}/statement-of-account`, 'Statement of account.pdf').catch(e => alert(e.message))}
                      className="px-lg py-sm rounded-lg border border-neutral-200 text-neutral-700 text-sm font-semibold hover:bg-neutral-50 transition">
                      Statement of account (PDF)
                    </button>
                  </div>

                  {/* ── Landlord fees ── */}
                  <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                    <div className="border-b border-neutral-100 px-xl py-lg">
                      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Landlord fees</p>
                    </div>
                    <div className="divide-y divide-neutral-100">
                      <div className="px-xl py-md flex items-center justify-between text-sm">
                        <div>
                          <p className="font-semibold text-neutral-900">Letting fee</p>
                          <p className="text-xs text-neutral-400 mt-xs">{t.letting_fee_charged === 0 ? 'Not charged' : t.letting_fee_charged ? `£${Number(t.letting_fee_charged).toFixed(2)}` : 'Property’s usual fee'}</p>
                        </div>
                        <span className={`text-xs font-semibold px-sm py-xs rounded-full border ${t.letting_fee_charged !== 0 ? 'bg-neutral-100 text-neutral-700 border-neutral-200' : 'bg-neutral-50 text-neutral-400 border-neutral-200'}`}>{t.letting_fee_charged !== 0 ? 'Charged' : '—'}</span>
                      </div>
                      <div className="px-xl py-md">
                        <TenancyFeeEditor tenancyId={t.id} tenancy={t} property={t.property} onSaved={() => window.location.reload()} />
                      </div>
                    </div>
                  </div>

                  {/* ── Property compliance certificates ── */}
                  {propertyCompliance && (() => {
                    const today = new Date()
                    const certRows = [
                      { label: 'Gas Safety', date: propertyCompliance.gas_safe_cert_expiry, skip: !propertyCompliance.has_gas },
                      { label: 'EICR (Electrical)', date: propertyCompliance.electrical_cert_expiry },
                      { label: 'Fire Risk Assessment', date: propertyCompliance.fire_risk_assessment_expiry },
                      { label: 'Fire Detection', date: propertyCompliance.fire_detection_expiry },
                      { label: 'PAT Test', date: propertyCompliance.pat_test_expiry },
                      { label: 'Emergency Lighting', date: propertyCompliance.emergency_lighting_expiry },
                      { label: 'HMO Licence', date: propertyCompliance.license_expiry },
                      { label: 'Insurance', date: propertyCompliance.insurance_expiry },
                    ].filter(r => !r.skip && r.date)
                    if (certRows.length === 0) return null
                    return (
                      <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                        <div className="border-b border-neutral-100 px-xl py-lg">
                          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Property compliance — {currentTenancy.property?.address || currentTenancy.property?.name}</p>
                        </div>
                        <div className="divide-y divide-neutral-50">
                          {certRows.map(r => {
                            const exp = r.date ? new Date(r.date) : null
                            const daysLeft = exp ? Math.ceil((exp.getTime() - today.getTime()) / 86400000) : null
                            const expired = daysLeft !== null && daysLeft < 0
                            const warning = daysLeft !== null && daysLeft >= 0 && daysLeft < 60
                            return (
                              <div key={r.label} className="px-xl py-sm flex items-center justify-between">
                                <p className="text-sm text-neutral-700">{r.label}</p>
                                <div className="text-right">
                                  <p className={`text-sm font-semibold ${expired ? 'text-red-700' : warning ? 'text-amber-700' : 'text-neutral-900'}`}>
                                    {r.date ? new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                                  </p>
                                  {expired && <p className="text-xs text-red-600">Expired {Math.abs(daysLeft!)} days ago</p>}
                                  {warning && !expired && <p className="text-xs text-amber-600">Expires in {daysLeft} days</p>}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}

                  {/* ── Previous tenancies with full detail ── */}
                  {previousTenancies.length > 0 && (
                    <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                      <div className="px-xl py-lg border-b border-neutral-100">
                        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Previous tenancies ({previousTenancies.length})</p>
                      </div>
                      <div className="divide-y divide-neutral-100">
                        {previousTenancies.map((pt: any) => {
                          const ptRent = Number(pt.rent_amount || pt.rent_monthly || 0)
                          const ptDeposit = Number(pt.deposit_amount || 0)
                          const start = new Date(pt.start_date)
                          const end = pt.end_date ? new Date(pt.end_date) : null
                          const months = end ? Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30)) : null
                          return (
                            <div key={pt.id} className="px-xl py-lg grid grid-cols-2 md:grid-cols-4 gap-md text-sm">
                              <div className="col-span-2 md:col-span-4 mb-sm"><p className="font-semibold text-neutral-900">{pt.property?.address || pt.property?.name || '—'} — {pt.room?.name || '—'}</p><p className="text-xs text-neutral-400">{fmt(pt.start_date)} → {pt.end_date ? fmt(pt.end_date) : 'present'}{months ? ` · ${months} months` : ''}</p></div>
                              <div><p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Rent</p><p className="font-semibold text-neutral-900">{ptRent ? `£${ptRent.toLocaleString()}/mo` : '—'}</p></div>
                              <div><p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Deposit</p><p className="font-semibold text-neutral-900">{ptDeposit ? `£${ptDeposit.toLocaleString()}` : '—'}</p></div>
                              {pt.deposit_held_by && <div><p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Held by</p><p className="font-semibold text-neutral-900">{pt.deposit_held_by}</p></div>}
                              {pt.deposit_scheme_ref && <div><p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Scheme ref</p><p className="font-semibold text-neutral-900">{pt.deposit_scheme_ref}</p></div>}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* REFERENCE                                                     */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'reference' && (
          <div className="space-y-xl">
            {importSuccess && <div className="rounded-xl bg-green-50 border border-green-200 p-md text-sm font-semibold text-green-800">✓ Reference imported and profile updated.</div>}
            {importError  && <div className="rounded-xl bg-red-50 border border-red-200 p-md text-sm font-semibold text-red-800">⚠ {importError}</div>}

            {!extractedData && (
              <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                <div className="px-xl py-lg border-b border-neutral-100">
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Import reference bundle</p>
                </div>
                <div className="p-xl">
                  <p className="text-sm text-neutral-500 mb-lg">Upload any documents — reference report, credit report, right to rent certificate, passport, driving licence. AI extracts all available fields.</p>
                  <label className="block w-full rounded-xl border-2 border-dashed border-neutral-200 hover:border-neutral-400 transition cursor-pointer p-xl text-center mb-md">
                    <input type="file" multiple accept=".pdf,image/*" className="hidden" onChange={handleFileChange} />
                    <p className="text-2xl mb-sm">📄</p>
                    <p className="text-sm font-semibold text-neutral-700">Click to select files</p>
                    <p className="text-xs text-neutral-400 mt-xs">PDF, JPG, PNG — multiple files accepted</p>
                  </label>
                  {uploadedFiles.length > 0 && (
                    <div className="space-y-sm mb-lg">
                      {uploadedFiles.map((f, i) => (
                        <div key={i} className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-md py-sm">
                          <div className="flex items-center gap-sm">
                            <span>{f.type === 'application/pdf' ? '📄' : '🖼'}</span>
                            <div><p className="text-sm font-semibold text-neutral-900">{f.name}</p><p className="text-xs text-neutral-400">{(f.size / 1024).toFixed(0)} KB</p></div>
                          </div>
                          <button onClick={() => removeFile(i)} className="text-neutral-400 hover:text-red-500 text-lg">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button onClick={handleExtract} disabled={!uploadedFiles.length || extracting}
                    className="w-full rounded-xl bg-neutral-900 hover:bg-neutral-700 disabled:opacity-40 px-lg py-md text-sm font-bold text-white transition">
                    {extracting ? '⏳ Extracting…' : `🔍 Extract from ${uploadedFiles.length} file${uploadedFiles.length !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </div>
            )}

            {extractedData && (
              <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                <div className="px-xl py-lg border-b border-neutral-100 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-xs">Extracted data — review & import</p>
                    <p className="text-xs text-neutral-400">✓ = auto-selected where profile field was empty</p>
                  </div>
                  <button onClick={() => { setExtractedData(null); setUploadedFiles([]) }} className="text-sm text-neutral-400 hover:text-neutral-700">← Back</button>
                </div>
                <div className="p-xl">
                  {extractedData.overall_decision && (
                    <div className="mb-lg flex items-center gap-md">
                      <span className="text-xs text-neutral-500">Overall decision:</span>
                      {decisionBadge(extractedData.overall_decision)}
                      {extractedData.reference_source && <span className="text-xs text-neutral-400">Source: {extractedData.reference_source}</span>}
                    </div>
                  )}

                  <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-md">Fields to sync to profile</p>
                  <div className="space-y-sm mb-xl">
                    {MERGE_FIELDS.map(mf => {
                      const extracted = extractedData[mf.key]
                      if (extracted == null) return null
                      const current     = (tenant as any)?.[PEOPLE_FIELD_MAP[mf.key]]
                      const formatted   = mf.format ? mf.format(extracted) : String(extracted)
                      const currentFmt  = current && mf.format ? mf.format(current) : current ? String(current) : null
                      const hasConflict = currentFmt && currentFmt !== formatted
                      return (
                        <label key={mf.key} className={`flex items-start gap-md rounded-xl border px-md py-sm cursor-pointer transition ${mergeSelections[mf.key] ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 bg-white'}`}>
                          <input type="checkbox" checked={!!mergeSelections[mf.key]} onChange={e => setMergeSelections(prev => ({ ...prev, [mf.key]: e.target.checked }))} className="mt-xs w-4 h-4 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">{mf.label}</p>
                            <p className="text-sm font-semibold text-neutral-900 mt-xs">{formatted}</p>
                            {currentFmt && <p className={`text-xs mt-xs ${hasConflict ? 'text-amber-600' : 'text-neutral-400'}`}>{hasConflict ? '⚠ Replaces: ' : '✓ Matches: '}{currentFmt}</p>}
                            {!currentFmt && <p className="text-xs text-green-600 mt-xs">→ Will fill empty field</p>}
                          </div>
                        </label>
                      )
                    })}
                  </div>

                  <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-md">Additional data — stored in reference record</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-sm mb-xl text-sm">
                    {[
                      { label: 'Right to rent status', val: extractedData.right_to_rent_status },
                      { label: 'RTR until',            val: extractedData.right_to_rent_until },
                      { label: 'RTR reference',        val: extractedData.right_to_rent_ref },
                      { label: 'Max affordable rent',  val: extractedData.max_affordable_rent_monthly ? `£${Number(extractedData.max_affordable_rent_monthly).toLocaleString()}/mo` : null },
                      { label: 'Credit result',        val: extractedData.credit_result },
                      { label: 'Active judgments',     val: extractedData.active_judgments != null ? String(extractedData.active_judgments) : null },
                      { label: 'Landlord reference',   val: extractedData.prev_landlord_ref_result },
                      { label: 'AML result',           val: extractedData.aml_result },
                      { label: 'ID doc 1',             val: extractedData.id_type_1 ? `${extractedData.id_type_1}${extractedData.id_verified_1 ? ' ✓' : ''}` : null },
                      { label: 'ID doc 2',             val: extractedData.id_type_2 ? `${extractedData.id_type_2}${extractedData.id_verified_2 ? ' ✓' : ''}` : null },
                    ].filter(r => r.val != null).map(r => (
                      <div key={r.label} className="rounded-lg border border-neutral-200 bg-neutral-50 px-md py-sm">
                        <p className="text-xs text-neutral-400">{r.label}</p>
                        <p className="font-semibold text-neutral-900">{r.val}</p>
                      </div>
                    ))}
                  </div>

                  {Array.isArray(extractedData.previous_addresses) && extractedData.previous_addresses.length > 0 && (
                    <div className="mb-xl">
                      <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-md">Address history</p>
                      <div className="space-y-sm">
                        {extractedData.previous_addresses.map((a: any, i: number) => (
                          <div key={i} className="rounded-lg border border-neutral-200 bg-neutral-50 px-md py-sm text-sm">
                            <p className="font-semibold text-neutral-900">{a.address}</p>
                            <p className="text-xs text-neutral-400">{a.from ?? '?'} – {a.to ?? 'present'}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-md">
                    <button onClick={() => { setExtractedData(null); setUploadedFiles([]) }} className="rounded-xl border border-neutral-200 px-lg py-md text-sm font-semibold text-neutral-700 hover:bg-neutral-50">Cancel</button>
                    <button onClick={handleApply} disabled={applying} className="flex-1 rounded-xl bg-neutral-900 hover:bg-neutral-700 disabled:opacity-40 px-lg py-md text-sm font-bold text-white transition">
                      {applying ? 'Saving…' : `Save reference${Object.values(mergeSelections).some(Boolean) ? ' & update profile' : ''}`}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {referenceHistory.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-md">Reference history</p>
                <div className="space-y-sm">
                  {referenceHistory.map((ref, idx) => (
                    <details key={ref.id} className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                      <summary className="px-xl py-lg cursor-pointer flex items-center justify-between">
                        <div className="flex items-center gap-md">
                          {idx === 0 && <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-sm py-xs rounded-full border border-blue-200">Latest</span>}
                          {decisionBadge(ref.overall_decision)}
                          <span className="text-sm font-semibold text-neutral-900">{ref.reference_source ?? 'Reference'}</span>
                          <span className="text-xs text-neutral-400">{ref.report_date ? fmt(ref.report_date) : fmt(ref.imported_at)}</span>
                        </div>
                        <span className="text-neutral-400 text-xs">▼</span>
                      </summary>
                      <div className="border-t border-neutral-100 p-xl grid grid-cols-2 sm:grid-cols-3 gap-md text-sm">
                        {ref.legal_name              && <div><p className="text-xs text-neutral-400">Legal name</p><p className="font-semibold text-neutral-900">{ref.legal_name}</p></div>}
                        {ref.nationality             && <div><p className="text-xs text-neutral-400">Nationality</p><p className="font-semibold text-neutral-900">{ref.nationality}</p></div>}
                        {ref.date_of_birth           && <div><p className="text-xs text-neutral-400">DOB</p><p className="font-semibold text-neutral-900">{fmt(ref.date_of_birth)}</p></div>}
                        {ref.right_to_rent_status    && <div><p className="text-xs text-neutral-400">Right to rent</p><p className="font-semibold text-neutral-900">{ref.right_to_rent_status}</p></div>}
                        {ref.right_to_rent_until     && <div><p className="text-xs text-neutral-400">RTR until</p><p className="font-semibold text-neutral-900">{fmt(ref.right_to_rent_until)}</p></div>}
                        {ref.verified_income_annual  && <div><p className="text-xs text-neutral-400">Verified income</p><p className="font-semibold text-neutral-900">£{Number(ref.verified_income_annual).toLocaleString()}/yr</p></div>}
                        {ref.max_affordable_rent_monthly && <div><p className="text-xs text-neutral-400">Max rent</p><p className="font-semibold text-neutral-900">£{Number(ref.max_affordable_rent_monthly).toLocaleString()}/mo</p></div>}
                        {ref.credit_result           && <div><p className="text-xs text-neutral-400">Credit</p><p className="font-semibold text-neutral-900">{ref.credit_result}</p></div>}
                        {ref.aml_result              && <div><p className="text-xs text-neutral-400">AML</p><p className="font-semibold text-neutral-900">{ref.aml_result}</p></div>}
                        {ref.id_type_1               && <div><p className="text-xs text-neutral-400">ID doc 1</p><p className="font-semibold text-neutral-900">{ref.id_type_1} {ref.id_verified_1 ? '✓' : ''}</p></div>}
                        {ref.id_type_2               && <div><p className="text-xs text-neutral-400">ID doc 2</p><p className="font-semibold text-neutral-900">{ref.id_type_2} {ref.id_verified_2 ? '✓' : ''}</p></div>}
                        {ref.prev_landlord_ref_result && <div><p className="text-xs text-neutral-400">Landlord ref</p><p className="font-semibold text-neutral-900">{ref.prev_landlord_ref_result}{ref.prev_landlord_ref_name ? ` · ${ref.prev_landlord_ref_name}` : ''}</p></div>}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* COMMUNICATIONS                                                */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'communications' && (
          <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
            {communications.length === 0 ? (
              <div className="p-xl text-center text-neutral-400 text-sm">No communications yet</div>
            ) : (
              <div className="divide-y divide-neutral-100 max-h-[600px] overflow-y-auto">
                {communications.map(c => (
                  <div key={c.id} className="px-xl py-lg">
                    <p className="font-semibold text-neutral-900 text-sm">{c.title}</p>
                    <p className="text-xs text-neutral-500 mt-xs line-clamp-2">{c.message}</p>
                    <div className="flex items-center justify-between mt-sm text-xs text-neutral-400">
                      <span>{c.notification_type}</span><span>{fmt(c.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* SAFETY                                                        */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'safety' && (
          <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
            {safetyChecks.length === 0 ? (
              <div className="p-xl text-center text-neutral-400 text-sm">No safety checks yet</div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {safetyChecks.map(c => (
                  <div key={c.id} className="px-xl py-lg">
                    <p className="font-semibold text-neutral-900 text-sm capitalize">{c.check_type}</p>
                    <p className="text-xs text-neutral-500 mt-xs">{c.response}</p>
                    <p className="text-xs text-neutral-400 mt-sm">{fmt(c.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TIMELINE                                                      */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'history' && (
          <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
            <div className="px-xl py-lg border-b border-neutral-100">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Tenancy timeline</p>
            </div>
            <div className="p-xl space-y-lg">
              {tenancies.length === 0 && <p className="text-sm text-neutral-400 text-center py-lg">No tenancy history</p>}
              {tenancies.map((t, i) => (
                <div key={t.id} className="flex gap-lg">
                  <div className="flex flex-col items-center">
                    <div className={`w-3 h-3 rounded-full mt-xs flex-shrink-0 ${!(t as any).notice_received_date && (!t.end_date || t.end_date >= new Date().toISOString().slice(0,10)) ? 'bg-green-500' : 'bg-neutral-300'}`} />
                    {i < tenancies.length - 1 && <div className="w-px flex-1 bg-neutral-200 mt-sm" />}
                  </div>
                  <div className="pb-lg">
                    <p className="text-sm font-semibold text-neutral-900">{t.property?.address || '—'} — {t.room?.name || '—'}</p>
                    <p className="text-xs text-neutral-400 mt-xs">{fmt(t.start_date)} {t.end_date ? `→ ${fmt(t.end_date)}` : '→ present'}</p>
                    {!(t as any).notice_received_date && (!t.end_date || t.end_date >= new Date().toISOString().slice(0,10)) && <span className="mt-sm inline-block text-xs font-semibold px-sm py-xs rounded-full bg-green-100 text-green-800 border border-green-200">Active</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* DOCUMENTS                                                     */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'documents' && (
          <div className="space-y-xl">

            {/* Upload button */}
            {currentTenancy ? (
              <div className="flex justify-end">
                <button
                  onClick={() => setShowDocDrawer(true)}
                  className="rounded-lg bg-neutral-900 px-lg py-sm text-sm font-semibold text-white hover:bg-neutral-800 transition"
                >
                  + Upload document
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-neutral-200 bg-white px-xl py-lg">
                <p className="text-sm text-neutral-400">No active tenancy — documents can be uploaded once a tenancy is created.</p>
              </div>
            )}

            {/* Document list */}
            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
              <div className="px-xl py-lg border-b border-neutral-100 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Tenancy documents</p>
                <span className="text-xs text-neutral-400">{tenancyDocs.length} file{tenancyDocs.length !== 1 ? 's' : ''}</span>
              </div>
              {tenancyDocs.length === 0 ? (
                <div className="px-xl py-lg">
                  <p className="text-sm text-neutral-400">No documents uploaded yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-neutral-100">
                  {tenancyDocs.map((doc: any) => {
                    const typeLabel: Record<string, string> = {
                      tenancy_agreement: 'Tenancy Agreement', right_to_rent: 'Right to Rent',
                      deposit_certificate: 'Deposit Certificate', how_to_rent: 'How to Rent Guide',
                      epc: 'EPC', gas_safety: 'Gas Safety Cert', electrical_cert: 'EICR',
                      inventory: 'Inventory', reference_report: 'Reference Report',
                      id_proof: 'ID Proof', employment_letter: 'Employment Letter', other: 'Other',
                    }
                    return (
                      <button
                        key={doc.id}
                        onClick={() => doc.storage_url && setViewingDoc({ fileName: doc.file_name, storageUrl: doc.storage_url, docType: doc.document_type })}
                        className="w-full px-xl py-md flex items-center justify-between gap-md text-left hover:bg-neutral-50 transition"
                      >
                        <div className="flex items-center gap-md min-w-0">
                          <span className="text-lg shrink-0">📄</span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-neutral-900 truncate">{doc.file_name}</p>
                            <p className="text-xs text-neutral-400">{typeLabel[doc.document_type] ?? doc.document_type} · {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</p>
                          </div>
                        </div>
                        {doc.storage_url && (
                          <span className="text-xs font-semibold text-neutral-500 shrink-0">View →</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* PAYMENTS                                                     */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'payments' && (
          <PaymentsTab tenancies={tenancies} rentIncreases={rentIncreases} paymentRows={paymentRows} rentCharges={rentCharges} />
        )}

      </main>

      {/* Edit tenant details modal */}
      {tenant && (
        <EditPersonModal
          person={tenant as any}
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          onSave={(updated) => {
            setTenant(prev => prev ? { ...prev, ...updated } as TenantCardTenant : prev)
            setIsEditOpen(false)
          }}
        />
      )}

      {showDocDrawer && currentTenancy && (
        <DocUploadDrawer
          title={tenantDisplayName(tenant)}
          subtitle="Upload tenancy document"
          propertyId={currentTenancy.property_id}
          tenancyId={currentTenancy.id}
          onClose={() => setShowDocDrawer(false)}
          onUploaded={async () => {
            const { data } = await supabase
              .from('property_documents')
              .select('*')
              .eq('tenancy_id', currentTenancy.id)
              .order('uploaded_at', { ascending: false })
            setTenancyDocs(data || [])
          }}
        />
      )}

      {viewingDoc && (
        <DocViewDrawer
          title={tenantDisplayName(tenant)}
          subtitle={viewingDoc.docType?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
          fileName={viewingDoc.fileName}
          storageUrl={viewingDoc.storageUrl}
          onClose={() => setViewingDoc(null)}
          onReplace={() => { setViewingDoc(null); setShowDocDrawer(true) }}
        />
      )}
    </div>
  )
}
