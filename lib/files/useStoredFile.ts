'use client'
// Showing and opening stored files from any screen now that the folders are private (lib/files/paths PRIVATE_BUCKETS).
//   useStoredUrls(urls) — signed links for files shown on the page (images, previews); a link outside the private
//                         folders is used as it is. While signing, a private file's link is null.
//   openMyFile(url)     — open one in a new tab (the click's permission is kept by opening the tab first)
// The signing route checks who is asking (app/api/files/sign).
import { useEffect, useMemo, useState } from 'react'
import { parseStorageUrl, PRIVATE_BUCKETS } from '@/lib/files/paths'

const isPrivate = (u: string) => { const r = parseStorageUrl(u); return !!r && PRIVATE_BUCKETS.has(r.bucket) }

async function sign(urls: string[]): Promise<Record<string, string | null>> {
  if (!urls.length) return {}
  const r = await fetch('/api/files/sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ urls }) })
  const d = await r.json().catch(() => ({}))
  return r.ok ? d.links ?? {} : {}
}

export function useStoredUrls(urls: (string | null | undefined)[]): Record<string, string | null> {
  const list = useMemo(() => Array.from(new Set(urls.filter((u): u is string => !!u))), [urls.join('\n')])   // eslint-disable-line react-hooks/exhaustive-deps
  const [links, setLinks] = useState<Record<string, string | null>>({})
  useEffect(() => {
    let live = true
    const priv = list.filter(isPrivate)
    const open = Object.fromEntries(list.filter(u => !isPrivate(u)).map(u => [u, u]))
    setLinks(open)
    if (priv.length) sign(priv).then(l => { if (live) setLinks({ ...open, ...l }) })
    // signed links last 10 minutes: refresh before they run out while the page stays open
    const t = priv.length ? setInterval(() => sign(priv).then(l => { if (live) setLinks({ ...open, ...l }) }), 8 * 60 * 1000) : null
    return () => { live = false; if (t) clearInterval(t) }
  }, [list])
  return links
}

/** One file's signed link (null while signing, or if this person can't see it). */
export function useStoredUrl(url: string | null | undefined): string | null {
  const links = useStoredUrls([url])
  return url ? links[url] ?? null : null
}

export async function openMyFile(url: string) {
  if (!isPrivate(url)) { window.open(url, '_blank', 'noopener'); return }
  const win = window.open('', '_blank')
  const l = (await sign([url]))[url]
  if (l && win) win.location.href = l
  else { win?.close(); alert('That file can’t be opened — please sign in again, or ask the office.') }
}
