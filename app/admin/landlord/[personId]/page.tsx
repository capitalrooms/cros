'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import LandlordCard, { fromPeople, LandlordCardData, LandlordProperty } from '@/app/components/LandlordCard'
import { landlordName } from '@/lib/people'
import { sortPropertiesNumerically } from '@/lib/sortProperties'
import { withOptionalColumns } from '@/lib/optionalColumns'

// ── Constants ────────────────────────────────────────────────────────────────

const STAGES: Record<number, string> = {
  1: 'New enquiry', 2: 'Welcome pack sent', 3: 'Docs received',
  4: 'Verified', 5: 'Agreement sent', 6: 'Fully onboarded',
}

const VERIFICATION_CHECKS = [
  { key: 'id_genuine',      label: 'ID document is genuine and legible' },
  { key: 'id_matches_name', label: 'ID matches the name provided' },
  { key: 'poa_dated',       label: 'Proof of address dated within 3 months' },
  { key: 'ownership_match', label: 'Proof of ownership matches the property' },
  { key: 'sanctions_check', label: 'Sanctions list check completed — no match' },
  { key: 'pep_check',       label: 'PEP check completed — no flag' },
]

const DOCUMENT_TYPES = [
  { key: 'passport',        label: 'Passport' },
  { key: 'photo_id',        label: 'Photo ID / Driving Licence' },
  { key: 'utility_bill',    label: 'Utility bill (proof of address)' },
  { key: 'bank_statement',  label: 'Bank statement' },
  { key: 'proof_ownership', label: 'Proof of ownership (Land Registry / title deeds)' },
  { key: 'mortgage_letter', label: 'Mortgage letter' },
  { key: 'company_docs',    label: 'Company registration documents' },
  { key: 'other',           label: 'Other document' },
]

const NOTIF_CATEGORIES = [
  { key: 'urgent',               label: '🚨 Urgent issues' },
  { key: 'job_approval',         label: '✅ Job approvals' },
  { key: 'job_updates',          label: '🔧 Job updates' },
  { key: 'rent_received',        label: '💷 Rent received' },
  { key: 'rent_arrears',         label: '⚠️ Rent arrears' },
  { key: 'financial_statements', label: '📄 Monthly statements' },
  { key: 'compliance_expiry',    label: '📋 Compliance expiry' },
  { key: 'compliance_breach',    label: '🔴 Compliance breach' },
  { key: 'tenant_changes',       label: '🏠 Tenant changes' },
  { key: 'cleaner_visits',       label: '🧹 Cleaner visits' },
  { key: 'viewings',             label: '👀 Viewings' },
]

