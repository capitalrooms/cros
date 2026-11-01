'use client'

// The invoice and its receipts, from the link in our email (1 Nov 2026) — for landlords not yet in the app. Once they
// sign in, the same documents are under "Your documents". Look: the shared public frame (PublicShell, design "C").
import { use, useEffect, useState } from 'react'
import PublicShell from '@/components/public/PublicShell'

interface View { kind: string; number: string | null; title: string; recipient: string; total: number | null; date: string; files: { id: string; name: string; type: string }[] }

const wrap = 'mx-auto max-w-6xl px-6 md:px-14'
const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function ReceiptsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [v, setV] = useState<View | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    fetch(`/api/receipts/${encodeURIComponent(token)}`)
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'This link isn’t valid.'); return d })
      .then(setV).catch(e => setError(e.message))
  }, [token])

  const label = 'Your documents'
  if (error) return <PublicShell label={label}><section className={`${wrap} py-24`}><p className="pub-error">{error}</p></section></PublicShell>
  if (!v) return <PublicShell label={label}><section className={`${wrap} py-24`}><p className="pub-eyebrow">Loading…</p></section></PublicShell>

  const link = (id: string, download = false) => `/api/receipts/${token}?file=${id}${download ? '&download=1' : ''}`
  const rows = [{ id: 'invoice', name: `${v.kind === 'invoice' ? 'Invoice' : 'Letter'}${v.number ? ` ${v.number}` : ''}`, sub: [v.title, v.total != null ? gbp(Number(v.total)) : ''].filter(Boolean).join(' · ') }, ...v.files.map(f => ({ id: f.id, name: f.name, sub: f.type === 'application/pdf' ? 'PDF' : 'Photo' }))]
  return (
    <PublicShell label={label}>
      <section className={`${wrap} pt-12 pb-16 md:pt-20`}>
        <p className="pub-eyebrow m-0">{v.recipient} · {day(v.date)}</p>
        <h1 className="pub-h2 mt-2">{v.kind === 'invoice' ? `Invoice${v.number ? ` ${v.number}` : ''} and receipts` : 'Your letter'}</h1>
        <ul className="m-0 mt-8 max-w-3xl list-none p-0" style={{ borderTop: '1px solid #111' }}>
          {rows.map(r => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3" style={{ borderBottom: '1px solid #E4E0D8' }}>
              <span className="min-w-0"><span className="block truncate text-[16px]">{r.name}</span>{r.sub && <span className="block text-[13px]" style={{ color: '#8A857C' }}>{r.sub}</span>}</span>
              <span className="flex shrink-0 gap-2">
                <a href={link(r.id)} target="_blank" rel="noreferrer" className="pub-btn-ghost" style={{ minHeight: 40, background: '#111', color: '#fff' }}>View</a>
                <a href={link(r.id, true)} className="pub-btn-ghost" style={{ minHeight: 40 }}>Download</a>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-[14px]" style={{ color: '#8A857C' }}>These are also kept in your landlord account under “Your documents”.</p>
      </section>
    </PublicShell>
  )
}
