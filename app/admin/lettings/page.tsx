'use client'

// Lettings — the whole flow on one screen: applicants in progress → lets agreed, with how far each is to move-in →
// tenants on notice and whether their room is re-let. Every card opens the applicant or its letting file.
// Data: /api/admin/lettings/overview. Read-only; nothing here sends anything.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import PageHero, { HeroButton } from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import { adminFetch } from '@/lib/adminFetch'

interface Applicant { id: string; name: string; email: string | null; stage: string; at: string | null; room: string; property: string }
interface LetAgreed { id: string; tenant: string; room: string; property: string; startDate: string; rent: number | null; done: number; total: number; next: string; signBy: string | null; signLate: boolean; soon: boolean }
interface OnNotice { id: string; tenant: string; room: string; property: string; endDate: string | null; relet: { id: string; tenant: string; startDate: string } | null }
interface Overview { applicants: Applicant[]; letAgreed: LetAgreed[]; onNotice: OnNotice[]; counts: { applicants: number; letAgreed: number; live: number; onNotice: number; availableNow: number } }

const STAGE: Record<string, [string, string]> = {
  applied: ['Applied', 'bg-blue-50 text-blue-800'],
  offer_sent: ['Offer sent', 'bg-amber-50 text-amber-800'],
  referencing: ['Referencing', 'bg-violet-50 text-violet-800'],
  referencing_passed: ['Ref. passed', 'bg-sky-50 text-sky-800'],
  docs_uploaded: ['Docs in', 'bg-teal-50 text-teal-800'],
}
const day = (iso: string | null | undefined) => iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '—'
const FROM = 'from=/admin/lettings'

function Column({ title, hint, count, href, hrefLabel, children }: { title: string; hint: string; count: number; href: string; hrefLabel: string; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col rounded-2xl bg-white ring-1 ring-neutral-200">
      <header className="flex items-baseline justify-between gap-sm border-b border-neutral-100 px-lg py-md">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-neutral-900">{title} <span className="ml-xs text-sm font-semibold tabular-nums text-neutral-400">{count}</span></h2>
          <p className="text-xs text-neutral-500">{hint}</p>
        </div>
        <Link href={href} className="shrink-0 text-xs font-semibold text-blue-700 hover:underline">{hrefLabel}</Link>
      </header>
      <ul className="flex-1 divide-y divide-neutral-100">{children}</ul>
    </section>
  )
}

const Empty = ({ children }: { children: React.ReactNode }) => <li className="px-lg py-lg text-sm text-neutral-500">{children}</li>

