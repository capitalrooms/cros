'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import ComplianceInspectionGrid from './ComplianceInspectionGrid'
import { hmoLicenceState } from '@/lib/compliance/hmoLicence'

interface ComplianceTabProps {
  property: any
  onUpdate?: (updates: any) => void
}

interface CertDef {
  label: string
  icon: string
  dateKey: string
  expiryKey: string
  historyType: string
  hideIfNoGas?: boolean
}

const CERT_DEFS: CertDef[] = [
  { label: 'Gas Safety Certificate (CP12)', icon: '🔥', dateKey: 'gas_safe_cert_date', expiryKey: 'gas_safe_cert_expiry', historyType: 'gas_safe', hideIfNoGas: true },
  { label: 'EICR — Electrical Inspection', icon: '⚡', dateKey: 'electrical_cert_date', expiryKey: 'electrical_cert_expiry', historyType: 'eicr' },
  { label: 'PAT — Portable Appliance Testing', icon: '🔌', dateKey: 'pat_test_date', expiryKey: 'pat_test_expiry', historyType: 'pat' },
  { label: 'Fire Detection & Alarm', icon: '🚨', dateKey: 'fire_detection_test_date', expiryKey: 'fire_detection_expiry', historyType: 'fire_detection' },
  { label: 'Emergency Lighting', icon: '💡', dateKey: 'emergency_lighting_test_date', expiryKey: 'emergency_lighting_expiry', historyType: 'emergency_lighting' },
  { label: 'Fire Risk Assessment', icon: '📋', dateKey: 'fire_risk_assessment_date', expiryKey: 'fire_risk_assessment_expiry', historyType: 'fire_risk' },
]

function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diff / 86400000)
}

