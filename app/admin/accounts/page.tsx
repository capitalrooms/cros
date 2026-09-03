'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Person {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
}

interface RoomRow {
  id: string
  name: string
  status: string | null
  current_asking_rent: number | null
  previous_rent: number | null
  tenancies: Array<{ person_id: string; people: Person | null }>
}

interface PropertyRow {
  id: string
  name: string
  address: string | null
  management_fee_pct: number | null
  landlord: Person | null
  rooms: RoomRow[]
}

interface RentCharge {
  id: string
  room_id: string
  charge_month: string
  amount_due: number
  amount_received: number
  received_date: string | null
  status: 'pending' | 'partial' | 'paid' | 'overdue' | 'waived'
  notes: string | null
}

interface Expense {
  property_id: string
  amount: number
  category: string
  statement_date: string
}

type Tab = 'rent-roll' | 'landlord-accounts' | 'agency-income' | 'arrears'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const GBP = (n: number, dec = 0) =>
  n.toLocaleString('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })

function personName(p: Person | null | undefined): string {
  if (!p) return '—'
  const parts = [p.first_name, p.last_name].filter(Boolean)
  return parts.length ? parts.join(' ') : p.email || '—'
}

function firstOfMonth(d = new Date()): string {
  const m = new Date(d)
  m.setDate(1)
  return m.toISOString().split('T')[0]
}

function monthLabel(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  })
}

const STATUS_STYLE: Record<string, string> = {
  paid: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  partial: 'bg-blue-50 text-blue-800 border-blue-200',
  overdue: 'bg-red-100 text-red-800 border-red-200',
  waived: 'bg-neutral-100 text-neutral-500 border-neutral-200',
  vacant: 'bg-neutral-50 text-neutral-400 border-neutral-200',
}

