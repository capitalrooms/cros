'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export interface AIResult {
  doc_type: string
  confidence: number
  summary: string
  issue_date: string
  expiry_date?: string // optional for docs without expiry
  provider: string
  policy_number: string
  property_address: string
  person_name: string
  person_phone: string
  person_email: string
  occupation: string
  annual_income: string
  previous_address: string
  tenancy_start: string
  tenancy_end: string
  monthly_rent: string
  // Fire risk assessment (no expiry, but document when last done + when next due if mentioned)
  fire_risk_assessment_date?: string
  fire_risk_assessment_next_due?: string
  // For unmatched "Other" documents, admin can give a custom name
  other_document_type?: string
  // Admin override for filing destination when type doesn't have a natural home
  filing_category?: 'compliance' | 'property_info' | 'tenancy' | 'person' | 'other'
}

export const TYPE_LABELS: Record<string, string> = {
  // Compliance certificates
  gas_safety_certificate:           'Gas safety certificate',
  electrical_eicr:                  'Electrical certificate (EICR)',
  emergency_lighting_certificate:   'Emergency lighting certificate',
  fire_alarm_certificate:           'Fire alarm / detection certificate',
  fire_risk_assessment:             'Fire risk assessment',
  pat_test:                         'PAT test certificate',
  hmo_licence:                      'HMO licence',
  epc:                              'Energy certificate (EPC)',
  insurance:                        'Landlord insurance',
  // Tenancy documents
  tenancy_agreement:                'Tenancy agreement (APT)',
  deposit_certificate:              'Deposit protection certificate',
  // Tenant / applicant documents
  tenant_reference:                 'Tenant reference',
  right_to_rent:                    'Right to rent check',
  // Property information (tenant-facing)
  evacuation_plan:                  'Emergency Fire Plan',
  emergency_contacts:               'Important Contact Info',
  house_rules:                      'House Rules',
  policy_document:                  'Policy Document',
  council_correspondence:           'Council Correspondence',
  utility_bill:                     'Utility Bill',
  landlord_statement_tenant:        'Landlord Statement',
  safety_info:                      'Safety Information',
  inventory:                        'Property Inventory',
  wifi_details:                     'Wi-Fi / Internet Details',
  waste_schedule:                   'Waste & Recycling Guide',
  // Expense / purchasing documents
  supplier_invoice:                 'Supplier / Contractor Invoice',
  purchase_receipt:                 'Purchase Receipt',
  other:                            'Other Document',
}

// Map AI doc_type → property_documents.document_type stored in DB
const PROP_DOC_DB_TYPE: Record<string, string> = {
  // Tenant-facing property info (visible_to_tenants = true by default)
  evacuation_plan:            'evacuation_plan',
  emergency_contacts:         'emergency_contacts',
  house_rules:                'house_rules',
  policy_document:            'policies',
  council_correspondence:     'council_correspondence',
  utility_bill:               'utility_info',
  landlord_statement_tenant:  'landlord_statement',
  safety_info:                'safety_info',
  inventory:                  'inventory',
  wifi_details:               'wifi_details',
  waste_schedule:             'waste_schedule',
  // Admin-only property docs (visible_to_tenants = false by default)
  supplier_invoice:           'supplier_invoice',
  purchase_receipt:           'purchase_receipt',
  other:                      'other',
}

// Types that are inherently tenant-facing — default visible_to_tenants = true
const TENANT_FACING_PROP_TYPES = new Set([
  'evacuation_plan', 'emergency_contacts', 'house_rules', 'policy_document',
  'council_correspondence', 'utility_bill', 'landlord_statement_tenant',
  'safety_info', 'inventory', 'wifi_details', 'waste_schedule',
])

// Compliance types → write to properties table + also archive the file
const COMPLIANCE_TYPES = [
  'gas_safety_certificate', 'electrical_eicr', 'emergency_lighting_certificate',
  'fire_alarm_certificate', 'fire_risk_assessment', 'pat_test', 'hmo_licence', 'epc', 'insurance',
]

