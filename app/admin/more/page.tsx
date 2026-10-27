'use client'

// Phone "More" tab — every admin page the person may open, grouped by zone (same list the desktop nav uses).
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ZONES } from '@/lib/adminNav'
import { useAdminAccess } from '@/lib/admin-context'
import { createClient } from '@/lib/supabase'

const EXTRA = [
  { emoji: '👤', label: 'My profile', href: '/admin/profile' },
  { emoji: '🔑', label: 'Password & sign-in', href: '/account' },
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
  const allowed = useAdminAccess()
  const router = useRouter()
  const mine = (items: { emoji: string; label: string; href: string }[]) => items.filter(i => i.href === '/account' || allowed(i.href))
  async function signOut() {
    await createClient().auth.signOut()
    router.push('/login')
  }
  return (
    <div className="min-h-screen bg-neutral-100">
      <div className="mx-auto max-w-6xl px-lg py-xl space-y-5">
        <h1 className="text-[26px] leading-tight font-bold text-neutral-950">More</h1>
        {ZONES.map(z => ({ ...z, subnav: mine(z.subnav) })).filter(z => z.subnav.length).map(z => <Group key={z.id} title={z.label} items={z.subnav} />)}
        <Group title="You" items={mine(EXTRA)} />
        <button type="button" onClick={signOut}
          className="w-full rounded-2xl bg-white px-3.5 py-3 text-left text-[15px] font-medium text-red-600 active:bg-red-50">
          Sign out
        </button>
      </div>
    </div>
  )
}