export default function LettingsOverviewPage() {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    adminFetch('/api/admin/lettings/overview').then(async r => {
      const d = await r.json().catch(() => ({}))
      if (r.ok) setData(d); else setError(d.error ?? 'Could not load lettings')
    })
  }, [])

  const c = data?.counts
  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin" />} title="Lettings" />
      <PageHero
        eyebrow="Lettings"
        title="From application to move-in"
        subtitle="Every letting in one place. Record a holding deposit on an applicant to agree the let; its letting file then tracks it to the keys."
        stats={c ? [
          { label: 'Applicants in progress', value: c.applicants, href: '/admin/applicants' },
          { label: 'Lets agreed', value: c.letAgreed, tone: 'info', href: '/admin/tenancies' },
          { label: 'On notice', value: c.onNotice, tone: 'warn', href: '/admin/tenancy-management' },
          { label: 'Rooms free now', value: c.availableNow, tone: c.availableNow ? 'good' : undefined, href: '/admin/available-and-lettings' },
        ] : []}
        actions={<>
          <HeroButton href="/admin/invite-to-apply">Invite to apply</HeroButton>
          <HeroButton primary href="/admin/applicants?add=1">+ Add applicant</HeroButton>
        </>}
      />

      <div className="mx-auto max-w-6xl px-lg py-xl space-y-lg">
        {/* where a letting lives, start to finish */}
        <ol className="flex flex-wrap items-center gap-x-sm gap-y-xs text-xs text-neutral-500">
          {[['Applicant', 'Applicants'], ['Let agreed', 'holding deposit in'], ['Letting file', 'referencing → keys'], ['Moved in', 'rent runs'], ['On notice', 'room re-let'], ['Ended', 'kept on record']].map(([a, b], i, arr) => (
            <li key={a} className="flex items-center gap-sm">
              <span><span className="font-semibold text-neutral-800">{a}</span> · {b}</span>
              {i < arr.length - 1 && <span aria-hidden className="text-neutral-300">→</span>}
            </li>
          ))}
        </ol>

        {error && <p className="rounded-xl border border-red-200 bg-red-50 px-lg py-md text-sm text-red-800">{error}</p>}
        {!data && !error && <p className="text-sm text-neutral-500">Loading lettings…</p>}

        {data && (
          <div className="grid grid-cols-1 gap-lg lg:grid-cols-3">
            <Column title="Applicants" hint="Applied, offered or referencing" count={data.applicants.length} href="/admin/applicants" hrefLabel="All applicants">
              {data.applicants.length ? data.applicants.map(a => (
                <li key={a.id}>
                  <Link href={`/admin/applicants?open=${a.id}`} className="block px-lg py-sm hover:bg-neutral-50">
                    <span className="flex items-baseline justify-between gap-sm">
                      <span className="truncate text-sm font-semibold text-neutral-900">{a.name}</span>
                      <span className={`shrink-0 rounded-full px-sm py-0.5 text-[11px] font-semibold ${STAGE[a.stage]?.[1] ?? 'bg-neutral-100 text-neutral-600'}`}>{STAGE[a.stage]?.[0] ?? a.stage}</span>
                    </span>
                    <span className="block truncate text-xs text-neutral-500">{[a.room, a.property].filter(Boolean).join(' · ') || 'No room chosen'}{a.at ? ` · ${day(a.at)}` : ''}</span>
                  </Link>
                </li>
              )) : <Empty>No applications in progress. <Link href="/admin/invite-to-apply" className="font-semibold text-blue-700 hover:underline">Invite someone to apply</Link>.</Empty>}
            </Column>

            <Column title="Let agreed" hint="Holding deposit in, moving in soon" count={data.letAgreed.length} href="/admin/tenancies" hrefLabel="Tenancies">
              {data.letAgreed.length ? data.letAgreed.map(l => (
                <li key={l.id}>
                  <Link href={`/admin/lettings/${l.id}?${FROM}`} className="block px-lg py-sm hover:bg-neutral-50">
                    <span className="flex items-baseline justify-between gap-sm">
                      <span className="truncate text-sm font-semibold text-neutral-900">{l.tenant}</span>
                      <span className={`shrink-0 text-xs font-semibold tabular-nums ${l.soon ? 'text-amber-700' : 'text-neutral-600'}`}>In {day(l.startDate)}</span>
                    </span>
                    <span className="block truncate text-xs text-neutral-500">{l.room} · {l.property}</span>
                    <span className="mt-xs flex items-center gap-sm">
                      <span className="flex flex-1 gap-0.5" aria-label={`${l.done} of ${l.total} steps done`}>
                        {Array.from({ length: l.total }, (_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i < l.done ? 'bg-green-600' : 'bg-neutral-200'}`} />)}
                      </span>
                      <span className="shrink-0 text-[11px] tabular-nums text-neutral-500">{l.done}/{l.total}</span>
                    </span>
                    <span className={`mt-0.5 block text-xs ${l.signLate ? 'font-semibold text-red-700' : 'text-blue-800'}`}>
                      {l.signLate ? `Agreement overdue (sign by ${day(l.signBy)})` : `Next: ${l.next}${l.signBy && l.next !== 'Holding deposit' ? ` · sign by ${day(l.signBy)}` : ''}`}
                    </span>
                  </Link>
                </li>
              )) : <Empty>No lets agreed right now. Open an applicant and record their holding deposit — the tenancy and its letting file are made there.</Empty>}
            </Column>

            <Column title="On notice" hint="Leaving, and whether the room is re-let" count={data.onNotice.length} href="/admin/tenancy-management" hrefLabel="On Notice">
              {data.onNotice.length ? data.onNotice.map(n => (
                <li key={n.id}>
                  <Link href={`/admin/lettings/${n.id}?tab=notice&${FROM}`} className="block px-lg py-sm hover:bg-neutral-50">
                    <span className="flex items-baseline justify-between gap-sm">
                      <span className="truncate text-sm font-semibold text-neutral-900">{n.tenant}</span>
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-neutral-600">Out {day(n.endDate)}</span>
                    </span>
                    <span className="block truncate text-xs text-neutral-500">{n.room} · {n.property}</span>
                    {!n.relet && <span className="mt-0.5 block text-xs text-amber-700">Not re-let yet</span>}
                  </Link>
                  {/* the incoming tenant opens their own file — the card above is the outgoing tenant's */}
                  {n.relet && (
                    <Link href={`/admin/lettings/${n.relet.id}?${FROM}`} className="-mt-xs block px-lg pb-sm text-xs text-green-700 hover:underline">
                      Re-let · <span className="font-semibold">{n.relet.tenant}</span> from {day(n.relet.startDate)} →
                    </Link>
                  )}
                </li>
              )) : <Empty>Nobody is on notice.</Empty>}
            </Column>
          </div>
        )}
      </div>
    </div>
  )
}
