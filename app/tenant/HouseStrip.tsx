'use client'
// "Your house" on the tenant home (9 Nov 2026): your housemates' faces in a row, one tap to meet them, and a nudge to
// add your own photo or avatar if you haven't. Hidden when there's nothing to show (or in the office's View as).
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Face from '@/components/Face'
import { adminFetch } from '@/lib/adminFetch'

type Mate = { personId: string; isMe: boolean; name: string; photoUrl: string | null; answers: Record<string, string> }

export default function HouseStrip() {
  const [mates, setMates] = useState<Mate[] | null>(null)
  useEffect(() => { adminFetch('/api/tenant/housemates').then(r => r.ok ? r.json() : null).then(d => setMates(d?.housemates ?? null)).catch(() => {}) }, [])
  if (!mates) return null
  const me = mates.find(m => m.isMe)
  const others = mates.filter(m => !m.isMe)
  const meSet = !!me && (!!me.photoUrl || !!me.answers?.avatar || !!me.answers?.bio)
  if (!others.length && meSet) return null
  return (
    <Link href={meSet ? '/tenant/housemates' : '/tenant/icebreaker'} className="flex items-center gap-md rounded-[22px] bg-white p-lg active:scale-[0.99] transition-transform">
      <span className="flex -space-x-3">
        {(others.length ? others : me ? [me] : []).slice(0, 5).map(m => <span key={m.personId} className="rounded-full ring-2 ring-white"><Face name={m.name} photoUrl={m.photoUrl} avatar={m.answers?.avatar} size={40} /></span>)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-neutral-900">{meSet ? 'Your housemates' : 'Say hello to your house'}</span>
        <span className="block truncate text-sm text-neutral-500">{meSet ? `${others.length} living with you` : 'Add a photo or avatar and a line about you'}</span>
      </span>
      <span className="text-neutral-400" aria-hidden="true">›</span>
    </Link>
  )
}
