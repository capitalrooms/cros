'use client'
// DEV ONLY (never committed): Quick Notify with sample data, to check the layout without signing in.
import { useEffect, useState } from 'react'
import QuickNotifyModal from '@/app/admin/components/QuickNotifyModal'

const SAMPLE = {
  property: { id: 'p1', name: '12 Saltwell Street', address: '12 Saltwell Street, London E14 0DZ' },
  rooms: [{ id: 'r1', name: 'Room 1' }, { id: 'r2', name: 'Room 2' }, { id: 'r3', name: 'Room 3' }],
  tenants: [
    { personId: 'a', name: 'Ms Alice Johnson (test account)', dear: 'Ms Johnson', room: 'Room 1', roomId: 'r1', hasApp: true, hasEmail: true, hasMobile: true, test: true },
    { personId: 'b', name: 'Mr Bradley Cotterill', dear: 'Mr Cotterill', room: 'Room 2', roomId: 'r2', hasApp: false, hasEmail: true, hasMobile: true, test: false },
  ],
  cleaners: 1, guides: [{ slug: 'fire-safety', title: 'Fire Safety', emoji: '🔥', sections: 8 }, { slug: 'x', title: 'Empty one', emoji: '📋', sections: 0 }],
  hmo: { council_name: 'London Borough of Tower Hamlets', council_contact: 'Town Hall · 020 7364 5008', holder_name: 'Mr Richard Page', submit_by: '2026-11-01', licence_number: '', licence_expiry: '' },
  sendingOn: true,
}
export default function Page() {
  const [ok, setOk] = useState(false)
  useEffect(() => {
    const real = window.fetch
    window.fetch = (async (input: any, init?: any) => String(input).includes('/api/admin/quick-notify') ? new Response(JSON.stringify(SAMPLE), { headers: { 'content-type': 'application/json' } }) : real(input, init)) as any
    setOk(true)
  }, [])
  return <div className="min-h-screen bg-neutral-100 p-xl"><p>Behind the modal</p>{ok && <QuickNotifyModal propertyId="p1" onClose={() => {}} />}</div>
}
