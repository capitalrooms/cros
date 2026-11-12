'use client'
// LOCAL PREVIEW ONLY — never committed (deploys come from git). Shows the real landlord home + LandlordPlanner with
// Harry's Richard board as the "Bring in" import would make it, by answering /api/planner/shared from fixture.json.
import { useEffect, useState } from 'react'
import PublicShell from '@/components/public/PublicShell'
import LandlordPlanner from '@/components/LandlordPlanner'
import fixture from './fixture.json'

export default function Preview() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return
    const real = window.fetch
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.includes('/api/planner/shared')) return new Response(JSON.stringify(init?.method === 'POST' ? { ok: true } : fixture), { headers: { 'Content-Type': 'application/json' } })
      return real(input, init)
    }
    setReady(true)
  }, [])
  const wrap = 'mx-auto max-w-6xl px-6 md:px-14'
  if (!ready) return null
  return (
    <PublicShell label="Your account">
      <section className={`${wrap} pt-10 md:pt-14`}>
        <p className="pub-eyebrow pub-enter m-0 mb-4">Capital Rooms · landlord</p>
        <h1 className="pub-serif pub-enter m-0 text-[34px] leading-[1.05] md:text-[56px]">Hello, Mr Richard Page</h1>
        <p className="pub-intro pub-enter-2 mt-4 max-w-2xl">Everything we’re working on together, by property. Tap a line to open it.</p>
      </section>
      <section className={`${wrap} pt-8 md:pt-12`}>
        <h2 className="pub-h2 mb-5">Planner</h2>
        <LandlordPlanner />
      </section>
      <section className={`${wrap} pt-12`} />
      <section className={`${wrap} flex flex-wrap items-center gap-6 pb-16 pt-16`}>
        <a href="#" className="pub-eyebrow inline-flex min-h-[44px] items-center" style={{ color: '#111' }}>Password &amp; sign-in</a>
        <button type="button" className="pub-eyebrow inline-flex min-h-[44px] items-center" style={{ color: '#111' }}>Sign out</button>
      </section>
    </PublicShell>
  )
}
