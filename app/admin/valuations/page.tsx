'use client'
import { displayName } from '@/lib/people'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { ValuationData, ValuationType, PriceRow, RefurbItem } from '@/lib/valuations/ValuationDocument'

// ─── Constants ────────────────────────────────────────────────────────────────

const VALUATION_TYPES: { value: ValuationType; label: string; desc: string }[] = [
  {
    value: 'single_let_current',
    label: 'Single Let — Current Condition',
    desc: 'Whole-property Low / Average / Top rent estimate in current condition',
  },
  {
    value: 'single_let_improvements',
    label: 'Single Let — With Improvements',
    desc: 'Current estimate plus suggested works, refurb scope and cost breakdown',
  },
  {
    value: 'hmo_current',
    label: 'HMO — Current Condition',
    desc: 'Per-room Low / Average / Top rents with whole-property income total',
  },
  {
    value: 'hmo_improvements',
    label: 'HMO — With Improvements',
    desc: 'Per-room rents plus suggested works, refurb scope and cost breakdown',
  },
]

const REFURB_TIERS = [
  { value: 'light', label: 'Cosmetic Refurbishment', desc: 'Repair and redecoration of existing fabric and finishes' },
  { value: 'selective', label: 'Selective Refurbishment', desc: 'Targeted upgrades to specific areas or rooms' },
  { value: 'extensive', label: 'Full Renovation', desc: 'Comprehensive refurbishment and renewal throughout' },
]

