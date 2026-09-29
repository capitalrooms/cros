'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { ReactNode } from 'react'

// ─── Zone & subnav configuration ────────────────────────────────────────────

interface SubItem {
  emoji: string
  label: string
  href: string
  badge?: 'red' | 'amber' | 'green'
}

interface Zone {
  id: string
  emoji: string
  label: string
  // Route prefixes that belong to this zone (checked in order)
  routes: string[]
  subnav: SubItem[]
}

const ZONES: Zone[] = [
  {
    id: 'dash',
    emoji: '🏠',
    label: 'Dashboard',
    routes: ['/admin'],   // exact match handled separately
    subnav: [],           // dashboard has no subnav — full width
  },
  {
    id: 'portfolio',
    emoji: '🏢',
    label: 'Portfolio',
    routes: ['/admin/active-rooms', '/admin/overview', '/admin/property-tasks', '/admin/properties/new'],
    subnav: [
      { emoji: '🏠', label: 'All units',       href: '/admin/active-rooms' },
      { emoji: '📋', label: 'Property tasks',  href: '/admin/property-tasks' },
      { emoji: '🔍', label: 'Property audit',  href: '/admin/overview' },
      { emoji: '➕', label: 'Add property',    href: '/admin/properties/new' },
    ],
  },
  {
    id: 'lettings',
    emoji: '🔑',
    label: 'Lettings',
    routes: [
      '/admin/available-and-lettings',
      '/admin/applicants',
      '/admin/invite-to-apply',
      '/admin/let-only',
      '/admin/let-only-properties',
      '/admin/tenancies',
      '/admin/tenancy-management',
      '/admin/rent-increase',
      '/admin/early-move-out',
      '/admin/rent-history',
    ],
    subnav: [
      { emoji: '🔑', label: 'Available rooms',    href: '/admin/available-and-lettings' },
      { emoji: '📋', label: 'Applicants',          href: '/admin/applicants' },
      { emoji: '📨', label: 'Invite to apply',     href: '/admin/invite-to-apply' },
      { emoji: '📄', label: 'Tenancies',           href: '/admin/tenancies' },
      { emoji: '📈', label: 'Rent reviews',        href: '/admin/rent-increase' },
      { emoji: '📤', label: 'On notice',           href: '/admin/tenancy-management' },
      { emoji: '🏘',  label: 'Let-only',            href: '/admin/let-only-properties' },
    ],
  },
  {
    id: 'ops',
    emoji: '🔧',
    label: 'Operations',
    routes: [
      '/admin/appointments',
      '/admin/agency-diary',
      '/admin/calendar',
      '/admin/planner',
      '/admin/maintenance',
      '/admin/cleaner-jobs',
    ],
    subnav: [
      { emoji: '📅', label: 'Diary',         href: '/admin/appointments' },
      { emoji: '🗂️', label: 'Planner',       href: '/admin/planner' },
      { emoji: '🔧', label: 'Maintenance',   href: '/admin/maintenance' },
      { emoji: '🧹', label: 'Cleaning',      href: '/admin/cleaner-jobs' },
    ],
  },
  {
    id: 'compliance',
    emoji: '✅',
    label: 'Compliance',
    routes: [
      '/admin/compliance',
      '/admin/compliance-logs',
      '/admin/property-compliance-dashboard',
      '/admin/tenant-safety-checks',
      '/admin/sar',
      '/admin/guides',
      '/admin/ai-upload',
    ],
    subnav: [
      { emoji: '📋', label: 'Certificates',      href: '/admin/property-compliance-dashboard' },
      { emoji: '🤖', label: 'AI doc scanner',    href: '/admin/ai-upload' },
      { emoji: '🛡', label: 'Safety checks',     href: '/admin/tenant-safety-checks' },
      { emoji: '📖', label: 'Inspection logs',   href: '/admin/compliance-logs' },
      { emoji: '🔐', label: 'SAR log',           href: '/admin/sar' },
      { emoji: '📚', label: 'Tenant guides',     href: '/admin/guides' },
    ],
  },
  {
    id: 'finance',
    emoji: '💰',
    label: 'Finance',
    routes: [
      '/admin/accounts',
      '/admin/income',
      '/admin/expense-log',
      '/admin/expense-review',
      '/admin/statements',
      '/admin/autoledger',
    ],
    subnav: [
      { emoji: '📊', label: 'Statements',       href: '/admin/accounts' },
      { emoji: '🏦', label: 'Bank import',      href: '/admin/statements/import' },
      { emoji: '💵', label: 'Fee income',       href: '/admin/income' },
      { emoji: '⚡', label: 'AutoLedger',       href: '/admin/autoledger' },
      { emoji: '🏷️', label: 'Expense review',  href: '/admin/expense-review' },
    ],
  },
  {
    id: 'people',
    emoji: '👥',
    label: 'People',
    routes: ['/admin/people', '/admin/person', '/admin/contacts', '/admin/landlords'],
    subnav: [
      { emoji: '👤', label: 'Tenants',      href: '/admin/people?tab=tenants' },
      { emoji: '🏠', label: 'Landlords',    href: '/admin/people?tab=landlords' },
      { emoji: '🔧', label: 'Contractors',  href: '/admin/people?tab=contractors' },
      { emoji: '👔', label: 'Staff',        href: '/admin/people?tab=staff' },
    ],
  },
  {
    id: 'comms',
    emoji: '💬',
    label: 'Comms',
    routes: [
      '/admin/communications',
      '/admin/notify',
      '/admin/message-templates',
      '/admin/documents',
      '/admin/inbox',
      '/admin/acknowledgment-notes',
    ],
    subnav: [
      { emoji: '💬', label: 'All messages',       href: '/admin/communications' },
      { emoji: '✉️', label: 'Templates',          href: '/admin/message-templates' },
      { emoji: '📥', label: 'Documents inbox',    href: '/admin/documents' },
      { emoji: '📝', label: 'Acknowledgments',    href: '/admin/acknowledgment-notes' },
      { emoji: '📢', label: 'Quick Notify',       href: '/admin/notify' },
    ],
  },
  {
    id: 'biz',
    emoji: '🏗',
    label: 'New Business',
    routes: ['/admin/new-business', '/admin/valuations'],
    subnav: [
      { emoji: '📬', label: 'Acquisition',        href: '/admin/new-business' },
      { emoji: '🔍', label: 'AML onboarding',     href: '/admin/new-business/onboarding' },
      { emoji: '📄', label: 'Mgmt agreement',     href: '/admin/new-business/management-agreement' },
      { emoji: '📊', label: 'Valuations',         href: '/admin/valuations' },
      { emoji: '✉️', label: 'Send welcome',       href: '/admin/new-business/send-welcome' },
    ],
  },
]

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

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const onPropHub = isPropertyHub(pathname)
  const activeZone = getActiveZone(pathname)
  const hasSubnav = !onPropHub && (activeZone?.subnav.length ?? 0) > 0

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-neutral-100">

      {/* ── Top bar ── */}
      <header className="flex-shrink-0 bg-neutral-950 text-white flex items-center gap-3 px-4 py-2.5 z-40">
        <Link href="/admin" className="flex-shrink-0">
          <p className="text-[11px] font-light tracking-[0.28em] uppercase text-white leading-tight">CAPITAL</p>
          <p className="text-[11px] font-light tracking-[0.28em] uppercase text-white leading-tight">ROOMS</p>
        </Link>

        <div className="w-px h-6 bg-white/10 flex-shrink-0" />

        {/* Breadcrumb */}
        {onPropHub ? (
          <Link
            href="/admin"
            className="text-xs text-white/40 hover:text-white/70 transition-colors flex items-center gap-1.5"
          >
            ← All properties
          </Link>
        ) : activeZone && activeZone.id !== 'dash' ? (
          <span className="text-xs text-white/40">{activeZone.label}</span>
        ) : null}

        {/* Quick Notify - Centered */}
        <div className="flex-1 flex justify-center">
          <Link
            href="/admin/notify"
            className="px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition-colors whitespace-nowrap"
          >
            ✏️ Voice
          </Link>
        </div>

        {/* Profile - Right */}
        <Link
          href="/admin/profile"
          className="w-7 h-7 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-xs text-white/60 hover:bg-white/15 transition-colors flex-shrink-0"
        >
          H
        </Link>
      </header>

      {/* ── Zone tabs (hidden on property hub) ── */}
      {!onPropHub && (
        <nav
          className="flex-shrink-0 bg-neutral-900 flex overflow-x-auto border-b border-white/8"
          style={{ scrollbarWidth: 'none' }}
        >
          {ZONES.map(zone => {
            const active = activeZone?.id === zone.id
            return (
              <Link
                key={zone.id}
                href={zone.subnav[0]?.href ?? (zone.id === 'dash' ? '/admin' : '#')}
                prefetch={false}
                className={[
                  'flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors border-b-2 whitespace-nowrap',
                  active
                    ? 'text-white border-amber-500'
                    : 'text-white/35 border-transparent hover:text-white/70 hover:border-white/20',
                ].join(' ')}
              >
                <span className="text-sm leading-none">{zone.emoji}</span>
                {zone.label}
              </Link>
            )
          })}
        </nav>
      )}

      {/* ── Body: subnav + content ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Subnav (desktop only, only when zone has items and not on property hub) */}
        {hasSubnav && (
          <aside className="flex flex-col flex-shrink-0 w-44 bg-white border-r border-neutral-200 overflow-y-auto">
            <p className="px-3.5 pt-3 pb-1.5 text-[9px] font-bold uppercase tracking-widest text-neutral-400">
              {activeZone!.label}
            </p>
            {activeZone!.subnav.map(item => {
              const active = pathname === item.href || pathname.startsWith(item.href.split('?')[0] + '/')
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
        <main className="flex-1 overflow-y-auto min-w-0">
          {children}
        </main>

      </div>
    </div>
  )
}
