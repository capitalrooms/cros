'use client'

// The tenant, contractor and cleaner apps on a computer (26 Oct 2026, Harry: "a nice desktop or browser version for
// cleaner, contractor and tenant so they are all in harmony ideally working from the same components"). One frame for
// all three, drawn by their layouts so every screen has it: a green rail on the left (the logo, the app's sections,
// sign out) and the screen beside it. On phones the rail isn't drawn — they keep the bottom bar (RoleTabBar).
// The sections are the phone bar's, with the same icons (PhoneTabBar ICONS); the first is home, the rest A–Z.
// A home screen that switches sections in place says so with useRoleRail (which section is showing, counts, a button).
import Link from 'next/link'
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Logo from '@/components/Logo'
import { ICONS } from '@/app/components/PhoneTabBar'
import { signOut } from '@/lib/auth'

export type Role = 'tenant' | 'contractor' | 'cleaner'
type Item = { key: string; label: string; icon: ReactNode; href: string; tone?: 'alert' }

const NAV: Record<Role, { home: Item; items: Item[]; primary?: Item; label: string }> = {
  cleaner: {
    label: 'Cleaner',
    home: { key: 'today', label: 'Today', icon: ICONS.home, href: '/cleaner' },
    items: [
      { key: 'upcoming', label: 'Upcoming', icon: ICONS.calendar, href: '/cleaner?tab=upcoming' },
      { key: 'done', label: 'Done', icon: ICONS.check, href: '/cleaner?tab=done' },
      { key: 'compliance', label: 'Compliance', icon: ICONS.notes, href: '/cleaner?tab=compliance' },
      { key: 'invoices', label: 'Invoices', icon: ICONS.invoice, href: '/cleaner/invoices' },
      { key: 'me', label: 'My details', icon: ICONS.me, href: '/cleaner/profile' },
    ],
  },
  contractor: {
    label: 'Contractor',
    home: { key: 'today', label: 'Today', icon: ICONS.home, href: '/contractor' },
    items: [
      { key: 'quotes', label: 'Quotes', icon: ICONS.notes, href: '/contractor?tab=quotes' },
      { key: 'ongoing', label: 'Ongoing', icon: ICONS.wrench, href: '/contractor?tab=ongoing' },
      { key: 'waiting', label: 'To book', icon: ICONS.clock, href: '/contractor?tab=waiting' },
      { key: 'booked', label: 'Booked', icon: ICONS.calendar, href: '/contractor?tab=booked' },
      { key: 'done', label: 'Done', icon: ICONS.check, href: '/contractor?tab=done' },
      { key: 'invoices', label: 'Invoices', icon: ICONS.invoice, href: '/contractor/invoices' },
      { key: 'me', label: 'My details', icon: ICONS.me, href: '/contractor/profile' },
    ],
  },
  tenant: {
    label: 'Tenant',
    home: { key: 'home', label: 'Home', icon: ICONS.home, href: '/tenant' },
    primary: { key: 'repair', label: 'Report a repair', icon: ICONS.wrench, href: '/tenant/maintenance/report' },
    items: [
      { key: 'inbox', label: 'Inbox', icon: ICONS.inbox, href: '/tenant/inbox' },
      { key: 'requests', label: 'My requests', icon: ICONS.notes, href: '/tenant/requests' },
      { key: 'notices', label: 'Notice board', icon: ICONS.board, href: '/tenant/notices' },
      { key: 'housemates', label: 'Housemates', icon: ICONS.people, href: '/tenant/housemates' },
      { key: 'property', label: 'Property info', icon: ICONS.building, href: '/tenant/property-info' },
      { key: 'documents', label: 'Documents', icon: ICONS.invoice, href: '/tenant/documents' },
      { key: 'emergency', label: 'Emergency', icon: ICONS.alert, href: '/tenant/emergency', tone: 'alert' },
      { key: 'me', label: 'My details', icon: ICONS.me, href: '/tenant/profile' },
    ],
  },
}

/** Which section a screen belongs to, from its address, when the screen doesn't say. */
function sectionFor(role: Role, path: string): string | null {
  const nav = NAV[role]
  if (path === nav.home.href) return nav.home.key
  const hit = [...nav.items, ...(nav.primary ? [nav.primary] : [])].find(i => !i.href.includes('?') && (path === i.href || path.startsWith(i.href + '/')))
  if (hit) return hit.key
  if (role === 'tenant' && path.startsWith('/tenant/maintenance')) return 'requests'
  if (role === 'tenant' && path.startsWith('/tenant/visit')) return 'requests'
  return null
}

type Override = { active?: string | null; pick?: (key: string) => void; inPage?: string[]; badges?: Record<string, number | undefined>; extra?: ReactNode }
const Ctx = createContext<{ set: (o: Override | null) => void } | null>(null)

