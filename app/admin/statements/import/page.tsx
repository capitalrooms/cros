'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { categoryLabel, categoryEmoji } from '@/lib/expense-categories'
import type { ExtractedStatement } from '@/lib/ai-statement'

interface Property { id: string; name: string; address: string; landlord_id: string }

type CardStatus = 'processing' | 'ready' | 'importing' | 'imported' | 'error' | 'duplicate'

interface StatementCard {
  id: string             // local key
  fileName: string
  status: CardStatus
  extracted?: ExtractedStatement
  matchedProperty?: Property | null
  selectedPropertyId: string
  properties: Property[]
  error?: string
  statementId?: string   // after import
  expanded: boolean      // expenses accordion
  rentRoll?: Record<string, number>   // property → rent from its tenancies at the statement date
  alreadyThisMonth?: string[]         // properties that already have a statement that month
  confirmed: boolean                  // admin has checked the flagged figures
}

const monthOf = (d?: string) => (/^\d{4}-\d{2}/.test(d || '') ? String(d).slice(0, 7) : '')
const monthName = (m: string) => m ? new Date(m + '-15T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : ''

/** Sense checks that catch a misread before it's saved (e.g. a whole year read as one month). */
function checksFor(card: StatementCard, batchMonth: string): string[] {
  const s = card.extracted
  if (!s) return []
  const out: string[] = []
  const prop = card.properties.find(p => p.id === card.selectedPropertyId)
  if (!card.selectedPropertyId) out.push('Choose which property this statement is for.')
  else if (!prop?.landlord_id) out.push('This property has no landlord set — add one on the property first.')
  const expenses = s.property_charges || (s.expenses?.reduce((t, e) => t + e.amount, 0) ?? 0)
  const worked = Math.round((s.gross_rent - s.management_fees - expenses) * 100) / 100
  if (Math.abs(worked - s.net_to_landlord) > 1) out.push(`The figures don’t add up: rent £${s.gross_rent.toFixed(2)} − fees £${s.management_fees.toFixed(2)} − expenses £${expenses.toFixed(2)} = £${worked.toFixed(2)}, but the statement says £${s.net_to_landlord.toFixed(2)} to the landlord.`)
  const m = monthOf(s.statement_date)
  if (!m) out.push('No statement date was read.')
  else {
    if (batchMonth && m !== batchMonth) out.push(`Dated ${monthName(m)} — the others in this batch are ${monthName(batchMonth)}.`)
    if (m < '2025-04') out.push(`Dated ${monthName(m)}, which is before the statements you’re adding.`)
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s.period_start || '') && /^\d{4}-\d{2}-\d{2}/.test(s.period_end || '')) {
    const days = (Date.parse(s.period_end) - Date.parse(s.period_start)) / 86_400_000
    if (days > 45) out.push(`Covers ${Math.round(days)} days — more than one month. Check it isn’t an annual or multi-month summary.`)
  }
  const roll = card.selectedPropertyId ? card.rentRoll?.[card.selectedPropertyId] ?? 0 : 0
  if (card.selectedPropertyId && roll > 0 && s.gross_rent > roll * 1.5 + 200) out.push(`Rent of £${s.gross_rent.toFixed(2)} is much more than this property’s tenancies add up to (about £${roll.toFixed(2)} a month).`)
  if (card.selectedPropertyId && card.alreadyThisMonth?.includes(card.selectedPropertyId)) out.push(`This property already has a statement for ${monthName(m)}.`)
  if (s.confidence < 0.6) out.push(`The AI wasn’t sure when reading this one (${Math.round(s.confidence * 100)}%).`)
  return out
}

