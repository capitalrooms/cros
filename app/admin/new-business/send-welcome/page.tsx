'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DEFAULT_SERVICE_TYPE, SERVICE_TYPES, serviceTypeLabel, type ServiceType } from '@/lib/newBusiness/serviceTypes'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import PostcodeAddressLookup, { type ParsedAddress } from '@/app/components/PostcodeAddressLookup'
import NameInput, { type NameValue, emptyName, toFullName } from '@/app/components/NameInput'
import AddressInput, { type AddressValue, emptyAddress, toAddressString, toAddressLines, parseAddressString } from '@/app/components/AddressInput'
import { createClient } from '@/lib/supabase'
import { landlordName } from '@/lib/people'
import { adminFetch } from '@/lib/adminFetch'
import RentCollectionFields from '../RentCollectionFields'
import { RENT_COLLECTION_DEFAULTS, rentCollectionProblems, rentCollectionTermsFrom, type RentCollectionTerms } from '@/lib/managementAgreement/rentCollectionTerms'

// ── Types ──────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4
type PropertyType = 'hmo' | 'single'
type EntityType   = 'individual' | 'company'

const FEE_DEFAULTS = {
  hmo:    { managementFee: 10, letFee: '£300 per unit',  floatAmount: 500, epcCost: 75  },
  single: { managementFee: 8,  letFee: '£500',           floatAmount: 0,   epcCost: 100 },
}

function today() { return new Date().toISOString().slice(0, 10) }

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) }
  catch { return iso }
}

// ── Step indicator ─────────────────────────────────────────────────────────────