const STATUS_LABEL: Record<string, string> = {
  paid: '✅ Paid',
  pending: '⏳ Pending',
  partial: '◑ Partial',
  overdue: '🔴 Overdue',
  waived: '○ Waived',
  vacant: '— Vacant',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-sm py-xs text-xs font-semibold ${STATUS_STYLE[status] ?? 'bg-neutral-100 text-neutral-600'}`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

// Remittance modal
function RemittanceModal({
  landlord,
  properties,
  charges,
  expenses,
  month,
  onClose,
}: {
  landlord: Person
  properties: PropertyRow[]
  charges: RentCharge[]
  expenses: Expense[]
  month: string
  onClose: () => void
}) {
  const chargesByRoom = Object.fromEntries(charges.map((c) => [c.room_id, c]))
  const expensesByProp: Record<string, number> = {}
  for (const e of expenses) {
    expensesByProp[e.property_id] = (expensesByProp[e.property_id] || 0) + e.amount
  }

  let grandRent = 0
  let grandFee = 0
  let grandExpenses = 0

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-lg" onClick={onClose}>
      <div
        className="my-lg w-full max-w-2xl rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="rounded-t-2xl bg-neutral-900 px-xl py-lg text-white">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-white/50">Capital Rooms</p>
              <h2 className="text-xl font-bold mt-xs">Landlord Remittance Statement</h2>
              <p className="text-sm text-white/70 mt-xs">{monthLabel(month)}</p>
            </div>
            <button onClick={onClose} className="text-white/50 hover:text-white text-xl">✕</button>
          </div>
          <div className="mt-lg border-t border-white/10 pt-lg">
            <p className="text-xs text-white/50 uppercase tracking-wide">Prepared for</p>
            <p className="font-semibold">{personName(landlord)}</p>
            {landlord.email && <p className="text-sm text-white/70">{landlord.email}</p>}
          </div>
        </div>

        {/* Body */}
        <div className="px-xl py-lg space-y-xl">
          {properties.map((prop) => {
            const feePct = prop.management_fee_pct ?? 12
            const occupiedRooms = prop.rooms.filter(
              (r) => r.status === 'occupied' && r.current_asking_rent
            )

            let propRent = 0
            let propFee = 0

            return (
              <div key={prop.id}>
                <h3 className="font-bold text-neutral-900 border-b border-neutral-200 pb-sm mb-md">
                  {prop.name}
                  <span className="ml-md text-xs font-normal text-neutral-500">{prop.address}</span>
                </h3>

                {/* Room table */}
                <table className="w-full text-sm mb-md">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-neutral-500">
                      <th className="text-left py-xs">Room</th>
                      <th className="text-left py-xs">Tenant</th>
                      <th className="text-right py-xs">Rent</th>
                      <th className="text-right py-xs">Fee ({feePct}%)</th>
                      <th className="text-right py-xs">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {occupiedRooms.map((room) => {
                      const charge = chargesByRoom[room.id]
                      const rent = charge
                        ? charge.amount_received || charge.amount_due
                        : room.current_asking_rent || 0
                      const fee = rent * (feePct / 100)
                      const net = rent - fee
                      propRent += rent
                      propFee += fee
                      grandRent += rent
                      grandFee += fee

                      const tenant =
                        room.tenancies?.[0]?.people
                          ? personName(room.tenancies[0].people)
                          : '—'

                      return (
                        <tr key={room.id} className="border-b border-neutral-100">
                          <td className="py-sm text-neutral-700">{room.name}</td>
                          <td className="py-sm text-neutral-500 text-xs">{tenant}</td>
                          <td className="py-sm text-right font-mono">{GBP(rent, 2)}</td>
                          <td className="py-sm text-right font-mono text-red-600">−{GBP(fee, 2)}</td>
                          <td className="py-sm text-right font-mono font-semibold">{GBP(net, 2)}</td>
                        </tr>
                      )
                    })}
                    {occupiedRooms.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-sm text-neutral-400 text-xs">No occupied rooms this month</td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* Property expenses */}
                {expensesByProp[prop.id] ? (
                  <div className="flex items-center justify-between text-sm text-neutral-600 mb-xs">
                    <span>Property expenses (maintenance, utilities, etc.)</span>
                    <span className="font-mono text-red-600">−{GBP(expensesByProp[prop.id], 2)}</span>
                  </div>
                ) : null}

                {/* Property subtotal */}
                <div className="flex items-center justify-between rounded-xl bg-neutral-50 px-md py-sm mt-sm">
                  <span className="text-sm font-semibold text-neutral-700">{prop.name} subtotal</span>
                  <span className="font-bold text-neutral-900">
                    {GBP(propRent - propFee - (expensesByProp[prop.id] || 0), 2)}
                  </span>
                </div>
              </div>
            )
          })}

          {/* Grand total */}
          {(() => {
            const totalExpenses = properties.reduce(
              (s, p) => s + (expensesByProp[p.id] || 0),
              0
            )
            grandExpenses = totalExpenses
            const net = grandRent - grandFee - totalExpenses

            return (
              <div className="rounded-2xl bg-neutral-900 text-white px-xl py-lg">
                <div className="grid grid-cols-2 gap-md text-sm mb-lg">
                  <div>
                    <p className="text-white/50 text-xs">Gross rent collected</p>
                    <p className="font-bold text-lg">{GBP(grandRent, 2)}</p>
                  </div>
                  <div>
                    <p className="text-white/50 text-xs">Management fee ({properties[0]?.management_fee_pct ?? 12}%)</p>
                    <p className="font-bold text-lg text-red-300">−{GBP(grandFee, 2)}</p>
                  </div>
                  {grandExpenses > 0 && (
                    <div>
                      <p className="text-white/50 text-xs">Property expenses</p>
                      <p className="font-bold text-lg text-red-300">−{GBP(grandExpenses, 2)}</p>
                    </div>
                  )}
                </div>
                <div className="border-t border-white/20 pt-lg flex items-center justify-between">
                  <p className="font-bold uppercase tracking-wide text-white/70 text-sm">Net amount due to landlord</p>
                  <p className="text-3xl font-bold">{GBP(net, 2)}</p>
                </div>
                <p className="text-xs text-white/40 mt-md">
                  Statement date: {new Date().toLocaleDateString('en-GB')} ·
                  Period: {monthLabel(month)} ·
                  Capital Rooms Ltd
                </p>
              </div>
            )
          })()}
        </div>

        <div className="px-xl pb-lg flex gap-md">
          <button
            onClick={() => window.print()}
            className="rounded-xl bg-neutral-900 px-lg py-md text-sm font-bold text-white hover:bg-neutral-700"
          >
            🖨 Print / Save PDF
          </button>
          <button
            onClick={onClose}
            className="rounded-xl border border-neutral-300 px-lg py-md text-sm font-semibold hover:bg-neutral-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AccountsPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('rent-roll')
  const [loading, setLoading] = useState(true)
  const [properties, setProperties] = useState<PropertyRow[]>([])
  const [charges, setCharges] = useState<RentCharge[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [chargeMonth, setChargeMonth] = useState(firstOfMonth())
  const [generating, setGenerating] = useState(false)
  const [remittanceLandlord, setRemittanceLandlord] = useState<Person | null>(null)
  const [updatingCharge, setUpdatingCharge] = useState<string | null>(null)

  // ── Load data ──
  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    const [propsRes, chargesRes, expensesRes] = await Promise.all([
      supabase
        .from('properties')
        .select(`
          id, name, address, management_fee_pct,
          landlord:people!landlord_id(id, first_name, last_name, email),
          rooms(
            id, name, status, current_asking_rent, previous_rent,
            tenancies(person_id, people!person_id(id, first_name, last_name, email))
          )
        `)
        .order('name'),

      supabase
        .from('rent_charges')
        .select('*')
        .eq('charge_month', chargeMonth),

      supabase
        .from('statement_line_items')
        .select('property_id, amount, category, statement_date')
        .gte('statement_date', (() => {
          const d = new Date()
          d.setMonth(d.getMonth() - 1)
          d.setDate(1)
          return d.toISOString().split('T')[0]
        })()),
    ])

    setProperties((propsRes.data as any[]) || [])
    setCharges((chargesRes.data as any[]) || [])
    setExpenses((expensesRes.data as any[]) || [])
    setLoading(false)
  }, [chargeMonth])

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser()
      if (
        !user ||
        (user.assignment?.role !== 'administrator' &&
          user.assignment?.role !== 'admin' &&
          user.assignment?.role !== 'lettings')
      ) {
        router.push('/login')
        return
      }
      await load()
    }
    init()
  }, [router, load])

  // ── Generate charges ──
  async function generateCharges() {
    setGenerating(true)
    try {
      const res = await fetch('/api/accounts/generate-charges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: chargeMonth }),
      })
      const j = await res.json()
      if (j.ok) {
        await load()
      } else {
        alert('Error: ' + j.error)
      }
    } finally {
      setGenerating(false)
    }
  }

  // ── Update a charge status ──
  async function updateCharge(
    chargeId: string,
    update: Partial<Pick<RentCharge, 'status' | 'amount_received' | 'received_date' | 'notes'>>
  ) {
    setUpdatingCharge(chargeId)
    try {
      await fetch(`/api/accounts/charges/${chargeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      })
      setCharges((prev) =>
        prev.map((c) => (c.id === chargeId ? { ...c, ...update } : c))
      )
    } finally {
      setUpdatingCharge(null)
    }
  }

  // ── Derived data ──
  const chargesByRoom = Object.fromEntries(charges.map((c) => [c.room_id, c]))

  const expensesByProp: Record<string, number> = {}
  for (const e of expenses) {
    expensesByProp[e.property_id] = (expensesByProp[e.property_id] || 0) + Math.abs(e.amount)
  }

  // All rooms flattened (rent roll rows)
  const allRooms = properties.flatMap((prop) =>
    prop.rooms.map((room) => ({
      prop,
      room,
      charge: chargesByRoom[room.id] as RentCharge | undefined,
      tenant: room.tenancies?.[0]?.people ?? null,
      rent: room.current_asking_rent ?? 0,
      feePct: prop.management_fee_pct ?? 12,
      fee: (room.current_asking_rent ?? 0) * ((prop.management_fee_pct ?? 12) / 100),
      status:
        room.status !== 'occupied'
          ? 'vacant'
          : (chargesByRoom[room.id]?.status ?? 'pending'),
    }))
  )

  const occupied = allRooms.filter((r) => r.status !== 'vacant')
  const vacant = allRooms.filter((r) => r.status === 'vacant')
  const arrears = allRooms.filter((r) => r.status === 'overdue' || r.status === 'partial')

  const totalExpected = occupied.reduce((s, r) => s + r.rent, 0)
  const totalFee = occupied.reduce((s, r) => s + r.fee, 0)
  const totalCollected = charges
    .filter((c) => c.status === 'paid')
    .reduce((s, c) => s + c.amount_received, 0)
  const totalOutstanding = charges
    .filter((c) => c.status === 'overdue' || c.status === 'partial' || c.status === 'pending')
    .reduce((s, c) => s + (c.amount_due - c.amount_received), 0)

  // Landlords
  const landlordMap = new Map<string, { landlord: Person; properties: PropertyRow[] }>()
  for (const prop of properties) {
    if (!prop.landlord) continue
    const lid = prop.landlord.id
    if (!landlordMap.has(lid)) {
      landlordMap.set(lid, { landlord: prop.landlord, properties: [] })
    }
    landlordMap.get(lid)!.properties.push(prop)
  }
  const landlordGroups = Array.from(landlordMap.values()).sort((a, b) =>
    personName(a.landlord).localeCompare(personName(b.landlord))
  )
  const unassigned = properties.filter((p) => !p.landlord)

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton href="/admin" />} />
        <div className="flex items-center justify-center py-3xl">
          <div className="text-sm text-neutral-500">Loading accounts…</div>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin" />} />

      {/* Remittance modal */}
      {remittanceLandlord && (() => {
        const group = landlordMap.get(remittanceLandlord.id)
        if (!group) return null
        return (
          <RemittanceModal
            landlord={group.landlord}
            properties={group.properties}
            charges={charges}
            expenses={expenses}
            month={chargeMonth}
            onClose={() => setRemittanceLandlord(null)}
          />
        )
      })()}

      <main className="mx-auto max-w-7xl px-lg py-lg">

        {/* ── Page header ── */}
        <div className="mb-xl flex flex-wrap items-end justify-between gap-md">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900">Agency Accounts</h1>
            <p className="mt-xs text-sm text-neutral-500">
              Rent ledger · Landlord remittance · Management fee income · Arrears
            </p>
          </div>
          {/* Month picker + generate */}
          <div className="flex items-center gap-sm">
            <input
              type="month"
              value={chargeMonth.slice(0, 7)}
              onChange={(e) => {
                const [y, m] = e.target.value.split('-')
                setChargeMonth(`${y}-${m.padStart(2, '0')}-01`)
              }}
              className="rounded-xl border border-neutral-300 px-md py-sm text-sm bg-white"
            />
            <button
              onClick={generateCharges}
              disabled={generating}
              className="rounded-xl bg-neutral-900 px-lg py-sm text-sm font-bold text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              {generating ? 'Generating…' : '⚡ Generate Rent Roll'}
            </button>
          </div>
        </div>

        {/* ── Portfolio stats bar ── */}
        <div className="mb-xl grid grid-cols-2 gap-md sm:grid-cols-4">
          {[
            { label: 'Expected this month', value: GBP(totalExpected), note: `${occupied.length} occupied rooms` },
            { label: 'Confirmed collected', value: GBP(totalCollected), note: `${charges.filter(c=>c.status==='paid').length} paid` },
            { label: 'Outstanding / pending', value: GBP(totalOutstanding), note: arrears.length ? `${arrears.length} rooms flagged` : 'None flagged' },
            { label: 'Agency fee income', value: GBP(totalFee), note: 'At current fee %' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl bg-white border border-neutral-200 px-lg py-md">
              <p className="text-xs text-neutral-500 uppercase tracking-wide">{stat.label}</p>
              <p className="text-2xl font-bold text-neutral-900 mt-xs font-mono">{stat.value}</p>
              <p className="text-xs text-neutral-400 mt-xs">{stat.note}</p>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div className="mb-lg flex gap-xs border-b border-neutral-200">
          {(
            [
              { id: 'rent-roll', label: '📋 Rent Roll' },
              { id: 'landlord-accounts', label: '🏠 Landlord Accounts' },
              { id: 'agency-income', label: '💰 Agency Income' },
              { id: 'arrears', label: `🔴 Arrears${arrears.length ? ` (${arrears.length})` : ''}` },
            ] as { id: Tab; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-lg py-md text-sm font-semibold border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-neutral-900 text-neutral-900'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            TAB: RENT ROLL
        ══════════════════════════════════════════════════════════════════════ */}
        {tab === 'rent-roll' && (
          <div>
            {charges.length === 0 && (
              <div className="mb-lg rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 p-lg text-center">
                <p className="text-sm font-semibold text-amber-800">
                  No rent charges generated for {monthLabel(chargeMonth)} yet.
                </p>
                <p className="text-xs text-amber-700 mt-xs">
                  Click <strong>⚡ Generate Rent Roll</strong> to create charge records for all occupied rooms.
                </p>
              </div>
            )}

            {properties.map((prop) => {
              const propRooms = allRooms.filter((r) => r.prop.id === prop.id)
              if (!propRooms.length) return null

              const propOccupied = propRooms.filter((r) => r.status !== 'vacant')
              const propRent = propOccupied.reduce((s, r) => s + r.rent, 0)
              const propFee = propOccupied.reduce((s, r) => s + r.fee, 0)

              return (
                <div key={prop.id} className="mb-xl">
                  {/* Property header */}
                  <div className="flex items-center justify-between mb-sm">
                    <div>
                      <h2 className="text-base font-bold text-neutral-900">{prop.name}</h2>
                      <p className="text-xs text-neutral-500">
                        Fee: {prop.management_fee_pct ?? 12}% ·{' '}
                        Landlord: {personName(prop.landlord)} ·{' '}
                        {propOccupied.length} occupied · Expected: {GBP(propRent)} · Fee: {GBP(propFee)}
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                          <th className="px-md py-sm">Room</th>
                          <th className="px-md py-sm hidden sm:table-cell">Tenant</th>
                          <th className="px-md py-sm text-right">Rent</th>
                          <th className="px-md py-sm text-right hidden md:table-cell">Fee</th>
                          <th className="px-md py-sm text-right hidden md:table-cell">Net</th>
                          <th className="px-md py-sm">Status</th>
                          <th className="px-md py-sm w-[160px]">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {propRooms.map(({ room, charge, tenant, rent, fee, status }) => {
                          const net = rent - fee
                          const isUpdating = updatingCharge === charge?.id

                          return (
                            <tr
                              key={room.id}
                              className={`border-t border-neutral-100 transition-colors ${
                                status === 'overdue'
                                  ? 'bg-red-50'
                                  : status === 'paid'
                                  ? 'bg-emerald-50/30'
                                  : 'hover:bg-neutral-50'
                              }`}
                            >
                              <td className="px-md py-sm font-medium text-neutral-900">{room.name}</td>
                              <td className="px-md py-sm hidden sm:table-cell text-neutral-600 text-xs">
                                {tenant ? personName(tenant) : <span className="text-neutral-300">—</span>}
                              </td>
                              <td className="px-md py-sm text-right font-mono text-neutral-900">
                                {rent ? GBP(rent, 2) : '—'}
                              </td>
                              <td className="px-md py-sm text-right font-mono text-neutral-500 hidden md:table-cell">
                                {fee ? GBP(fee, 2) : '—'}
                              </td>
                              <td className="px-md py-sm text-right font-mono font-semibold hidden md:table-cell">
                                {rent ? GBP(net, 2) : '—'}
                              </td>
                              <td className="px-md py-sm">
                                <StatusPill status={status} />
                              </td>
                              <td className="px-md py-sm">
                                {charge && (
                                  <div className="flex items-center gap-xs">
                                    {status !== 'paid' && status !== 'vacant' && (
                                      <button
                                        disabled={isUpdating}
                                        onClick={() =>
                                          updateCharge(charge.id, {
                                            status: 'paid',
                                            amount_received: charge.amount_due,
                                            received_date: new Date().toISOString().split('T')[0],
                                          })
                                        }
                                        className="rounded-lg bg-emerald-600 px-sm py-xs text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                                      >
                                        {isUpdating ? '…' : '✓ Paid'}
                                      </button>
                                    )}
                                    {status !== 'overdue' && status !== 'vacant' && status !== 'waived' && (
                                      <button
                                        disabled={isUpdating}
                                        onClick={() => updateCharge(charge.id, { status: 'overdue' })}
                                        className="rounded-lg border border-red-300 px-sm py-xs text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                                      >
                                        Flag
                                      </button>
                                    )}
                                    {(status === 'overdue' || status === 'paid') && (
                                      <button
                                        disabled={isUpdating}
                                        onClick={() => updateCharge(charge.id, { status: 'pending', amount_received: 0, received_date: null })}
                                        className="rounded-lg border border-neutral-200 px-sm py-xs text-xs text-neutral-500 hover:bg-neutral-50 disabled:opacity-50"
                                      >
                                        Reset
                                      </button>
                                    )}
                                  </div>
                                )}
                                {!charge && status !== 'vacant' && (
                                  <span className="text-xs text-neutral-400">Generate first</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB: LANDLORD ACCOUNTS
        ══════════════════════════════════════════════════════════════════════ */}
        {tab === 'landlord-accounts' && (
          <div className="space-y-xl">
            {landlordGroups.length === 0 && (
              <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
                <p className="text-sm text-neutral-500">
                  No landlords assigned to properties yet. Add a landlord contact and link them in the Property info tab.
                </p>
              </div>
            )}

            {landlordGroups.map(({ landlord, properties: lProps }) => {
              const lRooms = allRooms.filter((r) =>
                lProps.some((p) => p.id === r.prop.id) && r.status !== 'vacant'
              )
              const grossRent = lRooms.reduce((s, r) => s + r.rent, 0)
              const totalFeeL = lRooms.reduce((s, r) => s + r.fee, 0)
              const totalExp = lProps.reduce((s, p) => s + (expensesByProp[p.id] || 0), 0)
              const netPayout = grossRent - totalFeeL - totalExp

              return (
                <div key={landlord.id} className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
                  {/* Landlord header */}
                  <div className="flex items-center justify-between px-xl py-lg bg-neutral-900 text-white">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-white/50">Landlord</p>
                      <h2 className="text-lg font-bold">{personName(landlord)}</h2>
                      {landlord.email && <p className="text-sm text-white/60">{landlord.email}</p>}
                      <p className="text-xs text-white/40 mt-xs">{lProps.length} propert{lProps.length === 1 ? 'y' : 'ies'} · {lRooms.length} occupied rooms</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-white/50 uppercase">Net payout</p>
                      <p className="text-3xl font-bold">{GBP(netPayout, 2)}</p>
                      <p className="text-xs text-white/40">{monthLabel(chargeMonth)}</p>
                      <button
                        onClick={() => setRemittanceLandlord(landlord)}
                        className="mt-sm rounded-xl border border-white/30 px-md py-xs text-xs font-semibold text-white hover:bg-white/10"
                      >
                        📄 Remittance Statement
                      </button>
                    </div>
                  </div>

                  {/* Property breakdown */}
                  <div className="px-xl py-lg">
                    {lProps.map((prop) => {
                      const pRooms = allRooms.filter(
                        (r) => r.prop.id === prop.id && r.status !== 'vacant'
                      )
                      const pRent = pRooms.reduce((s, r) => s + r.rent, 0)
                      const pFee = pRooms.reduce((s, r) => s + r.fee, 0)
                      const pExp = expensesByProp[prop.id] || 0

                      return (
                        <div key={prop.id} className="mb-lg last:mb-0">
                          <div className="flex items-center justify-between mb-sm">
                            <h3 className="font-semibold text-neutral-900">{prop.name}</h3>
                            <span className="text-xs text-neutral-500">{prop.management_fee_pct ?? 12}% fee</span>
                          </div>

                          <div className="grid grid-cols-3 gap-md text-sm mb-sm">
                            <div className="rounded-xl bg-neutral-50 p-md text-center">
                              <p className="text-xs text-neutral-500">Gross rent</p>
                              <p className="font-bold text-neutral-900">{GBP(pRent, 2)}</p>
                            </div>
                            <div className="rounded-xl bg-red-50 p-md text-center">
                              <p className="text-xs text-neutral-500">Deductions</p>
                              <p className="font-bold text-red-700">−{GBP(pFee + pExp, 2)}</p>
                            </div>
                            <div className="rounded-xl bg-emerald-50 p-md text-center">
                              <p className="text-xs text-neutral-500">Net to landlord</p>
                              <p className="font-bold text-emerald-800">{GBP(pRent - pFee - pExp, 2)}</p>
                            </div>
                          </div>

                          {pExp > 0 && (
                            <p className="text-xs text-neutral-500">
                              Includes {GBP(pExp, 2)} in property expenses recorded this period
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Landlord total row */}
                  <div className="border-t border-neutral-100 px-xl py-md bg-neutral-50 flex items-center justify-between text-sm">
                    <span className="font-semibold text-neutral-700">Portfolio totals</span>
                    <div className="flex items-center gap-xl font-mono text-xs">
                      <span>Gross: {GBP(grossRent, 2)}</span>
                      <span className="text-red-600">Fee: −{GBP(totalFeeL, 2)}</span>
                      {totalExp > 0 && <span className="text-red-600">Exp: −{GBP(totalExp, 2)}</span>}
                      <span className="font-bold text-neutral-900 text-base">= {GBP(netPayout, 2)}</span>
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Unassigned properties */}
            {unassigned.length > 0 && (
              <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-lg">
                <p className="text-sm font-semibold text-amber-800 mb-sm">
                  ⚠️ {unassigned.length} propert{unassigned.length === 1 ? 'y has' : 'ies have'} no landlord assigned
                </p>
                <ul className="text-xs text-amber-700 space-y-xs">
                  {unassigned.map((p) => (
                    <li key={p.id}>
                      → {p.name} — <a href={`/admin/properties/${p.id}`} className="underline">add landlord</a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB: AGENCY INCOME
        ══════════════════════════════════════════════════════════════════════ */}
        {tab === 'agency-income' && (
          <div className="space-y-xl">
            {/* Summary */}
            <div className="grid grid-cols-1 gap-md sm:grid-cols-3">
              <div className="rounded-2xl bg-neutral-900 text-white px-xl py-lg">
                <p className="text-xs text-white/50 uppercase tracking-wide">Expected fee income</p>
                <p className="text-4xl font-bold mt-xs">{GBP(totalFee, 2)}</p>
                <p className="text-sm text-white/60 mt-xs">{monthLabel(chargeMonth)}</p>
              </div>
              <div className="rounded-2xl bg-white border border-neutral-200 px-xl py-lg">
                <p className="text-xs text-neutral-500 uppercase tracking-wide">Annual run rate</p>
                <p className="text-3xl font-bold text-neutral-900 mt-xs">{GBP(totalFee * 12, 0)}</p>
                <p className="text-xs text-neutral-400 mt-xs">Based on current portfolio</p>
              </div>
              <div className="rounded-2xl bg-white border border-neutral-200 px-xl py-lg">
                <p className="text-xs text-neutral-500 uppercase tracking-wide">Rooms tracked</p>
                <p className="text-3xl font-bold text-neutral-900 mt-xs">{occupied.length}</p>
                <p className="text-xs text-neutral-400 mt-xs">
                  {vacant.length} vacant · {properties.length} properties
                </p>
              </div>
            </div>

            {/* Per-property breakdown */}
            <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    <th className="px-md py-sm">Property</th>
                    <th className="px-md py-sm hidden sm:table-cell">Landlord</th>
                    <th className="px-md py-sm text-right">Rooms</th>
                    <th className="px-md py-sm text-right">Fee %</th>
                    <th className="px-md py-sm text-right">Gross rent</th>
                    <th className="px-md py-sm text-right">Monthly fee</th>
                    <th className="px-md py-sm text-right">Annual fee</th>
                  </tr>
                </thead>
                <tbody>
                  {properties.map((prop) => {
                    const pRooms = allRooms.filter(
                      (r) => r.prop.id === prop.id && r.status !== 'vacant'
                    )
                    const pRent = pRooms.reduce((s, r) => s + r.rent, 0)
                    const pFee = pRooms.reduce((s, r) => s + r.fee, 0)
                    const feePct = prop.management_fee_pct ?? 12

                    return (
                      <tr key={prop.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                        <td className="px-md py-sm font-medium text-neutral-900">{prop.name}</td>
                        <td className="px-md py-sm hidden sm:table-cell text-neutral-500 text-xs">
                          {personName(prop.landlord)}
                        </td>
                        <td className="px-md py-sm text-right text-neutral-600">{pRooms.length}</td>
                        <td className="px-md py-sm text-right">
                          <span className={`inline-block rounded-full px-sm py-xs text-xs font-bold ${
                            feePct > 11 ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700'
                          }`}>
                            {feePct}%
                          </span>
                        </td>
                        <td className="px-md py-sm text-right font-mono">{GBP(pRent, 2)}</td>
                        <td className="px-md py-sm text-right font-mono font-semibold text-neutral-900">
                          {GBP(pFee, 2)}
                        </td>
                        <td className="px-md py-sm text-right font-mono text-neutral-500">
                          {GBP(pFee * 12, 0)}
                        </td>
                      </tr>
                    )
                  })}
                  {/* Total row */}
                  <tr className="border-t-2 border-neutral-300 bg-neutral-50 font-bold">
                    <td className="px-md py-md text-neutral-900">Portfolio total</td>
                    <td className="hidden sm:table-cell" />
                    <td className="px-md py-md text-right text-neutral-900">{occupied.length}</td>
                    <td className="px-md py-md text-right text-neutral-500 text-xs font-normal">mixed</td>
                    <td className="px-md py-md text-right font-mono">{GBP(totalExpected, 2)}</td>
                    <td className="px-md py-md text-right font-mono text-neutral-900">{GBP(totalFee, 2)}</td>
                    <td className="px-md py-md text-right font-mono">{GBP(totalFee * 12, 0)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="text-xs text-neutral-400">
              Fee income is calculated from <code>current_asking_rent × management_fee_pct</code> for occupied rooms.
              Set fee percentages in each property's Info tab. Figures are estimates — actual income depends on rent received.
            </p>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB: ARREARS
        ══════════════════════════════════════════════════════════════════════ */}
        {tab === 'arrears' && (
          <div>
            {arrears.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-emerald-300 bg-emerald-50 p-xl text-center">
                <p className="text-2xl mb-sm">✅</p>
                <p className="text-sm font-semibold text-emerald-800">No rooms flagged for arrears</p>
                <p className="text-xs text-emerald-700 mt-xs">
                  Use the Rent Roll to flag rooms as overdue or partial.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-red-50 text-left text-xs font-semibold uppercase tracking-wide text-red-600">
                      <th className="px-md py-sm">Property</th>
                      <th className="px-md py-sm">Room</th>
                      <th className="px-md py-sm">Tenant</th>
                      <th className="px-md py-sm text-right">Rent due</th>
                      <th className="px-md py-sm text-right">Received</th>
                      <th className="px-md py-sm text-right">Outstanding</th>
                      <th className="px-md py-sm">Status</th>
                      <th className="px-md py-sm">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {arrears.map(({ prop, room, charge, tenant, status }) => {
                      const outstanding =
                        charge ? charge.amount_due - charge.amount_received : room.current_asking_rent ?? 0
                      const isUpdating = updatingCharge === charge?.id

                      return (
                        <tr key={room.id} className="border-t border-neutral-100 bg-red-50/30">
                          <td className="px-md py-sm font-medium text-neutral-900">{prop.name}</td>
                          <td className="px-md py-sm text-neutral-700">{room.name}</td>
                          <td className="px-md py-sm text-neutral-500 text-xs">
                            {tenant ? (
                              <div>
                                <p>{personName(tenant)}</p>
                                {tenant.email && <p className="text-neutral-400">{tenant.email}</p>}
                              </div>
                            ) : '—'}
                          </td>
                          <td className="px-md py-sm text-right font-mono">
                            {charge ? GBP(charge.amount_due, 2) : GBP(room.current_asking_rent ?? 0, 2)}
                          </td>
                          <td className="px-md py-sm text-right font-mono text-emerald-700">
                            {charge ? GBP(charge.amount_received, 2) : '—'}
                          </td>
                          <td className="px-md py-sm text-right font-mono font-bold text-red-700">
                            {GBP(outstanding, 2)}
                          </td>
                          <td className="px-md py-sm">
                            <StatusPill status={status} />
                          </td>
                          <td className="px-md py-sm">
                            {charge && (
                              <div className="flex gap-xs">
                                <button
                                  disabled={isUpdating}
                                  onClick={() =>
                                    updateCharge(charge.id, {
                                      status: 'paid',
                                      amount_received: charge.amount_due,
                                      received_date: new Date().toISOString().split('T')[0],
                                    })
                                  }
                                  className="rounded-lg bg-emerald-600 px-sm py-xs text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  {isUpdating ? '…' : '✓ Mark paid'}
                                </button>
                                {tenant?.email && (
                                  <a
                                    href={`mailto:${tenant.email}?subject=Rent%20overdue%20at%20${encodeURIComponent(prop.name)}&body=Hi%20${encodeURIComponent(tenant.first_name || '')}%2C%0A%0AYour%20rent%20of%20${encodeURIComponent(GBP(outstanding, 2))}%20is%20currently%20outstanding.%0A%0APlease%20get%20in%20touch%20to%20resolve%20this.%0A%0ACapital%20Rooms`}
                                    className="rounded-lg border border-neutral-300 px-sm py-xs text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                                  >
                                    ✉ Email
                                  </a>
                                )}
                              </div>
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
        )}

      </main>
    </div>
  )
}
