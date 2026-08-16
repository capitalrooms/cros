'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export interface AIResult {
  doc_type: string
  confidence: number
  summary: string
  issue_date: string
  expiry_date: string
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
}

export const TYPE_LABELS: Record<string, string> = {
  gas_safety_certificate: 'Gas safety certificate',
  electrical_eicr: 'Electrical certificate (EICR)',
  epc: 'Energy certificate (EPC)',
  insurance: 'Landlord insurance',
  tenancy_agreement: 'Tenancy agreement (AST)',
  tenant_reference: 'Tenant reference',
  other: 'Other document',
}

const PROPERTY_TYPES = ['gas_safety_certificate', 'electrical_eicr', 'epc', 'insurance']

/**
 * The review + confirm + file card. Shared by the manual AI upload page and the
 * forwarded-email inbox. Given the AI's extracted fields, the admin edits them,
 * chooses the target record, and files it. `onApplied` fires after a successful
 * write so the caller can reset / mark the inbox item done.
 */
export default function DocReview({
  initial,
  properties,
  people,
  tenancies,
  onApplied,
  onCancel,
}: {
  initial: AIResult
  properties: any[]
  people: any[]
  tenancies: any[]
  onApplied: (msg: string) => void
  onCancel: () => void
}) {
  const [fields, setFields] = useState<AIResult>(initial)
  const [targetProperty, setTargetProperty] = useState('')
  const [targetPerson, setTargetPerson] = useState('')
  const [targetTenancy, setTargetTenancy] = useState('')
  const [notifyTenants, setNotifyTenants] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setFields(initial)
    // Pre-select the best-matching property / person by name.
    if (initial.property_address) {
      const hit = (properties || []).find(
        (p) =>
          initial.property_address.toLowerCase().includes(String(p.name).toLowerCase()) ||
          (p.address && initial.property_address.toLowerCase().includes(String(p.address).toLowerCase())) ||
          String(p.address || '').toLowerCase().includes(initial.property_address.toLowerCase())
      )
      setTargetProperty(hit?.id || '')
    } else setTargetProperty('')
    if (initial.person_name) {
      const hit = (people || []).find((p) =>
        String(p.full_name || '').toLowerCase().includes(initial.person_name.toLowerCase())
      )
      setTargetPerson(hit?.id || '')
    } else setTargetPerson('')
    setTargetTenancy('')
  }, [initial, properties, people])

  const set = (k: keyof AIResult, v: string) => setFields((f) => ({ ...f, [k]: v }))
  const type = fields.doc_type

  async function apply() {
    setApplying(true)
    setError('')
    try {
      const supabase = createClient()
      if (PROPERTY_TYPES.includes(type)) {
        if (!targetProperty) throw new Error('Choose which property this belongs to')
        const update: any = {}
        if (type === 'gas_safety_certificate') {
          update.gas_safe_cert_date = fields.issue_date || null
          update.gas_safe_cert_expiry = fields.expiry_date || null
        } else if (type === 'electrical_eicr') {
          update.electrical_cert_date = fields.issue_date || null
          update.electrical_cert_expiry = fields.expiry_date || null
        } else if (type === 'insurance') {
          update.insurance_provider = fields.provider || null
          update.insurance_policy_number = fields.policy_number || null
          update.insurance_expiry = fields.expiry_date || null
        }
        if (Object.keys(update).length) {
          const { error: e } = await supabase.from('properties').update(update).eq('id', targetProperty)
          if (e) throw e
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
        onApplied(`Filed to ${properties.find((p) => p.id === targetProperty)?.name || 'the property'}.`)
      } else if (type === 'tenant_reference') {
        if (!targetPerson) throw new Error('Choose which tenant this reference is for')
        const update: any = {}
        if (fields.person_phone) update.phone = fields.person_phone
        if (fields.person_email) update.email = fields.person_email
        if (fields.occupation) update.occupation = fields.occupation
        if (fields.annual_income) update.annual_income = fields.annual_income
        if (fields.previous_address) update.previous_address = fields.previous_address
        const { error: e } = await supabase.from('people').update(update).eq('id', targetPerson)
        if (e) throw e
        onApplied(`Reference saved to ${people.find((p) => p.id === targetPerson)?.full_name || 'the tenant'}.`)
      } else if (type === 'tenancy_agreement') {
        if (!targetTenancy) throw new Error('Choose which tenancy this agreement is for')
        const update: any = {}
        if (fields.tenancy_start) update.start_date = fields.tenancy_start
        if (fields.tenancy_end) update.end_date = fields.tenancy_end
        if (fields.monthly_rent) {
          const n = Number(String(fields.monthly_rent).replace(/[^0-9.]/g, ''))
          if (!Number.isNaN(n) && n > 0) update.rent_amount = n
        }
        const { error: e } = await supabase.from('tenancies').update(update).eq('id', targetTenancy)
        if (e) throw e
        onApplied('Tenancy details updated.')
      } else {
        throw new Error('This document type has no automatic destination.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="rounded-2xl border-2 border-neutral-900 bg-white p-lg">
      {error && (
        <div className="mb-md rounded-xl border border-neutral-900 bg-white p-md text-sm">{error}</div>
      )}
      <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
        Looks like · {Math.round((fields.confidence || 0) * 100)}% sure
      </p>
      <select
        value={fields.doc_type}
        onChange={(e) => set('doc_type', e.target.value)}
        className="mt-xs w-full rounded-xl border border-neutral-300 px-md py-sm text-lg font-bold"
      >
        {Object.entries(TYPE_LABELS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      {fields.summary && <p className="mt-sm text-sm text-neutral-600">{fields.summary}</p>}

      {PROPERTY_TYPES.includes(type) && (
        <div className="mt-lg space-y-md">
          <Field label="Property this belongs to">
            <select value={targetProperty} onChange={(e) => setTargetProperty(e.target.value)} className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm">
              <option value="">Choose a property…</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {p.address}</option>
              ))}
            </select>
          </Field>
          {type !== 'insurance' && (
            <div className="grid grid-cols-2 gap-md">
              <Field label="Issued"><input type="date" value={fields.issue_date} onChange={(e) => set('issue_date', e.target.value)} className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm" /></Field>
              <Field label="Expires"><input type="date" value={fields.expiry_date} onChange={(e) => set('expiry_date', e.target.value)} className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm" /></Field>
            </div>
          )}
          {type === 'insurance' && (
            <>
              <div className="grid grid-cols-2 gap-md">
                <Field label="Provider"><input value={fields.provider} onChange={(e) => set('provider', e.target.value)} className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm" /></Field>
                <Field label="Policy number"><input value={fields.policy_number} onChange={(e) => set('policy_number', e.target.value)} className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm" /></Field>
              </div>
              <Field label="Expires"><input type="date" value={fields.expiry_date} onChange={(e) => set('expiry_date', e.target.value)} className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm" /></Field>
            </>
          )}
          {type === 'epc' && (
            <p className="text-xs text-neutral-500">No EPC field yet — nothing is written, but you can still notify tenants it&apos;s on file.</p>
          )}
          <label className="flex items-center gap-sm text-sm">
            <input type="checkbox" checked={notifyTenants} onChange={(e) => setNotifyTenants(e.target.checked)} />
            Notify the property&apos;s tenants it&apos;s on file (otherwise update quietly)
          </label>
        </div>
      )}

      {type === 'tenant_reference' && (
        <div className="mt-lg space-y-md">
          <Field label="Tenant this reference is for">
            <select value={targetPerson} onChange={(e) => setTargetPerson(e.target.value)} className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm">
              <option value="">Choose a tenant…</option>
              {people.map((p) => (<option key={p.id} value={p.id}>{p.full_name || p.email}</option>))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-md">
            <Field label="Phone"><input value={fields.person_phone} onChange={(e) => set('person_phone', e.target.value)} className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm" /></Field>
            <Field label="Occupation"><input value={fields.occupation} onChange={(e) => set('occupation', e.target.value)} className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm" /></Field>
            <Field label="Annual income"><input value={fields.annual_income} onChange={(e) => set('annual_income', e.target.value)} className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm" /></Field>
            <Field label="Previous address"><input value={fields.previous_address} onChange={(e) => set('previous_address', e.target.value)} className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm" /></Field>
          </div>
        </div>
      )}

      {type === 'tenancy_agreement' && (
        <div className="mt-lg space-y-md">
          <Field label="Tenancy this agreement is for">
            <select value={targetTenancy} onChange={(e) => setTargetTenancy(e.target.value)} className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm">
              <option value="">Choose a tenancy…</option>
              {tenancies.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.people?.full_name || 'Tenant'} · {t.rooms?.name || ''} · {t.properties?.name || ''}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-3 gap-md">
            <Field label="Start"><input type="date" value={fields.tenancy_start} onChange={(e) => set('tenancy_start', e.target.value)} className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm" /></Field>
            <Field label="End"><input type="date" value={fields.tenancy_end} onChange={(e) => set('tenancy_end', e.target.value)} className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm" /></Field>
            <Field label="Rent (£pcm)"><input value={fields.monthly_rent} onChange={(e) => set('monthly_rent', e.target.value)} className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm" /></Field>
          </div>
        </div>
      )}

      {type === 'other' && (
        <p className="mt-lg text-sm text-neutral-500">
          Not a known document type — nothing to file automatically. Pick a type above if it&apos;s wrong.
        </p>
      )}

      <div className="mt-lg flex gap-sm">
        <button onClick={apply} disabled={applying || type === 'other'} className="flex-1 rounded-xl bg-neutral-900 py-md text-sm font-bold text-white hover:bg-neutral-800 disabled:opacity-40">
          {applying ? 'Filing…' : 'Confirm & file'}
        </button>
        <button onClick={onCancel} className="rounded-xl border border-neutral-300 px-lg py-md text-sm font-semibold">
          Cancel
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-neutral-700 mb-xs">{label}</label>
      {children}
    </div>
  )
}
