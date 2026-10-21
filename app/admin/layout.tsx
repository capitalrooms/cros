'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ReactNode, useState, useRef, useEffect } from 'react'
import { AdminContext, AdminAccessContext } from '@/lib/admin-context'
import { createClient } from '@/lib/supabase'

import { ZONES, type Zone } from '@/lib/adminNav'
import { areasFor, canOpenPage, homeFor, isAdministrator, type AreaKey } from '@/lib/access/areas'
import MobileTabBar from './components/MobileTabBar'
import TopBar from '@/app/components/TopBar'
import Footer from '@/app/components/Footer'
import BackButton from '@/app/components/BackButton'

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


const PHONE_TAB_ROOTS = ['/admin', '/admin/search', '/admin/active-rooms', '/admin/money', '/admin/more']
const isPhoneTabRoot = (p: string) => PHONE_TAB_ROOTS.includes(p)

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const onPropHub = isPropertyHub(pathname)
  const activeZone = getActiveZone(pathname)

  // access levels (lib/access/areas): administrators see everything; other office staff only their areas.
  // The server enforces the same rules on every office request (proxy.ts) — this just keeps the screens tidy.
  const [access, setAccess] = useState<{ role: string; areas: AreaKey[] } | null>(null)
  useEffect(() => {
    const sb = createClient()
    sb.auth.getSession().then(async ({ data }) => {
      const email = data.session?.user?.email
      if (!email) return
      const { data: p } = await sb.from('people').select('role, access_areas').ilike('email', email).order('created_at').limit(1).maybeSingle()
      if (p) setAccess({ role: p.role, areas: areasFor(p.role, (p as any).access_areas) })
    })
  }, [])
  const allowed = (href: string) => !access || canOpenPage(href.split('?')[0], access.areas, access.role)
  const blocked = !!access && !isAdministrator(access.role) && !canOpenPage(pathname, access.areas, access.role)
  // no Dashboard in their access: the office home takes them to their first area instead
  useEffect(() => {
    if (access && pathname === '/admin' && !access.areas.includes('dashboard') && !isAdministrator(access.role)) router.replace(homeFor(access.areas))
  }, [access, pathname, router])
  const zones = ZONES.map(z => ({ ...z, subnav: z.subnav.filter(i => allowed(i.href)) }))
    .filter(z => z.id === 'dash' ? allowed('/admin') : z.subnav.length > 0)

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
    // a person's page sits under their list in People
    if (itemQuery && itemPath === '/admin/people') {
      const t = new URLSearchParams(itemQuery).get('tab')
      if (pathname.startsWith('/admin/tenant/')) return t === 'tenants'
      if (pathname.startsWith('/admin/landlord/')) return t === 'landlords'
      if (pathname.startsWith('/admin/contractor/')) return t === 'contractors'
    }
    return itemTab ? pathname === itemPath && searchParams.get('tab') === itemTab : pathname === href || pathname.startsWith(itemPath + '/')
  }
  const railZone = onPropHub ? ZONES.find(z => z.id === 'portfolio') ?? null : activeZone
  const activeSub = railZone?.subnav.find(i => isActive(i.href)) ?? null
  // where Back goes when this tab has no earlier screen: a property's pages → All Units; a page inside a section → that
  // section's list; a section's own home (or a phone tab) → nowhere, so no button
  const backFallback: { href: string; label: string } | null =
    onPropHub ? { href: '/admin/active-rooms', label: 'All Units' }
    : isPhoneTabRoot(pathname) ? null
    : activeSub && activeSub.href.split('?')[0] !== pathname ? { href: activeSub.href, label: activeSub.label }
    : railZone && !railZone.subnav.some(i => i.href.split('?')[0] === pathname) && railZone.subnav[0] ? { href: railZone.subnav[0].href, label: railZone.label }
    : null

  return (
    <AdminContext.Provider value={true}>
    <AdminAccessContext.Provider value={allowed}>
    <div className="flex h-screen supports-[height:100dvh]:h-dvh overflow-hidden bg-neutral-100">

      {/* ── Desktop rail: every zone, with the current one opened up (the agreed look, 2 Oct 2026) ── */}
      <aside className="hidden md:flex w-56 flex-shrink-0 flex-col overflow-y-auto bg-[#181614] px-3 py-5 text-[#F6F3EC]" style={{ scrollbarWidth: 'thin' }}>
        <p className="px-3 pb-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#F6F3EC]/45">Admin</p>
        <nav className="flex flex-col gap-0.5">
          {zones.map(zone => {
            const open = railZone?.id === zone.id
            return (
              <div key={zone.id}>
                <Link href={(zone.home && allowed(zone.home) ? zone.home : undefined) ?? zone.subnav[0]?.href ?? (zone.id === 'dash' ? '/admin' : '#')} prefetch={false}
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
        {/* ── Top bar — the one top bar every user has (app/components/TopBar) ── */}
        <TopBar homeHref="/admin"
          left={!isPhoneTabRoot(pathname) && <BackButton optional={!backFallback} href={backFallback?.href} label={backFallback?.label} />}
          right={allowed('/admin/notify') && (
            <Link href="/admin/notify" className="flex items-center gap-1 rounded-md bg-amber-600 px-2 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-500">
              <span>⚡</span><span className="hidden sm:inline">Quick Notify</span>
            </Link>
          )} />

        {/* Main content — the footer closes every page on desktop */}
        {/* the page fills the screen and the footer sits at the bottom of it — a short or still-loading page no longer
            pulls the footer up under it with a blank strip below (17 Oct 2026) */}
        <main className="flex flex-1 flex-col overflow-y-auto min-w-0 md:pb-[env(safe-area-inset-bottom)]">
          <div className="flex flex-1 shrink-0 flex-col">
          {blocked ? (
            <div className="mx-auto max-w-xl px-lg py-3xl text-center">
              <h1 className="text-xl font-bold text-neutral-900">That isn’t part of your access</h1>
              <p className="mt-sm text-sm text-neutral-600">Ask an administrator if you need this part of CROS.</p>
              <Link href={homeFor(access!.areas)} className="mt-lg inline-block rounded-xl bg-neutral-900 px-lg py-sm text-sm font-bold text-white">Go to my screens</Link>
            </div>
          ) : children}
          </div>
          <div className="shrink-0"><Footer embedded /></div>
        </main>

        {/* Phone only: app-style bottom tabs */}
        <MobileTabBar allowed={allowed} />
      </div>
    </div>
    </AdminAccessContext.Provider>
    </AdminContext.Provider>
  )
}