// Property info types → upload file + write to property_documents table
const PROP_INFO_TYPES = Object.keys(PROP_DOC_DB_TYPE)

// Tenancy types → write to tenancies table + also archive the file
const TENANCY_TYPES = ['tenancy_agreement', 'deposit_certificate']

// Person types → write to people table
const PERSON_TYPES = ['tenant_reference', 'right_to_rent']

/** Upload a file to property_documents via the server-side API. Never throws — logs silently. */
async function archiveFile(
  file: File,
  propertyId: string,
  documentType: string,
  description: string,
  visibleToTenants: boolean,
) {
  try {
    const body = new FormData()
    body.append('file', file)
    body.append('property_id', propertyId)
    body.append('document_type', documentType)
    body.append('description', description)
    body.append('file_name', file.name)
    body.append('visible_to_tenants', String(visibleToTenants))
    await fetch('/api/admin/upload-property-document', { method: 'POST', body })
  } catch {
    // Non-fatal — primary save already succeeded
  }
}

// ── Small UI helpers ─────────────────────────────────────────────────────────

function DataRow({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-md border-b border-neutral-100 py-sm last:border-0">
      <span className="w-40 shrink-0 text-xs font-semibold uppercase tracking-wide text-neutral-400">{label}</span>
      <span className="flex-1 text-sm text-neutral-900">{value}</span>
    </div>
  )
}

function DateRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-md border-b border-neutral-100 py-sm last:border-0">
      <span className="w-40 shrink-0 text-xs font-semibold uppercase tracking-wide text-neutral-400">{label}</span>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)}
        className="flex-1 rounded-lg border border-neutral-200 px-sm py-xs text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none" />
    </div>
  )
}

function EditRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-md border-b border-neutral-100 py-sm last:border-0">
      <span className="w-40 shrink-0 text-xs font-semibold uppercase tracking-wide text-neutral-400">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)}
        className="flex-1 rounded-lg border border-neutral-200 px-sm py-xs text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none" />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * Review card shown after AI classifies a document. Displays extracted fields
 * in an editable grid. On confirm, files the document to the right place.
 *
 * Pass `file` (the original File object) so that property-info documents can be
 * uploaded to Supabase Storage and linked from the tenant dashboard.
 */
