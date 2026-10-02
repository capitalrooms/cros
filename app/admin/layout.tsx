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
import Footer from '@/app/components/Footer'

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

const PHONE_TAB_ROOTS = ['/admin', '/admin/search', '/admin/active-rooms', '/admin/money', '/admin/more']
const isPhoneTabRoot = (p: string) => PHONE_TAB_ROOTS.includes(p)

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const onPropHub = isPropertyHub(pathname)
  const activeZone = getActiveZone(pathname)

  // On phones the tab bars scroll sideways; bring the current tab into view.
  useEffect(() => {
    document.querySelectorAll<HTMLElement>('nav [data-active]').forEach(el =>
      el.scrollIntoView({ block: 'nearest', inline: 'center' }))
  }, [pathname, searchParams])

  // the sub-page you're on, for the breadcrumb and the rail
  const isActive = (href: string) => {
    const [itemPath, itemQuery] = href.split('?')
    const itemTab = itemQuery ? new URLSearchParams(itemQuery).get('tab') : null
    // a letting file (/admin/lettings/<tenancy>) belongs under Tenancies, not the Lettings overview
    if (itemPath === '/admin/lettings') return pathname === itemPath
    if (itemPath === '/admin/tenancies' && pathname.startsWith('/admin/lettings/')) return true
    return itemTab ? pathname === itemPath && searchParams.get('tab') === itemTab : pathname === href || pathname.startsWith(itemPath + '/')
  }
  const railZone = onPropHub ? ZONES.find(z => z.id === 'portfolio') ?? null : activeZone
  const activeSub = railZone?.subnav.find(i => isActive(i.href)) ?? null

  return (
    <AdminContext.Provider value={true}>
    <div className="flex h-screen supports-[height:100dvh]:h-dvh overflow-hidden bg-neutral-100">

      {/* ── Desktop rail: every zone, with the current one opened up (the agreed look, 2 Oct 2026) ── */}
      <aside className="hidden md:flex w-56 flex-shrink-0 flex-col overflow-y-auto bg-[#181614] px-3 py-5 text-[#F6F3EC]" style={{ scrollbarWidth: 'thin' }}>
        <p className="px-3 pb-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#F6F3EC]/45">Admin</p>
        <nav className="flex flex-col gap-0.5">
          {ZONES.map(zone => {
            const open = railZone?.id === zone.id
            return (
              <div key={zone.id}>
                <Link href={zone.home ?? zone.subnav[0]?.href ?? (zone.id === 'dash' ? '/admin' : '#')} prefetch={false}
                  className={`flex items-center rounded-[10px] px-3 py-2 text-[13.5px] font-semibold transition-colors ${open ? 'bg-[#F6F3EC]/10 text-[#F6F3EC]' : 'text-[#F6F3EC]/60 hover:bg-[#F6F3EC]/5 hover:text-[#F6F3EC]'}`}>
                  {zone.label}
                </Link>
                {open && zone.subnav.length > 0 && (
                  <div className="mb-1 mt-0.5 flex flex-col">
                    {zone.subnav.map(item => {
                      const on = activeSub?.href === item.href
                      return (
                        <Link key={item.href} href={item.href} prefetch={false}
                          className={`rounded-lg py-1.5 pl-6 pr-3 text-[12.5px] transition-colors ${on ? 'font-bold text-[#F6F3EC]' : 'text-[#F6F3EC]/50 hover:text-[#F6F3EC]'}`}>
                          {item.label}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ── Top bar: logo in the centre ── */}
        <header className="flex-shrink-0 bg-[#181614] text-white z-40 border-b border-white/5" style={{ minHeight: 56, paddingTop: 'env(safe-area-inset-top)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}>
          <div className="grid h-14 px-3 md:px-6" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
            {/* Left: back on phones; where you are on desktop */}
            <div className="flex items-center min-w-0">
              {!isPhoneTabRoot(pathname) && (
                <button type="button" onClick={() => router.back()} aria-label="Back"
                  className="md:hidden -ml-1 mr-1 flex h-9 w-9 items-center justify-center rounded-full text-white/80 hover:bg-white/10">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                </button>
              )}
              {onPropHub ? (
                <Link href="/admin/active-rooms" className="hidden md:flex text-xs text-white/45 hover:text-white/75 transition-colors items-center gap-1 whitespace-nowrap">
                  ← All Units
                </Link>
              ) : railZone && railZone.id !== 'dash' ? (
                <span className="text-xs text-white/45 truncate hidden sm:block">{railZone.label}{activeSub ? ` › ${activeSub.label}` : ''}</span>
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

        {/* Main content — the footer closes every page on desktop */}
        <main className="flex-1 overflow-y-auto min-w-0 md:pb-[env(safe-area-inset-bottom)]">
          {children}
          <Footer embedded />
        </main>

        {/* Phone only: app-style bottom tabs */}
        <MobileTabBar />
      </div>
    </div>
    </AdminContext.Provider>
  )
}
