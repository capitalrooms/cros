// A landlord approves a repair (9 Nov 2026, migration 275): the job, the tenant's photos and every quote side by side.
// Public, opened from the approval email; the token is the key. No contractor names, no tenant details.
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase'
import { approvalView } from '@/lib/repairs/approvals'
import { signedLinkFor } from '@/lib/files/server'
import Decide from './Decide'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Approve a repair · Capital Rooms', robots: { index: false } }

export default async function Approve({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const v = await approvalView(createServiceClient() as any, token)
  if (!v || !v.job) notFound()
  const photos = (await Promise.all(v.job.photos.map(u => signedLinkFor(u, 3600)))).filter(Boolean) as string[]
  return (
    <div className="ap">
      <style>{CSS}</style>
      <header className="ap-head"><img src="/brand/lockup-ink.png" alt="Capital Rooms" style={{ height: 30 }} /></header>
      <main className="ap-main">
        <p className="ap-eyebrow">Your approval</p>
        <h1>{v.job.title}</h1>
        <p className="ap-where">{v.job.where}</p>
        {v.job.description && <p className="ap-desc">“{v.job.description}”</p>}
        {photos.length > 0 && <div className="ap-photos">{photos.map((u, i) => /* eslint-disable-next-line @next/next/no-img-element */ <a key={i} href={u} target="_blank" rel="noreferrer"><img src={u} alt={`Photo ${i + 1} from the tenant`} /></a>)}</div>}
        {v.status !== 'pending'
          ? <div className="ap-done">{v.status === 'approved' ? 'This repair has been approved — thank you.' : v.status === 'declined' ? 'You asked us to hold off on this one.' : 'This request is no longer open.'}</div>
          : v.quotes.length ? <Decide token={token} quotes={v.quotes} /> : <div className="ap-done">The quotes aren’t ready yet — we’ll be in touch.</div>}
        <p className="ap-foot">Questions? Call us on <a href="tel:+442071129163">0207 112 9163</a> or reply to the email.</p>
      </main>
    </div>
  )
}

const CSS = `
.ap{min-height:100vh;background:#FBF8F1;color:#132219;font-family:system-ui,-apple-system,'Segoe UI',sans-serif}
.ap-head{padding:20px 24px;border-bottom:1px solid #E3E8E2}
.ap-main{max-width:720px;margin:0 auto;padding:32px 20px 64px;display:flex;flex-direction:column;gap:14px}
.ap-eyebrow{margin:0;font-weight:600;color:#1F3B2E}.ap h1{margin:0;font-size:clamp(28px,5vw,40px);line-height:1.1;letter-spacing:-.02em}
.ap-where{margin:0;color:#5C6B62}.ap-desc{margin:0;background:#fff;border-radius:16px;padding:14px 18px;font-style:italic}
.ap-photos{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}.ap-photos img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:14px;display:block}
.ap-quotes{border:0;padding:0;margin:8px 0 0;display:flex;flex-direction:column;gap:10px}.ap-quotes legend{font-weight:700;margin-bottom:8px;font-size:18px}
.ap-quote{display:flex;flex-direction:column;gap:6px;background:#fff;border:2px solid #E3E8E2;border-radius:18px;padding:14px 16px;cursor:pointer}
.ap-quote.on{border-color:#1F3B2E}.ap-quote input{position:absolute;opacity:0}
.ap-q-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.ap-amt{margin-left:auto;font-size:22px;font-weight:800}
.ap-tag{font-size:12px;font-weight:700;background:#E4EBE3;color:#1F3B2E;border-radius:99px;padding:3px 10px}
.ap-notes{color:#5C6B62;font-size:15px}
.ap-note{display:flex;flex-direction:column;gap:6px;font-weight:600}.ap-note textarea{font:inherit;font-weight:400;border:2px solid #E3E8E2;border-radius:14px;padding:10px 12px}
.ap-btns{display:flex;flex-wrap:wrap;gap:10px}.ap-btns button{font:inherit;font-weight:700;font-size:16px;min-height:52px;padding:0 24px;border-radius:999px;border:0;cursor:pointer}
.ap-yes{background:#1F3B2E;color:#fff}.ap-no{background:transparent;border:2px solid #CBD6CB!important;color:#132219}
.ap-done{background:#DDEFE2;color:#14532D;border-radius:16px;padding:16px 18px}.ap-err{color:#7F1D1D;margin:0}
.ap-foot{color:#5C6B62;font-size:14px;margin-top:12px}
`
