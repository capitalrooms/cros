'use client'
// Meet your housemates (9 Nov 2026 rebuild): everyone living in the house now, with their photo or avatar, bio and the
// answers they chose to share. From /api/tenant/housemates (first names and rooms only, never contact details or rent).
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Greeting, Banner } from '@/app/components/garden/kit'
import Face from '@/components/Face'
import { adminFetch } from '@/lib/adminFetch'
import { ICEBREAKER_QUESTIONS, answeredCount, type IcebreakerAnswers } from '@/lib/icebreaker'

type Mate = { personId: string; isMe: boolean; name: string; roomName: string | null; photoUrl: string | null; answers: IcebreakerAnswers }

export default function Housemates() {
  const router = useRouter()
  const [data, setData] = useState<{ house: string | null; housemates: Mate[]; arriving?: { name: string; roomName: string | null; startDate: string }[] } | null>(null)
  const [bins, setBins] = useState<{ day: string | null; next: { date: string } | null } | null>(null)
  useEffect(() => { adminFetch('/api/tenant/bins').then(r => r.ok ? r.json() : null).then(setBins).catch(() => {}) }, [])
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
  const everyone = [...(me ? [me] : []), ...others]

  return (
    <div className="min-h-screen bg-[#EEF2EC]">
      {/* "Garden Ask" rendering "Tenant — House" (14 Nov 2026): who's who as cards, who's arriving, house facts, notices */}
      <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 pb-6 pt-[max(calc(env(safe-area-inset-top)+16px),20px)]">
        <Greeting eyebrow={data?.house ? `The house · ${data.house}` : 'The house'} title="Who’s who" />
        {error && <p className="rounded-xl bg-red-50 p-md text-sm text-red-700">{error}</p>}
        {!data && !error && <p className="text-sm text-[#4E6158]">Loading…</p>}

        {everyone.length > 0 && (
          <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
            {everyone.map(m => (
              <a key={m.personId} href={m.isMe ? '/tenant/icebreaker' : `#mate-${m.personId}`} className="flex w-[118px] shrink-0 flex-col gap-2 rounded-[22px] bg-white p-3 shadow-[0_2px_0_#DCE5DD]">
                <span className="w-fit rounded-full" style={{ boxShadow: `0 0 0 3px #fff, 0 0 0 5px ${m.isMe ? 'var(--cr-gold)' : '#DCE5DD'}` }}><Face name={m.name} photoUrl={m.photoUrl} avatar={m.answers.avatar} size={52} /></span>
                <span><span className="block truncate text-[14.5px] font-bold text-[#14261F]">{m.isMe ? `${m.name} (you)` : m.name}</span>{m.roomName && <span className="block text-xs text-[#4E6158]">{m.roomName}</span>}</span>
                <span className="line-clamp-3 text-xs leading-snug text-[#14261F]">{m.isMe && !meDone ? 'Add your photo and a line about you →' : m.answers.bio || (m.isMe ? 'Edit your profile →' : 'Hasn’t said hello yet')}</span>
              </a>
            ))}
          </div>
        )}

        {data?.arriving?.[0] && (
          <Banner badge={data.arriving[0].name.slice(0, 1).toUpperCase()}>
            <strong>{data.arriving[0].name}</strong> moves into {data.arriving[0].roomName ?? 'the house'} on {new Date(data.arriving[0].startDate + 'T12:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} — say hi when you see them
          </Banner>
        )}
        {me && !meDone && <Banner badge="★" href="/tenant/icebreaker">Say hello to the house — <strong>add a photo or avatar</strong> and a line about you</Banner>}

        <section className="grid grid-cols-2 gap-3.5 rounded-[22px] bg-white p-4">
          <Fact k="Bin day" v={bins?.next ? new Date(bins.next.date + 'T12:00').toLocaleDateString('en-GB', { weekday: 'long' }) : bins?.day ?? 'Ask the office'} href="/tenant/ask?bins=1" />
          <Fact k="WiFi" v="In house info" href="/tenant/property-info" />
          <Fact k="Key safe" v="Tap to show" href="/tenant/property-info" />
          <Fact k="Your notice" v="2 months" href="/tenant/give-notice" />
        </section>

        <Link href="/tenant/notices" className="flex items-center justify-between rounded-[20px] bg-white px-4 py-3.5">
          <span><span className="block text-[15px] font-bold text-[#14261F]">Notice board</span><span className="block text-[13px] text-[#4E6158]">Shared updates and house tasks</span></span>
          <span className="text-[#4E6158]" aria-hidden="true">›</span>
        </Link>

        {data && others.length === 0 && <p className="rounded-2xl border border-dashed border-[#C3D0C6] bg-white p-xl text-center text-sm text-[#4E6158]">You’re the first one here. Your housemates will appear as they move in.</p>}
        {others.length > 0 && <h2 className="px-1 pt-2 text-lg font-bold text-[#14261F]">More about them</h2>}
        <div className="space-y-md">
          {others.map(h => <div key={h.personId} id={`mate-${h.personId}`} className="scroll-mt-4"><MateCard m={h} /></div>)}
        </div>
      </main>
    </div>
  )
}

function Fact({ k, v, href }: { k: string; v: string; href: string }) {
  return <Link href={href} className="flex flex-col gap-0.5"><span className="text-xs text-[#4E6158]">{k}</span><span className="text-[15px] font-bold text-[#14261F]">{v}</span></Link>
}

function MateCard({ m }: { m: Mate }) {
  const shared = ICEBREAKER_QUESTIONS.filter(q => q.id !== 'bio' && String(m.answers[q.id] ?? '').trim())
  return (
    <article className="rounded-[22px] bg-white p-lg">
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
