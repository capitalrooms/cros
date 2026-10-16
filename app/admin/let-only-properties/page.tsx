'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import PageHero, { HeroButton } from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'
import { blockAddress, inlineAddress } from '@/lib/formatAddress'
import AddLetOnlyModal from '@/app/components/AddLetOnlyModal'

interface Tenancy {
  id: string
  start_date: string
  rent_amount: number
  deposit_amount: number
  payment_reference: string | null
  letting_fee_charged: number | null
  person: { first_name: string | null; last_name: string | null; full_name: string | null } | null
}

interface LetOnlyProperty {
  id: string
  name: string
  address: string
  bank_account_name: string | null
  bank_sort_code: string | null
  bank_account_number: string | null
  bank_iban: string | null
  bank_swift: string | null
  bank_payment_ref: string | null
  letting_fee_pct: number | null
  letting_fee_flat: number | null
  rent_due_preference: string | null
  rooms: { id: string; name: string; status: string; current_asking_rent: number | null; activeTenancy?: Tenancy | null }[]
  landlord: { full_name: string | null; first_name: string | null; last_name: string | null; email: string | null; phone: string | null } | null
}

function pctToFraction(pct: number): string {
  const fractions: Record<number, string> = { 25: '¼', 33: '⅓', 50: '½', 67: '⅔', 75: '¾', 100: '1' }
  return fractions[Math.round(pct)] ? `${fractions[Math.round(pct)]} of first month's rent` : `${pct}% of first month's rent`
}

function calcFee(tenancy: Tenancy, prop: LetOnlyProperty): number {
  if (tenancy.letting_fee_charged != null) return tenancy.letting_fee_charged
  if (prop.letting_fee_flat) return prop.letting_fee_flat
  if (prop.letting_fee_pct) return Math.round((tenancy.rent_amount * prop.letting_fee_pct / 100) * 100) / 100
  return 0
}

