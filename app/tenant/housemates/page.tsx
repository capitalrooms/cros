'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import { getActiveTenancy } from '@/lib/tenancy'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import {
  ICEBREAKER_QUESTIONS,
  answeredCount,
  hasEnoughToShow,
  type IcebreakerAnswers,
} from '@/lib/icebreaker'

interface Housemate {
  personId: string
  name: string
  roomName: string | null
  isMe: boolean
  answers: IcebreakerAnswers
}

/**
 * "Meet your housemates" — every current tenant in the same property, with the
 * icebreaker answers they chose to share. The RLS `read_visible` policy already
 * hides profiles a housemate marked private, so we simply render what comes back.
 */
export default function HousematesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [propertyName, setPropertyName] = useState('')
  const [housemates, setHousemates] = useState<Housemate[]>([])
  const [myCount, setMyCount] = useState(0)

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || data.assignment?.role !== 'tenant') {
        router.push('/login')
        return
      }
      const myId = (data.assignment as any)?.id as string
      const active = await getActiveTenancy(myId)
      if (!active) {
        setLoading(false)
        return
      }
      setPropertyName(active.properties?.name || 'your house')

      const supabase = createClient()
      const today = new Date().toISOString().split('T')[0]

      // Everyone currently living at this property (me included).
      const { data: tens } = await supabase
        .from('tenancies')
        .select('person_id, room_id, people(full_name), rooms(name)')
        .eq('property_id', active.property_id)
        .lte('start_date', today)
        .or(`end_date.is.null,end_date.gte.${today}`)

      const rows = (tens as any[]) || []
      // De-dupe by person (someone could have overlapping rows) and drop blanks.
      const byPerson = new Map<string, any>()
      for (const t of rows) {
        if (t.person_id && !byPerson.has(t.person_id)) byPerson.set(t.person_id, t)
      }
      const personIds = [...byPerson.keys()]

      // Their shared icebreaker profiles (RLS returns only visible ones + my own).
      const icebreakers = new Map<string, IcebreakerAnswers>()
      if (personIds.length) {
        const { data: ibs } = await supabase
          .from('tenant_icebreakers')
          .select('person_id, answers')
          .in('person_id', personIds)
        for (const ib of ibs || []) icebreakers.set(ib.person_id, (ib.answers as IcebreakerAnswers) || {})
      }

      const list: Housemate[] = personIds.map((pid) => {
        const t = byPerson.get(pid)
        return {
          personId: pid,
          name: t.people?.full_name || 'A housemate',
          roomName: t.rooms?.name || null,
          isMe: pid === myId,
          answers: icebreakers.get(pid) || {},
        }
      })

      // Me first, then people who've shared something, then the rest — by name.
      list.sort((a, b) => {
        if (a.isMe !== b.isMe) return a.isMe ? -1 : 1
        const aHas = hasEnoughToShow(a.answers)
        const bHas = hasEnoughToShow(b.answers)
        if (aHas !== bHas) return aHas ? -1 : 1
        return a.name.localeCompare(b.name)
      })

      setHousemates(list)
      setMyCount(answeredCount(icebreakers.get(myId)))
      setLoading(false)
    }
    init()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar right={<BackButton />} />
        <p className="p-xl text-sm text-neutral-400">Loading…</p>
      </div>
    )
  }

  const others = housemates.filter((h) => !h.isMe)

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar right={<BackButton href="/tenant" />} />

      <main className="mx-auto max-w-2xl px-lg py-lg">
        <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">
          {propertyName}
        </p>
        <h1 className="mt-xs text-3xl font-bold text-neutral-900">Meet your housemates</h1>

        {/* Nudge the tenant to fill in their own profile if they haven't. */}
        {myCount < 2 && (
          <div className="mt-lg rounded-2xl border-2 border-neutral-900 bg-white p-lg">
            <p className="text-sm font-bold text-neutral-900">Your housemates can&apos;t see you yet 👋</p>
            <p className="mt-xs text-sm text-neutral-600">
              Add a few lines about yourself so the house can say hello.
            </p>
            <Link
              href="/tenant/icebreaker"
              className="mt-md inline-block rounded-xl bg-neutral-900 px-lg py-sm text-sm font-bold text-white hover:bg-neutral-800"
            >
              Fill in my profile
            </Link>
          </div>
        )}

        {others.length === 0 ? (
          <p className="mt-lg rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center text-sm text-neutral-500">
            You&apos;re the first one here. When housemates join and say hello, they&apos;ll appear on this page.
          </p>
        ) : (
          <div className="mt-lg space-y-md">
            {others.map((h) => (
              <HousemateCard key={h.personId} mate={h} />
            ))}
          </div>
        )}

        {myCount >= 2 && (
          <div className="mt-2xl text-center">
            <Link href="/tenant/icebreaker" className="text-sm font-semibold text-neutral-600 underline">
              Edit my profile
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}

function HousemateCard({ mate }: { mate: Housemate }) {
  const shared = ICEBREAKER_QUESTIONS.filter((q) => (mate.answers[q.id] || '').trim())

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-lg">
      <div className="flex items-center gap-md">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-lg font-bold text-white">
          {mate.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate font-bold text-neutral-900">{mate.name}</p>
          {mate.roomName && <p className="truncate text-xs text-neutral-500">{mate.roomName}</p>}
        </div>
      </div>

      {shared.length === 0 ? (
        <p className="mt-md text-sm text-neutral-400">Hasn&apos;t shared anything yet.</p>
      ) : (
        <dl className="mt-md space-y-sm">
          {shared.map((q) => (
            <div key={q.id}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {q.emoji} {q.short}
              </dt>
              <dd className="mt-0.5 text-sm text-neutral-800">{mate.answers[q.id]}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
