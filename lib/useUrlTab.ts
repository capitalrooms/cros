'use client'

// A record's tab, kept in the address (?tab=) so Back, a refresh or a shared link land on the same tab (rebuild A+B,
// 3 Nov 2026). The page passes the tab it was opened on (from its searchParams prop — never useSearchParams, see
// lib/pageSearchParams); switching tab swaps the address in place without a reload or a new history step.

import { useCallback, useState } from 'react'

export function useUrlTab<T extends string>(opened: string | undefined, allowed: readonly T[], fallback: T): [T, (t: T) => void] {
  const [tab, setTabState] = useState<T>(allowed.includes(opened as T) ? (opened as T) : fallback)
  const setTab = useCallback((t: T) => {
    setTabState(t)
    try {
      const url = new URL(window.location.href)
      if (t === fallback) url.searchParams.delete('tab'); else url.searchParams.set('tab', t)
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
    } catch {}
  }, [fallback])
  return [tab, setTab]
}
