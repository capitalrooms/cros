'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { sortPropertiesNumerically } from '@/lib/sortProperties'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RentCharge {
  id: string
  room_id: string
  property_id: string
  charge_month: string
  amount_due: number
  amount_received: number
  status: 'pending' | 'partial' | 'paid' | 'overdue' | 'waived'
  payment_method: string | null
  paid_at: string | null
}

interface Room {
  id: string
  name: string
  status: string | null
  current_asking_rent: number | null
}

interface Person {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
}

interface Tenancy {
  id: string
  room_id: string
  person_id: string
  rent_amount: number | null
  payment_reference: string | null
  people: Person | null
}

interface Property {
  id: string
  name: string
  address: string | null
  management_fee_pct: number | null
  rooms: Room[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const GBP = (n: number) =>
  n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2 })

function firstOfMonth(d = new Date()): string {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]
}

function monthLabel(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

function personName(p: Person | null | undefined): string {
  if (!p) return '—'
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || '—'
}

const STATUS_CHIP: Record<string, { label: string; className: string }> = {
  paid:    { label: 'Paid',    className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  pending: { label: 'Pending', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  partial: { label: 'Partial', className: 'bg-blue-50 text-blue-800 border-blue-200' },
  overdue: { label: 'Overdue', className: 'bg-red-100 text-red-800 border-red-200' },
  waived:  { label: 'Waived',  className: 'bg-neutral-100 text-neutral-500 border-neutral-200' },
}

function StatusChip({ status }: { status: string }) {
  const s = STATUS_CHIP[status] ?? { label: status, className: 'bg-neutral-100 text-neutral-600' }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${s.className}`}>
      {s.label}
    </span>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RentChargesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [chargeMonth, setChargeMonth] = useState(firstOfMonth())
  const [properties, setProperties] = useState<Property[]>([])
  const [tenancyByRoom, setTenancyByRoom] = useState<Record<string, Tenancy>>({})
  const [chargesByRoom, setChargesByRoom] = useState<Record<string, RentCharge>>({})
  const [updatingRoom, setUpdatingRoom] = useState<string | null>(null)
  const [generateResult, setGenerateResult] = useState<string | null>(null)
  const [expandedProps, setExpandedProps] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    const [y, m] = chargeMonth.split('-').map(Number)
    const monthEnd = new Date(y, m, 1).toISOString().split('T')[0]
    const monthStart = chargeMonth

    const [propsRes, tenanciesRes, chargesRes] = await Promise.all([
      supabase
        .from('properties')
        .select('id, name, address, management_fee_pct, rooms(id, name, status, current_asking_rent)')
        .order('name'),

      supabase
        .from('tenancies')
        .select('id, room_id, person_id, rent_amount, payment_reference, people:people!person_id(id, first_name, last_name, email)')
        .lte('start_date', monthEnd)
        .or(`end_date.is.null,end_date.gte.${monthStart}`),

      supabase
        .from('rent_charges')
        .select('id, room_id, property_id, charge_month, amount_due, amount_received, status, payment_method, paid_at')
        .eq('charge_month', monthStart),
    ])

    const byRoom: Record<string, Tenancy> = {}
    for (const t of (tenanciesRes.data as any[]) || []) {
      byRoom[t.room_id] = t
    }

    const chargesMap: Record<string, RentCharge> = {}
    for (const c of (chargesRes.data as any[]) || []) {
      chargesMap[c.room_id] = c
    }

    setProperties(sortPropertiesNumerically((propsRes.data as any[]) || []))
    setTenancyByRoom(byRoom)
    setChargesByRoom(chargesMap)
    setLoading(false)
  }, [chargeMonth])

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser()
      if (!user || !['administrator', 'admin', 'lettings'].includes(user.assignment?.role || '')) {
        router.push('/login')
        return
      }
      await load()
    }
    init()
  }, [router, load])

  // ── Generate charges for all occupied rooms this month ──
  async function generateCharges() {
    setGenerating(true)
    setGenerateResult(null)
    try {
      const res = await fetch('/api/accounts/generate-charges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: chargeMonth }),
      })
      const json = await res.json()
      if (json.ok) {
        setGenerateResult(`✅ ${json.created} charge${json.created !== 1 ? 's' : ''} created (${json.total} tenancies found)`)
        await load()
      } else {
        setGenerateResult(`❌ ${json.error}`)
      }
    } finally {
      setGenerating(false)
    }
  }

  // ── Mark a room paid / overdue / reset ──
  async function updateCharge(
    roomId: string,
    propertyId: string,
    amountDue: number,
    update: { status: string; amount_received?: number; paid_at?: string | null }
  ) {
    setUpdatingRoom(roomId)
    try {
      const existing = chargesByRoom[roomId]

      if (existing) {
        // Update existing charge
        const supabase = createClient()
        const { error } = await supabase
          .from('rent_charges')
          .update({ ...update, payment_method: update.status === 'paid' ? 'manual' : null })
          .eq('id', existing.id)
        if (!error) {
          setChargesByRoom(prev => ({
            ...prev,
            [roomId]: { ...prev[roomId], ...update },
          }))
        }
      } else {
        // Auto-generate the charge then apply update
        const res = await fetch('/api/accounts/generate-charges', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ month: chargeMonth, room_id: roomId, property_id: propertyId, amount_due: amountDue }),
        })
        const json = await res.json()
        if (json.charge_id) {
          const supabase = createClient()
          await supabase
            .from('rent_charges')
            .update({ ...update, payment_method: update.status === 'paid' ? 'manual' : null })
            .eq('id', json.charge_id)
          await load()
        }
      }
    } finally {
      setUpdatingRoom(null)
    }
  }

  // ── Derived stats ──
  const allCharges = Object.values(chargesByRoom)
  const totalExpected = Object.values(tenancyByRoom).reduce((s, t) => s + (t.rent_amount ?? 0), 0)
  const totalCollected = allCharges.filter(c => c.status === 'paid').reduce((s, c) => s + c.amount_received, 0)
  const totalPending = allCharges.filter(c => ['pending', 'partial', 'overdue'].includes(c.status))
    .reduce((s, c) => s + (c.amount_due - c.amount_received), 0)
  const chargesGenerated = allCharges.length
  const occupiedRooms = Object.keys(tenancyByRoom).length

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton href="/admin" />} title="Rent Charges" />
        <div className="flex items-center justify-center py-3xl">
          <p className="text-sm text-neutral-500">Loading rent charges…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin" />} title="Rent Charges" />

      <div className="mx-auto max-w-6xl px-lg py-xl">

        {/* Header */}
        <div className="mb-xl flex flex-wrap items-end justify-between gap-md">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Rent Charges</h1>
            <p className="text-sm text-neutral-500 mt-xs">Track, generate and mark rent payments by month</p>
          </div>
          <div className="flex items-center gap-sm flex-wrap">
            <input
              type="month"
              value={chargeMonth.slice(0, 7)}
              onChange={(e) => {
                const [y, m] = e.target.value.split('-')
                setChargeMonth(`${y}-${m.padStart(2, '0')}-01`)
                setGenerateResult(null)
              }}
              className="rounded-xl border border-neutral-300 bg-white px-md py-sm text-sm"
            />
            <button
              onClick={generateCharges}
              disabled={generating}
              className="rounded-xl bg-neutral-900 px-lg py-sm text-sm font-bold text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              {generating ? 'Generating…' : `⚡ Generate ${monthLabel(chargeMonth)} charges`}
            </button>
          </div>
        </div>

        {/* Generate result banner */}
        {generateResult && (
          <div className={`mb-lg rounded-xl px-lg py-md text-sm font-medium ${
            generateResult.startsWith('✅') ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {generateResult}
          </div>
        )}

        {/* Stats row */}
        <div className="mb-xl grid grid-cols-2 gap-md sm:grid-cols-4">
          {[
            { label: 'Occupied rooms', value: occupiedRooms.toString(), sub: monthLabel(chargeMonth) },
            { label: 'Charges generated', value: chargesGenerated.toString(), sub: `${occupiedRooms - chargesGenerated} without a charge` },
            { label: 'Confirmed collected', value: GBP(totalCollected), sub: `${allCharges.filter(c=>c.status==='paid').length} paid` },
            { label: 'Outstanding', value: GBP(totalPending), sub: `${allCharges.filter(c=>['overdue','partial'].includes(c.status)).length} flagged` },
          ].map(stat => (
            <div key={stat.label} className="rounded-2xl bg-white border border-neutral-200 px-lg py-md">
              <p className="text-xs text-neutral-500 uppercase tracking-wide">{stat.label}</p>
              <p className="text-2xl font-bold text-neutral-900 mt-xs font-mono">{stat.value}</p>
              <p className="text-xs text-neutral-400 mt-xs">{stat.sub}</p>
            </div>
          ))}
        </div>

        {/* No charges yet prompt */}
        {chargesGenerated === 0 && occupiedRooms > 0 && (
          <div className="mb-xl rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-xl text-center">
            <p className="text-base font-semibold text-amber-900 mb-xs">No charges generated for {monthLabel(chargeMonth)}</p>
            <p className="text-sm text-amber-700 mb-lg">
              {occupiedRooms} occupied room{occupiedRooms !== 1 ? 's' : ''} found. Click "Generate charges" to create rent charge rows for all tenants.
            </p>
            <button
              onClick={generateCharges}
              disabled={generating}
              className="rounded-xl bg-amber-700 px-xl py-md text-sm font-bold text-white hover:bg-amber-800 disabled:opacity-50"
            >
              {generating ? 'Generating…' : '⚡ Generate charges now'}
            </button>
          </div>
        )}

        {/* Property sections */}
        {properties.map((prop) => {
          const propRooms = prop.rooms.filter(r => tenancyByRoom[r.id])
          if (!propRooms.length) return null

          const propCharges = propRooms.map(r => chargesByRoom[r.id]).filter(Boolean)
          const propCollected = propCharges.filter(c => c.status === 'paid').reduce((s, c) => s + c.amount_received, 0)
          const propExpected = propRooms.reduce((s, r) => s + (tenancyByRoom[r.id]?.rent_amount ?? 0), 0)
          const paidCount = propCharges.filter(c => c.status === 'paid').length
          const overdueCount = propCharges.filter(c => c.status === 'overdue').length
          const isExpanded = expandedProps.has(prop.id)

          return (
            <div key={prop.id} className="mb-lg rounded-2xl border border-neutral-200 bg-white overflow-hidden">
              {/* Property header — clickable to expand/collapse */}
              <button
                className="w-full flex items-center justify-between px-xl py-lg text-left hover:bg-neutral-50 transition-colors"
                onClick={() => setExpandedProps(prev => {
                  const next = new Set(prev)
                  next.has(prop.id) ? next.delete(prop.id) : next.add(prop.id)
                  return next
                })}
              >
                <div>
                  <h2 className="font-bold text-neutral-900">{prop.name}</h2>
                  <p className="text-xs text-neutral-500 mt-xs">
                    {propRooms.length} tenants · Expected {GBP(propExpected)} ·{' '}
                    Collected {GBP(propCollected)} ·{' '}
                    {paidCount}/{propRooms.length} paid
                    {overdueCount > 0 && <span className="ml-sm text-red-600 font-semibold">· {overdueCount} overdue</span>}
                  </p>
                </div>
                <div className="flex items-center gap-sm">
                  {/* Progress bar */}
                  <div className="hidden sm:block w-24 rounded-full bg-neutral-100 h-2 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${propExpected > 0 ? Math.min(100, (propCollected / propExpected) * 100) : 0}%` }}
                    />
                  </div>
                  <span className="text-neutral-400 text-sm">{isExpanded ? '▲' : '▼'}</span>
                </div>
              </button>

              {/* Room rows */}
              {isExpanded && (
                <div className="border-t border-neutral-100">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        <th className="px-xl py-sm text-left">Room</th>
                        <th className="px-md py-sm text-left hidden sm:table-cell">Tenant</th>
                        <th className="px-md py-sm text-left hidden md:table-cell">Reference</th>
                        <th className="px-md py-sm text-right">Due</th>
                        <th className="px-md py-sm text-right hidden sm:table-cell">Received</th>
                        <th className="px-md py-sm">Status</th>
                        <th className="px-xl py-sm">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {propRooms.map(room => {
                        const tenancy = tenancyByRoom[room.id]
                        const charge = chargesByRoom[room.id]
                        const amountDue = charge?.amount_due ?? tenancy?.rent_amount ?? 0
                        const amountReceived = charge?.amount_received ?? 0
                        const status = charge?.status ?? 'pending'
                        const isUpdating = updatingRoom === room.id

                        return (
                          <tr
                            key={room.id}
                            className={`border-t border-neutral-100 ${
                              status === 'overdue' ? 'bg-red-50/40' :
                              status === 'paid' ? 'bg-emerald-50/20' : ''
                            }`}
                          >
                            <td className="px-xl py-md font-medium text-neutral-900">{room.name}</td>
                            <td className="px-md py-md hidden sm:table-cell text-neutral-500 text-xs">
                              {personName(tenancy?.people)}
                            </td>
                            <td className="px-md py-md hidden md:table-cell">
                              {tenancy?.payment_reference ? (
                                <code className="rounded bg-neutral-100 px-sm py-xs text-xs text-neutral-700">
                                  {tenancy.payment_reference}
                                </code>
                              ) : (
                                <span className="text-neutral-300 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-md py-md text-right font-mono text-neutral-900">
                              {GBP(amountDue)}
                            </td>
                            <td className="px-md py-md text-right font-mono hidden sm:table-cell">
                              {amountReceived > 0 ? (
                                <span className="text-emerald-700">{GBP(amountReceived)}</span>
                              ) : (
                                <span className="text-neutral-300">—</span>
                              )}
                            </td>
                            <td className="px-md py-md">
                              <StatusChip status={status} />
                              {status === 'paid' && charge?.paid_at && (
                                <p className="text-xs text-neutral-400 mt-xs">
                                  {new Date(charge.paid_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                  {charge.payment_method && ` · ${charge.payment_method.replace('_', ' ')}`}
                                </p>
                              )}
                            </td>
                            <td className="px-xl py-md">
                              <div className="flex items-center gap-xs">
                                {status !== 'paid' && (
                                  <button
                                    disabled={isUpdating}
                                    onClick={() => updateCharge(room.id, prop.id, amountDue, {
                                      status: 'paid',
                                      amount_received: amountDue,
                                      paid_at: new Date().toISOString(),
                                    })}
                                    className="rounded-lg bg-emerald-600 px-sm py-xs text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap"
                                  >
                                    {isUpdating ? '…' : '✓ Mark paid'}
                                  </button>
                                )}
                                {status !== 'overdue' && status !== 'paid' && status !== 'waived' && (
                                  <button
                                    disabled={isUpdating}
                                    onClick={() => updateCharge(room.id, prop.id, amountDue, { status: 'overdue' })}
                                    className="rounded-lg border border-red-200 px-sm py-xs text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                                  >
                                    Flag overdue
                                  </button>
                                )}
                                {status === 'paid' && (
                                  <button
                                    disabled={isUpdating}
                                    onClick={() => updateCharge(room.id, prop.id, amountDue, {
                                      status: 'pending',
                                      amount_received: 0,
                                      paid_at: null,
                                    })}
                                    className="rounded-lg border border-neutral-200 px-sm py-xs text-xs text-neutral-400 hover:bg-neutral-50 disabled:opacity-50"
                                  >
                                    Reset
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}

        {properties.every(p => !p.rooms.some(r => tenancyByRoom[r.id])) && (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
            <p className="text-sm text-neutral-500">No active tenancies found for {monthLabel(chargeMonth)}</p>
          </div>
        )}

      </div>
    </div>
  )
}
