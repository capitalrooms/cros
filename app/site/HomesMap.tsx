'use client'
// A drawn map of London under the listings (9 Nov 2026): the Thames, the zone rings and area names in the site's
// greens, with a pin for each place we have homes. Pins sit on the area (rounded ~400m), never the exact house.
// No map service: nothing is sent to a third party, and it draws instantly.
import { useEffect, useMemo, useRef, useState } from 'react'

export type MapHome = { id: string; title: string; mapArea: string; rent: number | null; available: string | null; photo: string | null; href: string; whole: boolean; lat: number; lng: number }

import { BOX, W, H, K, px, kmPx, THAMES, AREAS, PARKS } from '@/lib/website/londonMap'

/** a smooth line through the points (Catmull-Rom → Bézier) */
function smooth(pts: [number, number][]) {
  const p = pts.map(([a, b]) => px(a, b))
  let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] ?? p[i], b = p[i], c = p[i + 1], e = p[i + 2] ?? c
    d += ` C${(b[0] + (c[0] - a[0]) / 6).toFixed(1)},${(b[1] + (c[1] - a[1]) / 6).toFixed(1)} ${(c[0] - (e[0] - b[0]) / 6).toFixed(1)},${(c[1] - (e[1] - b[1]) / 6).toFixed(1)} ${c[0].toFixed(1)},${c[1].toFixed(1)}`
  }
  return d
}
const gbp = (n: number) => '£' + Number(n).toLocaleString('en-GB', { maximumFractionDigits: 0 })
const when = (d: string | null) => !d ? 'Date to confirm' : d <= new Date().toISOString().slice(0, 10) ? 'Available now' : `From ${new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`