function fmt(n: number) {
  return n == null ? '—' : `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtDate(s: string) {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) }
  catch { return s }
}

export default function StatementImportPage() {
  const router = useRouter()
  const [authOk, setAuthOk] = useState(false)
  const [cards, setCards] = useState<StatementCard[]>([])
  const [dragOver, setDragOver] = useState(false)
  // 10ninety still pays the landlords, so what's uploaded is a record of payments already made
  const [paidOutside, setPaidOutside] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getCurrentUser().then(d => {
      if (!d || (d.assignment?.role !== 'administrator' && d.assignment?.role !== 'admin')) {
        router.push('/login')
      } else {
        setAuthOk(true)
      }
    })
  }, [router])

  function updateCard(id: string, patch: Partial<StatementCard>) {
    setCards(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
  }

  async function processFile(file: File) {
    const cardId = `${Date.now()}-${Math.random()}`
    const newCard: StatementCard = {
      id: cardId,
      fileName: file.name,
      status: 'processing',
      selectedPropertyId: '',
      properties: [],
      expanded: false,
      confirmed: false,
    }
    setCards(prev => [...prev, newCard])

    const fd = new FormData()
    fd.append('file', file)

    try {
      const res = await fetch('/api/statements/extract', { method: 'POST', body: fd })
      const data = await res.json()

      if (!res.ok) {
        updateCard(cardId, { status: 'error', error: data.error || 'Extraction failed' })
        return
      }

      updateCard(cardId, {
        status: 'ready',
        extracted: data.extracted,
        matchedProperty: data.matched_property,
        selectedPropertyId: data.matched_property?.id || '',
        properties: data.properties || [],
        rentRoll: data.rent_rolls || {},
        alreadyThisMonth: data.already_this_month || [],
      })
    } catch (err: any) {
      updateCard(cardId, { status: 'error', error: err.message || 'Network error' })
    }
  }

  function onFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    arr.forEach(f => processFile(f))
  }

  async function importCard(cardId: string) {
    const card = cards.find(c => c.id === cardId)
    if (!card?.extracted || !card.selectedPropertyId) return

    const prop = card.properties.find(p => p.id === card.selectedPropertyId)
    if (!prop?.landlord_id) return

    updateCard(cardId, { status: 'importing' })

    const res = await fetch('/api/statements/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        statement: card.extracted,
        property_id: card.selectedPropertyId,
        landlord_id: prop.landlord_id,
        paid_outside: paidOutside,
        allow_same_month: card.confirmed,
      }),
    })
    const data = await res.json()

    if (res.status === 409) {
      updateCard(cardId, { status: 'duplicate', error: data.error })
    } else if (!res.ok) {
      updateCard(cardId, { status: 'error', error: data.error || 'Import failed' })
    } else {
      updateCard(cardId, { status: 'imported', statementId: data.statement_id, error: data.warnings?.length ? data.warnings.join(' ') : undefined })
    }
  }

  // the month most of the batch is for — anything else is flagged
  const months = cards.map(c => monthOf(c.extracted?.statement_date)).filter(Boolean)
  const batchMonth = months.length > 1 ? [...new Set(months)].sort((a, b) => months.filter(x => x === b).length - months.filter(x => x === a).length)[0] : ''
  const canImport = (c: StatementCard) => c.status === 'ready' && !!c.selectedPropertyId && (checksFor(c, batchMonth).length === 0 || c.confirmed)
    && !!c.properties.find(p => p.id === c.selectedPropertyId)?.landlord_id
  const readyCount  = cards.filter(canImport).length
  const flaggedCount = cards.filter(c => c.status === 'ready' && !canImport(c)).length
  const importedCount = cards.filter(c => c.status === 'imported').length

  if (!authOk) return null

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin/statements" />} />

      <main className="mx-auto max-w-6xl px-lg py-xl">
        {/* Header */}
        <div className="mb-2xl">
          <h1 className="text-2xl font-bold text-neutral-900">Upload a month of statements</h1>
          <p className="text-sm text-neutral-500 mt-xs">
            Drop all of a month’s PDF statements at once — one per property. Each is read, matched to its property and
            checked; anything that doesn’t look right is held back for you to check before it’s saved.
          </p>
          <label className="mt-md flex items-start gap-sm rounded-xl bg-white p-md text-sm text-neutral-700 cursor-pointer">
            <input type="checkbox" checked={paidOutside} onChange={e => setPaidOutside(e.target.checked)} className="mt-[3px]" />
            <span><strong>Already paid to the landlords (by 10ninety).</strong> Recorded as paid on each statement’s date, so they never show as owed on Payouts. Untick only for statements CROS will pay.</span>
          </label>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files) }}
          onClick={() => inputRef.current?.click()}
          className={`rounded-2xl border-2 border-dashed cursor-pointer transition-colors mb-2xl ${
            dragOver
              ? 'border-neutral-900 bg-neutral-900/5'
              : 'border-neutral-300 bg-white hover:border-neutral-400'
          }`}
        >
          <div className="flex flex-col items-center justify-center py-3xl px-lg text-center">
            <span className="text-4xl mb-md">📄</span>
            <p className="font-semibold text-neutral-700">Drop PDF statements here</p>
            <p className="text-sm text-neutral-400 mt-xs">or click to browse — multiple files supported</p>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={e => { if (e.target.files) { onFiles(e.target.files); e.target.value = '' } }}
          />
        </div>

        {/* Summary bar */}
        {cards.length > 0 && (
          <div className="flex items-center justify-between mb-lg">
            <p className="text-sm text-neutral-500">
              {cards.length} file{cards.length !== 1 ? 's' : ''} ·{' '}
              {importedCount} imported ·{' '}
              {readyCount} ready{flaggedCount ? ` · ${flaggedCount} to check` : ''}
            </p>
            {readyCount > 0 && (
              <button
                onClick={() => cards.filter(canImport).forEach(c => importCard(c.id))}
                className="text-sm font-semibold bg-neutral-900 text-white px-md py-sm rounded-lg hover:bg-neutral-800 transition-colors"
              >
                Import all {readyCount} →
              </button>
            )}
          </div>
        )}

        {/* Cards */}
        <div className="space-y-md">
          {cards.map(card => (
            <StatementCardUI
              key={card.id}
              card={card}
              onPropertyChange={pid => updateCard(card.id, { selectedPropertyId: pid })}
              onToggleExpand={() => updateCard(card.id, { expanded: !card.expanded })}
              onImport={() => importCard(card.id)}
              checks={checksFor(card, batchMonth)}
              onConfirm={v => updateCard(card.id, { confirmed: v })}
              onEdit={patch => updateCard(card.id, { extracted: { ...card.extracted!, ...patch } })}
              canImport={canImport(card)}
            />
          ))}
        </div>
      </main>
    </div>
  )
}

// ── Individual statement card ─────────────────────────────────────────────────

function StatementCardUI({
  card,
  onPropertyChange,
  onToggleExpand,
  onImport,
  checks,
  onConfirm,
  onEdit,
  canImport,
}: {
  card: StatementCard
  onPropertyChange: (id: string) => void
  onToggleExpand: () => void
  onImport: () => void
  checks: string[]
  onConfirm: (v: boolean) => void
  onEdit: (patch: Partial<ExtractedStatement>) => void
  canImport: boolean
}) {
  const { status, fileName, extracted: s, properties, selectedPropertyId, error, expanded } = card

  // ── Processing ──
  if (status === 'processing') {
    return (
      <div className="rounded-2xl bg-white border border-neutral-200 px-lg py-md flex items-center gap-md">
        <div className="w-5 h-5 border-2 border-neutral-300 border-t-neutral-900 rounded-full animate-spin shrink-0" />
        <div>
          <p className="text-sm font-semibold text-neutral-700">Reading PDF…</p>
          <p className="text-xs text-neutral-400">{fileName}</p>
        </div>
      </div>
    )
  }

  // ── Error ──
  if (status === 'error') {
    return (
      <div className="rounded-2xl bg-red-50 border border-red-200 px-lg py-md">
        <p className="text-sm font-semibold text-red-700">❌ {error}</p>
        <p className="text-xs text-red-400 mt-xs">{fileName}</p>
      </div>
    )
  }

  // ── Duplicate ──
  if (status === 'duplicate') {
    return (
      <div className="rounded-2xl bg-amber-50 border border-amber-200 px-lg py-md">
        <p className="text-sm font-semibold text-amber-700">⚠️ Already imported</p>
        <p className="text-xs text-amber-500 mt-xs">{error}</p>
      </div>
    )
  }

  // ── Imported ──
  if (status === 'imported') {
    const prop = properties.find(p => p.id === selectedPropertyId)
    return (
      <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-lg py-md flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-emerald-700">
            ✅ Imported — {s?.statement_reference} · {fmtDate(s?.statement_date || '')}
          </p>
          <p className="text-xs text-emerald-500">{prop?.name || prop?.address || fileName}</p>
          {error && <p className="text-xs font-semibold text-amber-700 mt-xs">⚠ {error}</p>}
        </div>
        <a
          href="/admin/statements"
          className="text-xs font-semibold text-emerald-600 hover:underline shrink-0 ml-lg"
        >
          View →
        </a>
      </div>
    )
  }

  if (!s) return null

  // ── Ready / importing ──
  const prop = properties.find(p => p.id === selectedPropertyId)
  const totalExpenses = s.expenses?.reduce((t, e) => t + e.amount, 0) ?? 0

  return (
    <div className="rounded-2xl bg-white border border-neutral-200 overflow-hidden">
      {/* Top row — property selector */}
      <div className="px-lg pt-lg pb-md border-b border-neutral-100">
        <div className="flex flex-wrap items-start gap-md">
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-bold uppercase tracking-widest text-neutral-400 mb-xs">
              Property
            </label>
            <select
              value={selectedPropertyId}
              onChange={e => onPropertyChange(e.target.value)}
              className="w-full text-sm font-semibold text-neutral-900 bg-neutral-50 border border-neutral-200 rounded-lg px-sm py-xs appearance-none"
            >
              {!selectedPropertyId && <option value="">— Select property —</option>}
              {properties.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name && p.name !== p.address ? `${p.name} — ${p.address}` : (p.address || p.name)}
                </option>
              ))}
            </select>
          </div>
          <div className="shrink-0">
            <label className="block text-xs font-bold uppercase tracking-widest text-neutral-400 mb-xs">
              Reference
            </label>
            <p className="text-sm font-mono text-neutral-700">{s.statement_reference || '—'}</p>
          </div>
          <div className="shrink-0">
            <label className="block text-xs font-bold uppercase tracking-widest text-neutral-400 mb-xs">
              Period
            </label>
            <p className="text-sm font-semibold text-neutral-700">{fmtDate(s.statement_date)}</p>
          </div>
        </div>
        {/* Sense checks — held back until checked */}
        {checks.length > 0 && (
          <div className="mt-sm rounded-lg bg-amber-50 border border-amber-200 px-md py-sm">
            <ul className="list-disc pl-md text-xs text-amber-800 space-y-xs">{checks.map((c, i) => <li key={i}>{c}</li>)}</ul>
            {card.selectedPropertyId && card.properties.find(p => p.id === card.selectedPropertyId)?.landlord_id && (
              <label className="mt-sm flex items-center gap-xs text-xs font-semibold text-amber-900 cursor-pointer">
                <input type="checkbox" checked={card.confirmed} onChange={e => onConfirm(e.target.checked)} />
                I’ve checked this against the PDF and it’s right
              </label>
            )}
          </div>
        )}
      </div>

      {/* Metric row — figures can be corrected before importing */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-neutral-100 border-b border-neutral-100">
        {([
          { label: 'Gross rent', key: 'gross_rent', value: s.gross_rent },
          { label: 'Mgmt fees', key: 'management_fees', value: s.management_fees },
          { label: 'Expenses', key: 'property_charges', value: s.property_charges || totalExpenses },
          { label: 'Net to landlord', key: 'net_to_landlord', value: s.net_to_landlord, bold: true },
        ] as const).map(m => (
          <label key={m.label} className="px-md py-sm text-center">
            <span className="block text-xs text-neutral-400 mb-xs">{m.label}</span>
            <span className="flex items-center justify-center gap-[2px]">
              <span className="text-neutral-400">£</span>
              <input type="number" step="0.01" inputMode="decimal" value={Number(m.value || 0)}
                disabled={status !== 'ready'}
                onChange={e => onEdit({ [m.key]: Number(e.target.value) } as Partial<ExtractedStatement>)}
                className={`w-28 bg-transparent text-center text-base tabular-nums rounded border border-transparent hover:border-neutral-200 focus:border-neutral-400 focus:outline-none ${'bold' in m ? 'font-bold text-neutral-900' : 'font-semibold text-neutral-700'}`} />
            </span>
          </label>
        ))}
      </div>

      {/* Expenses accordion */}
      {s.expenses && s.expenses.length > 0 && (
        <div className="border-b border-neutral-100">
          <button
            onClick={onToggleExpand}
            className="w-full flex items-center justify-between px-lg py-sm text-left hover:bg-neutral-50 transition-colors"
          >
            <span className="text-sm font-semibold text-neutral-700">
              {s.expenses.length} expense{s.expenses.length !== 1 ? 's' : ''} deducted
            </span>
            <span className="text-neutral-400">{expanded ? '▲' : '▼'}</span>
          </button>

          {expanded && (
            <div className="px-lg pb-md space-y-xs">
              {s.expenses.map((e, i) => (
                <div key={i} className="flex items-center justify-between text-sm py-xs border-b border-neutral-50 last:border-0">
                  <div className="flex items-center gap-sm min-w-0">
                    <span className="text-base leading-none shrink-0">{categoryEmoji(e.category)}</span>
                    <div className="min-w-0">
                      <p className="text-neutral-700 truncate">{e.description}</p>
                      <p className="text-xs text-neutral-400">
                        {categoryLabel(e.category)}{e.room_label ? ` · ${e.room_label}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-neutral-700 shrink-0 ml-md">{fmt(e.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Rooms */}
      {s.rooms && s.rooms.length > 0 && (
        <div className="px-lg py-sm border-b border-neutral-100">
          <p className="text-xs text-neutral-400 mb-xs">{s.rooms.length} rooms on this statement</p>
          <div className="flex flex-wrap gap-xs">
            {s.rooms.map((r, i) => (
              <span key={i} className="text-xs bg-neutral-100 text-neutral-600 px-sm py-xs rounded-full">
                Room {r.room_number} · {r.tenant_name} · {fmt(r.rent_income)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* AI summary + import button */}
      <div className="px-lg py-md flex items-center justify-between gap-md">
        <p className="text-xs text-neutral-400 truncate">{s.summary}</p>
        <button
          onClick={onImport}
          disabled={!canImport || status === 'importing'}
          className={`shrink-0 text-sm font-semibold px-lg py-sm rounded-lg transition-colors ${
            !canImport && status !== 'importing'
              ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
              : status === 'importing'
              ? 'bg-neutral-300 text-neutral-500 cursor-wait'
              : 'bg-neutral-900 text-white hover:bg-neutral-800'
          }`}
        >
          {status === 'importing' ? 'Importing…' : 'Import'}
        </button>
      </div>
    </div>
  )
}
