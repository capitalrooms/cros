'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'

// ── Constants ────────────────────────────────────────────────────────────────

const TRADE_OPTIONS = [
  'General maintenance', 'Plumber', 'Electrician', 'Gas engineer',
  'Carpenter / joiner', 'Painter & decorator', 'Plasterer', 'Tiler',
  'Roofer', 'Glazier', 'Locksmith', 'Gardener / landscaper',
  'Cleaner / housekeeper', 'Appliance repair', 'HVAC / boiler', 'Other',
]

const STATUS_COLOURS: Record<string, string> = {
  open:        'bg-yellow-100 text-yellow-800 border-yellow-200',
  booked:      'bg-blue-100 text-blue-800 border-blue-200',
  in_progress: 'bg-purple-100 text-purple-800 border-purple-200',
  completed:   'bg-green-100 text-green-800 border-green-200',
  cancelled:   'bg-neutral-100 text-neutral-500 border-neutral-200',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function daysUntil(d: string | null | undefined): number | null {
  if (!d) return null
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)
}

function ExpiryBadge({ date, warnDays = 60 }: { date?: string | null; warnDays?: number }) {
  if (!date) return <span className="text-neutral-400 text-sm">—</span>
  const days = daysUntil(date)
  if (days === null) return <span className="text-neutral-400 text-sm">—</span>
  if (days < 0) return <span className="text-xs font-semibold px-sm py-xs rounded-full bg-red-100 text-red-800 border border-red-200">Expired {fmt(date)}</span>
  if (days <= warnDays) return <span className="text-xs font-semibold px-sm py-xs rounded-full bg-amber-100 text-amber-800 border border-amber-200">Expires {fmt(date)} ({days}d)</span>
  return <span className="text-sm font-semibold text-neutral-900">{fmt(date)}</span>
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-neutral-400 mb-xs">{label}</p>
      <p className="text-sm font-semibold text-neutral-900">{value || '—'}</p>
    </div>
  )
}

function inputCls(extra = '') {
  return `w-full rounded-lg border border-neutral-200 bg-white px-md py-sm text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-400 ${extra}`
}

