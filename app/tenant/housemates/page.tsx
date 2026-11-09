'use client'
// Meet your housemates (9 Nov 2026 rebuild): everyone living in the house now, with their photo or avatar, bio and the
// answers they chose to share. From /api/tenant/housemates (first names and rooms only, never contact details or rent).
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import Face from '@/components/Face'
import { adminFetch } from '@/lib/adminFetch'
import { ICEBREAKER_QUESTIONS, answeredCount, type IcebreakerAnswers } from '@/lib/icebreaker'

type Mate = { personId: string; isMe: boolean; name: string; roomName: string | null; photoUrl: string | null; answers: IcebreakerAnswers }

export default function Housemates() {
  const router = useRouter()
  const [data, setData] = useState<{ house: string | null; housemates: Mate[] } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    adminFetch('/api/tenant/housemates').then(async r => {
      if (r.status === 401) { router.push('/login'); return }
      setData(await r.json())
    }).catch(() => setError('Couldn’t load your housemates. Check your connection and try again.'))
  }, [router])

  const me = data?.housemates.find(h => h.isMe)
  const others = (data?.housemates ?? []).filter(h => !h.isMe).sort((a, b) => answeredCount(b.answers) - answeredCount(a.answers) || a.name.localeCompare(b.name))
  const meDone = !!me && (answeredCount(me.answers) >= 2 || !!me.photoUrl || !!me.answers.avatar)

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/tenant" label="Home" />} />
      <main className="mx-auto max-w-xl px-lg py-lg">
        {data?.house && <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">{data.house}</p>}
        <h1 className="mt-xs text-2xl font-bold text-neutral-900">Your housemates</h1>
        {error && <p className="mt-md rounded-xl bg-red-50 p-md text-sm text-red-700">{error}</p>}
        {!data && !error && <p className="mt-lg text-sm text-neutral-400">Loading…</p>}

        {me && (
          <Link href="/tenant/icebreaker" className={`mt-lg flex items-center gap-md rounded-2xl p-md ${meDone ? 'border border-neutral-200 bg-white' : 'border-2 border-neutral-900 bg-white'}`}>
            <Face name={me.name} photoUrl={me.photoUrl} avatar={me.answers.avatar} size={52} />
            <span className="min-w-0 flex-1">
              <span className="block font-bold text-neutral-900">{meDone ? 'You' : 'Say hello to the house'}</span>
              <span className="block truncate text-sm text-neutral-600">{meDone ? (me.answers.bio || 'Edit your profile') : 'Add a photo or avatar and a line about you'}</span>
            </span>
            <span className="text-sm font-semibold text-neutral-900">{meDone ? 'Edit' : 'Start'} ›</span>
          </Link>
        )}

        {data && others.length === 0 && <p className="mt-lg rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center text-sm text-neutral-500">You’re the first one here. Your housemates will appear as they move in.</p>}
        <div className="mt-lg space-y-md">
          {others.map(h => <MateCard key={h.personId} m={h} />)}
        </div>
      </main>
    </div>
  )
}

function MateCard({ m }: { m: Mate }) {
  const shared = ICEBREAKER_QUESTIONS.filter(q => q.id !== 'bio' && String(m.answers[q.id] ?? '').trim())
  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-lg">
      <div className="flex items-center gap-md">
        <Face name={m.name} photoUrl={m.photoUrl} avatar={m.answers.avatar} size={60} />
        <div className="min-w-0">
          <p className="truncate text-lg font-bold text-neutral-900">{m.name}</p>
          {m.roomName && <p className="truncate text-sm text-neutral-500">{m.roomName}</p>}
        </div>
      </div>
      {m.answers.bio && <p className="mt-md text-[15px] leading-relaxed text-neutral-800">{m.answers.bio}</p>}
      {shared.length > 0 ? (
        <dl className="mt-md grid gap-sm">
          {shared.map(q => (
            <div key={q.id} className="rounded-xl bg-neutral-50 px-md py-sm">
              <dt className="text-xs font-semibold text-neutral-500">{q.short}</dt>
              <dd className="text-sm text-neutral-900">{m.answers[q.id]}</dd>
            </div>
          ))}
        </dl>
      ) : !m.answers.bio && <p className="mt-md text-sm text-neutral-400">Hasn’t said hello yet.</p>}
    </article>
  )
}