export default function DocReview({
  initial,
  file,
  properties,
  people,
  tenancies,
  defaultPropertyId,
  onApplied,
  onCancel,
}: {
  initial: AIResult
  file?: File
  properties: any[]
  people: any[]
  tenancies: any[]
  /** Pre-select this property (e.g. when scanning from within a property card). */
  defaultPropertyId?: string
  onApplied: (msg: string) => void
  onCancel: () => void
}) {
  const [fields, setFields] = useState<AIResult>(initial)
  const [targetProperty, setTargetProperty] = useState(defaultPropertyId || '')
  const [targetPerson, setTargetPerson] = useState('')
  const [targetTenancy, setTargetTenancy] = useState('')
  const [notifyTenants, setNotifyTenants] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')
  // Explicit visibility control - default to admin-only (false) for safety
  const [visibleToTenants, setVisibleToTenants] = useState(false)

  useEffect(() => {
    setFields(initial)
    // If a property was pre-selected (e.g. scan from property card), keep it;
    // otherwise try to auto-match from the AI-extracted address.
    if (defaultPropertyId) {
      setTargetProperty(defaultPropertyId)
    } else if (initial.property_address) {
      const hit = (properties || []).find((p) =>
        initial.property_address.toLowerCase().includes(String(p.name).toLowerCase()) ||
        (p.address && initial.property_address.toLowerCase().includes(String(p.address).toLowerCase())) ||
        String(p.address || '').toLowerCase().includes(initial.property_address.toLowerCase())
      )
      setTargetProperty(hit?.id || '')
    } else {
      setTargetProperty('')
    }
    if (initial.person_name) {
      const hit = (people || []).find((p) =>
        String(p.full_name || '').toLowerCase().includes(initial.person_name.toLowerCase())
      )
      setTargetPerson(hit?.id || '')
    } else setTargetPerson('')
    setTargetTenancy('')
  }, [initial, properties, people, defaultPropertyId])

  const set = (k: keyof AIResult, v: string) => setFields((f) => ({ ...f, [k]: v }))
  const type = fields.doc_type
  const isCompliance = COMPLIANCE_TYPES.includes(type)
  const isPropInfo = PROP_INFO_TYPES.includes(type)
  const isTenancy = TENANCY_TYPES.includes(type)
  const isPerson = PERSON_TYPES.includes(type)
  const needsProperty = isCompliance || isPropInfo

  // Label for "Issued" field changes for test-date certificates
  const issuedLabel = ['pat_test', 'emergency_lighting_certificate', 'fire_alarm_certificate'].includes(type)
    ? 'Test date' : 'Issued'

  async function apply() {
    setApplying(true)
    setError('')
    try {
      const supabase = createClient()

      // ── 1. Compliance certs → properties table ──────────────────────────
      if (isCompliance) {
        if (!targetProperty) throw new Error('Choose which property this belongs to')
        const update: Record<string, string | null> = {}
        if (type === 'gas_safety_certificate') {
          update.gas_safe_cert_date   = fields.issue_date  || null
          update.gas_safe_cert_expiry = fields.expiry_date || null
        } else if (type === 'electrical_eicr') {
          update.electrical_cert_date   = fields.issue_date  || null
          update.electrical_cert_expiry = fields.expiry_date || null
        } else if (type === 'emergency_lighting_certificate') {
          update.emergency_lighting_test_date = fields.issue_date  || null
          update.emergency_lighting_expiry     = fields.expiry_date || null
        } else if (type === 'fire_alarm_certificate') {
          update.fire_detection_test_date = fields.issue_date  || null
          update.fire_detection_expiry    = fields.expiry_date || null
        } else if (type === 'fire_risk_assessment') {
          // Fire risk assessment: just record when last done, optional next-due date
          update.fire_risk_assessment_date = fields.fire_risk_assessment_date || null
          update.fire_risk_assessment_expiry = fields.fire_risk_assessment_next_due || null
        } else if (type === 'pat_test') {
          update.pat_test_date   = fields.issue_date  || null
          update.pat_test_expiry = fields.expiry_date || null
        } else if (type === 'hmo_licence') {
          update.license_expiry = fields.expiry_date || null
        } else if (type === 'insurance') {
          update.insurance_provider      = fields.provider      || null
          update.insurance_policy_number = fields.policy_number || null
          update.insurance_expiry        = fields.expiry_date   || null
        }
        if (Object.keys(update).length) {
          const { error: e } = await supabase.from('properties').update(update).eq('id', targetProperty)
          if (e) throw e
        }
        // Also archive the original cert file so admin can retrieve/share it later.
        // Stored admin-only by default; admin can toggle it visible to tenants in the property view.
        if (file) {
          await archiveFile(file, targetProperty, type, fields.summary || '', false)
        }
        if (notifyTenants) {
          fetch('/api/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              propertyId: targetProperty,
              title: 'Property safety updated',
              body: `Your ${TYPE_LABELS[type]?.toLowerCase() || 'certificate'} is now on file and up to date.`,
              url: '/tenant',
            }),
          }).catch(() => {})
        }
        const propName = properties.find((p) => p.id === targetProperty)?.name || 'the property'
        onApplied(`Filed to ${propName}. Certificate saved — open the property to share it with tenants if needed.`)
        return
      }

      // ── 2. Property info docs → server-side upload + property_documents table ──
      if (isPropInfo) {
        if (!targetProperty) throw new Error('Choose which property this belongs to')

        const dbType = PROP_DOC_DB_TYPE[type] || 'other'
        const propName = properties.find((p) => p.id === targetProperty)?.name || 'the property'
        // Use explicit admin choice (visibleToTenants state) rather than auto-defaults
        // This ensures admin is always asked before sharing with tenants

        if (file) {
          const body = new FormData()
          body.append('file', file)
          body.append('property_id', targetProperty)
          body.append('document_type', dbType)
          body.append('description', fields.summary || '')
          body.append('file_name', file.name)
          body.append('visible_to_tenants', String(visibleToTenants))

          const res = await fetch('/api/admin/upload-property-document', { method: 'POST', body })
          const json = await res.json()
          if (!res.ok) throw new Error(json.error || 'Upload failed')
        } else {
          // No file (e.g. from inbox with text-only extraction) — just record metadata
          const { error: e } = await supabase.from('property_documents').insert({
            property_id:        targetProperty,
            document_type:      dbType,
            file_name:          fields.summary?.substring(0, 100) || 'Document',
            storage_url:        '',
            description:        fields.summary || null,
            visible_to_tenants: visibleToTenants,
          })
          if (e) throw e
        }

        const tenantMsg = visibleToTenants
          ? 'Tenants can view it in their Property Information tab.'
          : 'Saved as admin-only — toggle visibility in the property view to share with tenants.'
        onApplied(`"${TYPE_LABELS[type]}" saved to ${propName}. ${tenantMsg}`)
        return
      }

      // ── 3. Tenancy docs → tenancies table + archive file ────────────────
      if (isTenancy) {
        if (!targetTenancy) throw new Error('Choose which tenancy this document is for')
        const update: Record<string, string | number | null> = {}
        if (fields.tenancy_start) update.start_date = fields.tenancy_start
        if (fields.tenancy_end)   update.end_date   = fields.tenancy_end
        if (fields.monthly_rent) {
          const n = Number(String(fields.monthly_rent).replace(/[^0-9.]/g, ''))
          if (!Number.isNaN(n) && n > 0) update.rent_amount = n
        }
        if (type === 'deposit_certificate' && fields.policy_number) {
          update.deposit_certificate_number = fields.policy_number
        }
        const { error: e } = await supabase.from('tenancies').update(update).eq('id', targetTenancy)
        if (e) throw e

        // Also archive the original signed document against the property (admin-only).
        // Resolve property_id via the tenancy's room relationship.
        if (file) {
          const ten = (tenancies || []).find((t: any) => t.id === targetTenancy)
          const propId = ten?.rooms?.property_id || ten?.rooms?.properties?.id || targetProperty
          if (propId) {
            await archiveFile(
              file, propId,
              type === 'tenancy_agreement' ? 'tenancy_agreement' : 'deposit_certificate',
              fields.summary || '', false,
            )
          }
        }

        onApplied('Tenancy dates updated. Original document saved to the property (admin-only).')
        return
      }

      // ── 4. Person docs → people table ─────────────────────────────────────
      if (isPerson) {
        if (!targetPerson) throw new Error('Choose which tenant this document is for')
        const update: Record<string, string> = {}
        if (fields.person_phone)     update.phone             = fields.person_phone
        if (fields.person_email)     update.email             = fields.person_email
        if (fields.occupation)       update.occupation        = fields.occupation
        if (fields.annual_income)    update.annual_income     = fields.annual_income
        if (fields.previous_address) update.previous_address  = fields.previous_address
        const { error: e } = await supabase.from('people').update(update).eq('id', targetPerson)
        if (e) throw e
        onApplied(`Saved to ${people.find((p) => p.id === targetPerson)?.full_name || 'the tenant'}.`)
        return
      }

      throw new Error('Unknown document type — choose a type from the dropdown.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="rounded-2xl border-2 border-neutral-900 bg-white overflow-hidden">

      {/* Header — confidence + type selector */}
      <div className="border-b border-neutral-100 bg-neutral-50 px-lg py-md">
        <p className="mb-xs text-xs font-bold uppercase tracking-widest text-neutral-400">
          AI identified · {Math.round((fields.confidence || 0) * 100)}% confident
        </p>
        <select
          value={fields.doc_type}
          onChange={(e) => set('doc_type', e.target.value)}
          className="w-full rounded-xl border border-neutral-300 bg-white px-md py-sm text-base font-bold text-neutral-900 focus:border-neutral-900 focus:outline-none"
        >
          <optgroup label="Compliance certificates">
            {['gas_safety_certificate','electrical_eicr','emergency_lighting_certificate','fire_alarm_certificate','fire_risk_assessment','pat_test','hmo_licence','epc','insurance'].map(k => (
              <option key={k} value={k}>{TYPE_LABELS[k]}</option>
            ))}
          </optgroup>
          <optgroup label="Tenancy documents">
            {['tenancy_agreement','deposit_certificate'].map(k => (
              <option key={k} value={k}>{TYPE_LABELS[k]}</option>
            ))}
          </optgroup>
          <optgroup label="Tenant documents">
            {['tenant_reference','right_to_rent'].map(k => (
              <option key={k} value={k}>{TYPE_LABELS[k]}</option>
            ))}
          </optgroup>
          <optgroup label="Property information (shown to tenants)">
            {['evacuation_plan','emergency_contacts','house_rules','policy_document','council_correspondence','utility_bill','landlord_statement_tenant','safety_info','inventory','wifi_details','waste_schedule','other'].map(k => (
              <option key={k} value={k}>{TYPE_LABELS[k]}</option>
            ))}
          </optgroup>
        </select>
        {isPropInfo && (
          <p className="mt-xs text-xs text-neutral-500">
            📌 This type is saved to <strong>Property Information</strong> — tenants can read it on their dashboard.
          </p>
        )}
      </div>

      {/* Extracted data grid */}
      <div className="px-lg py-md">
        <p className="mb-sm text-xs font-semibold uppercase tracking-wide text-neutral-400">Extracted fields</p>
        <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-neutral-50 px-md">
          {fields.property_address && <DataRow label="Address" value={fields.property_address} />}
          {fields.provider && <DataRow label="Provider / issuer" value={fields.provider} />}
          {fields.policy_number && <DataRow label="Reference / cert no." value={fields.policy_number} />}
          {(fields.issue_date || isCompliance) && (
            <DateRow label={issuedLabel} value={fields.issue_date} onChange={(v) => set('issue_date', v)} />
          )}
          {/* Conditional expiry: only for types that have expiry */}
          {(fields.expiry_date || ['hmo_licence','insurance','gas_safety_certificate','electrical_eicr','pat_test'].includes(type)) && (
            <DateRow label="Expires" value={fields.expiry_date || ''} onChange={(v) => set('expiry_date', v)} />
          )}
          {/* Fire Risk Assessment: date last done + optional next due */}
          {(type === 'fire_risk_assessment' || fields.fire_risk_assessment_date) && (
            <>
              <DateRow label="Last assessment" value={fields.fire_risk_assessment_date || ''} onChange={(v) => set('fire_risk_assessment_date', v)} />
              <DateRow label="Next due (if mentioned)" value={fields.fire_risk_assessment_next_due || ''} onChange={(v) => set('fire_risk_assessment_next_due', v)} />
            </>
          )}
          {fields.person_name && <DataRow label="Person" value={fields.person_name} />}
          {fields.person_email && <DataRow label="Email" value={fields.person_email} />}
          {fields.person_phone && <DataRow label="Phone" value={fields.person_phone} />}
          {fields.tenancy_start && <DateRow label="Tenancy start" value={fields.tenancy_start} onChange={(v) => set('tenancy_start', v)} />}
          {fields.tenancy_end && <DateRow label="Tenancy end" value={fields.tenancy_end} onChange={(v) => set('tenancy_end', v)} />}
          {fields.monthly_rent && <EditRow label="Rent (£/month)" value={fields.monthly_rent} onChange={(v) => set('monthly_rent', v)} />}
          {fields.occupation && <DataRow label="Occupation" value={fields.occupation} />}
          {fields.annual_income && <DataRow label="Annual income" value={fields.annual_income} />}
          {fields.previous_address && <DataRow label="Previous address" value={fields.previous_address} />}
          {/* For "Other" type, let admin name it */}
          {type === 'other' && (
            <EditRow label="Document name" value={fields.other_document_type || ''} onChange={(v) => set('other_document_type', v)} />
          )}
          {fields.summary && <DataRow label="Summary" value={fields.summary} />}
          {file && <DataRow label="File" value={file.name} />}
        </div>
      </div>

      {/* Target selector */}
      <div className="border-t border-neutral-100 px-lg pb-md">
        {needsProperty && (
          <div className="mt-md space-y-sm">
            <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Property to file under
            </label>
            <select value={targetProperty} onChange={(e) => setTargetProperty(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm focus:border-neutral-900 focus:outline-none">
              <option value="">Choose a property…</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {p.address}</option>
              ))}
            </select>
            {isCompliance && (
              <label className="flex items-center gap-sm text-sm text-neutral-700">
                <input type="checkbox" checked={notifyTenants} onChange={(e) => setNotifyTenants(e.target.checked)} />
                Notify tenants this certificate is on file
              </label>
            )}
          </div>
        )}

        {isTenancy && (
          <div className="mt-md">
            <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-sm">
              Tenancy this document is for
            </label>
            <select value={targetTenancy} onChange={(e) => setTargetTenancy(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm focus:border-neutral-900 focus:outline-none">
              <option value="">Choose a tenancy…</option>
              {tenancies.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.people?.full_name || 'Tenant'} · {t.rooms?.name || ''} · {t.properties?.name || ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {isPerson && (
          <div className="mt-md">
            <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-sm">
              Tenant this document is for
            </label>
            <select value={targetPerson} onChange={(e) => setTargetPerson(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm focus:border-neutral-900 focus:outline-none">
              <option value="">Choose a tenant…</option>
              {people.map((p) => (<option key={p.id} value={p.id}>{p.full_name || p.email}</option>))}
            </select>
          </div>
        )}

        {isPropInfo && (
          <div className="mt-md border-l-4 border-amber-400 bg-amber-50 p-md rounded-lg">
            <label className="flex items-start gap-md text-sm text-neutral-800">
              <input
                type="checkbox"
                checked={visibleToTenants}
                onChange={(e) => setVisibleToTenants(e.target.checked)}
                className="mt-sm flex-shrink-0 w-md h-md accent-amber-600 cursor-pointer"
              />
              <span className="flex-1">
                <strong>Share with tenants?</strong>
                <p className="text-xs text-neutral-600 mt-xs">
                  {TENANT_FACING_PROP_TYPES.has(type)
                    ? 'This document is typically tenant-facing (house rules, safety info, etc.), but you can keep it admin-only.'
                    : 'This document is admin-only by default. Check only if tenants should see it.'}
                </p>
              </span>
            </label>
          </div>
        )}
      </div>

      {/* Error + actions */}
      {error && (
        <div className="mx-lg mb-md rounded-xl border border-red-200 bg-red-50 p-md text-sm text-red-800">{error}</div>
      )}
      <div className="border-t border-neutral-100 px-lg py-md flex gap-sm">
        <button onClick={apply} disabled={applying}
          className="flex-1 rounded-xl bg-neutral-900 py-md text-sm font-bold text-white hover:bg-neutral-800 disabled:opacity-40">
          {applying ? 'Filing…' : 'Confirm & file →'}
        </button>
        <button onClick={onCancel}
          className="rounded-xl border border-neutral-300 px-lg py-md text-sm font-semibold hover:bg-neutral-50">
          Dismiss
        </button>
      </div>
    </div>
  )
}