function StepBar({ step }: { step: Step }) {
  const steps = ['Landlord', 'Property', 'Agreement', 'Review & send']
  return (
    <div className="flex items-center gap-0 mb-xl">
      {steps.map((label, i) => {
        const n    = (i + 1) as Step
        const done = step > n
        const curr = step === n
        return (
          <div key={n} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${done ? 'bg-green-600 text-white' : curr ? 'bg-neutral-900 text-white' : 'bg-neutral-200 text-neutral-400'}`}>
                {done ? '✓' : n}
              </div>
              <span className={`text-xs mt-1 font-medium ${curr ? 'text-neutral-900' : 'text-neutral-400'}`}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-px mx-2 mt-[-14px] transition-all ${done ? 'bg-green-400' : 'bg-neutral-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Card wrapper ───────────────────────────────────────────────────────────────

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 p-lg mb-lg">
      <h2 className="text-base font-bold text-neutral-900 mb-xs">{title}</h2>
      {subtitle && <p className="text-sm text-neutral-500 mb-lg leading-relaxed">{subtitle}</p>}
      {!subtitle && <div className="mb-lg" />}
      {children}
    </div>
  )
}

// ── Main wizard ────────────────────────────────────────────────────────────────

export default function SendWelcomePage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [serviceType] = useState<ServiceType>(() => {
    const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('service') : null
    return SERVICE_TYPES.find(s => s.id === q && s.available)?.id ?? DEFAULT_SERVICE_TYPE
  })
  const isRC = serviceType === 'rent_collection'

  // Step 1 — Landlord
  const [llName,    setLlName]    = useState<NameValue>(emptyName())
  const fullName = toFullName(llName)
  const [email,     setEmail]     = useState('')
  const [phone,     setPhone]     = useState('')
  // Joint (second) landlord — shares the one landlord entry and appears on the agreement
  const [hasJoint,  setHasJoint]  = useState(false)
  const [jName,     setJName]     = useState<NameValue>(emptyName())
  const [jEmail,    setJEmail]    = useState('')
  const [existing,  setExisting]  = useState<any[]>([])
  const [pickedId,  setPickedId]  = useState('')

  useEffect(() => {
    createClient().from('people').select('*').eq('role', 'landlord').order('last_name')
      .then(({ data }) => setExisting(data || []))
  }, [])

  function fillFromLandlord(id: string) {
    setPickedId(id)
    const l = existing.find(x => x.id === id)
    if (!l) return
    setLlName({ salutation: l.salutation || '', first_name: l.first_name || '', last_name: l.last_name || '' })
    setEmail(l.email || '')
    setPhone(l.phone || '')
    if (l.home_address) setLlAddrValue(parseAddressString(l.home_address))
    if (l.company && !l.first_name) { setEntityType('company'); setCompanyName(l.company); setCompanyReg(l.company_number || '') }
    else setEntityType('individual')
    if (l.joint_first_name) {
      setHasJoint(true)
      setJName({ salutation: l.joint_salutation || '', first_name: l.joint_first_name || '', last_name: l.joint_last_name || '' })
      setJEmail(l.joint_email || '')
    } else { setHasJoint(false); setJName(emptyName()); setJEmail('') }
  }
  const jointFull = hasJoint ? toFullName(jName) : ''
  const addressee = jointFull ? `${fullName} & ${jointFull}` : fullName

  // Step 2 — Property
  const [propType,      setPropType]      = useState<PropertyType>('hmo')
  const [propAddrValue, setPropAddrValue] = useState<AddressValue>(emptyAddress())
  const propAddress   = toAddressString(propAddrValue)
  const propPostcode  = propAddrValue.postcode
  const [approxRooms,   setApproxRooms]   = useState('')
  const [llAddrValue,   setLlAddrValue]   = useState<AddressValue>(emptyAddress()) // landlord's own address
  const llAddress = toAddressString(llAddrValue)

  // Step 3 — Agreement fields
  const [entityType,      setEntityType]      = useState<EntityType>(isRC ? 'company' : 'individual')
  const [clientTitle,     setClientTitle]     = useState('Mr')
  const [clientFirst,     setClientFirst]     = useState('')
  const [clientLast,      setClientLast]      = useState('')
  const [companyName,     setCompanyName]     = useState('')
  const [companyReg,      setCompanyReg]      = useState('')
  const [companyCountry,  setCompanyCountry]  = useState('England and Wales')
  const [agreementDate,   setAgreementDate]   = useState(today())
  const [commenceDate,    setCommenceDate]    = useState(today())
  const [managementFee,   setManagementFee]   = useState(FEE_DEFAULTS.hmo.managementFee)
  const [letFee,          setLetFee]          = useState(FEE_DEFAULTS.hmo.letFee)
  const [floatAmount,     setFloatAmount]     = useState(FEE_DEFAULTS.hmo.floatAmount)
  const [epcCost,         setEpcCost]         = useState(FEE_DEFAULTS.hmo.epcCost)
  const [inventoryNote,   setInventoryNote]   = useState('')
  const [extraProperties, setExtraProperties] = useState<string[]>([])
  const [rcTerms,         setRcTerms]         = useState<RentCollectionTerms>(RENT_COLLECTION_DEFAULTS)

  // Step 4 — send
  const [sending,     setSending]     = useState(false)
  const [sendError,   setSendError]   = useState<string | null>(null)
  const [sendResult,  setSendResult]  = useState<{ onboardingId: string; filename: string } | null>(null)

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const inp  = 'w-full rounded-xl border border-neutral-200 bg-white px-md py-sm text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900'
  const lbl  = 'block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs'
  const smInp = inp + ' text-sm'

  function applyPropertyType(t: PropertyType) {
    setPropType(t)
    const d = FEE_DEFAULTS[t]
    setManagementFee(d.managementFee)
    setLetFee(d.letFee)
    setFloatAmount(d.floatAmount)
    setEpcCost(d.epcCost)
  }

  // Pre-fill name fields from full_name on entering step 3
  function enterStep3() {
    if (!clientFirst && !clientLast) {
      setClientFirst(llName.first_name)
      setClientLast(llName.last_name)
      if (!clientTitle && llName.salutation) setClientTitle(llName.salutation)
    }
    setStep(3)
  }

  const allProperties = [propAddress, ...extraProperties].filter(p => p.trim())

  async function handleSend() {
    setSending(true)
    setSendError(null)

    const clientAddressLines = toAddressLines(llAddrValue)

    const payload = {
      // Landlord record
      full_name: addressee.trim(),
      email:     email.trim(),
      phone:     phone.trim() || undefined,
      joint_email: hasJoint && jEmail.trim() ? jEmail.trim() : undefined,
      landlord_people_id: pickedId || undefined,
      service_type: serviceType,

      // Agreement
      agreementType:   isRC ? 'rent_collection' : propType,
      agreementDate,
      entityType,
      ...(entityType === 'individual'
        ? { clientTitle, clientFirstName: clientFirst, clientLastName: clientLast,
            ...(hasJoint && jName.first_name ? { client2Title: jName.salutation || undefined, client2FirstName: jName.first_name, client2LastName: jName.last_name } : {}) }
        : { companyName, companyReg, companyCountry }),
      clientAddress:   clientAddressLines,
      properties:      allProperties,
      managementFee,
      letFee,
      floatAmount:     propType === 'hmo' ? floatAmount : undefined,
      epcCost,
      commencementDate: commenceDate,
      inventoryNote:   isRC ? undefined : inventoryNote.trim() || undefined,
      rentCollection:  isRC ? rentCollectionTermsFrom(rcTerms) : undefined,
    }

    try {
      const res = await adminFetch('/api/landlord-onboarding/send-with-agreement', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Request failed')
      if (!d.emailSent) throw new Error(d.emailError ?? 'Email failed to send')
      setSendResult({ onboardingId: d.row?.id, filename: d.agreementFilename })
      setStep(4)
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSending(false)
    }
  }

  // ── Step 1 — Landlord details ─────────────────────────────────────────────

  if (step === 1) {
    const canProceed = (llName.first_name.trim().length >= 1 || fullName.trim().length >= 2) && /\S+@\S+\.\S+/.test(email)
      && (!hasJoint || (jName.first_name.trim() && jName.last_name.trim() && (!jEmail || /\S+@\S+\.\S+/.test(jEmail))))
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton href="/admin/new-business" />} />
        <main className="mx-auto max-w-6xl px-lg py-xl">
          <StepBar step={1} />
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-md">New instruction · {serviceTypeLabel(serviceType)}</p>

          <Card
            title="Landlord details"
            subtitle="Who are you sending this to? These details create their record in the onboarding pipeline."
          >
            <div className="space-y-md">
              {existing.length > 0 && (
                <div>
                  <label className={lbl}>Fill from existing landlord</label>
                  <select value={pickedId} onChange={e => fillFromLandlord(e.target.value)} className={inp}>
                    <option value="">— New landlord (type details below) —</option>
                    {existing.map(l => <option key={l.id} value={l.id}>{landlordName(l) !== '—' ? landlordName(l) : l.email}</option>)}
                  </select>
                </div>
              )}
              <NameInput value={llName} onChange={setLlName} required />
              <div>
                <label className={lbl}>Email address *</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inp} placeholder="mohammed@example.com" />
              </div>
              <div>
                <label className={lbl}>Phone number</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={inp} placeholder="07700 900000" />
              </div>
              {hasJoint ? (
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-md space-y-md">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-neutral-700">Joint landlord <span className="font-normal text-neutral-400">— named on the agreement; completes their own ID checks on the same form</span></p>
                    <button type="button" onClick={() => { setHasJoint(false); setJName(emptyName()); setJEmail('') }} className="text-xs text-neutral-400 hover:text-red-500">Remove</button>
                  </div>
                  <NameInput value={jName} onChange={setJName} required />
                  <div>
                    <label className={lbl}>Joint landlord email <span className="normal-case font-normal text-neutral-400">(optional — they'll also receive the email)</span></label>
                    <input type="email" value={jEmail} onChange={e => setJEmail(e.target.value)} className={inp} />
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setHasJoint(true)}
                  className="text-xs text-neutral-500 hover:text-neutral-900 border border-dashed border-neutral-300 rounded-lg px-md py-xs font-semibold transition w-full text-left">
                  + Add joint landlord
                </button>
              )}
            </div>
          </Card>

          <div className="flex justify-end">
            <button
              onClick={() => setStep(2)}
              disabled={!canProceed}
              className="rounded-xl bg-neutral-900 text-white px-xl py-sm text-sm font-semibold hover:bg-neutral-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next: Property details →
            </button>
          </div>
        </main>
      </div>
    )
  }

  // ── Step 2 — Property details ─────────────────────────────────────────────

  if (step === 2) {
    const canProceed = propAddrValue.line1.trim().length > 2 && propAddrValue.postcode.trim().length > 2
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton href="/admin/new-business" />} />
        <main className="mx-auto max-w-6xl px-lg py-xl">
          <StepBar step={2} />

          <Card
            title="Property details"
            subtitle="The property this landlord is bringing to Capital Rooms. This populates the management agreement — you can adjust fees in the next step."
          >
            {/* Property type */}
            {!isRC && <div className="mb-lg">
              <label className={lbl}>Property type *</label>
              <div className="grid grid-cols-2 gap-md">
                {(['hmo', 'single'] as PropertyType[]).map(t => (
                  <button
                    key={t}
                    onClick={() => applyPropertyType(t)}
                    className={`text-left rounded-xl border-2 p-md transition ${propType === t ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 hover:border-neutral-300'}`}
                  >
                    <p className="text-sm font-bold text-neutral-900 mb-xs">
                      {t === 'hmo' ? '🏘 HMO / Multi-let' : '🏠 Single let'}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {t === 'hmo' ? `${FEE_DEFAULTS.hmo.managementFee}% management · ${FEE_DEFAULTS.hmo.letFee} let fee` : `${FEE_DEFAULTS.single.managementFee}% management · ${FEE_DEFAULTS.single.letFee} let fee`}
                    </p>
                  </button>
                ))}
              </div>
            </div>}

            {/* Address lookup */}
            <div className="mb-md">
              <AddressInput value={propAddrValue} onChange={setPropAddrValue} label="Property address" required />
            </div>

            {/* Approx rooms (HMO only — informational) */}
            {propType === 'hmo' && !isRC && (
              <div className="mb-md">
                <label className={lbl}>Approximate number of rooms</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={approxRooms}
                  onChange={e => setApproxRooms(e.target.value)}
                  className={inp}
                  placeholder="e.g. 6"
                />
                <p className="text-xs text-neutral-400 mt-xs">Used for the agreement — the property will be fully set up in CROS once they're onboarded.</p>
              </div>
            )}

            {/* Additional properties (HMO multi-portfolio, or a rent collection portfolio) */}
            {(propType === 'hmo' || isRC) && (
              <div>
                {extraProperties.map((p, i) => (
                  <div key={i} className="flex gap-sm mb-sm">
                    <input
                      value={p}
                      onChange={e => setExtraProperties(prev => prev.map((v, j) => j === i ? e.target.value : v))}
                      className={inp}
                      placeholder={`Additional property ${i + 2} address`}
                    />
                    <button onClick={() => setExtraProperties(prev => prev.filter((_, j) => j !== i))}
                      className="text-neutral-400 hover:text-red-500 text-lg px-sm">×</button>
                  </div>
                ))}
                <button
                  onClick={() => setExtraProperties(p => [...p, ''])}
                  className="text-xs font-semibold text-neutral-500 border border-dashed border-neutral-300 rounded-xl px-md py-xs hover:border-neutral-500 transition"
                >
                  + Add another property
                </button>
              </div>
            )}
          </Card>

          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="rounded-xl border border-neutral-200 px-lg py-sm text-sm font-semibold text-neutral-600 hover:bg-neutral-50 transition">
              ← Back
            </button>
            <button
              onClick={enterStep3}
              disabled={!canProceed}
              className="rounded-xl bg-neutral-900 text-white px-xl py-sm text-sm font-semibold hover:bg-neutral-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next: Review agreement →
            </button>
          </div>
        </main>
      </div>
    )
  }

  // ── Step 3 — Agreement fields ─────────────────────────────────────────────

  if (step === 3) {
    const canSend = (
      (entityType === 'individual' ? !!(clientFirst.trim() && clientLast.trim()) : !!(companyName.trim())) &&
      llAddrValue.line1.trim().length > 2 &&
      allProperties.length >= 1
    )
    const rcProblems = isRC ? rentCollectionProblems(rentCollectionTermsFrom(rcTerms)) : []

    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton href="/admin/new-business" />} />
        <main className="mx-auto max-w-6xl px-lg py-xl">
          <StepBar step={3} />

          {/* Agreement preview banner */}
          <div className="bg-neutral-900 rounded-2xl p-lg mb-lg flex items-start gap-md">
            <div className="text-3xl">📋</div>
            <div>
              <p className="text-white font-bold text-base mb-xs">{isRC ? 'Rent Collection' : 'Management'} Agreement — Review before sending</p>
              <p className="text-neutral-400 text-sm leading-relaxed">
                This agreement will be generated as a PDF and attached to the welcome email for {addressee}.
                Check all details carefully — you can edit the fee structure and terms here before sending.
              </p>
            </div>
          </div>

          {/* Client identity */}
          <Card title="Agreement party">
            <div className="mb-md">
              <label className={lbl}>Entity type</label>
              <div className="flex gap-sm">
                {(['individual', 'company'] as EntityType[]).map(t => (
                  <button key={t} onClick={() => setEntityType(t)}
                    className={`rounded-xl border-2 px-lg py-xs text-sm font-semibold transition ${entityType === t ? 'border-neutral-900 bg-neutral-50 text-neutral-900' : 'border-neutral-200 text-neutral-500 hover:border-neutral-300'}`}>
                    {t === 'individual' ? '👤 Individual' : '🏢 Company'}
                  </button>
                ))}
              </div>
            </div>

            {entityType === 'individual' ? (
              <div className="grid grid-cols-3 gap-md">
                <div>
                  <label className={lbl}>Title</label>
                  <select value={clientTitle} onChange={e => setClientTitle(e.target.value)} className={smInp}>
                    {['Mr','Mrs','Ms','Miss','Dr','Prof','Rev','Mx'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>First name *</label>
                  <input value={clientFirst} onChange={e => setClientFirst(e.target.value)} className={smInp} placeholder="Mohammed" />
                </div>
                <div>
                  <label className={lbl}>Last name *</label>
                  <input value={clientLast} onChange={e => setClientLast(e.target.value)} className={smInp} placeholder="Al-Rashid" />
                </div>
                {hasJoint && (
                  <p className="col-span-3 text-xs text-neutral-600 bg-neutral-50 border border-neutral-200 rounded-lg px-md py-xs">
                    Joint landlord on the agreement: <strong>{jointFull || '—'}</strong> <span className="text-neutral-400">(change in step 1)</span>
                  </p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
                <div className="sm:col-span-2"><label className={lbl}>Company name *</label><input value={companyName} onChange={e => setCompanyName(e.target.value)} className={smInp} placeholder="Al-Rashid Properties Ltd" /></div>
                <div><label className={lbl}>Companies House number</label><input value={companyReg} onChange={e => setCompanyReg(e.target.value)} className={smInp} placeholder="12345678" /></div>
                <div><label className={lbl}>Registered in</label><input value={companyCountry} onChange={e => setCompanyCountry(e.target.value)} className={smInp} /></div>
              </div>
            )}

            <div className="mt-md">
              <AddressInput
                value={llAddrValue}
                onChange={setLlAddrValue}
                label="Client's address (for the agreement)"
                required
              />
              <p className="text-xs text-neutral-400 mt-xs">This is the landlord's own address — may differ from the property.</p>
            </div>
          </Card>

          {/* Dates */}
          <Card title="Dates">
            <div className="grid grid-cols-2 gap-md">
              <div>
                <label className={lbl}>Agreement date</label>
                <input type="date" value={agreementDate} onChange={e => setAgreementDate(e.target.value)} className={smInp} />
              </div>
              <div>
                <label className={lbl}>Proposed commencement</label>
                <input type="date" value={commenceDate} onChange={e => setCommenceDate(e.target.value)} className={smInp} />
              </div>
            </div>
          </Card>

          {isRC && (
            <Card title="Rent collection terms" subtitle="The client manages the properties and tenants. These terms set what we do, the float and the fixed outgoings we pay.">
              <RentCollectionFields value={rcTerms} onChange={setRcTerms} isCompany={entityType === 'company'} />
            </Card>
          )}

          {/* Fees */}
          {!isRC && <Card title="Fees & charges" subtitle="Defaults are set by property type. Adjust here if negotiated differently.">
            <div className="grid grid-cols-2 gap-md mb-md">
              <div>
                <label className={lbl}>Management fee (%)</label>
                <input type="number" min="0" max="30" step="0.5" value={managementFee} onChange={e => setManagementFee(parseFloat(e.target.value) || 0)} className={smInp} />
              </div>
              <div>
                <label className={lbl}>Let fee</label>
                <input value={letFee} onChange={e => setLetFee(e.target.value)} className={smInp} placeholder="e.g. £300 per unit" />
              </div>
              {propType === 'hmo' && (
                <div>
                  <label className={lbl}>Maintenance float (£)</label>
                  <input type="number" min="0" value={floatAmount} onChange={e => setFloatAmount(parseInt(e.target.value) || 0)} className={smInp} />
                </div>
              )}
              <div>
                <label className={lbl}>EPC cost (£)</label>
                <input type="number" min="0" value={epcCost} onChange={e => setEpcCost(parseInt(e.target.value) || 0)} className={smInp} />
              </div>
            </div>
          </Card>}

          {/* Properties */}
          <Card title="Properties covered">
            {allProperties.map((p, i) => (
              <div key={i} className="rounded-xl bg-neutral-50 border border-neutral-100 px-md py-sm text-sm text-neutral-700 mb-sm">
                {p}
              </div>
            ))}
            {approxRooms && propType === 'hmo' && (
              <p className="text-xs text-neutral-400 mt-xs">Approx. {approxRooms} rooms — note in agreement if needed.</p>
            )}
            {!isRC && <div className="mt-md">
              <label className={lbl}>Additional notes (optional)</label>
              <textarea rows={2} value={inventoryNote} onChange={e => setInventoryNote(e.target.value)} className={inp} placeholder="e.g. Inventory to be agreed separately; furnished / unfurnished terms…" />
            </div>}
          </Card>

          {rcProblems.length > 0 && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-md py-sm mb-lg">Before sending: {rcProblems.join(' · ')}</p>
          )}

          {sendError && (
            <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-md py-sm mb-lg">
              ⚠ {sendError}
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="rounded-xl border border-neutral-200 px-lg py-sm text-sm font-semibold text-neutral-600 hover:bg-neutral-50 transition">
              ← Back
            </button>
            <button
              onClick={handleSend}
              disabled={!canSend || rcProblems.length > 0 || sending}
              className="rounded-xl bg-neutral-900 text-white px-xl py-sm text-sm font-semibold hover:bg-neutral-700 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-sm"
            >
              {sending
                ? <><span className="animate-spin">⏳</span> Generating &amp; sending…</>
                : '📨 Generate PDF & send welcome email →'}
            </button>
          </div>
        </main>
      </div>
    )
  }

  // ── Step 4 — Done ─────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/new-business" />} />
      <main className="mx-auto max-w-6xl px-lg py-xl">
        <StepBar step={4} />

        <div className="bg-white rounded-2xl border border-neutral-200 p-2xl text-center">
          <div className="text-5xl mb-lg">🎉</div>
          <h2 className="text-xl font-bold text-neutral-900 mb-sm">Welcome pack sent</h2>
          <p className="text-sm text-neutral-500 leading-relaxed mb-xl max-w-6xl mx-auto">
            The {isRC ? 'rent collection' : 'management'} agreement and AML registration form have been sent to <strong>{email}</strong>.{' '}
            {llName.first_name || clientFirst || 'They'} can read the agreement, then complete the form at their own pace.
          </p>

          {sendResult && (
            <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-md text-left mb-xl text-sm text-neutral-600 space-y-xs">
              <p>📋 <strong>Agreement:</strong> {sendResult.filename}</p>
              <p>🗓 <strong>Commencement:</strong> {fmtDate(commenceDate)}</p>
              <p>💷 {isRC ? <><strong>Service fee:</strong> {rcTerms.serviceFee}</> : <><strong>Management fee:</strong> {managementFee}% · Let fee: {letFee}</>}</p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-md justify-center">
            {sendResult?.onboardingId && (
              <a
                href={`/admin/new-business/onboarding`}
                className="rounded-xl bg-neutral-900 text-white px-xl py-sm text-sm font-semibold hover:bg-neutral-700 transition"
              >
                Track in onboarding pipeline →
              </a>
            )}
            <button
              onClick={() => {
                // Reset for another send
                setStep(1)
                setLlName(emptyName()); setEmail(''); setPhone('')
                setHasJoint(false); setJName(emptyName()); setJEmail(''); setPickedId('')
                setPropAddrValue(emptyAddress()); setApproxRooms(''); setExtraProperties([])
                setClientFirst(''); setClientLast(''); setLlAddrValue(emptyAddress())
                setInventoryNote(''); setSendResult(null)
              }}
              className="rounded-xl border border-neutral-200 px-xl py-sm text-sm font-semibold text-neutral-600 hover:bg-neutral-50 transition"
            >
              Send another
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