function certStatus(expiryStr: string | null | undefined): 'expired' | 'soon' | 'ok' | 'missing' {
  if (!expiryStr) return 'missing'
  const days = daysUntil(expiryStr)!
  if (days < 0) return 'expired'
  if (days <= 60) return 'soon'
  return 'ok'
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const STATUS_CLASSES = {
  expired: 'bg-red-50 border-red-200',
  soon: 'bg-amber-50 border-amber-200',
  ok: 'bg-green-50 border-green-200',
  missing: 'bg-neutral-50 border-neutral-200',
}
const STATUS_DOT = {
  expired: 'bg-red-500',
  soon: 'bg-amber-400',
  ok: 'bg-green-500',
  missing: 'bg-neutral-300',
}
const STATUS_TEXT = {
  expired: 'text-red-600',
  soon: 'text-amber-700',
  ok: 'text-green-700',
  missing: 'text-neutral-400',
}

export default function ComplianceTab({ property, onUpdate }: ComplianceTabProps) {
  const supabase = createClient()

  // ── Cert editing ──────────────────────────────────────────────────────────
  const [certEdits, setCertEdits] = useState<Record<string, string>>({})
  const [originalCerts, setOriginalCerts] = useState<Record<string, string>>({})
  const [certSaving, setCertSaving] = useState(false)
  const [certSaved, setCertSaved] = useState(false)
  const [certDirty, setCertDirty] = useState(false)

  // ── Cert history (per cert_type) ──────────────────────────────────────────
  const [historyOpen, setHistoryOpen] = useState<Record<string, boolean>>({})
  const [historyData, setHistoryData] = useState<Record<string, any[]>>({})
  const [historyLoading, setHistoryLoading] = useState<Record<string, boolean>>({})
  const [adminPersonId, setAdminPersonId] = useState<string | null>(null)

  // ── HMO licence ───────────────────────────────────────────────────────────
  const [hmoEdits, setHmoEdits] = useState<Record<string, string>>({})
  const [originalHmo, setOriginalHmo] = useState<Record<string, string>>({})
  const [hmoSaving, setHmoSaving] = useState(false)
  const [hmoSaved, setHmoSaved] = useState(false)
  const [hmoDirty, setHmoDirty] = useState(false)
  const [hmoHistory, setHmoHistory] = useState<any[]>([])
  const [hmoHistoryOpen, setHmoHistoryOpen] = useState(false)

  // ── Insurance ─────────────────────────────────────────────────────────────
  const [insEdits, setInsEdits] = useState<Record<string, string>>({})
  const [insSaving, setInsSaving] = useState(false)
  const [insSaved, setInsSaved] = useState(false)
  const [insDirty, setInsDirty] = useState(false)

  // ── Policies ─────────────────────────────────────────────────────────────
  const [policies, setPolicies] = useState<any[]>([])
  const [policiesAvailable, setPoliciesAvailable] = useState<boolean | null>(null)
  const [addingPolicy, setAddingPolicy] = useState(false)
  const [policyForm, setPolicyForm] = useState({ policy_type: 'appliance', appliance_type: '', provider_name: '', policy_number: '', monthly_cost: '0', renewal_date: '' })
  const [policySaving, setPolicySaving] = useState(false)

  // ── Send certs modal ─────────────────────────────────────────────────────
  const [sendModal, setSendModal] = useState(false)
  const [sendCertTypes, setSendCertTypes] = useState<string[]>([])
  const [sendRecipient, setSendRecipient] = useState<'landlord' | 'tenants' | 'both'>('both')
  const [sendMessage, setSendMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ sent: number; recipients: any[] } | null>(null)

  // ── Export / toast ────────────────────────────────────────────────────────
  const [exporting, setExporting] = useState(false)
  const [toast, setToast] = useState('')
  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }, [])

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const c: Record<string, string> = {}
    CERT_DEFS.forEach(({ dateKey, expiryKey }) => {
      c[dateKey] = property[dateKey] || ''
      c[expiryKey] = property[expiryKey] || ''
    })
    setCertEdits(c)
    setOriginalCerts(c)
    setCertDirty(false)

    const hmo: Record<string, string> = { license_expiry: property.license_expiry || '', license_number: property.license_number || '' }
    // "application made" fields exist once migration 196 has run
    if ('licence_application_submitted_at' in property) {
      hmo.licence_application_submitted_at = property.licence_application_submitted_at || ''
      hmo.licence_application_ref = property.licence_application_ref || ''
    }
    setHmoEdits(hmo)
    setOriginalHmo(hmo)
    setHmoDirty(false)

    setInsEdits({ insurance_expiry: property.insurance_expiry || '', insurance_provider: property.insurance_provider || '' })
    setInsDirty(false)

    loadPolicies()

    // Get admin person ID for history recording
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) {
        supabase.from('people').select('id').eq('email', data.user.email).maybeSingle().then(({ data: p }) => {
          if (p?.id) setAdminPersonId(p.id)
        })
      }
    })
  }, [property.id])

  async function loadPolicies() {
    const res = await fetch(`/api/admin/property-policies?property_id=${property.id}`)
    if (!res.ok) { setPoliciesAvailable(false); return }
    const json = await res.json()
    if (json.error) { setPoliciesAvailable(false); return }
    setPoliciesAvailable(true)
    setPolicies(json.policies || [])
  }

  // ── Cert history ──────────────────────────────────────────────────────────
  async function toggleCertHistory(historyType: string) {
    const next = !historyOpen[historyType]
    setHistoryOpen(prev => ({ ...prev, [historyType]: next }))
    if (next && !historyData[historyType]) {
      setHistoryLoading(prev => ({ ...prev, [historyType]: true }))
      const res = await fetch(`/api/admin/compliance-history?property_id=${property.id}&type=cert&cert_type=${historyType}`)
      const json = res.ok ? await res.json() : { history: [] }
      setHistoryData(prev => ({ ...prev, [historyType]: json.history || [] }))
      setHistoryLoading(prev => ({ ...prev, [historyType]: false }))
    }
  }

  // ── Save certs (writes history for each changed cert) ────────────────────
  async function saveCerts() {
    setCertSaving(true)
    const { error } = await supabase.from('properties').update(certEdits).eq('id', property.id)
    if (error) { showToast('❌ ' + error.message); setCertSaving(false); return }

    // Write history entries for certs where expiry actually changed
    const historyInserts = CERT_DEFS
      .filter(({ expiryKey, dateKey }) => {
        const expiryChanged = certEdits[expiryKey] && certEdits[expiryKey] !== originalCerts[expiryKey]
        const dateChanged = certEdits[dateKey] && certEdits[dateKey] !== originalCerts[dateKey]
        return expiryChanged || dateChanged
      })
      .map(({ historyType, dateKey, expiryKey }) => ({
        property_id: property.id,
        cert_type: historyType,
        issue_date: certEdits[dateKey] || null,
        expiry_date: certEdits[expiryKey] || null,
        recorded_by: adminPersonId || null,
      }))

    if (historyInserts.length > 0) {
      await fetch('/api/admin/compliance-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'cert', property_id: property.id, inserts: historyInserts }),
      })
      // Bust cached history for changed certs
      const bust: Record<string, any[]> = {}
      historyInserts.forEach(h => { bust[h.cert_type] = [] })
      setHistoryData(prev => ({ ...prev, ...bust }))
      setHistoryOpen(prev => {
        const next = { ...prev }
        historyInserts.forEach(h => { next[h.cert_type] = false })
        return next
      })
    }

    onUpdate?.(certEdits)
    setOriginalCerts(certEdits)
    setCertDirty(false)
    setCertSaving(false)
    setCertSaved(true)
    setTimeout(() => setCertSaved(false), 2500)
  }

  // ── Save HMO ─────────────────────────────────────────────────────────────
  async function saveHmo() {
    setHmoSaving(true)
    const edits = { ...hmoEdits }
    // a new licence has arrived (expiry moved later and in the future) → the pending application is finished
    const today = new Date().toISOString().slice(0, 10)
    let cleared = false
    if (edits.licence_application_submitted_at && edits.license_expiry && edits.license_expiry > today && edits.license_expiry > (originalHmo.license_expiry || '')) {
      edits.licence_application_submitted_at = ''
      edits.licence_application_ref = ''
      cleared = true
    }
    const patch = Object.fromEntries(Object.entries(edits).map(([k, v]) => [k, v === '' ? null : v]))
    const { error } = await supabase.from('properties').update(patch).eq('id', property.id)
    if (error) { showToast('❌ ' + error.message); setHmoSaving(false); return }

    // Write history if expiry or number changed
    const expiryChanged = hmoEdits.license_expiry !== originalHmo.license_expiry
    const numberChanged = hmoEdits.license_number !== originalHmo.license_number
    if (expiryChanged || numberChanged) {
      await fetch('/api/admin/compliance-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'hmo',
          property_id: property.id,
          licence_number: hmoEdits.license_number || null,
          expiry_date: hmoEdits.license_expiry || null,
          recorded_by: adminPersonId || null,
        }),
      })
      setHmoHistory([])
      setHmoHistoryOpen(false)
    }

    if (cleared) showToast('New licence recorded — the pending application is closed')
    onUpdate?.(patch)
    setHmoEdits(edits)
    setOriginalHmo(edits)
    setHmoDirty(false)
    setHmoSaving(false)
    setHmoSaved(true)
    setTimeout(() => setHmoSaved(false), 2500)
  }

  async function loadHmoHistory() {
    const res = await fetch(`/api/admin/compliance-history?property_id=${property.id}&type=hmo`)
    const json = res.ok ? await res.json() : { history: [] }
    setHmoHistory(json.history || [])
  }

  async function toggleHmoHistory() {
    const next = !hmoHistoryOpen
    setHmoHistoryOpen(next)
    if (next && hmoHistory.length === 0) await loadHmoHistory()
  }

  // ── Save insurance ────────────────────────────────────────────────────────
  async function saveIns() {
    setInsSaving(true)
    const { error } = await supabase.from('properties').update(insEdits).eq('id', property.id)
    setInsSaving(false)
    if (error) { showToast('❌ ' + error.message); return }
    onUpdate?.(insEdits)
    setInsDirty(false)
    setInsSaved(true)
    setTimeout(() => setInsSaved(false), 2500)
  }

  // ── Add policy ────────────────────────────────────────────────────────────
  async function addPolicy() {
    if (!policyForm.provider_name.trim() || !policyForm.policy_number.trim()) return
    setPolicySaving(true)
    const res = await fetch('/api/admin/property-policies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ property_id: property.id, ...policyForm }),
    })
    const json = await res.json()
    setPolicySaving(false)
    if (!res.ok) { showToast('❌ ' + json.error); return }
    setPolicies(p => [...p, json.policy])
    setAddingPolicy(false)
    setPolicyForm({ policy_type: 'appliance', appliance_type: '', provider_name: '', policy_number: '', monthly_cost: '0', renewal_date: '' })
    showToast('✓ Policy added')
  }

  async function deletePolicy(id: string) {
    if (!confirm('Delete this policy?')) return
    const res = await fetch(`/api/admin/property-policies?id=${id}`, { method: 'DELETE' })
    if (!res.ok) { showToast('❌ Delete failed'); return }
    setPolicies(p => p.filter(x => x.id !== id))
    showToast('✓ Policy removed')
  }

  // ── Send certs ────────────────────────────────────────────────────────────
  function openSendModal() {
    // Pre-select all certs that have an expiry date set
    const preset = CERT_DEFS
      .filter(({ expiryKey, hideIfNoGas }) => {
        if (hideIfNoGas && property.has_gas === false) return false
        return !!certEdits[expiryKey]
      })
      .map(d => d.historyType)
    setSendCertTypes(preset.length ? preset : CERT_DEFS.filter(d => !(d.hideIfNoGas && property.has_gas === false)).map(d => d.historyType))
    setSendRecipient('both')
    setSendMessage('')
    setSendResult(null)
    setSendModal(true)
  }

  async function sendCerts() {
    if (!sendCertTypes.length) return
    setSending(true)
    try {
      const res = await fetch('/api/admin/send-certs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: property.id, cert_types: sendCertTypes, recipient_type: sendRecipient, custom_message: sendMessage }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Send failed')
      setSendResult({ sent: json.sent, recipients: json.recipients })
    } catch (e: any) {
      showToast('❌ ' + e.message)
    } finally {
      setSending(false)
    }
  }

  // ── HMO export ────────────────────────────────────────────────────────────
  async function exportLog() {
    setExporting(true)
    try {
      const res = await fetch('/api/export/compliance-log-pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ property_id: property.id }) })
      if (!res.ok) throw new Error('Export failed')
      const html = await res.text()
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
      Object.assign(document.createElement('a'), { href: url, target: '_blank' }).click()
      URL.revokeObjectURL(url)
    } catch { showToast('❌ Export failed') }
    setExporting(false)
  }

  const totalMonthly = policies.reduce((s, p) => s + (p.monthly_cost || 0), 0)
  const isHmo = property.property_type === 'hmo'

  return (
    <div className="space-y-2xl p-lg">

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-neutral-900 px-lg py-md text-sm font-semibold text-white shadow-xl">
          {toast}
        </div>
      )}

      {/* HMO export */}
      {isHmo && (
        <button onClick={exportLog} disabled={exporting} className="w-full rounded-xl bg-neutral-900 px-lg py-md text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50 transition flex items-center justify-center gap-sm">
          {exporting ? '⏳ Generating…' : '📋 Export HMO Compliance Log PDF'}
        </button>
      )}

      {/* ── Certificates ─────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-md">
          <div>
            <h3 className="text-sm font-bold text-neutral-900">Compliance Certificates</h3>
            <p className="text-xs text-neutral-500 mt-xs">Enter the issue date and the expiry / next-due date for each cert. Saving records a history entry automatically.</p>
          </div>
          <div className="flex items-center gap-sm shrink-0">
            {certSaved && !certDirty && <span className="text-sm font-semibold text-green-600">✓ Saved</span>}
            <button onClick={openSendModal} className="rounded-xl border border-neutral-300 bg-white px-md py-sm text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition">
              📨 Send
            </button>
            {certDirty && (
              <button onClick={saveCerts} disabled={certSaving} className="rounded-xl bg-neutral-900 px-lg py-sm text-sm font-bold text-white hover:bg-neutral-700 disabled:opacity-50 transition">
                {certSaving ? 'Saving…' : 'Save certs'}
              </button>
            )}
          </div>
        </div>

        <div className="space-y-sm">
          {CERT_DEFS.map(({ label, icon, dateKey, expiryKey, historyType, hideIfNoGas }) => {
            if (hideIfNoGas && property.has_gas === false) return null
            const status = certStatus(certEdits[expiryKey])
            const days = certEdits[expiryKey] ? daysUntil(certEdits[expiryKey]) : null
            const histOpen = historyOpen[historyType]
            const hist = historyData[historyType] || []
            const histLoading = historyLoading[historyType]
            return (
              <div key={expiryKey} className={`rounded-xl border transition ${STATUS_CLASSES[status]}`}>
                <div className="p-md">
                  <div className="flex items-center gap-sm mb-sm">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
                    <span className="text-xs font-semibold text-neutral-700 flex-1">{icon} {label}</span>
                    {days !== null && (
                      <span className={`text-xs font-semibold ${STATUS_TEXT[status]}`}>
                        {days < 0 ? `Expired ${Math.abs(days)}d ago` : days === 0 ? 'Expires today' : `${days}d remaining`}
                      </span>
                    )}
                    {status === 'missing' && <span className="text-xs text-neutral-400">Not set</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-sm">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-xs">Issue / Test date</p>
                      <input
                        type="date"
                        value={certEdits[dateKey] || ''}
                        onChange={e => { setCertEdits(prev => ({ ...prev, [dateKey]: e.target.value })); setCertDirty(true) }}
                        className="w-full rounded-lg border border-neutral-200 bg-white px-sm py-xs text-xs text-neutral-900 focus:outline-none focus:border-neutral-900"
                      />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-xs">Expiry / Next due</p>
                      <input
                        type="date"
                        value={certEdits[expiryKey] || ''}
                        onChange={e => { setCertEdits(prev => ({ ...prev, [expiryKey]: e.target.value })); setCertDirty(true) }}
                        className="w-full rounded-lg border border-neutral-200 bg-white px-sm py-xs text-xs text-neutral-900 focus:outline-none focus:border-neutral-900"
                      />
                    </div>
                  </div>
                </div>
                {/* History toggle */}
                <button
                  onClick={() => toggleCertHistory(historyType)}
                  className="w-full flex items-center gap-xs px-md py-xs border-t border-black/5 text-[10px] font-semibold text-neutral-400 hover:text-neutral-600 transition"
                >
                  <span>{histOpen ? '▲' : '▼'}</span>
                  <span>History</span>
                  {histOpen && hist.length > 0 && <span className="ml-auto text-neutral-300">{hist.length} record{hist.length !== 1 ? 's' : ''}</span>}
                </button>
                {histOpen && (
                  <div className="px-md pb-md pt-xs">
                    {histLoading && <p className="text-xs text-neutral-400">Loading…</p>}
                    {!histLoading && hist.length === 0 && (
                      <p className="text-xs text-neutral-400">No history yet — saved changes will appear here.</p>
                    )}
                    {!histLoading && hist.length > 0 && (
                      <div className="space-y-xs">
                        {hist.map((h: any, i: number) => (
                          <div key={i} className="flex items-start gap-md text-xs">
                            <div className="flex-1 min-w-0">
                              <span className="font-semibold text-neutral-700">
                                {fmtDate(h.issue_date)} → {fmtDate(h.expiry_date)}
                              </span>
                              {h.notes && <span className="text-neutral-400 ml-sm">{h.notes}</span>}
                            </div>
                            <div className="text-right text-neutral-400 shrink-0">
                              <p>{new Date(h.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                              {h.recorded_by_person && (
                                <p>{h.recorded_by_person.first_name} {h.recorded_by_person.last_name}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* ── HMO Licence ──────────────────────────────────────────────────── */}
      {isHmo && (
        <section className="border-t border-neutral-100 pt-xl">
          <div className="flex items-center justify-between mb-md">
            <h3 className="text-sm font-bold text-neutral-900">🏛️ HMO Licence</h3>
            <div className="flex items-center gap-sm">
              <a href={`/admin/properties/${property.id}/hmo-notice`} className="rounded-xl border border-neutral-300 px-md py-sm text-sm font-semibold text-neutral-900 hover:border-neutral-900 transition">Application notice</a>
              {hmoSaved && !hmoDirty && <span className="text-sm font-semibold text-green-600">✓ Saved</span>}
              {hmoDirty && (
                <button onClick={saveHmo} disabled={hmoSaving} className="rounded-xl bg-neutral-900 px-lg py-sm text-sm font-bold text-white hover:bg-neutral-700 disabled:opacity-50 transition">
                  {hmoSaving ? 'Saving…' : 'Save'}
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-sm mb-sm">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-xs">Licence number</p>
              <input type="text" value={hmoEdits.license_number || ''} onChange={e => { setHmoEdits(prev => ({ ...prev, license_number: e.target.value })); setHmoDirty(true) }} placeholder="HMO/2024/001234" className="w-full rounded-xl border border-neutral-200 bg-white px-md py-sm text-sm text-neutral-900 focus:outline-none focus:border-neutral-900" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-xs">Expiry date</p>
              <input type="date" value={hmoEdits.license_expiry || ''} onChange={e => { setHmoEdits(prev => ({ ...prev, license_expiry: e.target.value })); setHmoDirty(true) }} className="w-full rounded-xl border border-neutral-200 bg-white px-md py-sm text-sm text-neutral-900 focus:outline-none focus:border-neutral-900" />
            </div>
          </div>
          {'licence_application_submitted_at' in hmoEdits ? (
            <div className="mb-sm rounded-xl border border-neutral-200 bg-neutral-50 px-md py-sm">
              <label className="flex items-center gap-sm text-sm font-semibold text-neutral-900">
                <input type="checkbox" checked={!!hmoEdits.licence_application_submitted_at}
                  onChange={e => { setHmoEdits(prev => ({ ...prev, licence_application_submitted_at: e.target.checked ? new Date().toISOString().slice(0, 10) : '', licence_application_ref: e.target.checked ? prev.licence_application_ref : '' })); setHmoDirty(true) }} />
                Application made to the council — waiting for the licence
              </label>
              {hmoEdits.licence_application_submitted_at && (
                <div className="mt-sm grid grid-cols-2 gap-sm">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-xs">Date submitted</p>
                    <input type="date" value={hmoEdits.licence_application_submitted_at} onChange={e => { setHmoEdits(prev => ({ ...prev, licence_application_submitted_at: e.target.value })); setHmoDirty(true) }} className="w-full rounded-xl border border-neutral-200 bg-white px-md py-sm text-sm text-neutral-900 focus:outline-none focus:border-neutral-900" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-xs">Council reference</p>
                    <input type="text" value={hmoEdits.licence_application_ref || ''} onChange={e => { setHmoEdits(prev => ({ ...prev, licence_application_ref: e.target.value })); setHmoDirty(true) }} placeholder="Optional" className="w-full rounded-xl border border-neutral-200 bg-white px-md py-sm text-sm text-neutral-900 focus:outline-none focus:border-neutral-900" />
                  </div>
                  <p className="col-span-2 text-xs text-neutral-500">When the new licence arrives, enter its number and expiry date — this clears automatically.</p>
                </div>
              )}
            </div>
          ) : (
            <p className="mb-sm text-xs text-neutral-400">“Application made” tick box appears once migration 196 has been run.</p>
          )}
          {(hmoEdits.license_expiry || hmoEdits.licence_application_submitted_at) && (() => {
            const st = hmoLicenceState(hmoEdits)
            const cls = st.state === 'applied' ? 'text-blue-700' : st.state === 'expired' ? 'text-red-600' : st.state === 'soon' ? 'text-amber-600' : 'text-green-600'
            return (
              <p className={`text-xs font-semibold mb-sm ${cls}`}>
                {st.state === 'applied' ? '⏳ ' : st.state === 'valid' ? '✓ ' : '⚠️ '}{st.state === 'applied' ? st.label : `Licence ${st.label.toLowerCase()}`}
                {st.appliedLate && <span className="block font-normal text-amber-700">The application was made after the old licence expired — the property wasn’t covered between those dates.</span>}
              </p>
            )
          })()}
          {/* HMO history */}
          <button onClick={toggleHmoHistory} className="flex items-center gap-xs text-[10px] font-semibold text-neutral-400 hover:text-neutral-600 transition">
            <span>{hmoHistoryOpen ? '▲' : '▼'}</span> Licence history
          </button>
          {hmoHistoryOpen && (
            <div className="mt-sm space-y-xs">
              {hmoHistory.length === 0 && <p className="text-xs text-neutral-400">No history yet.</p>}
              {hmoHistory.map((h: any, i: number) => (
                <div key={i} className="flex items-start gap-md text-xs">
                  <div className="flex-1 min-w-0">
                    {h.licence_number && <span className="font-semibold text-neutral-700">{h.licence_number} · </span>}
                    <span className="text-neutral-600">Expires {fmtDate(h.expiry_date)}</span>
                  </div>
                  <div className="text-right text-neutral-400 shrink-0">
                    <p>{new Date(h.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    {h.recorded_by_person && <p>{h.recorded_by_person.first_name} {h.recorded_by_person.last_name}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Insurance ─────────────────────────────────────────────────────── */}
      <section className="border-t border-neutral-100 pt-xl">
        <div className="flex items-center justify-between mb-md">
          <h3 className="text-sm font-bold text-neutral-900">🛡️ Building Insurance</h3>
          <div className="flex items-center gap-sm">
            {insSaved && !insDirty && <span className="text-sm font-semibold text-green-600">✓ Saved</span>}
            {insDirty && (
              <button onClick={saveIns} disabled={insSaving} className="rounded-xl bg-neutral-900 px-lg py-sm text-sm font-bold text-white hover:bg-neutral-700 disabled:opacity-50 transition">
                {insSaving ? 'Saving…' : 'Save'}
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-sm">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-xs">Insurance provider</p>
            <input type="text" value={insEdits.insurance_provider || ''} onChange={e => { setInsEdits(prev => ({ ...prev, insurance_provider: e.target.value })); setInsDirty(true) }} placeholder="e.g. Aviva, Direct Line" className="w-full rounded-xl border border-neutral-200 bg-white px-md py-sm text-sm text-neutral-900 focus:outline-none focus:border-neutral-900" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-xs">Renewal date</p>
            <input type="date" value={insEdits.insurance_expiry || ''} onChange={e => { setInsEdits(prev => ({ ...prev, insurance_expiry: e.target.value })); setInsDirty(true) }} className="w-full rounded-xl border border-neutral-200 bg-white px-md py-sm text-sm text-neutral-900 focus:outline-none focus:border-neutral-900" />
          </div>
        </div>
      </section>

      {/* ── Policies & Warranties ─────────────────────────────────────────── */}
      <section className="border-t border-neutral-100 pt-xl">
        <div className="flex items-center justify-between mb-md">
          <div>
            <h3 className="text-sm font-bold text-neutral-900">💰 Policies & Warranties</h3>
            {policies.length > 0 && (
              <p className="text-xs text-neutral-500 mt-xs">Total: £{totalMonthly.toFixed(2)}/month across {policies.length} {policies.length === 1 ? 'policy' : 'policies'}</p>
            )}
          </div>
          {policiesAvailable && (
            <button onClick={() => setAddingPolicy(true)} className="rounded-xl border border-neutral-300 bg-white px-md py-sm text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition">
              + Add policy
            </button>
          )}
        </div>

        {policiesAvailable === false && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-md py-sm">
            <p className="text-xs font-semibold text-amber-800">⚠️ Policy tracking requires migration 053 — run it in Supabase SQL Editor to enable this section.</p>
          </div>
        )}

        {policiesAvailable && (
          <>
            {policies.length === 0 && !addingPolicy && (
              <div className="rounded-xl border border-dashed border-neutral-200 p-lg text-center">
                <p className="text-sm text-neutral-400">No policies recorded — boiler cover, building insurance, appliance warranties, etc.</p>
                <button onClick={() => setAddingPolicy(true)} className="mt-sm text-xs font-semibold text-neutral-600 underline hover:text-neutral-900">Add first policy</button>
              </div>
            )}
            <div className="space-y-sm">
              {policies.map(p => (
                <div key={p.id} className="rounded-xl border border-neutral-200 bg-white px-md py-sm flex items-start gap-md">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-sm">
                      <p className="text-sm font-semibold text-neutral-900">{p.appliance_type || (p.policy_type === 'building' ? 'Building Insurance' : p.policy_type === 'liability' ? 'Liability Insurance' : 'Policy')}</p>
                      <span className="text-xs px-xs py-xs bg-neutral-100 text-neutral-500 rounded">{p.policy_type}</span>
                    </div>
                    <p className="text-xs text-neutral-500 mt-xs">{p.provider_name} · #{p.policy_number}</p>
                    <div className="flex gap-md mt-xs text-xs text-neutral-500">
                      <span>£{Number(p.monthly_cost || 0).toFixed(2)}/mo</span>
                      {p.renewal_date && <span className={certStatus(p.renewal_date) === 'expired' ? 'text-red-600' : certStatus(p.renewal_date) === 'soon' ? 'text-amber-600' : 'text-green-600'}>Renews {fmtDate(p.renewal_date)}</span>}
                    </div>
                  </div>
                  <button onClick={() => deletePolicy(p.id)} className="text-xs text-neutral-300 hover:text-red-500 font-bold shrink-0">✕</button>
                </div>
              ))}
            </div>
          </>
        )}

        {addingPolicy && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-lg">
            <div className="bg-white rounded-2xl shadow-2xl p-xl max-w-sm w-full space-y-md">
              <h3 className="text-base font-bold text-neutral-900">Add Policy</h3>
              <div>
                <label className="text-xs font-semibold text-neutral-500 block mb-xs">Type</label>
                <select value={policyForm.policy_type} onChange={e => setPolicyForm(f => ({ ...f, policy_type: e.target.value }))} className="w-full rounded-xl border border-neutral-200 px-md py-sm text-sm">
                  <option value="appliance">Appliance / Boiler cover</option>
                  <option value="building">Building Insurance</option>
                  <option value="liability">Liability Insurance</option>
                </select>
              </div>
              {policyForm.policy_type === 'appliance' && (
                <div>
                  <label className="text-xs font-semibold text-neutral-500 block mb-xs">What does it cover?</label>
                  <input value={policyForm.appliance_type} onChange={e => setPolicyForm(f => ({ ...f, appliance_type: e.target.value }))} placeholder="e.g. Boiler, White goods" className="w-full rounded-xl border border-neutral-200 px-md py-sm text-sm" />
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-neutral-500 block mb-xs">Provider *</label>
                <input autoFocus value={policyForm.provider_name} onChange={e => setPolicyForm(f => ({ ...f, provider_name: e.target.value }))} placeholder="e.g. British Gas" className="w-full rounded-xl border border-neutral-200 px-md py-sm text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-neutral-500 block mb-xs">Policy number *</label>
                <input value={policyForm.policy_number} onChange={e => setPolicyForm(f => ({ ...f, policy_number: e.target.value }))} placeholder="e.g. BG-123456" className="w-full rounded-xl border border-neutral-200 px-md py-sm text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-sm">
                <div>
                  <label className="text-xs font-semibold text-neutral-500 block mb-xs">Monthly cost (£)</label>
                  <input type="number" step="0.01" value={policyForm.monthly_cost} onChange={e => setPolicyForm(f => ({ ...f, monthly_cost: e.target.value }))} className="w-full rounded-xl border border-neutral-200 px-md py-sm text-sm" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-neutral-500 block mb-xs">Renewal date</label>
                  <input type="date" value={policyForm.renewal_date} onChange={e => setPolicyForm(f => ({ ...f, renewal_date: e.target.value }))} className="w-full rounded-xl border border-neutral-200 px-md py-sm text-sm" />
                </div>
              </div>
              <div className="flex gap-sm pt-sm">
                <button onClick={() => setAddingPolicy(false)} className="flex-1 rounded-xl border border-neutral-200 px-md py-sm text-sm font-semibold text-neutral-600 hover:bg-neutral-50">Cancel</button>
                <button onClick={addPolicy} disabled={policySaving || !policyForm.provider_name.trim() || !policyForm.policy_number.trim()} className="flex-1 rounded-xl bg-neutral-900 px-md py-sm text-sm font-bold text-white hover:bg-neutral-700 disabled:opacity-50 transition">
                  {policySaving ? 'Saving…' : 'Add policy'}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── Inspection grid ───────────────────────────────────────────────── */}
      <section className="border-t border-neutral-100 pt-xl">
        <ComplianceInspectionGrid propertyId={property.id} />
      </section>

      {/* ── Send Certificates modal ───────────────────────────────────────── */}
      {sendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-lg">
          <div className="bg-white rounded-2xl shadow-2xl p-xl max-w-md w-full space-y-md max-h-[90vh] overflow-y-auto">
            {sendResult ? (
              <>
                <div className="text-center py-md">
                  <p className="text-3xl mb-sm">✅</p>
                  <h3 className="text-base font-bold text-neutral-900">Sent to {sendResult.sent} recipient{sendResult.sent !== 1 ? 's' : ''}</h3>
                </div>
                <div className="space-y-xs">
                  {sendResult.recipients.map((r: any, i: number) => (
                    <div key={i} className="flex items-center gap-sm rounded-xl border border-neutral-100 bg-neutral-50 px-md py-sm">
                      <span className="text-xs">{r.type === 'landlord' ? '🏠' : '🏡'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-neutral-900">{r.name}</p>
                        <p className="text-xs text-neutral-500">{r.email}</p>
                      </div>
                      <span className="text-xs font-semibold text-neutral-400 capitalize">{r.type}</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => setSendModal(false)} className="w-full rounded-xl bg-neutral-900 px-lg py-md text-sm font-bold text-white hover:bg-neutral-700 transition">Done</button>
              </>
            ) : (
              <>
                <h3 className="text-base font-bold text-neutral-900">📨 Send Compliance Certificates</h3>
                <p className="text-xs text-neutral-500">Select which certificates to include and who should receive the email.</p>

                {/* Cert selection */}
                <div>
                  <p className="text-xs font-semibold text-neutral-500 mb-sm uppercase tracking-wider">Certificates to include</p>
                  <div className="space-y-xs">
                    {CERT_DEFS.filter(d => !(d.hideIfNoGas && property.has_gas === false)).map(({ label, icon, historyType, expiryKey }) => {
                      const hasData = !!certEdits[expiryKey]
                      const checked = sendCertTypes.includes(historyType)
                      return (
                        <label key={historyType} className={`flex items-center gap-sm rounded-xl border px-md py-sm cursor-pointer transition ${checked ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 bg-white'}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={e => setSendCertTypes(prev => e.target.checked ? [...prev, historyType] : prev.filter(t => t !== historyType))}
                            className="rounded"
                          />
                          <span className="text-sm flex-1">{icon} {label}</span>
                          {!hasData && <span className="text-xs text-neutral-400">No date set</span>}
                        </label>
                      )
                    })}
                  </div>
                </div>

                {/* Recipients */}
                <div>
                  <p className="text-xs font-semibold text-neutral-500 mb-sm uppercase tracking-wider">Send to</p>
                  <div className="flex gap-sm">
                    {(['landlord', 'tenants', 'both'] as const).map(r => (
                      <button
                        key={r}
                        onClick={() => setSendRecipient(r)}
                        className={`flex-1 rounded-xl border py-sm text-sm font-semibold transition capitalize ${sendRecipient === r ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'}`}
                      >
                        {r === 'both' ? 'Both' : r === 'landlord' ? '🏠 Landlord' : '🏡 Tenants'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Optional message */}
                <div>
                  <p className="text-xs font-semibold text-neutral-500 mb-xs uppercase tracking-wider">Personal message (optional)</p>
                  <textarea
                    value={sendMessage}
                    onChange={e => setSendMessage(e.target.value)}
                    rows={3}
                    placeholder="Add a personal note to the email — e.g. 'Following our recent inspection, please find the updated compliance records below.'"
                    className="w-full rounded-xl border border-neutral-200 px-md py-sm text-sm resize-none focus:outline-none focus:border-neutral-900"
                  />
                </div>

                <div className="flex gap-sm pt-sm">
                  <button onClick={() => setSendModal(false)} className="flex-1 rounded-xl border border-neutral-200 px-md py-sm text-sm font-semibold text-neutral-600 hover:bg-neutral-50">Cancel</button>
                  <button
                    onClick={sendCerts}
                    disabled={sending || sendCertTypes.length === 0}
                    className="flex-1 rounded-xl bg-neutral-900 px-md py-sm text-sm font-bold text-white hover:bg-neutral-700 disabled:opacity-50 transition"
                  >
                    {sending ? 'Sending…' : `Send ${sendCertTypes.length} cert${sendCertTypes.length !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
