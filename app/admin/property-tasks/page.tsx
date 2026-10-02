'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import AppBar from '@/components/AppBar'
import PageHero, { HeroButton } from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'
import Link from 'next/link'
import { pendingLicenceIds } from '@/lib/compliance/hmoLicence'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Task {
  id: string
  description: string
  notes: string | null
  responsible: string | null
  due_date: string | null
  completed: boolean
  status: string
  ticket_id: string | null
  property_id: string
  created_at: string
  properties: { id: string; name: string; address: string }
  rooms?: { name: string } | null
}

interface CertAlert {
  property_id:   string
  property_name: string
  cert_type:     string
  label:         string
  days:          number
  expiry:        string  // ISO date
}

// ── Cert types (must match admin/page.tsx) ─────────────────────────────────────
const CERT_CHECKS: { field: string; label: string; icon: string }[] = [
  { field: 'gas_safe_cert_expiry',        label: 'Gas safety',            icon: '🔥' },
  { field: 'electrical_cert_expiry',      label: 'Electrical (EICR)',     icon: '⚡' },
  { field: 'license_expiry',              label: 'HMO licence',           icon: '🏠' },
  { field: 'insurance_expiry',            label: 'Insurance',             icon: '🛡️' },
  { field: 'fire_detection_expiry',       label: 'Fire detection',        icon: '🚨' },
  { field: 'emergency_lighting_expiry',   label: 'Emergency lighting',    icon: '💡' },
  { field: 'pat_test_expiry',             label: 'PAT test',              icon: '🔌' },
  { field: 'fire_risk_assessment_expiry', label: 'Fire risk assessment',  icon: '📋' },
]

type FilterMode = 'all' | 'mine' | 'deadlines'
type HorizonDays = 30 | 90 | 365 | 9999

const HORIZONS: { value: HorizonDays; label: string }[] = [
  { value: 30,   label: '1 month'   },
  { value: 90,   label: '3 months'  },
  { value: 365,  label: '12 months' },
  { value: 9999, label: 'All'       },
]

function addDays(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function fmtDate(iso: string): { label: string; cls: string } {
  const d     = new Date(iso)
  const today = new Date(); today.setHours(0,0,0,0)
  const diff  = Math.floor((d.getTime() - today.getTime()) / 86400000)
  if (diff < 0)   return { label: `${Math.abs(diff)}d overdue`, cls: 'text-red-600 font-bold' }
  if (diff === 0) return { label: 'Due today',                  cls: 'text-amber-600 font-bold' }
  if (diff === 1) return { label: 'Due tomorrow',               cls: 'text-amber-500 font-semibold' }
  if (diff <= 7)  return { label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), cls: 'text-amber-500 font-semibold' }
  return { label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), cls: 'text-neutral-500' }
}

// ── Email supplier modal ───────────────────────────────────────────────────────
interface EmailModalProps {
  cert:         CertAlert
  contractors:  { id: string; name: string; email: string }[]
  onClose:      () => void
}

