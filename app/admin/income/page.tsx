'use client'

/**
 * /admin/income — Agency Fee Income Dashboard
 *
 * PRIMARY data source: landlord_statements.management_fees (imported from 10ninety via docs@)
 * SECONDARY data source: properties.management_fee_pct × rooms.current_asking_rent (live estimate)
 *
 * This page is a DISPLAY layer — it does not calculate or record anything;
 * it only shows what has been imported from the accounting system.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────

interface StatementRow {
  id: string
  statement_date: string
  management_fees: number
  gross_rent: number
  property_charges: number
  net_to_landlord: number
  property_id: string
  property_name: string
}

interface PropertyEstimate {
  id: string
  name: string
  management_fee_pct: number
  monthly_rent: number
  monthly_fee: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const GBP = (n: number, dec = 0) =>
  n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: dec, maximumFractionDigits: dec })

function monthKey(isoDate: string): string {
  // "2026-09-01" → "2026-09"
  return isoDate.slice(0, 7)
}

function monthLabel(key: string): string {
  // "2026-09" → "Sep 2026"
  const [y, m] = key.split('-')
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

function shortMonth(key: string): string {
  // "2026-09" → "Sep"
  const [y, m] = key.split('-')
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString('en-GB', { month: 'short' })
}

function pct(a: number, b: number): string {
  if (!b) return '—'
  const d = ((a - b) / Math.abs(b)) * 100
  return (d >= 0 ? '+' : '') + d.toFixed(1) + '%'
}

// ─── Bar Chart ────────────────────────────────────────────────────────────────

function BarChart({
  currentYear,
  priorYear,
  allMonths,
  estimate,
}: {
  currentYear: Record<string, number>  // month (MM) → fee
  priorYear: Record<string, number>    // month (MM) → fee
  allMonths: string[]                  // ["01","02",...,"12"]
  estimate: number                     // monthly live estimate
}) {
  const W = 680
  const H = 200
  const PAD = { top: 12, right: 12, bottom: 32, left: 56 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const allValues = [
    ...Object.values(currentYear),
    ...Object.values(priorYear),
    estimate,
  ].filter(Boolean)

  const maxVal = Math.max(...allValues, 1) * 1.15

  const nGroups = allMonths.length
  const groupW = chartW / nGroups
  const barW = groupW * 0.3
  const gap = groupW * 0.05

  function y(v: number) {
    return PAD.top + chartH - (v / maxVal) * chartH
  }
  function barHeight(v: number) {
    return (v / maxVal) * chartH
  }

  // Y-axis ticks
  const tickCount = 4
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) =>
    (maxVal / tickCount) * i
  )

  const hasPrior = Object.values(priorYear).some((v) => v > 0)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Monthly fee income chart">
      {/* Y grid */}
      {ticks.map((v, i) => (
        <g key={i}>
          <line
            x1={PAD.left} y1={y(v)}
            x2={W - PAD.right} y2={y(v)}
            stroke="currentColor" strokeOpacity={0.07} strokeDasharray={i === 0 ? 'none' : '3,3'}
          />
          <text x={PAD.left - 6} y={y(v) + 4} textAnchor="end" fontSize={9} fill="currentColor" fillOpacity={0.4}>
            {GBP(v, 0)}
          </text>
        </g>
      ))}

      {/* Estimate dotted line */}
      {estimate > 0 && (
        <>
          <line
            x1={PAD.left} y1={y(estimate)}
            x2={W - PAD.right} y2={y(estimate)}
            stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4,3" strokeOpacity={0.7}
          />
          <text x={W - PAD.right + 2} y={y(estimate) + 4} fontSize={8} fill="#f59e0b" fillOpacity={0.8}>
            est.
          </text>
        </>
      )}

      {/* Bars */}
      {allMonths.map((mm, i) => {
        const gx = PAD.left + i * groupW
        const midX = gx + groupW / 2

        const cur = currentYear[mm] || 0
        const pri = priorYear[mm] || 0

        // Positioning: if both bars, side by side centred on midX
        const totalBarW = hasPrior ? barW * 2 + gap : barW
        const startX = midX - totalBarW / 2

        return (
          <g key={mm}>
            {/* Prior year bar (lighter) */}
            {hasPrior && pri > 0 && (
              <rect
                x={startX}
                y={y(pri)}
                width={barW}
                height={barHeight(pri)}
                rx={2}
                fill="currentColor"
                fillOpacity={0.12}
              />
            )}

            {/* Current year bar */}
            {cur > 0 && (
              <>
                <rect
                  x={hasPrior ? startX + barW + gap : startX}
                  y={y(cur)}
                  width={barW}
                  height={barHeight(cur)}
                  rx={2}
                  fill="currentColor"
                  fillOpacity={cur > 0 ? 0.85 : 0.1}
                />
                {/* Value label on bars with enough height */}
                {barHeight(cur) > 20 && (
                  <text
                    x={hasPrior ? startX + barW + gap + barW / 2 : startX + barW / 2}
                    y={y(cur) - 3}
                    textAnchor="middle"
                    fontSize={8}
                    fill="currentColor"
                    fillOpacity={0.6}
                  >
                    {GBP(cur, 0)}
                  </text>
                )}
              </>
            )}

            {/* Month label */}
            <text
              x={midX}
              y={H - 6}
              textAnchor="middle"
              fontSize={9}
              fill="currentColor"
              fillOpacity={0.5}
            >
              {shortMonth(`2026-${mm}`)}
            </text>
          </g>
        )
      })}

      {/* Legend */}
      {hasPrior && (
        <g>
          <rect x={PAD.left} y={PAD.top} width={10} height={10} rx={2} fill="currentColor" fillOpacity={0.85} />
          <text x={PAD.left + 14} y={PAD.top + 9} fontSize={9} fill="currentColor" fillOpacity={0.6}>
            {new Date().getFullYear()}
          </text>
          <rect x={PAD.left + 48} y={PAD.top} width={10} height={10} rx={2} fill="currentColor" fillOpacity={0.12} />
          <text x={PAD.left + 62} y={PAD.top + 9} fontSize={9} fill="currentColor" fillOpacity={0.6}>
            {new Date().getFullYear() - 1}
          </text>
        </g>
      )}
    </svg>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function IncomeDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [statements, setStatements] = useState<StatementRow[]>([])
  const [estimates, setEstimates] = useState<PropertyEstimate[]>([])

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser()
      if (!user || !['administrator', 'admin', 'lettings'].includes(user.assignment?.role || '')) {
        router.push('/login')
        return
      }

      const supabase = createClient()

      // Fetch all imported statements (last 2+ years for YoY)
      const { data: stmts } = await supabase
        .from('landlord_statements')
        .select(`
          id, statement_date, management_fees, gross_rent,
          property_charges, net_to_landlord, property_id,
          properties(name)
        `)
        .order('statement_date', { ascending: true })

      // Fetch live portfolio estimate
      const { data: rooms } = await supabase
        .from('rooms')
        .select('property_id, current_asking_rent, status')
        .eq('status', 'occupied')
        .not('current_asking_rent', 'is', null)

      const { data: props } = await supabase
        .from('properties')
        .select('id, name, management_fee_pct')
        .order('name')

      // Build estimates
      const rentByProp: Record<string, number> = {}
      for (const r of (rooms || []) as any[]) {
        rentByProp[r.property_id] = (rentByProp[r.property_id] || 0) + parseFloat(r.current_asking_rent || 0)
      }

      const est: PropertyEstimate[] = ((props || []) as any[]).map((p) => ({
        id: p.id,
        name: p.name,
        management_fee_pct: p.management_fee_pct ?? 12,
        monthly_rent: rentByProp[p.id] || 0,
        monthly_fee: (rentByProp[p.id] || 0) * ((p.management_fee_pct ?? 12) / 100),
      }))

      const stmtRows: StatementRow[] = ((stmts || []) as any[]).map((s) => ({
        id: s.id,
        statement_date: s.statement_date,
        management_fees: parseFloat(s.management_fees) || 0,
        gross_rent: parseFloat(s.gross_rent) || 0,
        property_charges: parseFloat(s.property_charges) || 0,
        net_to_landlord: parseFloat(s.net_to_landlord) || 0,
        property_id: s.property_id,
        property_name: s.properties?.name || '—',
      }))

      setStatements(stmtRows)
      setEstimates(est)
      setLoading(false)
    }
    init()
  }, [router])

  // ── Derived ──────────────────────────────────────────────────────────────────

  const thisYear = new Date().getFullYear()
  const lastYear = thisYear - 1

  // Group statements by month: "YYYY-MM" → { fee, rent, count }
  const byMonth: Record<string, { fee: number; rent: number; count: number }> = {}
  for (const s of statements) {
    const key = monthKey(s.statement_date)
    if (!byMonth[key]) byMonth[key] = { fee: 0, rent: 0, count: 0 }
    byMonth[key].fee += s.management_fees
    byMonth[key].rent += s.gross_rent
    byMonth[key].count++
  }

  // By-property: sum fees from imported statements
  const feeByProp: Record<string, { name: string; ytd: number; total: number; months: number }> = {}
  for (const s of statements) {
    if (!feeByProp[s.property_id]) {
      feeByProp[s.property_id] = { name: s.property_name, ytd: 0, total: 0, months: 0 }
    }
    feeByProp[s.property_id].total += s.management_fees
    feeByProp[s.property_id].months++
    if (s.statement_date.startsWith(String(thisYear))) {
      feeByProp[s.property_id].ytd += s.management_fees
    }
  }

  // This year's total
  const ytdActual = statements
    .filter((s) => s.statement_date.startsWith(String(thisYear)))
    .reduce((sum, s) => sum + s.management_fees, 0)

  // Last year total
  const lastYearActual = statements
    .filter((s) => s.statement_date.startsWith(String(lastYear)))
    .reduce((sum, s) => sum + s.management_fees, 0)

  // Total months imported
  const importedMonths = Object.keys(byMonth).length

  // Live estimate total
  const estimateMonthly = estimates.reduce((s, e) => s + e.monthly_fee, 0)

  // Most recent month's actual
  const sortedMonths = Object.keys(byMonth).sort()
  const latestMonthKey = sortedMonths[sortedMonths.length - 1]
  const latestMonthFee = latestMonthKey ? byMonth[latestMonthKey].fee : 0

  // For bar chart: current year MM→fee, prior year MM→fee
  const allMonths = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']

  const currentYearBars: Record<string, number> = {}
  const priorYearBars: Record<string, number> = {}
  for (const [key, val] of Object.entries(byMonth)) {
    const [yr, mm] = key.split('-')
    if (yr === String(thisYear)) currentYearBars[mm] = val.fee
    if (yr === String(lastYear)) priorYearBars[mm] = val.fee
  }

  // Per-property table: merge imported + estimate
  const allPropIds = new Set([
    ...Object.keys(feeByProp),
    ...estimates.map((e) => e.id),
  ])

  const propRows = Array.from(allPropIds).map((pid) => {
    const imported = feeByProp[pid]
    const est = estimates.find((e) => e.id === pid)
    return {
      id: pid,
      name: imported?.name || est?.name || '—',
      ytd: imported?.ytd || 0,
      totalImported: imported?.total || 0,
      monthsImported: imported?.months || 0,
      estimateMonthly: est?.monthly_fee || 0,
      feePct: est?.management_fee_pct || null,
    }
  }).sort((a, b) => (b.ytd || b.estimateMonthly) - (a.ytd || a.estimateMonthly))

  const hasImports = statements.length > 0

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton href="/admin" />} />
        <div className="p-xl text-sm text-neutral-400">Loading…</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin" />} />

      <main className="mx-auto max-w-5xl px-lg py-2xl">

        {/* Header */}
        <div className="mb-xl flex flex-wrap items-end justify-between gap-md">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900">Agency Fee Income</h1>
            <p className="mt-xs text-sm text-neutral-500">
              {hasImports
                ? `Actual income from ${importedMonths} imported 10ninety statements · Live estimate shown separately`
                : 'No statements imported yet — showing live estimate only'}
            </p>
          </div>
          <div className="flex gap-sm">
            <Link
              href="/admin/statements"
              className="rounded-xl border border-neutral-300 px-lg py-sm text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              Import Statements →
            </Link>
            <Link
              href="/admin/accounts"
              className="rounded-xl border border-neutral-300 px-lg py-sm text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              Accounts Hub →
            </Link>
          </div>
        </div>

        {/* No imports banner */}
        {!hasImports && (
          <div className="mb-xl rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 p-lg">
            <p className="text-sm font-bold text-amber-800 mb-xs">📄 No statement data imported yet</p>
            <p className="text-xs text-amber-700">
              Send 10ninety statements to <strong>docs@capitalrooms.co.uk</strong> to build your income history.
              Until then, the figures below are estimates based on current property data.
            </p>
            <Link
              href="/admin/statements"
              className="mt-md inline-block rounded-lg bg-amber-700 px-md py-sm text-xs font-bold text-white hover:bg-amber-800"
            >
              Import a statement now →
            </Link>
          </div>
        )}

        {/* ── Summary stats ── */}
        <div className="mb-xl grid grid-cols-2 md:grid-cols-4 gap-md">
          <div className="rounded-2xl bg-neutral-900 text-white px-lg py-md">
            <p className="text-xs text-white/50 uppercase tracking-wide">
              {thisYear} fee income {!hasImports && '(estimate)'}
            </p>
            <p className="text-2xl font-bold mt-xs tabular-nums">{GBP(hasImports ? ytdActual : estimateMonthly * (new Date().getMonth() + 1))}</p>
            <p className="text-xs text-white/40 mt-xs">
              {hasImports
                ? `vs ${GBP(lastYearActual)} in ${lastYear} ${lastYearActual ? '(' + pct(ytdActual, lastYearActual) + ')' : ''}`
                : 'No import data yet'}
            </p>
          </div>

          <div className="rounded-2xl bg-white border border-neutral-200 px-lg py-md">
            <p className="text-xs text-neutral-400 uppercase tracking-wide">Monthly run rate</p>
            <p className="text-2xl font-bold text-neutral-900 mt-xs tabular-nums">
              {GBP(hasImports && latestMonthFee ? latestMonthFee : estimateMonthly, 2)}
            </p>
            <p className="text-xs text-neutral-400 mt-xs">
              {hasImports && latestMonthFee
                ? `From ${monthLabel(latestMonthKey)}`
                : 'Live estimate from portfolio'}
            </p>
          </div>

          <div className="rounded-2xl bg-white border border-neutral-200 px-lg py-md">
            <p className="text-xs text-neutral-400 uppercase tracking-wide">Annual projection</p>
            <p className="text-2xl font-bold text-neutral-900 mt-xs tabular-nums">
              {GBP((hasImports && latestMonthFee ? latestMonthFee : estimateMonthly) * 12, 0)}
            </p>
            <p className="text-xs text-neutral-400 mt-xs">Based on current run rate</p>
          </div>

          <div className="rounded-2xl bg-white border border-neutral-200 px-lg py-md">
            <p className="text-xs text-neutral-400 uppercase tracking-wide">Statements imported</p>
            <p className="text-2xl font-bold text-neutral-900 mt-xs tabular-nums">{statements.length}</p>
            <p className="text-xs text-neutral-400 mt-xs">
              {importedMonths} month{importedMonths !== 1 ? 's' : ''} across{' '}
              {Object.keys(feeByProp).length} propert{Object.keys(feeByProp).length !== 1 ? 'ies' : 'y'}
            </p>
          </div>
        </div>

        {/* ── Monthly bar chart ── */}
        <div className="mb-xl rounded-2xl bg-white border border-neutral-200 p-xl">
          <div className="flex items-start justify-between mb-lg flex-wrap gap-md">
            <div>
              <h2 className="text-base font-bold text-neutral-900">Monthly Fee Income</h2>
              <p className="text-xs text-neutral-400 mt-xs">
                {hasImports
                  ? `Actual management fees from imported statements · dotted line = current live estimate (${GBP(estimateMonthly, 2)}/mo)`
                  : 'No import data yet — import statements to populate this chart'}
              </p>
            </div>
            {hasImports && (
              <div className="text-right">
                <p className="text-xs text-neutral-400">
                  {latestMonthKey && `Last import: ${monthLabel(latestMonthKey)}`}
                </p>
              </div>
            )}
          </div>

          {hasImports ? (
            <BarChart
              currentYear={currentYearBars}
              priorYear={priorYearBars}
              allMonths={allMonths}
              estimate={estimateMonthly}
            />
          ) : (
            <div className="h-48 flex items-center justify-center rounded-xl border-2 border-dashed border-neutral-200">
              <div className="text-center">
                <p className="text-2xl mb-sm">📊</p>
                <p className="text-sm text-neutral-400">Chart populates as statements are imported</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Year-on-year comparison table ── */}
        {hasImports && sortedMonths.length > 0 && (
          <div className="mb-xl rounded-2xl bg-white border border-neutral-200 overflow-hidden">
            <div className="px-lg py-md border-b border-neutral-100">
              <h2 className="text-base font-bold text-neutral-900">Month-by-Month</h2>
              <p className="text-xs text-neutral-400">Actual fee income from imported statements</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    <th className="px-md py-sm">Month</th>
                    <th className="px-md py-sm text-right">Fee income</th>
                    <th className="px-md py-sm text-right hidden sm:table-cell">Gross rent</th>
                    <th className="px-md py-sm text-right hidden md:table-cell">Statements</th>
                    <th className="px-md py-sm text-right hidden md:table-cell">vs prior year</th>
                  </tr>
                </thead>
                <tbody>
                  {[...sortedMonths].reverse().map((key) => {
                    const data = byMonth[key]
                    const [yr, mm] = key.split('-')
                    const priorKey = `${parseInt(yr) - 1}-${mm}`
                    const priorFee = byMonth[priorKey]?.fee || 0
                    const change = priorFee ? ((data.fee - priorFee) / priorFee) * 100 : null

                    return (
                      <tr key={key} className="border-t border-neutral-100 hover:bg-neutral-50">
                        <td className="px-md py-sm font-medium text-neutral-900">{monthLabel(key)}</td>
                        <td className="px-md py-sm text-right tabular-nums font-bold text-neutral-900">
                          {GBP(data.fee, 2)}
                        </td>
                        <td className="px-md py-sm text-right tabular-nums text-neutral-500 hidden sm:table-cell">
                          {GBP(data.rent, 2)}
                        </td>
                        <td className="px-md py-sm text-right text-neutral-400 hidden md:table-cell">
                          {data.count}
                        </td>
                        <td className="px-md py-sm text-right hidden md:table-cell">
                          {change !== null ? (
                            <span className={`text-xs font-semibold ${change >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-xs text-neutral-300">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Per-property breakdown ── */}
        <div className="rounded-2xl bg-white border border-neutral-200 overflow-hidden">
          <div className="px-lg py-md border-b border-neutral-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-neutral-900">Per-Property</h2>
              <p className="text-xs text-neutral-400">
                {hasImports ? 'Actual YTD + live estimate for comparison' : 'Live estimate (no imports yet)'}
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  <th className="px-md py-sm">Property</th>
                  <th className="px-md py-sm text-right">Fee %</th>
                  {hasImports && <th className="px-md py-sm text-right">{thisYear} YTD actual</th>}
                  <th className="px-md py-sm text-right">Monthly estimate</th>
                  {hasImports && <th className="px-md py-sm text-right hidden md:table-cell">Statements</th>}
                </tr>
              </thead>
              <tbody>
                {propRows.map((row) => (
                  <tr key={row.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                    <td className="px-md py-sm font-medium text-neutral-900">{row.name}</td>
                    <td className="px-md py-sm text-right">
                      {row.feePct != null ? (
                        <span className={`inline-block rounded-full px-sm py-xs text-xs font-bold ${
                          row.feePct > 11 ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700'
                        }`}>
                          {row.feePct}%
                        </span>
                      ) : (
                        <span className="text-neutral-300 text-xs">—</span>
                      )}
                    </td>
                    {hasImports && (
                      <td className="px-md py-sm text-right tabular-nums font-bold text-neutral-900">
                        {row.ytd ? GBP(row.ytd, 2) : <span className="text-neutral-300">—</span>}
                      </td>
                    )}
                    <td className="px-md py-sm text-right tabular-nums text-neutral-500">
                      {row.estimateMonthly ? GBP(row.estimateMonthly, 2) : <span className="text-neutral-300">—</span>}
                    </td>
                    {hasImports && (
                      <td className="px-md py-sm text-right text-neutral-400 hidden md:table-cell">
                        {row.monthsImported || <span className="text-neutral-300">—</span>}
                      </td>
                    )}
                  </tr>
                ))}
                {/* Portfolio total row */}
                <tr className="border-t-2 border-neutral-300 bg-neutral-50 font-bold">
                  <td className="px-md py-md text-neutral-900">Portfolio total</td>
                  <td className="px-md py-md text-neutral-400 text-xs font-normal text-right">mixed</td>
                  {hasImports && (
                    <td className="px-md py-md text-right tabular-nums text-neutral-900">
                      {GBP(ytdActual, 2)}
                    </td>
                  )}
                  <td className="px-md py-md text-right tabular-nums text-neutral-700">
                    {GBP(estimateMonthly, 2)}/mo
                  </td>
                  {hasImports && <td className="hidden md:table-cell" />}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer note */}
        <p className="mt-lg text-xs text-neutral-400 text-center">
          Actual figures from statements imported via docs@capitalrooms.co.uk · Live estimates from portfolio data ·
          {' '}<Link href="/admin/statements" className="underline">Manage imports</Link>
        </p>

      </main>
    </div>
  )
}
