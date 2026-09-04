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
      }),
    })
    const data = await res.json()

    if (res.status === 409) {
      updateCard(cardId, { status: 'duplicate', error: data.error })
    } else if (!res.ok) {
      updateCard(cardId, { status: 'error', error: data.error || 'Import failed' })
    } else {
      updateCard(cardId, { status: 'imported', statementId: data.statement_id })
    }
  }

  const readyCount  = cards.filter(c => c.status === 'ready').length
  const importedCount = cards.filter(c => c.status === 'imported').length

  if (!authOk) return null

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton />} />

      <main className="mx-auto max-w-4xl px-lg py-2xl">
        {/* Header */}
        <div className="mb-2xl">
          <h1 className="text-2xl font-bold text-neutral-900">Statement Import</h1>
          <p className="text-sm text-neutral-500 mt-xs">
            Drop PDF statements — AI reads each one and prepares it for review before importing.
          </p>
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
              {readyCount} ready
            </p>
            {readyCount > 1 && (
              <button
                onClick={() => cards.filter(c => c.status === 'ready').forEach(c => importCard(c.id))}
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
}: {
  card: StatementCard
  onPropertyChange: (id: string) => void
  onToggleExpand: () => void
  onImport: () => void
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
        </div>
        <a
          href="/admin/properties"
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
        {/* AI confidence */}
        {s.confidence < 0.6 && (
          <p className="text-xs text-amber-600 mt-sm">
            ⚠️ Low AI confidence ({Math.round(s.confidence * 100)}%) — please verify the figures before importing.
          </p>
        )}
      </div>

      {/* Metric row */}
      <div className="grid grid-cols-4 divide-x divide-neutral-100 border-b border-neutral-100">
        {[
          { label: 'Gross Rent',  value: fmt(s.gross_rent) },
          { label: 'Mgmt Fees',   value: fmt(s.management_fees) },
          { label: 'Expenses',    value: fmt(totalExpenses) },
          { label: 'Net',         value: fmt(s.net_to_landlord), bold: true },
        ].map(m => (
          <div key={m.label} className="px-md py-sm text-center">
            <p className="text-xs text-neutral-400 mb-xs">{m.label}</p>
            <p className={`text-base ${m.bold ? 'font-bold text-neutral-900' : 'font-semibold text-neutral-700'}`}>
              {m.value}
            </p>
          </div>
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
          disabled={!selectedPropertyId || status === 'importing'}
          className={`shrink-0 text-sm font-semibold px-lg py-sm rounded-lg transition-colors ${
            !selectedPropertyId
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