function gbp(n: any) { return n ? `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—' }

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ContractorProfilePage({ params }: { params: Promise<{ personId: string }> }) {
  const router       = useRouter()
  const { personId } = use(params)
  const supabase     = createClient()

  const [person, setPerson]   = useState<any | null>(null)
  const [jobs, setJobs]       = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'contact' | 'qualifications' | 'rates' | 'jobs' | 'notes'>('overview')

  // Edit contact
  const [editingContact, setEditingContact] = useState(false)
  const [savingContact, setSavingContact]   = useState(false)
  const [contactForm, setContactForm]       = useState<any>({})

  // Edit qualifications
  const [editingQual, setEditingQual] = useState(false)
  const [savingQual, setSavingQual]   = useState(false)
  const [qualForm, setQualForm]       = useState<any>({})

  // Edit rates
  const [editingRates, setEditingRates] = useState(false)
  const [savingRates, setSavingRates]   = useState(false)
  const [ratesForm, setRatesForm]       = useState<any>({})

  // Notes
  const [notes, setNotes]         = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesDirty, setNotesDirty]   = useState(false)

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser()
      if (!user || !['administrator', 'admin'].includes(user.assignment?.role || '')) {
        router.push('/login'); return
      }
      const { data: p } = await supabase.from('people').select('*').eq('id', personId).single()
      if (!p) { router.push('/admin/people'); return }
      setPerson(p)
      setNotes(p.contractor_notes || '')
      setContactForm({
        salutation: p.salutation || '',
        first_name: p.first_name || '',
        last_name:  p.last_name || '',
        email:      p.email || '',
        phone:      p.phone || '',
        company:    p.company || '',
        home_address: p.home_address || '',
        emergency_contact_name:  p.emergency_contact_name || '',
        emergency_contact_phone: p.emergency_contact_phone || '',
        service_area_notes: p.service_area_notes || '',
      })
      setQualForm({
        trade_types:             p.trade_types || [],
        insurance_company:       p.insurance_company || '',
        insurance_policy_number: p.insurance_policy_number || '',
        insurance_expiry:        p.insurance_expiry || '',
        insurance_value_gbp:     p.insurance_value_gbp || '',
        dbs_checked_at:          p.dbs_checked_at || '',
        dbs_certificate_number:  p.dbs_certificate_number || '',
        dbs_expiry:              p.dbs_expiry || '',
        gas_safe_number:         p.gas_safe_number || '',
        gas_safe_expiry:         p.gas_safe_expiry || '',
        electrical_cert_number:  p.electrical_cert_number || '',
        electrical_cert_expiry:  p.electrical_cert_expiry || '',
      })
      setRatesForm({
        hourly_rate: p.hourly_rate || '',
        callout_fee: p.callout_fee || '',
        day_rate:    p.day_rate || '',
      })

      // Fetch jobs (maintenance tickets)
      const { data: j } = await supabase
        .from('maintenance_tickets')
        .select('id, title, status, booked_date, created_at, properties(name, address), rooms(name)')
        .eq('contractor_id', personId)
        .order('created_at', { ascending: false })
        .limit(100)
      setJobs(j || [])
      setLoading(false)
    }
    init()
  }, [personId, router])

  /* ── Save contact ── */
  async function saveContact() {
    setSavingContact(true)
    const full_name = [contactForm.first_name, contactForm.last_name].filter(Boolean).join(' ')
    const { error } = await supabase.from('people').update({
      salutation: contactForm.salutation || null,
      first_name: contactForm.first_name || null,
      last_name:  contactForm.last_name || null,
      full_name:  full_name || null,
      email:      contactForm.email,
      phone:      contactForm.phone || null,
      company:    contactForm.company || null,
      home_address: contactForm.home_address || null,
      emergency_contact_name:  contactForm.emergency_contact_name || null,
      emergency_contact_phone: contactForm.emergency_contact_phone || null,
      service_area_notes: contactForm.service_area_notes || null,
    }).eq('id', personId)
    if (!error) { setPerson((p: any) => ({ ...p, ...contactForm, full_name })); setEditingContact(false) }
    else alert(error.message)
    setSavingContact(false)
  }

  /* ── Save qualifications ── */
  async function saveQual() {
    setSavingQual(true)
    const { error } = await supabase.from('people').update({
      trade_types:             qualForm.trade_types.length > 0 ? qualForm.trade_types : null,
      insurance_company:       qualForm.insurance_company || null,
      insurance_policy_number: qualForm.insurance_policy_number || null,
      insurance_expiry:        qualForm.insurance_expiry || null,
      insurance_value_gbp:     qualForm.insurance_value_gbp ? Number(qualForm.insurance_value_gbp) : null,
      dbs_checked_at:          qualForm.dbs_checked_at || null,
      dbs_certificate_number:  qualForm.dbs_certificate_number || null,
      dbs_expiry:              qualForm.dbs_expiry || null,
      gas_safe_number:         qualForm.gas_safe_number || null,
      gas_safe_expiry:         qualForm.gas_safe_expiry || null,
      electrical_cert_number:  qualForm.electrical_cert_number || null,
      electrical_cert_expiry:  qualForm.electrical_cert_expiry || null,
    }).eq('id', personId)
    if (!error) { setPerson((p: any) => ({ ...p, ...qualForm })); setEditingQual(false) }
    else alert(error.message)
    setSavingQual(false)
  }

  /* ── Save rates ── */
  async function saveRates() {
    setSavingRates(true)
    const { error } = await supabase.from('people').update({
      hourly_rate: ratesForm.hourly_rate ? Number(ratesForm.hourly_rate) : null,
      callout_fee: ratesForm.callout_fee ? Number(ratesForm.callout_fee) : null,
      day_rate:    ratesForm.day_rate    ? Number(ratesForm.day_rate)    : null,
    }).eq('id', personId)
    if (!error) { setPerson((p: any) => ({ ...p, ...ratesForm })); setEditingRates(false) }
    else alert(error.message)
    setSavingRates(false)
  }

  /* ── Save notes ── */
  async function saveNotes() {
    setSavingNotes(true)
    await supabase.from('people').update({ contractor_notes: notes || null }).eq('id', personId)
    setNotesDirty(false)
    setSavingNotes(false)
  }

  if (loading || !person) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton href="/admin/people" />} />
        <div className="flex items-center justify-center py-3xl"><p className="text-sm text-neutral-400">Loading…</p></div>
      </div>
    )
  }

  const displayName = [person.salutation, person.first_name, person.last_name].filter(Boolean).join(' ') || person.full_name || person.email
  const isContractor = person.role === 'contractor'
  const isCleaner    = person.role === 'cleaner'
  const roleLabel    = isContractor ? 'Contractor' : isCleaner ? 'Cleaner / Housekeeper' : person.role
  const backHref     = `/admin/people?tab=${isContractor ? 'staff' : 'staff'}`

  // Expiry warnings
  const warnings: string[] = []
  if (daysUntil(person.insurance_expiry) !== null && (daysUntil(person.insurance_expiry) ?? 999) <= 60) warnings.push('Insurance expires soon')
  if (daysUntil(person.dbs_expiry) !== null && (daysUntil(person.dbs_expiry) ?? 999) <= 60) warnings.push('DBS check expires soon')
  if (daysUntil(person.gas_safe_expiry) !== null && (daysUntil(person.gas_safe_expiry) ?? 999) <= 60) warnings.push('Gas Safe licence expires soon')

  const TABS = [
    { id: 'overview'        as const, label: 'Overview' },
    { id: 'contact'         as const, label: 'Contact' },
    { id: 'qualifications'  as const, label: 'Qualifications & insurance' },
    { id: 'rates'           as const, label: 'Rates' },
    { id: 'jobs'            as const, label: `Job history (${jobs.length})` },
    { id: 'notes'           as const, label: 'Internal notes' },
  ]

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin/people" />} />

      <main className="mx-auto max-w-6xl px-lg py-xl">

        {/* Header */}
        <div className="rounded-xl border border-neutral-200 bg-white px-xl py-lg mb-xl">
          <div className="flex items-start justify-between gap-lg">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-xs">{roleLabel}</p>
              <h1 className="text-2xl font-bold text-neutral-900">{displayName}</h1>
              <p className="text-sm text-neutral-400 mt-xs">{person.email}</p>
              {person.phone && <p className="text-sm text-neutral-400">{person.phone}</p>}
              {person.company && <p className="text-sm text-neutral-500 mt-xs font-medium">{person.company}</p>}
              {(person.trade_types || []).length > 0 && (
                <div className="flex flex-wrap gap-xs mt-md">
                  {(person.trade_types as string[]).map(t => (
                    <span key={t} className="text-xs font-semibold px-sm py-xs rounded-full bg-blue-50 text-blue-800 border border-blue-100">{t}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="text-right space-y-xs shrink-0">
              {warnings.length > 0 && (
                <div className="space-y-xs">
                  {warnings.map(w => (
                    <div key={w} className="text-xs font-semibold px-md py-xs rounded-full bg-amber-50 text-amber-800 border border-amber-200">⚠ {w}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-xs mb-xl border-b border-neutral-200 overflow-x-auto">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 px-lg py-md text-sm font-semibold transition whitespace-nowrap ${
                activeTab === tab.id ? 'text-neutral-900 border-b-2 border-neutral-900' : 'text-neutral-400 hover:text-neutral-700'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ══ OVERVIEW ══ */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-xl">

            {/* Contact summary */}
            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
              <div className="px-xl py-lg border-b border-neutral-100 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Contact</p>
                <button onClick={() => setActiveTab('contact')} className="text-xs font-semibold text-blue-600 hover:underline">Edit →</button>
              </div>
              <div className="px-xl py-lg space-y-md">
                <Field label="Email" value={person.email} />
                <Field label="Phone" value={person.phone} />
                {person.company && <Field label="Company" value={person.company} />}
                {person.home_address && <Field label="Address" value={person.home_address} />}
                {person.emergency_contact_name && (
                  <Field label="Emergency contact" value={`${person.emergency_contact_name}${person.emergency_contact_phone ? ` · ${person.emergency_contact_phone}` : ''}`} />
                )}
                {person.service_area_notes && <Field label="Service area" value={person.service_area_notes} />}
              </div>
            </div>

            {/* Rates summary */}
            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
              <div className="px-xl py-lg border-b border-neutral-100 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Rates</p>
                <button onClick={() => setActiveTab('rates')} className="text-xs font-semibold text-blue-600 hover:underline">Edit →</button>
              </div>
              <div className="px-xl py-lg space-y-md">
                <Field label="Hourly rate" value={gbp(person.hourly_rate)} />
                <Field label="Call-out fee" value={gbp(person.callout_fee)} />
                <Field label="Day rate" value={gbp(person.day_rate)} />
              </div>
            </div>

            {/* Qualifications summary */}
            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden md:col-span-2">
              <div className="px-xl py-lg border-b border-neutral-100 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Qualifications & compliance</p>
                <button onClick={() => setActiveTab('qualifications')} className="text-xs font-semibold text-blue-600 hover:underline">Edit →</button>
              </div>
              <div className="px-xl py-lg">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-xl">
                  <div>
                    <p className="text-xs text-neutral-400 mb-xs">Public liability insurance</p>
                    <ExpiryBadge date={person.insurance_expiry} />
                    {person.insurance_company && <p className="text-xs text-neutral-500 mt-xs">{person.insurance_company}</p>}
                    {person.insurance_value_gbp && <p className="text-xs text-neutral-500">Cover: {gbp(person.insurance_value_gbp)}</p>}
                  </div>
                  <div>
                    <p className="text-xs text-neutral-400 mb-xs">DBS check</p>
                    <ExpiryBadge date={person.dbs_expiry} warnDays={90} />
                    {person.dbs_checked_at && <p className="text-xs text-neutral-500 mt-xs">Checked {fmt(person.dbs_checked_at)}</p>}
                  </div>
                  <div>
                    <p className="text-xs text-neutral-400 mb-xs">Gas Safe</p>
                    {person.gas_safe_number
                      ? <><ExpiryBadge date={person.gas_safe_expiry} /><p className="text-xs text-neutral-500 mt-xs">No. {person.gas_safe_number}</p></>
                      : <span className="text-sm text-neutral-400">Not registered</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* Recent jobs */}
            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden md:col-span-2">
              <div className="px-xl py-lg border-b border-neutral-100 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Recent jobs</p>
                <button onClick={() => setActiveTab('jobs')} className="text-xs font-semibold text-blue-600 hover:underline">All jobs ({jobs.length}) →</button>
              </div>
              {jobs.length === 0 ? (
                <div className="px-xl py-lg text-sm text-neutral-400">No jobs assigned yet.</div>
              ) : (
                <div className="divide-y divide-neutral-100">
                  {jobs.slice(0, 5).map(j => (
                    <a key={j.id} href={`/admin/maintenance?ticket=${j.id}`}
                      className="flex items-center gap-md px-xl py-md hover:bg-neutral-50 transition cursor-pointer">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-neutral-900 truncate">{j.title}</p>
                        <p className="text-xs text-neutral-400">{j.properties?.name || j.properties?.address || '—'}{j.rooms?.name ? ` · ${j.rooms.name}` : ''}</p>
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-xs">
                        <span className={`text-xs font-semibold px-sm py-xs rounded-full border capitalize ${STATUS_COLOURS[j.status] || 'bg-neutral-100 text-neutral-600 border-neutral-200'}`}>
                          {j.status?.replace('_', ' ')}
                        </span>
                        <span className="text-xs text-neutral-400">{j.booked_date ? fmt(j.booked_date) : fmt(j.created_at)}</span>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ CONTACT ══ */}
        {activeTab === 'contact' && (
          <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
            <div className="px-xl py-lg border-b border-neutral-100 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Contact details</p>
              {!editingContact && (
                <button onClick={() => setEditingContact(true)}
                  className="text-xs font-semibold border border-neutral-200 px-md py-xs rounded-lg hover:bg-neutral-50">
                  Edit
                </button>
              )}
            </div>
            <div className="px-xl py-xl">
              {editingContact ? (
                <div className="space-y-lg">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-md">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Salutation</label>
                      <select className={inputCls()} value={contactForm.salutation} onChange={e => setContactForm((p: any) => ({ ...p, salutation: e.target.value }))}>
                        <option value="">—</option>
                        {['Mr','Mrs','Ms','Miss','Dr','Mx'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">First name</label>
                      <input className={inputCls()} value={contactForm.first_name} onChange={e => setContactForm((p: any) => ({ ...p, first_name: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Last name</label>
                      <input className={inputCls()} value={contactForm.last_name} onChange={e => setContactForm((p: any) => ({ ...p, last_name: e.target.value }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Email</label>
                      <input type="email" className={inputCls()} value={contactForm.email} onChange={e => setContactForm((p: any) => ({ ...p, email: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Phone</label>
                      <input type="tel" className={inputCls()} value={contactForm.phone} onChange={e => setContactForm((p: any) => ({ ...p, phone: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Company / trading name</label>
                      <input className={inputCls()} value={contactForm.company} onChange={e => setContactForm((p: any) => ({ ...p, company: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Address</label>
                      <input className={inputCls()} value={contactForm.home_address} onChange={e => setContactForm((p: any) => ({ ...p, home_address: e.target.value }))} />
                    </div>
                  </div>
                  <div className="border-t border-neutral-100 pt-lg">
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-md">Emergency contact</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
                      <div>
                        <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Name</label>
                        <input className={inputCls()} value={contactForm.emergency_contact_name} onChange={e => setContactForm((p: any) => ({ ...p, emergency_contact_name: e.target.value }))} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Phone</label>
                        <input type="tel" className={inputCls()} value={contactForm.emergency_contact_phone} onChange={e => setContactForm((p: any) => ({ ...p, emergency_contact_phone: e.target.value }))} />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Service area / coverage notes</label>
                    <textarea rows={2} className={inputCls()} placeholder="e.g. Oxford, Abingdon, Didcot — no more than 20 miles" value={contactForm.service_area_notes} onChange={e => setContactForm((p: any) => ({ ...p, service_area_notes: e.target.value }))} />
                  </div>
                  <div className="flex gap-sm pt-sm border-t border-neutral-100">
                    <button onClick={saveContact} disabled={savingContact}
                      className="px-xl py-sm rounded-xl bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-700 disabled:opacity-40 transition">
                      {savingContact ? 'Saving…' : 'Save changes'}
                    </button>
                    <button onClick={() => setEditingContact(false)}
                      className="px-xl py-sm rounded-xl border border-neutral-200 text-sm font-semibold text-neutral-600 hover:bg-neutral-50 transition">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-xl">
                  <div className="space-y-md">
                    <Field label="Name" value={displayName} />
                    <Field label="Email" value={person.email} />
                    <Field label="Phone" value={person.phone} />
                    <Field label="Company" value={person.company} />
                    <Field label="Address" value={person.home_address} />
                  </div>
                  <div className="space-y-md">
                    <Field label="Emergency contact" value={person.emergency_contact_name} />
                    <Field label="Emergency phone" value={person.emergency_contact_phone} />
                    <Field label="Service area" value={person.service_area_notes} />
                    <Field label="Member since" value={fmt(person.created_at)} />
                    <Field label="Using app" value={person.using_app ? 'Yes' : 'Not yet'} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ QUALIFICATIONS & INSURANCE ══ */}
        {activeTab === 'qualifications' && (
          <div className="space-y-lg">

            {/* Trade types */}
            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
              <div className="px-xl py-lg border-b border-neutral-100 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Trade types</p>
                {!editingQual && (
                  <button onClick={() => setEditingQual(true)}
                    className="text-xs font-semibold border border-neutral-200 px-md py-xs rounded-lg hover:bg-neutral-50">
                    Edit all
                  </button>
                )}
              </div>
              <div className="px-xl py-lg">
                {!editingQual ? (
                  (person.trade_types || []).length === 0
                    ? <p className="text-sm text-neutral-400">No trade types set.</p>
                    : <div className="flex flex-wrap gap-sm">
                        {(person.trade_types as string[]).map(t => (
                          <span key={t} className="text-sm font-semibold px-md py-xs rounded-full bg-blue-50 text-blue-800 border border-blue-100">{t}</span>
                        ))}
                      </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-sm">
                    {TRADE_OPTIONS.map(t => {
                      const checked = qualForm.trade_types.includes(t)
                      return (
                        <label key={t} className={`flex items-center gap-sm p-sm rounded-lg border cursor-pointer transition text-sm ${checked ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 hover:border-neutral-300'}`}>
                          <input type="checkbox" checked={checked} className="rounded"
                            onChange={() => setQualForm((q: any) => ({ ...q, trade_types: checked ? q.trade_types.filter((x: string) => x !== t) : [...q.trade_types, t] }))} />
                          {t}
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Insurance */}
            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
              <div className="px-xl py-lg border-b border-neutral-100">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Public liability insurance</p>
              </div>
              <div className="px-xl py-lg">
                {!editingQual ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-xl">
                    <div className="space-y-md">
                      <Field label="Insurance company" value={person.insurance_company} />
                      <Field label="Policy number" value={person.insurance_policy_number} />
                    </div>
                    <div className="space-y-md">
                      <div>
                        <p className="text-xs text-neutral-400 mb-xs">Expiry date</p>
                        <ExpiryBadge date={person.insurance_expiry} />
                      </div>
                      <Field label="Cover value" value={person.insurance_value_gbp ? gbp(person.insurance_value_gbp) : null} />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Insurance company</label>
                      <input className={inputCls()} value={qualForm.insurance_company} onChange={e => setQualForm((q: any) => ({ ...q, insurance_company: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Policy number</label>
                      <input className={inputCls()} value={qualForm.insurance_policy_number} onChange={e => setQualForm((q: any) => ({ ...q, insurance_policy_number: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Expiry date</label>
                      <input type="date" className={inputCls()} value={qualForm.insurance_expiry} onChange={e => setQualForm((q: any) => ({ ...q, insurance_expiry: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Cover value (£)</label>
                      <input type="number" className={inputCls()} placeholder="e.g. 1000000" value={qualForm.insurance_value_gbp} onChange={e => setQualForm((q: any) => ({ ...q, insurance_value_gbp: e.target.value }))} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* DBS */}
            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
              <div className="px-xl py-lg border-b border-neutral-100">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">DBS check</p>
              </div>
              <div className="px-xl py-lg">
                {!editingQual ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-xl">
                    <div>
                      <p className="text-xs text-neutral-400 mb-xs">Check date</p>
                      <p className="text-sm font-semibold text-neutral-900">{fmt(person.dbs_checked_at)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-neutral-400 mb-xs">Certificate number</p>
                      <p className="text-sm font-semibold text-neutral-900">{person.dbs_certificate_number || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-neutral-400 mb-xs">Expiry</p>
                      <ExpiryBadge date={person.dbs_expiry} warnDays={90} />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-md">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Check date</label>
                      <input type="date" className={inputCls()} value={qualForm.dbs_checked_at} onChange={e => setQualForm((q: any) => ({ ...q, dbs_checked_at: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Certificate number</label>
                      <input className={inputCls()} value={qualForm.dbs_certificate_number} onChange={e => setQualForm((q: any) => ({ ...q, dbs_certificate_number: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Expiry date</label>
                      <input type="date" className={inputCls()} value={qualForm.dbs_expiry} onChange={e => setQualForm((q: any) => ({ ...q, dbs_expiry: e.target.value }))} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Gas Safe / Electrical */}
            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
              <div className="px-xl py-lg border-b border-neutral-100">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Specialist registrations</p>
              </div>
              <div className="px-xl py-lg">
                {!editingQual ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-xl">
                    <div className="space-y-md">
                      <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Gas Safe Register</p>
                      <Field label="Licence number" value={person.gas_safe_number} />
                      <div>
                        <p className="text-xs text-neutral-400 mb-xs">Expiry</p>
                        <ExpiryBadge date={person.gas_safe_expiry} />
                      </div>
                    </div>
                    <div className="space-y-md">
                      <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">NICEIC / NAPIT (Electrical)</p>
                      <Field label="Registration number" value={person.electrical_cert_number} />
                      <div>
                        <p className="text-xs text-neutral-400 mb-xs">Expiry</p>
                        <ExpiryBadge date={person.electrical_cert_expiry} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-md">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Gas Safe number</label>
                      <input className={inputCls()} value={qualForm.gas_safe_number} onChange={e => setQualForm((q: any) => ({ ...q, gas_safe_number: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Gas Safe expiry</label>
                      <input type="date" className={inputCls()} value={qualForm.gas_safe_expiry} onChange={e => setQualForm((q: any) => ({ ...q, gas_safe_expiry: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">NICEIC/NAPIT number</label>
                      <input className={inputCls()} value={qualForm.electrical_cert_number} onChange={e => setQualForm((q: any) => ({ ...q, electrical_cert_number: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">NICEIC/NAPIT expiry</label>
                      <input type="date" className={inputCls()} value={qualForm.electrical_cert_expiry} onChange={e => setQualForm((q: any) => ({ ...q, electrical_cert_expiry: e.target.value }))} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {editingQual && (
              <div className="flex gap-sm">
                <button onClick={saveQual} disabled={savingQual}
                  className="px-xl py-sm rounded-xl bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-700 disabled:opacity-40 transition">
                  {savingQual ? 'Saving…' : 'Save all changes'}
                </button>
                <button onClick={() => setEditingQual(false)}
                  className="px-xl py-sm rounded-xl border border-neutral-200 text-sm font-semibold text-neutral-600 hover:bg-neutral-50 transition">
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* ══ RATES ══ */}
        {activeTab === 'rates' && (
          <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
            <div className="px-xl py-lg border-b border-neutral-100 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Rates</p>
                <p className="text-xs text-neutral-400 mt-xs">For reference — used when estimating job costs.</p>
              </div>
              {!editingRates && (
                <button onClick={() => setEditingRates(true)}
                  className="text-xs font-semibold border border-neutral-200 px-md py-xs rounded-lg hover:bg-neutral-50">
                  Edit
                </button>
              )}
            </div>
            <div className="px-xl py-xl">
              {editingRates ? (
                <div className="space-y-lg">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-md">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Hourly rate (£)</label>
                      <input type="number" step="0.01" min="0" className={inputCls()} placeholder="e.g. 45.00" value={ratesForm.hourly_rate} onChange={e => setRatesForm((r: any) => ({ ...r, hourly_rate: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Call-out fee (£)</label>
                      <input type="number" step="0.01" min="0" className={inputCls()} placeholder="e.g. 60.00" value={ratesForm.callout_fee} onChange={e => setRatesForm((r: any) => ({ ...r, callout_fee: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Day rate (£)</label>
                      <input type="number" step="0.01" min="0" className={inputCls()} placeholder="e.g. 350.00" value={ratesForm.day_rate} onChange={e => setRatesForm((r: any) => ({ ...r, day_rate: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex gap-sm pt-sm border-t border-neutral-100">
                    <button onClick={saveRates} disabled={savingRates}
                      className="px-xl py-sm rounded-xl bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-700 disabled:opacity-40 transition">
                      {savingRates ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={() => setEditingRates(false)}
                      className="px-xl py-sm rounded-xl border border-neutral-200 text-sm font-semibold text-neutral-600 hover:bg-neutral-50 transition">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-xl">
                  <Field label="Hourly rate" value={gbp(person.hourly_rate)} />
                  <Field label="Call-out fee" value={gbp(person.callout_fee)} />
                  <Field label="Day rate" value={gbp(person.day_rate)} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ JOB HISTORY ══ */}
        {activeTab === 'jobs' && (
          <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
            {jobs.length === 0 ? (
              <div className="p-xl text-center text-sm text-neutral-400">No jobs assigned to this contractor.</div>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400 border-b border-neutral-100">
                    <th className="px-xl py-sm">Job</th>
                    <th className="px-xl py-sm hidden sm:table-cell">Property / room</th>
                    <th className="px-xl py-sm hidden md:table-cell">Date</th>
                    <th className="px-xl py-sm text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map(j => (
                    <tr key={j.id} className="border-t border-neutral-100 hover:bg-neutral-50 transition cursor-pointer"
                      onClick={() => window.open(`/admin/maintenance/${j.id}`, '_blank')}>
                      <td className="px-xl py-md font-medium text-neutral-900">{j.title}</td>
                      <td className="px-xl py-md hidden sm:table-cell text-neutral-500 text-xs">
                        {j.properties?.name || j.properties?.address || '—'}
                        {j.rooms?.name ? ` · ${j.rooms.name}` : ''}
                      </td>
                      <td className="px-xl py-md hidden md:table-cell text-neutral-500">{j.booked_date ? fmt(j.booked_date) : fmt(j.created_at)}</td>
                      <td className="px-xl py-md text-right">
                        <span className={`text-xs font-semibold px-sm py-xs rounded-full border capitalize ${STATUS_COLOURS[j.status] || 'bg-neutral-100 text-neutral-600 border-neutral-200'}`}>
                          {j.status?.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ══ INTERNAL NOTES ══ */}
        {activeTab === 'notes' && (
          <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
            <div className="px-xl py-lg border-b border-neutral-100 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Internal notes</p>
              {notesDirty && (
                <button onClick={saveNotes} disabled={savingNotes}
                  className="text-xs font-semibold bg-neutral-900 text-white px-md py-xs rounded-lg disabled:opacity-40">
                  {savingNotes ? 'Saving…' : 'Save notes'}
                </button>
              )}
            </div>
            <div className="px-xl py-lg">
              <textarea
                rows={8}
                className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-md py-sm text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-400 resize-y"
                placeholder="Internal notes visible only to staff — reliability, preferences, special arrangements, issues…"
                value={notes}
                onChange={e => { setNotes(e.target.value); setNotesDirty(true) }}
              />
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