function EmailSupplierModal({ cert, contractors, onClose }: EmailModalProps) {
  const defaultSubject = `${cert.label} — ${cert.property_name}`
  const defaultBody    = `Hi,\n\nI'd like to book a ${cert.label.toLowerCase()} inspection for ${cert.property_name}. Our current certificate expires ${new Date(cert.expiry).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.\n\nPlease let me know your earliest available date and your current pricing.\n\nThanks,\nHarry\nCapital Rooms`

  const [selected,  setSelected]  = useState(contractors[0]?.email || '')
  const [subject,   setSubject]   = useState(defaultSubject)
  const [body,      setBody]      = useState(defaultBody)
  const [sending,   setSending]   = useState(false)
  const [sent,      setSent]      = useState(false)

  const chosenContractor = contractors.find(c => c.email === selected)

  async function send() {
    if (!selected) return
    setSending(true)
    const res = await fetch(`/api/admin/property-tasks/cert-email-supplier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_email: selected,
        supplier_name:  chosenContractor?.name || selected,
        subject,
        body,
        cert_type:      cert.label,
        property_name:  cert.property_name,
      }),
    })
    if (res.ok) setSent(true)
    else        alert('Failed to send email — please try again.')
    setSending(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-md">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-neutral-950 px-lg py-md flex items-center gap-sm">
          <span className="text-2xl">{CERT_CHECKS.find(c => c.label === cert.label)?.icon || '📋'}</span>
          <div>
            <p className="text-white font-bold text-sm">{cert.label}</p>
            <p className="text-neutral-400 text-xs">{cert.property_name} · {Math.abs(cert.days)} days {cert.days < 0 ? 'overdue' : 'remaining'}</p>
          </div>
          <button onClick={onClose} className="ml-auto text-neutral-400 hover:text-white text-xl">✕</button>
        </div>

        {sent ? (
          <div className="p-xl text-center">
            <p className="text-4xl mb-md">📧</p>
            <p className="font-bold text-lg">Email sent</p>
            <p className="text-neutral-500 text-sm mt-xs">Sent to {chosenContractor?.name || selected}</p>
            <button onClick={onClose} className="mt-lg bg-neutral-950 text-white font-bold px-xl py-sm rounded-xl">
              Done
            </button>
          </div>
        ) : (
          <div className="p-lg space-y-md max-h-[70vh] overflow-y-auto">
            {/* Supplier picker */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-neutral-500 block mb-xs">Send to</label>
              {contractors.length === 0 ? (
                <p className="text-sm text-neutral-500">No contractors in your contacts — <Link href="/admin/contacts" className="underline">add one first</Link>.</p>
              ) : (
                <div className="space-y-xs">
                  {contractors.map(c => (
                    <button
                      key={c.email}
                      onClick={() => setSelected(c.email)}
                      className={`w-full flex items-center gap-sm p-sm rounded-xl border-2 transition text-left ${
                        selected === c.email ? 'border-neutral-950 bg-neutral-50' : 'border-neutral-200 hover:border-neutral-300'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-neutral-950 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {(c.name || '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-neutral-900">{c.name || c.email}</p>
                        <p className="text-xs text-neutral-500">{c.email}</p>
                      </div>
                      {selected === c.email && <span className="ml-auto text-sm">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Subject */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-neutral-500 block mb-xs">Subject</label>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="w-full border border-neutral-200 rounded-xl p-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-950"
              />
            </div>

            {/* Body */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-neutral-500 block mb-xs">Message</label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={8}
                className="w-full border border-neutral-200 rounded-xl p-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-950 resize-none font-mono"
              />
            </div>

            <div className="flex gap-sm">
              <button
                onClick={send}
                disabled={!selected || sending}
                className="flex-1 bg-neutral-950 text-white font-bold py-sm rounded-xl hover:bg-neutral-800 disabled:opacity-50 transition"
              >
                {sending ? 'Sending…' : '📧 Send email'}
              </button>
              <button onClick={onClose} className="px-lg border border-neutral-200 rounded-xl font-semibold text-sm hover:bg-neutral-50 transition">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Complete cert modal ────────────────────────────────────────────────────────

function CompleteCertModal({ cert, onClose, onSaved }: {
  cert: CertAlert
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const icon = CERT_CHECKS.find(c => c.label === cert.label)?.icon || '📋'

  // Default new expiry = 1 year from today
  const defaultExpiry = (() => {
    const d = new Date(); d.setFullYear(d.getFullYear() + 1)
    return d.toISOString().split('T')[0]
  })()

  const [newExpiry, setNewExpiry] = useState(defaultExpiry)
  const [file,      setFile]      = useState<File | null>(null)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function save() {
    if (!newExpiry) { setError('Please enter the new expiry date'); return }
    setSaving(true); setError('')
    try {
      // 1. Update the expiry date on the property
      const { error: updateErr } = await supabase
        .from('properties')
        .update({ [cert.cert_type]: newExpiry })
        .eq('id', cert.property_id)
      if (updateErr) throw updateErr

      // 2. File the certificate on the property (same route as the Compliance page), so it reaches the
      //    certificates grid, move-in packs and tenant emails. (This used to write to a storage bucket that
      //    doesn't exist, so renewed certificates were silently lost.)
      if (file) {
        const DOC_TYPE: Record<string, string> = {
          gas_safe_cert_expiry: 'gas_safety_certificate', electrical_cert_expiry: 'electrical_eicr', epc_expiry: 'epc',
          fire_risk_assessment_expiry: 'fire_risk_assessment', fire_detection_expiry: 'fire_alarm_certificate',
          emergency_lighting_expiry: 'emergency_lighting_certificate', pat_test_expiry: 'pat_test', license_expiry: 'hmo_licence',
        }
        const fd = new FormData()
        if (file.size > 4 * 1024 * 1024) {
          // big files (EICRs often are) go straight to storage — the web host rejects request bodies over ~4.5 MB
          const pre = await fetch('/api/storage/presign-upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: file.name, mimeType: file.type }) })
          if (!pre.ok) throw new Error('The expiry was saved but the certificate could not be uploaded — try again')
          const { token, path: storagePath, publicUrl } = await pre.json()
          const { error: upErr } = await supabase.storage.from('property-documents').uploadToSignedUrl(storagePath, token, file, { contentType: file.type })
          if (upErr) throw new Error('The expiry was saved but the upload failed: ' + upErr.message)
          fd.append('storage_url', publicUrl)
          fd.append('file_name', file.name)
        } else {
          fd.append('file', file)
        }
        fd.append('property_id', cert.property_id)
        fd.append('document_type', DOC_TYPE[cert.cert_type] || 'other')
        fd.append('description', `${cert.label} — expires ${new Date(newExpiry).toLocaleDateString('en-GB')}`)
        fd.append('visible_to_tenants', 'false')
        const res = await fetch('/api/admin/upload-property-document', { method: 'POST', body: fd })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'The expiry was saved but the certificate file did not upload')
      }

      onSaved()
    } catch (e: any) {
      setError(e.message || 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const hasFile = !!file

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-md">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-neutral-950 px-lg py-md flex items-center gap-sm">
          <span className="text-2xl">{icon}</span>
          <div>
            <p className="text-white font-bold text-sm">{cert.label}</p>
            <p className="text-neutral-400 text-xs">{cert.property_name}</p>
          </div>
          <button onClick={onClose} className="ml-auto text-neutral-400 hover:text-white text-xl">✕</button>
        </div>

        <div className="p-lg space-y-md">
          {/* New expiry date */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-neutral-500 block mb-xs">
              New certificate expiry date
            </label>
            <input
              type="date"
              value={newExpiry}
              onChange={e => setNewExpiry(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full border border-neutral-200 rounded-xl p-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-950"
            />
          </div>

          {/* File upload */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-neutral-500 block mb-xs">
              Certificate file <span className="font-normal normal-case text-neutral-400">(optional — upload now or later)</span>
            </label>
            {!hasFile ? (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-neutral-200 rounded-xl p-md text-sm text-neutral-500 hover:border-neutral-400 hover:bg-neutral-50 transition text-center"
              >
                📎 Click to attach certificate PDF or photo
              </button>
            ) : (
              <div className="flex items-center gap-sm bg-green-50 border border-green-200 rounded-xl p-sm">
                <span className="text-green-700 text-sm font-semibold flex-1 truncate">📄 {file.name}</span>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="text-xs text-neutral-400 hover:text-red-500"
                >
                  ✕
                </button>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.heic"
              hidden
              onChange={e => setFile(e.target.files?.[0] || null)}
            />
            {!hasFile && (
              <p className="text-xs text-neutral-400 mt-xs">
                You can also upload later via Documents → Upload. The expiry date will update now either way.
              </p>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-xl px-md py-sm">{error}</p>
          )}

          <div className="flex gap-sm pt-xs">
            <button
              onClick={save}
              disabled={!newExpiry || saving}
              className="flex-1 bg-neutral-950 text-white font-bold py-sm rounded-xl hover:bg-neutral-800 disabled:opacity-50 transition"
            >
              {saving ? 'Saving…' : hasFile ? '✓ Mark complete & upload' : '✓ Mark as renewed'}
            </button>
            <button
              onClick={onClose}
              className="px-lg border border-neutral-200 rounded-xl font-semibold text-sm hover:bg-neutral-50 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function PropertyTasksPage() {
  const router = useRouter()
  const [tasks,       setTasks]       = useState<Task[]>([])
  const [certAlerts,  setCertAlerts]  = useState<CertAlert[]>([])
  const [contractors, setContractors] = useState<{ id: string; name: string; email: string }[]>([])
  const [properties,  setProperties]  = useState<{ id: string; name: string }[]>([])
  const [loading,     setLoading]     = useState(true)
  const [filter,      setFilter]      = useState<FilterMode>('all')
  const [horizon,     setHorizon]     = useState<HorizonDays>(30)
  const [emailCert,   setEmailCert]   = useState<CertAlert | null>(null)
  const [completingCert, setCompletingCert] = useState<CertAlert | null>(null)
  const [converting,  setConverting]  = useState<string | null>(null)
  const [showAdd,     setShowAdd]     = useState(false)
  // Add task form
  const [addPropId,   setAddPropId]   = useState('')
  const [addDesc,     setAddDesc]     = useState('')
  const [addResp,     setAddResp]     = useState('Me')
  const [addDue,      setAddDue]      = useState('')
  const [addNotes,    setAddNotes]    = useState('')
  const [addSaving,   setAddSaving]   = useState(false)

  const supabase = createClient()

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || !['administrator','admin'].includes(data.assignment?.role)) {
        router.push('/login'); return
      }
      await loadAll()
    }
    init()
  }, [router])

  const loadAll = useCallback(async () => {
    setLoading(true)

    // Tasks
    const { data: taskData } = await supabase
      .from('property_tasks')
      .select('*, properties(id,name,address), rooms(name)')
      .in('status', ['open','converted'])
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
    setTasks(taskData || [])

    // Cert alerts
    const { data: props } = await supabase
      .from('properties')
      .select(`id, name, ${CERT_CHECKS.map(c => c.field).join(', ')}`)
    const licencePending = await pendingLicenceIds(supabase)   // application with the council → not an alert
    const today  = new Date(); today.setHours(0,0,0,0)
    const alerts: CertAlert[] = []
    for (const p of (props || [])) {
      for (const c of CERT_CHECKS) {
        const raw = (p as any)[c.field]
        if (!raw) continue
        if (c.field === 'license_expiry' && licencePending.has(p.id)) continue
        const d    = new Date(raw)
        const days = Math.floor((d.getTime() - today.getTime()) / 86400000)
        alerts.push({ property_id: p.id, property_name: p.name, cert_type: c.field, label: c.label, days, expiry: raw })
      }
    }
    alerts.sort((a, b) => a.days - b.days)
    setCertAlerts(alerts)

    // Properties list (for add task modal)
    const { data: propList } = await supabase
      .from('properties')
      .select('id, name')
      .order('name')
    setProperties(propList || [])

    // Contractors (for email modal)
    const { data: people } = await supabase
      .from('people')
      .select('id, email, first_name, last_name, full_name')
      .eq('role', 'contractor')
    setContractors(
      (people || []).map(p => ({
        id:    p.id,
        email: p.email,
        name:  p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email,
      }))
    )

    setLoading(false)
  }, [supabase])

  async function addTask() {
    if (!addPropId || !addDesc.trim()) return
    setAddSaving(true)
    const res = await fetch('/api/admin/property-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        property_id: addPropId,
        description: addDesc.trim(),
        responsible: addResp || null,
        due_date:    addDue  || null,
        notes:       addNotes.trim() || null,
      }),
    })
    if (res.ok) {
      setAddDesc(''); setAddResp('Me'); setAddDue(''); setAddNotes(''); setAddPropId('')
      setShowAdd(false)
      await loadAll()
    }
    setAddSaving(false)
  }

  async function toggleComplete(task: Task) {
    const completing = !task.completed
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: completing, status: completing ? 'completed' : 'open' } : t))
    await fetch(`/api/admin/property-tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: completing }),
    })
  }

  async function convertToTicket(task: Task) {
    if (!confirm(`Convert "${task.description}" to a maintenance ticket?`)) return
    setConverting(task.id)
    const res  = await fetch(`/api/admin/property-tasks/${task.id}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority: 'medium', category: 'general' }),
    })
    const data = await res.json()
    if (res.ok) {
      await loadAll()
    } else {
      alert(data.error || 'Could not convert task')
    }
    setConverting(null)
  }

  // ── Filter logic ─────────────────────────────────────────────────────────────
  const horizonDate = addDays(horizon)

  const filteredTasks = tasks.filter(t => {
    if (filter === 'mine') return t.responsible?.toLowerCase() === 'me'
    if (filter === 'deadlines') return t.due_date && t.due_date <= horizonDate
    return true // 'all'
  })

  const filteredCerts = certAlerts.filter(c => {
    if (filter === 'mine') return false // certs aren't assigned to "me"
    const certDate = new Date(c.expiry)
    certDate.setHours(0,0,0,0)
    const limit    = new Date(); limit.setDate(limit.getDate() + (filter === 'deadlines' ? horizon : 9999))
    return certDate <= limit
  })

  const openTasks      = filteredTasks.filter(t => !t.completed && t.status !== 'converted')
  const overdueAlerts  = filteredCerts.filter(c => c.days <  0)
  const urgentAlerts   = filteredCerts.filter(c => c.days >= 0 && c.days <= 14)
  const upcomingAlerts = filteredCerts.filter(c => c.days >  14)

  if (loading) return <GenericPageSkeleton />

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar
        left={<BackButton href="/admin" />}
        title="Property Tasks"
        right={
          <button
            onClick={() => setShowAdd(true)}
            className="bg-neutral-950 text-white text-sm font-semibold px-md py-sm rounded-xl hover:bg-neutral-800 transition"
          >
            + Add task
          </button>
        }
      />
      <PageHero title="Property Tasks" subtitle="To-dos for each property — who’s responsible, when it’s due, and whether it’s done"
        actions={<HeroButton primary onClick={() => setShowAdd(true)}>+ Add task</HeroButton>} />

      {/* Add task modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-md">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="bg-neutral-950 px-lg py-md flex items-center gap-sm">
              <p className="text-white font-bold text-sm">New task</p>
              <button onClick={() => setShowAdd(false)} className="ml-auto text-neutral-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="p-lg space-y-md">
              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-neutral-500 block mb-xs">Property</label>
                <select
                  value={addPropId}
                  onChange={e => setAddPropId(e.target.value)}
                  className="w-full border border-neutral-200 rounded-xl p-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-950"
                >
                  <option value="">Select a property…</option>
                  {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-neutral-500 block mb-xs">Task</label>
                <textarea
                  value={addDesc}
                  onChange={e => setAddDesc(e.target.value)}
                  placeholder="What needs doing?"
                  rows={2}
                  className="w-full border border-neutral-200 rounded-xl p-sm text-sm resize-none focus:outline-none focus:ring-2 focus:ring-neutral-950"
                />
              </div>
              <div className="grid grid-cols-2 gap-sm">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-neutral-500 block mb-xs">Responsible</label>
                  <select
                    value={addResp}
                    onChange={e => setAddResp(e.target.value)}
                    className="w-full border border-neutral-200 rounded-xl p-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-950"
                  >
                    {['Me','Landlord','Ricky','Damien','Waqar','Waste Removal'].map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-neutral-500 block mb-xs">Due date</label>
                  <input
                    type="date"
                    value={addDue}
                    onChange={e => setAddDue(e.target.value)}
                    className="w-full border border-neutral-200 rounded-xl p-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-950"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-neutral-500 block mb-xs">Notes (optional)</label>
                <input
                  value={addNotes}
                  onChange={e => setAddNotes(e.target.value)}
                  placeholder="Any extra detail…"
                  className="w-full border border-neutral-200 rounded-xl p-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-950"
                />
              </div>
              <div className="flex gap-sm">
                <button
                  onClick={addTask}
                  disabled={!addPropId || !addDesc.trim() || addSaving}
                  className="flex-1 bg-neutral-950 text-white font-bold py-sm rounded-xl hover:bg-neutral-800 disabled:opacity-50 transition"
                >
                  {addSaving ? 'Saving…' : 'Save task'}
                </button>
                <button onClick={() => setShowAdd(false)} className="px-lg border border-neutral-200 rounded-xl font-semibold text-sm hover:bg-neutral-50 transition">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-lg py-xl space-y-lg">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-sm">
          {[
            { label: 'Open tasks',    value: tasks.filter(t => !t.completed && t.status !== 'converted').length, color: 'text-white' },
            { label: 'Due this week', value: tasks.filter(t => t.due_date && t.due_date <= addDays(7)).length,   color: 'text-amber-400' },
            { label: 'Cert alerts',   value: certAlerts.filter(c => c.days <= 14).length,                         color: 'text-red-400' },
          ].map(s => (
            <div key={s.label} className="rounded-2xl bg-neutral-900 border border-neutral-800 p-md text-center">
              <p className={`text-3xl font-black tabular-nums ${s.color}`}>{s.value}</p>
              <p className="text-xs font-medium text-white/40 mt-xs">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-xs flex gap-xs">
          {([['all','All'],['mine','My tasks'],['deadlines','⚠ Deadlines']] as const).map(([v,l]) => (
            <button
              key={v}
              onClick={() => setFilter(v)}
              className={`flex-1 py-sm text-sm font-semibold rounded-xl transition ${
                filter === v
                  ? v === 'deadlines'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-neutral-950 text-white'
                  : 'text-neutral-500 hover:bg-neutral-50'
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Time horizon (Deadlines only) */}
        {filter === 'deadlines' && (
          <div className="flex gap-xs">
            {HORIZONS.map(h => (
              <button
                key={h.value}
                onClick={() => setHorizon(h.value)}
                className={`flex-1 py-xs text-xs font-semibold rounded-lg border transition ${
                  horizon === h.value
                    ? 'bg-neutral-950 text-white border-neutral-950'
                    : 'border-neutral-200 text-neutral-500 hover:border-neutral-400'
                }`}
              >
                {h.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Overdue certs ── */}
        {overdueAlerts.length > 0 && (
          <Section title="Overdue" count={overdueAlerts.length} countColor="bg-red-100 text-red-800">
            {overdueAlerts.map(cert => (
              <CertRow key={cert.property_id + cert.cert_type} cert={cert} onEmail={() => setEmailCert(cert)} onComplete={() => setCompletingCert(cert)} />
            ))}
          </Section>
        )}

        {/* ── Urgent certs ── */}
        {urgentAlerts.length > 0 && (
          <Section title="Cert deadlines — due soon" count={urgentAlerts.length} countColor="bg-amber-100 text-amber-800">
            {urgentAlerts.map(cert => (
              <CertRow key={cert.property_id + cert.cert_type} cert={cert} onEmail={() => setEmailCert(cert)} onComplete={() => setCompletingCert(cert)} />
            ))}
          </Section>
        )}

        {/* ── Upcoming certs (only when deadlines filter or all) ── */}
        {upcomingAlerts.length > 0 && filter !== 'mine' && (
          <Section title="Upcoming certs" count={upcomingAlerts.length}>
            {upcomingAlerts.map(cert => (
              <CertRow key={cert.property_id + cert.cert_type} cert={cert} onEmail={() => setEmailCert(cert)} onComplete={() => setCompletingCert(cert)} />
            ))}
          </Section>
        )}

        {/* ── Open tasks ── */}
        {openTasks.length > 0 && (
          <Section title={filter === 'mine' ? 'My tasks' : 'Open tasks'} count={openTasks.length}>
            {openTasks.map(task => (
              <GlobalTaskRow
                key={task.id}
                task={task}
                onToggle={toggleComplete}
                onConvert={convertToTicket}
                converting={converting === task.id}
              />
            ))}
          </Section>
        )}

        {openTasks.length === 0 && filteredCerts.length === 0 && (
          <div className="bg-white rounded-2xl border border-neutral-200 p-xl text-center">
            <p className="text-4xl mb-md">✅</p>
            <p className="font-bold text-lg">All clear</p>
            <p className="text-sm text-neutral-500 mt-xs">
              {filter === 'mine'      ? 'No tasks assigned to you.'  :
               filter === 'deadlines' ? `Nothing due in the next ${HORIZONS.find(h => h.value === horizon)?.label}.` :
               'No open tasks or cert alerts.'}
            </p>
          </div>
        )}
      </div>

      {emailCert && (
        <EmailSupplierModal
          cert={emailCert}
          contractors={contractors}
          onClose={() => setEmailCert(null)}
        />
      )}

      {completingCert && (
        <CompleteCertModal
          cert={completingCert}
          onClose={() => setCompletingCert(null)}
          onSaved={async () => { setCompletingCert(null); await loadAll() }}
        />
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Section({ title, count, countColor = 'bg-neutral-100 text-neutral-500', children }: {
  title: string; count: number; countColor?: string; children: React.ReactNode
}) {
  return (
    <div className="space-y-xs">
      <div className="flex items-center gap-sm px-xs">
        <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">{title}</p>
        <span className={`text-xs font-bold px-xs py-0.5 rounded-full ${countColor}`}>{count}</span>
      </div>
      {children}
    </div>
  )
}

function CertRow({ cert, onEmail, onComplete }: { cert: CertAlert; onEmail: () => void; onComplete: () => void }) {
  const icon = CERT_CHECKS.find(c => c.label === cert.label)?.icon || '📋'
  const due  = fmtDate(cert.expiry)
  return (
    <div className={`bg-white rounded-2xl border p-md flex items-center gap-sm ${cert.days < 0 ? 'border-l-4 border-l-red-400 border-neutral-200' : cert.days <= 14 ? 'border-l-4 border-l-amber-400 border-neutral-200' : 'border-neutral-200'}`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${cert.days < 0 ? 'bg-red-50' : 'bg-amber-50'}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-neutral-900">{cert.label}</p>
        <p className="text-xs text-neutral-500">{cert.property_name}</p>
      </div>
      <div className="flex items-center gap-xs">
        <span className={`text-xs font-bold ${due.cls}`}>{due.label}</span>
        <button
          onClick={onEmail}
          className="text-xs font-semibold px-sm py-xs rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-50 transition whitespace-nowrap"
        >
          📧 Book
        </button>
        <button
          onClick={onComplete}
          className="text-xs font-semibold px-sm py-xs rounded-lg border border-green-200 text-green-700 hover:bg-green-50 transition whitespace-nowrap"
        >
          ✓ Done
        </button>
      </div>
    </div>
  )
}

function GlobalTaskRow({ task, onToggle, onConvert, converting }: {
  task: Task
  onToggle:   (t: Task) => void
  onConvert:  (t: Task) => void
  converting: boolean
}) {
  const due = task.due_date ? fmtDate(task.due_date) : null
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 p-md flex items-start gap-sm">
      <button
        onClick={() => onToggle(task)}
        className="w-5 h-5 rounded-md border-2 border-neutral-300 hover:border-neutral-500 flex items-center justify-center flex-shrink-0 mt-0.5 transition"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-neutral-900 leading-snug">{task.description}</p>
        <div className="flex items-center gap-xs mt-xs flex-wrap">
          <Link href={`/admin/properties/${task.property_id}?tab=tasks`} className="text-xs font-semibold text-neutral-500 hover:underline">
            {task.properties?.name}
          </Link>
          {task.responsible && (
            <span className="text-xs font-semibold px-xs py-0.5 rounded-full bg-neutral-100 text-neutral-600">
              {task.responsible}
            </span>
          )}
          {due && <span className={`text-xs ${due.cls}`}>{due.label}</span>}
          {task.notes && <span className="text-xs text-neutral-400 truncate max-w-xs">{task.notes}</span>}
        </div>
      </div>
      <div className="flex gap-xs flex-shrink-0">
        {!task.ticket_id && (
          <button
            onClick={() => onConvert(task)}
            disabled={converting}
            className="text-xs font-semibold px-sm py-xs rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-50 disabled:opacity-50 transition"
          >
            {converting ? '…' : '🔧'}
          </button>
        )}
      </div>
    </div>
  )
}
