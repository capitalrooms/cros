'use client'

// "On your doorstep" (17 Oct 2026): the nearest gyms, supermarkets and parks, from OpenStreetMap. Looked up from the
// visitor's own browser after the page has loaded — the free map servers turn away requests from cloud servers, but
// answer people's own connections quickly. Three servers in turn, a short wait on each; if none answers, nothing shows.
import { useEffect, useState } from 'react'

interface Place { kind: 'gym' | 'supermarket' | 'park'; name: string; walkMin: number }
const SERVERS = ['https://overpass.kumi.systems/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter']
const metres = (a: [number, number], b: [number, number]) => {
  const R = 6371000, r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
// "static" → "Static"; brand names as written
const titled = (s: string) => s.length > 1 && s === s.toLowerCase() ? s.replace(/\b\w/g, c => c.toUpperCase()) : s

export default function Doorstep({ lat, lng }: { lat: number; lng: number }) {
  const [places, setPlaces] = useState<Place[] | null>(null)
  useEffect(() => {
    let gone = false
    const p = `${lat.toFixed(4)},${lng.toFixed(4)}`
    const key = `cros-doorstep-${p}`
    try { const c = JSON.parse(localStorage.getItem(key) ?? 'null'); if (c && Date.now() - c.at < 30 * 86_400_000) { setPlaces(c.places); return } } catch { /* no cache */ }
    const q = `[out:json][timeout:10];(nwr["leisure"="fitness_centre"](around:1000,${p});nwr["shop"="supermarket"](around:1000,${p});nwr["leisure"="park"]["name"](around:1000,${p}););out center tags 80;`
    ;(async () => {
      for (const host of SERVERS) {
        try {
          const r = await fetch(`${host}?data=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(6000) })
          if (!r.ok) continue
          const d = await r.json()
          const seen = new Set<string>(), out: (Place & { m: number })[] = []
          for (const e of (d.elements ?? []) as any[]) {
            const t = e.tags ?? {}
            const kind: Place['kind'] | null = t.leisure === 'fitness_centre' ? 'gym' : t.shop === 'supermarket' ? 'supermarket' : t.leisure === 'park' ? 'park' : null
            const name = titled(String(t.brand && t.name && !String(t.name).toLowerCase().includes(String(t.brand).toLowerCase()) ? t.brand : t.name || t.brand || '').trim())
            const at = [e.lat ?? e.center?.lat, e.lon ?? e.center?.lon] as [number, number]
            if (!kind || !name || at[0] == null || /playground/i.test(name) || seen.has(`${kind}|${name.toLowerCase()}`)) continue
            seen.add(`${kind}|${name.toLowerCase()}`)
            const m = metres([lat, lng], at)
            out.push({ kind, name, m, walkMin: Math.max(1, Math.round((m * 1.3) / 80)) })
          }
          out.sort((a, b) => a.m - b.m)
          const list = out.map(({ m, ...x }) => x)
          if (gone) return
          setPlaces(list)
          try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), places: list })) } catch { /* private mode */ }
          return
        } catch { /* try the next server */ }
      }
    })()
    return () => { gone = true }
  }, [lat, lng])

  const groups = ([['Gyms', 'gym', 3], ['Supermarkets', 'supermarket', 3], ['Parks', 'park', 2]] as const)
    .map(([title, k, n]) => [title, (places ?? []).filter(x => x.kind === k).slice(0, n)] as const).filter(([, xs]) => xs.length)
  if (!groups.length) return null
  return (
    <section className="mt-10 pub-enter">
      <h2 className="text-[22px]" style={{ fontFamily: 'var(--pub-serif), serif' }}>On your doorstep</h2>
      <div className="mt-3 grid gap-6 sm:grid-cols-3">
        {groups.map(([title, xs]) => (
          <div key={title}>
            <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">{title}</p>
            <ul className="mt-2 space-y-1.5 text-[15px]">
              {xs.map(x => <li key={x.name} className="flex justify-between gap-3"><span className="min-w-0 truncate">{x.name}</span><span className="shrink-0 tabular-nums text-neutral-500">{x.walkMin} min</span></li>)}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-neutral-400">Walking times are approximate. Places from OpenStreetMap.</p>
    </section>
  )
}
