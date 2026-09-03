'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import { displayName } from '@/lib/people'
import Link from 'next/link'
import AppBar from '@/components/AppBar'

interface Person {
  id: string
  first_name: string | null
  last_name: string | null
  full_name: string | null
  email: string
  phone: string | null
  role: string
  using_app: boolean | null
}

interface Tenancy {
  id: string
  room_id: string
  property_id: string
  start_date: string
  end_date: string | null
  rent_amount: number | null
  status: string | null
  rooms: { name: string } | null
  properties: { name: string; address: string } | null
}

interface Job {
  id: string
  title: string
  status: string
  booked_date: string | null
  properties: { name: string } | null
}

interface PropertyRecord {
  id: string
  name: string
  address: string
  landlord_id: string | null
}

export default function ViewAsPage({ params }: { params: Promise<{ personId: string }> }) {
  const router = useRouter()
  const { personId } = use(params)
  const [loading, setLoading] = useState(true)
  const [person, setPerson] = useState<Person | null>(null)
  const [tenancies, setTenancies] = useState<Tenancy[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [properties, setProperties] = useState<PropertyRecord[]>([])
  const [togglingApp, setTogglingApp] = useState(false)

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser()
      if (!user || !['administrator', 'admin'].includes(user.assignment?.role || '')) {
        router.push('/login')
        return
      }
      const supabase = createClient()
      const { data: p } = await supabase
        .from('people')
        .select('id, first_name, last_name, full_name, email, phone, role, using_app')
        .eq('id', personId)
        .single()
      if (!p) { router.push('/admin/contacts'); return }
      setPerson(p)

      // Log the view-as access
      fetch('/api/admin/view-as-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewed_person_id: personId, viewed_role: p.role }),
      })

      // Load role-specific data
      if (p.role === 'tenant') {
        const { data: t } = await supabase
          .from('tenancies')
          .select('id, room_id, property_id, start_date, end_date, rent_amount, status, rooms(name), properties(name, address)')
          .eq('person_id', personId)
          .order('start_date', { ascending: false })
        setTenancies((t || []) as Tenancy[])
      } else if (p.role === 'contractor') {
        const { data: j } = await supabase
          .from('maintenance_tickets')
          .select('id, title, status, booked_date, properties(name)')
          .eq('contractor_id', personId)
          .neq('status', 'completed')
          .order('booked_date', { ascending: true })
          .limit(20)
        setJobs((j || []) as Job[])
      } else if (p.role === 'landlord') {
        const { data: pr } = await supabase
          .from('properties')
          .select('id, name, address, landlord_id')
          .eq('landlord_id', personId)
        setProperties((pr || []) as PropertyRecord[])
      }
      setLoading(false)
    }
    init()
  }, [personId, router])

  async function toggleUsingApp() {
    if (!person) return
    setTogglingApp(true)
    const supabase = createClient()
    const newVal = !person.using_app
    await supabase.from('people').update({ using_app: newVal }).eq('id', personId)
    setPerson(prev => prev ? { ...prev, using_app: newVal } : prev)
    setTogglingApp(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center">
        <div className="text-white text-sm">Loading…</div>
      </div>
    )
  }

  if (!person) return null

  const name = displayName(person)
  const isReadOnly = !!person.using_app
  const roleLabel = person.role.charAt(0).toUpperCase() + person.role.slice(1)

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      {/* View As banner */}
      <div className="sticky top-0 z-50 bg-amber-400 border-b-2 border-amber-500 px-lg py-sm flex items-center justify-between gap-md">
        <div className="flex items-center gap-sm min-w-0">
          <span className="text-lg shrink-0">👁</span>
          <span className="font-bold text-amber-900 text-sm truncate">
            Viewing as {name}
          </span>
          <span className="shrink-0 text-xs text-amber-800 font-semibold px-sm py-xs bg-amber-200 rounded-full">
            {roleLabel}
          </span>
          {isReadOnly && (
            <span className="shrink-0 text-xs text-amber-900 bg-amber-300 px-sm py-xs rounded-full font-semibold hidden sm:inline">
              🔒 Read only
            </span>
          )}
        </div>
        <Link
          href="/admin/people"
          className="shrink-0 text-xs font-bold text-amber-900 bg-amber-200 hover:bg-amber-300 px-md py-xs rounded-lg transition-colors"
        >
          ✕ Exit
        </Link>
      </div>

      <AppBar />

      <main className="mx-auto max-w-2xl px-lg py-lg">
        {/* Person card */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-lg mb-lg">
          <div className="flex items-start gap-md">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 flex items-center justify-center text-white font-bold text-xl shrink-0">
              {name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-neutral-900 text-lg">{name}</p>
              <p className="text-sm text-neutral-500">{person.email}</p>
              {person.phone && <p className="text-sm text-neutral-500">{person.phone}</p>}
              <span className="inline-block mt-xs text-xs font-semibold px-sm py-xs rounded-full bg-neutral-100 text-neutral-600">{roleLabel}</span>
            </div>
          </div>

          {/* Using app toggle */}
          <div className="mt-lg pt-md border-t border-neutral-100 flex items-center justify-between gap-md">
            <div>
              <p className="text-sm font-semibold text-neutral-900">
                {isReadOnly ? '✅ Using the app directly' : '⏳ Not yet using the app'}
              </p>
              <p className="text-xs text-neutral-500 mt-xs">
                {isReadOnly
                  ? 'View As is read-only — this person is managing their own activity.'
                  : 'View As is writable — you can log activity on their behalf during the transition.'}
              </p>
            </div>
            <button
              onClick={toggleUsingApp}
              disabled={togglingApp}
              className={`shrink-0 relative w-12 h-6 rounded-full transition-colors duration-200 disabled:opacity-50 ${isReadOnly ? 'bg-green-500' : 'bg-neutral-300'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${isReadOnly ? 'translate-x-6' : 'translate-x-0'}`} />
            </button>
          </div>
        </div>

        {/* Direct dashboard link — the real pixel-perfect screen for this person */}
        {(['tenant', 'contractor', 'landlord'] as const).includes(person.role as any) && (() => {
          const dashboardUrl =
            person.role === 'tenant' ? `/tenant?as=${personId}` :
            person.role === 'contractor' ? `/contractor?as=${personId}` :
            `/landlord?as=${personId}`
          return (
            <div className="mb-lg rounded-2xl bg-neutral-900 text-white p-lg">
              <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-sm">
                True screen preview
              </p>
              <p className="text-sm text-white/70 mb-md">
                Open the exact screen this person sees when they log in — rendered live with their real data, with an amber banner so you know it&apos;s a preview.
              </p>
              <Link
                href={dashboardUrl}
                className="inline-flex items-center gap-sm rounded-xl bg-amber-400 hover:bg-amber-300 px-lg py-md text-sm font-bold text-amber-900 transition-colors"
              >
                👁 Open their {person.role} screen →
              </Link>
            </div>
          )
        })()}

        {/* Role-specific data */}
        {person.role === 'tenant' && (
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-md">Their tenancies</h2>
            {tenancies.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-neutral-300 p-lg text-center text-sm text-neutral-400">No tenancy records</div>
            ) : (
              <div className="space-y-sm">
                {tenancies.map(t => (
                  <div key={t.id} className="bg-white rounded-xl border border-neutral-200 p-md">
                    <div className="flex items-center justify-between gap-md">
                      <div>
                        <p className="font-semibold text-neutral-900">{t.rooms?.name}, {t.properties?.address}</p>
                        <p className="text-xs text-neutral-500">
                          {t.start_date} → {t.end_date || 'Rolling'} · £{t.rent_amount?.toLocaleString() || '—'}/mo
                        </p>
                      </div>
                      <span className={`shrink-0 text-xs font-bold px-sm py-xs rounded-full ${
                        t.status === 'active' ? 'bg-green-100 text-green-800' :
                        t.status === 'on_notice' ? 'bg-amber-100 text-amber-800' :
                        'bg-neutral-100 text-neutral-600'
                      }`}>
                        {t.status || 'unknown'}
                      </span>
                    </div>
                    {!isReadOnly && (
                      <Link href={`/admin/properties/${t.property_id}/rooms/${t.room_id}`}
                        className="mt-sm inline-block text-xs font-semibold text-blue-600 hover:text-blue-800">
                        Open room admin →
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {person.role === 'contractor' && (
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-md">Their open jobs</h2>
            {jobs.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-neutral-300 p-lg text-center text-sm text-neutral-400">No open jobs</div>
            ) : (
              <div className="space-y-sm">
                {jobs.map(j => (
                  <div key={j.id} className="bg-white rounded-xl border border-neutral-200 p-md flex items-center justify-between gap-md">
                    <div>
                      <p className="font-semibold text-neutral-900">{j.title}</p>
                      <p className="text-xs text-neutral-500">{j.properties?.name} · {j.booked_date || 'No date'}</p>
                    </div>
                    <span className={`text-xs font-bold px-sm py-xs rounded-full ${
                      j.status === 'assigned' ? 'bg-blue-100 text-blue-800' :
                      j.status === 'booked' ? 'bg-purple-100 text-purple-800' :
                      'bg-neutral-100 text-neutral-600'
                    }`}>{j.status}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-md text-xs text-neutral-400">
              Use the &quot;Open their screen&quot; button above to see the full contractor dashboard as they see it.
            </div>
          </div>
        )}

        {person.role === 'landlord' && (
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-md">Their properties</h2>
            {properties.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-neutral-300 p-lg text-center text-sm text-neutral-400">No properties linked to this landlord</div>
            ) : (
              <div className="space-y-sm">
                {properties.map(p => (
                  <Link key={p.id} href={`/admin/properties/${p.id}`}
                    className="block bg-white rounded-xl border border-neutral-200 p-md hover:border-neutral-900 transition-colors">
                    <p className="font-semibold text-neutral-900">{p.address || p.name}</p>
                    {p.name && p.name !== p.address && <p className="text-xs text-neutral-500">{p.name}</p>}
                  </Link>
                ))}
              </div>
            )}
            <div className="mt-md text-xs text-neutral-400">
              Use the &quot;Open their screen&quot; button above to see the full landlord dashboard as they see it.
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
