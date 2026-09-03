'use client'

/**
 * PropertyFinancialSummary
 *
 * Single shared component — used in both:
 *   • Admin property page  →  Financials tab  (FinancialsTab.tsx)
 *   • Landlord dashboard   →  financial section  (landlord/page.tsx)
 *
 * Queries landlord_statements + statement_line_items by property_id.
 * Defaults to the most recent statement. Period selector lets the viewer
 * switch to 3 months / 6 months / 12 months / all time.
 */

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { UNMATCHED_SLUG, categoryLabel, categoryEmoji } from '@/lib/expense-categories'

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
  room_label: string | null
  ai_confidence: number | null
  admin_confirmed: boolean
  statement_id: string | null
}

type Period = 'latest' | '3m' | '6m' | '12m' | 'all'

const PERIODS: { id: Period; label: string }[] = [
  { id: 'latest', label: 'Last statement' },
  { id: '3m',     label: '3 months' },
  { id: '6m',     label: '6 months' },
  { id: '12m',    label: '12 months' },
  { id: 'all',    label: 'All time' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

const num = (v: any) => parseFloat(String(v || 0))
const gbp = (n: number) =>
  `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function stmtPeriodLabel(stmt: Statement): string {
  const end = new Date(stmt.statement_date)
  if (!stmt.period_start) return end.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const start = new Date(stmt.period_start)
  const fmtMY = (d: Date) => d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
  return fmtMY(start) === fmtMY(end) ? fmtMY(end) : `${fmtMY(start)} – ${fmtMY(end)}`
}

function issuedLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function applyPeriod(statements: Statement[], period: Period): Statement[] {
  if (period === 'latest') return statements.slice(0, 1)
  if (period === 'all') return statements
  const months = period === '3m' ? 3 : period === '6m' ? 6 : 12
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  const cutoffIso = cutoff.toISOString().split('T')[0]
  return statements.filter(s => s.statement_date.split('T')[0] >= cutoffIso)
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PropertyFinancialSummary({ propertyId }: { propertyId: string }) {
  const supabase = createClient()
  const [loading, setLoading]     = useState(true)
  const [statements, setStatements] = useState<Statement[]>([])
  const [lineItemsByStatement, setLineItemsByStatement] = useState<Record<string, LineItem[]>>({})
  const [period, setPeriod]       = useState<Period>('latest')
  const [expanded, setExpanded]   = useState<string | null>(null)
  const [expandedCat, setExpandedCat] = useState<string | null>(null)
  const [expandedExpKey, setExpandedExpKey] = useState<string | null>(null)
  const [error, setError]         = useState<string | null>(null)

  useEffect(() => {
    if (!propertyId) { setLoading(false); return }
    async function load() {
      setLoading(true)
      setError(null)
      const [{ data: stmtData, error: stmtErr }, { data: lineData }] = await Promise.all([
        supabase
          .from('landlord_statements')
          .select('*, people:landlord_id(first_name, last_name, email)')
          .eq('property_id', propertyId)
          .order('statement_date', { ascending: false }),
        supabase
          .from('statement_line_items')
          .select('id, description, amount, statement_date, category, room_label, ai_confidence, admin_confirmed, statement_id')
          .eq('property_id', propertyId)
          .order('statement_date', { ascending: false }),
      ])
      if (stmtErr) { setError('Could not load statements.'); setLoading(false); return }
      const stmts = stmtData || []
      setStatements(stmts)
      const byStmt: Record<string, LineItem[]> = {}
      for (const item of (lineData || [])) {
        const key = (item as any).statement_id || '__none'
        if (!byStmt[key]) byStmt[key] = []
        byStmt[key].push(item as LineItem)
      }
      setLineItemsByStatement(byStmt)
      if (stmts.length > 0) setExpanded(stmts[0].id)
      setLoading(false)
    }
    load()
  }, [propertyId])

  // ── Derived ───────────────────────────────────────────────────────────────

  const visible = applyPeriod(statements, period)
  const latestStmt = statements[0]

  const totals = visible.reduce(
    (acc, s) => ({
      gross:   acc.gross   + num(s.gross_rent),
      fees:    acc.fees    + num(s.management_fees),
      charges: acc.charges + num(s.property_charges),
      net:     acc.net     + num(s.net_to_landlord),
    }),
    { gross: 0, fees: 0, charges: 0, net: 0 }
  )

  const headerLabel =
    period === 'latest' && latestStmt
      ? stmtPeriodLabel(latestStmt)
      : PERIODS.find(p => p.id === period)?.label ?? ''

  // ── Renderers ─────────────────────────────────────────────────────────────

  function renderItemList(items: LineItem[]) {
    const subtotal = items.reduce((s, i) => s + num(i.amount), 0)
    return (
      <div className="border-t border-neutral-100">
        {items.map((item, idx) => (
          <div key={item.id} className={`flex items-start justify-between px-lg py-sm ${idx < items.length - 1 ? 'border-b border-neutral-50' : ''}`}>
            <div className="flex-1 min-w-0 mr-md">
              <p className="text-sm text-neutral-800">{item.description}</p>
              <p className="text-xs text-neutral-400">
                {issuedLabel(item.statement_date)}
                {item.room_label ? ` · ${item.room_label}` : ''}
                {!item.admin_confirmed && item.ai_confidence != null && (
                  <span className="ml-xs text-amber-500"> · AI ({Math.round(item.ai_confidence * 100)}%)</span>
                )}
              </p>
            </div>
            <span className="text-sm font-medium text-neutral-700 whitespace-nowrap tabular-nums">{gbp(num(item.amount))}</span>
          </div>
        ))}
        <div className="flex justify-between items-center px-lg py-sm bg-neutral-50 border-t border-neutral-100">
          <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Subtotal</span>
          <span className="text-sm font-bold text-neutral-900 tabular-nums">{gbp(subtotal)}</span>
        </div>
      </div>
    )
  }

  function renderStatementDetail(stmt: Statement) {
    const items = lineItemsByStatement[stmt.id] || []
    const AGENT_SLUGS = ['management_fee', 'letting_fee']
    const INCOME_SLUG = 'rent_income'

    const incomeItems  = items.filter(i => i.category === INCOME_SLUG)
    const mgmtItems    = items.filter(i => i.category === 'management_fee')
    const lettingItems = items.filter(i => i.category === 'letting_fee')
    const expenseItems = items.filter(i => !AGENT_SLUGS.includes(i.category || '') && i.category !== INCOME_SLUG)
    const expenseTotal = expenseItems.reduce((s, i) => s + num(i.amount), 0)

    const expGroups: Record<string, { items: LineItem[]; total: number }> = {}
    for (const item of expenseItems) {
      const key = item.category || UNMATCHED_SLUG
      if (!expGroups[key]) expGroups[key] = { items: [], total: 0 }
      expGroups[key].items.push(item)
      expGroups[key].total += num(item.amount)
    }
    const expKeys = Object.keys(expGroups).sort((a, b) =>
      a === UNMATCHED_SLUG ? 1 : b === UNMATCHED_SLUG ? -1 : expGroups[b].total - expGroups[a].total
    )

    // Inner accordion — controlled by expandedCat
    function Accordion({ id, emoji, title, itemCount, total, children }: {
      id: string; emoji: string; title: string; itemCount: number; total: number; children: React.ReactNode
    }) {
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

        {/* Top-line mini metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-md pt-sm">
          {[
            { label: 'Gross Rent', value: num(stmt.gross_rent),        colour: 'text-neutral-900' },
            { label: 'Mgmt Fees',  value: num(stmt.management_fees),   colour: 'text-red-600' },
            { label: 'Expenses',   value: num(stmt.property_charges),  colour: 'text-red-600' },
            { label: 'Net',        value: num(stmt.net_to_landlord),   colour: 'text-green-700' },
          ].map(m => (
            <div key={m.label} className="bg-white rounded-xl border border-neutral-200 px-md py-sm">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">{m.label}</p>
              <p className={`text-lg font-bold mt-xs tabular-nums ${m.colour}`}>{gbp(m.value)}</p>
            </div>
          ))}
        </div>

        {stmt.paid_date && (
          <p className="text-xs text-green-700 font-semibold">✓ Paid {issuedLabel(stmt.paid_date)}</p>
        )}

        {/* Line items */}
        {items.length > 0 ? (
          <div className="space-y-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">Line Items</p>

            {incomeItems.length > 0 && (
              <Accordion id={`${stmt.id}__income`} emoji="💷" title="Rent Received"
                itemCount={incomeItems.length} total={incomeItems.reduce((s, i) => s + num(i.amount), 0)}>
                {renderItemList(incomeItems)}
              </Accordion>
            )}

            {mgmtItems.length > 0 && (
              <Accordion id={`${stmt.id}__mgmt`} emoji="💼" title="Management Fees"
                itemCount={mgmtItems.length} total={mgmtItems.reduce((s, i) => s + num(i.amount), 0)}>
                {renderItemList(mgmtItems)}
              </Accordion>
            )}

            {lettingItems.length > 0 && (
              <Accordion id={`${stmt.id}__letting`} emoji="🏠" title="Letting Fees"
                itemCount={lettingItems.length} total={lettingItems.reduce((s, i) => s + num(i.amount), 0)}>
                {renderItemList(lettingItems)}
              </Accordion>
            )}

            {/* Expenses — single row, sub-categories drop down inside */}
            {expenseItems.length > 0 && (
              <Accordion id={`${stmt.id}__all_expenses`} emoji="📦" title="Expenses"
                itemCount={expenseItems.length} total={expenseTotal}>
                <div className="divide-y divide-neutral-100">
                  {expKeys.map(key => {
                    const grp = expGroups[key]
                    const label = key === UNMATCHED_SLUG ? 'Other Expenses' : categoryLabel(key)
                    const emoji = key === UNMATCHED_SLUG ? '📦' : categoryEmoji(key)
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
              </Accordion>
            )}
          </div>
        ) : (
          <p className="text-sm text-neutral-400 italic">No line items recorded for this statement.</p>
        )}
      </div>
    )
  }

  // ── Loading / error ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-lg space-y-sm animate-pulse">
        {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-neutral-200" />)}
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-lg">
        <div className="rounded-xl bg-red-50 border border-red-200 px-lg py-md text-sm text-red-700">{error}</div>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-lg space-y-lg">

      {/* Header: last statement totals by default, period selector to change view */}
      {statements.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-md flex-wrap gap-sm">
            <p className="text-sm font-semibold text-neutral-700">
              {headerLabel}
              {visible.length > 1 && (
                <span className="ml-sm text-xs font-normal text-neutral-400">
                  ({visible.length} statements)
                </span>
              )}
            </p>
            {/* Period pills */}
            <div className="flex items-center gap-xs flex-wrap">
              {PERIODS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setPeriod(p.id)}
                  className={`text-xs px-sm py-xs rounded-full font-medium transition-colors ${
                    period === p.id
                      ? 'bg-neutral-900 text-white'
                      : 'text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Headline metric grid — totals for the selected period */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-md">
            {[
              { label: 'Gross Rent', value: totals.gross,   colour: 'text-neutral-900' },
              { label: 'Mgmt Fees',  value: totals.fees,    colour: 'text-red-600' },
              { label: 'Expenses',   value: totals.charges, colour: 'text-red-600' },
              { label: 'Net',        value: totals.net,     colour: 'text-green-700' },
            ].map(m => (
              <div key={m.label} className="rounded-xl bg-white border border-neutral-200 px-md py-md shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">{m.label}</p>
                <p className={`text-xl font-bold mt-xs tabular-nums ${m.colour}`}>{gbp(m.value)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Statement list — filtered to the selected period */}
      {statements.length === 0 ? (
        <div className="rounded-xl bg-white border border-neutral-200 px-lg py-3xl text-center">
          <p className="text-3xl mb-md">💷</p>
          <p className="text-sm font-semibold text-neutral-600">No statements yet</p>
          <p className="text-xs text-neutral-400 mt-xs">Statements will appear here once imported.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl bg-white border border-neutral-200 px-lg py-xl text-center">
          <p className="text-sm text-neutral-400">No statements in this period — try a wider range.</p>
        </div>
      ) : (
        <div className="space-y-sm">
          {visible.map(stmt => {
            const isOpen = expanded === stmt.id
            const landlordName = stmt.people
              ? [stmt.people.first_name, stmt.people.last_name].filter(Boolean).join(' ') || stmt.people.email
              : null
            return (
              <div key={stmt.id} className="rounded-xl overflow-hidden border border-neutral-200 bg-white shadow-sm">
                <button
                  className="flex items-center justify-between w-full px-lg py-md text-left hover:bg-neutral-50 transition-colors"
                  onClick={() => setExpanded(isOpen ? null : stmt.id)}
                >
                  <div className="flex items-center gap-md min-w-0">
                    <div className="w-1 h-10 rounded-full bg-blue-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-sm flex-wrap">
                        <p className="text-sm font-bold text-neutral-900">{stmtPeriodLabel(stmt)}</p>
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
                {isOpen && renderStatementDetail(stmt)}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
