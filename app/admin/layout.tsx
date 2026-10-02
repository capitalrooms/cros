'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ReactNode, useState, useRef, useEffect } from 'react'
import Logo from '@/components/Logo'
import { AdminContext } from '@/lib/admin-context'
import { createClient } from '@/lib/supabase'

import { ZONES, type Zone } from '@/lib/adminNav'
import MobileTabBar from './components/MobileTabBar'
import StaffNotificationBell from '@/app/components/StaffNotificationBell'

// ─── Helpers ────────────────────────────────────────────────────────────────

function getActiveZone(pathname: string): Zone | null {
  if (pathname === '/admin') return ZONES[0]
  // Skip dash zone — it only matches the exact /admin path above
  return ZONES.find(z => z.id !== 'dash' && z.routes.some(r => pathname === r || pathname.startsWith(r + '/'))) ?? null
}

function isPropertyHub(pathname: string): boolean {
  // /admin/properties/[id] — but NOT /admin/properties/new (handled in portfolio)
  return /^\/admin\/properties\/[^/]+($|\/)/.test(pathname) && !pathname.includes('/new')
}

// ─── Layout ─────────────────────────────────────────────────────────────────

function ProfileMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const [initial, setInitial] = useState('')

  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => {
      const email = data.session?.user?.email ?? ''
      setInitial(email ? email[0].toUpperCase() : '')
    })
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div ref={ref} className="relative">
      {/* Phone: straight to your profile */}
      <Link href="/admin/profile" aria-label="My profile"
        className="md:hidden w-8 h-8 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-xs font-bold text-white/80">
        {initial || '·'}
      </Link>
      <button
        onClick={() => setOpen(o => !o)}
        className="hidden md:flex w-7 h-7 rounded-full bg-white/10 border border-white/10 items-center justify-center text-xs text-white/60 hover:bg-white/15 transition-colors"
        aria-label="Account menu"
      >
        {initial || '·'}
      </button>
      {open && (
        <div className="absolute right-0 top-9 w-40 bg-white rounded-xl shadow-lg border border-neutral-200 overflow-hidden z-50">
          <Link
            href="/admin/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2.5 text-xs text-neutral-700 hover:bg-neutral-50"
          >
            👤 My profile
          </Link>
          <Link
            href="/admin/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2.5 text-xs text-neutral-700 hover:bg-neutral-50 border-t border-neutral-100"
          >
            ⚙️ Settings
          </Link>
          <Link
            href="/admin/settings/signatures"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2.5 text-xs text-neutral-700 hover:bg-neutral-50"
          >
            ✍️ Email signatures
          </Link>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-red-600 hover:bg-red-50 border-t border-neutral-100"
          >
            🚪 Sign out
          </button>
        </div>
      )}
    </div>
  )
}

