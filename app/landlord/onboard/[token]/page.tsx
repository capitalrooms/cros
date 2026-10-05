'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import PublicShell from '@/components/public/PublicShell'
import AddressInput, { type AddressValue, emptyAddress, toAddressString, parseAddressString } from '@/app/components/AddressInput'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { missingFor, missingAll, isJoint, REQUIRED_SECTIONS, type SectionKey } from '@/lib/landlordOnboarding/requirements'
import type { PropertyDoc } from '@/lib/landlordOnboarding/propertyDocs'
import PropertyDocs from './PropertyDocs'

type EntityType    = 'individual' | 'company'
type PropertyCount = 'single' | 'multiple'
type YesNo         = 'yes' | 'no' | ''

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
  // Joint (second) landlord — individuals only
  joint: YesNo
  j_salutation: string
  j_first_name: string
  j_last_name: string
  j_dob: string
  j_nationality: string
  j_id_type: string
  j_same_address: boolean
  j_addr_line1: string
  j_addr_line2: string
  j_addr_town: string
  j_addr_county: string
  j_addr_postcode: string
  j_contact_phone: string
  j_contact_email: string
  // Background (HMRC CDD / EDD)
  pep: YesNo
  pep_details: string
  j_pep: YesNo
  j_pep_details: string
  acting_for_other: YesNo
  acting_for_details: string
  source_of_funds: string
  source_of_funds_details: string
  country_of_residence: string
  account_holder: string
  __sections_saved?: SectionKey[]
  documents?: Record<string, string[]>
  property_docs?: PropertyDoc[]
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
    joint: '', j_salutation: '', j_first_name: '', j_last_name: '', j_dob: '', j_nationality: '', j_id_type: 'passport',
    j_same_address: true, j_addr_line1: '', j_addr_line2: '', j_addr_town: '', j_addr_county: '', j_addr_postcode: '',
    j_contact_phone: '', j_contact_email: '',
    pep: '', pep_details: '', j_pep: '', j_pep_details: '',
    acting_for_other: '', acting_for_details: '',
    source_of_funds: '', source_of_funds_details: '', country_of_residence: 'United Kingdom',
    account_holder: '',
  }
}

const SOURCE_OF_FUNDS = [
  ['mortgage_and_savings', 'Mortgage plus my own savings / deposit'],
  ['savings', 'Savings or earnings (no mortgage)'],
  ['sale_of_property', 'Proceeds from selling another property'],
  ['inheritance', 'Inheritance'],
  ['gift', 'Gift from family'],
  ['business_income', 'Business income or company funds'],
  ['other', 'Other'],
] as const

const SECTIONS: { key: SectionKey; label: string; emoji: string; optional?: boolean }[] = [
  { key: 'type',        label: 'About you',               emoji: '👤' },
  { key: 'identity',    label: 'Identity',                emoji: '🪪' },
  { key: 'ownership',   label: 'Property ownership',      emoji: '🏠' },
  { key: 'aml',         label: 'Background & source of funds', emoji: '🔎' },
  { key: 'bank',        label: 'Banking & tax',           emoji: '🏦' },
  { key: 'compliance',  label: 'Property documents',      emoji: '📂', optional: true },
  { key: 'declaration', label: 'Declaration',             emoji: '✍️' },
]

const SECTION_ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii']

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

// The shared public frame (components/public/PublicShell) — same header and footer as every page we send out.
// `wide` is the welcome overview (design "C", full width); the section editors keep a narrow reading column.
function Shell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <PublicShell label="Landlord onboarding">
      {wide ? children : <div className="mx-auto max-w-2xl px-4 py-10">{children}</div>}
    </PublicShell>
  )
}

// ── Uploads ───────────────────────────────────────────────────────────────────
// Browser → storage directly via a signed URL: the web host rejects request bodies over 4.5 MB,
// which is smaller than many phone photos and scanned PDFs.

const storage = () => createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
).storage

const MIME_BY_EXT: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' }

// iPhone photos are often HEIC/HEIF, which reviewers' browsers and the document reader can't open:
// convert them to JPEG on the landlord's device before uploading.
async function normaliseFile(file: File): Promise<File> {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  const isHeic = ['heic', 'heif'].includes(ext) || /image\/hei[cf]/.test(file.type)
  if (isHeic) {
    const heic2any = (await import('heic2any')).default
    const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 })
    const blob = Array.isArray(out) ? out[0] : out
    file = new File([blob], file.name.replace(/\.(heic|heif)$/i, '') + '.jpg', { type: 'image/jpeg' })
  }
  return shrinkPhoto(file)
}

// Large phone photos → max 2400px JPEG: still sharp for ID checks, quick to upload and small
// enough for automatic document reading.
async function shrinkPhoto(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 2.5 * 1024 * 1024) return file
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.88))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

