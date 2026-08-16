'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, signOut } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import DateRangePicker from '../components/DateRangePicker'
import Link from 'next/link'

interface Statement {
  id: string
  statement_reference: string
  statement_date: string
  period_start: string
  period_end: string
  gross_rent: number
  management_fees: number
  property_charges: number
  net_to_landlord: number
  paid_date?: string
  property_id: string
  properties?: { name: string; address: string }
}

export default function LandlordDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [statements, setStatements] = useState<Statement[]>([])
  const [selectedProperty, setSelectedProperty] = useState('')
  const [selectedStatement, setSelectedStatement] = useState<Statement | null>(null)
  const [dateRangeStart, setDateRangeStart] = useState('')
  const [dateRangeEnd, setDateRangeEnd] = useState('')
  const [aggregatedSummary, setAggregatedSummary] = useState<{
    gross_rent: number
    management_fees: number
    property_charges: number
    net_to_landlord: number
    statement_count: number
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function checkAuth() {
      const data = await getCurrentUser()
      if (!data || data.assignment?.role !== 'landlord') {
        router.push('/login')
        return
      }
      setUser(data.user)

      const supabase = createClient()

      // Get landlord's statements
      const { data: statementsData } = await supabase
        .from('landlord_statements')
        .select('*, properties(name, address)')
        .eq('landlord_id', (data.assignment as any).id)
        .order('statement_date', { ascending: false })

      setStatements(statementsData || [])
      if (statementsData && statementsData.length > 0) {
        const mostRecentStatement = statementsData[0] // Already sorted by date descending
        const earliestStatement = statementsData[statementsData.length - 1]
        setSelectedProperty(mostRecentStatement.property_id)
        setSelectedStatement(mostRecentStatement)

        // Default to the full span of statements so the landlord sees ALL of their
        // statements on load, not just the latest month. They can narrow the range
        // (single month, 3 / 6 / 12 months) from the date picker.
        const rangeStart = earliestStatement.period_start.split('T')[0]
        const rangeEnd = mostRecentStatement.period_end.split('T')[0]
        setDateRangeStart(rangeStart)
        setDateRangeEnd(rangeEnd)

        calculateAggregatedSummary(statementsData, rangeStart, rangeEnd)
      }
      setLoading(false)
    }

    checkAuth()
  }, [router])

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  function calculateAggregatedSummary(statementsToAggregate: Statement[], startDate: string, endDate: string) {
    const filtered = statementsToAggregate.filter(s => {
      const stmtDate = s.statement_date.split('T')[0]
      return stmtDate >= startDate && stmtDate <= endDate
    })

    const summary = filtered.reduce(
      (acc, stmt) => ({
        gross_rent: acc.gross_rent + stmt.gross_rent,
        management_fees: acc.management_fees + stmt.management_fees,
        property_charges: acc.property_charges + stmt.property_charges,
        net_to_landlord: acc.net_to_landlord + stmt.net_to_landlord,
        statement_count: acc.statement_count + 1
      }),
      {
        gross_rent: 0,
        management_fees: 0,
        property_charges: 0,
        net_to_landlord: 0,
        statement_count: 0
      }
    )

    setAggregatedSummary(summary)
  }

  const filteredStatements = selectedProperty
    ? statements.filter((s) => s.property_id === selectedProperty)
    : statements

  // Filter statements by date range as well
  const dateFilteredStatements = filteredStatements.filter((s) => {
    const stmtDate = s.statement_date.split('T')[0]
    return stmtDate >= dateRangeStart && stmtDate <= dateRangeEnd
  })

  function handleDateRangeChange(startDate: string, endDate: string) {
    setDateRangeStart(startDate)
    setDateRangeEnd(endDate)
    calculateAggregatedSummary(filteredStatements, startDate, endDate)
  }

  const latestStatement = dateFilteredStatements[0] || filteredStatements[0]
  const properties = Array.from(new Map(statements.map((s) => [s.property_id, { id: s.property_id, name: s.properties?.name, address: s.properties?.address }])).values())

  // ---- Portfolio intelligence (all derived from the statements in the selected period) ----
  const num = (v: any) => parseFloat(String(v || 0))

  const kpi = dateFilteredStatements.reduce(
    (acc, s) => ({
      gross: acc.gross + num(s.gross_rent),
      fees: acc.fees + num(s.management_fees),
      charges: acc.charges + num(s.property_charges),
      net: acc.net + num(s.net_to_landlord),
    }),
    { gross: 0, fees: 0, charges: 0, net: 0 }
  )
  const stmtCount = dateFilteredStatements.length
  const avgMonthlyNet = stmtCount > 0 ? kpi.net / stmtCount : 0

  // Best-performing statement in the period (highest net to the landlord).
  const bestStatement = dateFilteredStatements.reduce(
    (best, s) => (num(s.net_to_landlord) > num(best?.net_to_landlord ?? 0) ? s : best),
    dateFilteredStatements[0]
  )
  const bestMonthLabel = bestStatement
    ? new Date(bestStatement.statement_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    : ''

  // Net received in the current UK tax year (6 Apr → 5 Apr) — the number a landlord
  // needs for self-assessment. Anchored to today.
  const today = new Date()
  const taxYearStart = new Date(today.getFullYear(), 3, 6) // 6 April this calendar year
  if (today < taxYearStart) taxYearStart.setFullYear(today.getFullYear() - 1)
  const taxYearStartIso = taxYearStart.toISOString().split('T')[0]
  const taxYearNet = filteredStatements
    .filter((s) => s.statement_date.split('T')[0] >= taxYearStartIso)
    .reduce((sum, s) => sum + num(s.net_to_landlord), 0)
  const taxYearLabel = `${taxYearStart.getFullYear()}/${String(taxYearStart.getFullYear() + 1).slice(2)}`

  // Monthly net series (oldest → newest) for the trend chart.
  const trendSeries = [...dateFilteredStatements]
    .sort((a, b) => a.statement_date.localeCompare(b.statement_date))
    .map((s) => ({
      label: new Date(s.statement_date).toLocaleDateString('en-GB', { month: 'short' }),
      net: num(s.net_to_landlord),
      ref: s.statement_reference,
    }))
  const trendMax = Math.max(1, ...trendSeries.map((p) => p.net))

  function exportCsv() {
    const rows = [
      ['Reference', 'Statement Date', 'Period Start', 'Period End', 'Gross Rent', 'Management Fees', 'Property Charges', 'Net to Landlord', 'Paid Date'],
      ...[...dateFilteredStatements]
        .sort((a, b) => a.statement_date.localeCompare(b.statement_date))
        .map((s) => [
          s.statement_reference,
          s.statement_date.split('T')[0],
          s.period_start.split('T')[0],
          s.period_end.split('T')[0],
          num(s.gross_rent).toFixed(2),
          num(s.management_fees).toFixed(2),
          num(s.property_charges).toFixed(2),
          num(s.net_to_landlord).toFixed(2),
          s.paid_date ? s.paid_date.split('T')[0] : '',
        ]),
    ]
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `capital-rooms-statements-${dateRangeStart}-to-${dateRangeEnd}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ---- Metric registry (config-driven) -------------------------------------
  // Every headline number the dashboard can show is defined once, here. The
  // strip below simply renders whichever metrics `preferredMetricIds` selects,
  // in order. This is the groundwork for a future "build your own dashboard":
  // a landlord picks & reorders metric ids, we persist that list, and this same
  // registry drives the layout — no new metric code needed.
  //
  // Nothing here exposes Capital Rooms' fee income or margin; every metric is
  // framed positively around the landlord's own returns.
  const gbp = (n: number) =>
    `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const lifetimeNet = filteredStatements.reduce((sum, s) => sum + num(s.net_to_landlord), 0)
  const latest = filteredStatements[0]

  const twelveMonthsAgo = new Date(new Date().setMonth(new Date().getMonth() - 12))
    .toISOString()
    .split('T')[0]
  const last12mNet = filteredStatements
    .filter((s) => s.statement_date.split('T')[0] >= twelveMonthsAgo)
    .reduce((sum, s) => sum + num(s.net_to_landlord), 0)

  // Year-on-year income: compare the most recent statement's gross rent with the
  // same month a year earlier (the fairest like-for-like on monthly data). If we
  // don't hold a prior-year month, we surface "—" rather than invent a number.
  let yoyPct: number | null = null
  let yoyPriorLabel = ''
  if (latest) {
    const latestIso = latest.statement_date.split('T')[0]
    const oneYearBefore = new Date(latestIso)
    oneYearBefore.setFullYear(oneYearBefore.getFullYear() - 1)
    // Closest statement within ±31 days of "same month last year".
    const priorYear = filteredStatements.find((s) => {
      const d = new Date(s.statement_date.split('T')[0])
      return Math.abs(d.getTime() - oneYearBefore.getTime()) < 31 * 24 * 60 * 60 * 1000
    })
    if (priorYear && num(priorYear.gross_rent) > 0) {
      yoyPct = ((num(latest.gross_rent) - num(priorYear.gross_rent)) / num(priorYear.gross_rent)) * 100
      yoyPriorLabel = `vs ${new Date(priorYear.statement_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`
    }
  }

  // ---- Estimated void from statements --------------------------------------
  // We can't see individual rooms, so we treat the property's *typical full
  // month* of rent as full occupancy, and read each month's shortfall against
  // that baseline as empty-room time. Partial / supplementary statements (whose
  // period isn't a whole calendar month — e.g. a single room let mid-month) are
  // excluded so they don't register as phantom voids. This is an ESTIMATE; an
  // exact figure needs per-room rent data.
  const periodDays = (s: Statement) => {
    const start = new Date(s.period_start.split('T')[0])
    const end = new Date(s.period_end.split('T')[0])
    return Math.round((end.getTime() - start.getTime()) / 86400000) + 1
  }
  const median = (arr: number[]) => {
    if (arr.length === 0) return 0
    const sorted = [...arr].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  }
  const fullMonthStmts = filteredStatements.filter((s) => {
    const d = periodDays(s)
    return d >= 27 && d <= 31
  })
  const occupancyBaseline = median(fullMonthStmts.map((s) => num(s.gross_rent)))
  const voidWindow = fullMonthStmts.filter(
    (s) => s.statement_date.split('T')[0] >= twelveMonthsAgo
  )
  let estVoidPct: number | null = null
  if (occupancyBaseline > 0 && voidWindow.length > 0) {
    const occSum = voidWindow.reduce(
      (sum, s) => sum + Math.min(1, num(s.gross_rent) / occupancyBaseline),
      0
    )
    estVoidPct = (1 - occSum / voidWindow.length) * 100
  }

  type MetricTone = 'default' | 'positive' | 'negative'
  interface MetricDef {
    id: string
    label: string
    value: string
    sublabel: string
    tone?: MetricTone
  }
  const availableMetrics: MetricDef[] = [
    // --- Landlord's five headline metrics ---
    { id: 'total_income', label: 'Total Income', value: gbp(kpi.gross), sublabel: 'rent collected', tone: 'default' },
    { id: 'total_outgoings', label: 'Total Outgoings', value: gbp(kpi.fees + kpi.charges), sublabel: 'fees + costs', tone: 'default' },
    { id: 'net_profit', label: 'Net Profit', value: gbp(kpi.net), sublabel: 'after outgoings', tone: 'positive' },
    { id: 'yoy_income', label: 'vs Last Year', value: yoyPct === null ? '—' : `${yoyPct >= 0 ? '+' : ''}${yoyPct.toFixed(1)}%`, sublabel: yoyPct === null ? 'income' : `income ${yoyPriorLabel}`, tone: yoyPct === null ? 'default' : yoyPct >= 0 ? 'positive' : 'negative' },
    { id: 'avg_void_12mo', label: 'Avg Void (12mo)', value: estVoidPct === null ? '—' : `${estVoidPct.toFixed(1)}%`, sublabel: estVoidPct === null ? 'awaiting data' : 'est. from rent', tone: estVoidPct === null ? 'default' : estVoidPct <= 5 ? 'positive' : 'default' },
    // --- Additional metrics available for the future custom dashboard ---
    { id: 'total_received', label: 'Total Received', value: gbp(kpi.net), sublabel: `${stmtCount} statement${stmtCount === 1 ? '' : 's'}`, tone: 'default' },
    { id: 'avg_month', label: 'Avg / Month', value: gbp(avgMonthlyNet), sublabel: 'net to you', tone: 'default' },
    { id: 'best_month', label: 'Best Month', value: gbp(num(bestStatement?.net_to_landlord)), sublabel: bestMonthLabel, tone: 'positive' },
    { id: 'tax_year', label: 'This Tax Year', value: gbp(taxYearNet), sublabel: `${taxYearLabel} received`, tone: 'default' },
    { id: 'latest_net', label: 'Latest Payment', value: gbp(num(latest?.net_to_landlord)), sublabel: latest ? new Date(latest.statement_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '', tone: 'positive' },
    { id: 'lifetime_net', label: 'Lifetime Received', value: gbp(lifetimeNet), sublabel: 'all statements', tone: 'default' },
    { id: 'last_12m', label: 'Last 12 Months', value: gbp(last12mNet), sublabel: 'net received', tone: 'default' },
  ]
  // The landlord's five headline metrics. A future settings panel will let them
  // reorder / swap these from `availableMetrics`.
  const preferredMetricIds = ['total_income', 'total_outgoings', 'net_profit', 'yoy_income', 'avg_void_12mo']
  const shownMetrics = preferredMetricIds
    .map((id) => availableMetrics.find((m) => m.id === id))
    .filter((m): m is MetricDef => Boolean(m))

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar />
        <main className="mx-auto max-w-6xl px-lg py-2xl">
          <div className="animate-pulse">
            <div className="h-10 w-64 bg-neutral-300 rounded-lg mb-lg"></div>
            <div className="h-6 w-96 bg-neutral-200 rounded-lg"></div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar
        right={
          <button
            onClick={handleSignOut}
            className="shrink-0 transition-colors hover:opacity-80 flex items-center gap-sm"
          >
            <span>👋</span> Sign out
          </button>
        }
      />

      <main className="mx-auto max-w-6xl px-lg py-2xl">
        {/* Header */}
        <div className="mb-3xl">
          <h1 className="text-3xl font-bold text-neutral-900">Your Statements</h1>
          <p className="mt-sm text-sm text-neutral-600">
            Financial summaries for your properties
          </p>
        </div>

        {/* Property Selector */}
        {properties.length > 0 && (
          <div className="mb-3xl rounded-2xl bg-neutral-900 text-white p-lg">
            <label className="block text-xs font-bold uppercase tracking-widest text-white/60 mb-md">
              Select Property
            </label>
            <select
              value={selectedProperty}
              onChange={(e) => setSelectedProperty(e.target.value)}
              className="w-full bg-neutral-800 text-white rounded-lg px-md py-sm border border-neutral-700 text-base font-bold appearance-none cursor-pointer"
              style={{
                colorScheme: 'dark',
                color: '#ffffff'
              }}
            >
              {properties.map((prop) => (
                <option key={prop.id} value={prop.id} style={{ backgroundColor: '#1f2937', color: '#ffffff' }}>
                  {prop.name} • {prop.address}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Portfolio KPI strip — the at-a-glance health of the property for the selected period */}
        {stmtCount > 0 && (
          <div className="mb-3xl">
            <div className="flex items-center justify-between mb-md">
              <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                Portfolio Overview
              </h2>
              <button
                onClick={exportCsv}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-xs"
              >
                ⬇ Export CSV
              </button>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-md">
              {shownMetrics.map((m) => (
                <div
                  key={m.id}
                  className="rounded-2xl bg-white border border-neutral-200/80 p-lg shadow-sm hover:shadow-md transition-shadow"
                >
                  <p className="text-[11px] font-bold uppercase tracking-widest text-neutral-400">{m.label}</p>
                  <p className={`text-2xl font-bold mt-sm tabular-nums tracking-tight ${m.tone === 'positive' ? 'text-green-600' : m.tone === 'negative' ? 'text-red-500' : 'text-neutral-900'}`}>
                    {m.value}
                  </p>
                  <p className="text-xs text-neutral-500 mt-xs">{m.sublabel}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Income trend — a visual read on how monthly net income moves over the period */}
        {trendSeries.length > 1 && (
          <div className="mb-3xl rounded-2xl bg-white border border-neutral-200 p-lg">
            <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-lg">
              Net Income Trend
            </h2>
            <div className="flex items-end gap-xs" style={{ height: 160 }}>
              {trendSeries.map((p, i) => (
                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group">
                  <div
                    className="w-full bg-blue-500 group-hover:bg-blue-600 rounded-t transition-all relative"
                    style={{ height: `${Math.max(4, (p.net / trendMax) * 100)}%` }}
                    title={`${p.ref}: £${p.net.toFixed(2)}`}
                  >
                    <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-bold text-neutral-700 opacity-0 group-hover:opacity-100 whitespace-nowrap">
                      £{Math.round(p.net).toLocaleString('en-GB')}
                    </span>
                  </div>
                  <span className="text-[10px] text-neutral-500 mt-xs">{p.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main Grid */}
        {latestStatement && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-lg mb-3xl">
            {/* Statements List */}
            <div className="rounded-2xl bg-neutral-900 text-white p-lg">
              <h2 className="text-xs font-bold uppercase tracking-widest text-white/60 mb-lg">
                📋 Statements
              </h2>
              <div className="space-y-sm">
                {dateFilteredStatements.length > 0 ? (
                  dateFilteredStatements.map((stmt) => (
                    <Link
                      key={stmt.id}
                      href={`/landlord/statement/${stmt.id}`}
                      className="block p-md bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors border-l-2 border-blue-500"
                    >
                      <div className="font-bold text-lg">{stmt.statement_reference}</div>
                      <div className="text-sm text-white/60 mt-xs">
                        {new Date(stmt.statement_date).toLocaleDateString('en-GB', {
                          month: 'short',
                          year: 'numeric',
                        })}
                      </div>
                      <div className="text-base font-bold text-green-400 mt-md">
                        £{stmt.net_to_landlord.toFixed(2)}
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="text-center py-lg text-white/60">
                    <p>No statements in this period</p>
                  </div>
                )}
              </div>
            </div>

            {/* Summary Card */}
            <div className="lg:col-span-2 rounded-2xl bg-gradient-to-br from-neutral-900 to-neutral-800 text-white p-lg">
              <div className="mb-lg">
                <div className="flex justify-between items-start mb-md">
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-widest text-white/60">
                      💰 Financial Summary
                    </h2>
                  </div>
                  {dateRangeStart && dateRangeEnd && (
                    <DateRangePicker
                      onRangeChange={handleDateRangeChange}
                      minDate={filteredStatements.length > 0 ? filteredStatements[filteredStatements.length - 1].statement_date.split('T')[0] : dateRangeStart}
                      maxDate={filteredStatements.length > 0 ? filteredStatements[0].statement_date.split('T')[0] : dateRangeEnd}
                      initialStart={dateRangeStart}
                      initialEnd={dateRangeEnd}
                    />
                  )}
                </div>
                <div className="bg-neutral-800/50 rounded-lg px-md py-sm border border-white/10">
                  <p className="text-xs text-white/60">Period Range</p>
                  <p className="font-bold text-white mt-xs text-sm">
                    {new Date(dateRangeStart).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })} to {new Date(dateRangeEnd).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                  {aggregatedSummary && aggregatedSummary.statement_count > 0 && (
                    <p className="text-xs text-white/50 mt-xs">
                      {aggregatedSummary.statement_count} statement(s)
                    </p>
                  )}
                </div>
              </div>

              {(aggregatedSummary || selectedStatement || latestStatement) && (
                <div className="space-y-md mb-2xl">
                  <div className="flex justify-between items-center pb-md border-b border-white/10">
                    <span className="text-white/80">Gross Rent Collected</span>
                    <span className="text-lg font-bold">£{(aggregatedSummary ? aggregatedSummary.gross_rent : (selectedStatement?.gross_rent || latestStatement?.gross_rent || 0)).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center pb-md border-b border-white/10">
                    <span className="text-white/80">Management Fees (12%)</span>
                    <span className="text-lg font-bold text-red-400">-£{(aggregatedSummary ? aggregatedSummary.management_fees : (selectedStatement?.management_fees || latestStatement?.management_fees || 0)).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center pb-md border-b border-white/10">
                    <span className="text-white/80">Property Charges</span>
                    <span className="text-lg font-bold text-red-400">-£{(aggregatedSummary ? aggregatedSummary.property_charges : (selectedStatement?.property_charges || latestStatement?.property_charges || 0)).toFixed(2)}</span>
                  </div>
                </div>
              )}

              {(aggregatedSummary || selectedStatement || latestStatement) && (
                <div className="bg-blue-900/30 border border-blue-500 rounded-lg px-lg py-md mb-lg">
                  <div className="flex justify-between items-center">
                    <span className="font-bold">Net to You</span>
                    <span className="text-2xl font-bold text-green-400">£{((aggregatedSummary?.net_to_landlord ?? 0) || selectedStatement?.net_to_landlord || latestStatement?.net_to_landlord || 0).toFixed(2)}</span>
                  </div>
                </div>
              )}

              {aggregatedSummary && aggregatedSummary.statement_count > 1 ? (
                <div className="bg-blue-900/20 border border-blue-400 rounded-lg px-lg py-md">
                  <p className="text-sm font-bold text-blue-400">📊 Period Summary</p>
                  <p className="text-xs text-white/60 mt-xs">
                    {aggregatedSummary.statement_count} statements in period
                  </p>
                  <p className="text-lg font-bold text-blue-400 mt-sm">
                    £{aggregatedSummary.net_to_landlord.toFixed(2)} total
                  </p>
                </div>
              ) : (selectedStatement?.paid_date || latestStatement.paid_date) ? (
                <div className="bg-green-900/20 border border-green-500 rounded-lg px-lg py-md">
                  <p className="text-sm font-bold text-green-400">✓ Payment Status</p>
                  <p className="text-xs text-white/60 mt-xs">
                    Paid on {new Date(selectedStatement?.paid_date || latestStatement.paid_date!).toLocaleDateString('en-GB')}
                  </p>
                  <p className="text-lg font-bold text-green-400 mt-sm">
                    £{(selectedStatement?.net_to_landlord || latestStatement.net_to_landlord).toFixed(2)}
                  </p>
                </div>
              ) : null}

              <Link
                href={`/landlord/statement/${selectedStatement?.id || latestStatement.id}`}
                className="block mt-lg w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-md px-lg rounded-lg text-center transition-colors"
              >
                View Detailed Breakdown →
              </Link>
            </div>
          </div>
        )}

        {statements.length === 0 && (
          <div className="rounded-2xl bg-neutral-900 text-white p-3xl text-center">
            <p className="text-lg text-white/60">No statements available yet</p>
            <p className="text-sm text-white/40 mt-sm">
              Check back soon for your financial statements
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
