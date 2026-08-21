'use client'

import AppBar from '@/components/AppBar'

/**
 * Standardized dashboard layout component
 * Ensures consistent structure, spacing, and visual hierarchy across all role dashboards
 *
 * Features:
 * - Consistent AppBar with properly sized logo
 * - Uniform max-width and padding
 * - Standard background colors
 * - Consistent spacing between sections
 * - Professional typography hierarchy
 */

interface DashboardLayoutProps {
  children: React.ReactNode
  title?: string
  rightContent?: React.ReactNode
  className?: string
  bgColor?: 'neutral' | 'white'
}

export function DashboardLayout({
  children,
  title,
  rightContent,
  className = '',
  bgColor = 'neutral',
}: DashboardLayoutProps) {
  const bgClass = bgColor === 'neutral' ? 'bg-neutral-100' : 'bg-white'

  return (
    <div className={`min-h-screen ${bgClass} pb-3xl`}>
      {/* Consistent AppBar across all pages */}
      <AppBar title={title} right={rightContent} />

      {/* Standard main content wrapper */}
      <main className={`mx-auto max-w-6xl px-lg py-2xl ${className}`}>
        {children}
      </main>
    </div>
  )
}

/**
 * Dashboard section wrapper for consistent spacing between sections
 */
export function DashboardSection({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`mt-3xl pt-md ${className}`}>
      {children}
    </section>
  )
}

/**
 * Dashboard header with consistent typography
 */
export function DashboardHeader({
  title,
  subtitle,
  className = '',
}: {
  title: string
  subtitle?: string
  className?: string
}) {
  return (
    <div className={className}>
      <h1 className="text-3xl font-bold text-neutral-900">{title}</h1>
      {subtitle && <p className="mt-md text-lg text-neutral-600">{subtitle}</p>}
    </div>
  )
}

/**
 * Dark header band (used in tenant/contractor dashboards)
 * Ensures consistent styling and spacing
 */
export function DashboardHeaderBand({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={`-mb-3xl bg-neutral-900 pb-3xl text-white ${className}`}
      style={{ marginInline: '-16px', paddingInline: '16px' }}
    >
      <div className="pt-lg">
        {children}
      </div>
    </section>
  )
}

/**
 * Standard card/panel for dashboard content
 */
export function DashboardCard({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-2xl border border-neutral-200 bg-white p-lg shadow-sm ${className}`}>
      {children}
    </div>
  )
}

/**
 * Grid container for dashboard items (jobs, properties, etc.)
 */
export function DashboardGrid({
  children,
  columns = 'md:grid-cols-2 lg:grid-cols-3',
  className = '',
}: {
  children: React.ReactNode
  columns?: string
  className?: string
}) {
  return (
    <div className={`grid gap-md ${columns} ${className}`}>
      {children}
    </div>
  )
}