/**
 * A home screen that switches its sections in place tells the rail which one is showing, how to switch, and any counts
 * (and may add a button under the sections, e.g. the contractor's "Need to visit a property?").
 */
export function useRoleRail(o: Override) {
  const ctx = useContext(Ctx)
  const pick = useRef(o.pick)
  pick.current = o.pick
  const key = JSON.stringify([o.active, o.inPage, o.badges])
  useEffect(() => {
    ctx?.set({ ...o, pick: k => pick.current?.(k) })
  }, [key])   // eslint-disable-line react-hooks/exhaustive-deps — `extra` is taken as it is when the sections change
  useEffect(() => () => ctx?.set(null), [])   // eslint-disable-line react-hooks/exhaustive-deps
}

export default function RoleShell({ role, children }: { role: Role; children: ReactNode }) {
  const [override, set] = useState<Override | null>(null)
  const value = useMemo(() => ({ set }), [])
  return (
    <Ctx.Provider value={value}>
      <div className="cr-shell lg:grid lg:min-h-screen lg:grid-cols-[232px_minmax(0,1fr)]">
        <RoleRail role={role} override={override} />
        <div className="min-w-0">{children}</div>
      </div>
    </Ctx.Provider>
  )
}

function RoleRail({ role, override }: { role: Role; override: Override | null }) {
  const nav = NAV[role]
  const path = usePathname() ?? ''
  const router = useRouter()
  // an office "view as" keeps going with them (?as=…) — read once, not with useSearchParams (no Suspense needed)
  const [as, setAs] = useState<string | null>(null)
  useEffect(() => { setAs(new URLSearchParams(window.location.search).get('as')) }, [path])
  const withAs = (href: string) => as ? `${href}${href.includes('?') ? '&' : '?'}as=${as}` : href
  const onHome = path === nav.home.href
  const active = onHome && override?.active !== undefined ? override.active : sectionFor(role, path)
  const items = [nav.home, ...[...nav.items].sort((a, b) => a.label.localeCompare(b.label))]

  const row = (i: Item) => {
    const on = active === i.key
    const badge = override?.badges?.[i.key]
    const cls = `group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13.5px] font-semibold transition-colors ${on ? 'bg-white/10 text-white' : i.tone === 'alert' ? 'text-red-200 hover:bg-white/5' : 'text-white/65 hover:bg-white/5 hover:text-white'}`
    const inner = (
      <>
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke={on ? 'var(--cr-gold)' : 'currentColor'} strokeWidth={on ? 2.1 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{i.icon}</svg>
        <span className="flex-1 truncate">{i.label}</span>
        {!!badge && <span className="min-w-[20px] rounded-full px-1.5 text-center text-[11px] font-bold leading-5 text-neutral-900" style={{ background: 'var(--cr-gold)' }}>{badge > 99 ? '99+' : badge}</span>}
      </>
    )
    if (onHome && override?.pick && override.inPage?.includes(i.key))
      return <button key={i.key} type="button" aria-current={on ? 'page' : undefined} className={cls} onClick={() => { override.pick!(i.key); window.scrollTo({ top: 0 }) }}>{inner}</button>
    return <Link key={i.key} href={withAs(i.href)} prefetch={false} aria-current={on ? 'page' : undefined} className={cls}>{inner}</Link>
  }

  return (
    <aside aria-label={`${nav.label} sections`} className="sticky top-0 hidden h-screen flex-col overflow-y-auto bg-[var(--cr-bar)] px-3 pb-4 pt-6 text-white lg:flex">
      <Link href={withAs(nav.home.href)} aria-label="Home" className="mb-1 flex flex-col items-start gap-2 px-3">
        <Logo variant="emblem" height={30} invert />
        <Logo variant="wordmark" height={22} invert />
      </Link>
      <p className="mb-5 px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">{nav.label}</p>
      {nav.primary && (
        <Link href={withAs(nav.primary.href)} prefetch={false}
          className="mb-4 flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-bold text-neutral-900 transition-opacity hover:opacity-90" style={{ background: 'var(--cr-gold)' }}>
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{nav.primary.icon}</svg>
          {nav.primary.label}
        </Link>
      )}
      <nav className="flex flex-col gap-0.5">{items.map(row)}</nav>
      {override?.extra && <div className="mt-4 px-1">{override.extra}</div>}
      <div className="mt-auto border-t border-white/10 pt-3">
        <button type="button" onClick={async () => { await signOut(); router.push('/login') }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13px] font-semibold text-white/55 hover:bg-white/5 hover:text-white">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
          Sign out
        </button>
      </div>
    </aside>
  )
}
