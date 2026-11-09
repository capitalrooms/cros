'use client'

// The dark band at the top of an admin page (the agreed desktop look, 2 Oct 2026): title, a line under it, stat tiles,
// actions on the right and optional tabs that sit on its bottom edge. Same look as the contractor, cleaner and
// lettings apps. Put it first in the page, outside the page's content wrapper.

import Link from 'next/link'
import { StoredImg } from '@/components/StoredImg'
import type { ReactNode } from 'react'
import { display } from '@/app/components/financeLook'

export interface HeroStat { label: string; value: ReactNode; tone?: 'good' | 'warn' | 'info' | 'bad'; href?: string }
/** A tab on the band's bottom edge: a link (href), or a button that switches the page's own view (onClick). */
export interface HeroTab { label: ReactNode; href?: string; onClick?: () => void; active?: boolean; key?: string }

const TONE: Record<string, string> = { good: 'text-[#6EAF8B]', warn: 'text-[#E8B06B]', info: 'text-[#8FB4F0]', bad: 'text-[#F28B82]' }

// look 'olive' (3 Nov 2026): the Finance screens, in the Finance home's olive & mustard on cream (look C)
/** trail (rebuild A+B): where this record sits — e.g. Properties › 44 Claverton Street › Room 1 — each step a link back. */
export interface TrailStep { label: ReactNode; href?: string }
/** siblings (4 Nov 2026): step between records of the same kind — Room 1 of 7, with previous / next and the full list. */
export interface HeroSiblings { label: string; items: { label: string; href: string; current?: boolean; dot?: string; hint?: string }[] }
/** chip: the record's one status next to its title (Let · On notice · Empty · Current tenancy). */
export interface HeroChip { label: string; tone?: 'good' | 'warn' | 'bad' | 'info' | 'plain' }
const CHIP: Record<string, string> = { good: 'bg-[#6EAF8B]/25 text-[#CFEBDB]', warn: 'bg-[var(--accent,#C4922A)]/30 text-[#F6E3B8]', bad: 'bg-[#F28B82]/25 text-[#FBD3CF]', info: 'bg-[#8FB4F0]/25 text-[#D6E4FB]', plain: 'bg-[#F6F3EC]/12 text-[#F6F3EC]/85' }

