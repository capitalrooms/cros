'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Logo from '@/components/Logo'
import AddressInput, { type AddressValue, emptyAddress, toAddressString, parseAddressString } from '@/app/components/AddressInput'

type EntityType    = 'individual' | 'company'
type PropertyCount = 'single' | 'multiple'
type SectionKey    = 'type' | 'identity' | 'ownership' | 'bank' | 'compliance' | 'declaration'

interface FormData {
  entity_type: EntityType | ''
  property_count: PropertyCount | ''
  salutation: string
  first_name: string
  last_name: string
  dob: string
  nationality: string
  id_type: string
  // Residential address — separate fields
  addr_line1: string
  addr_line2: string
  addr_town: string
  addr_county: string
  addr_postcode: string
  // Legacy single-line (kept for backward compat)
  address: string
  employer: string
  contact_phone: string
  contact_email: string
  company_name: string
  company_reg: string
  registered_office: string
  directors: string
  // Property address — separate fields
  prop_line1: string
  prop_line2: string
  prop_town: string
  prop_county: string
  prop_postcode: string
  // Legacy single-line (kept for backward compat)
  property_address: string
  mortgage_provider: string
  mortgage_account: string
  properties: Array<{ line1: string; line2: string; town: string; postcode: string; address: string; mortgage_provider: string; mortgage_account: string }>
  bank_name: string
  account_number: string
  sort_code: string
  iban: string
  uk_resident: string
  nrl_ref: string
  emergency_name: string
  emergency_phone: string
  emergency_relation: string
  declaration: boolean
  __sections_saved?: SectionKey[]
  documents?: Record<string, string[]>
}

// Per-upload slot state
interface UploadSlot {
  uploading: boolean
  files: string[]  // paths stored in Supabase
  error: string | null
}

function blank(): FormData {
  return {
    entity_type: '', property_count: '',
    salutation: '', first_name: '', last_name: '', dob: '', nationality: '', id_type: 'passport',
    addr_line1: '', addr_line2: '', addr_town: '', addr_county: '', addr_postcode: '',
    address: '', employer: '', contact_phone: '', contact_email: '',
    company_name: '', company_reg: '', registered_office: '', directors: '',
    prop_line1: '', prop_line2: '', prop_town: '', prop_county: '', prop_postcode: '',
    property_address: '', mortgage_provider: '', mortgage_account: '',
    properties: [{ line1: '', line2: '', town: '', postcode: '', address: '', mortgage_provider: '', mortgage_account: '' }],
    bank_name: '', account_number: '', sort_code: '', iban: '',
    uk_resident: 'yes', nrl_ref: '',
    emergency_name: '', emergency_phone: '', emergency_relation: '',
    declaration: false,
  }
}

const SECTIONS: { key: SectionKey; label: string; emoji: string; optional?: boolean }[] = [
  { key: 'type',        label: 'About you',               emoji: '👤' },
  { key: 'identity',    label: 'Identity',                emoji: '🪪' },
  { key: 'ownership',   label: 'Property ownership',      emoji: '🏠' },
  { key: 'bank',        label: 'Banking & tax',           emoji: '🏦' },
  { key: 'compliance',  label: 'Property certificates',   emoji: '📂', optional: true },
  { key: 'declaration', label: 'Declaration',             emoji: '✍️' },
]

// Compliance certificates — correct regulatory names
const COMPLIANCE_DOCS: { docType: string; label: string; regulation: string; hint: string; hmoOnly?: boolean }[] = [
  {
    docType:    'gas_safety_certificate',
    label:      'Gas Safety Certificate (CP12)',
    regulation: 'Gas Safety (Installation and Use) Regulations 1998',
    hint:       'Required annually for any property with gas appliances. Must be carried out by a Gas Safe registered engineer.',
  },
  {
    docType:    'eicr',
    label:      'Electrical Installation Condition Report (EICR)',
    regulation: 'Electrical Safety Standards in the Private Rented Sector (England) Regulations 2020',
    hint:       'Required every 5 years for rental properties. Must be carried out by a qualified electrician.',
  },
  {
    docType:    'epc',
    label:      'Energy Performance Certificate (EPC)',
    regulation: 'Energy Performance of Buildings (England and Wales) Regulations 2012',
    hint:       'Required before letting. Must be rated E or above. Valid for 10 years.',
  },
  {
    docType:    'fire_risk_assessment',
    label:      'Fire Risk Assessment',
    regulation: 'Regulatory Reform (Fire Safety) Order 2005',
    hint:       'Required for HMOs and houses of multiple occupation. Must be reviewed regularly.',
    hmoOnly:    true,
  },
  {
    docType:    'fire_detection_certificate',
    label:      'Fire Detection and Alarm System Certificate',
    regulation: 'BS 5839-6: Fire Detection and Fire Alarm Systems for Buildings',
    hint:       'Certification from the installing engineer confirming the fire detection system meets BS 5839-6.',
    hmoOnly:    true,
  },
  {
    docType:    'emergency_lighting_certificate',
    label:      'Emergency Lighting Certificate',
    regulation: 'BS 5266-1: Code of Practice for the Emergency Lighting of Premises',
    hint:       'Required for HMOs with shared areas (corridors, stairwells, communal rooms). Annual inspection certificate.',
    hmoOnly:    true,
  },
  {
    docType:    'pat_test_record',
    label:      'Portable Appliance Testing (PAT) Record',
    regulation: 'Health and Safety at Work etc. Act 1974 / The Electricity at Work Regulations 1989',
    hint:       'Record of testing for all landlord-supplied portable electrical appliances. Recommended annually.',
  },
  {
    docType:    'legionella_risk_assessment',
    label:      'Legionella Risk Assessment',
    regulation: 'Health and Safety at Work etc. Act 1974 / L8 ACOP (HSE)',
    hint:       'Required under the HSE Approved Code of Practice. Assesses the risk of Legionella bacteria in water systems.',
  },
  {
    docType:    'hmo_licence',
    label:      'HMO Licence',
    regulation: 'Housing Act 2004, Part 2',
    hint:       'Mandatory for properties rented to 5 or more people forming 2 or more households. Issued by the local authority.',
    hmoOnly:    true,
  },
]

