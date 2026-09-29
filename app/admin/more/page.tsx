'use client'

// Phone "More" tab — every admin page, grouped by zone (same list the desktop nav uses).
import Link from 'next/link'
import { ZONES } from '@/lib/adminNav'

const EXTRA = [
  { emoji: '👤', label: 'My profile', href: '/admin/profile' },
  { emoji: '⚙️', label: 'Settings', href: '/admin/settings' },
  { emoji: '✍️', label: 'Email signatures', href: '/admin/settings/signatures' },
]

function Group({ title, items }: { title: string; items: { emoji: string; label: string; href: string }[] }) {
  return (
    <section className="space-y-1.5">
      <h2 className="px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-500">{title}</h2>
      <ul className="rounded-2xl bg-white divide-y divide-neutral-100 overflow-hidden">
        {items.map(it => (
          <li key={it.href}>
            <Link href={it.href} className="flex items-center gap-3 px-3.5 py-3 active:bg-neutral-50">
              <span className="w-6 text-center text-base" aria-hidden>{it.emoji}</span>
              <span className="flex-1 text-[15px] font-medium text-neutral-900">{it.label}</span>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-300"><path d="M9 6l6 6-6 6" /></svg>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function AdminMorePage() {
  return (
    <div className="min-h-screen bg-neutral-100">
      <div className="mx-auto max-w-6xl px-lg py-xl space-y-5">
        <h1 className="text-[26px] leading-tight font-bold text-neutral-950">More</h1>
        {ZONES.filter(z => z.subnav.length).map(z => <Group key={z.id} title={z.label} items={z.subnav} />)}
        <Group title="You" items={EXTRA} />
      </div>
    </div>
  )
}