const MGMT_TYPES = [
  { value: 'full_management',  label: 'Full management' },
  { value: 'rent_collection',  label: 'Rent collection' },
  { value: 'let_only',         label: 'Let only' },
  { value: 'tenant_find',      label: 'Tenant find' },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function riskBadge(level: string | null | undefined) {
  if (!level) return <span className="text-xs text-neutral-400">Not assessed</span>
  const map: Record<string, string> = {
    low:    'bg-green-100 text-green-800 border-green-200',
    medium: 'bg-amber-100 text-amber-800 border-amber-200',
    high:   'bg-red-100 text-red-800 border-red-200',
  }
  return (
    <span className={`text-xs font-semibold px-sm py-xs rounded-full border capitalize ${map[level] || 'bg-neutral-100 text-neutral-600 border-neutral-200'}`}>
      {level} risk
    </span>
  )
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

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LandlordProfilePage({ params }: { params: Promise<{ personId: string }> }) {
  const router       = useRouter()
  const { personId } = use(params)

  const [cardData, setCardData]         = useState<LandlordCardData | null>(null)
  const [person, setPerson]             = useState<any | null>(null)
  const [properties, setProperties]     = useState<any[]>([])
  const [amlRecords, setAmlRecords]     = useState<any[]>([])
  const [statements, setStatements]     = useState<any[]>([])
  const [notifPrefs, setNotifPrefs]     = useState<Record<string, boolean>>({})
  const [bankAccounts, setBankAccounts] = useState<any[]>([])
  const [loading, setLoading]           = useState(true)
  const [activeTab, setActiveTab]       = useState<'overview' | 'contact' | 'bank' | 'agreement' | 'properties' | 'aml' | 'statements' | 'notifications'>('overview')

  // AML tab state
  const [expandedAml, setExpandedAml]   = useState<string | null>(null)
  const [showNewAml, setShowNewAml]     = useState(false)
  const [savingNewAml, setSavingNewAml] = useState(false)
  const [newAml, setNewAml] = useState({
    entity_type: 'individual', risk_level: '', risk_reason: '', verification_notes: '',
    docs_received_at: new Date().toISOString().split('T')[0], identity_verified: false,
    verification_checks: [] as string[], identity_docs: [] as string[],
  })

  // Edit contact state
  const [editingContact, setEditingContact] = useState(false)
  const [savingContact, setSavingContact]   = useState(false)
  // shown on the page (not a pop-up) so a failed save is never missed
  const [contactMsg, setContactMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [contactForm, setContactForm]       = useState<any>({})

  // Edit agreement state
  const [editingAgreement, setEditingAgreement] = useState(false)
  const [savingAgreement, setSavingAgreement]   = useState(false)
  const [agreementForm, setAgreementForm]       = useState<any>({})

  // Bank account state
  const [showBankForm, setShowBankForm]   = useState(false)
  const [savingBank, setSavingBank]       = useState(false)
  const [bankForm, setBankForm]           = useState({ account_label: '', bank_name: '', account_name: '', sort_code: '', account_number: '', iban: '', swift: '', is_default: false })
  const [editingBankId, setEditingBankId] = useState<string | null>(null)

  // Notes state
  const [notes, setNotes]       = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesDirty, setNotesDirty]   = useState(false)

  // Other action state
  const [inviting, setInviting]           = useState(false)
  const [inviteMsg, setInviteMsg]         = useState<string | null>(null)
  const [togglingComms, setTogglingComms] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser()
      if (!user || (user.assignment?.role !== 'administrator' && user.assignment?.role !== 'admin')) {
        router.push('/login'); return
      }

      const { data: p } = await supabase.from('people').select('*').eq('id', personId).single()
      if (!p) { router.push('/admin/landlords'); return }
      setPerson(p)
      setNotes(p.landlord_notes || '')
      setContactForm({
        salutation: p.salutation || '',
        first_name: p.first_name || '',
        last_name: p.last_name || '',
        email: p.email || '',
        phone: p.phone || '',
        home_address: p.home_address || '',
        company: p.company || '',
        company_number: p.company_number || '',
        date_of_birth: p.date_of_birth || '',
        nationality: p.nationality || '',
        is_nrl: p.is_nrl || false,
        nrl_approval_ref: p.nrl_approval_ref || '',
        utr_number: p.utr_number || '',
        joint_salutation: p.joint_salutation || '',
        joint_first_name: p.joint_first_name || '',
        joint_last_name: p.joint_last_name || '',
        joint_email: p.joint_email || '',
      })
      setAgreementForm({
        management_type: p.management_type || '',
        management_start_date: p.management_start_date || '',
        management_fee_pct: '',
        management_fee_notes: p.management_fee_notes || '',
      })

      const { data: props } = await supabase
        .from('properties')
        .select('id, name, address, management_fee_pct, property_type, cc_emails')
        .eq('landlord_id', personId).order('name')
      setProperties(sortPropertiesNumerically(props || []))

      const { data: records } = await supabase
        .from('landlord_onboarding').select('*')
        .eq('landlord_people_id', personId).order('created_at', { ascending: false })
      setAmlRecords(records || [])

      const { data: stmts } = await supabase
        .from('landlord_statements')
        .select('id, statement_reference, statement_date, period_start, period_end, gross_rent, net_to_landlord, created_at, property_id, properties(name)')
        .in('property_id', (props || []).map((pp: any) => pp.id))
        .order('created_at', { ascending: false }).limit(12)
      setStatements(stmts || [])

      const { data: prefs } = await supabase
        .from('landlord_notification_prefs').select('category, enabled').eq('person_id', personId)
      const prefsMap: Record<string, boolean> = {}
      for (const pr of prefs || []) prefsMap[pr.category] = pr.enabled
      setNotifPrefs(prefsMap)

      const { data: banks } = await supabase
        .from('landlord_bank_accounts').select('*')
        .eq('landlord_id', personId).order('is_default', { ascending: false })
      setBankAccounts(banks || [])

      const propsMapped: LandlordProperty[] = (props || []).map((pp: any) => ({
        id: pp.id, name: pp.name || pp.address, address: pp.address,
        managementFeePct: pp.management_fee_pct ?? null,
      }))
      const latestOb = (records || [])[0] ?? null
      setCardData(fromPeople(p, propsMapped, latestOb))
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

  /* ── Toggle comms ── */
  async function toggleComms() {
    if (!person) return
    setTogglingComms(true)
    const next = !person.landlord_comms_enabled
    await supabase.from('people').update({ landlord_comms_enabled: next }).eq('id', personId)
    setPerson((p: any) => ({ ...p, landlord_comms_enabled: next }))
    setCardData(prev => prev ? { ...prev, commsEnabled: next } : prev)
    setTogglingComms(false)
  }

  /* ── Toggle notif pref ── */
  async function togglePref(category: string) {
    const next = !(notifPrefs[category] ?? true)
    setNotifPrefs(prev => ({ ...prev, [category]: next }))
    await supabase.from('landlord_notification_prefs')
      .upsert({ person_id: personId, category, enabled: next, updated_at: new Date().toISOString() }, { onConflict: 'person_id,category' })
  }

  /* ── Delete landlord ── */
  const [deleting, setDeleting] = useState(false)
  async function deleteLandlord() {
    if (!person) return
    const name = landlordName(person) !== '—' ? landlordName(person) : person.email
    if (statements.length > 0) {
      alert(`${name} has landlord statements on record. Statements are financial records, so this landlord can't be deleted. Contact support if this is demo data.`)
      return
    }
    const propNote = properties.length
      ? `\n\n${properties.length} linked propert${properties.length === 1 ? 'y' : 'ies'} will be kept but left without a landlord.`
      : ''
    if (!confirm(`Permanently delete the landlord entry "${name}"?${propNote}\n\nThis cannot be undone.`)) return

    setDeleting(true)
    await supabase.from('properties').update({ landlord_id: null }).eq('landlord_id', personId)
    await supabase.from('landlord_bank_accounts').delete().eq('landlord_id', personId)
    await supabase.from('landlord_notification_prefs').delete().eq('person_id', personId)
    const { error } = await supabase.from('people').delete().eq('id', personId)
    setDeleting(false)
    if (error) {
      const table = error.message.match(/on table "([^"]+)"/)?.[1]
      alert(table
        ? `Couldn't delete: this landlord is still referenced by "${table}" records. Remove those first.`
        : `Couldn't delete: ${error.message}`)
      return
    }
    router.push('/admin/landlords')
  }

  /* ── Save contact ── */
  async function saveContact() {
    setContactMsg(null)
    if (!String(contactForm.email || '').trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(contactForm.email).trim())) {
      setContactMsg({ ok: false, text: 'An email address is needed to save — every landlord must have one.' }); return
    }
    const hasJointColumns = person && 'joint_first_name' in person
    const jointFilled = !!contactForm.joint_first_name?.trim()
    if (jointFilled && !hasJointColumns) {
      setContactMsg({ ok: false, text: 'Joint landlord fields are not set up in the database yet. Run migration 182 in the Supabase SQL Editor, then save again.' })
      return
    }
    const jointUpdate = hasJointColumns ? {
      joint_salutation: contactForm.joint_salutation || null,
      joint_first_name: contactForm.joint_first_name?.trim() || null,
      joint_last_name: contactForm.joint_last_name?.trim() || null,
      joint_email: contactForm.joint_email?.trim() || null,
    } : {}
    setSavingContact(true)
    const full_name = [contactForm.first_name, contactForm.last_name].filter(Boolean).join(' ')
    // nrl_approval_ref arrives with migration 189 — until then save without it
    const { error } = await withOptionalColumns((withNew) => supabase.from('people').update({
      ...(withNew ? { nrl_approval_ref: contactForm.is_nrl ? (contactForm.nrl_approval_ref || null) : null } : {}),
      salutation: contactForm.salutation || null,
      first_name: contactForm.first_name || null,
      last_name: contactForm.last_name || null,
      full_name: full_name || null,
      email: String(contactForm.email).trim(),
      phone: contactForm.phone || null,
      home_address: contactForm.home_address || null,
      company: contactForm.company || null,
      company_number: contactForm.company_number || null,
      date_of_birth: contactForm.date_of_birth || null,
      nationality: contactForm.nationality || null,
      is_nrl: contactForm.is_nrl,
      utr_number: contactForm.utr_number || null,
      ...jointUpdate,
    }).eq('id', personId))
    if (!error) {
      setPerson((p: any) => ({ ...p, ...contactForm, full_name }))
      setEditingContact(false)
      setContactMsg({ ok: true, text: 'Saved ✓' })
    } else {
      setContactMsg({ ok: false, text: /duplicate key|unique/i.test(error.message) ? 'That email address is already used by someone else in CROS — use a different one.' : `Couldn’t save: ${error.message}` })
    }
    setSavingContact(false)
  }

  /* ── Save agreement ── */
  async function saveAgreement() {
    setSavingAgreement(true)
    const { error } = await supabase.from('people').update({
      management_type: agreementForm.management_type || null,
      management_start_date: agreementForm.management_start_date || null,
      management_fee_notes: agreementForm.management_fee_notes || null,
    }).eq('id', personId)
    if (!error) {
      setPerson((p: any) => ({ ...p, ...agreementForm }))
      setEditingAgreement(false)
    } else {
      alert(error.message)
    }
    setSavingAgreement(false)
  }

  /* ── Save notes ── */
  async function saveNotes() {
    setSavingNotes(true)
    await supabase.from('people').update({ landlord_notes: notes || null }).eq('id', personId)
    setNotesDirty(false)
    setSavingNotes(false)
  }

  /* ── Bank account CRUD ── */
  function openBankForm(acct?: any) {
    if (acct) {
      setEditingBankId(acct.id)
      setBankForm({ account_label: acct.account_label, bank_name: acct.bank_name || '', account_name: acct.account_name, sort_code: acct.sort_code || '', account_number: acct.account_number || '', iban: acct.iban || '', swift: acct.swift || '', is_default: acct.is_default })
    } else {
      setEditingBankId(null)
      setBankForm({ account_label: '', bank_name: '', account_name: '', sort_code: '', account_number: '', iban: '', swift: '', is_default: bankAccounts.length === 0 })
    }
    setShowBankForm(true)
  }

  async function saveBank() {
    if (!bankForm.account_name) { alert('Please enter the name on the account'); return }
    // the label is just a nickname — default it so it never blocks saving
    if (!bankForm.account_label?.trim()) bankForm.account_label = `${bankForm.bank_name || 'Account'}${bankForm.account_number ? ` ••••${String(bankForm.account_number).slice(-4)}` : ''}`
    setSavingBank(true)
    // only one default account per landlord (the payout run and property bank picker use it)
    if (bankForm.is_default) await supabase.from('landlord_bank_accounts').update({ is_default: false }).eq('landlord_id', personId).neq('id', editingBankId || '00000000-0000-0000-0000-000000000000')
    if (editingBankId) {
      const { error } = await supabase.from('landlord_bank_accounts').update({ ...bankForm, updated_at: new Date().toISOString() }).eq('id', editingBankId)
      if (!error) {
        setBankAccounts(prev => prev.map(a => a.id === editingBankId ? { ...a, ...bankForm } : (bankForm.is_default ? { ...a, is_default: false } : a)))
        setShowBankForm(false)
      } else { alert(error.message) }
    } else {
      const { data, error } = await supabase.from('landlord_bank_accounts')
        .insert({ ...bankForm, landlord_id: personId }).select().single()
      if (!error && data) {
        setBankAccounts(prev => bankForm.is_default ? prev.map(a => ({ ...a, is_default: false })).concat(data) : [...prev, data])
        setShowBankForm(false)
      } else { alert(error?.message || 'Error saving') }
    }
    setSavingBank(false)
  }

  async function deleteBank(id: string) {
    if (!confirm('Delete this bank account?')) return
    await supabase.from('landlord_bank_accounts').delete().eq('id', id)
    setBankAccounts(prev => prev.filter(a => a.id !== id))
  }

  async function setDefaultBank(id: string) {
    await supabase.from('landlord_bank_accounts').update({ is_default: false }).eq('landlord_id', personId)
    await supabase.from('landlord_bank_accounts').update({ is_default: true }).eq('id', id)
    setBankAccounts(prev => prev.map(a => ({ ...a, is_default: a.id === id })))
  }

  /* ── Save new AML check ── */
  async function saveNewAml() {
    if (!newAml.risk_level) { alert('Please select a risk level before saving.'); return }
    setSavingNewAml(true)
    const { data, error } = await supabase.from('landlord_onboarding').insert({
      landlord_people_id: personId, email: person.email,
      full_name: person.company || [person.first_name, person.last_name].filter(Boolean).join(' ') || person.email,
      stage: 6, is_refresh: amlRecords.length > 0,
      refresh_reason: amlRecords.length > 0 ? 'Periodic review' : null,
      entity_type: newAml.entity_type, risk_level: newAml.risk_level,
      risk_reason: newAml.risk_reason || null, verification_notes: newAml.verification_notes || null,
      docs_received_at: newAml.docs_received_at || null, identity_verified: newAml.identity_verified,
      verification_checks: newAml.verification_checks, identity_docs: newAml.identity_docs,
      onboarded_at: new Date().toISOString(),
    }).select().single()
    if (!error && data) {
      await supabase.from('people').update({ aml_risk_level: newAml.risk_level, aml_risk_notes: newAml.risk_reason || null }).eq('id', personId)
      setPerson((p: any) => ({ ...p, aml_risk_level: newAml.risk_level, aml_risk_notes: newAml.risk_reason }))
      setAmlRecords(prev => [data, ...prev])
      setExpandedAml(data.id)
      setShowNewAml(false)
      setNewAml({ entity_type: 'individual', risk_level: '', risk_reason: '', verification_notes: '', docs_received_at: new Date().toISOString().split('T')[0], identity_verified: false, verification_checks: [], identity_docs: [] })
    } else { alert(error?.message || 'Error saving AML record') }
    setSavingNewAml(false)
  }

  function toggleCheck(key: string) {
    setNewAml(prev => ({ ...prev, verification_checks: prev.verification_checks.includes(key) ? prev.verification_checks.filter(k => k !== key) : [...prev.verification_checks, key] }))
  }
  function toggleDoc(key: string) {
    setNewAml(prev => ({ ...prev, identity_docs: prev.identity_docs.includes(key) ? prev.identity_docs.filter(k => k !== key) : [...prev.identity_docs, key] }))
  }

  if (loading || !cardData || !person) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton href="/admin/people?tab=landlords" />} />
        <div className="flex items-center justify-center py-3xl"><p className="text-sm text-neutral-400">Loading…</p></div>
      </div>
    )
  }

  const TABS = [
    { id: 'overview'      as const, label: 'Overview' },
    { id: 'contact'       as const, label: 'Contact & Identity' },
    { id: 'bank'          as const, label: `Bank accounts (${bankAccounts.length})` },
    { id: 'agreement'     as const, label: 'Management agreement' },
    { id: 'properties'    as const, label: `Properties (${properties.length})` },
    { id: 'aml'           as const, label: `AML & Compliance (${amlRecords.length})` },
    { id: 'statements'    as const, label: `Statements (${statements.length})` },
    { id: 'notifications' as const, label: 'Notifications' },
  ]

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin/people?tab=landlords" />} />

      <main className="mx-auto max-w-6xl px-lg py-xl">

        {/* Landlord card */}
        <div className="mb-xl">
          {inviteMsg && (
            <div className={`mb-md rounded-xl px-md py-sm text-sm font-semibold ${inviteMsg.startsWith('✓') ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
              {inviteMsg}
            </div>
          )}
          <LandlordCard
            data={cardData}
            actions={
              <button onClick={handleInvite} disabled={inviting}
                className="rounded-lg border border-neutral-200 px-md py-xs text-xs font-semibold text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 transition">
                {inviting ? 'Sending…' : '✉ Send invite'}
              </button>
            }
          />
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

            {/* Quick summary card */}
            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
              <div className="px-xl py-lg border-b border-neutral-100 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Contact</p>
                <button onClick={() => setActiveTab('contact')} className="text-xs font-semibold text-blue-600 hover:underline">Edit →</button>
              </div>
              <div className="px-xl py-lg space-y-md text-sm">
                <Field label="Email" value={person.email} />
                <Field label="Phone" value={person.phone} />
                {person.home_address && <Field label="Address" value={person.home_address} />}
                {person.company && <Field label="Company" value={`${person.company}${person.company_number ? ` (${person.company_number})` : ''}`} />}
                {person.nationality && <Field label="Nationality" value={person.nationality} />}
                {person.is_nrl && <div className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-sm py-xs inline-block">⚠ Non-Resident Landlord</div>}
              </div>
            </div>

            {/* AML status */}
            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
              <div className="px-xl py-lg border-b border-neutral-100 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">AML status</p>
                <button onClick={() => setActiveTab('aml')} className="text-xs font-semibold text-blue-600 hover:underline">View →</button>
              </div>
              <div className="px-xl py-lg space-y-md text-sm">
                {amlRecords.length > 0 ? (
                  <>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-neutral-400">Current risk</p>
                      {riskBadge(person.aml_risk_level)}
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-neutral-400">Last checked</p>
                      <p className="font-semibold text-neutral-900">{fmt(amlRecords[0].docs_received_at || amlRecords[0].created_at)}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-neutral-400">Identity verified</p>
                      <span className={`text-xs font-semibold px-sm py-xs rounded-full border ${amlRecords[0].identity_verified ? 'bg-green-100 text-green-800 border-green-200' : 'bg-neutral-100 text-neutral-500 border-neutral-200'}`}>
                        {amlRecords[0].identity_verified ? '✓ Verified' : 'Not verified'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-neutral-400">Check history</p>
                      <button onClick={() => setActiveTab('aml')} className="text-xs font-semibold text-blue-600 hover:underline">
                        {amlRecords.length} record{amlRecords.length !== 1 ? 's' : ''} →
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="py-md text-center">
                    <p className="text-neutral-400 text-sm mb-md">No AML checks on record.</p>
                    <button onClick={() => { setActiveTab('aml'); setShowNewAml(true) }}
                      className="text-xs font-semibold text-white bg-neutral-900 px-md py-sm rounded-lg hover:bg-neutral-700 transition">
                      Record first AML check →
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Management agreement summary */}
            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
              <div className="px-xl py-lg border-b border-neutral-100 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Management agreement</p>
                <button onClick={() => setActiveTab('agreement')} className="text-xs font-semibold text-blue-600 hover:underline">Edit →</button>
              </div>
              <div className="px-xl py-lg space-y-md text-sm">
                <Field label="Type" value={MGMT_TYPES.find(t => t.value === person.management_type)?.label} />
                <Field label="Started" value={person.management_start_date ? fmt(person.management_start_date) : undefined} />
                {properties.length > 0 && <Field label="Fee" value={properties[0].management_fee_pct ? `${properties[0].management_fee_pct}%` : undefined} />}
                {person.management_fee_notes && <Field label="Notes" value={person.management_fee_notes} />}
              </div>
            </div>

            {/* Bank accounts summary */}
            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
              <div className="px-xl py-lg border-b border-neutral-100 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Bank accounts</p>
                <button onClick={() => setActiveTab('bank')} className="text-xs font-semibold text-blue-600 hover:underline">Manage →</button>
              </div>
              <div className="px-xl py-lg">
                {bankAccounts.length === 0 ? (
                  <p className="text-sm text-neutral-400">No bank accounts saved.</p>
                ) : (
                  <div className="space-y-sm">
                    {bankAccounts.map(a => (
                      <div key={a.id} className="flex items-center gap-md">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-neutral-900">{a.account_label}</p>
                          <p className="text-xs text-neutral-400">{a.account_name}{a.sort_code ? ` · ${a.sort_code}` : ''}{a.account_number ? ` · ${a.account_number}` : ''}</p>
                        </div>
                        {a.is_default && <span className="text-xs font-semibold px-sm py-xs rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200">Default</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Internal notes */}
            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden md:col-span-2">
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
                  rows={4}
                  className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-md py-sm text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-400 resize-y"
                  placeholder="Internal notes visible only to staff — key contacts, preferences, history, special terms…"
                  value={notes}
                  onChange={e => { setNotes(e.target.value); setNotesDirty(true) }}
                />
              </div>
            </div>

            {/* Communications */}
            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden md:col-span-2">
              <div className="px-xl py-lg border-b border-neutral-100 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Communications</p>
                <button onClick={toggleComms} disabled={togglingComms}
                  className={`text-xs font-semibold px-md py-xs rounded-lg border transition ${
                    person.landlord_comms_enabled ? 'border-red-200 text-red-700 hover:bg-red-50' : 'border-green-200 text-green-700 hover:bg-green-50'
                  }`}>
                  {togglingComms ? 'Saving…' : person.landlord_comms_enabled ? 'Pause all comms' : 'Enable comms'}
                </button>
              </div>
              <div className="px-xl py-lg text-sm">
                <p className="text-neutral-500">
                  {person.landlord_comms_enabled
                    ? 'Email notifications are currently active. Toggle individual categories in the Notifications tab.'
                    : 'All communications are paused. No emails will be sent until comms are enabled.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ══ CONTACT & IDENTITY ══ */}
        {activeTab === 'contact' && (
          <div className="space-y-lg">
            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
              <div className="px-xl py-lg border-b border-neutral-100 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Contact details{contactMsg?.ok && !editingContact && <span className="ml-sm normal-case tracking-normal text-green-700">{contactMsg.text}</span>}</p>
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
                          {['Mr','Mrs','Ms','Miss','Dr','Prof','Rev','Mx'].map(s => <option key={s} value={s}>{s}</option>)}
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
                    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-md">
                      <p className="text-xs font-semibold text-neutral-700 mb-md">Joint landlord <span className="font-normal text-neutral-400">(optional — shares this entry; both names appear on agreements and statements)</span></p>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-md">
                        <div>
                          <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Salutation</label>
                          <select className={inputCls()} value={contactForm.joint_salutation} onChange={e => setContactForm((p: any) => ({ ...p, joint_salutation: e.target.value }))}>
                            <option value="">—</option>
                            {['Mr','Mrs','Ms','Miss','Dr','Prof','Rev','Mx'].map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">First name</label>
                          <input className={inputCls()} value={contactForm.joint_first_name} onChange={e => setContactForm((p: any) => ({ ...p, joint_first_name: e.target.value }))} />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Last name</label>
                          <input className={inputCls()} value={contactForm.joint_last_name} onChange={e => setContactForm((p: any) => ({ ...p, joint_last_name: e.target.value }))} />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Email</label>
                          <input type="email" className={inputCls()} value={contactForm.joint_email} onChange={e => setContactForm((p: any) => ({ ...p, joint_email: e.target.value }))} />
                        </div>
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
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Home / correspondence address</label>
                      <textarea rows={2} className={inputCls()} value={contactForm.home_address} onChange={e => setContactForm((p: any) => ({ ...p, home_address: e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
                      <div>
                        <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Company name</label>
                        <input className={inputCls()} value={contactForm.company} onChange={e => setContactForm((p: any) => ({ ...p, company: e.target.value }))} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Companies House number</label>
                        <input className={inputCls()} value={contactForm.company_number} onChange={e => setContactForm((p: any) => ({ ...p, company_number: e.target.value }))} />
                      </div>
                    </div>
                    <div className="border-t border-neutral-100 pt-lg">
                      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-md">Identity & tax</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-md">
                        <div>
                          <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Date of birth</label>
                          <input type="date" className={inputCls()} value={contactForm.date_of_birth} onChange={e => setContactForm((p: any) => ({ ...p, date_of_birth: e.target.value }))} />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Nationality</label>
                          <input className={inputCls()} placeholder="e.g. British" value={contactForm.nationality} onChange={e => setContactForm((p: any) => ({ ...p, nationality: e.target.value }))} />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">UTR number</label>
                          <input className={inputCls()} placeholder="10-digit HMRC ref" value={contactForm.utr_number} onChange={e => setContactForm((p: any) => ({ ...p, utr_number: e.target.value }))} />
                        </div>
                      </div>
                      <label className="flex items-center gap-sm mt-md cursor-pointer">
                        <input type="checkbox" checked={contactForm.is_nrl} onChange={e => setContactForm((p: any) => ({ ...p, is_nrl: e.target.checked }))} className="rounded" />
                        <span className="text-sm text-neutral-800 font-medium">Non-Resident Landlord (NRL)</span>
                        <span className="text-xs text-neutral-400">— they deal with HMRC themselves; we don’t deduct tax</span>
                      </label>
                      {contactForm.is_nrl && (
                        <div className="mt-sm">
                          <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">HMRC NRL approval reference</label>
                          <input className={inputCls()} placeholder="e.g. NA123456 — from HMRC’s approval letter" value={contactForm.nrl_approval_ref} onChange={e => setContactForm((p: any) => ({ ...p, nrl_approval_ref: e.target.value }))} />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-sm pt-sm border-t border-neutral-100">
                      {contactMsg && !contactMsg.ok && <p className="w-full text-sm font-semibold text-red-700">{contactMsg.text}</p>}
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
                      <Field label="Name" value={[person.salutation, person.first_name, person.last_name].filter(Boolean).join(' ')} />
                      {person.joint_first_name && (
                        <Field label="Joint landlord" value={[person.joint_salutation, person.joint_first_name, person.joint_last_name].filter(Boolean).join(' ') + (person.joint_email ? ` · ${person.joint_email}` : '')} />
                      )}
                      <Field label="Email" value={person.email} />
                      <Field label="Phone" value={person.phone} />
                      <Field label={person.joint_first_name ? 'Shared address' : 'Address'} value={person.home_address} />
                      {person.company && <Field label="Company" value={person.company} />}
                      {person.company_number && <Field label="Co. number" value={person.company_number} />}
                    </div>
                    <div className="space-y-md">
                      <Field label="Date of birth" value={person.date_of_birth ? fmt(person.date_of_birth) : null} />
                      <Field label="Nationality" value={person.nationality} />
                      <Field label="UTR number" value={person.utr_number} />
                      <div>
                        <p className="text-xs text-neutral-400 mb-xs">NRL status</p>
                        {person.is_nrl
                          ? <><span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-sm py-xs">Non-Resident Landlord — handles own tax</span>
                              <p className="mt-xs text-xs text-neutral-600">{person.nrl_approval_ref ? `HMRC approval ${person.nrl_approval_ref}` : 'No HMRC approval reference recorded'}</p></>
                          : <p className="text-sm font-semibold text-neutral-900">UK resident</p>}
                      </div>
                      <Field label="Member since" value={fmt(person.created_at)} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-red-200 bg-white px-xl py-lg flex flex-col sm:flex-row sm:items-center justify-between gap-md">
              <div>
                <p className="text-sm font-bold text-neutral-900">Delete this landlord</p>
                <p className="text-xs text-neutral-500 mt-xs">For dummy, demo or duplicate entries. Any linked properties are kept and simply left without a landlord.</p>
              </div>
              <button onClick={deleteLandlord} disabled={deleting}
                className="shrink-0 px-lg py-sm rounded-xl border border-red-300 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40 transition">
                {deleting ? 'Deleting…' : 'Delete landlord'}
              </button>
            </div>
          </div>
        )}

        {/* ══ BANK ACCOUNTS ══ */}
        {activeTab === 'bank' && (
          <div className="space-y-lg">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-neutral-900">Bank accounts</h2>
                <p className="text-xs text-neutral-500 mt-xs">Used to populate payment details on tenancy agreements. The default account is pre-selected in the bulk generator.</p>
              </div>
              {!showBankForm && (
                <button onClick={() => openBankForm()}
                  className="text-sm font-semibold bg-neutral-900 text-white px-lg py-sm rounded-xl hover:bg-neutral-700 transition">
                  + Add account
                </button>
              )}
            </div>

            {/* Bank form */}
            {showBankForm && (
              <div className="rounded-xl border-2 border-neutral-900 bg-white p-xl space-y-lg">
                <p className="text-sm font-bold text-neutral-900">{editingBankId ? 'Edit bank account' : 'Add bank account'}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Account label <span className="text-red-500">*</span></label>
                    <input className={inputCls()} placeholder="e.g. Barclays Main, HSBC Rental" value={bankForm.account_label} onChange={e => setBankForm(p => ({ ...p, account_label: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Bank name</label>
                    <input className={inputCls()} placeholder="e.g. Barclays" value={bankForm.bank_name} onChange={e => setBankForm(p => ({ ...p, bank_name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Account name <span className="text-red-500">*</span></label>
                    <input className={inputCls()} placeholder="Name on account" value={bankForm.account_name} onChange={e => setBankForm(p => ({ ...p, account_name: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-sm">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Sort code</label>
                      <input className={inputCls()} placeholder="20-49-76" value={bankForm.sort_code} onChange={e => setBankForm(p => ({ ...p, sort_code: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Account number</label>
                      <input className={inputCls()} placeholder="12345678" value={bankForm.account_number} onChange={e => setBankForm(p => ({ ...p, account_number: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">IBAN (optional)</label>
                    <input className={inputCls()} placeholder="GB29 NWBK 6016 1331 9268 19" value={bankForm.iban} onChange={e => setBankForm(p => ({ ...p, iban: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">SWIFT / BIC (optional)</label>
                    <input className={inputCls()} placeholder="NWBKGB2L" value={bankForm.swift} onChange={e => setBankForm(p => ({ ...p, swift: e.target.value }))} />
                  </div>
                </div>
                <label className="flex items-center gap-sm cursor-pointer">
                  <input type="checkbox" checked={bankForm.is_default} onChange={e => setBankForm(p => ({ ...p, is_default: e.target.checked }))} className="rounded" />
                  <span className="text-sm font-medium text-neutral-800">Set as default account</span>
                </label>
                <div className="flex gap-sm border-t border-neutral-100 pt-sm">
                  <button onClick={saveBank} disabled={savingBank}
                    className="px-xl py-sm rounded-xl bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-700 disabled:opacity-40 transition">
                    {savingBank ? 'Saving…' : 'Save account'}
                  </button>
                  <button onClick={() => setShowBankForm(false)}
                    className="px-xl py-sm rounded-xl border border-neutral-200 text-sm font-semibold text-neutral-600 hover:bg-neutral-50 transition">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Account list */}
            {bankAccounts.length === 0 && !showBankForm ? (
              <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-2xl text-center">
                <p className="text-neutral-400 text-sm mb-md">No bank accounts saved for this landlord.</p>
                <button onClick={() => openBankForm()}
                  className="text-sm font-semibold bg-neutral-900 text-white px-xl py-sm rounded-xl hover:bg-neutral-700 transition">
                  Add first account
                </button>
              </div>
            ) : (
              <div className="space-y-md">
                {bankAccounts.map(a => (
                  <div key={a.id} className={`rounded-xl border bg-white p-lg ${a.is_default ? 'border-neutral-900' : 'border-neutral-200'}`}>
                    <div className="flex items-start gap-md">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-sm mb-xs">
                          <p className="text-sm font-bold text-neutral-900">{a.account_label}</p>
                          {a.is_default && <span className="text-xs font-semibold px-sm py-xs rounded-full bg-neutral-900 text-white">Default</span>}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-md mt-md text-sm">
                          <Field label="Account name" value={a.account_name} />
                          {a.bank_name && <Field label="Bank" value={a.bank_name} />}
                          {a.sort_code && <Field label="Sort code" value={a.sort_code} />}
                          {a.account_number && <Field label="Account number" value={a.account_number} />}
                          {a.iban && <Field label="IBAN" value={a.iban} />}
                          {a.swift && <Field label="SWIFT / BIC" value={a.swift} />}
                        </div>
                      </div>
                      <div className="flex gap-sm shrink-0">
                        {!a.is_default && (
                          <button onClick={() => setDefaultBank(a.id)}
                            className="text-xs font-semibold border border-neutral-200 px-md py-xs rounded-lg hover:bg-neutral-50">
                            Set default
                          </button>
                        )}
                        <button onClick={() => openBankForm(a)}
                          className="text-xs font-semibold border border-neutral-200 px-md py-xs rounded-lg hover:bg-neutral-50">
                          Edit
                        </button>
                        <button onClick={() => deleteBank(a.id)}
                          className="text-xs font-semibold border border-red-200 text-red-600 px-md py-xs rounded-lg hover:bg-red-50">
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ MANAGEMENT AGREEMENT ══ */}
        {activeTab === 'agreement' && (
          <div className="space-y-lg">
            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
              <div className="px-xl py-lg border-b border-neutral-100 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Agreement details</p>
                {!editingAgreement && (
                  <button onClick={() => setEditingAgreement(true)}
                    className="text-xs font-semibold border border-neutral-200 px-md py-xs rounded-lg hover:bg-neutral-50">
                    Edit
                  </button>
                )}
              </div>
              <div className="px-xl py-xl">
                {editingAgreement ? (
                  <div className="space-y-lg">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
                      <div>
                        <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Management type</label>
                        <select className={inputCls()} value={agreementForm.management_type} onChange={e => setAgreementForm((p: any) => ({ ...p, management_type: e.target.value }))}>
                          <option value="">— Select —</option>
                          {MGMT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Agreement start date</label>
                        <input type="date" className={inputCls()} value={agreementForm.management_start_date} onChange={e => setAgreementForm((p: any) => ({ ...p, management_start_date: e.target.value }))} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Fee notes</label>
                      <textarea rows={3} className={inputCls()} placeholder="e.g. 12% full management, 8% let-only on Room 3 only, special rates agreed…" value={agreementForm.management_fee_notes} onChange={e => setAgreementForm((p: any) => ({ ...p, management_fee_notes: e.target.value }))} />
                    </div>
                    <p className="text-xs text-neutral-400">Management fees per property are set on each individual property record.</p>
                    <div className="flex gap-sm pt-sm border-t border-neutral-100">
                      <button onClick={saveAgreement} disabled={savingAgreement}
                        className="px-xl py-sm rounded-xl bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-700 disabled:opacity-40 transition">
                        {savingAgreement ? 'Saving…' : 'Save'}
                      </button>
                      <button onClick={() => setEditingAgreement(false)}
                        className="px-xl py-sm rounded-xl border border-neutral-200 text-sm font-semibold text-neutral-600 hover:bg-neutral-50 transition">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-xl">
                    <div className="space-y-md">
                      <Field label="Management type" value={MGMT_TYPES.find(t => t.value === person.management_type)?.label} />
                      <Field label="Agreement start" value={person.management_start_date ? fmt(person.management_start_date) : null} />
                      <Field label="Fee notes" value={person.management_fee_notes} />
                    </div>
                    <div className="space-y-md">
                      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-md">Fees by property</p>
                      {properties.length === 0
                        ? <p className="text-sm text-neutral-400">No properties linked.</p>
                        : properties.map(p => (
                          <div key={p.id} className="flex items-center justify-between text-sm">
                            <p className="text-neutral-700 truncate">{p.name || p.address}</p>
                            <p className="font-semibold text-neutral-900 shrink-0 ml-md">{p.management_fee_pct ? `${p.management_fee_pct}%` : '—'}</p>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══ PROPERTIES ══ */}
        {activeTab === 'properties' && (
          <div className="space-y-md">
            {properties.length === 0 ? (
              <div className="rounded-xl border border-neutral-200 bg-white p-xl text-center">
                <p className="text-neutral-400 text-sm">No properties linked to this landlord.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400 border-b border-neutral-100">
                      <th className="px-xl py-sm">Property</th>
                      <th className="px-xl py-sm hidden sm:table-cell">Type</th>
                      <th className="px-xl py-sm hidden md:table-cell text-right">Mgmt fee</th>
                      <th className="px-xl py-sm text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {properties.map(p => (
                      <tr key={p.id} className="border-t border-neutral-100 hover:bg-neutral-50 transition">
                        <td className="px-xl py-md">
                          <p className="font-semibold text-neutral-900">{p.name || p.address}</p>
                          {p.name && <p className="text-xs text-neutral-400">{p.address}</p>}
                          {p.cc_emails && <p className="text-xs text-neutral-400 mt-xs">CC: {p.cc_emails}</p>}
                        </td>
                        <td className="px-xl py-md hidden sm:table-cell text-neutral-500 capitalize text-xs">{p.property_type || '—'}</td>
                        <td className="px-xl py-md hidden md:table-cell text-right text-neutral-600">{p.management_fee_pct ? `${p.management_fee_pct}%` : '—'}</td>
                        <td className="px-xl py-md text-right">
                          <a href={`/admin/properties/${p.id}`} className="text-xs font-semibold text-blue-600 hover:underline">Open →</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══ AML & COMPLIANCE ══ */}
        {activeTab === 'aml' && (
          <div className="space-y-lg">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-neutral-900">AML check history</h2>
                <p className="text-xs text-neutral-500 mt-xs">Each entry is a complete due-diligence event. Expand to see the full report.</p>
              </div>
              {!showNewAml && (
                <button onClick={() => setShowNewAml(true)}
                  className="text-sm font-semibold bg-neutral-900 text-white px-lg py-sm rounded-xl hover:bg-neutral-700 transition">
                  + New AML check
                </button>
              )}
            </div>

            {showNewAml && (
              <div className="rounded-xl border-2 border-neutral-900 bg-white overflow-hidden">
                <div className="px-xl py-lg border-b border-neutral-100 flex items-center justify-between">
                  <p className="text-sm font-bold text-neutral-900">{amlRecords.length > 0 ? 'Periodic AML review' : 'Initial AML check'}</p>
                  <button onClick={() => setShowNewAml(false)} className="text-neutral-400 hover:text-neutral-700 text-xl">×</button>
                </div>
                <div className="p-xl space-y-xl">
                  <div className="grid grid-cols-2 gap-lg">
                    <div>
                      <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide block mb-sm">Entity type</label>
                      <div className="flex gap-sm">
                        {['individual', 'company'].map(t => (
                          <button key={t} onClick={() => setNewAml(prev => ({ ...prev, entity_type: t }))}
                            className={`px-lg py-sm text-sm font-semibold rounded-lg border capitalize transition ${newAml.entity_type === t ? 'bg-neutral-900 text-white border-neutral-900' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}>
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide block mb-sm">Date docs received</label>
                      <input type="date" value={newAml.docs_received_at} onChange={e => setNewAml(prev => ({ ...prev, docs_received_at: e.target.value }))}
                        className="px-md py-sm border border-neutral-200 rounded-lg text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900 w-full" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide block mb-sm">Documents collected</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-sm">
                      {DOCUMENT_TYPES.map(doc => (
                        <label key={doc.key} className={`flex items-center gap-sm p-md rounded-lg border cursor-pointer transition ${newAml.identity_docs.includes(doc.key) ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 hover:border-neutral-300'}`}>
                          <input type="checkbox" checked={newAml.identity_docs.includes(doc.key)} onChange={() => toggleDoc(doc.key)} className="rounded" />
                          <span className="text-sm text-neutral-800">{doc.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide block mb-sm">Verification checklist</label>
                    <div className="space-y-sm">
                      {VERIFICATION_CHECKS.map(check => (
                        <label key={check.key} className={`flex items-center gap-md p-md rounded-lg border cursor-pointer transition ${newAml.verification_checks.includes(check.key) ? 'border-green-300 bg-green-50' : 'border-neutral-200 hover:border-neutral-300'}`}>
                          <input type="checkbox" checked={newAml.verification_checks.includes(check.key)} onChange={() => toggleCheck(check.key)} className="rounded flex-shrink-0" />
                          <span className="text-sm text-neutral-800">{check.label}</span>
                          {newAml.verification_checks.includes(check.key) && <span className="ml-auto text-green-600 text-sm">✓</span>}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-lg">
                    <div>
                      <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide block mb-sm">Identity verified?</label>
                      <div className="flex gap-sm">
                        <button onClick={() => setNewAml(prev => ({ ...prev, identity_verified: true }))}
                          className={`px-lg py-sm text-sm font-semibold rounded-lg border transition ${newAml.identity_verified ? 'bg-green-600 text-white border-green-600' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}>✓ Yes</button>
                        <button onClick={() => setNewAml(prev => ({ ...prev, identity_verified: false }))}
                          className={`px-lg py-sm text-sm font-semibold rounded-lg border transition ${!newAml.identity_verified ? 'bg-neutral-200 text-neutral-700 border-neutral-300' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}>Not yet</button>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide block mb-sm">Risk level <span className="text-red-500">*</span></label>
                      <div className="flex gap-sm">
                        {(['low', 'medium', 'high'] as const).map(level => (
                          <button key={level} onClick={() => setNewAml(prev => ({ ...prev, risk_level: level }))}
                            className={`px-lg py-sm text-sm font-semibold rounded-lg border capitalize transition ${
                              newAml.risk_level === level
                                ? level === 'low' ? 'bg-green-100 border-green-300 text-green-800' : level === 'medium' ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-red-100 border-red-300 text-red-800'
                                : 'border-neutral-200 text-neutral-500 hover:bg-neutral-50'
                            }`}>{level}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-lg">
                    <div>
                      <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide block mb-sm">Risk reason / notes</label>
                      <textarea value={newAml.risk_reason} onChange={e => setNewAml(prev => ({ ...prev, risk_reason: e.target.value }))} rows={3}
                        className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                        placeholder="Source of wealth, risk factors…" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide block mb-sm">Verification notes</label>
                      <textarea value={newAml.verification_notes} onChange={e => setNewAml(prev => ({ ...prev, verification_notes: e.target.value }))} rows={3}
                        className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                        placeholder="Discrepancies found, actions taken…" />
                    </div>
                  </div>
                  <div className="flex gap-sm pt-sm border-t border-neutral-100">
                    <button onClick={saveNewAml} disabled={savingNewAml || !newAml.risk_level}
                      className="px-xl py-sm rounded-xl bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-700 disabled:opacity-40 transition">
                      {savingNewAml ? 'Saving…' : 'Save AML record'}
                    </button>
                    <button onClick={() => setShowNewAml(false)}
                      className="px-xl py-sm rounded-xl border border-neutral-200 text-sm font-semibold text-neutral-600 hover:bg-neutral-50 transition">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {amlRecords.length === 0 && !showNewAml ? (
              <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-2xl text-center">
                <p className="text-neutral-400 text-sm mb-md">No AML records on file for this landlord.</p>
                <button onClick={() => setShowNewAml(true)}
                  className="text-sm font-semibold bg-neutral-900 text-white px-xl py-sm rounded-xl hover:bg-neutral-700 transition">
                  Record first AML check
                </button>
              </div>
            ) : (
              <div className="space-y-md">
                {amlRecords.map((rec, idx) => {
                  const isOpen = expandedAml === rec.id
                  const docs   = rec.identity_docs as string[] || []
                  const checks = rec.verification_checks as string[] || []
                  return (
                    <div key={rec.id} className={`rounded-xl border bg-white overflow-hidden transition ${isOpen ? 'border-neutral-300 shadow-sm' : 'border-neutral-200'}`}>
                      <button className="w-full text-left px-xl py-lg" onClick={() => setExpandedAml(isOpen ? null : rec.id)}>
                        <div className="flex items-center gap-lg flex-wrap">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-sm flex-wrap">
                              <span className="text-sm font-bold text-neutral-900">{rec.is_refresh ? 'Periodic review' : 'Initial AML check'}</span>
                              {idx === 0 && <span className="text-xs font-semibold px-sm py-xs rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200">Latest</span>}
                              {riskBadge(rec.risk_level)}
                              {rec.identity_verified && <span className="text-xs font-semibold px-sm py-xs rounded-full bg-green-50 text-green-700 border border-green-200">✓ ID verified</span>}
                              {rec.entity_type && <span className="text-xs text-neutral-400 capitalize">{rec.entity_type}</span>}
                            </div>
                            <p className="text-xs text-neutral-400 mt-xs">Docs received {fmt(rec.docs_received_at)} · Added {fmt(rec.created_at)}</p>
                          </div>
                          <div className="flex items-center gap-md text-xs text-neutral-400 shrink-0">
                            <span>{docs.length} doc{docs.length !== 1 ? 's' : ''}</span>
                            <span>{checks.length}/{VERIFICATION_CHECKS.length} checks</span>
                            <span className="text-neutral-300">{isOpen ? '▲' : '▼'}</span>
                          </div>
                        </div>
                      </button>
                      {isOpen && (
                        <div className="border-t border-neutral-100 px-xl py-xl space-y-xl">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-md">Documents collected</p>
                            {docs.length > 0 ? (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-sm">
                                {DOCUMENT_TYPES.map(doc => {
                                  const collected = docs.includes(doc.key)
                                  return (
                                    <div key={doc.key} className={`flex items-center gap-sm px-md py-sm rounded-lg border text-sm ${collected ? 'border-green-200 bg-green-50' : 'border-neutral-100 bg-neutral-50 opacity-40'}`}>
                                      <span className={collected ? 'text-green-600' : 'text-neutral-300'}>{collected ? '✓' : '○'}</span>
                                      <span className={collected ? 'text-neutral-800 font-medium' : 'text-neutral-400'}>{doc.label}</span>
                                    </div>
                                  )
                                })}
                              </div>
                            ) : <p className="text-sm text-neutral-400 italic">No documents recorded.</p>}
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-md">Verification checklist</p>
                            <div className="space-y-sm">
                              {VERIFICATION_CHECKS.map(check => {
                                const passed = checks.includes(check.key)
                                return (
                                  <div key={check.key} className={`flex items-center gap-sm px-md py-sm rounded-lg border text-sm ${passed ? 'border-green-200 bg-green-50' : 'border-neutral-100 bg-neutral-50'}`}>
                                    <span className={passed ? 'text-green-600 font-bold' : 'text-neutral-300'}>{passed ? '✓' : '○'}</span>
                                    <span className={passed ? 'text-neutral-800' : 'text-neutral-400'}>{check.label}</span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                          {(rec.risk_reason || rec.verification_notes) && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-xl">
                              {rec.risk_reason && <div><p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-xs">Risk reason</p><p className="text-sm text-neutral-700">{rec.risk_reason}</p></div>}
                              {rec.verification_notes && <div><p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-xs">Verification notes</p><p className="text-sm text-neutral-700">{rec.verification_notes}</p></div>}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ STATEMENTS ══ */}
        {activeTab === 'statements' && (
          <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
            {statements.length === 0 ? (
              <div className="p-xl text-center text-neutral-400 text-sm">No statements yet.</div>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400 border-b border-neutral-100">
                    <th className="px-xl py-sm">Period</th>
                    <th className="px-xl py-sm hidden sm:table-cell">Property</th>
                    <th className="px-xl py-sm text-right">Gross rent</th>
                    <th className="px-xl py-sm text-right">Net to landlord</th>
                  </tr>
                </thead>
                <tbody>
                  {statements.map(s => (
                    <tr key={s.id} className="border-t border-neutral-100 hover:bg-neutral-50 transition cursor-pointer"
                      onClick={() => window.open(`/landlord/statement/${s.id}`, '_blank')}>
                      <td className="px-xl py-md font-semibold text-neutral-900">{s.statement_reference || (s.period_start ? `${fmt(s.period_start)} – ${fmt(s.period_end)}` : fmt(s.statement_date || s.created_at))}</td>
                      <td className="px-xl py-md hidden sm:table-cell text-neutral-500">{(s as any).properties?.name || '—'}</td>
                      <td className="px-xl py-md text-right text-neutral-600">£{Number(s.gross_rent || 0).toLocaleString()}</td>
                      <td className="px-xl py-md text-right font-semibold text-neutral-900">£{Number(s.net_to_landlord || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ══ NOTIFICATIONS ══ */}
        {activeTab === 'notifications' && (
          <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
            <div className="px-xl py-lg border-b border-neutral-100">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Notification categories</p>
              <p className="text-xs text-neutral-400 mt-xs">Master comms switch must be on for any of these to send.</p>
            </div>
            <div className="divide-y divide-neutral-100">
              {NOTIF_CATEGORIES.map(cat => {
                const enabled = notifPrefs[cat.key] ?? true
                return (
                  <div key={cat.key} className="px-xl py-md flex items-center justify-between">
                    <p className="text-sm font-medium text-neutral-900">{cat.label}</p>
                    <button onClick={() => togglePref(cat.key)}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${enabled ? 'bg-neutral-900' : 'bg-neutral-200'}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