// ── Shell ─────────────────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-100">
      <nav className="bg-neutral-900 text-white border-b border-neutral-800 sticky top-0 z-50"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto max-w-6xl py-md grid items-center gap-md"
          style={{ gridTemplateColumns: '1fr auto 1fr', minHeight: 52,
            paddingLeft: 'max(16px, env(safe-area-inset-left))',
            paddingRight: 'max(16px, env(safe-area-inset-right))' }}>
          <div />
          <div className="justify-self-center">
            <Logo variant="emblem" height={30} invert priority />
          </div>
          <div />
        </div>
      </nav>

      <div className="mx-auto max-w-2xl px-4 py-10">{children}</div>

      <div className="text-center py-8 text-xs text-neutral-400">
        Capital Rooms Ltd &nbsp;·&nbsp; Member of The Property Ombudsman &nbsp;·&nbsp; ClientMoney Protect
      </div>
    </div>
  )
}

// ── File upload widget ────────────────────────────────────────────────────────

// Doc types that benefit from AI field extraction
const SCANNABLE_DOC_TYPES = new Set([
  'id_document', 'proof_of_address', 'proof_of_ownership',
  'gas_safety_certificate', 'eicr', 'epc', 'fire_risk_assessment',
  'pat_test_record', 'legionella_risk_assessment', 'hmo_licence',
])

