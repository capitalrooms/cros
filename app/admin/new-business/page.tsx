'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { adminFetch } from '@/lib/adminFetch'
import { SERVICE_TYPES } from '@/lib/newBusiness/serviceTypes'

interface Row { id: string; full_name: string; stage: number; welcome_sent_at?: string; docs_received_at?: string; approval_sent_at?: string; created_at: string; updated_at?: string }

const STAGES = [
  { n: 1, label: 'New enquiry' },
  { n: 2, label: 'Form sent — with landlord' },
  { n: 3, label: 'Form submitted — to review' },
  { n: 4, label: 'Verified — ready for signing' },
  { n: 5, label: 'Agreement out for signature' },
  { n: 6, label: 'Onboarded' },
]

const daysSince = (iso?: string) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : 0)

export default function NewBusinessPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    adminFetch('/api/landlord-onboarding')
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error ?? 'Could not load the pipeline')
        setRows((d.rows ?? []).filter((x: Row) => x.stage > 0))
      })
      .catch(e => setLoadError(e instanceof Error ? e.message : 'Could not load the pipeline'))
  }, [])

  const at = (n: number) => (rows ?? []).filter(r => r.stage === n)
  const stalled = at(2).filter(r => daysSince(r.welcome_sent_at ?? r.created_at) >= 7)
  const needs = [
    { label: 'Forms to review', count: at(3).length, note: 'Submitted by the landlord — check documents and confirm risk', urgent: true },
    { label: 'Ready to send for signing', count: at(4).length, note: 'AML complete — send the agreement for signature', urgent: true },
    { label: 'Waiting on landlord', count: at(2).length, note: stalled.length ? `${stalled.length} not finished after 7+ days — worth a nudge` : 'Form sent, landlord completing it', urgent: stalled.length > 0 },
    { label: 'New enquiries', count: at(1).length, note: 'Terms not yet sent', urgent: false },
  ]

  const section = 'text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-sm'
  const tool = 'group flex items-start justify-between gap-md rounded-xl border border-neutral-200 bg-white p-md transition hover:border-neutral-400'

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin" />} />
      <main className="mx-auto max-w-6xl px-lg py-xl">
        <header className="mb-xl">
          <h1 className="text-2xl font-bold text-neutral-900">New business</h1>
          <p className="text-sm text-neutral-500 mt-xs">Win landlords, send terms, and take them through AML to a signed agreement.</p>
        </header>

        {/* Needs you */}
        <section className="mb-xl">
          <h2 className={section}>Needs you</h2>
          {loadError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-md py-sm text-sm text-red-700">
              {loadError}. Refresh the page — if it keeps happening, sign out and back in.
            </div>
          ) : (
            <div className="grid gap-sm grid-cols-2 lg:grid-cols-4">
              {needs.map(n => (
                <Link key={n.label} href="/admin/new-business/onboarding"
                  className={`rounded-xl border bg-white p-md transition hover:border-neutral-400 ${n.urgent && n.count ? 'border-neutral-900' : 'border-neutral-200'}`}>
                  <p className="text-2xl sm:text-3xl font-bold tabular-nums text-neutral-900">{rows ? n.count : '–'}</p>
                  <p className="text-sm font-semibold text-neutral-900 mt-xs">{n.label}</p>
                  <p className="text-xs text-neutral-500 mt-xs leading-relaxed">{n.note}</p>
                </Link>
              ))}
            </div>
          )}
        </section>

        <div className="grid gap-xl lg:grid-cols-3">
          {/* Win */}
          <section>
            <h2 className={section}>Win</h2>
            <div className="space-y-sm">
              <Link href="/admin/new-business/acquisition" className={tool}>
                <div>
                  <p className="text-sm font-semibold text-neutral-900">Introduction email</p>
                  <p className="text-xs text-neutral-500 mt-xs leading-relaxed">A personalised first approach to a prospective landlord.</p>
                </div>
                <span className="text-neutral-300 group-hover:text-neutral-700">→</span>
              </Link>
              <Link href="/admin/valuations" className={tool}>
                <div>
                  <p className="text-sm font-semibold text-neutral-900">Rental valuation</p>
                  <p className="text-xs text-neutral-500 mt-xs leading-relaxed">Branded valuation letter — HMO or single let, current or post-refurbishment.</p>
                </div>
                <span className="text-neutral-300 group-hover:text-neutral-700">→</span>
              </Link>
            </div>
          </section>

          {/* Instruct */}
          <section>
            <h2 className={section}>Instruct</h2>
            <div className="rounded-xl border border-neutral-900 bg-neutral-900 p-md text-white">
              <p className="text-sm font-semibold">New instruction</p>
              <p className="text-xs text-neutral-300 mt-xs leading-relaxed">Choose the service, then send the agreement and the landlord’s AML form in one email.</p>
              <div className="mt-md space-y-xs">
                {SERVICE_TYPES.map(s => s.available ? (
                  <Link key={s.id} href={`/admin/new-business/send-welcome?service=${s.id}`}
                    className="flex items-center justify-between rounded-lg bg-white px-sm py-xs text-sm font-semibold text-neutral-900 hover:bg-neutral-100">
                    {s.label}<span aria-hidden>→</span>
                  </Link>
                ) : (
                  <div key={s.id} title={s.summary}
                    className="flex items-center justify-between rounded-lg border border-neutral-700 px-sm py-xs text-sm text-neutral-400">
                    {s.label}<span className="text-[11px] uppercase tracking-wide">Coming soon</span>
                  </div>
                ))}
              </div>
            </div>
            <Link href="/admin/new-business/management-agreement" className={`${tool} mt-sm`}>
              <div>
                <p className="text-sm font-semibold text-neutral-900">Agreements</p>
                <p className="text-xs text-neutral-500 mt-xs leading-relaxed">Re-generate or print a management agreement.</p>
              </div>
              <span className="text-neutral-300 group-hover:text-neutral-700">→</span>
            </Link>
          </section>

          {/* Onboard */}
          <section>
            <div className="flex items-baseline justify-between">
              <h2 className={section}>Onboard</h2>
              <Link href="/admin/new-business/onboarding" className="text-xs font-semibold text-neutral-700 hover:underline">Open pipeline →</Link>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white divide-y divide-neutral-100">
              {STAGES.map(s => {
                const list = at(s.n)
                return (
                  <div key={s.n} className="px-md py-sm">
                    <div className="flex items-center justify-between">
                      <p className={`text-sm ${list.length ? 'font-semibold text-neutral-900' : 'text-neutral-400'}`}>{s.label}</p>
                      <span className={`text-xs tabular-nums ${list.length ? 'font-bold text-neutral-900' : 'text-neutral-300'}`}>{rows ? list.length : '–'}</span>
                    </div>
                    {list.slice(0, 3).map(r => (
                      <Link key={r.id} href={`/admin/new-business/onboarding/${r.id}`} className="block text-xs text-neutral-500 hover:text-neutral-900 truncate mt-[2px]">
                        {r.full_name}
                      </Link>
                    ))}
                    {list.length > 3 && <p className="text-xs text-neutral-400 mt-[2px]">+{list.length - 3} more</p>}
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
