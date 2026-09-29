'use client'

/**
 * <FinancialTrail> — click any financial figure to trace it back to its source.
 *
 * Usage:
 *   <FinancialTrail type="rent_charge" id={charge.id}>£{charge.amount_received}</FinancialTrail>
 *   <FinancialTrail type="expense" id={expense.id}>£{expense.amount}</FinancialTrail>
 *   <FinancialTrail type="statement_room" id={row.id}>£{row.management_fee}</FinancialTrail>
 *   <FinancialTrail type="bank_transaction" id={txn.id}>£{txn.amount}</FinancialTrail>
 *
 * Renders the children as a subtle clickable element. On click, fetches the
 * full source chain and shows it in a slide-over panel.
 */

import { useState, useCallback } from 'react'
import Link from 'next/link'

type TrailType = 'rent_charge' | 'expense' | 'statement_room' | 'bank_transaction'

interface FinancialTrailProps {
  type: TrailType
  id: string
  children: React.ReactNode
  className?: string
}

const gbp = (n: number | null | undefined) =>
  n == null ? '—' : `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s.slice(0,10) + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const fmtMonth = (s: string | null | undefined) =>
  s ? new Date(s.slice(0,10) + 'T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '—'

function TrailNode({ label, value, sub, href }: { label: string; value: string; sub?: string; href?: string }) {
  return (
    <div className="flex items-start gap-sm">
      <div className="mt-1 w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">{label}</p>
        {href ? (
          <Link href={href} className="text-sm font-semibold text-indigo-700 hover:underline">{value}</Link>
        ) : (
          <p className="text-sm font-semibold text-neutral-900">{value}</p>
        )}
        {sub && <p className="text-xs text-neutral-500 mt-xs">{sub}</p>}
      </div>
    </div>
  )
}

function Divider() {
  return <div className="ml-[3px] w-px h-5 bg-neutral-200 ml-[3px]" style={{ marginLeft: '3px' }} />
}

function RentChargeTrail({ data }: { data: any }) {
  const txn   = data.bank_transaction
  const rooms = data.statement_rooms || []
  const stmt  = rooms[0]?.statement
  const audit = data.audit || []

  return (
    <div className="space-y-xs">
      {txn && (
        <>
          <TrailNode
            label="Bank transaction"
            value={`${gbp(txn.amount)} received ${fmtDate(txn.transaction_date)}`}
            sub={txn.description}
          />
          {txn.batch && (
            <>
              <Divider />
              <TrailNode
                label="Import batch"
                value={txn.batch.filename}
                sub={`Imported ${fmtDate(txn.batch.imported_at)} · ${fmtDate(txn.batch.period_from)} – ${fmtDate(txn.batch.period_to)}`}
              />
            </>
          )}
          <Divider />
        </>
      )}

      <TrailNode
        label="Rent charge"
        value={`${gbp(data.amount_due)} due · ${gbp(data.amount_received)} received`}
        sub={`${fmtMonth(data.charge_month)} · Status: ${data.status}${data.reference ? ` · ${data.reference}` : ''}`}
      />

      {stmt && (
        <>
          <Divider />
          <TrailNode
            label="Landlord statement"
            value={stmt.reference || stmt.statement_reference}
            sub={`${fmtDate(stmt.period_start)} – ${fmtDate(stmt.period_end)}`}
            href={`/admin/accounts`}
          />
        </>
      )}

      {!txn && data.payment_method && (
        <div className="mt-md rounded-lg bg-amber-50 border border-amber-200 px-md py-sm text-xs text-amber-800">
          Manually recorded · Method: {data.payment_method.replace('_', ' ')}
          {data.payment_notes && ` · ${data.payment_notes}`}
        </div>
      )}

      {audit.length > 0 && (
        <div className="mt-md">
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-sm">Change history</p>
          <div className="space-y-xs">
            {audit.map((a: any, i: number) => (
              <div key={i} className="text-xs text-neutral-600 flex gap-sm">
                <span className="text-neutral-400 shrink-0">{fmtDate(a.performed_at)}</span>
                <span className="font-semibold">{a.action.replace(/_/g, ' ')}</span>
                {a.note && <span className="text-neutral-400">— {a.note}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ExpenseTrail({ data }: { data: any }) {
  const lineItems = data.statement_line || []
  const inferred  = data.inferred_statement_lines || []
  const allLines  = [...lineItems, ...inferred]

  return (
    <div className="space-y-xs">
      <TrailNode
        label="Expense"
        value={`${gbp(data.amount)} — ${data.description}`}
        sub={`${fmtDate(data.expense_date)} · ${data.source === 'manual' ? 'Entered manually' : data.source === 'statement_import' ? 'From statement import' : 'From bank import'}${data.reference ? ` · ${data.reference}` : ''}`}
      />

      {allLines.length > 0 ? (
        allLines.map((line: any, i: number) => {
          const stmt = line.statement
          return (
            <div key={i}>
              <Divider />
              <TrailNode
                label="Statement line"
                value={`${line.category?.replace(/_/g, ' ')} · ${gbp(line.amount)}`}
                sub={line.description}
              />
              {stmt && (
                <>
                  <Divider />
                  <TrailNode
                    label="Landlord statement"
                    value={stmt.reference || stmt.statement_reference}
                    sub={`${fmtDate(stmt.period_start)} – ${fmtDate(stmt.period_end)}`}
                    href={`/admin/accounts`}
                  />
                </>
              )}
            </div>
          )
        })
      ) : (
        <div className="mt-md rounded-lg bg-neutral-50 border border-neutral-200 px-md py-sm text-xs text-neutral-500">
          This expense has not yet appeared on an imported landlord statement.
        </div>
      )}
    </div>
  )
}

function StatementRoomTrail({ data }: { data: any }) {
  const stmt   = data.statement
  const charge = data.rent_charge
  const txn    = charge?.bank_transaction

  return (
    <div className="space-y-xs">
      {txn && (
        <>
          <TrailNode
            label="Bank transaction"
            value={`${gbp(txn.amount)} received ${fmtDate(txn.transaction_date)}`}
            sub={txn.description}
          />
          <Divider />
        </>
      )}
      {charge && (
        <>
          <TrailNode
            label="Rent charge"
            value={`${gbp(charge.amount_due)} due · ${gbp(charge.amount_received)} received`}
            sub={`${fmtMonth(charge.charge_month)} · ${charge.status}`}
          />
          <Divider />
        </>
      )}
      <TrailNode
        label="Statement room line"
        value={`Rent ${gbp(data.rent_income)} · Fee ${gbp(data.management_fee)} · Net ${gbp(data.net_to_landlord)}`}
        sub={data.room?.name || data.tenant_name || ''}
      />
      {stmt && (
        <>
          <Divider />
          <TrailNode
            label="Landlord statement"
            value={stmt.reference || stmt.statement_reference}
            sub={`${fmtDate(stmt.period_start)} – ${fmtDate(stmt.period_end)} · ${stmt.properties?.name || stmt.properties?.address || ''}`}
            href={`/admin/accounts`}
          />
        </>
      )}
    </div>
  )
}

function BankTransactionTrail({ data }: { data: any }) {
  const charge = data.rent_charge
  const stmtRooms = charge?.statement_rooms || []
  const stmt = stmtRooms[0]?.statement

  return (
    <div className="space-y-xs">
      <TrailNode
        label="Bank transaction"
        value={`${gbp(data.amount)} received ${fmtDate(data.transaction_date)}`}
        sub={data.description}
      />
      {data.batch && (
        <>
          <Divider />
          <TrailNode
            label="Import batch"
            value={data.batch.filename}
            sub={`${data.batch.bank_name ? data.batch.bank_name + ' · ' : ''}${fmtDate(data.batch.period_from)} – ${fmtDate(data.batch.period_to)}`}
          />
        </>
      )}
      {charge && (
        <>
          <Divider />
          <TrailNode
            label="Rent charge"
            value={`${gbp(charge.amount_due)} due · ${gbp(charge.amount_received)} received`}
            sub={`${fmtMonth(charge.charge_month)} · ${charge.status} · ${charge.room?.name || ''} — ${charge.room?.properties?.name || charge.room?.properties?.address || ''}`}
          />
        </>
      )}
      {stmt && (
        <>
          <Divider />
          <TrailNode
            label="Landlord statement"
            value={stmt.reference || stmt.statement_reference}
            sub={fmtDate(stmt.statement_date)}
            href={`/admin/accounts`}
          />
        </>
      )}
    </div>
  )
}

export default function FinancialTrail({ type, id, children, className }: FinancialTrailProps) {
  const [open, setOpen]     = useState(false)
  const [loading, setLoading] = useState(false)
  const [trail, setTrail]   = useState<any>(null)
  const [error, setError]   = useState<string | null>(null)

  const fetch_ = useCallback(async () => {
    if (trail) { setOpen(true); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/financial-trail?type=${type}&id=${id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not load trail')
      setTrail(json)
      setOpen(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
      setOpen(true)
    } finally {
      setLoading(false)
    }
  }, [type, id, trail])

  const typeLabels: Record<TrailType, string> = {
    rent_charge:      'Rent payment trail',
    expense:          'Expense trail',
    statement_room:   'Fee trail',
    bank_transaction: 'Transaction trail',
  }

  return (
    <>
      {/* Trigger */}
      <button
        onClick={fetch_}
        className={`inline-flex items-center gap-xs group cursor-pointer ${className || ''}`}
        title="Click to trace source"
      >
        {children}
        <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-indigo-500 font-semibold">⤵</span>
        {loading && <span className="w-3 h-3 rounded-full border border-indigo-300 border-t-indigo-600 animate-spin" />}
      </button>

      {/* Slide-over panel */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setOpen(false)} />

          {/* Panel */}
          <div className="relative w-full max-w-sm bg-white shadow-2xl flex flex-col h-full">
            <div className="px-xl py-lg border-b border-neutral-100 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">Source trail</p>
                <p className="text-sm font-bold text-neutral-900 mt-xs">{typeLabels[type]}</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none">×</button>
            </div>

            <div className="flex-1 overflow-y-auto px-xl py-lg">
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-md py-sm text-sm text-red-700">{error}</div>
              )}
              {trail && !error && (
                <>
                  {trail.type === 'rent_charge'      && <RentChargeTrail data={trail.data} />}
                  {trail.type === 'expense'           && <ExpenseTrail data={trail.data} />}
                  {trail.type === 'statement_room'    && <StatementRoomTrail data={trail.data} />}
                  {trail.type === 'bank_transaction'  && <BankTransactionTrail data={trail.data} />}
                </>
              )}
            </div>

            <div className="px-xl py-md border-t border-neutral-100">
              <p className="text-xs text-neutral-400">Every figure in the system traces back to a source document. Nothing is ever deleted — voids and edits are logged.</p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
