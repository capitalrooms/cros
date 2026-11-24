'use client'
// The homepage shows landlords or tenants, never both (24 Nov 2026): two buttons, and the tiles below change.
// Each side is built on the server and passed in, so nothing for the other side is shown.
import { useState } from 'react'

type Who = 'landlord' | 'tenant'

export default function AudienceSwitch({ landlord, tenant }: { landlord: React.ReactNode; tenant: React.ReactNode }) {
  const [who, setWho] = useState<Who>('landlord')
  const btn = (k: Who, label: string) => (
    <button type="button" aria-pressed={who === k} onClick={() => setWho(k)}
      style={{ padding: '12px 22px', borderRadius: 999, fontWeight: 600, cursor: 'pointer', border: '1.5px solid var(--ink, #17332B)',
        background: who === k ? 'var(--ink, #17332B)' : 'transparent', color: who === k ? '#fff' : 'var(--ink, #17332B)' }}>{label}</button>
  )
  return (
    <>
      <section className="block" aria-label="Choose landlord or tenant"><div className="wrap">
        <p className="eyebrow">I am a</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 14 }}>
          {btn('landlord', 'Landlord')}
          {btn('tenant', 'Tenant')}
        </div>
      </div></section>
      {who === 'landlord' ? landlord : tenant}
    </>
  )
}