async function uploadDocument(token: string, docType: string, original: File): Promise<string> {
  let file: File
  try { file = await normaliseFile(original) }
  catch { throw new Error('This iPhone photo could not be converted. Please take a screenshot of it and upload that instead, or upload a PDF.') }
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  const contentType = MIME_BY_EXT[ext] ?? file.type
  if (['tif', 'tiff'].includes(ext)) {
    throw new Error('TIFF scans can’t be viewed online — please save the scan as a PDF or JPEG and upload that.')
  }
  if (!Object.values(MIME_BY_EXT).includes(contentType)) {
    throw new Error('Please upload a photo (JPEG, PNG, HEIC) or a PDF. A screenshot of the document works too.')
  }
  if (file.size > 20 * 1024 * 1024) throw new Error('That file is over 20 MB — please choose a smaller photo or PDF.')
  const call = async (payload: Record<string, unknown>) => {
    const res = await fetch(`/api/landlord-onboarding/upload/${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ docType, ...payload }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(d.error ?? 'Upload failed — please try again')
    return d
  }
  const start = await call({ action: 'start', contentType, size: file.size })
  const { error } = await storage().from(start.bucket).uploadToSignedUrl(start.path, start.uploadToken, file, { contentType })
  if (error) throw new Error('Upload failed — please check your connection and try again')
  await call({ action: 'confirm', path: start.path })
  return start.path as string
}

// Document reader returns DD/MM/YYYY and names in capitals; the form needs ISO dates and normal case.
function toIsoDate(d?: string): string | undefined {
  if (!d) return undefined
  const m = d.trim().match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return /^\d{4}-\d{2}-\d{2}$/.test(d.trim()) ? d.trim() : undefined
}
const properCase = (s?: string) => s ? s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_, p, c) => p + c.toUpperCase()) : s

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
    try {
      const path = await uploadDocument(token, docType, file)
      onUploaded(path)

      // AI scan — runs in the background after upload completes
      if (onScanned && SCANNABLE_DOC_TYPES.has(docType)) {
        setLocalUploading(false)
        setScanning(true)
        try {
          const scanRes = await fetch(`/api/landlord-onboarding/scan/${token}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ path, docType }),
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
    <div className="py-5" style={{ borderTop: '1px solid #111', borderBottom: '1px solid #E4E0D8' }}>
      <p className="text-[16px] font-semibold mb-1">{label}</p>
      <p className="text-[13.5px] mb-4 leading-relaxed" style={{ color: '#6F6B64' }}>{hint}</p>

      {uploaded > 0 && (
        <div className="mb-3 space-y-1.5">
          {slot.files.map((p, i) => (
            <div key={p} className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <span>✓</span>
              <span className="truncate">{slot.files.length > 1 ? `File ${i + 1} uploaded` : 'File uploaded'}</span>
            </div>
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf,image/*,application/pdf"
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
        className="pub-btn-ghost disabled:opacity-50"
      >
        {localUploading ? 'Uploading…' : scanning ? 'Reading it…' : uploaded > 0 ? '+ Upload another' : 'Take a photo or choose a file'}
      </button>
      <span className="ml-3 text-xs" style={{ color: '#8A857C' }}>Photo (JPEG, PNG, HEIC) or PDF · max 20 MB</span>

      {localError && <p className="mt-2 text-xs text-red-600">{localError}</p>}
    </div>
  )
}

function YesNoButtons({ value, onChange }: { value: string; onChange: (v: 'yes' | 'no') => void }) {
  return (
    <div className="flex gap-3">
      {(['no', 'yes'] as const).map(v => (
        <button key={v} type="button" onClick={() => onChange(v)} aria-pressed={value === v}
          className={`pub-pill ${value === v ? 'on' : ''}`}>
          {v === 'yes' ? 'Yes' : 'No'}
        </button>
      ))}
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
  const [canReopen, setCanReopen] = useState(false)
  const [reopening, setReopening] = useState(false)
  const [reopenError, setReopenError] = useState('')
  const [landlordName, setLandlordName]       = useState('')
  const [agreementType, setAgreementType]     = useState<string | null>(null)
  const [form, setForm]                       = useState<FormData>(blank())
  const [activeSection, setActiveSection]     = useState<SectionKey | null>(null)
  const [saving, setSaving]                   = useState(false)
  const [saveMsg, setSaveMsg]                 = useState<string | null>(null)
  const [submitting, setSubmitting]           = useState(false)
  const [submitError, setSubmitError]         = useState('')
  const [submitMissing, setSubmitMissing]     = useState<{ section: SectionKey; items: string[] }[]>([])
  const [done, setDone]                       = useState(false)
  const [autoStatus, setAutoStatus]           = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [showMissing, setShowMissing]         = useState(false)
  const lastSavedJson = useRef<string>('')
  const formRef = useRef<FormData | null>(null)

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
        setAgreementType(d.row.agreement_type ?? null)
        if (d.row.stage >= 3) { setAlreadySubmitted(true); setCanReopen(!!d.row.can_reopen); return }

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

        setForm(prev => {
          const next = { ...prev, ...restored }
          lastSavedJson.current = JSON.stringify(next)
          return next
        })

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

  formRef.current = form

  // Background auto-save: shortly after the landlord stops typing, and when the tab is hidden
  // (closing the page on a phone). Draft saves never mark a section complete.
  async function saveDraft(keepalive = false) {
    const current = formRef.current
    if (!current || !activeSection) return
    const json = JSON.stringify(current)
    if (json === lastSavedJson.current) return
    setAutoStatus('saving')
    try {
      const res = await fetch(`/api/landlord-onboarding/form/${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: activeSection, draft: true, form_data: current }),
        keepalive,
      })
      if (!res.ok) throw new Error()
      lastSavedJson.current = json
      setAutoStatus('saved')
    } catch {
      setAutoStatus('error')
    }
  }

  useEffect(() => {
    if (loading || !activeSection) return
    if (JSON.stringify(form) === lastSavedJson.current) return
    const t = setTimeout(() => { saveDraft() }, 1200)
    return () => clearTimeout(t)
  }, [form, activeSection, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') saveDraft(true) }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', onHide) }
  }, [activeSection]) // eslint-disable-line react-hooks/exhaustive-deps

  async function leaveSection() {
    await saveDraft()
    setShowMissing(false)
    setActiveSection(null)
    window.scrollTo(0, 0)
  }

  async function saveSection(section: SectionKey) {
    const missing = missingFor(section, form as never)
    setSaving(true)
    setSaveMsg(null)
    try {
      const res = await fetch(`/api/landlord-onboarding/form/${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, form_data: form }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Save failed')
      lastSavedJson.current = JSON.stringify(form)
      setAutoStatus('saved')
      setForm(f => {
        const next = { ...f, __sections_saved: d.sections_saved ?? f.__sections_saved }
        lastSavedJson.current = JSON.stringify(next)
        return next
      })
      if (missing.length || d.missing?.length) {
        setShowMissing(true)
        setSaveMsg('Your progress is saved. A few items are still needed before this section is complete — see the list below.')
      } else {
        setShowMissing(false)
        setSaveMsg('✓ Section saved')
        setActiveSection(null)
        window.scrollTo(0, 0)
      }
    } catch (e) {
      setSaveMsg(e instanceof Error && e.message !== 'Save failed' ? e.message : 'Save failed — please check your connection and try again. Nothing you typed has been lost.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit() {
    setSubmitting(true)
    setSubmitError('')
    setSubmitMissing([])
    try {
      const res = await fetch(`/api/landlord-onboarding/form/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form_data: form }),
      })
      const d = await res.json()
      if (res.status === 400 && d.missing) { setSubmitMissing(d.missing); throw new Error('A few items are still needed before you can submit — see below.') }
      if (!res.ok) throw new Error(d.error ?? 'Submission failed')
      setDone(true)
      window.scrollTo(0, 0)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Submission failed — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Styles ──
  // the shared public look (components/public/public.css, design "C")
  const inp  = 'pub-input'
  const lbl  = 'pub-label mb-1'
  const card = 'pub-rise pt-6 pb-10 mb-2'

  // ── Intro paragraphs per section ──
  const introText: Record<SectionKey, string> = {
    type:        'We need to know whether you are registering as a private individual or through a company, and how many properties you manage. This shapes the rest of the form and determines which documents we require.',
    identity:    'Anti-Money Laundering (AML) regulations require us to verify who we are working with before we can manage your property. We collect your personal details and a copy of your identity document here — everything is stored securely and used solely for compliance purposes.',
    ownership:   'We need to confirm you own, or are authorised to let, the properties you are registering. Please provide the address and any mortgage details. You can upload proof of ownership directly here — a utility bill, council tax letter, or title deed all qualify.',
    aml:         'Money laundering regulations require us to understand who we are working with and how the property was funded. These short questions are asked of every landlord — answering them helps us complete your checks quickly.',
    bank:        'Rental income is paid directly to the bank account you provide here. We also collect your tax residency status to comply with HMRC reporting obligations. Your banking details are encrypted and only used for rent disbursement.',
    compliance:  'Adding your property documents here means we have everything on file from day one — no chasing later. This section is optional: add whatever you have to hand and send anything else later. If a certificate is due for renewal we will let you know.',
    declaration: 'A brief legal confirmation that the information you have provided is accurate and that you consent to Capital Rooms processing your data in line with our Privacy Policy and Money Laundering Regulations 2017.',
  }

  // ── Early states ──
  if (loading)          return <Shell><p className="text-neutral-400 text-sm text-center py-16">Loading your form…</p></Shell>
  if (notFound)         return <Shell><p className="text-red-500 text-sm font-medium text-center py-16">This link is invalid or has expired. Please contact Capital Rooms.</p></Shell>
  // ── Thank you (just sent, or opening the link again later) — design "C", with "Reopen my form" ──
  async function reopenForm() {
    setReopening(true); setReopenError('')
    try {
      const r = await fetch(`/api/landlord-onboarding/form/${token}/reopen`, { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Could not reopen the form — please try again.')
      window.location.reload()
    } catch (e) {
      setReopenError(e instanceof Error ? e.message : 'Could not reopen the form — please try again.')
      setReopening(false)
    }
  }
  if (alreadySubmitted || done) {
    const thanksName = done
      ? (isJoint(form as never) && form.j_first_name ? `${properCase(form.first_name) || landlordName} & ${properCase(form.j_first_name)}` : properCase(form.first_name) || landlordName)
      : landlordName
    const reopenable = done || canReopen
    const SENT = ['About you', 'Identity', 'Property ownership', 'Background & source of funds', 'Banking & tax', 'Property documents', 'Declaration']
    return (
      <Shell wide>
        <section className="mx-auto grid max-w-6xl items-end gap-10 px-6 pt-10 md:grid-cols-2 md:gap-16 md:px-14 md:pt-14">
          <div className="flex flex-col gap-5">
            <h1 className="pub-serif pub-display pub-enter m-0">
              <span className="pub-drift-l block">Thank you,</span>
              <span className="pub-drift-r block italic">{thanksName || 'there'}</span>
            </h1>
            <p className="pub-serif pub-enter-2 m-0 text-[24px] leading-snug md:text-[30px]">
              {done
                ? 'Your information has been received. Our compliance team will review your submission and be in touch within 1–2 working days.'
                : 'We have received your information and our team will be in touch shortly. No further action is needed.'}
            </p>
          </div>
          <div className="pub-arch pub-arch-open mx-auto aspect-[3/4] w-full max-w-[300px] md:max-w-[420px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="pub-zoom" src="/illustrations/landlord-home.webp" alt="Illustration: a landlord at home with London through the window" style={{ objectPosition: '14% 50%' }} />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pt-16 md:px-14 md:pt-20">
          <div className="grid md:grid-cols-7">
            {SENT.map((label, i) => (
              <div key={label} className="pub-rise flex items-baseline gap-4 py-4 md:flex-col md:gap-1 md:pr-4" style={{ borderTop: i === 0 ? '1px solid #111' : '1px solid #D9D5CD' }}>
                <span className="pub-serif w-10 text-[24px] italic leading-none md:text-[30px]">{SECTION_ROMAN[i]}.</span>
                <span className="flex-1 text-[15px] font-medium">{label}</span>
                <span className="pub-eyebrow">{i === 6 ? 'Signed' : 'Received'}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto flex max-w-6xl flex-col gap-3 px-6 pb-16 pt-14 md:px-14">
          <p className="m-0 text-[15px]" style={{ color: '#4A4741' }}>Need to change something?</p>
          {reopenable ? (
            <>
              <button type="button" onClick={reopenForm} disabled={reopening} className="pub-btn-ghost self-start disabled:opacity-50">{reopening ? 'Reopening…' : 'Reopen my form'}</button>
              <p className="m-0 max-w-xl text-[13px] pub-muted">Everything you entered is kept. Make your change and send it again; we’ll see it as an update.</p>
              {reopenError && <p className="pub-error max-w-xl">{reopenError}</p>}
            </>
          ) : (
            <p className="m-0 max-w-xl text-[14px] pub-muted">We’ve already started checking your information, so email us with any changes and we’ll update it for you.</p>
          )}
          <p className="m-0 mt-4 text-[15px]">Questions? <a className="pub-link" href="mailto:harry@capitalrooms.co.uk">harry@capitalrooms.co.uk</a></p>
        </section>
      </Shell>
    )
  }

  const allSectionsSaved = REQUIRED_SECTIONS.every(k => saved.includes(k))
  const firstName = isJoint(form as never) && form.j_first_name
    ? `${form.first_name || landlordName} & ${form.j_first_name}`
    : form.first_name || landlordName || 'there'
  const sectionLabel = (k: SectionKey) => SECTIONS.find(x => x.key === k)?.label ?? k

  // ── Progress overview ──────────────────────────────────────────────────────
  if (!activeSection) {
    const required = SECTIONS.filter(s => !s.optional)
    const reqDone = required.filter(s => saved.includes(s.key)).length
    const progressText = saved.length === 0
      ? 'Please complete each section below to register as a Capital Rooms landlord. Everything you enter is saved automatically, so you can close this page and come back to the same link at any time to carry on.'
      : reqDone === required.length
        ? 'All required sections are complete. The property documents section is optional — add any you have, then submit when ready.'
        : `${reqDone} of ${required.length} required sections complete. Your progress is saved automatically — carry on where you left off.`
    const agreementName = agreementType === 'rent_collection' ? 'Rent Collection Agreement' : 'Management Agreement'
    const roman = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii']
    return (
      <Shell wide>
        {/* Greeting — design "C": both lines on the left */}
        <section className="mx-auto max-w-6xl px-6 pt-10 md:px-14 md:pt-14">
          <h1 className="pub-serif pub-display pub-enter m-0">
            <span className="pub-drift-l block">{saved.length > 0 ? 'Welcome back,' : 'Welcome,'}</span>
            <span className="pub-drift-r block italic">{properCase(firstName)}</span>
          </h1>
        </section>

        {/* Picture + agreement */}
        <section className="mx-auto grid max-w-6xl items-end gap-10 px-6 pt-10 md:grid-cols-2 md:gap-16 md:px-14 md:pt-16">
          <div className="pub-arch pub-arch-open mx-auto aspect-[3/4] w-full max-w-[300px] md:max-w-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="pub-zoom" src="/illustrations/landlord-home.webp" alt="Illustration: a landlord working at home with London through the window" style={{ objectPosition: '14% 50%' }} />
          </div>
          <div className="flex flex-col gap-5 pb-2">
            <p className="pub-eyebrow m-0">{agreementName}</p>
            <p className="pub-serif m-0 text-[26px] leading-snug md:text-[32px]">
              Your {agreementType === 'rent_collection' ? 'rent collection' : 'management'} agreement has been sent to you by email as a PDF. Please review it before completing the sections below.
            </p>
            <p className="m-0 text-[15px] leading-relaxed" style={{ color: '#4A4741' }}>
              If you did not receive it or need any changes made, reply to Harry’s email and he will come back to you straight away.
            </p>
            <p className="m-0 text-[15px] leading-relaxed" style={{ color: '#4A4741' }}>{progressText}</p>
          </div>
        </section>

        {/* The sections */}
        <section className="mx-auto max-w-6xl px-6 pt-16 md:px-14 md:pt-24">
          <p className="pub-eyebrow m-0 mb-3">{SECTIONS.length} sections · saves as you go</p>
          <div style={{ borderTop: '1px solid #111' }}>
            {SECTIONS.map((s, i) => {
              const isSaved = saved.includes(s.key)
              return (
                <button
                  key={s.key}
                  onClick={() => setActiveSection(s.key)}
                  className="pub-rise flex w-full items-center gap-4 bg-transparent py-5 text-left md:gap-6"
                  style={{ borderBottom: '1px solid #D9D5CD', color: '#111', minHeight: 64 }}
                >
                  <span className="pub-serif w-10 shrink-0 text-[26px] italic leading-none md:w-14 md:text-[32px]">{roman[i] ?? i + 1}.</span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-[17px] font-medium md:text-[19px]">{s.label}</span>
                    <span className="text-[13px]" style={{ color: '#6F6B64' }}>
                      {isSaved ? 'Complete — tap to review or edit' : s.optional ? 'Optional — add certificates, plans, bills and other documents' : 'Not yet completed — your progress saves automatically'}
                    </span>
                  </span>
                  <span className="pub-eyebrow shrink-0" style={{ color: isSaved ? '#111' : '#6F6B64' }}>{isSaved ? 'Done ✓' : s.optional ? 'Optional' : 'Start →'}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-16 pt-10 md:px-14">
          {saveMsg && (
            <p className="m-0 mb-6 text-[15px] font-medium" style={{ borderLeft: '2px solid #111', paddingLeft: 14 }}>{saveMsg}</p>
          )}

          {allSectionsSaved && (
            <div className="flex flex-col gap-5">
              <div style={{ borderLeft: '1px solid #111', paddingLeft: 16 }}>
                <p className="pub-serif m-0 text-[30px] leading-tight">All sections complete</p>
                <p className="m-0 mt-1 text-[15px]" style={{ color: '#4A4741' }}>Please review your information above then submit to send it to the Capital Rooms compliance team.</p>
              </div>
              {submitError && (
                <div className="text-[14px]" style={{ color: '#9B2C1F' }}>
                  <p className="m-0">{submitError}</p>
                  {submitMissing.map(m => (
                    <div key={m.section} className="mt-2">
                      <button onClick={() => setActiveSection(m.section)} className="font-semibold underline">{sectionLabel(m.section)}</button>
                      <ul className="mt-1 list-disc pl-5">{m.items.map(i => <li key={i}>{i}</li>)}</ul>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={handleSubmit} disabled={submitting} className="pub-btn self-start">
                {submitting ? 'Submitting…' : 'Submit my information'}
              </button>
            </div>
          )}
        </section>
      </Shell>
    )
  }

  // ── Section editor wrapper ─────────────────────────────────────────────────
  const currentDef = SECTIONS.find(s => s.key === activeSection)!

  // A plain helper, not a component: a component declared in here would be a new type on every
  // render, remounting the section (inputs lose focus, uploads reset).
  const sectionMissing = missingFor(activeSection, form as never)

  function renderShell(_canSave: boolean, children: React.ReactNode) {
    return (
      <Shell>
        <button onClick={leaveSection} className="pub-eyebrow mb-8 inline-flex min-h-[44px] items-center" style={{ color: '#111' }}>← All sections</button>
        <h1 className="pub-h2 pub-enter mb-6"><i>{SECTION_ROMAN[SECTIONS.findIndex(s => s.key === activeSection)] ?? ''}.</i>{currentDef.label}</h1>
        <p className="pub-intro mb-8">{introText[activeSection!]}</p>

        {children}

        {showMissing && sectionMissing.length > 0 && (
          <div className="pub-note mb-4" style={{ borderLeft: '2px solid #A86A12' }}>
            <p className="font-semibold mb-1">Still needed to complete this section:</p>
            <ul className="list-disc pl-5 space-y-0.5">{sectionMissing.map(i => <li key={i}>{i}</li>)}</ul>
            <p className="text-xs mt-2 text-amber-700">You can come back and finish this later using the same link — everything so far is saved.</p>
          </div>
        )}

        {saveMsg && (
          <p className={saveMsg.startsWith('Save failed') ? 'pub-error mb-4' : 'mb-4 text-[15px] font-medium'} style={saveMsg.startsWith('Save failed') ? undefined : { borderLeft: '2px solid #111', paddingLeft: 14 }}>{saveMsg}</p>
        )}

        <div className="flex flex-col-reverse sm:flex-row gap-3 justify-between mt-6">
          <button onClick={leaveSection} className="pub-btn-ghost">← All sections</button>
          <button onClick={() => saveSection(activeSection!)} disabled={saving} className="pub-btn">
            {saving ? 'Saving…' : 'Save & continue →'}
          </button>
        </div>
        <p className="text-xs text-right mt-3 h-4" style={{ color: '#6F6B64' }}>
          {autoStatus === 'saving' ? 'Saving…' : autoStatus === 'saved' ? '✓ All changes saved' : autoStatus === 'error' ? 'Not saved — check your connection' : ''}
        </p>
      </Shell>
    )
  }

  // ── SECTION: TYPE ──────────────────────────────────────────────────────────
  if (activeSection === 'type') {
    return (
      renderShell(!!(form.entity_type && form.property_count), <>
        <div className={card}>
          <h2 className="pub-h3 mb-5">Are you registering as an individual or a company?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {([['individual', '👤', 'Individual', 'Personal landlord — passport or driving licence required'], ['company', '🏢', 'Company', 'Ltd company, LLP, or partnership — company documents required']] as const).map(([val, , label, desc]) => (
              <button key={val} onClick={() => set('entity_type', val)}
                className="pub-choice" aria-pressed={form.entity_type === val}>
                <span className={`pub-dot ${form.entity_type === val ? 'on' : ''}`} />
                <span><span className="font-semibold">{label}</span><small>{desc}</small></span>
              </button>
            ))}
          </div>

          <h2 className="text-base font-bold text-neutral-900 mb-4">How many properties are you registering?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {([['single', '🏠', 'One property', 'Register a single property with Capital Rooms'], ['multiple', '🏘', 'Multiple properties', 'Register two or more properties at once']] as const).map(([val, , label, desc]) => (
              <button key={val} onClick={() => set('property_count', val)}
                className="pub-choice" aria-pressed={form.property_count === val}>
                <span className={`pub-dot ${form.property_count === val ? 'on' : ''}`} />
                <span><span className="font-semibold">{label}</span><small>{desc}</small></span>
              </button>
            ))}
          </div>

          {form.entity_type === 'individual' && (
            <div className="mt-8">
              <h2 className="pub-h3 mb-1">Is there a second landlord?</h2>
              <p className="text-sm text-neutral-500 mb-4">For example a spouse, partner or relative who jointly owns the property and is named on the management agreement. We need identity documents for both of you.</p>
              <YesNoButtons value={form.joint} onChange={v => set('joint', v)} />
            </div>
          )}
        </div>
      </>)
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
      renderShell(canSave, <>
        {isIndividual ? (
          <>
            <div className={card}>
              <h2 className="pub-h3 mb-5">Personal Details</h2>
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

              <div className="mt-6 pt-6" style={{ borderTop: '1px solid #E4E0D8' }}>
                <AddressInput
                  label="Residential Address"
                  required
                  value={{ line1: form.addr_line1, line2: form.addr_line2, town: form.addr_town, county: form.addr_county, postcode: form.addr_postcode }}
                  onChange={a => setForm(f => ({ ...f, addr_line1: a.line1, addr_line2: a.line2, addr_town: a.town, addr_county: a.county, addr_postcode: a.postcode }))}
                  inputClass={inp}
                  labelClass={lbl}
                />
              </div>

              <div className="mt-6 pt-6" style={{ borderTop: '1px solid #E4E0D8' }}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div><label className={lbl}>Employer / occupation</label><input value={form.employer} onChange={e => set('employer', e.target.value)} className={inp} placeholder="e.g. Self-employed landlord" /></div>
                  <div><label className={lbl}>Contact phone *</label><input type="tel" value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} className={inp} placeholder="07700 900000" /></div>
                  <div className="sm:col-span-2"><label className={lbl}>Contact email *</label><input type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} className={inp} placeholder="james@example.com" /></div>
                </div>
              </div>
            </div>

            <div className={card}>
              <h2 className="pub-h3 mb-2">Identity Documents</h2>
              <p className="text-[15px] leading-relaxed mb-6" style={{ color: '#4A4741' }}>
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
                    ...(fields.first_name && !f.first_name ? { first_name: properCase(fields.first_name)! } : {}),
                    ...(fields.last_name && !f.last_name ? { last_name: properCase(fields.last_name)! } : {}),
                    ...(toIsoDate(fields.date_of_birth) && !f.dob ? { dob: toIsoDate(fields.date_of_birth)! } : {}),
                    ...(fields.nationality && !f.nationality ? { nationality: properCase(fields.nationality)! } : {}),
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

            {isJoint(form as never) && (
              <div className={card}>
                <h2 className="pub-h3 mb-1">Second landlord</h2>
                <p className="text-[15px] mb-6" style={{ color: '#4A4741' }}>The same checks apply to each landlord named on the agreement.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className={lbl}>Title</label>
                    <select value={form.j_salutation} onChange={e => set('j_salutation', e.target.value)} className={inp}>
                      <option value="">Select…</option>
                      {['Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Prof'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="hidden sm:block" />
                  <div><label className={lbl}>First name *</label><input value={form.j_first_name} onChange={e => set('j_first_name', e.target.value)} className={inp} /></div>
                  <div><label className={lbl}>Last name *</label><input value={form.j_last_name} onChange={e => set('j_last_name', e.target.value)} className={inp} /></div>
                  <div><label className={lbl}>Date of birth *</label><input type="date" value={form.j_dob} onChange={e => set('j_dob', e.target.value)} className={inp} /></div>
                  <div><label className={lbl}>Nationality *</label><input value={form.j_nationality} onChange={e => set('j_nationality', e.target.value)} className={inp} placeholder="e.g. British" /></div>
                  <div><label className={lbl}>Contact phone</label><input type="tel" value={form.j_contact_phone} onChange={e => set('j_contact_phone', e.target.value)} className={inp} /></div>
                  <div><label className={lbl}>Contact email</label><input type="email" value={form.j_contact_email} onChange={e => set('j_contact_email', e.target.value)} className={inp} /></div>
                </div>

                <div className="mt-6 pt-6" style={{ borderTop: '1px solid #E4E0D8' }}>
                  <label className="flex items-center gap-3 cursor-pointer mb-4">
                    <input type="checkbox" checked={form.j_same_address} onChange={e => set('j_same_address', e.target.checked)} className="w-4 h-4 rounded border-neutral-300" />
                    <span className="text-sm text-neutral-700">Lives at the same address as the first landlord</span>
                  </label>
                  {!form.j_same_address && (
                    <AddressInput
                      label="Second landlord's residential address"
                      required
                      value={{ line1: form.j_addr_line1, line2: form.j_addr_line2, town: form.j_addr_town, county: form.j_addr_county, postcode: form.j_addr_postcode }}
                      onChange={a => setForm(f => ({ ...f, j_addr_line1: a.line1, j_addr_line2: a.line2, j_addr_town: a.town, j_addr_county: a.county, j_addr_postcode: a.postcode }))}
                      inputClass={inp}
                      labelClass={lbl}
                    />
                  )}
                </div>

                <div className="mt-5 pt-5 border-t border-neutral-100 space-y-4">
                  <div>
                    <label className={lbl}>Document type *</label>
                    <select value={form.j_id_type} onChange={e => set('j_id_type', e.target.value)} className={inp}>
                      <option value="passport">Passport</option>
                      <option value="driving_licence">UK Driving Licence</option>
                      <option value="national_id">National Identity Card</option>
                    </select>
                  </div>
                  <FileUpload
                    token={token}
                    docType="joint_id_document"
                    label={form.j_id_type === 'passport' ? 'Second landlord — passport (photo page)' : form.j_id_type === 'driving_licence' ? 'Second landlord — driving licence (both sides)' : 'Second landlord — national identity card (both sides)'}
                    hint="A clear colour copy of the second landlord's identity document."
                    slot={getSlot('joint_id_document')}
                    onUploaded={path => onUploaded('joint_id_document', path)}
                  />
                  <FileUpload
                    token={token}
                    docType="joint_proof_of_address"
                    label="Second landlord — proof of address"
                    hint="A utility bill, bank statement or council tax letter dated within the last 3 months, in the second landlord's name. If you share an address, a bill in joint names is fine for both of you."
                    slot={getSlot('joint_proof_of_address')}
                    onUploaded={path => onUploaded('joint_proof_of_address', path)}
                  />
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className={card}>
              <h2 className="pub-h3 mb-5">Company Details</h2>
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
              <h2 className="pub-h3 mb-2">Company Documents</h2>
              <p className="text-[15px] leading-relaxed mb-6" style={{ color: '#4A4741' }}>
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
      </>)
    )
  }

  // ── SECTION: OWNERSHIP ─────────────────────────────────────────────────────
  if (activeSection === 'ownership') {
    const single  = form.property_count !== 'multiple'
    const canSave = single
      ? !!(form.prop_line1 && form.prop_town && form.prop_postcode)
      : !!(form.properties[0]?.line1 && form.properties[0]?.town)
    return (
      renderShell(canSave, <>
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
              <h2 className="pub-h3 mb-2">Proof of Ownership</h2>
              <p className="text-[15px] leading-relaxed mb-6" style={{ color: '#4A4741' }}>
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
              <h2 className="pub-h3 mb-2">Property Portfolio</h2>
              <p className="text-[15px] mb-6" style={{ color: '#4A4741' }}>Enter each property you wish to register.</p>
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
              <button onClick={() => setForm(f => ({ ...f, properties: [...f.properties, { line1: '', line2: '', town: '', postcode: '', address: '', mortgage_provider: '', mortgage_account: '' }] }))}
                className="text-sm font-semibold text-neutral-700 border border-dashed border-neutral-300 rounded-xl w-full py-3 hover:border-neutral-500 transition mb-2">
                + Add another property
              </button>
            </div>

            <div className={card}>
              <h2 className="pub-h3 mb-2">Proof of Ownership</h2>
              <p className="text-[15px] leading-relaxed mb-6" style={{ color: '#4A4741' }}>
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
      </>)
    )
  }

  // ── SECTION: BACKGROUND & SOURCE OF FUNDS ─────────────────────────────────
  if (activeSection === 'aml') {
    const joint = isJoint(form as never)
    const firstLabel = joint ? `${form.first_name || 'First landlord'}` : 'You'
    return (
      renderShell(true, <>
        <div className={card}>
          <h2 className="pub-h3 mb-1">Politically exposed persons</h2>
          <p className="text-[15px] leading-relaxed mb-5" style={{ color: '#4A4741' }}>
            A politically exposed person (PEP) holds, or has held in the last 12 months, a prominent public role — for example a
            member of parliament, senior judge, ambassador, senior military officer, or board member of a state-owned business —
            in the UK or abroad. This also covers their close family and known close associates. Answering yes does not stop us
            working with you; it simply means we carry out some additional checks.
          </p>
          <p className="text-[16px] font-semibold mb-3">{joint ? `Is ${firstLabel} a politically exposed person, or a family member or close associate of one?` : 'Are you a politically exposed person, or a family member or close associate of one?'} *</p>
          <YesNoButtons value={form.pep} onChange={v => set('pep', v)} />
          {form.pep === 'yes' && (
            <div className="mt-4"><label className={lbl}>Position held and country *</label><textarea rows={2} value={form.pep_details} onChange={e => set('pep_details', e.target.value)} className={inp} placeholder="e.g. Local councillor, Southwark, until 2024" /></div>
          )}
          {joint && (
            <div className="mt-6 pt-6 border-t border-neutral-100">
              <p className="text-[16px] font-semibold mb-3">Is {form.j_first_name || 'the second landlord'} a politically exposed person, or a family member or close associate of one? *</p>
              <YesNoButtons value={form.j_pep} onChange={v => set('j_pep', v)} />
              {form.j_pep === 'yes' && (
                <div className="mt-4"><label className={lbl}>Position held and country *</label><textarea rows={2} value={form.j_pep_details} onChange={e => set('j_pep_details', e.target.value)} className={inp} /></div>
              )}
            </div>
          )}
        </div>

        <div className={card}>
          <h2 className="pub-h3 mb-1">Acting on behalf of someone else</h2>
          <p className="text-[15px] leading-relaxed mb-5" style={{ color: '#4A4741' }}>We need to know who ultimately owns or benefits from the property.</p>
          <p className="text-[16px] font-semibold mb-3">Is anyone other than {joint ? 'the two of you' : 'yourself'} the owner of, or entitled to the rent from, the property — for example through a trust, nominee or on someone else's behalf? *</p>
          <YesNoButtons value={form.acting_for_other} onChange={v => set('acting_for_other', v)} />
          {form.acting_for_other === 'yes' && (
            <div className="mt-4"><label className={lbl}>Who, and how they are connected *</label><textarea rows={3} value={form.acting_for_details} onChange={e => set('acting_for_details', e.target.value)} className={inp} placeholder="Full name(s), relationship, and any trust or company name" /></div>
          )}
        </div>

        <div className={card}>
          <h2 className="pub-h3 mb-1">How the property was funded</h2>
          <p className="text-[15px] leading-relaxed mb-5" style={{ color: '#4A4741' }}>A short answer is fine. If the property was bought with a mortgage, just say so.</p>
          <label className={lbl}>Main source of funds for buying the property *</label>
          <select value={form.source_of_funds} onChange={e => set('source_of_funds', e.target.value)} className={inp + ' mb-4'}>
            <option value="">Select…</option>
            {SOURCE_OF_FUNDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label className={lbl}>Brief explanation *</label>
          <textarea rows={3} value={form.source_of_funds_details} onChange={e => set('source_of_funds_details', e.target.value)} className={inp}
            placeholder="e.g. Bought in 2015 with a Nationwide mortgage and savings from my salary as a teacher" />
        </div>

        <div className={card}>
          <h2 className="pub-h3 mb-1">Where you live</h2>
          <label className={lbl}>Country of residence *</label>
          <input value={form.country_of_residence} onChange={e => set('country_of_residence', e.target.value)} className={inp} placeholder="e.g. United Kingdom" />
        </div>
      </>)
    )
  }

  // ── SECTION: BANK ──────────────────────────────────────────────────────────
  if (activeSection === 'bank') {
    return (
      renderShell(!!(form.bank_name && form.account_number && form.sort_code), <>
        <div className={card}>
          <h2 className="pub-h3 mb-2">Bank & Tax Details</h2>
          <p className="text-[15px] mb-6" style={{ color: '#4A4741' }}>Used to remit rental income and comply with HMRC reporting requirements. Accessible to Capital Rooms management only.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
            <div><label className={lbl}>Bank name *</label><input value={form.bank_name} onChange={e => set('bank_name', e.target.value)} className={inp} placeholder="e.g. Barclays" /></div>
            <div><label className={lbl}>Account holder name *</label><input value={form.account_holder} onChange={e => set('account_holder', e.target.value)} className={inp} placeholder="As it appears on the account" /></div>
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
      </>)
    )
  }

  // ── SECTION: PROPERTY DOCUMENTS (key 'compliance' kept so earlier progress still counts) ──────────
  if (activeSection === 'compliance') {
    const propertyNames = form.property_count === 'multiple'
      ? form.properties.map((p, i) => p.line1?.trim() || `Property ${i + 1}`)
      : [form.prop_line1?.trim() || 'Your property']
    // Uploads made with the earlier one-box-per-certificate version of this step.
    const otherNames = ((form as any).other_doc_names ?? []) as string[]
    const earlier = [
      ...COMPLIANCE_DOCS.map(d => ({ label: d.label, count: getSlot(d.docType).files.length })),
      ...(otherNames.length ? otherNames.map(n => ({ label: n, count: 1 })) : [{ label: 'Other document', count: getSlot('other_document').files.length }]),
    ].filter(e => e.count > 0)

    return (
      renderShell(true /* always saveable — optional section */, <>
        <PropertyDocs
          token={token}
          properties={propertyNames}
          docs={form.property_docs ?? []}
          onChange={update => setForm(f => ({ ...f, property_docs: update(f.property_docs ?? []) }))}
          upload={file => uploadDocument(token, 'property_document', file)}
          earlier={earlier}
        />
      </>)
    )
  }

  // ── SECTION: DECLARATION ───────────────────────────────────────────────────
  if (activeSection === 'declaration') {
    return (
      renderShell(form.declaration, <>
        <div className={card}>
          <h2 className="pub-h3 mb-5">Declaration</h2>
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
      </>)
    )
  }

  return null
}