export default function PageHero({ title, subtitle, eyebrow, stats, actions, tabs, look, trail, chip, siblings, image, imageHref }: {
  title: ReactNode; subtitle?: ReactNode; eyebrow?: ReactNode; stats?: HeroStat[]; actions?: ReactNode; tabs?: HeroTab[]; look?: 'olive'; trail?: TrailStep[]
  chip?: HeroChip; siblings?: HeroSiblings
  /** a small photo of the property or room beside the title (9 Nov 2026, Harry: no thumbnail anywhere) */
  image?: string | null; imageHref?: string
}) {
  // every band is olive since the rebuild (3 Nov 2026); look stays accepted so older calls still compile
  const olive = look === 'olive' || true
  return (
    <section className={olive ? 'bg-[var(--band,#1F3B2E)] text-[var(--ground,#F3F0E6)]' : 'bg-[#181614] text-[#F6F3EC]'}>
      <div className="mx-auto max-w-6xl px-lg pt-lg">
        <div className="flex flex-wrap items-end justify-between gap-md">
          <div className="flex min-w-0 items-end gap-md">
          {image && (() => {
            const pic = <StoredImg src={image} alt="" className="h-16 w-20 shrink-0 rounded-xl object-cover ring-2 ring-[#F6F3EC]/20 sm:h-20 sm:w-28" />
            return imageHref ? <Link href={imageHref} prefetch={false} className="shrink-0 transition-opacity hover:opacity-90" title="Photos">{pic}</Link> : pic
          })()}
          <div className="min-w-0">
            {((trail && trail.length > 0) || siblings) && (
              <nav aria-label="Where this is" className="mb-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-[#F3F0E6]/75">
                {(trail ?? []).map((t, i) => <span key={i} className="flex items-center gap-x-1.5">
                  {i > 0 && <span aria-hidden="true" className="text-[#F3F0E6]/45">›</span>}
                  {t.href ? <Link href={t.href} className="hover:text-[var(--ground,#F3F0E6)] hover:underline underline-offset-2">{t.label}</Link> : <span>{t.label}</span>}
                </span>)}
                {siblings && <Siblings s={siblings} lead={!!trail?.length} />}
              </nav>
            )}
            {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#F6F3EC]/50">{eyebrow}</p>}
            <div className="flex flex-wrap items-center gap-x-sm gap-y-1">
              <h1 className={`text-2xl font-extrabold leading-tight sm:text-[28px] ${olive ? `${display.className} tracking-tight sm:text-[34px]` : ''}`} style={olive ? undefined : { fontFamily: 'var(--font-baloo-2, system-ui, sans-serif)' }}>{title}</h1>
              {chip && <span className={`rounded-full px-sm py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] ${CHIP[chip.tone ?? 'plain']}`}>{chip.label}</span>}
            </div>
            {subtitle && <p className="mt-0.5 text-sm text-[#F6F3EC]/60">{subtitle}</p>}
          </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-sm">{actions}</div>}
        </div>
        {stats && stats.length > 0 && (
          // tiles are the same size on every screen (4 Nov 2026): a quarter of the band, however many there are
          <div className="mt-md grid grid-cols-2 gap-sm sm:grid-cols-4">
            {stats.map(s => {
              const body = <>
                <p className={`text-xl font-bold tabular-nums sm:text-2xl ${s.tone ? (olive && s.tone === 'warn' ? 'text-[var(--accent,#E8B931)]' : TONE[s.tone]) : ''} ${olive ? display.className : ''}`} style={olive ? undefined : { fontFamily: 'var(--font-baloo-2, system-ui, sans-serif)' }}>{s.value}</p>
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
            {tabs.map((t, i) => {
              const cls = `whitespace-nowrap rounded-t-xl px-md py-sm text-sm ${t.active ? (olive ? 'bg-[var(--ground,#F3F0E6)] font-bold text-[var(--ink,#23261A)]' : 'bg-neutral-100 font-bold text-[#181614]') : 'text-[#F6F3EC]/65 hover:text-[#F6F3EC]'}`
              const k = t.key ?? t.href ?? String(i)
              return t.href
                ? <Link key={k} href={t.href} prefetch={false} className={cls}>{t.label}</Link>
                : <button key={k} type="button" onClick={t.onClick} aria-pressed={!!t.active} className={cls}>{t.label}</button>
            })}
          </nav>
        ) : <div className="h-lg" />}
      </div>
    </section>
  )
}

// ‹ Room 1 of 7 › — previous / next, and a menu of every sibling with its state; keyboard: the menu is a native <details>
function Siblings({ s, lead }: { s: HeroSiblings; lead: boolean }) {
  const i = s.items.findIndex(x => x.current)
  const prev = i > 0 ? s.items[i - 1] : null, next = i >= 0 && i < s.items.length - 1 ? s.items[i + 1] : null
  const arrow = 'grid h-6 w-6 place-items-center rounded-md hover:bg-[#F6F3EC]/12'
  return (
    <span className="flex items-center gap-x-1">
      {lead && <span aria-hidden="true" className="text-[#F3F0E6]/45">›</span>}
      {prev ? <Link href={prev.href} className={arrow} aria-label={`Previous: ${prev.label}`} title={prev.label}>‹</Link> : <span className={`${arrow} opacity-30`} aria-hidden="true">‹</span>}
      <details className="relative">
        <summary className="cursor-pointer list-none rounded-md px-xs hover:bg-[#F6F3EC]/12 [&::-webkit-details-marker]:hidden">{s.label} ▾</summary>
        <div className="absolute left-0 z-40 mt-1 max-h-[60vh] min-w-[240px] overflow-auto rounded-xl border border-neutral-200 bg-white p-1 text-neutral-900 shadow-xl">
          {s.items.map(x => (
            <Link key={x.href} href={x.href} aria-current={x.current ? 'page' : undefined} className={`flex items-center gap-sm rounded-lg px-sm py-1.5 text-sm hover:bg-neutral-100 ${x.current ? 'bg-neutral-100 font-bold' : ''}`}>
              {x.dot && <span className={`h-2 w-2 flex-none rounded-full ${x.dot}`} />}
              <span className="flex-1">{x.label}</span>
              {x.hint && <span className="truncate text-xs text-neutral-500">{x.hint}</span>}
            </Link>
          ))}
        </div>
      </details>
      {next ? <Link href={next.href} className={arrow} aria-label={`Next: ${next.label}`} title={next.label}>›</Link> : <span className={`${arrow} opacity-30`} aria-hidden="true">›</span>}
    </span>
  )
}

/** A light button for the dark band. */
export function HeroButton({ children, href, onClick, primary }: { children: ReactNode; href?: string; onClick?: () => void; primary?: boolean }) {
  const cls = `rounded-xl px-md py-xs text-xs font-bold ${primary ? 'bg-[#F6F3EC] text-[#181614] hover:bg-white' : 'border border-[#F6F3EC]/25 text-[#F6F3EC] hover:bg-[#F6F3EC]/10'}`
  return href ? <Link href={href} prefetch={false} className={cls}>{children}</Link> : <button type="button" onClick={onClick} className={cls}>{children}</button>
}
