'use client'
// Back from a listing (9 Nov 2026, Harry): to the page you came from when that was our website, else to the website's
// homes list. Always a real link, so it works with no history too.
import { useEffect, useState } from 'react'

export default function BackLink({ whole }: { whole: boolean }) {
  const list = `https://capitalrooms.co.uk/${whole ? 'residential-lettings' : 'shared-accommodation'}`
  const [fromSite, setFromSite] = useState(false)
  useEffect(() => { try { const r = new URL(document.referrer); setFromSite(r.host === location.host || /(^|\.)capitalrooms\.co\.uk$/.test(r.host)) } catch {} }, [])
  return (
    <a href={list} onClick={e => { if (fromSite && history.length > 1) { e.preventDefault(); history.back() } }}
      className="mb-4 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-neutral-300 bg-white px-4 text-[15px] font-semibold text-neutral-800 hover:bg-neutral-50">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
      {fromSite ? 'Back' : `All ${whole ? 'homes' : 'rooms'} to rent`}
    </a>
  )
}
