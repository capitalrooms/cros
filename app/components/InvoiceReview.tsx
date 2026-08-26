'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { AIResult } from './DocReview'

interface Job {
  id: string
  title: string | null
  description: string | null
  status: string | null
  completed_at: string | null
  final_price: number | null
  created_at: string | null
  contractorName: string | null
}

/**
 * Review step for a supplier_invoice. Confirms the property, suggests a matching
 * raised job (maintenance_tickets), lets the admin confirm the ACTUAL final
 * amount paid (which can differ from the invoiced figure), and writes that cost
 * onto the job so it appears in Works Carried Out.
 */
export default function InvoiceReview({
  initial,
  file,
  properties,
  onApplied,
  onCancel,
}: {
  initial: AIResult
  file?: File
  properties: Array<{ id: string; name: string; address?: string }>
  onApplied: (msg: string) => void
  onCancel: () => void
}) {
  const guessedProperty = useMemo(() => {
    const addr = (initial.property_address || '').toLowerCase()
    if (!addr) return ''
    return (
      properties.find(
        (p) =>
          (p.address && addr.includes(String(p.address).toLowerCase())) ||
          addr.includes(String(p.name).toLowerCase())
      )?.id || ''
    )
  }, [initial.property_address, properties])

  const invoiceAmount = (initial.amount || '').replace(/[^0-9.]/g, '')

  const [propertyId, setPropertyId] = useState(guessedProperty)
  const [jobs, setJobs] = useState<Job[]>([])
  const [selectedJob, setSelectedJob] = useState<string>('')
  const [finalCost, setFinalCost] = useState(invoiceAmount)
  const [loadingJobs, setLoadingJobs] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadJobs() {
      if (!propertyId) { setJobs([]); return }
      setLoadingJobs(true)
      const supabase = createClient()
      const { data } = await supabase
        .from('maintenance_tickets')
        .select('id, title, description, status, completed_at, final_price, created_at, contractor_id')
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false })
        .limit(40)
      const tickets = data || []
      const contractorIds = [...new Set(tickets.map((t: any) => t.contractor_id).filter(Boolean))]
      const names = new Map<string, string>()
      if (contractorIds.length) {
        const { data: ppl } = await supabase.from('people').select('id, full_name').in('id', contractorIds)
        for (const p of ppl || []) names.set(p.id, p.full_name)
      }
      setJobs(tickets.map((t: any) => ({ ...t, contractorName: t.contractor_id ? names.get(t.contractor_id) || null : null })))
      setLoadingJobs(false)
    }
    loadJobs()
    setSelectedJob('')
  }, [propertyId])

  // Simple suggestion: score jobs by provider↔contractor match + word overlap
  // between the invoice's work description and the job title/description.
  const suggestedId = useMemo(() => {
    const prov = (initial.provider || '').toLowerCase()
    const words = (initial.work_description || '').toLowerCase().split(/\W+/).filter((w) => w.length > 3)
    let best = ''
    let bestScore = 0
    for (const j of jobs) {
      let s = 0
      if (prov && j.contractorName && j.contractorName.toLowerCase().includes(prov)) s += 3
      if (prov && j.contractorName && prov.includes(j.contractorName.toLowerCase())) s += 3
      const hay = `${j.title || ''} ${j.description || ''}`.toLowerCase()
      for (const w of words) if (hay.includes(w)) s += 1
      if (s > bestScore) { bestScore = s; best = j.id }
    }
    return bestScore >= 2 ? best : ''
  }, [jobs, initial.provider, initial.work_description])

  useEffect(() => { if (suggestedId && !selectedJob) setSelectedJob(suggestedId) }, [suggestedId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!propertyId) { setError('Choose which property this invoice is for'); return }
    if (!selectedJob) { setError('Pick the job this invoice is for (or Skip to just file it)'); return }
    setSaving(true)
    setError('')
    try {
      const supabase = createClient()
      const update: Record<string, unknown> = {}
      if (finalCost) update.final_price = Number(finalCost)
      const job = jobs.find((j) => j.id === selectedJob)
      if (job && !job.completed_at) {
        update.completed_at = new Date().toISOString()
        update.status = 'completed'
      }
      const { error: e } = await supabase.from('maintenance_tickets').update(update).eq('id', selectedJob)
      if (e) throw new Error(e.message)
      onApplied(`Invoice linked to "${job?.title || 'job'}"${finalCost ? ` — final cost £${Number(finalCost).toLocaleString()}` : ''}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not link invoice')
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    'w-full rounded-lg border border-neutral-300 px-md py-sm text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900'

  return (
    <div className="rounded-2xl border-2 border-neutral-200 bg-white p-lg">
      <span className="inline-block rounded bg-amber-100 px-sm py-0.5 text-xs font-semibold text-amber-800">🧾 Contractor invoice</span>
      <p className="mt-xs text-sm font-semibold text-neutral-900">{initial.summary || file?.name || 'Invoice'}</p>
      <p className="text-xs text-neutral-500">
        {initial.provider && <>From <strong>{initial.provider}</strong> · </>}
        {invoiceAmount && <>Invoiced £{Number(invoiceAmount).toLocaleString()} · </>}
        Link it to the job it was for, then confirm the amount actually paid.
      </p>

      <div className="mt-lg">
        <label className="block text-xs font-bold text-neutral-700 mb-xs">Property *</label>
        <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className={inputCls}>
          <option value="">Select a property…</option>
          {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {propertyId && (
        <div className="mt-lg">
          <label className="block text-xs font-bold text-neutral-700 mb-xs">Which job is this invoice for?</label>
          {loadingJobs ? (
            <p className="text-sm text-neutral-500">Loading jobs…</p>
          ) : jobs.length === 0 ? (
            <p className="text-sm text-neutral-500">No jobs raised at this property to match against.</p>
          ) : (
            <div className="space-y-sm max-h-64 overflow-y-auto rounded-lg border border-neutral-200 p-sm">
              {jobs.map((j) => (
                <label key={j.id} className={`flex cursor-pointer items-start gap-sm rounded-lg p-sm ${selectedJob === j.id ? 'bg-blue-50 ring-1 ring-blue-400' : 'hover:bg-neutral-50'}`}>
                  <input type="radio" name="job" checked={selectedJob === j.id} onChange={() => setSelectedJob(j.id)} className="mt-1" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-neutral-900">
                      {j.title || 'Untitled job'}
                      {j.id === suggestedId && <span className="ml-sm rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">AI suggested</span>}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {[j.contractorName, j.completed_at ? 'completed' : j.status, j.final_price != null ? `£${j.final_price} on file` : 'no cost yet'].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-lg">
        <label className="block text-xs font-bold text-neutral-700 mb-xs">Actual final amount paid (£)</label>
        <input value={finalCost} onChange={(e) => setFinalCost(e.target.value.replace(/[^0-9.]/g, ''))} className={inputCls} placeholder="e.g. 85" />
        <p className="mt-xs text-xs text-neutral-500">Pre-filled from the invoice ({invoiceAmount ? `£${invoiceAmount}` : 'not detected'}). Change it if a different amount was actually agreed/paid.</p>
      </div>

      {error && <p className="mt-md text-sm text-red-600">{error}</p>}

      <div className="mt-lg flex gap-md">
        <button onClick={onCancel} disabled={saving} className="flex-1 rounded-lg border border-neutral-300 px-lg py-sm text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">Skip</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 rounded-lg bg-neutral-900 px-lg py-sm text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50">{saving ? 'Saving…' : 'Link & set final cost'}</button>
      </div>
    </div>
  )
}
