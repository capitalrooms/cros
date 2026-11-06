'use client'

// "Upkeep by area" in the landlord app (6 Nov 2026, Harry: so a landlord can see "it's been ages since I spent on
// decorating in the kitchen, it needs it") — lib/property/upkeep via /api/landlord/upkeep, one house at a time.
import { useEffect, useState } from 'react'
import UpkeepPanel from '@/components/UpkeepPanel'

export default function UpkeepByArea({ asId }: { asId: string | null }) {
  const [d, setD] = useState<{ houses: any[] } | null>(null)
  const [house, setHouse] = useState('')
  useEffect(() => { fetch(`/api/landlord/upkeep${asId ? `?as=${encodeURIComponent(asId)}` : ''}`).then(r => r.ok ? r.json() : null).then(j => { setD(j); setHouse(j?.houses?.[0]?.id ?? '') }).catch(() => setD(null)) }, [asId])
  if (!d?.houses?.length) return null
  const h = d.houses.find(x => x.id === house) ?? d.houses[0]
  return (
    <section className="mx-auto mt-12 max-w-6xl px-6 md:px-14">
      <p className="pub-eyebrow m-0">Upkeep</p>
      <h2 className="pub-serif m-0 mt-2 text-[28px] leading-tight md:text-[36px]">Each part of the house, over the years</h2>
      <p className="pub-muted mt-2 text-[14px]">When the kitchen, bathrooms, hallway and each room were last decorated, and what’s been spent on them each year. Open a row to see the jobs.</p>
      {d.houses.length > 1 && (
        <select value={h.id} onChange={e => setHouse(e.target.value)} className="mt-4 rounded-full border px-4 py-2 text-[14px]" style={{ borderColor: '#111' }} aria-label="Property">
          {d.houses.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      )}
      <div className="mt-6"><UpkeepPanel data={h} /></div>
    </section>
  )
}
