import { websiteHomes } from '@/lib/website/homes'
const gbp = (n: number) => '£' + Number(n).toLocaleString('en-GB', { maximumFractionDigits: 0 })
const when = (d: string | null) => !d ? 'Date to confirm' : d <= new Date().toISOString().slice(0, 10) ? 'Available now' : `From ${new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`

export default async function HomesList({ whole }: { whole: boolean }) {
  const homes = (await websiteHomes()).filter(h => h.whole === whole)
  if (!homes.length) return <div className="card"><h2 className="h3">Nothing free right now</h2><p style={{ color: 'var(--muted)' }}>New homes come up all the time — call us on 0207 112 9163 or send a message and we’ll tell you first.</p></div>
  return (
    <div className="grid3">
      {homes.map(h => (
        <a key={h.id} href={h.href} className="card rise" style={{ padding: 14, textDecoration: 'none', color: 'var(--ink)' }}>
          <div className="ph sage" style={{ height: 220, borderRadius: 20 }}>{/* eslint-disable-next-line @next/next/no-img-element */}{h.photo && <img src={h.photo} alt="" loading="lazy" />}</div>
          <div style={{ padding: '6px 8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--forest)' }}>{h.area}</span>
            <span style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.3 }}>{h.title}</span>
            <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><strong className="disp" style={{ fontSize: 24 }}>{h.rent ? `${gbp(h.rent)} pcm` : 'Rent on request'}</strong><span style={{ color: 'var(--muted)', fontSize: 15, alignSelf: 'center' }}>{when(h.available)}</span></span>
          </div>
        </a>
      ))}
    </div>
  )
}
