// Annual financial reports (19 Nov 2026): tax-year, resold, MTD, agency income and company P&L. The server enforces the
// permission on every route (lib/adminAuth requireAnnual; proxy.ts). These hooks only decide which links to show.
'use client'

import { useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

export const ANNUAL_REPORT_HREFS = ['/admin/reports/tax-year', '/admin/reports/resold', '/admin/reports/mtd', '/admin/income', '/admin/company-pnl']

/** true once the server confirms the permission; false while loading or if not granted (hidden until known). */
export function useAnnualAccess(): { annual: boolean; owner: boolean } {
  const [state, setState] = useState({ annual: false, owner: false })
  useEffect(() => {
    let live = true
    adminFetch('/api/admin/annual-access')
      .then(r => (r.ok ? r.json() : { annual: false, owner: false }))
      .then(d => { if (live) setState({ annual: !!d.annual, owner: !!d.owner }) })
      .catch(() => { if (live) setState({ annual: false, owner: false }) })
    return () => { live = false }
  }, [])
  return state
}
