'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

// ── Step definitions ───────────────────────────────────────────────────────────

type EntityType = 'individual' | 'company'
type PropertyCount = 'single' | 'multiple'

interface FormData {
  // Both types
  entity_type: EntityType | ''
  property_count: PropertyCount | ''

  // Individual identity
  first_name: string
  last_name: string
  dob: string
  nationality: string
  id_type: string  // passport | driving_licence | national_id
  address: string
  employer: string
  contact_phone: string
  contact_email: string

  // Company identity
  company_name: string
  company_reg: string
  registered_office: string
  directors: string  // comma-separated

  // Property ownership — single
  property_address: string
  mortgage_provider: string
  mortgage_account: string

  // Property ownership — multiple
  properties: Array<{ address: string; mortgage_provider: string; mortgage_account: string }>

  // Bank (admin-only — still collected, shown only to admin)
  bank_name: string
  account_number: string
  sort_code: string
  iban: string

  // HMRC / NRL
  uk_resident: string  // yes | no
  nrl_ref: string

  // Emergency contact
  emergency_name: string
  emergency_phone: string
  emergency_relation: string

  // Declaration
  declaration: boolean
}

function blank(): FormData {
  return {
    entity_type: '', property_count: '',
    first_name: '', last_name: '', dob: '', nationality: '', id_type: 'passport',
    address: '', employer: '', contact_phone: '', contact_email: '',
    company_name: '', company_reg: '', registered_office: '', directors: '',
    property_address: '', mortgage_provider: '', mortgage_account: '',
    properties: [{ address: '', mortgage_provider: '', mortgage_account: '' }],
    bank_name: '', account_number: '', sort_code: '', iban: '',
    uk_resident: 'yes', nrl_ref: '',
    emergency_name: '', emergency_phone: '', emergency_relation: '',
    declaration: false,
  }
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function LandlordOnboardPage() {
  const params = useParams()
  const token = params?.token as string

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [alreadySubmitted, setAlreadySubmitted] = useState(false)
  const [landlordName, setLandlordName] = useState('')
  const [form, setForm] = useState<FormData>(blank())
  const [step, setStep] = useState<'type' | 'identity' | 'ownership' | 'bank' | 'declaration' | 'done'>('type')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    fetch(`/api/landlord-onboarding/form/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setNotFound(true); return }
        setLandlordName(d.row.name ?? '')
        if (d.row.stage >= 3) { setAlreadySubmitted(true); return }
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

  function addProperty() {
    setForm(f => ({ ...f, properties: [...f.properties, { address: '', mortgage_provider: '', mortgage_account: '' }] }))
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError('')
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
      setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Styles ──
  const inp = 'w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900'
  const lbl = 'block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1.5'
  const card = 'bg-white rounded-2xl border border-neutral-200 p-8 mb-6'

  // ── Early states ──
  if (loading) return <Shell><p className="text-neutral-400 text-sm">Loading your form…</p></Shell>
  if (notFound) return <Shell><p className="text-red-500 text-sm font-medium">This link is invalid or has expired. Please contact Capital Rooms.</p></Shell>
  if (alreadySubmitted) return (
    <Shell>
      <div className="text-center">
        <div className="text-4xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-neutral-900 mb-2">Form Already Submitted</h2>
        <p className="text-sm text-neutral-500">We have received your information and our team will be in touch shortly.</p>
      </div>
    </Shell>
  )
  if (step === 'done') return (
    <Shell>
      <div className="text-center">
        <div className="text-4xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-neutral-900 mb-2">Thank you, {form.first_name || landlordName.split(' ')[0]}!</h2>
        <p className="text-sm text-neutral-500 leading-relaxed max-w-sm mx-auto">
          Your information has been received. Our compliance team will review your submission and be in touch within 1–2 working days.
        </p>
        <p className="text-sm text-neutral-400 mt-6">
          Questions? Email us at <a href="mailto:hello@capitalrooms.co.uk" className="text-neutral-700 underline">hello@capitalrooms.co.uk</a>
        </p>
      </div>
    </Shell>
  )

  return (
    <Shell>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-neutral-900 mb-1">Landlord Information Form</h1>
        <p className="text-sm text-neutral-500">
          Please complete all sections below. This information is held securely in accordance with our Privacy Policy and used solely for compliance purposes.
        </p>
      </div>

      {/* Progress steps */}
      <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-1">
        {(['type', 'identity', 'ownership', 'bank', 'declaration'] as const).map((s, i) => {
          const labels = ['Type', 'Identity', 'Ownership', 'Banking', 'Declaration']
          const current = ['type', 'identity', 'ownership', 'bank', 'declaration'].indexOf(step)
          const done = i < current
          const active = i === current
          return (
            <div key={s} className="flex items-center gap-2 shrink-0">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                ${done ? 'bg-neutral-900 text-white' : active ? 'bg-neutral-900 text-white ring-2 ring-neutral-300' : 'bg-neutral-200 text-neutral-400'}`}>
                {done ? '✓' : i + 1}
              </div>
              <span className={`text-xs font-medium ${active ? 'text-neutral-900' : done ? 'text-neutral-500' : 'text-neutral-300'}`}>{labels[i]}</span>
              {i < 4 && <div className="w-6 h-px bg-neutral-200" />}
            </div>
          )
        })}
      </div>

      {/* ── STEP: TYPE ───────────────────────────────────────────────── */}
      {step === 'type' && (
        <div>
          <div className={card}>
            <h2 className="text-base font-bold text-neutral-900 mb-6">Are you registering as an individual or a company?</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              {([['individual', '👤', 'Individual', 'Personal landlord — passport or driving licence required'] , ['company', '🏢', 'Company', 'Ltd company, LLP, or partnership — company documents required']] as const).map(([val, emoji, label, desc]) => (
                <button
                  key={val}
                  onClick={() => set('entity_type', val)}
                  className={`text-left rounded-xl border-2 p-5 transition ${form.entity_type === val ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 hover:border-neutral-300'}`}
                >
                  <div className="text-2xl mb-2">{emoji}</div>
                  <p className="text-sm font-bold text-neutral-900 mb-1">{label}</p>
                  <p className="text-xs text-neutral-500">{desc}</p>
                </button>
              ))}
            </div>

            <h2 className="text-base font-bold text-neutral-900 mb-4">How many properties are you registering?</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {([['single', '🏠', 'One property', 'Register a single property with Capital Rooms'], ['multiple', '🏘', 'Multiple properties', 'Register two or more properties at once']] as const).map(([val, emoji, label, desc]) => (
                <button
                  key={val}
                  onClick={() => set('property_count', val)}
                  className={`text-left rounded-xl border-2 p-5 transition ${form.property_count === val ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 hover:border-neutral-300'}`}
                >
                  <div className="text-2xl mb-2">{emoji}</div>
                  <p className="text-sm font-bold text-neutral-900 mb-1">{label}</p>
                  <p className="text-xs text-neutral-500">{desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => setStep('identity')}
              disabled={!form.entity_type || !form.property_count}
              className="rounded-xl bg-neutral-900 text-white px-8 py-3 text-sm font-semibold hover:bg-neutral-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP: IDENTITY ───────────────────────────────────────────── */}
      {step === 'identity' && form.entity_type === 'individual' && (
        <div>
          <div className={card}>
            <h2 className="text-base font-bold text-neutral-900 mb-6">Personal Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div><label className={lbl}>First name *</label><input value={form.first_name} onChange={e => set('first_name', e.target.value)} className={inp} placeholder="e.g. James" /></div>
              <div><label className={lbl}>Last name *</label><input value={form.last_name} onChange={e => set('last_name', e.target.value)} className={inp} placeholder="e.g. Smith" /></div>
              <div><label className={lbl}>Date of birth *</label><input type="date" value={form.dob} onChange={e => set('dob', e.target.value)} className={inp} /></div>
              <div><label className={lbl}>Nationality *</label><input value={form.nationality} onChange={e => set('nationality', e.target.value)} className={inp} placeholder="e.g. British" /></div>
              <div className="sm:col-span-2"><label className={lbl}>Residential address *</label><textarea rows={2} value={form.address} onChange={e => set('address', e.target.value)} className={inp} placeholder={'23 Example Street\nLondon\nE1 1AA'} /></div>
              <div><label className={lbl}>Employer / occupation</label><input value={form.employer} onChange={e => set('employer', e.target.value)} className={inp} placeholder="e.g. Self-employed landlord" /></div>
              <div><label className={lbl}>Contact phone *</label><input type="tel" value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} className={inp} placeholder="07700 900000" /></div>
              <div className="sm:col-span-2"><label className={lbl}>Contact email *</label><input type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} className={inp} placeholder="james@example.com" /></div>
            </div>

            <div className="mt-6">
              <h3 className="text-sm font-bold text-neutral-700 mb-4">Identity Document</h3>
              <div className="mb-4">
                <label className={lbl}>Document type *</label>
                <select value={form.id_type} onChange={e => set('id_type', e.target.value)} className={inp}>
                  <option value="passport">Passport</option>
                  <option value="driving_licence">UK Driving Licence</option>
                  <option value="national_id">National Identity Card</option>
                </select>
              </div>
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
                <p className="font-semibold mb-1">📎 Document submission</p>
                <p className="leading-relaxed">Please email a clear colour copy of your {form.id_type === 'passport' ? 'passport (photo page)' : form.id_type === 'driving_licence' ? 'driving licence (both sides)' : 'national identity card (both sides)'} and a proof of address dated within the last 3 months (bank statement, utility bill, or council tax letter) to <a href="mailto:compliance@capitalrooms.co.uk" className="underline">compliance@capitalrooms.co.uk</a>.</p>
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep('type')} className="rounded-xl border border-neutral-200 px-6 py-3 text-sm font-semibold text-neutral-600 hover:bg-neutral-50 transition">← Back</button>
            <button onClick={() => setStep('ownership')} disabled={!form.first_name || !form.last_name || !form.dob || !form.contact_phone || !form.contact_email} className="rounded-xl bg-neutral-900 text-white px-8 py-3 text-sm font-semibold hover:bg-neutral-700 transition disabled:opacity-40 disabled:cursor-not-allowed">Continue →</button>
          </div>
        </div>
      )}

      {step === 'identity' && form.entity_type === 'company' && (
        <div>
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
            <div className="mt-6 rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
              <p className="font-semibold mb-1">📎 Document submission</p>
              <p className="leading-relaxed">Please email copies of your Certificate of Incorporation, Articles of Association, and passport + proof of address for each director or beneficial owner (25%+) to <a href="mailto:compliance@capitalrooms.co.uk" className="underline">compliance@capitalrooms.co.uk</a>.</p>
            </div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep('type')} className="rounded-xl border border-neutral-200 px-6 py-3 text-sm font-semibold text-neutral-600 hover:bg-neutral-50 transition">← Back</button>
            <button onClick={() => setStep('ownership')} disabled={!form.company_name || !form.company_reg || !form.contact_email} className="rounded-xl bg-neutral-900 text-white px-8 py-3 text-sm font-semibold hover:bg-neutral-700 transition disabled:opacity-40 disabled:cursor-not-allowed">Continue →</button>
          </div>
        </div>
      )}

      {/* ── STEP: OWNERSHIP ─────────────────────────────────────────── */}
      {step === 'ownership' && form.property_count === 'single' && (
        <div>
          <div className={card}>
            <h2 className="text-base font-bold text-neutral-900 mb-6">Property Ownership</h2>
            <div className="space-y-5">
              <div><label className={lbl}>Full property address *</label><textarea rows={2} value={form.property_address} onChange={e => set('property_address', e.target.value)} className={inp} placeholder={'4 Willis Road\nLondon\nE15 3HH'} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div><label className={lbl}>Mortgage provider (if applicable)</label><input value={form.mortgage_provider} onChange={e => set('mortgage_provider', e.target.value)} className={inp} placeholder="e.g. NatWest, or 'Owned outright'" /></div>
                <div><label className={lbl}>Mortgage account number</label><input value={form.mortgage_account} onChange={e => set('mortgage_account', e.target.value)} className={inp} placeholder="e.g. 12345678" /></div>
              </div>
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
                <p className="font-semibold mb-1">📎 Proof of ownership</p>
                <p className="leading-relaxed">Please email one of the following to <a href="mailto:compliance@capitalrooms.co.uk" className="underline">compliance@capitalrooms.co.uk</a>: utility bill or council tax letter for the property; or, if no mortgage, the title deed and confirmation of purchase.</p>
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep('identity')} className="rounded-xl border border-neutral-200 px-6 py-3 text-sm font-semibold text-neutral-600 hover:bg-neutral-50 transition">← Back</button>
            <button onClick={() => setStep('bank')} disabled={!form.property_address} className="rounded-xl bg-neutral-900 text-white px-8 py-3 text-sm font-semibold hover:bg-neutral-700 transition disabled:opacity-40 disabled:cursor-not-allowed">Continue →</button>
          </div>
        </div>
      )}

      {step === 'ownership' && form.property_count === 'multiple' && (
        <div>
          <div className={card}>
            <h2 className="text-base font-bold text-neutral-900 mb-2">Property Portfolio</h2>
            <p className="text-sm text-neutral-500 mb-6">Enter each property you wish to register. Add more rows as needed.</p>

            {form.properties.map((p, i) => (
              <div key={i} className="rounded-xl border border-neutral-100 bg-neutral-50 p-5 mb-4">
                <p className="text-xs font-bold text-neutral-500 uppercase tracking-wide mb-4">Property {i + 1}</p>
                <div className="space-y-4">
                  <div><label className={lbl}>Full address *</label><textarea rows={2} value={p.address} onChange={e => updateProperty(i, 'address', e.target.value)} className={inp} placeholder={'4 Willis Road\nLondon\nE15 3HH'} /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className={lbl}>Mortgage provider</label><input value={p.mortgage_provider} onChange={e => updateProperty(i, 'mortgage_provider', e.target.value)} className={inp} placeholder="or 'Owned outright'" /></div>
                    <div><label className={lbl}>Mortgage account</label><input value={p.mortgage_account} onChange={e => updateProperty(i, 'mortgage_account', e.target.value)} className={inp} /></div>
                  </div>
                </div>
              </div>
            ))}

            <button onClick={addProperty} className="text-sm font-semibold text-neutral-700 border border-dashed border-neutral-300 rounded-xl w-full py-3 hover:border-neutral-500 transition">
              + Add another property
            </button>

            <div className="mt-6 rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
              <p className="font-semibold mb-1">📎 Proof of ownership</p>
              <p className="leading-relaxed">Please email proof of ownership for each property to <a href="mailto:compliance@capitalrooms.co.uk" className="underline">compliance@capitalrooms.co.uk</a>. Acceptable documents: utility bill, council tax letter, mortgage statement, or title deed per property.</p>
            </div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep('identity')} className="rounded-xl border border-neutral-200 px-6 py-3 text-sm font-semibold text-neutral-600 hover:bg-neutral-50 transition">← Back</button>
            <button onClick={() => setStep('bank')} disabled={!form.properties[0]?.address} className="rounded-xl bg-neutral-900 text-white px-8 py-3 text-sm font-semibold hover:bg-neutral-700 transition disabled:opacity-40 disabled:cursor-not-allowed">Continue →</button>
          </div>
        </div>
      )}

      {/* ── STEP: BANK ──────────────────────────────────────────────── */}
      {step === 'bank' && (
        <div>
          <div className={card}>
            <h2 className="text-base font-bold text-neutral-900 mb-2">Bank & Tax Details</h2>
            <p className="text-sm text-neutral-500 mb-6">Used to remit rental income and comply with HMRC reporting requirements. This information is held securely and is accessible to Capital Rooms management only.</p>

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

          <div className="flex justify-between">
            <button onClick={() => setStep('ownership')} className="rounded-xl border border-neutral-200 px-6 py-3 text-sm font-semibold text-neutral-600 hover:bg-neutral-50 transition">← Back</button>
            <button onClick={() => setStep('declaration')} disabled={!form.bank_name || !form.account_number || !form.sort_code} className="rounded-xl bg-neutral-900 text-white px-8 py-3 text-sm font-semibold hover:bg-neutral-700 transition disabled:opacity-40 disabled:cursor-not-allowed">Continue →</button>
          </div>
        </div>
      )}

      {/* ── STEP: DECLARATION ───────────────────────────────────────── */}
      {step === 'declaration' && (
        <div>
          <div className={card}>
            <h2 className="text-base font-bold text-neutral-900 mb-6">Declaration & Submission</h2>
            <div className="prose prose-sm text-neutral-600 mb-6 space-y-3 text-sm leading-relaxed">
              <p>By submitting this form, I confirm that:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li>All information provided is accurate and complete to the best of my knowledge.</li>
                <li>I am the beneficial owner of the property or properties listed, or am duly authorised to act on behalf of the owning entity.</li>
                <li>I understand that Capital Rooms is required to verify my identity in accordance with the Money Laundering Regulations 2017 and may be unable to proceed if satisfactory evidence cannot be obtained.</li>
                <li>I consent to Capital Rooms retaining my information in accordance with their Privacy Policy for the duration of our relationship and for a period of 5 years thereafter.</li>
              </ul>
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.declaration}
                onChange={e => set('declaration', e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-neutral-300"
              />
              <span className="text-sm text-neutral-700 leading-relaxed">
                I confirm the above declaration and consent to the use of my information as described.
              </span>
            </label>
          </div>

          {error && (
            <div className="rounded-xl border-2 border-red-200 bg-red-50 p-4 text-sm text-red-700 mb-4">{error}</div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep('bank')} className="rounded-xl border border-neutral-200 px-6 py-3 text-sm font-semibold text-neutral-600 hover:bg-neutral-50 transition">← Back</button>
            <button
              onClick={handleSubmit}
              disabled={!form.declaration || submitting}
              className="rounded-xl bg-neutral-900 text-white px-8 py-3 text-sm font-semibold hover:bg-neutral-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? 'Submitting…' : 'Submit Form'}
            </button>
          </div>
        </div>
      )}
    </Shell>
  )
}

// ── Shell wrapper ──────────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header bar */}
      <div className="bg-neutral-900 py-5 px-6 flex items-center gap-3">
        <div>
          <p className="text-white font-bold text-lg leading-none">Capital Rooms</p>
          <p className="text-neutral-400 text-xs tracking-wider uppercase mt-0.5">Specialist HMO Management · London</p>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-10">
        {children}
      </div>

      <div className="text-center py-8 text-xs text-neutral-400">
        Capital Rooms Ltd &nbsp;·&nbsp; Member of The Property Ombudsman &nbsp;·&nbsp; ClientMoney Protect
      </div>
    </div>
  )
}
