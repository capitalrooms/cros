// "Who you'd live with" on an advert (12 Nov 2026) — the housemates who said yes to a short intro (lib/housemates/adverts).
// No names or photos: their avatar and a few lines in their own words.
import type { HousemateIntro } from '@/lib/housemates/adverts'

export default function Housemates({ people, heading }: { people: HousemateIntro[]; heading: React.ReactNode }) {
  if (!people.length) return null
  return (
    <section style={{ marginTop: 40 }}>
      {heading}
      <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
        {people.map((h, i) => (
          <li key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', border: '1px solid #E4E0D8', borderRadius: 16, padding: 16, background: '#fff' }}>
            <span aria-hidden="true" style={{ width: 52, height: 52, borderRadius: 26, background: h.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flex: '0 0 auto' }}>{h.emoji}</span>
            <span style={{ minWidth: 0, fontSize: 15, lineHeight: 1.45 }}>
              <span style={{ display: 'block', fontWeight: 600 }}>{h.does ?? 'Housemate'}</span>
              {h.from && <span style={{ display: 'block', color: '#5F5A52' }}>From {h.from}</span>}
              {h.weekends.length > 0 && <span style={{ display: 'block', color: '#5F5A52' }}>Weekends: {h.weekends.join(', ').toLowerCase()}</span>}
              {(h.rhythm || h.vibe) && <span style={{ display: 'block', color: '#5F5A52' }}>{[h.rhythm, h.vibe].filter(Boolean).join(' · ')}</span>}
            </span>
          </li>
        ))}
      </ul>
      <p style={{ margin: '10px 0 0', fontSize: 13, color: '#6F6A60' }}>In their own words, shared with their permission.</p>
    </section>
  )
}