const REFURB_CATEGORIES = [
  'Decorating', 'Flooring', 'Kitchen', 'Bathroom',
  'Electrics', 'Plumbing', 'Windows', 'Furniture', 'Other',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pcm(n: number) {
  return n > 0 ? `£${n.toLocaleString('en-GB')} pcm` : '—'
}

function blankRoom(label = ''): PriceRow {
  return { label, low: 0, high: 0, notes: '' }
}

function blankRefurb(): RefurbItem {
  return { category: 'Decorating', description: '', estimatedCost: 0 }
}

function defaultOpening(type: ValuationType, address: string) {
  const map: Record<ValuationType, string> = {
    single_let_current: `Thank you for asking Capital Rooms to prepare this rental valuation for ${address}. The figures below reflect our assessment of the achievable rent if the property were let to a single household in its current condition.`,
    single_let_improvements: `Thank you for asking Capital Rooms to prepare this rental valuation for ${address}. The report sets out both our current market assessment and our view of the uplift achievable following the suggested programme of improvements.`,
    hmo_current: `Thank you for asking Capital Rooms to prepare this rental valuation for ${address}. Based on our current knowledge of the local market, comparable lettings evidence, and the property's specification, we set out below our assessment of the achievable room rents.`,
    hmo_improvements: `Thank you for asking Capital Rooms to prepare this rental valuation for ${address}. The figures below reflect our assessment of achievable room rents following the proposed works, together with an indicative cost breakdown for the refurbishment programme.`,
  }
  return map[type]
}

function defaultClosing(type: ValuationType) {
  const map: Record<ValuationType, string> = {
    single_let_current: `We hope this valuation is helpful. Capital Rooms would be delighted to manage the letting of this property and can provide a full management proposal on request.`,
    single_let_improvements: `We hope this report assists your planning decisions. Capital Rooms would be delighted to discuss the letting strategy in more detail and can recommend trusted contractors should you wish to proceed with any of the suggested works.`,
    hmo_current: `We hope this valuation is helpful. Should you wish to discuss any aspect of the report, or would like Capital Rooms to manage the letting of this property, please do not hesitate to get in touch.`,
    hmo_improvements: `We hope this report assists your planning decisions. Capital Rooms would be delighted to discuss the letting strategy for the property once the works are complete, and can recommend trusted contractors if required.`,
  }
  return map[type]
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ValuationsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [properties, setProperties] = useState<any[]>([])
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const [step, setStep] = useState<'form' | 'preview'>('form')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [history, setHistory] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // ── Form state ──
  const [valType, setValType] = useState<ValuationType>('hmo_current')
  const [propertyId, setPropertyId] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [recipientAddress, setRecipientAddress] = useState('')
  const [propertyAddress, setPropertyAddress] = useState('')
  const [propertyRef, setPropertyRef] = useState('')
  const [preparedBy, setPreparedBy] = useState('')
  const [letterDate, setLetterDate] = useState('')
  const [opening, setOpening] = useState('')
  const [closing, setClosing] = useState('')
  const [rooms, setRooms] = useState<PriceRow[]>([blankRoom('Room 1')])
  // Refurb
  const [refurbTier, setRefurbTier] = useState<'light' | 'selective' | 'extensive'>('light')
  const [refurbItems, setRefurbItems] = useState<RefurbItem[]>([blankRefurb()])
  const [refurbNotes, setRefurbNotes] = useState('')
  // Single let
  const [slLow, setSlLow] = useState(0)
  const [slHigh, setSlHigh] = useState(0)
  async function fetchHistory() {
    setHistoryLoading(true)
    try {
      const res = await fetch('/api/valuations/history')
      if (res.ok) {
        const j = await res.json()
        setHistory(j.rows ?? [])
      }
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser()
      if (!user || !['administrator', 'admin'].includes(user.assignment?.role ?? '')) {
        router.push('/login')
        return
      }
      const supabase = createClient()
      const { data } = await supabase.from('properties').select('id, name, address').order('name')
      setProperties(data ?? [])
      setPreparedBy(displayName(user.person) ?? '')
      setLoading(false)
      fetchHistory()
    }
    init()
  }, [router]) // eslint-disable-line react-hooks/exhaustive-deps

  // When type changes, refresh default opening/closing (only if address already known)
  useEffect(() => {
    if (propertyAddress) {
      setOpening(defaultOpening(valType, propertyAddress))
    }
    setClosing(defaultClosing(valType))
  }, [valType, propertyAddress]) // eslint-disable-line react-hooks/exhaustive-deps

  // When property selected, auto-fill address
  function handlePropertyChange(id: string) {
    setPropertyId(id)
    const prop = properties.find(p => p.id === id)
    if (prop) {
      const addr = prop.address ?? prop.name
      setPropertyAddress(addr)
      setOpening(defaultOpening(valType, addr))
    }
  }

  // ── Room helpers ──
  function updateRoom(i: number, field: keyof PriceRow, value: string | number) {
    setRooms(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }
  function addRoom() {
    setRooms(prev => [...prev, blankRoom(`Room ${prev.length + 1}`)])
  }
  function removeRoom(i: number) {
    setRooms(prev => prev.filter((_, idx) => idx !== i))
  }

  // ── Refurb helpers ──
  function updateRefurb(i: number, field: keyof RefurbItem, value: string | number) {
    setRefurbItems(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }
  function addRefurb() {
    setRefurbItems(prev => [...prev, blankRefurb()])
  }
  function removeRefurb(i: number) {
    setRefurbItems(prev => prev.filter((_, idx) => idx !== i))
  }

  // ── Build payload ──
  const isHmo = valType === 'hmo_current' || valType === 'hmo_improvements'
  const isSingleLet = valType === 'single_let_current' || valType === 'single_let_improvements'
  const hasImprovements = valType === 'hmo_improvements' || valType === 'single_let_improvements'

  function buildPayload(): ValuationData {
    return {
      type: valType,
      recipientName,
      recipientAddress: recipientAddress.split('\n').map(l => l.trim()).filter(Boolean),
      propertyAddress,
      propertyRef,
      openingParagraph: opening,
      closingParagraph: closing,
      rooms: isHmo ? rooms : [],
      refurbTier: hasImprovements ? refurbTier : undefined,
      refurbItems: hasImprovements ? refurbItems : undefined,
      refurbNotes: hasImprovements ? refurbNotes : undefined,
      singleLetLow: isSingleLet ? slLow : undefined,
      singleLetHigh: isSingleLet ? slHigh : undefined,
      disclaimer: valType === 'single_let_current'
        ? 'These figures are estimates only, based on current market conditions and evidence available at the date of this letter. Actual achievable rents may vary, and estimates are subject to change based on market fluctuations, the condition of the property, and prevailing demand at the time of marketing.'
        : undefined,
      preparedBy,
      letterDate: letterDate || undefined,
    }
  }

  // ── Generate preview ──
  async function handlePreview() {
    setGenerating(true)
    setGenError('')
    try {
      const res = await fetch('/api/valuations/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `Server error ${res.status}`)
      }
      const blob = await res.blob()
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(URL.createObjectURL(blob))
      setStep('preview')
      fetchHistory()  // refresh the log after generation
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  // ── Download ──
  async function handleDownload() {
    setGenerating(true)
    setGenError('')
    try {
      const res = await fetch('/api/valuations/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `Server error ${res.status}`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Capital-Rooms-Valuation-${propertyAddress.replace(/[^a-z0-9]/gi, '-').slice(0, 40)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Download failed')
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton href="/admin/new-business" />} />
        <p className="p-xl text-sm text-neutral-400">Loading…</p>
      </div>
    )
  }

  // ── Input styling helpers ──
  const inp = 'w-full rounded-xl border border-neutral-200 bg-white px-md py-sm text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900'
  const numInp = 'w-full rounded-lg border border-neutral-200 bg-white px-sm py-xs text-sm text-neutral-900 text-right focus:outline-none focus:ring-2 focus:ring-neutral-900 tabular-nums'
  const label = 'block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs'

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin/new-business" />} />

      <main className="mx-auto max-w-4xl px-lg py-lg">
        <div className="mb-2xl">
          <h1 className="text-3xl font-bold text-neutral-900">📄 Rental Valuation Letter</h1>
          <p className="mt-sm text-sm text-neutral-500">
            Generate a Capital Rooms branded valuation letter. Fill in the form, preview, then export as PDF.
          </p>
        </div>

        {/* Step tabs */}
        <div className="flex gap-xs mb-2xl">
          {(['form', 'preview'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStep(s)}
              disabled={s === 'preview' && !previewUrl}
              className={`rounded-xl px-lg py-sm text-sm font-semibold transition ${
                step === s
                  ? 'bg-neutral-900 text-white'
                  : 'bg-white text-neutral-500 border border-neutral-200 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed'
              }`}
            >
              {s === 'form' ? '1 · Form' : '2 · Preview & Export'}
            </button>
          ))}
        </div>

        {/* ═══════════════ STEP 1: FORM ═══════════════ */}
        {step === 'form' && (
          <div className="space-y-lg">

            {/* Valuation type */}
            <div className="rounded-2xl border border-neutral-200 bg-white p-xl">
              <h2 className="text-base font-bold text-neutral-900 mb-lg">Valuation Type</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
                {VALUATION_TYPES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setValType(t.value)}
                    className={`text-left rounded-xl border-2 p-md transition ${
                      valType === t.value
                        ? 'border-neutral-900 bg-neutral-50'
                        : 'border-neutral-200 hover:border-neutral-400'
                    }`}
                  >
                    <p className="text-sm font-bold text-neutral-900">{t.label}</p>
                    <p className="text-xs text-neutral-500 mt-xs">{t.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Property + recipient */}
            <div className="rounded-2xl border border-neutral-200 bg-white p-xl">
              <h2 className="text-base font-bold text-neutral-900 mb-lg">Property & Recipient</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-lg">
                <div>
                  <label className={label}>Property</label>
                  <select value={propertyId} onChange={e => handlePropertyChange(e.target.value)} className={inp}>
                    <option value="">— Select property —</option>
                    {properties.map(p => (
                      <option key={p.id} value={p.id}>{p.name} — {p.address}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={label}>Property address (on letter)</label>
                  <input value={propertyAddress} onChange={e => setPropertyAddress(e.target.value)} className={inp} placeholder="e.g. 4 Willis Road, Coventry, CV1 4GG" />
                </div>
                <div>
                  <label className={label}>Property reference (optional)</label>
                  <input value={propertyRef} onChange={e => setPropertyRef(e.target.value)} className={inp} placeholder="e.g. CR-001" />
                </div>
                <div>
                  <label className={label}>Letter date (blank = today)</label>
                  <input type="date" value={letterDate} onChange={e => setLetterDate(e.target.value)} className={inp} />
                </div>
                <div>
                  <label className={label}>Recipient name</label>
                  <input value={recipientName} onChange={e => setRecipientName(e.target.value)} className={inp} placeholder="e.g. Mr J Smith" />
                </div>
                <div>
                  <label className={label}>Recipient address (one line per line)</label>
                  <textarea value={recipientAddress} onChange={e => setRecipientAddress(e.target.value)} rows={3} className={inp} placeholder={'23 Example Street\nBirmingham\nB1 1AA'} />
                </div>
                <div>
                  <label className={label}>Prepared by</label>
                  <input value={preparedBy} onChange={e => setPreparedBy(e.target.value)} className={inp} placeholder="e.g. Harry Smith" />
                </div>
              </div>
            </div>

            {/* Room pricing — HMO types only */}
            {isHmo && (
              <div className="rounded-2xl border border-neutral-200 bg-white p-xl">
                <div className="flex items-center justify-between mb-lg">
                  <h2 className="text-base font-bold text-neutral-900">Room Pricing</h2>
                  <button onClick={addRoom} className="text-sm font-semibold text-neutral-900 border border-neutral-300 rounded-lg px-md py-xs hover:bg-neutral-50">
                    + Add room
                  </button>
                </div>
                <div className="space-y-md">
                  {/* Header */}
                  <div className="grid gap-xs items-center text-xs font-semibold text-neutral-400 uppercase tracking-wide px-sm" style={{ gridTemplateColumns: '2fr 1fr 1fr auto' }}>
                    <span>Room label</span><span className="text-right">Low pcm</span><span className="text-right">High pcm</span><span />
                  </div>
                  {rooms.map((r, i) => (
                    <div key={i} className="rounded-xl border border-neutral-100 bg-neutral-50 p-md space-y-sm">
                      <div className="grid gap-xs items-center" style={{ gridTemplateColumns: '2fr 1fr 1fr auto' }}>
                        <input
                          value={r.label}
                          onChange={e => updateRoom(i, 'label', e.target.value)}
                          className={inp}
                          placeholder={`Room ${i + 1}`}
                        />
                        <input type="number" min={0} value={r.low || ''} onChange={e => updateRoom(i, 'low', Number(e.target.value))} className={numInp} placeholder="0" />
                        <input type="number" min={0} value={r.high || ''} onChange={e => updateRoom(i, 'high', Number(e.target.value))} className={numInp} placeholder="0" />
                        <button onClick={() => removeRoom(i)} className="text-neutral-400 hover:text-red-500 transition text-lg leading-none px-xs" title="Remove">×</button>
                      </div>
                      <input
                        value={r.notes ?? ''}
                        onChange={e => updateRoom(i, 'notes', e.target.value)}
                        className="w-full rounded-lg border border-neutral-200 bg-white px-sm py-xs text-xs text-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                        placeholder="Optional note (e.g. ensuite, furnished)"
                      />
                    </div>
                  ))}
                  {rooms.length > 0 && (
                    <div className="flex justify-end gap-2xl text-xs text-neutral-500 px-sm pt-xs">
                      <span>Low total: <strong className="text-neutral-900">{pcm(rooms.reduce((a, r) => a + r.low, 0))}</strong></span>
                      <span>High total: <strong className="text-neutral-900">{pcm(rooms.reduce((a, r) => a + r.high, 0))}</strong></span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Improvements section — both HMO and single let with improvements */}
            {hasImprovements && (
              <div className="rounded-2xl border border-neutral-200 bg-white p-xl">
                <h2 className="text-base font-bold text-neutral-900 mb-lg">Refurbishment Details</h2>

                <div className="mb-lg">
                  <label className={label}>Refurbishment tier</label>
                  <div className="flex gap-md">
                    {REFURB_TIERS.map(t => (
                      <button
                        key={t.value}
                        onClick={() => setRefurbTier(t.value as any)}
                        className={`flex-1 rounded-xl border-2 py-sm text-sm font-semibold transition ${
                          refurbTier === t.value ? 'border-neutral-900 bg-neutral-50 text-neutral-900' : 'border-neutral-200 text-neutral-500 hover:border-neutral-400'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between mb-md">
                  <p className="text-sm font-semibold text-neutral-700">Cost breakdown</p>
                  <button onClick={addRefurb} className="text-sm font-semibold text-neutral-900 border border-neutral-300 rounded-lg px-md py-xs hover:bg-neutral-50">
                    + Add item
                  </button>
                </div>
                <div className="space-y-sm">
                  <div className="grid gap-xs text-xs font-semibold text-neutral-400 uppercase tracking-wide px-sm" style={{ gridTemplateColumns: '1.2fr 2fr 1fr auto' }}>
                    <span>Category</span><span>Description</span><span className="text-right">Cost (£)</span><span />
                  </div>
                  {refurbItems.map((item, i) => (
                    <div key={i} className="grid gap-xs items-center" style={{ gridTemplateColumns: '1.2fr 2fr 1fr auto' }}>
                      <select value={item.category} onChange={e => updateRefurb(i, 'category', e.target.value)} className={inp}>
                        {REFURB_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                      </select>
                      <input value={item.description} onChange={e => updateRefurb(i, 'description', e.target.value)} className={inp} placeholder="e.g. Full redecorate throughout" />
                      <input type="number" min={0} value={item.estimatedCost || ''} onChange={e => updateRefurb(i, 'estimatedCost', Number(e.target.value))} className={numInp} placeholder="0" />
                      <button onClick={() => removeRefurb(i)} className="text-neutral-400 hover:text-red-500 transition text-lg leading-none px-xs">×</button>
                    </div>
                  ))}
                  {refurbItems.length > 0 && (
                    <div className="text-right text-xs text-neutral-500 px-sm pt-xs">
                      Total: <strong className="text-neutral-900">£{refurbItems.reduce((a, i) => a + i.estimatedCost, 0).toLocaleString('en-GB')}</strong>
                    </div>
                  )}
                </div>

                <div className="mt-lg">
                  <label className={label}>Refurbishment notes (optional)</label>
                  <textarea value={refurbNotes} onChange={e => setRefurbNotes(e.target.value)} rows={2} className={inp} placeholder="e.g. All costings are indicative and based on current contractor rates…" />
                </div>
              </div>
            )}

            {/* Single let pricing */}
            {isSingleLet && (
              <div className="rounded-2xl border border-neutral-200 bg-white p-xl">
                <h2 className="text-base font-bold text-neutral-900 mb-lg">Single Let Estimate (pcm)</h2>
                <div className="grid grid-cols-2 gap-lg">
                  {[
                    ['Low', slLow, setSlLow],
                    ['High', slHigh, setSlHigh],
                  ].map(([lbl, val, set]) => (
                    <div key={lbl as string}>
                      <label className={label}>{lbl as string}</label>
                      <div className="relative">
                        <span className="absolute left-sm top-1/2 -translate-y-1/2 text-neutral-400 text-sm">£</span>
                        <input type="number" min={0} value={(val as number) || ''} onChange={e => (set as any)(Number(e.target.value))} className={numInp + ' pl-lg'} placeholder="0" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}


            {/* Letter text */}
            <div className="rounded-2xl border border-neutral-200 bg-white p-xl">
              <h2 className="text-base font-bold text-neutral-900 mb-lg">Letter Text</h2>
              <div className="space-y-lg">
                <div>
                  <label className={label}>Opening paragraph</label>
                  <textarea value={opening} onChange={e => setOpening(e.target.value)} rows={4} className={inp} />
                </div>
                <div>
                  <label className={label}>Closing paragraph</label>
                  <textarea value={closing} onChange={e => setClosing(e.target.value)} rows={3} className={inp} />
                </div>
              </div>
            </div>

            {/* Generate button */}
            {genError && (
              <div className="rounded-xl border-2 border-red-200 bg-red-50 p-md text-sm text-red-700">{genError}</div>
            )}
            <div className="flex justify-end gap-md">
              <button
                onClick={handlePreview}
                disabled={generating || !recipientName || !propertyAddress}
                className="rounded-2xl bg-neutral-900 text-white px-2xl py-md text-sm font-bold hover:bg-neutral-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {generating ? '⏳ Generating…' : '✨ Preview Letter'}
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════ STEP 2: PREVIEW ═══════════════ */}
        {step === 'preview' && previewUrl && (
          <div className="space-y-lg">
            <div className="flex items-center gap-md">
              <button onClick={() => setStep('form')} className="rounded-xl border border-neutral-300 bg-white px-lg py-sm text-sm font-semibold hover:bg-neutral-50">
                ← Edit
              </button>
              <button
                onClick={handleDownload}
                disabled={generating}
                className="rounded-xl bg-neutral-900 text-white px-xl py-sm text-sm font-bold hover:bg-neutral-700 transition disabled:opacity-40"
              >
                {generating ? '⏳ Downloading…' : '⬇ Export PDF'}
              </button>
              <button
                onClick={handlePreview}
                disabled={generating}
                className="rounded-xl border border-neutral-300 bg-white px-lg py-sm text-sm font-semibold hover:bg-neutral-50 disabled:opacity-40"
              >
                {generating ? '⏳' : '↻ Refresh'}
              </button>
              {genError && <span className="text-sm text-red-600">{genError}</span>}
            </div>
            <div className="rounded-2xl overflow-hidden border border-neutral-200 shadow-sm bg-white" style={{ height: '80vh' }}>
              <iframe src={previewUrl} className="w-full h-full" title="Valuation letter preview" />
            </div>
          </div>
        )}
        {/* ═══════════════ HISTORY LOG ═══════════════ */}
        <div className="mt-3xl">
          <div className="flex items-center justify-between mb-lg">
            <div>
              <h2 className="text-xl font-bold text-neutral-900">Previously Generated</h2>
              <p className="text-sm text-neutral-500 mt-xs">Every valuation letter produced — click to re-download.</p>
            </div>
            <button
              onClick={fetchHistory}
              disabled={historyLoading}
              className="rounded-xl border border-neutral-200 bg-white px-lg py-sm text-sm font-semibold text-neutral-600 hover:bg-neutral-50 disabled:opacity-40"
            >
              {historyLoading ? '…' : '↻ Refresh'}
            </button>
          </div>

          {historyLoading && history.length === 0 ? (
            <p className="text-sm text-neutral-400 py-lg">Loading history…</p>
          ) : history.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-2xl text-center">
              <p className="text-sm text-neutral-400">No valuations generated yet. They'll appear here once you create your first letter.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-100 bg-neutral-50">
                    <th className="px-lg py-md text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">Property</th>
                    <th className="px-lg py-md text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">Recipient</th>
                    <th className="px-lg py-md text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">Type</th>
                    <th className="px-lg py-md text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">Rooms</th>
                    <th className="px-lg py-md text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">Generated</th>
                    <th className="px-lg py-md text-right text-xs font-semibold text-neutral-500 uppercase tracking-wide">PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row, i) => {
                    const typeLabel: Record<string, string> = {
                      current_market: 'Market',
                      post_refurb: 'Post-Refurb',
                      single_let: 'Single Let',
                      investment_analysis: 'Investment',
                    }
                    const date = new Date(row.generated_at).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })
                    const time = new Date(row.generated_at).toLocaleTimeString('en-GB', {
                      hour: '2-digit', minute: '2-digit',
                    })
                    return (
                      <tr key={row.id} className={`border-b border-neutral-100 hover:bg-neutral-50 ${i % 2 === 1 ? 'bg-neutral-50/50' : ''}`}>
                        <td className="px-lg py-md font-medium text-neutral-900 max-w-[180px] truncate">{row.property_address}</td>
                        <td className="px-lg py-md text-neutral-600">{row.recipient_name}</td>
                        <td className="px-lg py-md">
                          <span className="inline-block rounded-full bg-neutral-100 px-sm py-xs text-xs font-medium text-neutral-700">
                            {typeLabel[row.type] ?? row.type}
                          </span>
                        </td>
                        <td className="px-lg py-md text-neutral-500">{row.room_count || '—'}</td>
                        <td className="px-lg py-md text-neutral-500 text-xs">{date} {time}</td>
                        <td className="px-lg py-md text-right">
                          {row.pdf_storage_path ? (
                            <a
                              href={`/api/valuations/history?id=${row.id}&download=1`}
                              className="inline-flex items-center gap-xs rounded-lg bg-neutral-900 px-md py-xs text-xs font-semibold text-white hover:bg-neutral-700 transition"
                            >
                              ⬇ Download
                            </a>
                          ) : (
                            <span className="text-xs text-neutral-400">No file</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