const PHONE_TAB_ROOTS = ['/admin', '/admin/search', '/admin/properties', '/admin/money', '/admin/more']
const isPhoneTabRoot = (p: string) => PHONE_TAB_ROOTS.includes(p)

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const onPropHub = isPropertyHub(pathname)
  const activeZone = getActiveZone(pathname)
  const hasSubnav = !onPropHub && (activeZone?.subnav.length ?? 0) > 0

  // On phones the tab bars scroll sideways; bring the current tab into view.
  useEffect(() => {
    document.querySelectorAll<HTMLElement>('nav [data-active]').forEach(el =>
      el.scrollIntoView({ block: 'nearest', inline: 'center' }))
  }, [pathname, searchParams])

  return (
    <AdminContext.Provider value={true}>
    <div className="flex flex-col h-screen supports-[height:100dvh]:h-dvh overflow-hidden bg-neutral-100">

      {/* ── Top bar ── */}
      <header className="flex-shrink-0 bg-neutral-950 text-white z-40" style={{ minHeight: 56, paddingTop: 'env(safe-area-inset-top)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}>
        <div className="grid h-14 px-3" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
          {/* Left: breadcrumb — always same width bucket so logo stays centred */}
          <div className="flex items-center min-w-0">
            {/* Phone: back arrow on inner pages (tab screens are top level) */}
            {!isPhoneTabRoot(pathname) && (
              <button type="button" onClick={() => router.back()} aria-label="Back"
                className="md:hidden -ml-1 mr-1 flex h-9 w-9 items-center justify-center rounded-full text-white/80 hover:bg-white/10">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
            )}
            {onPropHub ? (
              <Link
                href="/admin"
                className="hidden md:flex text-xs text-white/40 hover:text-white/70 transition-colors items-center gap-1 whitespace-nowrap"
              >
                ← All properties
              </Link>
            ) : activeZone && activeZone.id !== 'dash' ? (
              <span className="text-xs text-white/40 truncate hidden sm:block">{activeZone.label}</span>
            ) : null}
          </div>

          {/* Centre: logo — always perfectly centred */}
          <div className="flex items-center justify-center">
            <Link href="/admin" aria-label="Home" className="block hover:opacity-80 transition-opacity">
              <Logo variant="emblem" height={32} invert />
            </Link>
          </div>

          {/* Right: actions */}
          <div className="flex items-center justify-end gap-1.5">
            <Link
              href="/admin/notify"
              className="flex items-center gap-1 px-2 py-1.5 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition-colors"
            >
              <span>⚡</span>
              <span className="hidden sm:inline">Quick Notify</span>
            </Link>
            <StaffNotificationBell />
            <ProfileMenu />
          </div>
        </div>
      </header>

      {/* ── Zone tabs ── */}
      {!onPropHub && (
        <nav
          className="flex-shrink-0 bg-neutral-900 hidden md:flex overflow-x-auto border-b border-white/8"
          style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          {ZONES.map(zone => {
            const active = activeZone?.id === zone.id
            return (
              <Link
                key={zone.id}
                href={zone.home ?? zone.subnav[0]?.href ?? (zone.id === 'dash' ? '/admin' : '#')}
                prefetch={false}
                aria-label={zone.label}
                data-active={active || undefined}
                className={[
                  'flex-shrink-0 flex items-center gap-1 px-3 py-2.5 text-xs font-medium transition-colors border-b-2 whitespace-nowrap',
                  active
                    ? 'text-white border-amber-500'
                    : 'text-white/60 border-transparent hover:text-white hover:border-white/20',
                ].join(' ')}
              >
                <span className="text-sm leading-none">{zone.emoji}</span>
                <span className="hidden xs:inline sm:inline">{zone.label}</span>
              </Link>
            )
          })}
        </nav>
      )}

      {/* ── Mobile subnav (horizontal scroll, shown below zone bar on mobile) ── */}
      {hasSubnav && (
        <nav
          className="hidden"
          style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          {activeZone!.subnav.map(item => {
            const [itemPath, itemQuery] = item.href.split('?')
            const itemTab = itemQuery ? new URLSearchParams(itemQuery).get('tab') : null
            const active = itemTab
              ? pathname === itemPath && searchParams.get('tab') === itemTab
              : pathname === item.href || pathname.startsWith(itemPath + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                data-active={active || undefined}
                className={[
                  'flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors border-b-2 whitespace-nowrap',
                  active
                    ? 'text-amber-700 border-amber-500 bg-amber-50'
                    : 'text-neutral-500 border-transparent hover:text-neutral-800',
                ].join(' ')}
              >
                <span>{item.emoji}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>
      )}

      {/* ── Body: subnav sidebar (desktop) + content ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Subnav sidebar — desktop only */}
        {hasSubnav && (
          <aside className="hidden md:flex flex-col flex-shrink-0 w-44 bg-white border-r border-neutral-200 overflow-y-auto">
            <p className="px-3.5 pt-3 pb-1.5 text-[9px] font-bold uppercase tracking-widest text-neutral-400">
              {activeZone!.label}
            </p>
            {activeZone!.subnav.map(item => {
              const [itemPath, itemQuery] = item.href.split('?')
              const itemTab = itemQuery ? new URLSearchParams(itemQuery).get('tab') : null
              const active = itemTab
                ? pathname === itemPath && searchParams.get('tab') === itemTab
                : pathname === item.href || pathname.startsWith(itemPath + '/')
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  className={[
                    'flex items-center gap-2 px-3.5 py-2 text-xs transition-all border-l-2',
                    active
                      ? 'bg-amber-50 text-amber-800 border-l-amber-500 font-medium'
                      : 'text-neutral-500 border-l-transparent hover:bg-neutral-50 hover:text-neutral-800',
                  ].join(' ')}
                >
                  <span className="text-sm w-4 text-center flex-shrink-0">{item.emoji}</span>
                  <span className="leading-tight">{item.label}</span>
                </Link>
              )
            })}
          </aside>
        )}

        {/* Main content */}
        <main className="flex-1 overflow-y-auto min-w-0 md:pb-[env(safe-area-inset-bottom)]">
          {children}
        </main>

      </div>

      {/* Phone only: app-style bottom tabs */}
      <MobileTabBar />
    </div>
    </AdminContext.Provider>
  )
}
