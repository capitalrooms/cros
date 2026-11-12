'use client'
// DEV ONLY (never committed): the listing editor with a sample whole-let studio.
import { Suspense, useEffect, useState } from 'react'
const PARAMS = Promise.resolve({ roomId: 'r1' })
import ListingEditor from '@/app/lettings/listing/[roomId]/page'
const img = (n: number) => `https://picsum.photos/seed/cr${n}/800/600`
const sample = {
  listing: { id: 'l1', status: 'ready', agent_ref: 'CR-00003', property_id: 'p1', room_id: 'r1', headline: 'Breathtaking Studio - City Views - Gym & Spa', summary: '', features: [],
    description: 'AVAILABLE January 2027 – Stunning Studio in Wardian, Canary Wharf\n\n🌇 Breathtaking London Skyline Views – set over 40+ floors high.\n🛏 Fully Furnished with high-quality, contemporary furniture.\n🌿 Private Balcony with outdoor tap.\n💧 Luxury Amenities – swimming pool, spa, gym, and 24-hour concierge.',
    rent: 2950, rent_frequency: 'pcm', deposit: 3403.85, holding_deposit: 680.77, available_from: '2026-11-09', bills_included: false, council_tax_band: 'E', council_tax_included: false,
    media_order: [1,2,3,4,5,6].map(String), property_type: null, furnished: 'furnished', display_address: '', part_c: {} },
  house: { name: 'Flat 4708, Bagshaw Building', address: 'Flat 4708, Bagshaw Building', property_type: 'single_let' }, room: { id: 'r1', name: 'Whole Property' },
  photos: [1,2,3,4,5,6,7,8].map(n => ({ id: String(n), url: img(n), video: false, caption: null, ofRoom: true, otherRoom: false })),
  channels: [{ channel: 'share', label: 'Share link', available: true, enabled: true }, { channel: 'website', label: 'Website', available: true, enabled: false }, { channel: 'rightmove', label: 'Rightmove', available: false, enabled: false }, { channel: 'zoopla', label: 'Zoopla', available: false, enabled: false }],
  missing: ['Summary', 'Property type'], shareUrl: 'https://cros-sigma.vercel.app/r/x',
}
export default function Page() {
  const [ok, setOk] = useState(false)
  useEffect(() => {
    const real = window.fetch
    window.fetch = (async (input: any, init?: any) => String(input).includes('/api/lettings/listings') ? new Response(JSON.stringify(sample), { headers: { 'content-type': 'application/json' } }) : real(input, init)) as any
    setOk(true)
  }, [])
  return ok ? <Suspense fallback={null}><ListingEditor params={PARAMS} /></Suspense> : null
}
