'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import Link from 'next/link'

type Tab = 'repairs' | 'cleans'

/**
 * Completed work, shared by every role — one screen so the platform behaves the
 * same whoever is logged in. What each role SEES differs (a tenant only ever
 * sees their own property); the layout does not.
 */
export default function HistoryPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<string>('')
  const [tab, setTab] = useState<Tab>('repairs')
  const [properties, setProperties] = useState<any[]>([])
  const [propertyFilter, setPropertyFilter] = useState('')
  const [repairs, setRepairs] = useState<any[]>([])
  const [cleans, setCleans] = useState<any[]>([])

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data) {
        router.push('/login')
        return
      }
      const a = data.assignment as any
      setRole(a?.role ?? '')

      const supabase = createClient()

      // Cleaners land on cleans; everyone else on repairs.
      if (a?.role === 'cleaner') setTab('cleans')

      const { data: props } = await supabase
        .from('properties')
        .select('id, name, address, clean_frequency_weeks')
        .order('name')
      setProperties(props || [])

      // Tenants only ever see their own property.
      const scopedProperty = a?.role === 'tenant' ? a?.property_id : null

      let rq = supabase
        .from('maintenance_tickets')
        .select('*, properties(name), rooms(name)')
        .eq('status', 'completed')
        .order('completed_at', { ascending: false, nullsFirst: false })
        .limit(200)
      if (scopedProperty) rq = rq.eq('property_id', scopedProperty)
      const { data: r } = await rq
      setRepairs(r || [])

      let cq = supabase
        .from('cleans')
        .select('*, properties(name, clean_frequency_weeks), rooms(name)')
        .eq('status', 'completed')
        .order('clean_date', { ascending: false })
        .limit(200)
      if (scopedProperty) cq = cq.eq('property_id', scopedProperty)
      if (a?.role === 'cleaner') cq = cq.eq('cleaner_id', a.id)
      const { data: c } = await cq
      setCleans(c || [])

      setLoading(false)
    }
    init()
  }, [router])

  const homeHref =
    role === 'administrator'
      ? '/admin'
      : role === 'contractor'
        ? '/contractor'
        : role === 'cleaner'
          ? '/cleaner'
          : '/tenant'

  const shownRepairs = propertyFilter
    ? repairs.filter((r) => r.property_id === propertyFilter)
    : repairs
  const shownCleans = propertyFilter
    ? cleans.filter((c) => c.property_id === propertyFilter)
    : cleans

  /** Group by property so each address reads as its own run of history. */
  function groupByProperty(items: any[]) {
    return items.reduce<Record<string, any[]>>((acc, item) => {
      const key = item.properties?.name ?? 'Unknown property'
      ;(acc[key] ||= []).push(item)
      return acc
    }, {})
  }

  /** Next clean due, from the property's schedule and the last completed one. */
  function nextCleanDue(lastDate: string, weeks: number | null) {
    if (!lastDate) return null
    const d = new Date(lastDate)
    d.setDate(d.getDate() + (weeks || 1) * 7)
    return d
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar
          right={<BackButton href={homeHref} />}
        />
        <p className="p-xl text-sm text-neutral-400">Loading…</p>
      </div>
    )
  }

  const items = tab === 'repairs' ? shownRepairs : shownCleans
  const grouped = groupByProperty(items)

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar
        right={
          <Link href={homeHref} className="min-w-0 truncate text-sm font-semibold text-white hover:text-white/80">
            Dashboard
          </Link>
        }
      />

      <main className="mx-auto max-w-6xl px-lg py-lg">
        {/* Tabs + property filter */}
        <div className="flex flex-wrap items-center gap-md">
          <div className="flex rounded-xl bg-white p-xs">
            {(['repairs', 'cleans'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-lg px-lg py-sm text-sm font-semibold capitalize transition-colors ${
                  tab === t ? 'bg-neutral-900 text-white' : 'text-neutral-600'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {role !== 'tenant' && (
            <select
              value={propertyFilter}
              onChange={(e) => setPropertyFilter(e.target.value)}
              className="rounded-xl border border-neutral-300 bg-white px-md py-sm text-sm"
            >
              <option value="">All properties</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          <span className="text-sm text-neutral-400">
            {items.length} completed
          </span>
        </div>

        {items.length === 0 ? (
          <p className="mt-lg rounded-2xl border border-dashed border-neutral-300 bg-white p-3xl text-center text-sm text-neutral-400">
            Nothing completed yet
          </p>
        ) : (
          <div className="mt-lg space-y-xl">
            {Object.entries(grouped).map(([property, list]) => {
              const latest = list[0]
              const freq = latest?.properties?.clean_frequency_weeks
              const due = tab === 'cleans' ? nextCleanDue(latest?.clean_date, freq) : null

              return (
                <div key={property}>
                  <div className="flex flex-wrap items-baseline justify-between gap-sm border-b border-neutral-300 pb-sm">
                    <h2 className="text-xl font-bold text-neutral-900">{property}</h2>
                    {tab === 'cleans' && due && (
                      <p className="text-sm text-neutral-500">
                        Every {freq === 1 ? 'week' : `${freq} weeks`} · next due{' '}
                        <strong className="text-neutral-900">
                          {due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </strong>
                      </p>
                    )}
                  </div>

                  <div className="mt-md space-y-sm">
                    {list.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-neutral-200 bg-white p-md"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-sm">
                          <div className="min-w-0">
                            <p className="font-bold text-neutral-900">
                              {tab === 'repairs'
                                ? String(item.category ?? '').replace(/-/g, ' ')
                                : item.clean_type === 'bolt_on'
                                  ? 'Bolt-on clean'
                                  : 'Routine clean'}
                              {item.rooms?.name ? ` — ${item.rooms.name}` : ''}
                            </p>
                            {tab === 'repairs' && (
                              <p className="truncate text-sm text-neutral-500">{item.title}</p>
                            )}
                            {tab === 'cleans' && item.special_jobs?.length > 0 && (
                              <p className="text-sm text-neutral-500">
                                {item.special_jobs.join(' · ')}
                              </p>
                            )}
                          </div>

                          <div className="shrink-0 text-right">
                            <p className="text-sm font-semibold text-neutral-900">
                              {new Date(
                                tab === 'repairs'
                                  ? item.completed_at ?? item.booked_date
                                  : item.clean_date
                              ).toLocaleDateString('en-GB', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </p>
                            {tab === 'repairs' && item.final_price != null && (
                              <p className="text-sm text-neutral-500">
                                £{Number(item.final_price).toFixed(2)}
                              </p>
                            )}
                          </div>
                        </div>

                        {tab === 'cleans' && item.tenant_todos?.length > 0 && (
                          <div className="mt-sm border-t border-neutral-200 pt-sm">
                            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                              Asked of tenants
                            </p>
                            <ul className="mt-xs space-y-xs">
                              {item.tenant_todos.map((t: string) => (
                                <li key={t} className="text-sm text-neutral-600">
                                  · {t}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
