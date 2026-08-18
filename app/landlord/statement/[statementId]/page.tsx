'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { getCurrentUser, signOut } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import Link from 'next/link'

interface StatementRoom {
  id: string
  room_number?: number
  tenant_name: string
  rent_income: number
  management_fee: number
  net_to_landlord: number
}

interface StatementCharge {
  id: string
  description: string
  category?: string
  amount: number
}

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
  management_fee_pct?: number
  paid_date?: string
  property_id: string
  properties?: { name: string; address: string }
  landlord_statement_rooms?: StatementRoom[]
  landlord_statement_charges?: StatementCharge[]
}

export default function StatementDetail() {
  const router = useRouter()
  const params = useParams()
  const [user, setUser] = useState<any>(null)
  const [statement, setStatement] = useState<Statement | null>(null)
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
      const statementId = params.statementId as string
      const landlordId = (data.assignment as any)?.id

      // Get basic statement first (skip problematic joins)
      const { data: stmtData, error: queryError } = await supabase
        .from('landlord_statements')
        .select('*')
        .eq('id', statementId)
        .eq('landlord_id', landlordId)
        .single()

      if (queryError) {
        console.error('Statement query error:', queryError)
      }

      if (stmtData) {
        // Get property info separately
        const { data: propData } = await supabase
          .from('properties')
          .select('name, address')
          .eq('id', stmtData.property_id)
          .single()

        // Rooms + expenses are stored as JSON on the statement row.
        const rawRooms: any[] = Array.isArray(stmtData.rooms) ? stmtData.rooms : []
        const rooms = rawRooms
          .map((r: any, i: number) => ({ id: `room-${i}`, ...r }))
          .sort((a: any, b: any) => (a.room_number ?? 0) - (b.room_number ?? 0))
        const rawExpenses: any[] = Array.isArray(stmtData.expenses) ? stmtData.expenses : []
        const charges = rawExpenses.map((e: any, i: number) => ({ id: `exp-${i}`, ...e }))

        setStatement({
          ...stmtData,
          properties: propData,
          landlord_statement_charges: charges,
          landlord_statement_rooms: rooms,
        })
      }

      setLoading(false)
    }

    checkAuth()
  }, [router, params])

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar
          right={
            <Link href="/landlord" className="text-sm font-semibold text-white hover:text-white/80">
              ← Statements
            </Link>
          }
        />
        <main className="mx-auto max-w-6xl px-lg py-2xl">
          <div className="animate-pulse space-y-lg">
            <div className="h-10 w-64 bg-neutral-300 rounded-lg"></div>
            <div className="h-32 bg-neutral-300 rounded-2xl"></div>
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
        <Link href="/landlord" className="text-sm text-blue-600 hover:text-blue-700 mb-2xl inline-block">
          ← Back to Statements
        </Link>

        {statement ? (
          <>
            {/* Header */}
            <div className="mb-3xl">
              <h1 className="text-3xl font-bold text-neutral-900">{statement.properties?.name || 'Statement'}</h1>
              <p className="text-neutral-600">{statement.properties?.address}</p>
              <div className="mt-lg grid grid-cols-2 gap-lg">
                <div>
                  <p className="text-xs text-neutral-600 font-bold uppercase">Statement Reference</p>
                  <p className="text-2xl font-bold text-neutral-900 mt-xs">{statement.statement_reference}</p>
                  <p className="text-sm text-neutral-600 mt-xs">
                    {new Date(statement.statement_date).toLocaleDateString('en-GB')}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-neutral-600 font-bold uppercase">Period Covered</p>
                  <p className="text-sm text-neutral-900 mt-xs">
                    {new Date(statement.period_start).toLocaleDateString('en-GB')} to{' '}
                    {new Date(statement.period_end).toLocaleDateString('en-GB')}
                  </p>
                </div>
              </div>
            </div>

            {(() => {
              const rooms = statement.landlord_statement_rooms || []
              const charges = statement.landlord_statement_charges || []
              const pct = statement.management_fee_pct != null
                ? Number(statement.management_fee_pct)
                : (Number(statement.gross_rent) ? Math.round((Number(statement.management_fees) / Number(statement.gross_rent)) * 1000) / 10 : null)
              const gbp = (v: any) => parseFloat(String(v || 0)).toFixed(2)

              return (
                <>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-lg mb-3xl">
                    <div className="rounded-2xl bg-neutral-900 text-white p-lg">
                      <p className="text-xs font-bold uppercase tracking-widest text-white/60 break-words">Gross Rent</p>
                      <p className="text-xl md:text-2xl font-bold mt-md">£{gbp(statement.gross_rent)}</p>
                    </div>
                    <div className="rounded-2xl bg-neutral-900 text-white p-lg">
                      <p className="text-xs font-bold uppercase tracking-widest text-white/60 break-words">Management{pct != null ? ` (${pct}%)` : ''}</p>
                      <p className="text-xl md:text-2xl font-bold text-red-400 mt-md">-£{gbp(statement.management_fees)}</p>
                    </div>
                    <div className="rounded-2xl bg-neutral-900 text-white p-lg">
                      <p className="text-xs font-bold uppercase tracking-widest text-white/60 break-words">Expenses</p>
                      <p className="text-xl md:text-2xl font-bold text-red-400 mt-md">-£{gbp(statement.property_charges)}</p>
                    </div>
                    <div className="rounded-2xl bg-gradient-to-br from-blue-900 to-blue-800 text-white p-lg">
                      <p className="text-xs font-bold uppercase tracking-widest text-white/60 break-words">Net to You</p>
                      <p className="text-xl md:text-2xl font-bold text-green-400 mt-md">£{gbp(statement.net_to_landlord)}</p>
                    </div>
                  </div>

                  {rooms.length > 0 ? (
                    <div className="rounded-2xl bg-white border border-neutral-200 overflow-hidden">
                      {/* Expenses first */}
                      {charges.length > 0 && (
                        <div className="border-b border-neutral-200">
                          <p className="px-lg pt-lg text-xs font-bold uppercase tracking-widest text-neutral-500">Expenses this period</p>
                          {charges.map((c) => (
                            <div key={c.id} className="flex justify-between items-center px-lg py-sm">
                              <p className="text-neutral-900">{c.description}</p>
                              <p className="font-bold text-red-600">-£{gbp(c.amount)}</p>
                            </div>
                          ))}
                          <div className="flex justify-between items-center px-lg py-sm bg-neutral-50 font-bold">
                            <p>Total expenses</p>
                            <p className="text-red-600">-£{gbp(statement.property_charges)}</p>
                          </div>
                        </div>
                      )}

                      {/* Room rents by number */}
                      <p className="px-lg pt-lg text-xs font-bold uppercase tracking-widest text-neutral-500">Room rents received</p>
                      <div className="hidden sm:grid grid-cols-[1fr_6rem_6rem_6rem] gap-sm px-lg pt-sm text-[10px] font-bold uppercase tracking-wide text-neutral-400">
                        <span>Room / tenant</span><span className="text-right">Rent</span><span className="text-right">Fee</span><span className="text-right">Net</span>
                      </div>
                      {rooms.map((room, idx) => (
                        <div key={room.id} className="grid grid-cols-[1fr_6rem_6rem_6rem] gap-sm items-center px-lg py-sm border-b border-neutral-100">
                          <div>
                            <p className="font-semibold text-neutral-900">Room {room.room_number ?? idx + 1}{room.tenant_name ? ` — ${room.tenant_name}` : ''}</p>
                          </div>
                          <p className="text-right text-neutral-900">£{gbp(room.rent_income)}</p>
                          <p className="text-right text-red-600">-£{gbp(room.management_fee)}</p>
                          <p className="text-right font-bold text-green-700">£{gbp(room.net_to_landlord)}</p>
                        </div>
                      ))}

                      {/* Roll-up */}
                      <div className="px-lg py-md space-y-xs">
                        <div className="flex justify-between text-sm"><span className="text-neutral-600">Gross rent (rooms)</span><span className="font-bold">£{gbp(statement.gross_rent)}</span></div>
                        <div className="flex justify-between text-sm"><span className="text-neutral-600">Management fee{pct != null ? ` (${pct}%)` : ''}</span><span className="font-bold text-red-600">-£{gbp(statement.management_fees)}</span></div>
                        <div className="flex justify-between text-sm"><span className="text-neutral-600">Expenses</span><span className="font-bold text-red-600">-£{gbp(statement.property_charges)}</span></div>
                      </div>
                      <div className="flex justify-between items-center px-lg py-md bg-neutral-900 text-white">
                        <span className="font-bold">Net to you</span>
                        <span className="text-2xl font-bold text-green-400">£{gbp(statement.net_to_landlord)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl bg-blue-50 border border-blue-200 p-lg">
                      <p className="text-sm text-blue-900 mb-md"><strong>📊 Statement summary</strong></p>
                      <div className="grid grid-cols-2 gap-md text-sm">
                        <div>
                          <p className="text-blue-800 font-bold">Total rent collected</p>
                          <p className="text-blue-900 text-lg font-bold">£{gbp(statement.gross_rent)}</p>
                        </div>
                        <div>
                          <p className="text-blue-800 font-bold">After fees &amp; expenses</p>
                          <p className="text-blue-900 text-lg font-bold">£{gbp(statement.net_to_landlord)}</p>
                        </div>
                      </div>
                      <p className="text-xs text-blue-800 mt-md border-t border-blue-200 pt-md">
                        The room-by-room breakdown shows here for statements entered per room.
                      </p>
                    </div>
                  )}
                </>
              )
            })()}

            {/* Payment Status */}
            {statement.paid_date && (
              <div className="mt-lg rounded-2xl bg-green-50 border border-green-200 p-lg">
                <p className="text-sm font-bold text-green-900">✓ Payment Completed</p>
                <p className="text-sm text-green-800 mt-xs">
                  Paid on {new Date(statement.paid_date).toLocaleDateString('en-GB')}
                </p>
                <p className="text-2xl font-bold text-green-900 mt-md">£{parseFloat(String(statement.net_to_landlord || 0)).toFixed(2)}</p>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-2xl bg-blue-50 border border-blue-200 p-3xl">
            <h1 className="text-3xl font-bold text-blue-900 mb-lg">Statement Details</h1>
            <p className="text-base text-blue-900 mb-lg">
              Detailed statement views are ready! Once you import PDF statements through the system, you'll see them displayed here with:
            </p>
            <ul className="space-y-sm list-disc list-inside text-base text-blue-900 mb-lg">
              <li>Full financial breakdown</li>
              <li>Room-by-room rent details</li>
              <li>Itemized property charges</li>
              <li>Payment status and date</li>
            </ul>
            <Link
              href="/landlord"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-md px-lg rounded-lg transition-colors"
            >
              Return to Statements
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