function FileUpload({
  token,
  docType,
  label,
  hint,
  slot,
  onUploaded,
  onScanned,
}: {
  token: string
  docType: string
  label: string
  hint: string
  slot: UploadSlot
  onUploaded: (path: string) => void
  onScanned?: (fields: Record<string, string>) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [localUploading, setLocalUploading] = useState(false)
  const [scanning, setScanning]             = useState(false)
  const [scanDone, setScanDone]             = useState(false)
  const [localError, setLocalError]         = useState<string | null>(null)

  async function handleFile(file: File) {
    setLocalUploading(true)
    setLocalError(null)
    setScanDone(false)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('docType', docType)
    try {
      const res = await fetch(`/api/landlord-onboarding/upload/${token}`, { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Upload failed')
      onUploaded(d.path)

      // AI scan — runs in the background after upload completes
      if (onScanned && SCANNABLE_DOC_TYPES.has(docType)) {
        setLocalUploading(false)
        setScanning(true)
        try {
          const scanRes = await fetch(`/api/landlord-onboarding/scan/${token}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ path: d.path, docType }),
          })
          const scanData = await scanRes.json()
          if (scanRes.ok && scanData.fields && Object.keys(scanData.fields).length > 0) {
            onScanned(scanData.fields)
            setScanDone(true)
          }
        } catch {
          // scan failure is non-fatal — user just fills manually
        } finally {
          setScanning(false)
        }
        return
      }
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setLocalUploading(false)
    }
  }

  const uploaded = slot.files.length

  return (
    <div className="rounded-xl border-2 border-dashed border-neutral-200 bg-neutral-50 p-5">
      <p className="text-sm font-bold text-neutral-800 mb-1">{label}</p>
      <p className="text-xs text-neutral-500 mb-4 leading-relaxed">{hint}</p>

      {uploaded > 0 && (
        <div className="mb-3 space-y-1.5">
          {slot.files.map((p, i) => {
            const name = p.split('/').pop() ?? p
            return (
              <div key={i} className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <span>✓</span>
                <span className="truncate">{name.replace(/_\d+\./, '.')}</span>
              </div>
            )
          })}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".jpg,.jpeg,.png,.webp,.pdf"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
      />

      {scanning && (
        <div className="mb-3 flex items-center gap-2 text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
          <span className="animate-spin">⚙️</span>
          <span>Reading document with AI — filling in your details…</span>
        </div>
      )}
      {scanDone && !scanning && (
        <div className="mb-3 flex items-center gap-2 text-xs text-violet-700 bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">
          <span>✨</span>
          <span>AI filled in some fields from this document — please check them below.</span>
        </div>
      )}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={localUploading || scanning}
        className="inline-flex items-center gap-2 text-sm font-semibold border border-neutral-300 bg-white text-neutral-700 rounded-xl px-4 py-2.5 hover:border-neutral-500 hover:bg-neutral-50 transition disabled:opacity-50"
      >
        {localUploading ? '⏳ Uploading…' : scanning ? '⚙️ Scanning…' : uploaded > 0 ? '+ Upload another' : '📎 Choose file'}
      </button>
      <span className="ml-3 text-xs text-neutral-400">JPEG, PNG or PDF · max 10 MB</span>

      {localError && <p className="mt-2 text-xs text-red-600">{localError}</p>}
    </div>
  )
}

// ── Other document upload (custom-named) ──────────────────────────────────────

function OtherDocUpload({
  token,
  slot,
  onUploaded,
}: {
  token: string
  slot: UploadSlot
  onUploaded: (path: string, customName: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [docName, setDocName]           = useState('')
  const [localUploading, setLocalUploading] = useState(false)
  const [localError, setLocalError]     = useState<string | null>(null)
  const [uploadedNames, setUploadedNames] = useState<string[]>([])

  async function handleFile(file: File) {
    if (!docName.trim()) { setLocalError('Please name this document first.'); return }
    setLocalUploading(true)
    setLocalError(null)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('docType', 'other_document')
    fd.append('docLabel', docName.trim())
    try {
      const res = await fetch(`/api/landlord-onboarding/upload/${token}`, { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Upload failed')
      onUploaded(d.path, docName.trim())
      setUploadedNames(prev => [...prev, docName.trim()])
      setDocName('')
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setLocalUploading(false)
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-5">
      <p className="text-sm font-bold text-neutral-800 mb-1">Other document</p>
      <p className="text-xs text-neutral-500 mb-4 leading-relaxed">
        Have a certificate or document that is not listed above? Name it and upload it here.
        You can add as many as you need.
      </p>

      {uploadedNames.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {uploadedNames.map((name, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <span>✓</span><span>{name}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1.5">Document name</label>
          <input
            value={docName}
            onChange={e => setDocName(e.target.value)}
            placeholder="e.g. Asbestos Survey, HMO Additional Licence…"
            className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
          />
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={localUploading || !docName.trim()}
          className="inline-flex items-center gap-2 text-sm font-semibold border border-neutral-300 bg-white text-neutral-700 rounded-xl px-4 py-2.5 hover:border-neutral-500 transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          {localUploading ? '⏳' : '📎 Upload'}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".jpg,.jpeg,.png,.webp,.pdf"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
      />

      <p className="mt-2 text-xs text-neutral-400">JPEG, PNG or PDF · max 10 MB</p>
      {localError && <p className="mt-2 text-xs text-red-600">{localError}</p>}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LandlordOnboardPage() {
  const params = useParams()
  const token  = params?.token as string

  const [loading, setLoading]                 = useState(true)
  const [notFound, setNotFound]               = useState(false)
  const [alreadySubmitted, setAlreadySubmitted] = useState(false)
  const [landlordName, setLandlordName]       = useState('')
  const [form, setForm]                       = useState<FormData>(blank())
  const [activeSection, setActiveSection]     = useState<SectionKey | null>(null)
  const [saving, setSaving]                   = useState(false)
  const [saveMsg, setSaveMsg]                 = useState<string | null>(null)
  const [submitting, setSubmitting]           = useState(false)
  const [submitError, setSubmitError]         = useState('')
  const [done, setDone]                       = useState(false)

  // Upload slot state keyed by docType
  const [uploads, setUploads] = useState<Record<string, UploadSlot>>({})

  function getSlot(docType: string): UploadSlot {
    return uploads[docType] ?? { uploading: false, files: [], error: null }
  }

  function onUploaded(docType: string, path: string) {
    setUploads(u => ({
      ...u,
      [docType]: { ...getSlot(docType), files: [...(u[docType]?.files ?? []), path] },
    }))
    // Also store in form.documents
    setForm(f => {
      const docs = { ...(f.documents ?? {}) }
      docs[docType] = [...(docs[docType] ?? []), path]
      return { ...f, documents: docs }
    })
  }

  const saved = form.__sections_saved ?? []

  useEffect(() => {
    if (!token) return
    fetch(`/api/landlord-onboarding/form/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setNotFound(true); return }
        // Extract first name, stripping salutation if full_name starts with one
        const rawName: string = d.row.first_name ?? d.row.full_name ?? d.row.name ?? ''
        const SALUTATIONS = /^(Mr\.?|Mrs\.?|Miss\.?|Ms\.?|Dr\.?|Prof\.?)\s+/i
        const nameParts = rawName.replace(SALUTATIONS, '').trim().split(/\s+/)
        setLandlordName(nameParts[0] || rawName)
        if (d.row.stage >= 3) { setAlreadySubmitted(true); return }

        const restored: Partial<FormData> = d.row.form_data ?? {}
        if (d.row.entity_type)    restored.entity_type    = d.row.entity_type
        if (d.row.property_count) restored.property_count = d.row.property_count

        // Migrate legacy single-string address → split fields
        function splitAddr(raw: string) {
          if (!raw) return {}
          const parts = raw.includes('\n')
            ? raw.split('\n').map(s => s.trim()).filter(Boolean)
            : raw.split(',').map(s => s.trim()).filter(Boolean)
          const postcode = parts.at(-1) ?? ''
          const town     = parts.at(-2) ?? ''
          const line2    = parts.length > 3 ? parts.at(-3) ?? '' : ''
          const line1    = parts.length > 3 ? parts.slice(0, -3).join(', ') : (parts.at(0) ?? '')
          return { line1: line1 || parts.at(0) || '', line2, town, postcode }
        }

        if (restored.address && !restored.addr_line1) {
          const { line1, line2, town, postcode } = splitAddr(restored.address)
          restored.addr_line1   = line1
          restored.addr_line2   = line2
          restored.addr_town    = town
          restored.addr_postcode = postcode
        }
        if (restored.property_address && !restored.prop_line1) {
          const { line1, line2, town, postcode } = splitAddr(restored.property_address)
          restored.prop_line1    = line1
          restored.prop_line2    = line2
          restored.prop_town     = town
          restored.prop_postcode = postcode
        }
        // Migrate legacy properties array
        if (restored.properties?.length) {
          restored.properties = restored.properties.map((p: any) => {
            if (p.address && !p.line1) {
              const { line1, line2, town, postcode } = splitAddr(p.address)
              return { ...p, line1, line2, town, postcode }
            }
            return p
          })
        }

        setForm(prev => ({ ...prev, ...restored }))

        // Restore upload slots from previously saved documents
        const docs = (d.row.form_data?.documents ?? {}) as Record<string, string[]>
        const slotMap: Record<string, UploadSlot> = {}
        Object.entries(docs).forEach(([dt, paths]) => {
          slotMap[dt] = { uploading: false, files: paths as string[], error: null }
        })
        if (Object.keys(slotMap).length) setUploads(slotMap)
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [token])

  function set<K extends keyof FormData>(key: K, val: FormData[K]) {
    setForm(f => ({ ...f, [key]: val }))
  }

  function updateProperty(i: number, field: string, val: string) {
    setForm(f => ({
      ...f,
      properties: f.properties.map((p, idx) => idx === i ? { ...p, [field]: val } : p),
    }))
  }

  async function saveSection(section: SectionKey) {
    setSaving(true)
    setSaveMsg(null)
    try {
      const res = await fetch(`/api/landlord-onboarding/form/${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section,
          entity_type: form.entity_type || undefined,
          property_count: form.property_count || undefined,
          form_data: form,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Save failed')
      setForm(f => ({ ...f, __sections_saved: d.sections_saved ?? [...(f.__sections_saved ?? []), section] }))
      setSaveMsg('✓ Saved')
      setActiveSection(null)
    } catch {
      setSaveMsg('Save failed — please try again')
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(null), 3000)
    }
  }

  async function handleSubmit() {
    setSubmitting(true)
    setSubmitError('')
    try {
      const res = await fetch(`/api/landlord-onboarding/form/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: form.entity_type,
          property_count: form.property_count,
          form_data: form,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Submission failed')
      setDone(true)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Styles ──
  const inp  = 'w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900'
  const lbl  = 'block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1.5'
  const card = 'bg-white rounded-2xl border border-neutral-200 p-8 mb-6'

  // ── Intro paragraphs per section ──
  const introText: Record<SectionKey, string> = {
    type:        'We need to know whether you are registering as a private individual or through a company, and how many properties you manage. This shapes the rest of the form and determines which documents we require.',
    identity:    'Anti-Money Laundering (AML) regulations require us to verify who we are working with before we can manage your property. We collect your personal details and a copy of your identity document here — everything is stored securely and used solely for compliance purposes.',
    ownership:   'We need to confirm you own, or are authorised to let, the properties you are registering. Please provide the address and any mortgage details. You can upload proof of ownership directly here — a utility bill, council tax letter, or title deed all qualify.',
    bank:        'Rental income is paid directly to the bank account you provide here. We also collect your tax residency status to comply with HMRC reporting obligations. Your banking details are encrypted and only used for rent disbursement.',
    compliance:  'Uploading your current compliance certificates here means we have everything on file from day one — no chasing later. This section is optional: upload whichever documents you have to hand and skip any you do not. If a certificate is due for renewal we will let you know.',
    declaration: 'A brief legal confirmation that the information you have provided is accurate and that you consent to Capital Rooms processing your data in line with our Privacy Policy and Money Laundering Regulations 2017.',
  }

  // ── Early states ──
  if (loading)          return <Shell><p className="text-neutral-400 text-sm text-center py-16">Loading your form…</p></Shell>
  if (notFound)         return <Shell><p className="text-red-500 text-sm font-medium text-center py-16">This link is invalid or has expired. Please contact Capital Rooms.</p></Shell>
  if (alreadySubmitted) return (
    <Shell>
      <div className="text-center py-12">
        <div className="text-5xl mb-5">✅</div>
        <h2 className="text-xl font-bold text-neutral-900 mb-3">Information already received</h2>
        <p className="text-sm text-neutral-500 max-w-sm mx-auto leading-relaxed">We have received your information and our team will be in touch shortly. No further action is needed.</p>
        <p className="text-sm text-neutral-400 mt-6">Questions? <a href="mailto:harry@capitalrooms.co.uk" className="text-neutral-700 underline">harry@capitalrooms.co.uk</a></p>
      </div>
    </Shell>
  )
  if (done) return (
    <Shell>
      <div className="text-center py-12">
        <div className="text-5xl mb-5">🎉</div>
        <h2 className="text-xl font-bold text-neutral-900 mb-3">Thank you, {form.first_name || landlordName}!</h2>
        <p className="text-sm text-neutral-500 leading-relaxed max-w-sm mx-auto">
          Your information has been received. Our compliance team will review your submission and be in touch within 1–2 working days.
        </p>
        <p className="text-sm text-neutral-400 mt-6">
          Questions? <a href="mailto:harry@capitalrooms.co.uk" className="underline text-neutral-700">harry@capitalrooms.co.uk</a>
        </p>
      </div>
    </Shell>
  )

  const allSectionsSaved = SECTIONS.filter(s => !s.optional).every(s => saved.includes(s.key))
  const firstName = form.first_name || landlordName || 'there'

  // ── Progress overview ──────────────────────────────────────────────────────
  if (!activeSection) {
    return (
      <Shell>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">
            {saved.length > 0 ? `Welcome back, ${firstName}` : `Welcome, ${firstName}`}
          </h1>
          <p className="text-sm text-neutral-500 leading-relaxed">
            {(() => {
              const required = SECTIONS.filter(s => !s.optional)
              const reqDone  = required.filter(s => saved.includes(s.key)).length
              if (saved.length === 0) return 'Please complete each section below to register as a Capital Rooms landlord. You can save your progress and return at any time using this link.'
              if (reqDone === required.length) return 'All required sections are complete. The property certificates section is optional — add any you have, then submit when ready.'
              return `${reqDone} of ${required.length} required sections complete. Pick up where you left off.`
            })()}
          </p>
        </div>

        {/* Agreement note */}
        <div className="bg-neutral-900 rounded-2xl p-6 mb-6 flex items-start gap-5">
          <div className="text-3xl mt-0.5">📋</div>
          <div className="flex-1">
            <p className="text-white font-bold text-base mb-1">Management Agreement</p>
            <p className="text-neutral-400 text-sm leading-relaxed">
              Your management agreement has been sent to you by email as a PDF. Please review it before completing the
              sections below. If you did not receive it or need any changes made, reply to Harry's email and he will
              come back to you straight away.
            </p>
          </div>
        </div>

        {/* Section list */}
        <div className="space-y-3 mb-8">
          {SECTIONS.map(s => {
            const isSaved = saved.includes(s.key)
            return (
              <button
                key={s.key}
                onClick={() => setActiveSection(s.key)}
                className="w-full bg-white rounded-2xl border-2 border-neutral-200 p-5 text-left hover:border-neutral-400 transition flex items-center gap-4"
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${isSaved ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-neutral-500'}`}>
                  {isSaved ? '✓' : s.emoji}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-bold ${isSaved ? 'text-neutral-700' : 'text-neutral-900'}`}>{s.label}</p>
                    {s.optional && <span className="text-xs text-neutral-400 border border-neutral-200 rounded-full px-2 py-0.5 leading-none">Optional</span>}
                  </div>
                  <p className="text-xs text-neutral-400 mt-0.5">{isSaved ? 'Saved — tap to review or edit' : s.optional ? 'Optional — upload certificates if you have them' : 'Not yet completed'}</p>
                </div>
                <span className="text-neutral-300 text-lg">›</span>
              </button>
            )
          })}
        </div>

        {saveMsg && (
          <div className="rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm font-semibold px-5 py-3 mb-4">{saveMsg}</div>
        )}

        {allSectionsSaved && (
          <div>
            <div className="rounded-xl bg-green-50 border border-green-200 p-4 mb-4 text-sm text-green-800">
              <p className="font-semibold mb-1">✅ All sections complete</p>
              <p>Please review your information above then submit to send it to the Capital Rooms compliance team.</p>
            </div>
            {submitError && (
              <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-5 py-3 mb-4">{submitError}</div>
            )}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full rounded-xl bg-neutral-900 text-white py-4 text-sm font-bold hover:bg-neutral-700 transition disabled:opacity-40"
            >
              {submitting ? 'Submitting…' : 'Submit my information →'}
            </button>
          </div>
        )}
      </Shell>
    )
  }

  // ── Section editor wrapper ─────────────────────────────────────────────────
  const currentDef = SECTIONS.find(s => s.key === activeSection)!

  function SectionShell({ children, canSave }: { children: React.ReactNode; canSave: boolean }) {
    return (
      <Shell>
        {/* Back breadcrumb */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setActiveSection(null)}
            className="text-sm font-semibold text-neutral-500 hover:text-neutral-800 transition"
          >
            ← Back
          </button>
          <span className="text-neutral-300">/</span>
          <span className="text-sm font-semibold text-neutral-900">{currentDef.label}</span>
        </div>

        {/* Section intro */}
        <div className="rounded-xl bg-white border border-neutral-200 px-6 py-4 mb-6 text-sm text-neutral-600 leading-relaxed">
          {introText[activeSection!]}
        </div>

        {children}

        {saveMsg && (
          <div className="rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm font-semibold px-5 py-3 mb-4">{saveMsg}</div>
        )}

        <div className="flex justify-between mt-2">
          <button onClick={() => setActiveSection(null)} className="rounded-xl border border-neutral-200 px-6 py-3 text-sm font-semibold text-neutral-600 hover:bg-neutral-50 transition">
            ← Back to overview
          </button>
          <button
            onClick={() => saveSection(activeSection!)}
            disabled={!canSave || saving}
            className="rounded-xl bg-neutral-900 text-white px-8 py-3 text-sm font-semibold hover:bg-neutral-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save & continue →'}
          </button>
        </div>
      </Shell>
    )
  }

  // ── SECTION: TYPE ──────────────────────────────────────────────────────────
  if (activeSection === 'type') {
    return (
      <SectionShell canSave={!!(form.entity_type && form.property_count)}>
        <div className={card}>
          <h2 className="text-base font-bold text-neutral-900 mb-6">Are you registering as an individual or a company?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {([['individual', '👤', 'Individual', 'Personal landlord — passport or driving licence required'], ['company', '🏢', 'Company', 'Ltd company, LLP, or partnership — company documents required']] as const).map(([val, emoji, label, desc]) => (
              <button key={val} onClick={() => set('entity_type', val)}
                className={`text-left rounded-xl border-2 p-5 transition ${form.entity_type === val ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 hover:border-neutral-300'}`}>
                <div className="text-2xl mb-2">{emoji}</div>
                <p className="text-sm font-bold text-neutral-900 mb-1">{label}</p>
                <p className="text-xs text-neutral-500">{desc}</p>
              </button>
            ))}
          </div>

          <h2 className="text-base font-bold text-neutral-900 mb-4">How many properties are you registering?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {([['single', '🏠', 'One property', 'Register a single property with Capital Rooms'], ['multiple', '🏘', 'Multiple properties', 'Register two or more properties at once']] as const).map(([val, emoji, label, desc]) => (
              <button key={val} onClick={() => set('property_count', val)}
                className={`text-left rounded-xl border-2 p-5 transition ${form.property_count === val ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 hover:border-neutral-300'}`}>
                <div className="text-2xl mb-2">{emoji}</div>
                <p className="text-sm font-bold text-neutral-900 mb-1">{label}</p>
                <p className="text-xs text-neutral-500">{desc}</p>
              </button>
            ))}
          </div>
        </div>
      </SectionShell>
    )
  }

  // ── SECTION: IDENTITY ──────────────────────────────────────────────────────
  if (activeSection === 'identity') {
    const isIndividual = form.entity_type !== 'company'
    const hasIdDoc = getSlot('id_document').files.length > 0
    const hasAddress = getSlot('proof_of_address').files.length > 0
    const canSave = isIndividual
      ? !!(form.first_name && form.last_name && form.dob && form.addr_line1 && form.addr_town && form.addr_postcode && form.contact_phone && form.contact_email)
      : !!(form.company_name && form.company_reg && form.contact_email)

    return (
      <SectionShell canSave={canSave}>
        {isIndividual ? (
          <>
            <div className={card}>
              <h2 className="text-base font-bold text-neutral-900 mb-6">Personal Details</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className={lbl}>Title</label>
                  <select value={form.salutation} onChange={e => set('salutation', e.target.value)} className={inp}>
                    <option value="">Select…</option>
                    <option value="Mr">Mr</option>
                    <option value="Mrs">Mrs</option>
                    <option value="Ms">Ms</option>
                    <option value="Miss">Miss</option>
                    <option value="Dr">Dr</option>
                    <option value="Prof">Prof</option>
                  </select>
                </div>
                <div className="hidden sm:block" />
                <div><label className={lbl}>First name *</label><input value={form.first_name} onChange={e => set('first_name', e.target.value)} className={inp} placeholder="e.g. James" /></div>
                <div><label className={lbl}>Last name *</label><input value={form.last_name} onChange={e => set('last_name', e.target.value)} className={inp} placeholder="e.g. Smith" /></div>
                <div><label className={lbl}>Date of birth *</label><input type="date" value={form.dob} onChange={e => set('dob', e.target.value)} className={inp} /></div>
                <div><label className={lbl}>Nationality *</label><input value={form.nationality} onChange={e => set('nationality', e.target.value)} className={inp} placeholder="e.g. British" /></div>
              </div>

              <div className="mt-5 pt-5 border-t border-neutral-100">
                <AddressInput
                  label="Residential Address"
                  required
                  value={{ line1: form.addr_line1, line2: form.addr_line2, town: form.addr_town, county: form.addr_county, postcode: form.addr_postcode }}
                  onChange={a => setForm(f => ({ ...f, addr_line1: a.line1, addr_line2: a.line2, addr_town: a.town, addr_county: a.county, addr_postcode: a.postcode }))}
                  inputClass={inp}
                  labelClass={lbl}
                />
              </div>

              <div className="mt-5 pt-5 border-t border-neutral-100">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div><label className={lbl}>Employer / occupation</label><input value={form.employer} onChange={e => set('employer', e.target.value)} className={inp} placeholder="e.g. Self-employed landlord" /></div>
                  <div><label className={lbl}>Contact phone *</label><input type="tel" value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} className={inp} placeholder="07700 900000" /></div>
                  <div className="sm:col-span-2"><label className={lbl}>Contact email *</label><input type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} className={inp} placeholder="james@example.com" /></div>
                </div>
              </div>
            </div>

            <div className={card}>
              <h2 className="text-base font-bold text-neutral-900 mb-2">Identity Documents</h2>
              <p className="text-sm text-neutral-500 mb-6 leading-relaxed">
                Upload clear colour images or scans — JPEG, PNG or PDF format. Documents must be in date and fully legible. You can upload more than one file if needed.
              </p>

              <div className="mb-4">
                <label className={lbl}>Document type *</label>
                <select value={form.id_type} onChange={e => set('id_type', e.target.value)} className={inp + ' mb-4'}>
                  <option value="passport">Passport</option>
                  <option value="driving_licence">UK Driving Licence</option>
                  <option value="national_id">National Identity Card</option>
                </select>
              </div>

              <div className="space-y-4">
                <FileUpload
                  token={token}
                  docType="id_document"
                  label={form.id_type === 'passport' ? 'Passport (photo page)' : form.id_type === 'driving_licence' ? 'Driving licence (both sides)' : 'National identity card (both sides)'}
                  hint="Upload a clear colour copy of your identity document. Both sides required for driving licence and national ID cards."
                  slot={getSlot('id_document')}
                  onUploaded={path => onUploaded('id_document', path)}
                  onScanned={fields => setForm(f => ({
                    ...f,
                    ...(fields.first_name   ? { first_name:   fields.first_name }   : {}),
                    ...(fields.last_name    ? { last_name:    fields.last_name }    : {}),
                    ...(fields.date_of_birth ? { dob: fields.date_of_birth } : {}),
                    ...(fields.nationality  ? { nationality:  fields.nationality }  : {}),
                  }))}
                />
                <FileUpload
                  token={token}
                  docType="proof_of_address"
                  label="Proof of address"
                  hint="A utility bill, bank statement, or council tax letter dated within the last 3 months, showing your full name and residential address."
                  slot={getSlot('proof_of_address')}
                  onUploaded={path => onUploaded('proof_of_address', path)}
                  onScanned={fields => {
                    setForm(f => ({
                      ...f,
                      ...(fields.address_line_1 ? { addr_line1: fields.address_line_1 } : {}),
                      ...(fields.address_line_2 ? { addr_line2: fields.address_line_2 } : {}),
                      ...(fields.town_city      ? { addr_town:  fields.town_city }      : {}),
                      ...(fields.county         ? { addr_county: fields.county }        : {}),
                      ...(fields.postcode       ? { addr_postcode: fields.postcode }    : {}),
                    }))
                  }}
                />
              </div>

              <div className="mt-5 flex items-start gap-3 bg-violet-50 border border-violet-100 rounded-xl px-4 py-3.5">
                <span className="text-lg shrink-0">✨</span>
                <p className="text-xs text-violet-700 leading-relaxed">
                  <strong>AI tip:</strong> Upload your passport or proof of address first — we'll read the document automatically and fill in your name, date of birth, nationality, and address for you. You can still edit everything once it's populated.
                </p>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className={card}>
              <h2 className="text-base font-bold text-neutral-900 mb-6">Company Details</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div><label className={lbl}>Company name *</label><input value={form.company_name} onChange={e => set('company_name', e.target.value)} className={inp} placeholder="e.g. Smith Properties Ltd" /></div>
                <div><label className={lbl}>Company registration number *</label><input value={form.company_reg} onChange={e => set('company_reg', e.target.value)} className={inp} placeholder="e.g. 12345678" /></div>
                <div className="sm:col-span-2"><label className={lbl}>Registered office address *</label><textarea rows={2} value={form.registered_office} onChange={e => set('registered_office', e.target.value)} className={inp} placeholder={'1 Company House\nLondon\nEC1A 1BB'} /></div>
                <div className="sm:col-span-2"><label className={lbl}>Directors / beneficial owners (25%+) *</label><textarea rows={2} value={form.directors} onChange={e => set('directors', e.target.value)} className={inp} placeholder="Full name, date of birth, nationality — one per line" /></div>
                <div><label className={lbl}>Contact phone *</label><input type="tel" value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} className={inp} placeholder="07700 900000" /></div>
                <div><label className={lbl}>Contact email *</label><input type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} className={inp} placeholder="accounts@company.com" /></div>
              </div>
            </div>

            <div className={card}>
              <h2 className="text-base font-bold text-neutral-900 mb-2">Company Documents</h2>
              <p className="text-sm text-neutral-500 mb-6 leading-relaxed">
                Upload your company formation documents and identity documents for each director or beneficial owner holding 25% or more.
              </p>
              <div className="space-y-4">
                <FileUpload
                  token={token}
                  docType="certificate_of_incorporation"
                  label="Certificate of Incorporation"
                  hint="Your official Companies House certificate confirming the company exists."
                  slot={getSlot('certificate_of_incorporation')}
                  onUploaded={path => onUploaded('certificate_of_incorporation', path)}
                />
                <FileUpload
                  token={token}
                  docType="articles_of_association"
                  label="Articles of Association"
                  hint="The company's constitutional document, available from Companies House."
                  slot={getSlot('articles_of_association')}
                  onUploaded={path => onUploaded('articles_of_association', path)}
                />
                <FileUpload
                  token={token}
                  docType="director_id"
                  label="Director / beneficial owner ID"
                  hint="Passport or driving licence for each director or person holding 25%+ of shares."
                  slot={getSlot('director_id')}
                  onUploaded={path => onUploaded('director_id', path)}
                />
                <FileUpload
                  token={token}
                  docType="director_address"
                  label="Director proof of address"
                  hint="A utility bill or bank statement dated within 3 months for each director / beneficial owner."
                  slot={getSlot('director_address')}
                  onUploaded={path => onUploaded('director_address', path)}
                />
              </div>
            </div>
          </>
        )}
      </SectionShell>
    )
  }

  // ── SECTION: OWNERSHIP ─────────────────────────────────────────────────────
  if (activeSection === 'ownership') {
    const single  = form.property_count !== 'multiple'
    const canSave = single
      ? !!(form.prop_line1 && form.prop_town && form.prop_postcode)
      : !!(form.properties[0]?.line1 && form.properties[0]?.town)
    return (
      <SectionShell canSave={canSave}>
        {single ? (
          <>
            <div className={card}>
              <AddressInput
                label="Property Address"
                required
                value={{ line1: form.prop_line1, line2: form.prop_line2, town: form.prop_town, county: form.prop_county, postcode: form.prop_postcode }}
                onChange={a => setForm(f => ({ ...f, prop_line1: a.line1, prop_line2: a.line2, prop_town: a.town, prop_county: a.county, prop_postcode: a.postcode, property_address: toAddressString(a) }))}
                inputClass={inp}
                labelClass={lbl}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-5 pt-5 border-t border-neutral-100">
                <div><label className={lbl}>Mortgage provider (if applicable)</label><input value={form.mortgage_provider} onChange={e => set('mortgage_provider', e.target.value)} className={inp} placeholder="e.g. NatWest, or 'Owned outright'" /></div>
                <div><label className={lbl}>Mortgage account number</label><input value={form.mortgage_account} onChange={e => set('mortgage_account', e.target.value)} className={inp} placeholder="e.g. 12345678" /></div>
              </div>
            </div>

            <div className={card}>
              <h2 className="text-base font-bold text-neutral-900 mb-2">Proof of Ownership</h2>
              <p className="text-sm text-neutral-500 mb-6 leading-relaxed">
                Upload one or more of the following: a council tax bill or utility bill for the property, a Land Registry title document, or your purchase completion statement. This confirms your right to let the property.
              </p>
              <FileUpload
                token={token}
                docType="proof_of_ownership"
                label="Proof of ownership / right to let"
                hint="Council tax letter, utility bill in your name at the property address, Land Registry title, or solicitor's completion letter."
                slot={getSlot('proof_of_ownership')}
                onUploaded={path => onUploaded('proof_of_ownership', path)}
                onScanned={fields => {
                  if (fields.property_address && !form.prop_line1) {
                    // Parse the property address from AI scan into split fields
                    const raw = fields.property_address
                    const parts = raw.includes('\n')
                      ? raw.split('\n').map((s: string) => s.trim()).filter(Boolean)
                      : raw.split(',').map((s: string) => s.trim()).filter(Boolean)
                    const postcode = parts.at(-1) ?? ''
                    const town     = parts.at(-2) ?? ''
                    const line1    = parts.at(0) ?? ''
                    const line2    = parts.length > 3 ? parts.at(1) ?? '' : ''
                    setForm(f => ({ ...f, prop_line1: line1, prop_line2: line2, prop_town: town, prop_postcode: postcode, property_address: raw }))
                  }
                }}
              />
              <div className="mt-4 flex items-start gap-3 bg-violet-50 border border-violet-100 rounded-xl px-4 py-3.5">
                <span className="text-lg shrink-0">✨</span>
                <p className="text-xs text-violet-700 leading-relaxed">
                  <strong>AI tip:</strong> Upload your Land Registry title or council tax letter first — we'll read the property address from it automatically.
                </p>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className={card}>
              <h2 className="text-base font-bold text-neutral-900 mb-2">Property Portfolio</h2>
              <p className="text-sm text-neutral-500 mb-6">Enter each property you wish to register.</p>
              {form.properties.map((p, i) => (
                <div key={i} className="rounded-xl border border-neutral-100 bg-neutral-50 p-5 mb-4">
                  <p className="text-xs font-bold text-neutral-500 uppercase tracking-wide mb-4">Property {i + 1}</p>
                  <AddressInput
                    required
                    value={{ line1: p.line1 ?? '', line2: p.line2 ?? '', town: p.town ?? '', county: '', postcode: p.postcode ?? '' }}
                    onChange={a => {
                      const updated = form.properties.map((prop, j) =>
                        j === i ? { ...prop, line1: a.line1, line2: a.line2, town: a.town, postcode: a.postcode, address: toAddressString(a) } : prop
                      )
                      setForm(f => ({ ...f, properties: updated }))
                    }}
                    inputClass={inp}
                    labelClass={lbl}
                  />
                  <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-neutral-100">
                    <div><label className={lbl}>Mortgage provider</label><input value={p.mortgage_provider} onChange={e => updateProperty(i, 'mortgage_provider', e.target.value)} className={inp} placeholder="or 'Owned outright'" /></div>
                    <div><label className={lbl}>Mortgage account</label><input value={p.mortgage_account} onChange={e => updateProperty(i, 'mortgage_account', e.target.value)} className={inp} /></div>
                  </div>
                </div>
              ))}
              <button onClick={() => setForm(f => ({ ...f, properties: [...f.properties, { address: '', mortgage_provider: '', mortgage_account: '' }] }))}
                className="text-sm font-semibold text-neutral-700 border border-dashed border-neutral-300 rounded-xl w-full py-3 hover:border-neutral-500 transition mb-2">
                + Add another property
              </button>
            </div>

            <div className={card}>
              <h2 className="text-base font-bold text-neutral-900 mb-2">Proof of Ownership</h2>
              <p className="text-sm text-neutral-500 mb-6 leading-relaxed">
                Upload proof of ownership for each property in your portfolio. You can upload multiple files here — one per property if needed.
              </p>
              <FileUpload
                token={token}
                docType="proof_of_ownership"
                label="Proof of ownership (all properties)"
                hint="Council tax letters, Land Registry titles, or purchase completion statements — one per property. You can upload multiple files."
                slot={getSlot('proof_of_ownership')}
                onUploaded={path => onUploaded('proof_of_ownership', path)}
              />
            </div>
          </>
        )}
      </SectionShell>
    )
  }

  // ── SECTION: BANK ──────────────────────────────────────────────────────────
  if (activeSection === 'bank') {
    return (
      <SectionShell canSave={!!(form.bank_name && form.account_number && form.sort_code)}>
        <div className={card}>
          <h2 className="text-base font-bold text-neutral-900 mb-2">Bank & Tax Details</h2>
          <p className="text-sm text-neutral-500 mb-6">Used to remit rental income and comply with HMRC reporting requirements. Accessible to Capital Rooms management only.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
            <div><label className={lbl}>Bank name *</label><input value={form.bank_name} onChange={e => set('bank_name', e.target.value)} className={inp} placeholder="e.g. Barclays" /></div>
            <div><label className={lbl}>Account holder name *</label><input className={inp} placeholder="As it appears on the account" /></div>
            <div><label className={lbl}>Account number *</label><input value={form.account_number} onChange={e => set('account_number', e.target.value)} className={inp} placeholder="12345678" /></div>
            <div><label className={lbl}>Sort code *</label><input value={form.sort_code} onChange={e => set('sort_code', e.target.value)} className={inp} placeholder="12-34-56" /></div>
            <div className="sm:col-span-2"><label className={lbl}>IBAN (if applicable)</label><input value={form.iban} onChange={e => set('iban', e.target.value)} className={inp} placeholder="e.g. GB29 NWBK 6016 1331 9268 19" /></div>
          </div>
          <h3 className="text-sm font-bold text-neutral-700 mb-4">HMRC / Non-Resident Landlord</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
            <div>
              <label className={lbl}>Are you a UK tax resident? *</label>
              <select value={form.uk_resident} onChange={e => set('uk_resident', e.target.value)} className={inp}>
                <option value="yes">Yes — UK resident</option>
                <option value="no">No — Non-resident landlord (NRL)</option>
              </select>
            </div>
            {form.uk_resident === 'no' && (
              <div><label className={lbl}>NRL approval reference</label><input value={form.nrl_ref} onChange={e => set('nrl_ref', e.target.value)} className={inp} placeholder="HMRC NRL1 reference" /></div>
            )}
          </div>
          <h3 className="text-sm font-bold text-neutral-700 mb-4">Emergency Contact</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div><label className={lbl}>Full name</label><input value={form.emergency_name} onChange={e => set('emergency_name', e.target.value)} className={inp} placeholder="e.g. Sarah Smith" /></div>
            <div><label className={lbl}>Relationship</label><input value={form.emergency_relation} onChange={e => set('emergency_relation', e.target.value)} className={inp} placeholder="e.g. Spouse, Solicitor" /></div>
            <div className="sm:col-span-2"><label className={lbl}>Phone</label><input type="tel" value={form.emergency_phone} onChange={e => set('emergency_phone', e.target.value)} className={inp} placeholder="07700 900000" /></div>
          </div>
        </div>
      </SectionShell>
    )
  }

  // ── SECTION: COMPLIANCE ────────────────────────────────────────────────────
  if (activeSection === 'compliance') {
    const isHmo = form.entity_type !== 'company' && form.property_count !== 'multiple'
      ? true  // default show all — we don't know yet if it's HMO
      : true  // always show all; admin can filter later

    // Determine whether to show HMO-specific docs
    // We show them all — it's better to offer and have the landlord skip than to hide docs they need
    const relevantDocs = COMPLIANCE_DOCS

    const totalUploaded = relevantDocs.reduce((n, d) => n + getSlot(d.docType).files.length, 0)
      + getSlot('other_document').files.length

    return (
      <SectionShell canSave={true /* always saveable — optional section */}>
        <div className="bg-white rounded-2xl border border-neutral-200 p-8 mb-6">
          <h2 className="text-base font-bold text-neutral-900 mb-2">Property Compliance Certificates</h2>
          <p className="text-sm text-neutral-500 mb-6 leading-relaxed">
            Upload whichever certificates you currently hold. Skip any you do not have — you will not be blocked from submitting.
            All documents are stored securely and shared only with Capital Rooms management.
          </p>

          <div className="mb-5 flex items-start gap-3 bg-violet-50 border border-violet-100 rounded-xl px-4 py-3.5">
            <span className="text-lg shrink-0">✨</span>
            <p className="text-xs text-violet-700 leading-relaxed">
              <strong>AI tip:</strong> Upload each certificate and we'll automatically read the expiry date so you never have to type it in manually.
            </p>
          </div>

          <div className="space-y-5">
            {relevantDocs.map(doc => (
              <div key={doc.docType} className="rounded-xl border border-neutral-100 bg-neutral-50 p-5">
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-0.5">{doc.regulation}</p>
                <FileUpload
                  token={token}
                  docType={doc.docType}
                  label={doc.label}
                  hint={doc.hint}
                  slot={getSlot(doc.docType)}
                  onUploaded={path => onUploaded(doc.docType, path)}
                  onScanned={fields => {
                    // Store extracted dates in form_data under cert_dates[docType]
                    if (fields.expiry_date || fields.issue_date) {
                      setForm(f => ({
                        ...f,
                        cert_dates: {
                          ...((f as any).cert_dates ?? {}),
                          [doc.docType]: {
                            issue_date:  fields.issue_date  ?? null,
                            expiry_date: fields.expiry_date ?? null,
                            ...(fields.current_rating ? { rating: fields.current_rating } : {}),
                            ...(fields.licence_number ? { licence_number: fields.licence_number } : {}),
                          }
                        }
                      }))
                    }
                  }}
                />
              </div>
            ))}

            {/* Other — free-text named upload */}
            <OtherDocUpload
              token={token}
              slot={getSlot('other_document')}
              onUploaded={(path, customName) => {
                onUploaded('other_document', path)
                // Store the custom name in form state
                setForm(f => ({
                  ...f,
                  other_doc_names: [...((f as any).other_doc_names ?? []), customName],
                }))
              }}
            />
          </div>

          {totalUploaded > 0 && (
            <div className="mt-6 rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
              ✓ {totalUploaded} document{totalUploaded !== 1 ? 's' : ''} uploaded — save to continue.
            </div>
          )}
        </div>
      </SectionShell>
    )
  }

  // ── SECTION: DECLARATION ───────────────────────────────────────────────────
  if (activeSection === 'declaration') {
    return (
      <SectionShell canSave={form.declaration}>
        <div className={card}>
          <h2 className="text-base font-bold text-neutral-900 mb-6">Declaration</h2>
          <div className="text-sm text-neutral-600 mb-6 space-y-3 leading-relaxed">
            <p>By completing this form, I confirm that:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>All information provided is accurate and complete to the best of my knowledge.</li>
              <li>I am the beneficial owner of the property or properties listed, or am duly authorised to act on behalf of the owning entity.</li>
              <li>I understand that Capital Rooms is required to verify my identity in accordance with the Money Laundering Regulations 2017 and may be unable to proceed if satisfactory evidence cannot be obtained.</li>
              <li>I consent to Capital Rooms retaining my information in accordance with their Privacy Policy for the duration of our relationship and for a period of 5 years thereafter.</li>
            </ul>
          </div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={form.declaration} onChange={e => set('declaration', e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-neutral-300" />
            <span className="text-sm text-neutral-700 leading-relaxed">
              I confirm the above declaration and consent to the use of my information as described.
            </span>
          </label>
        </div>
      </SectionShell>
    )
  }

  return null
}
