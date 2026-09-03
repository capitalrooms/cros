'use client'

import { useEffect, useState } from 'react'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import LandlordCard, { fromOnboarding } from '@/app/components/LandlordCard'

// ── Stage definitions ──────────────────────────────────────────────────────────

const STAGES = [
  { n: 1, label: 'New Enquiry',         sub: 'Welcome pack not sent',              type: 'action', colour: 'amber' },
  { n: 2, label: 'Welcome Pack Sent',   sub: 'Documents awaiting',                 type: 'passive', colour: 'blue' },
  { n: 3, label: 'Docs Received',       sub: 'Awaiting verification',              type: 'action', colour: 'amber' },
  { n: 4, label: 'Verified',            sub: 'Approval email sent',                type: 'action', colour: 'amber' },
  { n: 5, label: 'Agreement Sent',      sub: 'Awaiting signature (Adobe Sign)',    type: 'passive', colour: 'blue' },
  { n: 6, label: 'Fully Onboarded',     sub: 'Complete',                           type: 'complete', colour: 'green' },
] as const

const VERIFICATION_CHECKS = [
  { key: 'id_genuine',       label: 'ID document is genuine and legible' },
  { key: 'id_matches_name',  label: 'ID matches the name provided' },
  { key: 'poa_dated',        label: 'Proof of address dated within 3 months' },
  { key: 'ownership_match',  label: 'Proof of ownership matches the property' },
  { key: 'sanctions_check',  label: 'Sanctions list check completed — no match' },
  { key: 'pep_check',        label: 'PEP check completed — no flag' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function stageStyle(type: 'action' | 'passive' | 'complete') {
  if (type === 'action')   return 'bg-amber-50 border-amber-200 text-amber-700'
  if (type === 'passive')  return 'bg-blue-50 border-blue-200 text-blue-700'
  return 'bg-green-50 border-green-200 text-green-700'
}

function stageDot(type: 'action' | 'passive' | 'complete') {
  if (type === 'action')  return 'bg-amber-400'
  if (type === 'passive') return 'bg-blue-400'
  return 'bg-green-500'
}

function fmt(iso?: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const BASE_URL = typeof window !== 'undefined' ? window.location.origin : 'https://cros-sigma.vercel.app'

// ── Main component ─────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [advancing, setAdvancing] = useState(false)

  // Add modal state
  const [addName, setAddName] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [addPhone, setAddPhone] = useState('')
  const [addSending, setAddSending] = useState(false)
  const [addResult, setAddResult] = useState<{ ok: boolean; msg: string } | null>(null)

  // Detail panel state
  const [verifyNotes, setVerifyNotes] = useState('')
  const [verifyChecks, setVerifyChecks] = useState<string[]>([])
  const [savedNotes, setSavedNotes] = useState(false)

  async function load() {
    setLoading(true)
    const r = await fetch('/api/landlord-onboarding')
    const d = await r.json()
    setRows(d.rows ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Sync detail panel when row selected
  useEffect(() => {
    if (selected) {
      setVerifyNotes(selected.verification_notes ?? '')
      setVerifyChecks(selected.verification_checks ?? [])
    }
  }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAdd() {
    if (!addName.trim() || !addEmail.trim()) return
    setAddSending(true)
    setAddResult(null)
    const r = await fetch('/api/landlord-onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: addName, email: addEmail, phone: addPhone }),
    })
    const d = await r.json()
    if (!r.ok) {
      setAddResult({ ok: false, msg: d.error ?? 'Failed' })
    } else {
      setAddResult({ ok: true, msg: d.emailSent ? `Welcome pack sent to ${addEmail}` : 'Record created (email failed — check Resend config)' })
      setAddName(''); setAddEmail(''); setAddPhone('')
      load()
    }
    setAddSending(false)
  }

  async function advanceStage(id: string, newStage: number, extraFields?: Record<string, unknown>) {
    setAdvancing(true)
    const r = await fetch(`/api/landlord-onboarding/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: newStage, ...extraFields }),
    })
    const d = await r.json()
    if (r.ok) {
      setSelected(d.row)
      setRows(prev => prev.map(row => row.id === id ? d.row : row))
    }
    setAdvancing(false)
  }

  async function saveNotes() {
    if (!selected) return
    await fetch(`/api/landlord-onboarding/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verification_notes: verifyNotes, verification_checks: verifyChecks }),
    })
    setSavedNotes(true)
    setTimeout(() => setSavedNotes(false), 2500)
    setRows(prev => prev.map(row => row.id === selected.id
      ? { ...row, verification_notes: verifyNotes, verification_checks: verifyChecks }
      : row
    ))
  }

  // Group rows by stage
  const byStage = STAGES.map(s => ({
    ...s,
    items: rows.filter(r => r.stage === s.n),
  }))

  const inp = 'w-full rounded-xl border border-neutral-200 bg-white px-md py-sm text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900'

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/new-business" />} />

      <main className="mx-auto max-w-6xl px-lg py-lg">
        {/* Title row */}
        <div className="flex items-center justify-between mb-xl">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">🔐 Landlord Onboarding</h1>
            <p className="text-sm text-neutral-500 mt-xs">AML pipeline — track each landlord from enquiry to fully onboarded.</p>
          </div>
          <button
            onClick={() => { setShowAdd(true); setAddResult(null) }}
            className="rounded-xl bg-neutral-900 text-white px-lg py-sm text-sm font-semibold hover:bg-neutral-700 transition"
          >
            + Add landlord
          </button>
        </div>

        {/* Add modal */}
        {showAdd && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-lg">
            <div className="bg-white rounded-2xl p-xl w-full max-w-md shadow-xl">
              <h2 className="text-base font-bold text-neutral-900 mb-lg">Add New Landlord Enquiry</h2>

              {addResult ? (
                <div className={`rounded-xl p-md mb-lg text-sm ${addResult.ok ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                  {addResult.ok ? '✓ ' : '⚠ '}{addResult.msg}
                </div>
              ) : null}

              <div className="space-y-md">
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs">Full name *</label>
                  <input value={addName} onChange={e => setAddName(e.target.value)} className={inp} placeholder="e.g. James Smith" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs">Email *</label>
                  <input type="email" value={addEmail} onChange={e => setAddEmail(e.target.value)} className={inp} placeholder="james@example.com" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs">Phone</label>
                  <input type="tel" value={addPhone} onChange={e => setAddPhone(e.target.value)} className={inp} placeholder="07700 900000" />
                </div>
              </div>

              <p className="text-xs text-neutral-400 mt-md">A welcome pack email with the AML form link will be sent automatically.</p>

              <div className="flex gap-md mt-lg">
                <button onClick={() => { setShowAdd(false); setAddResult(null) }} className="flex-1 rounded-xl border border-neutral-200 py-sm text-sm font-semibold text-neutral-600 hover:bg-neutral-50 transition">
                  {addResult?.ok ? 'Close' : 'Cancel'}
                </button>
                {!addResult?.ok && (
                  <button
                    onClick={handleAdd}
                    disabled={addSending || !addName.trim() || !addEmail.trim()}
                    className="flex-1 rounded-xl bg-neutral-900 text-white py-sm text-sm font-semibold hover:bg-neutral-700 transition disabled:opacity-40"
                  >
                    {addSending ? 'Sending…' : 'Add & Send Welcome Pack'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-lg items-start">
          {/* Pipeline list */}
          <div className={`flex-1 space-y-md transition-all ${selected ? 'max-w-xl' : ''}`}>
            {loading ? (
              <p className="text-sm text-neutral-400 py-xl text-center">Loading pipeline…</p>
            ) : rows.length === 0 ? (
              <div className="bg-white rounded-2xl border border-neutral-200 p-2xl text-center">
                <p className="text-neutral-400 text-sm">No landlords in the pipeline yet.</p>
                <button onClick={() => setShowAdd(true)} className="mt-md text-sm font-semibold text-neutral-700 underline">Add the first one</button>
              </div>
            ) : (
              byStage.map(stage => {
                if (stage.items.length === 0) {
                  // Collapsed empty stage
                  return (
                    <div key={stage.n} className={`flex items-center gap-sm px-md py-xs rounded-xl border ${stageStyle(stage.type)} opacity-40`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${stageDot(stage.type)}`} />
                      <span className="text-xs font-semibold">{stage.label}</span>
                      <span className="text-xs opacity-60">— empty</span>
                    </div>
                  )
                }
                return (
                  <div key={stage.n}>
                    <div className={`flex items-center gap-sm px-md py-xs rounded-xl border mb-sm ${stageStyle(stage.type)}`}>
                      <div className={`w-2 h-2 rounded-full ${stageDot(stage.type)}`} />
                      <span className="text-xs font-bold">{stage.label}</span>
                      <span className="text-xs opacity-70">— {stage.sub}</span>
                      <span className="ml-auto text-xs font-bold">{stage.items.length}</span>
                    </div>
                    <div className="space-y-sm">
                      {stage.items.map(row => (
                        <button
                          key={row.id}
                          onClick={() => setSelected(selected?.id === row.id ? null : row)}
                          className={`w-full text-left bg-white rounded-xl border-2 p-md transition-all ${selected?.id === row.id ? 'border-neutral-900' : 'border-neutral-200 hover:border-neutral-300'}`}
                        >
                          <div className="flex items-start justify-between gap-md">
                            <div>
                              <p className="text-sm font-semibold text-neutral-900">{row.name}</p>
                              <p className="text-xs text-neutral-500 mt-xs">{row.email}{row.phone ? ` · ${row.phone}` : ''}</p>
                            </div>
                            <div className="text-right shrink-0">
                              {row.welcome_sent_at && <p className="text-xs text-neutral-400">Pack sent {fmt(row.welcome_sent_at)}</p>}
                              {row.docs_received_at && <p className="text-xs text-neutral-400">Docs {fmt(row.docs_received_at)}</p>}
                              {row.verified_at && <p className="text-xs text-green-600 font-medium">Verified {fmt(row.verified_at)}</p>}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Detail panel */}
          {selected && (
            <div className="w-96 shrink-0 bg-white rounded-2xl border border-neutral-200 p-lg sticky top-24 space-y-lg max-h-[calc(100vh-8rem)] overflow-y-auto">
              <div className="flex items-start justify-between mb-sm">
                <span />
                <button onClick={() => setSelected(null)} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none">×</button>
              </div>

              {/* Landlord identity card */}
              <LandlordCard
                data={fromOnboarding(selected)}
                actions={
                  selected.landlord_people_id ? (
                    <a href={`/admin/landlord/${selected.landlord_people_id}`}
                      className="text-xs font-semibold text-blue-600 hover:underline whitespace-nowrap">
                      Full profile →
                    </a>
                  ) : undefined
                }
              />

              {/* AML form link */}
              <div>
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs">AML Form Link</p>
                <div className="flex items-center gap-sm">
                  <p className="text-xs text-neutral-600 bg-neutral-50 border border-neutral-200 rounded-lg px-sm py-xs flex-1 break-all">
                    {BASE_URL}/landlord/onboard/{selected.token}
                  </p>
                  <button
                    onClick={() => navigator.clipboard.writeText(`${BASE_URL}/landlord/onboard/${selected.token}`)}
                    className="text-xs font-semibold bg-neutral-900 text-white px-sm py-xs rounded-lg hover:bg-neutral-700 transition shrink-0"
                  >
                    Copy
                  </button>
                </div>
              </div>

              {/* Timeline */}
              <div>
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Timeline</p>
                <div className="space-y-xs text-xs text-neutral-500">
                  {selected.created_at && <p>📌 Enquiry added · {fmt(selected.created_at)}</p>}
                  {selected.welcome_sent_at && <p>✉️ Welcome pack sent · {fmt(selected.welcome_sent_at)}</p>}
                  {selected.docs_received_at && <p>📂 Docs received · {fmt(selected.docs_received_at)}</p>}
                  {selected.verified_at && <p>✅ Verified · {fmt(selected.verified_at)}</p>}
                  {selected.approval_sent_at && <p>📧 Approval email sent · {fmt(selected.approval_sent_at)}</p>}
                  {selected.agreement_sent_at && <p>✍️ Agreement sent · {fmt(selected.agreement_sent_at)}</p>}
                  {selected.onboarded_at && <p>🎉 Onboarded · {fmt(selected.onboarded_at)}</p>}
                </div>
              </div>

              {/* Submitted form data */}
              {selected.entity_type && (
                <div>
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Form Submission</p>
                  <div className="text-xs text-neutral-600 space-y-xs bg-neutral-50 rounded-xl border border-neutral-100 p-sm">
                    <p><strong>Type:</strong> {selected.entity_type === 'individual' ? 'Individual' : 'Company'}</p>
                    <p><strong>Properties:</strong> {selected.property_count === 'single' ? 'Single property' : 'Multiple properties'}</p>
                    {selected.form_data?.property_address && <p><strong>Property:</strong> {selected.form_data.property_address}</p>}
                    {selected.form_data?.company_name && <p><strong>Company:</strong> {selected.form_data.company_name} ({selected.form_data.company_reg})</p>}
                    {selected.form_data?.first_name && <p><strong>Name:</strong> {selected.form_data.first_name} {selected.form_data.last_name}</p>}
                    {selected.form_data?.nationality && <p><strong>Nationality:</strong> {selected.form_data.nationality}</p>}
                    {selected.form_data?.dob && <p><strong>DOB:</strong> {selected.form_data.dob}</p>}
                    <p className="text-neutral-400 italic mt-xs">Bank & financial details visible to admin only — stored securely.</p>
                  </div>
                </div>
              )}

              {/* Verification checklist — show at stage 3+ */}
              {selected.stage >= 3 && selected.stage < 6 && (
                <div>
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Verification Checklist</p>
                  <div className="space-y-sm">
                    {VERIFICATION_CHECKS.map(c => (
                      <label key={c.key} className="flex items-start gap-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={verifyChecks.includes(c.key)}
                          onChange={e => setVerifyChecks(prev => e.target.checked ? [...prev, c.key] : prev.filter(k => k !== c.key))}
                          className="mt-0.5 w-4 h-4 rounded border-neutral-300"
                        />
                        <span className="text-xs text-neutral-700 leading-relaxed">{c.label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-md">
                    <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs">Verification notes</label>
                    <textarea
                      value={verifyNotes}
                      onChange={e => setVerifyNotes(e.target.value)}
                      rows={3}
                      placeholder="Internal notes — not visible to landlord"
                      className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-sm py-xs text-xs text-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    />
                  </div>
                  <button onClick={saveNotes} className="mt-sm w-full rounded-xl border border-neutral-200 py-xs text-xs font-semibold text-neutral-600 hover:bg-neutral-50 transition">
                    {savedNotes ? '✓ Saved' : 'Save notes'}
                  </button>
                </div>
              )}

              {/* Stage actions */}
              <div className="space-y-sm pt-sm border-t border-neutral-100">
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Actions</p>

                {selected.stage === 1 && (
                  <button onClick={() => advanceStage(selected.id, 2)} disabled={advancing} className="w-full rounded-xl bg-neutral-900 text-white py-sm text-sm font-semibold hover:bg-neutral-700 transition disabled:opacity-40">
                    {advancing ? '…' : '✉ Re-send welcome pack'}
                  </button>
                )}

                {selected.stage === 2 && (
                  <button onClick={() => advanceStage(selected.id, 3, { docs_received: true })} disabled={advancing} className="w-full rounded-xl bg-neutral-900 text-white py-sm text-sm font-semibold hover:bg-neutral-700 transition disabled:opacity-40">
                    {advancing ? '…' : '📂 Mark documents received'}
                  </button>
                )}

                {selected.stage === 3 && (
                  <button
                    onClick={() => advanceStage(selected.id, 4, { verified_by: null, verification_notes: verifyNotes, verification_checks: verifyChecks })}
                    disabled={advancing || verifyChecks.length < VERIFICATION_CHECKS.length}
                    className="w-full rounded-xl bg-green-700 text-white py-sm text-sm font-semibold hover:bg-green-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {advancing ? '…' : verifyChecks.length < VERIFICATION_CHECKS.length ? `Tick all ${VERIFICATION_CHECKS.length} checks to verify` : '✅ Mark verified & send approval email'}
                  </button>
                )}

                {selected.stage === 4 && (
                  <button onClick={() => advanceStage(selected.id, 5)} disabled={advancing} className="w-full rounded-xl bg-neutral-900 text-white py-sm text-sm font-semibold hover:bg-neutral-700 transition disabled:opacity-40">
                    {advancing ? '…' : '✍️ Mark agreement sent (Adobe Sign)'}
                  </button>
                )}

                {selected.stage === 5 && (
                  <button onClick={() => advanceStage(selected.id, 6)} disabled={advancing} className="w-full rounded-xl bg-green-700 text-white py-sm text-sm font-semibold hover:bg-green-800 transition disabled:opacity-40">
                    {advancing ? '…' : '🎉 Mark fully onboarded'}
                  </button>
                )}

                {selected.stage === 6 && (
                  <p className="text-xs text-green-600 font-semibold text-center py-sm">✓ Onboarding complete</p>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
