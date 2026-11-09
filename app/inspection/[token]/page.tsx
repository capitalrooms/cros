// The landlord's inspection report (9 Nov 2026, migration 275): opened from the email; the token is the key.
// Photos are short-lived signed links; no tenant names, no contractor names.
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase'
import { inspectionView, CONDITION_LABEL, type Condition } from '@/lib/inspections'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Inspection report · Capital Rooms', robots: { index: false } }

const TONE: Record<Condition, string> = { good: 'good', fair: 'fair', needs_work: 'bad' }

export default async function Report({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const v = await inspectionView(createServiceClient() as any, token)
  if (!v) notFound()
  const counts = (['good', 'fair', 'needs_work'] as Condition[]).map(c => [c, v.areas.filter(a => a.condition === c).length] as const).filter(([, n]) => n)
  return (
    <div className="ir">
      <style>{CSS}</style>
      <header className="ir-head">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/brand/lockup-ink.png" alt="Capital Rooms" style={{ height: 30 }} /></header>
      <main className="ir-main">
        <p className="ir-eyebrow">{v.kind} · {v.date}</p>
        <h1>{v.houseName}</h1>
        <div className="ir-overall">
          <span className={`ir-pill ${TONE[v.overall]}`}>Overall: {CONDITION_LABEL[v.overall]}</span>
          {counts.map(([c, n]) => <span key={c} className="ir-count">{n} {CONDITION_LABEL[c].toLowerCase()}</span>)}
          {v.by && <span className="ir-count">Inspected by {v.by}</span>}
        </div>
        {v.summary && <p className="ir-summary">{v.summary}</p>}
        <div className="ir-areas">
          {v.areas.map((a, i) => (
            <section key={i} className="ir-area">
              <div className="ir-area-top"><h2>{a.name}</h2>{a.condition && <span className={`ir-pill ${TONE[a.condition]}`}>{CONDITION_LABEL[a.condition]}</span>}</div>
              {a.note && <p>{a.note}</p>}
              {a.photos.length > 0 && <div className="ir-photos">{a.photos.map((u, j) => /* eslint-disable-next-line @next/next/no-img-element */ <a key={j} href={u} target="_blank" rel="noreferrer"><img src={u} alt={`${a.name}, photo ${j + 1}`} loading="lazy" /></a>)}</div>}
            </section>
          ))}
        </div>
        <p className="ir-foot">Questions about anything here? Call us on <a href="tel:+442071129163">0207 112 9163</a> or reply to the email. Photo links refresh each time you open this page.</p>
      </main>
    </div>
  )
}

const CSS = `
.ir{min-height:100vh;background:#FBF8F1;color:#132219;font-family:system-ui,-apple-system,'Segoe UI',sans-serif}
.ir-head{padding:20px 24px;border-bottom:1px solid #E3E8E2}
.ir-main{max-width:820px;margin:0 auto;padding:32px 20px 64px;display:flex;flex-direction:column;gap:14px}
.ir-eyebrow{margin:0;font-weight:600;color:#1F3B2E}.ir h1{margin:0;font-size:clamp(28px,5vw,42px);line-height:1.1;letter-spacing:-.02em;text-wrap:balance}
.ir-overall{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ir-pill{font-size:13px;font-weight:700;border-radius:99px;padding:4px 12px}
.ir-pill.good{background:#DDEFE2;color:#14532D}.ir-pill.fair{background:#FDF0D5;color:#7C4A03}.ir-pill.bad{background:#FBE1DE;color:#7F1D1D}
.ir-count{font-size:13px;color:#5C6B62;background:#fff;border-radius:99px;padding:4px 12px}
.ir-summary{margin:0;background:#fff;border-radius:16px;padding:16px 18px;line-height:1.55;white-space:pre-line}
.ir-areas{display:flex;flex-direction:column;gap:12px;margin-top:6px}
.ir-area{background:#fff;border-radius:18px;padding:16px 18px;display:flex;flex-direction:column;gap:10px}
.ir-area-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.ir-area h2{margin:0;font-size:18px;flex:1;min-width:0}
.ir-area p{margin:0;color:#33433A;line-height:1.5;white-space:pre-line}
.ir-photos{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}.ir-photos img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:12px;display:block}
.ir-foot{color:#5C6B62;font-size:14px;margin-top:12px}
`