function fmtGBP(n: number) {
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function LetOnlyPropertiesPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [letOnlyProperties, setLetOnlyProperties] = useState<LetOnlyProperty[]>([])
  // "+ Add let-only property" takes a new address, landlord and rooms (16 Oct 2026) — it used to only offer to flip a
  // managed house to let-only, which is never what's wanted here (that lives in the property's own settings)
  const [showAdd, setShowAdd] = useState(false)
  const [generatingStatement, setGeneratingStatement] = useState<string | null>(null)
  const [generatingBalance, setGeneratingBalance] = useState<string | null>(null)
  // Rent-mode picker: tenancyId → show mode selector dropdown
  const [balancePicker, setBalancePicker] = useState<string | null>(null)
  // who lives in each room, from the landlord's own list (let_only_occupants — reference only, never a tenancy)
  const [occupants, setOccupants] = useState<Map<string, any>>(new Map())

  useEffect(() => { loadData() }, [])

  // Close balance picker on outside click
  useEffect(() => {
    if (!balancePicker) return
    const handler = () => setBalancePicker(null)
    document.addEventListener('click', handler, { capture: true, once: true })
    return () => document.removeEventListener('click', handler, { capture: true })
  }, [balancePicker])

  async function loadData() {
    const [{ data: letOnly }] = await Promise.all([
      supabase
        .from('properties')
        .select(`
          id, name, address, letting_type,
          bank_account_name, bank_sort_code, bank_account_number,
          bank_iban, bank_swift, bank_payment_ref,
          letting_fee_pct, letting_fee_flat, rent_due_preference,
          rooms(id, name, status, current_asking_rent,
            tenancies!room_id(id, start_date, rent_amount, deposit_amount, payment_reference, letting_fee_charged,
              people!person_id(salutation, first_name, last_name, full_name)
            )
          ),
          people!landlord_id(full_name, salutation, first_name, last_name, email, phone)
        `)
        .eq('letting_type', 'let_only')
        .order('name'),
    ])

    setLetOnlyProperties((letOnly || []).map((p: any) => ({
      ...p,
      rooms: (Array.isArray(p.rooms) ? p.rooms : p.rooms ? [p.rooms] : []).map((r: any) => {
        const tenancies = Array.isArray(r.tenancies) ? r.tenancies : r.tenancies ? [r.tenancies] : []
        const today = new Date().toISOString().slice(0, 10)
        const active = tenancies.find((t: any) => t.start_date <= today) || tenancies[0] || null
        return { ...r, activeTenancy: active ? { ...active, person: active.people || null } : null }
      }),
      landlord: p.people || null,
    })))
    const { data: occ } = await supabase.from('let_only_occupants').select('room_id, name, phone, move_in, rent, source').is('ended_at', null)
    setOccupants(new Map(((occ ?? []) as any[]).map(o => [o.room_id, o])))
    setLoading(false)
  }

  async function generateStatement(tenancyId: string) {
    setGeneratingStatement(tenancyId)
    try {
      const res = await fetch(`/api/lettings-statement/${tenancyId}`)
      if (!res.ok) throw new Error('Failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'Lettings-Statement.pdf'; a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Could not generate statement — check bank details and tenant are set on this property.')
    } finally {
      setGeneratingStatement(null)
    }
  }

  async function generateCheckInBalance(tenancyId: string, mode: 'full' | 'prorata' = 'full') {
    setGeneratingBalance(tenancyId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = {}
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
      const res = await fetch(`/api/lettings/check-in-balance/${tenancyId}?mode=${mode}`, { headers })
      if (!res.ok) throw new Error('Failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `Check-In-Balance.pdf`; a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Could not generate check-in balance demand — check tenant, rent, and deposit are set on this tenancy.')
    } finally {
      setGeneratingBalance(null)
    }
  }

  function statusPill(status: string) {
    const cfg: Record<string, { cls: string; label: string }> = {
      occupied:  { cls: 'bg-blue-100 text-blue-800',    label: 'Occupied' },
      on_notice: { cls: 'bg-amber-100 text-amber-800',  label: 'On notice' },
      available: { cls: 'bg-emerald-100 text-emerald-800', label: 'Available' },
    }
    const c = cfg[status] || { cls: 'bg-neutral-100 text-neutral-600', label: status }
    return <span className={`inline-block px-sm py-0.5 rounded-full text-[11px] font-semibold ${c.cls}`}>{c.label}</span>
  }

  // ── Summary stats ─────────────────────────────────────────────────────────
  const totalRooms    = letOnlyProperties.reduce((s, p) => s + p.rooms.length, 0)
  const totalOccupied = letOnlyProperties.reduce((s, p) => s + p.rooms.filter(r => r.activeTenancy).length, 0)
  const totalMonthly  = letOnlyProperties.reduce((s, p) =>
    s + p.rooms.reduce((rs, r) => rs + (r.activeTenancy?.rent_amount ?? 0), 0), 0)
  const totalFees = letOnlyProperties.reduce((s, p) =>
    s + p.rooms.reduce((rs, r) => rs + (r.activeTenancy ? calcFee(r.activeTenancy, p) : 0), 0), 0)

  if (loading) return <GenericPageSkeleton />

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin" />} />
      <PageHero
        title="Let-only properties"
        subtitle="Capital Rooms finds the tenant — the landlord manages from then on"
        stats={letOnlyProperties.length > 0 ? [
          { label: 'Properties', value: letOnlyProperties.length },
          { label: 'Rooms occupied', value: `${totalOccupied} / ${totalRooms}` },
          { label: 'Monthly rent', value: totalMonthly > 0 ? fmtGBP(totalMonthly) : '—', tone: 'good' },
          { label: 'Letting fees', value: totalFees > 0 ? fmtGBP(totalFees) : '—', tone: 'warn' },
        ] : undefined}
        actions={<>
          <HeroButton onClick={() => router.push('/admin/let-only-properties/room-list')}>Update from landlord’s list</HeroButton>
          <HeroButton primary onClick={() => setShowAdd(true)}>+ Add let-only property</HeroButton>
        </>}
      />

      <main className="mx-auto max-w-6xl px-lg py-xl">

        {/* ── Properties list ───────────────────────────────────────────── */}
        {letOnlyProperties.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-3xl text-center">
            <p className="text-4xl mb-md">🔑</p>
            <p className="text-base font-semibold text-neutral-700">No let-only properties yet</p>
            <p className="text-sm text-neutral-400 mt-xs max-w-6xl mx-auto">
              Add the address, the landlord and the rooms — then send offers, book viewings and draw up agreements as usual.
            </p>
            <button
              onClick={() => setShowAdd(true)}
              className="mt-lg rounded-xl bg-neutral-900 px-xl py-sm text-sm font-semibold text-white hover:bg-neutral-700 transition"
            >
              Add let-only property
            </button>
          </div>
        ) : (
          <div className="space-y-xl">
            {letOnlyProperties.map(prop => {
              const hasBankDetails = !!(prop.bank_account_name && prop.bank_sort_code)
              const landlordName = prop.landlord
                ? ([prop.landlord.salutation, prop.landlord.first_name, prop.landlord.last_name].filter(Boolean).join(' ') || prop.landlord.full_name || '—')
                : '—'
              const occupied  = prop.rooms.filter(r => r.status === 'occupied').length
              const onNotice  = prop.rooms.filter(r => r.status === 'on_notice').length
              const available = prop.rooms.filter(r => r.status === 'available').length

              return (
                <div key={prop.id} className="rounded-2xl border border-neutral-200 bg-white overflow-hidden shadow-sm">

                  {/* Property header */}
                  <div className="bg-neutral-50 border-b border-neutral-200 px-lg md:px-xl py-md flex flex-col gap-sm sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-md min-w-0">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-sm">
                          <span className="text-base font-bold text-neutral-900">{prop.name}</span>
                          <span className="text-[11px] font-semibold px-sm py-0.5 rounded-full bg-purple-100 text-purple-800 tracking-wide">LET ONLY</span>
                          {!hasBankDetails && (
                            <span className="text-[11px] font-semibold px-sm py-0.5 rounded-full bg-amber-100 text-amber-800">⚠ Bank details missing</span>
                          )}
                        </div>
                        <p className="text-xs text-neutral-500 mt-0.5 whitespace-pre-line">{blockAddress(prop.address)}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-md">
                      <div className="sm:text-right">
                        <p className="text-xs text-neutral-400">Landlord</p>
                        <p className="text-sm font-semibold text-neutral-800">{landlordName}</p>
                        {prop.landlord?.phone && <p className="text-xs text-neutral-400">{prop.landlord.phone}</p>}
                      </div>
                      <button
                        onClick={() => router.push(`/admin/properties/${prop.id}`)}
                        className="text-xs font-semibold text-neutral-600 border border-neutral-200 rounded-lg px-md py-xs hover:bg-neutral-100 transition whitespace-nowrap"
                      >
                        Open property →
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-5">

                    {/* Rooms — wider column */}
                    <div className="lg:col-span-3 px-lg md:px-xl py-lg border-b lg:border-b-0 lg:border-r border-neutral-100">
                      <div className="flex items-center justify-between mb-md">
                        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                          Rooms · {prop.rooms.length} total
                        </p>
                        <div className="flex gap-sm">
                          {occupied > 0  && <span className="text-[11px] bg-blue-50 text-blue-700 font-semibold px-sm py-0.5 rounded-full border border-blue-100">{occupied} occupied</span>}
                          {onNotice > 0  && <span className="text-[11px] bg-amber-50 text-amber-700 font-semibold px-sm py-0.5 rounded-full border border-amber-100">{onNotice} notice</span>}
                          {available > 0 && <span className="text-[11px] bg-emerald-50 text-emerald-700 font-semibold px-sm py-0.5 rounded-full border border-emerald-100">{available} available</span>}
                        </div>
                      </div>

                      {prop.rooms.length === 0 ? (
                        <p className="text-sm text-neutral-400 py-md">No rooms set up on this property yet.</p>
                      ) : (
                        <div className="divide-y divide-neutral-100">
                          {prop.rooms.map(room => {
                            const t = room.activeTenancy
                            const tenantName = t?.person
                              ? ([t.person.salutation, t.person.first_name, t.person.last_name].filter(Boolean).join(' ') || t.person.full_name)
                              : null
                            const fee        = t ? calcFee(t, prop) : 0
                            const dueToLL    = t ? (t.rent_amount + t.deposit_amount - fee) : 0
                            const feeLabel   = prop.letting_fee_pct ? pctToFraction(prop.letting_fee_pct)
                                             : prop.letting_fee_flat ? `£${prop.letting_fee_flat} flat`
                                             : ''

                            return (
                              <div key={room.id} className="py-md">
                                <div className="flex items-start justify-between gap-md">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-sm mb-0.5">
                                      <span className="text-sm font-semibold text-neutral-900">{room.name}</span>
                                      {statusPill(room.status)}
                                    </div>

                                    {t ? (
                                      <>
                                        {tenantName && (
                                          <p className="text-sm text-neutral-700">{tenantName}</p>
                                        )}
                                        <div className="flex gap-md mt-xs flex-wrap">
                                          <span className="text-xs text-neutral-500">Rent <strong className="text-neutral-800">{fmtGBP(t.rent_amount)}/mo</strong></span>
                                          <span className="text-xs text-neutral-500">Deposit <strong className="text-neutral-800">{fmtGBP(t.deposit_amount)}</strong></span>
                                          {fee > 0 && <span className="text-xs text-neutral-500">CR fee <strong className="text-red-700">{fmtGBP(fee)}</strong></span>}
                                          <span className="text-xs text-neutral-500">→ Due to landlord <strong className="text-neutral-900">{fmtGBP(dueToLL)}</strong></span>
                                        </div>
                                        {t.payment_reference && (
                                          <p className="text-[11px] font-mono text-neutral-400 mt-xs">Ref: {t.payment_reference}</p>
                                        )}
                                      </>
                                    ) : occupants.get(room.id) ? (() => {
                                      const o = occupants.get(room.id)
                                      return (
                                        <div className="mt-xs">
                                          <p className="text-sm text-neutral-700">{o.name}{o.phone && <span className="ml-sm text-xs tabular-nums text-neutral-500">{o.phone}</span>}</p>
                                          <p className="text-xs text-neutral-500">
                                            {o.move_in ? `${o.move_in > new Date().toISOString().slice(0, 10) ? 'Moving in' : 'Since'} ${o.move_in.split('-').reverse().join('/')} · ` : ''}
                                            {o.rent ? `${fmtGBP(Number(o.rent))}/mo · ` : ''}<span className="text-neutral-400">{o.source || 'from the landlord'}</span>
                                          </p>
                                        </div>
                                      )
                                    })() : (
                                      <p className="text-xs text-neutral-400 mt-xs">
                                        {room.current_asking_rent ? `Marketing at ${fmtGBP(room.current_asking_rent)}/mo` : 'No active tenancy'}
                                      </p>
                                    )}
                                  </div>

                                  {t && (
                                    <div className="flex-shrink-0 flex flex-col gap-xs relative">
                                      {/* Check-in balance demand — click opens rent-mode picker */}
                                      {balancePicker === t.id ? (
                                        <div className="absolute right-0 top-0 z-10 bg-white border border-neutral-200 rounded-xl shadow-lg p-sm min-w-[180px]">
                                          <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider px-xs pb-xs">First rent payment</p>
                                          <button
                                            onClick={() => { setBalancePicker(null); generateCheckInBalance(t.id, 'full') }}
                                            className="w-full text-left rounded-lg px-sm py-xs hover:bg-blue-50 text-xs font-semibold text-neutral-800 hover:text-blue-800"
                                          >
                                            Full month from start date
                                          </button>
                                          <button
                                            onClick={() => { setBalancePicker(null); generateCheckInBalance(t.id, 'prorata') }}
                                            className="w-full text-left rounded-lg px-sm py-xs hover:bg-blue-50 text-xs font-semibold text-neutral-800 hover:text-blue-800"
                                          >
                                            Pro-rata (days in first month)
                                          </button>
                                          <button
                                            onClick={() => setBalancePicker(null)}
                                            className="w-full text-left rounded-lg px-sm py-xs text-[10px] text-neutral-400 hover:text-neutral-600 mt-xs"
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          onClick={() => setBalancePicker(t.id)}
                                          disabled={generatingBalance === t.id}
                                          className="flex items-center gap-xs rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 px-md py-sm transition disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-semibold text-blue-800 whitespace-nowrap"
                                        >
                                          <span>{generatingBalance === t.id ? '⏳' : '💷'}</span>
                                          {generatingBalance === t.id ? 'Generating…' : 'Balance demand'}
                                        </button>
                                      )}
                                      {/* Lettings statement */}
                                      <button
                                        onClick={() => generateStatement(t.id)}
                                        disabled={generatingStatement === t.id || !hasBankDetails}
                                        title={!hasBankDetails ? 'Add bank details first' : undefined}
                                        className="flex items-center gap-xs rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 px-md py-sm transition disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-semibold text-neutral-700 whitespace-nowrap"
                                      >
                                        <span>{generatingStatement === t.id ? '⏳' : '📄'}</span>
                                        {generatingStatement === t.id ? 'Generating…' : `Statement ${fmtGBP(dueToLL)}`}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* Bank details */}
                    <div className="lg:col-span-2 px-lg md:px-xl py-lg">
                      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-md">Landlord bank account</p>

                      {hasBankDetails ? (
                        <div>
                          <div className="rounded-xl border border-neutral-100 bg-neutral-50 divide-y divide-neutral-100 overflow-hidden mb-md">
                            {[
                              { label: 'Account name', value: prop.bank_account_name },
                              { label: 'Sort code',    value: prop.bank_sort_code },
                              { label: 'Account no.', value: prop.bank_account_number },
                              { label: 'Payment ref', value: prop.bank_payment_ref },
                              { label: 'IBAN',        value: prop.bank_iban },
                              { label: 'SWIFT',       value: prop.bank_swift },
                            ].filter(r => r.value).map(({ label, value }) => (
                              <div key={label} className="flex items-baseline px-md py-sm gap-md">
                                <span className="text-[10px] text-neutral-400 w-20 flex-shrink-0 uppercase tracking-wide">{label}</span>
                                <span className="text-xs font-mono font-semibold text-neutral-900 break-all">{value}</span>
                              </div>
                            ))}
                          </div>

                          <div className="grid grid-cols-2 gap-sm">
                            <div className="rounded-lg border border-neutral-100 bg-neutral-50 px-md py-sm">
                              <p className="text-[10px] text-neutral-400 uppercase tracking-wide mb-0.5">Letting fee</p>
                              <p className="text-sm font-bold text-neutral-900">
                                {prop.letting_fee_pct ? `${prop.letting_fee_pct}%`
                                 : prop.letting_fee_flat ? fmtGBP(prop.letting_fee_flat)
                                 : '—'}
                              </p>
                              <p className="text-[10px] text-neutral-400">
                                {prop.letting_fee_pct ? 'of first month' : prop.letting_fee_flat ? 'flat fee' : 'not set'}
                              </p>
                            </div>
                            <div className="rounded-lg border border-neutral-100 bg-neutral-50 px-md py-sm">
                              <p className="text-[10px] text-neutral-400 uppercase tracking-wide mb-0.5">Rent due</p>
                              <p className="text-sm font-bold text-neutral-900">
                                {prop.rent_due_preference === 'move_in_date' ? 'Move-in date' : '1st of month'}
                              </p>
                              <p className="text-[10px] text-neutral-400">per tenancy agreement</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-lg text-center">
                          <p className="text-sm font-semibold text-amber-800 mb-xs">Bank details required</p>
                          <p className="text-xs text-amber-700 mb-md leading-relaxed">
                            Add the landlord&apos;s account details to enable statement generation and populate tenancy agreements.
                          </p>
                          <button
                            onClick={() => router.push(`/admin/properties/${prop.id}?tab=property`)}
                            className="rounded-lg bg-amber-800 text-white text-xs font-semibold px-md py-sm hover:bg-amber-900 transition"
                          >
                            Add bank details →
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {showAdd && (
        <AddLetOnlyModal
          onClose={() => setShowAdd(false)}
          onSave={async () => { setShowAdd(false); await loadData() }}
        />
      )}
    </div>
  )
}
