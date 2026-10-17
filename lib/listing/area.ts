// The area around a listing (17 Oct 2026, Harry: "view on map with local stations"): the nearest Tube, Overground,
// DLR, Elizabeth line and rail stations from TfL's open data, with walking times. Keyed by the house's map position,
// cached for a month (stations don't move), and quietly empty if TfL can't be reached — the listing still shows.
export interface Station { name: string; kinds: string[]; lines: string[]; distanceM: number; walkMin: number }

const MODE: Record<string, string> = { tube: 'Underground', overground: 'Overground', dlr: 'DLR', 'elizabeth-line': 'Elizabeth line', 'national-rail': 'Rail', tram: 'Tram' }
// "Pimlico Underground Station" → "Pimlico"; "London Victoria Rail Station" → "London Victoria"
// (only the station-type suffix comes off: "Battersea Power Station Underground Station" stays "Battersea Power Station")
const tidy = (n: string) => {
  const t = n.replace(/\s+\(.*\)$/, '').trim()
  const typed = t.replace(/\s+(Underground|Rail|DLR|Overground|Tram|Elizabeth line)\s+Station$/i, '')
  return (typed !== t ? typed : t.replace(/\s+Station$/i, '')).trim()
}

export async function nearbyStations(lat: number | null | undefined, lng: number | null | undefined, max = 5): Promise<Station[]> {
  if (lat == null || lng == null || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return []
  const url = `https://api.tfl.gov.uk/StopPoint?lat=${Number(lat).toFixed(5)}&lon=${Number(lng).toFixed(5)}&stopTypes=NaptanMetroStation,NaptanRailStation&radius=1600&modes=tube,overground,dlr,elizabeth-line,national-rail,tram`
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'CapitalRooms-CROS/1.0 (+https://www.capitalrooms.co.uk)', Accept: 'application/json' }, next: { revalidate: 60 * 60 * 24 * 30 }, signal: AbortSignal.timeout(10000) } as RequestInit)
    if (!r.ok) { console.warn('[stations] TfL said', r.status, (await r.text().catch(() => '')).slice(0, 200)); return [] }
    const d: any = await r.json()
    const byName = new Map<string, Station>()
    for (const sp of (d.stopPoints ?? []) as any[]) {
      const name = tidy(String(sp.commonName ?? ''))
      if (!name) continue
      const dist = Math.round(Number(sp.distance) || 0)
      const cur = byName.get(name) ?? { name, kinds: [], lines: [], distanceM: dist, walkMin: 0 }
      for (const m of (sp.modes ?? []) as string[]) if (MODE[m] && !cur.kinds.includes(MODE[m])) cur.kinds.push(MODE[m])
      for (const l of (sp.lines ?? []) as any[]) if (l?.name && !cur.lines.includes(l.name)) cur.lines.push(l.name)
      cur.distanceM = Math.min(cur.distanceM, dist)
      byName.set(name, cur)
    }
    // walking: the straight line plus a third for streets, at an easy 80 m a minute
    return [...byName.values()].map(s => ({ ...s, walkMin: Math.max(1, Math.round((s.distanceM * 1.3) / 80)) }))
      .sort((a, b) => a.distanceM - b.distanceM).slice(0, max)
  } catch (e) { console.warn('[stations] TfL failed', e instanceof Error ? e.message : e); return [] }
}
