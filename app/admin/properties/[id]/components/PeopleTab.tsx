'use client'

// The house's tenants, by tenancy (rewritten 24 Oct 2026): Current tenancies, Incoming tenancies, Expired tenancies —
// full names with titles, tenancy dates in full, the same status words as All Units and the room page. Each row links to
// the letting file, the tenant's profile and the room page. (It used to show email usernames, list a tenancy still
// running as "Moved Out" because notice had been given, and an incoming tenant as already moved in.)
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { displayName } from '@/lib/people'

interface Row {
  id: string
  room_id: string | null
  start_date: string
  end_date: string | null
  notice_received_date: string | null
  rent_amount: number | null
  person: { id: string; salutation: string | null; first_name: string | null; last_name: string | null; full_name: string | null; email: string | null; phone: string | null } | null
  co: { id: string; salutation: string | null; first_name: string | null; last_name: string | null; full_name: string | null } | null
  room: { id: string; name: string } | null
}

const full = (iso: string | null | undefined) => iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''
const gbp = (n: number | null) => n == null ? '' : `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const roomNo = (name?: string | null) => Number(String(name ?? '').match(/\d+/)?.[0] ?? 999)

export default function PeopleTab({ propertyId }: { propertyId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('tenancies')
      .select('id, room_id, start_date, end_date, notice_received_date, rent_amount, person:people!person_id(id, salutation, first_name, last_name, full_name, email, phone), co:people!co_tenant_id(id, salutation, first_name, last_name, full_name), room:rooms(id, name)')
      .eq('property_id', propertyId).is('let_cancelled_at', null).order('start_date', { ascending: false })
      .then(({ data, error: err }) => { if (err) setError('The tenancies couldn’t be loaded'); else setRows((data ?? []) as any) })
  }, [propertyId])

  if (error) return <p className="text-sm font-semibold text-red-700">{error}</p>
  if (!rows) return <p className="text-sm text-neutral-500">Loading tenancies…</p>

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const byRoom = (a: Row, b: Row) => roomNo(a.room?.name) - roomNo(b.room?.name)
  const current = rows.filter(t => t.start_date <= today && (!t.end_date || t.end_date >= today)).sort(byRoom)
  const incoming = rows.filter(t => t.start_date > today).sort((a, b) => a.start_date.localeCompare(b.start_date))
  const expired = rows.filter(t => t.end_date && t.end_date < today).sort((a, b) => (b.end_date ?? '').localeCompare(a.end_date ?? ''))

  const names = (t: Row) => [t.person, t.co].filter(Boolean).map(p => displayName(p as any)).join(' and ') || 'No tenant recorded'
  const List = ({ title, items, empty, kind }: { title: string; items: Row[]; empty: string; kind: 'current' | 'incoming' | 'expired' }) => (
    <section>
      <h3 className="mb-sm text-[10px] font-semibold uppercase tracking-widest text-neutral-400">{title} · {items.length}</h3>
      {items.length === 0 ? <p className="text-sm text-neutral-500">{empty}</p> : (
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200">
          {items.map(t => {
            const pill = kind === 'incoming' ? ['Let agreed', 'bg-blue-100 text-blue-900']
              : kind === 'expired' ? ['Ended', 'bg-neutral-100 text-neutral-600']
              : t.end_date || t.notice_received_date ? ['Notice received', 'bg-amber-100 text-amber-900'] : ['Let', 'bg-green-50 text-green-800']
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-x-lg gap-y-xs px-md py-sm">
                <div className="min-w-0 flex-[1_1_260px]">
                  <p className="font-semibold text-neutral-900">{names(t)}</p>
                  <p className="text-xs text-neutral-500">
                    {t.room?.name ?? 'No room'} · {kind === 'incoming' ? `tenancy start date ${full(t.start_date)}` : `${full(t.start_date)} – ${t.end_date ? full(t.end_date) : 'periodic, no end date'}`}
                    {t.notice_received_date && kind !== 'expired' ? ` · notice received ${full(t.notice_received_date)}` : ''}
                    {t.rent_amount != null ? ` · ${gbp(t.rent_amount)} per month` : ''}
                  </p>
                  {kind !== 'expired' && (t.person?.email || t.person?.phone) && <p className="text-xs text-neutral-500">{[t.person?.email, t.person?.phone].filter(Boolean).join(' · ')}</p>}
                </div>
                <span className={`whitespace-nowrap rounded-full px-sm py-0.5 text-[11px] font-semibold ${pill[1]}`}>{pill[0]}</span>
                <span className="flex flex-wrap gap-sm text-xs font-semibold">
                  <Link href={`/admin/lettings/${t.id}`} className="underline">Letting file</Link>
                  {t.person && <Link href={`/admin/tenant/${t.person.id}`} className="underline">Profile</Link>}
                  {t.room_id && <Link href={`/admin/properties/${propertyId}/rooms/${t.room_id}`} className="underline">Room page</Link>}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )

  return (
    <div className="space-y-xl">
      <List title="Current tenancies" items={current} empty="No current tenancies." kind="current" />
      {incoming.length > 0 && <List title="Incoming tenancies" items={incoming} empty="" kind="incoming" />}
      <List title="Expired tenancies" items={expired} empty="No expired tenancies on record." kind="expired" />
      <p className="text-xs text-neutral-500">Contractors and cleaners are chosen per job, on Maintenance.</p>
    </div>
  )
}
