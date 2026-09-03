'use client'

/**
 * FinancialsTab
 *
 * Admin property detail tab — shows every landlord_statements row for this
 * property, newest first, each collapsible to reveal its statement_line_items.
 *
 * Queries: landlord_statements + statement_line_items by property_id.
 * No new tables — all data already exists.
 *
 * Design: matches admin property page light theme (bg-neutral-100, white
 * cards, dark text) — same pattern as PurchasesTab.
 */

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Statement {
  id: string
  statement_reference: string
  statement_date: string
  period_start: string | null
  period_end: string | null
  gross_rent: number
  management_fees: number
  property_charges: number
  net_to_landlord: number
  paid_date: string | null
  landlord_id: string | null
  people?: { first_name: string | null; last_name: string | null; email: string } | null
}

interface LineItem {
  id: string
  description: string
  amount: number
  statement_date: string
  category: string | null
  category_type: string | null
  room_label: string | null
  ai_confidence: number | null
  admin_confirmed: boolean
}

interface FinancialsTabProps {
  propertyId: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const num = (v: any) => parseFloat(String(v || 0))
const gbp = (n: number) =>
  `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function periodLabel(stmt: Statement): string {
  const end = new Date(stmt.statement_date)
  if (!stmt.period_start) {
    return end.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  }
  const start = new Date(stmt.period_start)
  const fmtMY = (d: Date) => d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
  return fmtMY(start) === fmtMY(end) ? fmtMY(end) : `${fmtMY(start)} – ${fmtMY(end)}`
}

function issuedLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FinancialsTab({ propertyId }: FinancialsTabProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [statements, setStatements] = useState<Statement[]>([])
  const [lineItemsByStatement, setLineItemsByStatement] = useState<Record<string, LineItem[]>>({})
  const [expanded, setExpanded] = useState<string | null>(null)         // expanded statement id
  const [expandedCat, setExpandedCat] = useState<string | null>(null)   // expanded category key within a statement
  const [expandedExpKey, setExpandedExpKey] = useState<string | null>(null) // expanded expense sub-cat
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)

      const [{ data: stmtData, error: stmtErr }, { data: lineData, error: lineErr }] =
        await Promise.all([
          supabase
            .from('landlord_statements')
            .select('*, people:landlord_id(first_name, last_name, email)')
            .eq('property_id', propertyId)
            .order('statement_date', { ascending: false }),
          supabase
            .from('statement_line_items')
            .select('id, description, amount, statement_date, category, category_type, room_label, ai_confidence, admin_confirmed, statement_id')
            .eq('property_id', propertyId)
            .order('statement_date', { ascending: false }),
        ])

      if (stmtErr) { setError('Could not load statements.'); setLoading(false); return }

      setStatements(stmtData || [])

      // Group line items by statement_id
      const byStmt: Record<string, LineItem[]> = {}
      for (const item of (lineData || [])) {
        const key = (item as any).statement_id || '__none'
        if (!byStmt[key]) byStmt[key] = []
        byStmt[key].push(item as LineItem)
      }
      setLineItemsByStatement(byStmt)

      // Auto-expand the most recent statement
      if (stmtData && stmtData.length > 0) setExpanded(stmtData[0].id)

      setLoading(false)
    }
    load()
  }, [propertyId])

  // ── Summary totals across all statements ──────────────────────────────────

  const totals = statements.reduce(
    (acc, s) => ({
      gross: acc.gross + num(s.gross_rent),
      fees:  acc.fees  + num(s.management_fees),
      charges: acc.charges + num(s.property_charges),
      net:   acc.net   + num(s.net_to_landlord),
    }),
    { gross: 0, fees: 0, charges: 0, net: 0 }
  )

  // ── Render helpers ─────────────────────────────────────────────────────────

  // Render a flat list of line items (used inside expanded category groups)
  function renderItemList(items: LineItem[]) {
    const subtotal = items.reduce((s, i) => s + num(i.amount), 0)
    return (
      <div className="border-t border-neutral-100">
        {items.map((item, idx) => (
          <div
            key={item.id}
            className={`flex items-start justify-between px-lg py-sm ${idx < items.length - 1 ? 'border-b border-neutral-50' : ''}`}
          >
            <div className="flex-1 min-w-0 mr-md">
              <p className="text-sm text-neutral-800">{item.description}</p>
              <p className="text-xs text-neutral-400">
                {issuedLabel(item.statement_date)}
                {item.room_label ? ` · ${item.room_label}` : ''}
                {!item.admin_confirmed && item.ai_confidence != null && (
                  <span className="ml-xs text-amber-500">· AI ({Math.round(item.ai_confidence * 100)}%)</span>
                )}
              </p>
            </div>
            <span className="text-sm font-medium text-neutral-700 whitespace-nowrap tabular-nums">
              {gbp(num(item.amount))}
            </span>
          </div>
        ))}
        <div className="flex justify-between items-center px-lg py-sm bg-neutral-50 border-t border-neutral-100">
          <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Subtotal</span>
          <span className="text-sm font-bold text-neutral-900 tabular-nums">{gbp(subtotal)}</span>
        </div>
      </div>
    )
  }

  // Render the expanded interior of a single statement
  function renderStatementDetail(stmt: Statement) {
    const items = lineItemsByStatement[stmt.id] || []
    const AGENT_SLUGS = ['management_fee', 'letting_fee']
    const INCOME_SLUG = 'rent_income'

    const incomeItems  = items.filter(i => i.category === INCOME_SLUG)
    const mgmtItems    = items.filter(i => i.category === 'management_fee')
    const lettingItems = items.filter(i => i.category === 'letting_fee')
    const expenseItems = items.filter(i => !AGENT_SLUGS.includes(i.category || '') && i.category !== INCOME_SLUG)

    const hasLineItems = items.length > 0

    // Group expenses by category
    const expGroups: Record<string, { items: LineItem[]; total: number }> = {}
    for (const item of expenseItems) {
      const key = item.category || '__other'
      if (!expGroups[key]) expGroups[key] = { items: [], total: 0 }
      expGroups[key].items.push(item)
      expGroups[key].total += num(item.amount)
    }
    const expKeys = Object.keys(expGroups).sort((a, b) =>
      a === '__other' ? 1 : b === '__other' ? -1 : expGroups[b].total - expGroups[a].total
    )

    function AccordionSection({
      id, emoji, title, itemCount, total, children,
    }: { id: string; emoji: string; title: string; itemCount: number; total: number; children: React.ReactNode }) {
      const isOpen = expandedCat === id
      return (
        <div className="rounded-xl overflow-hidden border border-neutral-200 bg-white">
          <button
            className="flex items-center justify-between w-full px-lg py-md text-left hover:bg-neutral-50 transition-colors"
            onClick={() => setExpandedCat(isOpen ? null : id)}
          >
            <div className="flex items-center gap-sm">
              <span className="text-lg leading-none">{emoji}</span>
              <div>
                <p className="text-sm font-semibold text-neutral-900">{title}</p>
                <p className="text-xs text-neutral-400">{itemCount} line item{itemCount !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <div className="flex items-center gap-md">
              <span className="text-sm font-bold text-neutral-900 tabular-nums">{gbp(total)}</span>
              <span className="text-neutral-400 text-sm">{isOpen ? '▲' : '▼'}</span>
            </div>
          </button>
          {isOpen && children}
        </div>
      )
    }

    return (
      <div className="px-lg pb-lg pt-sm space-y-lg bg-neutral-50 border-t border-neutral-200">

        {/* Top-line summary row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-md pt-sm">
          {[
            { label: 'Gross Rent', value: num(stmt.gross_rent), colour: 'text-neutral-900' },
            { label: 'Mgmt Fees', value: num(stmt.management_fees), colour: 'text-red-600' },
            { label: 'Expenses', value: num(stmt.property_charges), colour: 'text-red-600' },
            { label: 'Net to Landlord', value: num(stmt.net_to_landlord), colour: 'text-green-700' },
          ].map(m => (
            <div key={m.label} className="bg-white rounded-xl border border-neutral-200 px-md py-sm">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">{m.label}</p>
              <p className={`text-lg font-bold mt-xs tabular-nums ${m.colour}`}>{gbp(m.value)}</p>
            </div>
          ))}
        </div>

        {stmt.paid_date && (
          <p className="text-xs text-green-700 font-semibold">
            ✓ Paid {issuedLabel(stmt.paid_date)}
          </p>
        )}

        {/* Line items — only rendered if we have them */}
        {hasLineItems && (
          <div className="space-y-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">Line Items</p>

            {/* Rent income */}
            {incomeItems.length > 0 && (
              <AccordionSection
                id={`${stmt.id}__income`}
                emoji="💷"
                title="Rent Received"
                itemCount={incomeItems.length}
                total={incomeItems.reduce((s, i) => s + num(i.amount), 0)}
              >
                {renderItemList(incomeItems)}
              </AccordionSection>
            )}

            {/* Management fees */}
            {mgmtItems.length > 0 && (
              <AccordionSection
                id={`${stmt.id}__mgmt`}
                emoji="💼"
                title="Management Fees"
                itemCount={mgmtItems.length}
                total={mgmtItems.reduce((s, i) => s + num(i.amount), 0)}
              >
                {renderItemList(mgmtItems)}
              </AccordionSection>
            )}

            {/* Letting fees */}
            {lettingItems.length > 0 && (
              <AccordionSection
                id={`${stmt.id}__letting`}
                emoji="🏠"
                title="Letting Fees"
                itemCount={lettingItems.length}
                total={lettingItems.reduce((s, i) => s + num(i.amount), 0)}
              >
                {renderItemList(lettingItems)}
              </AccordionSection>
            )}

            {/* Expenses — single outer accordion; sub-categories expand inside */}
            {expenseItems.length > 0 && (
              <AccordionSection
                id={`${stmt.id}__all_expenses`}
                emoji="📦"
                title="Expenses"
                itemCount={expenseItems.length}
                total={expenseItems.reduce((s, i) => s + num(i.amount), 0)}
              >
                <div className="divide-y divide-neutral-100">
                  {expKeys.map(key => {
                    const grp = expGroups[key]
                    const label = key === '__other' ? 'Other Expenses' : key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                    const emoji = key === 'repairs' ? '🔧' : key === 'cleaning' ? '🧹' : key === 'insurance' ? '🛡️' : key === 'utilities' ? '💡' : '📦'
                    const subKey = `${stmt.id}__sub__${key}`
                    const isSubOpen = expandedExpKey === subKey
                    return (
                      <div key={key}>
                        <button
                          className="flex items-center justify-between w-full px-lg py-sm text-left hover:bg-neutral-50 transition-colors bg-white"
                          onClick={() => setExpandedExpKey(isSubOpen ? null : subKey)}
                        >
                          <div className="flex items-center gap-sm">
                            <span className="text-base leading-none">{emoji}</span>
                            <div>
                              <p className="text-sm text-neutral-800">{label}</p>
                              <p className="text-xs text-neutral-400">{grp.items.length} item{grp.items.length !== 1 ? 's' : ''}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-md">
                            <span className="text-sm font-semibold text-neutral-700 tabular-nums">{gbp(grp.total)}</span>
                            <span className="text-neutral-400 text-xs">{isSubOpen ? '▲' : '▼'}</span>
                          </div>
                        </button>
                        {isSubOpen && renderItemList(grp.items)}
                      </div>
                    )
                  })}
                </div>
              </AccordionSection>
            )}
          </div>
        )}

        {!hasLineItems && (
          <p className="text-sm text-neutral-400 italic">No line items recorded for this statement.</p>
        )}
      </div>
    )
  }

  // ── Loading / error states ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-lg space-y-sm animate-pulse">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 rounded-xl bg-neutral-200" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-lg">
        <div className="rounded-xl bg-red-50 border border-red-200 px-lg py-md text-sm text-red-700">
          {error}
        </div>
      </div>
    )
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <div className="p-lg space-y-lg">

      {/* Summary strip across all statements */}
      {statements.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400 mb-md">
            All-Time Summary · {statements.length} statement{statements.length !== 1 ? 's' : ''}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-md">
            {[
              { label: 'Total Gross Rent', value: totals.gross, colour: 'text-neutral-900' },
              { label: 'Total Mgmt Fees', value: totals.fees,  colour: 'text-red-600' },
              { label: 'Total Expenses',  value: totals.charges, colour: 'text-red-600' },
              { label: 'Total Net',       value: totals.net,   colour: 'text-green-700' },
            ].map(m => (
              <div key={m.label} className="rounded-xl bg-white border border-neutral-200 px-md py-md shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">{m.label}</p>
                <p className={`text-xl font-bold mt-xs tabular-nums ${m.colour}`}>{gbp(m.value)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Statement list — accordion */}
      {statements.length === 0 ? (
        <div className="rounded-xl bg-white border border-neutral-200 px-lg py-3xl text-center">
          <p className="text-3xl mb-md">💷</p>
          <p className="text-sm font-semibold text-neutral-600">No statements yet</p>
          <p className="text-xs text-neutral-400 mt-xs">
            Statements will appear here once imported via Admin → Statements.
          </p>
        </div>
      ) : (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400 mb-md">
            Statements (newest first)
          </p>
          <div className="space-y-sm">
            {statements.map(stmt => {
              const isOpen = expanded === stmt.id
              const landlordName = stmt.people
                ? [stmt.people.first_name, stmt.people.last_name].filter(Boolean).join(' ') || stmt.people.email
                : null

              return (
                <div key={stmt.id} className="rounded-xl overflow-hidden border border-neutral-200 bg-white shadow-sm">
                  {/* Statement header row */}
                  <button
                    className="flex items-center justify-between w-full px-lg py-md text-left hover:bg-neutral-50 transition-colors"
                    onClick={() => setExpanded(isOpen ? null : stmt.id)}
                  >
                    <div className="flex items-center gap-md min-w-0">
                      <div className="w-1 h-10 rounded-full bg-blue-500 shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-sm flex-wrap">
                          <p className="text-sm font-bold text-neutral-900">{periodLabel(stmt)}</p>
                          {stmt.paid_date && (
                            <span className="text-[10px] font-semibold px-xs py-px rounded-full bg-green-100 text-green-700">Paid</span>
                          )}
                        </div>
                        <p className="text-xs text-neutral-400 mt-xs">
                          Issued {issuedLabel(stmt.statement_date)}
                          {stmt.statement_reference ? ` · ${stmt.statement_reference}` : ''}
                          {landlordName ? ` · ${landlordName}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-lg ml-md shrink-0">
                      <div className="text-right">
                        <p className="text-xs text-neutral-400">Net</p>
                        <p className="text-base font-bold text-green-700 tabular-nums">{gbp(num(stmt.net_to_landlord))}</p>
                      </div>
                      <span className="text-neutral-400 text-sm">{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isOpen && renderStatementDetail(stmt)}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