export default function HomesMap({ homes }: { homes: MapHome[] }) {
  const [kind, setKind] = useState<'all' | 'rooms' | 'whole'>('all')
  const [open, setOpen] = useState<string | null>(null)
  const river = useMemo(() => smooth(THAMES), [])
  // on a phone the map is wider than the screen: start it centred on central London
  const frame = useRef<HTMLDivElement>(null)
  useEffect(() => { const f = frame.current; if (f && f.scrollWidth > f.clientWidth) f.scrollLeft = (f.scrollWidth * 0.54) - f.clientWidth / 2 }, [])
  const [cx, cy] = px(51.508, -0.128)   // Charing Cross: the zones' centre
  // one pin per place; then lay the price tags out so none overlap: flip a tag below its dot, or merge the two pins
  const places = useMemo(() => {
    type P = { key: string; x: number; y: number; homes: MapHome[]; label: string; w: number; below: boolean }
    const labelOf = (hs: MapHome[]) => { const m = Math.min(...hs.map(h => h.rent ?? Infinity)); return hs.length > 1 ? `${hs.length} homes${isFinite(m) ? ` · from ${gbp(m)}` : ''}` : isFinite(m) ? gbp(m) : 'See home' }
    const box = (p: P) => ({ l: p.x - p.w / 2 - 4, r: p.x + p.w / 2 + 4, t: p.below ? p.y + 10 : p.y - 48, b: p.below ? p.y + 48 : p.y - 10 })
    const hit = (a: P, b: P) => { const A = box(a), B = box(b); return A.l < B.r && B.l < A.r && A.t < B.b && B.t < A.b }
    let pts: P[] = []
    for (const h of homes.filter(h => kind === 'all' || (kind === 'whole') === h.whole)) {
      const [x, y] = px(h.lat, h.lng)
      const same = pts.find(p => Math.abs(p.x - x) < 8 && Math.abs(p.y - y) < 8)
      if (same) same.homes.push(h); else pts.push({ key: h.id, x, y, homes: [h], label: '', w: 0, below: false })
    }
    for (let changed = true; changed;) {
      changed = false
      pts.forEach(p => { p.label = labelOf(p.homes); p.w = p.label.length * 8.4 + 28; p.below = false })
      pts.sort((a, b) => a.y - b.y)
      const placed: P[] = []
      for (const p of pts) {
        if (!placed.some(q => hit(p, q))) { placed.push(p); continue }
        p.below = true
        if (!placed.some(q => hit(p, q))) { placed.push(p); continue }
        const q = placed.find(q => { p.below = false; return hit(p, q) || (p.below = true, hit(p, q)) })!
        const n = q.homes.length + p.homes.length
        q.x = (q.x * q.homes.length + p.x * p.homes.length) / n; q.y = (q.y * q.homes.length + p.y * p.homes.length) / n
        q.homes.push(...p.homes); pts = pts.filter(x => x !== p); changed = true; break
      }
    }
    return pts
  }, [homes, kind])
  const sel = places.find(p => p.key === open) ?? null
  const counts = { all: homes.length, rooms: homes.filter(h => !h.whole).length, whole: homes.filter(h => h.whole).length }

  return (
    <div className="lmap">
      <div className="lmap-top">
        <div>
          <h2 className="h2">Where our homes are</h2>
          <p style={{ color: 'var(--muted)', margin: '8px 0 0' }}>Tap a pin to see what’s free there. Pins show the area, not the exact address.</p>
        </div>
        <div className="lmap-chips" role="tablist" aria-label="Show">
          {([['all', 'Everything'], ['rooms', 'Rooms'], ['whole', 'Flats & houses']] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? 'on' : ''} onClick={() => { setKind(k); setOpen(null) }}>{l} <span>{counts[k]}</span></button>
          ))}
        </div>
      </div>

      <p className="lmap-swipe">Swipe the map to see more of London.</p>
      <div className="lmap-frame" ref={frame}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Map of London with ${places.length} places where we have homes free`}>
          <defs>
            <pattern id="lmDots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="9" cy="9" r="1.1" fill="var(--lm-dot)" /></pattern>
            <radialGradient id="lmGlow" cx={cx / W} cy={cy / H} r="0.62"><stop offset="0" stopColor="var(--lm-glow)" /><stop offset="1" stopColor="var(--lm-land)" stopOpacity="0" /></radialGradient>
            <filter id="lmSoft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.5" /></filter>
          </defs>
          <rect width={W} height={H} fill="var(--lm-land)" />
          <rect width={W} height={H} fill="url(#lmGlow)" />
          <rect width={W} height={H} fill="url(#lmDots)" />
          {PARKS.map(([n, a, b, rx, ry, t]) => { const [x, y] = px(a, b); return <ellipse key={n} cx={x} cy={y} rx={rx * kmPx} ry={ry * kmPx} transform={`rotate(${t} ${x} ${y})`} className="lmap-park" filter="url(#lmSoft)"><title>{n}</title></ellipse> })}
          {[13, 9.5, 6, 3].map((r, i) => <circle key={r} cx={cx} cy={cy} r={r * kmPx} fill={i === 3 ? 'var(--lm-z1)' : 'none'} stroke="var(--lm-ring)" strokeWidth="1.5" strokeDasharray="2 7" strokeLinecap="round" />)}
          <path d={river} fill="none" stroke="var(--lm-river-edge)" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" />
          <path d={river} fill="none" stroke="var(--lm-river)" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" className="lmap-river" pathLength={1} />
          <path d={river} fill="none" stroke="var(--lm-shine)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lmap-shine" />
          {[3, 6, 9.5, 13].map((r, i) => { const t = 212 * Math.PI / 180; return <text key={r} x={cx + Math.cos(t) * r * kmPx} y={cy - Math.sin(t) * r * kmPx - 7} textAnchor="middle" className="lmap-zone">Zone {i + 1}</text> })}
          {AREAS.map(([n, a, b]) => { const [x, y] = px(a, b); if (places.some(p => Math.abs(p.x - x) < p.w / 2 + 30 && (p.below ? y > p.y - 14 && y < p.y + 52 : y > p.y - 52 && y < p.y + 14))) return null; return <text key={n} x={x} y={y} textAnchor="middle" className="lmap-area">{n}</text> })}
          {places.map((p, i) => {
            const label = p.label, w = p.w, on = open === p.key, dy = p.below ? 58 : 0
            return (
              <g key={p.key} className={`lmap-pin ${on ? 'on' : ''}`} style={{ animationDelay: `${0.3 + i * 0.06}s` }} transform={`translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`}
                 tabIndex={0} role="button" aria-label={`${p.homes[0].mapArea}: ${label}`} onClick={() => setOpen(on ? null : p.key)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(on ? null : p.key) } }}>
                <circle r="22" className="lmap-halo" />
                <circle r="9" className="lmap-pulse" />
                <rect x={-w / 2} y={-44 + dy} width={w} height={30} rx={15} className="lmap-tag" />
                <path d={p.below ? 'M-6,15 L0,6 L6,15 Z' : 'M-6,-15 L0,-6 L6,-15 Z'} className="lmap-tag" />
                <text y={-24 + dy} textAnchor="middle" className="lmap-price">{label}</text>
                <circle r="5" className="lmap-dot" />
              </g>
            )
          })}
        </svg>
      </div>

      {sel ? (
        <div className="lmap-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <h3 className="h3" style={{ margin: 0 }}>{[...new Set(sel.homes.map(h => h.mapArea))].join(' · ')}</h3>
            <button className="lmap-close" onClick={() => setOpen(null)}>Close</button>
          </div>
          <div className="lmap-cards">
            {sel.homes.map(h => (
              <a key={h.id} href={h.href} className="lmap-card">
                <span className="ph sage">{/* eslint-disable-next-line @next/next/no-img-element */}{h.photo && <img src={h.photo} alt="" loading="lazy" />}</span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  <strong style={{ fontSize: 17, lineHeight: 1.3 }}>{h.title}</strong>
                  <span className="disp" style={{ fontSize: 20 }}>{h.rent ? `${gbp(h.rent)} pcm` : 'Rent on request'}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 14 }}>{when(h.available)}</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      ) : <p className="lmap-hint">{places.length ? `${places.length} place${places.length === 1 ? '' : 's'} with homes free. Tap one.` : 'Nothing free in this list right now.'}</p>}
    </div>
  )
}
