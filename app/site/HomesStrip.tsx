// A few homes free now, for the homepage (live from CROS).
import { websiteHomes } from '@/lib/website/homes'
const gbp = (n: number) => '£' + Number(n).toLocaleString('en-GB', { maximumFractionDigits: 0 })
export default async function HomesStrip() {
  const homes = (await websiteHomes()).filter(h => h.photo).slice(0, 3)
  if (!homes.length) return null
  return (
    <div className="grid3">
      {homes.map(h => (
        <a key={h.id} href={h.href} className="card rise" style={{ padding: 12, textDecoration: 'none', color: 'var(--ink)' }}>
          <div className="ph sage" style={{ height: 240, borderRadius: 20 }}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={h.photo!} alt="" loading="lazy" /></div>
          <div style={{ padding: '6px 8px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--forest)' }}>{h.area}</span>
            <span style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.3 }}>{h.title}</span>
            {h.rent && <strong className="disp" style={{ fontSize: 22 }}>{gbp(h.rent)} pcm</strong>}
          </div>
        </a>
      ))}
    </div>
  )
}
