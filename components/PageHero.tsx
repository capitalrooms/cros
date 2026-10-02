'use client'

// The dark band at the top of an admin page (the agreed desktop look, 2 Oct 2026): title, a line under it, stat tiles,
// actions on the right and optional tabs that sit on its bottom edge. Same look as the contractor, cleaner and
// lettings apps. Put it first in the page, outside the page's content wrapper.

import Link from 'next/link'
import type { ReactNode } from 'react'

export interface HeroStat { label: string; value: ReactNode; tone?: 'good' | 'warn' | 'info' | 'bad'; href?: string }
export interface HeroTab { label: string; href: string; active?: boolean }

const TONE: Record<string, string> = { good: 'text-[#6EAF8B]', warn: 'text-[#E8B06B]', info: 'text-[#8FB4F0]', bad: 'text-[#F28B82]' }

export default function PageHero({ title, subtitle, eyebrow, stats, actions, tabs }: {
  title: ReactNode; subtitle?: ReactNode; eyebrow?: ReactNode; stats?: HeroStat[]; actions?: ReactNode; tabs?: HeroTab[]
}) {
  return (
    <section className="bg-[#181614] text-[#F6F3EC]">
      <div className="mx-auto max-w-6xl px-lg pt-lg">
        <div className="flex flex-wrap items-end justify-between gap-md">
          <div className="min-w-0">
            {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#F6F3EC]/50">{eyebrow}</p>}
            <h1 className="text-2xl font-extrabold leading-tight sm:text-[28px]" style={{ fontFamily: 'var(--font-baloo-2, system-ui, sans-serif)' }}>{title}</h1>
            {subtitle && <p className="mt-0.5 text-sm text-[#F6F3EC]/60">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-sm">{actions}</div>}
        </div>
        {stats && stats.length > 0 && (
          <div className={`mt-md grid gap-sm ${stats.length >= 4 ? 'grid-cols-2 sm:grid-cols-4' : stats.length === 3 ? 'grid-cols-3' : stats.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {stats.map(s => {
              const body = <>
                <p className={`text-xl font-bold tabular-nums sm:text-2xl ${s.tone ? TONE[s.tone] : ''}`} style={{ fontFamily: 'var(--font-baloo-2, system-ui, sans-serif)' }}>{s.value}</p>
                <p className="text-[11px] uppercase tracking-[0.06em] text-[#F6F3EC]/55">{s.label}</p>
              </>
              return s.href
                ? <Link key={s.label} href={s.href} prefetch={false} className="block rounded-2xl px-md py-sm transition-opacity hover:opacity-80" style={{ backgroundColor: 'rgba(246,243,236,0.07)' }}>{body}</Link>
                : <div key={s.label} className="rounded-2xl px-md py-sm" style={{ backgroundColor: 'rgba(246,243,236,0.07)' }}>{body}</div>
            })}
          </div>
        )}
        {tabs && tabs.length > 0 ? (
          <nav className="-mx-lg mt-md flex gap-0.5 overflow-x-auto px-lg" style={{ scrollbarWidth: 'none' }}>
            {tabs.map(t => (
              <Link key={t.href} href={t.href} prefetch={false}
                className={`whitespace-nowrap rounded-t-xl px-md py-sm text-sm ${t.active ? 'bg-neutral-100 font-bold text-[#181614]' : 'text-[#F6F3EC]/65 hover:text-[#F6F3EC]'}`}>
                {t.label}
              </Link>
            ))}
          </nav>
        ) : <div className="h-lg" />}
      </div>
    </section>
  )
}

/** A light button for the dark band. */
export function HeroButton({ children, href, onClick, primary }: { children: ReactNode; href?: string; onClick?: () => void; primary?: boolean }) {
  const cls = `rounded-xl px-md py-xs text-xs font-bold ${primary ? 'bg-[#F6F3EC] text-[#181614] hover:bg-white' : 'border border-[#F6F3EC]/25 text-[#F6F3EC] hover:bg-[#F6F3EC]/10'}`
  return href ? <Link href={href} prefetch={false} className={cls}>{children}</Link> : <button type="button" onClick={onClick} className={cls}>{children}</button>
}
