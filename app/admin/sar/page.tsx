'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'

interface SarRecord {
  id: string
  reported_by_name: string
  reported_by_title?: string
  is_urgent: boolean
  subject_name?: string
  activity_description: string
  suspicion_reason: string
  reasonable_grounds?: boolean
  report_to_nca?: boolean
  mlro_signed_at?: string
  created_at: string
}

const blank = () => ({
  reported_by_name:      '',
  reported_by_title:     '',
  is_urgent:             false,
  response_needed_by:    '',
  subject_name:          '',
  subject_address:       '',
  subject_business:      '',
  activity_description:  '',
  activity_value:        '',
  suspicion_reason:      '',
  investigation_known:   false,
  investigation_details: '',
  discussed_with_others: false,
  discussed_with_whom:   '',
  other_info:            '',
})

export default function SarPage() {
  const router = useRouter()
  const [loading, setLoading]   = useState(true)
  const [records, setRecords]   = useState<SarRecord[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState(blank())
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<any>(null)

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || (data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin')) {
        router.push('/login'); return
      }
      setCurrentUser(data)
      await loadRecords()
      setLoading(false)
    }
    init()
  }, [router])

  async function loadRecords() {
    const supabase = createClient()
    const { data } = await supabase
      .from('sar_log')
      .select('id, reported_by_name, reported_by_title, is_urgent, subject_name, activity_description, suspicion_reason, reasonable_grounds, report_to_nca, mlro_signed_at, created_at')
      .order('created_at', { ascending: false })
    setRecords(data ?? [])
  }

  function set(key: string, val: any) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function handleSubmit() {
    if (!form.reported_by_name || !form.activity_description || !form.suspicion_reason) {
      alert('Please fill in all required fields (reporter name, activity description, suspicion reason)')
      return
    }
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('sar_log').insert({
      ...form,
      response_needed_by: form.response_needed_by || null,
      mlro_received_at: new Date().toISOString(),
    })
    if (error) { alert('Error: ' + error.message); setSaving(false); return }
    setSaved(true)
    setForm(blank())
    setShowForm(false)
    await loadRecords()
    setSaving(false)
    setTimeout(() => setSaved(false), 4000)
  }

  const inp  = 'w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900'
  const lbl  = 'block text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-1.5'
  const card = 'bg-white rounded-2xl border border-neutral-200 p-lg mb-md'

  if (loading) return <GenericPageSkeleton />

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin" />} />

      <main className="mx-auto max-w-5xl px-lg py-lg">
        {/* Header */}
        <div className="mb-xl flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900">Suspected Activity Reports</h1>
            <p className="mt-sm text-sm text-neutral-500">
              Internal SAR log — MLRO: Harry Buchanan · Confidential · Retained 5 years minimum
            </p>
          </div>
          <button
            onClick={() => { setShowForm(!showForm); setSaved(false) }}
            className="rounded-xl bg-neutral-900 px-lg py-md text-sm font-bold text-white hover:bg-neutral-800"
          >
            + File a Report
          </button>
        </div>

        {saved && (
          <div className="mb-lg rounded-xl bg-green-100 p-md text-sm font-semibold text-green-800">
            ✓ Report filed and received by MLRO. This report is confidential — do not discuss with any person believed to be involved.
          </div>
        )}

        {/* Warning banner */}
        <div className="mb-xl rounded-2xl bg-amber-50 border border-amber-200 p-md">
          <p className="text-sm text-amber-800 leading-relaxed">
            <strong>⚠ Tipping-off warning:</strong> Once a SAR has been made, disclosing its existence to any person involved or suspected to be involved constitutes a
            tipping-off offence under Section 333A POCA 2002, carrying a maximum penalty of 5 years' imprisonment.
            Do not discuss any report with anyone other than the MLRO.
          </p>
        </div>

        {/* New SAR form */}
        {showForm && (
          <div className="mb-xl rounded-2xl border-2 border-neutral-900 bg-white p-lg">
            <h2 className="text-lg font-bold text-neutral-900 mb-xs">Report of Suspected Money Laundering Activity</h2>
            <p className="text-xs text-neutral-500 mb-lg">To: Money Laundering Reporting Officer (Harry Buchanan). This report is confidential.</p>

            <div className={card}>
              <h3 className="text-sm font-bold text-neutral-800 mb-md">Reporter Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
                <div>
                  <label className={lbl}>Your full name *</label>
                  <input value={form.reported_by_name} onChange={e => set('reported_by_name', e.target.value)} className={inp} placeholder="Your name" />
                </div>
                <div>
                  <label className={lbl}>Your title / role</label>
                  <input value={form.reported_by_title} onChange={e => set('reported_by_title', e.target.value)} className={inp} placeholder="e.g. Property Manager" />
                </div>
                <div className="flex items-center gap-sm">
                  <input type="checkbox" checked={form.is_urgent} onChange={e => set('is_urgent', e.target.checked)} className="w-4 h-4" />
                  <label className="text-sm font-semibold text-red-700">Mark as URGENT</label>
                </div>
                <div>
                  <label className={lbl}>Response needed by (if urgent)</label>
                  <input type="date" value={form.response_needed_by} onChange={e => set('response_needed_by', e.target.value)} className={inp} />
                </div>
              </div>
            </div>

            <div className={card}>
              <h3 className="text-sm font-bold text-neutral-800 mb-md">Person(s) Involved</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
                <div className="sm:col-span-2">
                  <label className={lbl}>Full name(s) and address(es)</label>
                  <textarea rows={2} value={form.subject_name} onChange={e => set('subject_name', e.target.value)} className={inp} placeholder="Name and address of person(s) involved" />
                </div>
                <div className="sm:col-span-2">
                  <label className={lbl}>Nature of business (if a company)</label>
                  <input value={form.subject_business} onChange={e => set('subject_business', e.target.value)} className={inp} placeholder="Company name and business type" />
                </div>
              </div>
            </div>

            <div className={card}>
              <h3 className="text-sm font-bold text-neutral-800 mb-md">Suspected Activity</h3>
              <div className="space-y-md">
                <div>
                  <label className={lbl}>Full details of the activity * <span className="text-neutral-400 normal-case font-normal">(what, when, where, how)</span></label>
                  <textarea rows={5} value={form.activity_description} onChange={e => set('activity_description', e.target.value)} className={inp}
                    placeholder="Describe the suspected activity in full. Include dates, amounts, parties involved, and any transactions." />
                </div>
                <div>
                  <label className={lbl}>Approximate value of activity</label>
                  <input value={form.activity_value} onChange={e => set('activity_value', e.target.value)} className={inp} placeholder="e.g. £8,500 cash payment" />
                </div>
                <div>
                  <label className={lbl}>Nature of your suspicions * <span className="text-neutral-400 normal-case font-normal">(why you believe this may be money laundering)</span></label>
                  <textarea rows={4} value={form.suspicion_reason} onChange={e => set('suspicion_reason', e.target.value)} className={inp}
                    placeholder="Explain clearly why you suspect money laundering or terrorist financing." />
                </div>
              </div>
            </div>

            <div className={card}>
              <h3 className="text-sm font-bold text-neutral-800 mb-md">Investigation & Disclosure</h3>
              <div className="space-y-md">
                <div className="flex items-start gap-sm">
                  <input type="checkbox" checked={form.investigation_known} onChange={e => set('investigation_known', e.target.checked)} className="mt-xs w-4 h-4" />
                  <div>
                    <p className="text-sm font-semibold text-neutral-700">An investigation is already underway (as far as I am aware)</p>
                    {form.investigation_known && (
                      <textarea rows={2} value={form.investigation_details} onChange={e => set('investigation_details', e.target.value)}
                        className={inp + ' mt-sm'} placeholder="Provide details of the investigation" />
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-sm">
                  <input type="checkbox" checked={form.discussed_with_others} onChange={e => set('discussed_with_others', e.target.checked)} className="mt-xs w-4 h-4" />
                  <div>
                    <p className="text-sm font-semibold text-neutral-700">I have discussed these suspicions with another person</p>
                    {form.discussed_with_others && (
                      <textarea rows={2} value={form.discussed_with_whom} onChange={e => set('discussed_with_whom', e.target.value)}
                        className={inp + ' mt-sm'} placeholder="Who did you discuss this with and why?" />
                    )}
                  </div>
                </div>
                <div>
                  <label className={lbl}>Any other information</label>
                  <textarea rows={3} value={form.other_info} onChange={e => set('other_info', e.target.value)} className={inp}
                    placeholder="Any other relevant information you wish to include" />
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-red-50 border border-red-200 p-md mb-lg">
              <p className="text-sm text-red-800 font-semibold mb-xs">Declaration</p>
              <p className="text-sm text-red-700 leading-relaxed">
                By submitting this report I confirm the above information is accurate to the best of my knowledge.
                I understand I must not discuss the content of this report with any person believed to be involved in the suspected
                activity. To do so may constitute a tipping-off offence under Section 333A POCA 2002.
              </p>
            </div>

            <div className="flex gap-md justify-end">
              <button onClick={() => setShowForm(false)} className="rounded-xl border border-neutral-300 px-lg py-sm text-sm font-semibold">Cancel</button>
              <button onClick={handleSubmit} disabled={saving}
                className="rounded-xl bg-neutral-900 text-white px-lg py-sm text-sm font-bold hover:bg-neutral-700 disabled:opacity-40">
                {saving ? 'Filing…' : 'Submit to MLRO'}
              </button>
            </div>
          </div>
        )}

        {/* Records list */}
        {records.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
            <p className="text-sm text-neutral-500">No suspected activity reports on file.</p>
          </div>
        ) : (
          <div className="space-y-sm">
            {records.map(r => (
              <div
                key={r.id}
                onClick={() => setSelectedId(selectedId === r.id ? null : r.id)}
                className={`rounded-2xl border bg-white p-lg cursor-pointer transition ${selectedId === r.id ? 'border-neutral-900' : 'border-neutral-200 hover:border-neutral-300'}`}
              >
                <div className="flex items-start justify-between gap-md">
                  <div className="flex-1">
                    <div className="flex items-center gap-sm mb-xs">
                      {r.is_urgent && (
                        <span className="text-xs font-bold text-red-700 bg-red-100 px-sm py-xs rounded-full">URGENT</span>
                      )}
                      <span className={`text-xs font-semibold px-sm py-xs rounded-full ${r.mlro_signed_at ? 'bg-green-100 text-green-700' : r.reasonable_grounds !== undefined ? 'bg-amber-100 text-amber-700' : 'bg-neutral-100 text-neutral-500'}`}>
                        {r.mlro_signed_at ? 'MLRO reviewed' : r.reasonable_grounds !== undefined ? 'Under consideration' : 'Received'}
                      </span>
                      {r.report_to_nca && (
                        <span className="text-xs font-bold text-red-700 bg-red-100 px-sm py-xs rounded-full">Reported to NCA</span>
                      )}
                    </div>
                    <p className="text-sm font-bold text-neutral-900">{r.subject_name || 'Subject name not provided'}</p>
                    <p className="text-xs text-neutral-500 mt-xs">
                      Reported by {r.reported_by_name}{r.reported_by_title ? ` (${r.reported_by_title})` : ''} · {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <span className="text-neutral-400">{selectedId === r.id ? '▲' : '▼'}</span>
                </div>

                {selectedId === r.id && (
                  <div className="mt-md pt-md border-t border-neutral-100 space-y-md text-sm text-neutral-700">
                    <div>
                      <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs">Activity Description</p>
                      <p className="leading-relaxed">{r.activity_description}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs">Reason for Suspicion</p>
                      <p className="leading-relaxed">{r.suspicion_reason}</p>
                    </div>
                    {r.mlro_signed_at && (
                      <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-md">
                        <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">MLRO Decision</p>
                        <p><span className="font-semibold">Reasonable grounds: </span>{r.reasonable_grounds ? 'Yes' : 'No'}</p>
                        <p><span className="font-semibold">SAR to NCA: </span>{r.report_to_nca ? 'Yes' : 'No'}</p>
                        <p className="text-xs text-neutral-400 mt-sm">Reviewed {new Date(r.mlro_signed_at).toLocaleDateString('en-GB')}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
