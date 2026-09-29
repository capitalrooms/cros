'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import PostcodeAddressLookup from '@/app/components/PostcodeAddressLookup'
import AddressInput, { type AddressValue, emptyAddress, toAddressString, parseAddressString } from '@/app/components/AddressInput'
import { createClient } from '@/lib/supabase'
import { landlordName } from '@/lib/people'

// ── Types ──────────────────────────────────────────────────────────────────────

type AgreementType = 'hmo' | 'single'
type EntityType    = 'individual' | 'company'

// ── Defaults ───────────────────────────────────────────────────────────────────

const DEFAULTS = {
  hmo:    { managementFee: 10, letFee: '£300 per unit',    floatAmount: 500, epcCost: 75  },
  single: { managementFee: 8,  letFee: '£500',             floatAmount: 0,   epcCost: 100 },
}

function today() { return new Date().toISOString().slice(0, 10) }

// ── Inner form (needs useSearchParams) ────────────────────────────────────────

function ManagementAgreementForm() {
  const params       = useSearchParams()
  const onboardingId = params.get('onboardingId') ?? ''

  // Pre-fill from URL params (set when launched from onboarding pipeline)
  const prefillName    = params.get('name') ?? ''
  const prefillEmail   = params.get('email') ?? ''
  const prefillAddress = params.get('address') ?? ''
  const prefillEntity  = (params.get('entity') ?? 'individual') as EntityType
  const prefillCompany = params.get('company') ?? ''
  const prefillReg     = params.get('reg') ?? ''

  // ── Form state ──────────────────────────────────────────────────────────────
  const [agreementType, setAgreementType] = useState<AgreementType>('hmo')
  const [agreementDate,  setAgreementDate]  = useState(today())
  const [entityType,     setEntityType]     = useState<EntityType>(prefillEntity)
  const [clientTitle,    setClientTitle]    = useState('Mr')
  const [clientFirst,    setClientFirst]    = useState(() => prefillName.split(' ')[0] ?? '')
  const [clientLast,     setClientLast]     = useState(() => prefillName.split(' ').slice(1).join(' ') ?? '')
  // Joint (second) landlord
  const [hasJointLandlord, setHasJointLandlord] = useState(false)
  const [client2Title,  setClient2Title]  = useState('Mrs')
  const [client2First,  setClient2First]  = useState('')
  const [client2Last,   setClient2Last]   = useState('')
  const [companyName,    setCompanyName]    = useState(prefillCompany)
  const [companyReg,     setCompanyReg]     = useState(prefillReg)
  const [companyCountry, setCompanyCountry] = useState('England and Wales')
  const [clientAddrValue, setClientAddrValue] = useState<AddressValue>(() => parseAddressString(prefillAddress))
  const clientAddress = toAddressString(clientAddrValue)
  const [propAddresses, setPropAddresses] = useState<AddressValue[]>([emptyAddress()])
  const [managementFee,  setManagementFee]  = useState(DEFAULTS.hmo.managementFee)
  const [letFee,         setLetFee]         = useState(DEFAULTS.hmo.letFee)
  const [floatAmount,    setFloatAmount]    = useState(DEFAULTS.hmo.floatAmount)
  const [epcCost,        setEpcCost]        = useState(DEFAULTS.hmo.epcCost)
  const [commencementDate, setCommencementDate] = useState(today())
  const [inventoryNote,  setInventoryNote]  = useState('')

  const [existingLandlords, setExistingLandlords] = useState<any[]>([])
  const [pickedLandlordId, setPickedLandlordId] = useState('')

  useEffect(() => {
    createClient()
      .from('people')
      .select('*')
      .eq('role', 'landlord')
      .order('last_name')
      .then(({ data }) => setExistingLandlords(data || []))
  }, [])

  function fillFromLandlord(id: string) {
    setPickedLandlordId(id)
    const l = existingLandlords.find(x => x.id === id)
    if (!l) return
    if (l.company && !l.first_name) {
      setEntityType('company')
      setCompanyName(l.company)
      setCompanyReg(l.company_number || '')
    } else {
      setEntityType('individual')
      if (l.salutation) setClientTitle(l.salutation)
      setClientFirst(l.first_name || '')
      setClientLast(l.last_name || '')
      if (l.joint_first_name) {
        setHasJointLandlord(true)
        setClient2Title(l.joint_salutation || client2Title)
        setClient2First(l.joint_first_name || '')
        setClient2Last(l.joint_last_name || '')
      } else {
        setHasJointLandlord(false)
        setClient2First('')
        setClient2Last('')
      }
    }
    if (l.home_address) setClientAddrValue(parseAddressString(l.home_address))
  }

  const [generating, setGenerating] = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [success,    setSuccess]    = useState(false)

  // Update defaults when agreement type changes
  useEffect(() => {
    const d = DEFAULTS[agreementType]
    setManagementFee(d.managementFee)
    setLetFee(d.letFee)
    setFloatAmount(d.floatAmount)
    setEpcCost(d.epcCost)
    // Single let: only one property
    if (agreementType === 'single' && propAddresses.length > 1) {
      setPropAddresses([propAddresses[0]])
    }
  }, [agreementType]) // eslint-disable-line react-hooks/exhaustive-deps

  function addProperty() {
    if (agreementType === 'single') return
    setPropAddresses(p => [...p, emptyAddress()])
  }

  function removeProperty(i: number) {
    setPropAddresses(p => p.filter((_, j) => j !== i))
  }

  function updateProperty(i: number, val: AddressValue) {
    setPropAddresses(p => p.map((v, j) => j === i ? val : v))
  }

  async function handleGenerate() {
    setError(null)
    setSuccess(false)

    const filledProps = propAddresses.map(toAddressString).filter(p => p.trim())
    if (!filledProps.length) { setError('Enter at least one property address.'); return }
    if (!clientAddrValue.line1.trim()) { setError('Enter the client address.'); return }
    if (entityType === 'individual' && !clientFirst.trim()) { setError('Enter the client name.'); return }
    if (entityType === 'company' && !companyName.trim()) { setError('Enter the company name.'); return }

    setGenerating(true)

    const payload = {
      agreementType,
      agreementDate,
      entityType,
      clientTitle:    entityType === 'individual' ? clientTitle : undefined,
      clientFirstName: entityType === 'individual' ? clientFirst : undefined,
      clientLastName:  entityType === 'individual' ? clientLast  : undefined,
      client2Title:    (entityType === 'individual' && hasJointLandlord && client2First) ? client2Title : undefined,
      client2FirstName: (entityType === 'individual' && hasJointLandlord && client2First) ? client2First : undefined,
      client2LastName:  (entityType === 'individual' && hasJointLandlord && client2First) ? client2Last  : undefined,
      companyName:    entityType === 'company' ? companyName    : undefined,
      companyReg:     entityType === 'company' ? companyReg     : undefined,
      companyCountry: entityType === 'company' ? companyCountry : undefined,
      clientAddress:  clientAddress.split('\n').map((l: string) => l.trim()).filter(Boolean),
      properties:     filledProps,
      managementFee,
      letFee,
      floatAmount:    agreementType === 'hmo' ? floatAmount : undefined,
      epcCost,
      commencementDate,
      inventoryNote:  inventoryNote.trim() || undefined,
      onboardingId:   onboardingId || undefined,
    }

    try {
      const res = await fetch('/api/admin/generate-management-agreement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? `HTTP ${res.status}`)
      }

      const blob     = await res.blob()
      const url      = URL.createObjectURL(blob)
      const a        = document.createElement('a')
      const typeLabel = agreementType === 'hmo' ? 'Multi-Let' : 'Single-Let'
      const propSlug  = (filledProps[0] ?? 'Agreement').replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 40)
      a.href         = url
      a.download     = `Capital-Rooms-Management-Agreement_${typeLabel}_${propSlug}_${agreementDate}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setSuccess(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate PDF')
    } finally {
      setGenerating(false)
    }
  }

  const inp = 'w-full rounded-xl border border-neutral-200 bg-white px-md py-sm text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900'
  const label = 'block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs'

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/new-business" />} />

      <main className="mx-auto max-w-6xl px-lg py-xl">
        <div className="mb-xl">
          <h1 className="text-2xl font-bold text-neutral-900">📋 Management Agreement</h1>
          <p className="text-sm text-neutral-500 mt-xs">
            Generate a fully populated management agreement on Capital Rooms letterhead.
            Fill in the client details below and download the signed-ready PDF.
          </p>
        </div>

        {onboardingId && (
          <div className="mb-lg rounded-xl bg-blue-50 border border-blue-200 px-md py-sm text-sm text-blue-700">
            ℹ️ Pre-filled from onboarding record — review and adjust before generating.
          </div>
        )}

        <div className="space-y-lg">

          {/* ── Agreement type ──────────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-lg">
            <h2 className="text-sm font-bold text-neutral-900 mb-md">Agreement Type</h2>
            <div className="flex gap-md">
              {(['hmo', 'single'] as AgreementType[]).map(t => (
                <button
                  key={t}
                  onClick={() => setAgreementType(t)}
                  className={`flex-1 rounded-xl border-2 py-md text-sm font-semibold transition ${agreementType === t ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-600 hover:border-neutral-400'}`}
                >
                  {t === 'hmo' ? '🏠 HMO / Multi-Let' : '🏡 Single Let'}
                </button>
              ))}
            </div>
            <p className="text-xs text-neutral-400 mt-sm">
              {agreementType === 'hmo'
                ? 'Multiple Occupancy — for HMO and multi-room properties'
                : 'Single Occupier — for entire property let to one household'}
            </p>
          </div>

          {/* ── Dates ───────────────────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-lg">
            <h2 className="text-sm font-bold text-neutral-900 mb-md">Dates</h2>
            <div className="grid grid-cols-2 gap-md">
              <div>
                <label className={label}>Agreement date</label>
                <input type="date" value={agreementDate} onChange={e => setAgreementDate(e.target.value)} className={inp} />
              </div>
              <div>
                <label className={label}>Commencement date</label>
                <input type="date" value={commencementDate} onChange={e => setCommencementDate(e.target.value)} className={inp} />
              </div>
            </div>
          </div>

          {/* ── Client ──────────────────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-lg">
            <h2 className="text-sm font-bold text-neutral-900 mb-md">Client Details</h2>

            {existingLandlords.length > 0 && (
              <div className="mb-md">
                <label className={label}>Fill from existing landlord</label>
                <select value={pickedLandlordId} onChange={e => fillFromLandlord(e.target.value)} className={inp}>
                  <option value="">— New client (type details below) —</option>
                  {existingLandlords.map(l => (
                    <option key={l.id} value={l.id}>{landlordName(l) !== '—' ? landlordName(l) : l.email}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Entity type toggle */}
            <div className="flex gap-sm mb-md">
              {(['individual', 'company'] as EntityType[]).map(t => (
                <button
                  key={t}
                  onClick={() => setEntityType(t)}
                  className={`px-md py-xs rounded-lg border text-xs font-semibold transition ${entityType === t ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-600 hover:border-neutral-400'}`}
                >
                  {t === 'individual' ? 'Individual' : 'Company'}
                </button>
              ))}
            </div>

            {entityType === 'individual' ? (
              <div className="space-y-md mb-md">
                <div className="grid grid-cols-3 gap-md">
                  <div>
                    <label className={label}>Title</label>
                    <select value={clientTitle} onChange={e => setClientTitle(e.target.value)} className={inp}>
                      {['Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Prof'].map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={label}>First name *</label>
                    <input value={clientFirst} onChange={e => setClientFirst(e.target.value)} className={inp} placeholder="James" />
                  </div>
                  <div>
                    <label className={label}>Last name</label>
                    <input value={clientLast} onChange={e => setClientLast(e.target.value)} className={inp} placeholder="Smith" />
                  </div>
                </div>
                {/* Joint landlord */}
                {hasJointLandlord ? (
                  <div>
                    <div className="flex items-center justify-between mb-xs">
                      <label className={label}>Joint landlord</label>
                      <button type="button" onClick={() => { setHasJointLandlord(false); setClient2First(''); setClient2Last('') }}
                        className="text-xs text-neutral-400 hover:text-red-500">Remove</button>
                    </div>
                    <div className="grid grid-cols-3 gap-md">
                      <div>
                        <label className={label}>Title</label>
                        <select value={client2Title} onChange={e => setClient2Title(e.target.value)} className={inp}>
                          {['Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Prof'].map(t => <option key={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={label}>First name</label>
                        <input value={client2First} onChange={e => setClient2First(e.target.value)} className={inp} placeholder="Sarah" />
                      </div>
                      <div>
                        <label className={label}>Last name</label>
                        <input value={client2Last} onChange={e => setClient2Last(e.target.value)} className={inp} placeholder="Smith" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setHasJointLandlord(true)}
                    className="text-xs text-neutral-500 hover:text-neutral-900 border border-dashed border-neutral-300 rounded-lg px-md py-xs font-semibold transition-colors">
                    + Add joint landlord
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-md mb-md">
                <div>
                  <label className={label}>Company name *</label>
                  <input value={companyName} onChange={e => setCompanyName(e.target.value)} className={inp} placeholder="Smith Properties Ltd" />
                </div>
                <div className="grid grid-cols-2 gap-md">
                  <div>
                    <label className={label}>Company reg. number</label>
                    <input value={companyReg} onChange={e => setCompanyReg(e.target.value)} className={inp} placeholder="12345678" />
                  </div>
                  <div>
                    <label className={label}>Country of registration</label>
                    <input value={companyCountry} onChange={e => setCompanyCountry(e.target.value)} className={inp} placeholder="England and Wales" />
                  </div>
                </div>
              </div>
            )}

            <AddressInput
              value={clientAddrValue}
              onChange={setClientAddrValue}
              label="Client address"
              required
            />
          </div>

          {/* ── Properties ──────────────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-lg">
            <h2 className="text-sm font-bold text-neutral-900 mb-md">
              {agreementType === 'hmo' ? 'Properties' : 'Property'}
            </h2>
            <div className="space-y-lg">
              {propAddresses.map((p, i) => (
                <div key={i} className="relative">
                  {propAddresses.length > 1 && (
                    <div className="flex items-center justify-between mb-xs">
                      <span className="text-xs font-semibold text-neutral-400">Property {i + 1}</span>
                      <button
                        onClick={() => removeProperty(i)}
                        className="text-xs text-red-400 hover:text-red-600 font-semibold transition"
                      >Remove</button>
                    </div>
                  )}
                  <AddressInput
                    value={p}
                    onChange={val => updateProperty(i, val)}
                    label={propAddresses.length === 1 ? 'Property address' : `Property ${i + 1} address`}
                    required
                  />
                </div>
              ))}
            </div>
            {agreementType === 'hmo' && (
              <button
                onClick={addProperty}
                className="mt-sm text-xs font-semibold text-neutral-500 hover:text-neutral-900 transition"
              >
                + Add another property
              </button>
            )}
          </div>

          {/* ── Fees ────────────────────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-lg">
            <h2 className="text-sm font-bold text-neutral-900 mb-md">Fee Structure</h2>
            <div className="grid grid-cols-2 gap-md">
              <div>
                <label className={label}>Management fee (%)</label>
                <div className="relative">
                  <input
                    type="number"
                    min={1}
                    max={25}
                    step={0.5}
                    value={managementFee}
                    onChange={e => setManagementFee(Number(e.target.value))}
                    className={`${inp} pr-8`}
                  />
                  <span className="absolute right-md top-1/2 -translate-y-1/2 text-neutral-400 text-sm">%</span>
                </div>
              </div>
              <div>
                <label className={label}>Let fee</label>
                <input
                  value={letFee}
                  onChange={e => setLetFee(e.target.value)}
                  className={inp}
                  placeholder={agreementType === 'hmo' ? '£300 per unit' : '£500'}
                />
              </div>
              <div>
                <label className={label}>EPC cost</label>
                <div className="relative">
                  <span className="absolute left-md top-1/2 -translate-y-1/2 text-neutral-400 text-sm">£</span>
                  <input
                    type="number"
                    min={0}
                    value={epcCost}
                    onChange={e => setEpcCost(Number(e.target.value))}
                    className={`${inp} pl-7`}
                  />
                </div>
              </div>
              {agreementType === 'hmo' && (
                <div>
                  <label className={label}>Working float</label>
                  <div className="relative">
                    <span className="absolute left-md top-1/2 -translate-y-1/2 text-neutral-400 text-sm">£</span>
                    <input
                      type="number"
                      min={0}
                      value={floatAmount}
                      onChange={e => setFloatAmount(Number(e.target.value))}
                      className={`${inp} pl-7`}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Optional notes ──────────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-lg">
            <h2 className="text-sm font-bold text-neutral-900 mb-md">Inventory Note <span className="text-neutral-400 font-normal">(optional)</span></h2>
            <textarea
              value={inventoryNote}
              onChange={e => setInventoryNote(e.target.value)}
              rows={2}
              placeholder="Leave blank to use the standard clause, or enter custom inventory wording…"
              className={inp}
            />
          </div>

          {/* ── Error / success ─────────────────────────────────────────────── */}
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-md py-sm text-sm text-red-700">
              ⚠ {error}
            </div>
          )}
          {success && (
            <div className="rounded-xl bg-green-50 border border-green-200 px-md py-sm text-sm text-green-700">
              ✓ Agreement generated and downloaded. Send via Adobe Sign or email to the client.
            </div>
          )}

          {/* ── Generate button ─────────────────────────────────────────────── */}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full rounded-2xl bg-neutral-900 text-white py-md text-base font-bold hover:bg-neutral-700 transition disabled:opacity-40"
          >
            {generating ? 'Generating PDF…' : '⬇ Generate Management Agreement PDF'}
          </button>

          {onboardingId && success && (
            <div className="rounded-xl bg-blue-50 border border-blue-200 px-md py-sm text-sm text-blue-700">
              <p className="font-semibold mb-xs">Next step</p>
              <p>Upload the signed PDF to Adobe Sign and send to the landlord. Once sent, return to the onboarding pipeline and mark the agreement as sent to advance to Stage 5.</p>
              <a
                href="/admin/new-business/onboarding"
                className="mt-sm inline-block text-xs font-bold text-blue-700 underline hover:no-underline"
              >
                ← Back to Onboarding Pipeline
              </a>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

// ── Exported page (wraps in Suspense for useSearchParams) ─────────────────────

export default function ManagementAgreementPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton href="/admin/new-business" />} />
        <main className="mx-auto max-w-6xl px-lg py-xl">
          <p className="text-sm text-neutral-400 text-center py-xl">Loading…</p>
        </main>
      </div>
    }>
      <ManagementAgreementForm />
    </Suspense>
  )
}
