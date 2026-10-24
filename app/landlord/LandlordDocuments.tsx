'use client'

// "Your documents" on the landlord app home (21 Oct 2026): lettings statements, tenancy agreements, our invoices and
// letters, and (managed houses) certificates — for this landlord's houses only (lib/landlord/documents). Each opens in
// a new tab or downloads; links are private and short-lived.
import { useEffect, useState } from 'react'

interface Doc { type: 'pd' | 'gd' | 'ls'; id: string; title: string; property: string; date: string | null; extra?: string }
interface Data { houses: { id: string; name: string; lettingType: string }[]; statements: Doc[]; agreements: Doc[]; invoices: Doc[]; certificates: Doc[] }

const day = (d: string | null) => d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''

export default function LandlordDocuments({ asId }: { asId?: string | null }) {
  const [data, setData] = useState<Data | null>(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const q = asId ? `&as=${encodeURIComponent(asId)}` : ''
  useEffect(() => {
    fetch(`/api/landlord/documents${asId ? `?as=${encodeURIComponent(asId)}` : ''}`).then(r => r.ok ? r.json() : null).then(setData).catch(() => setData(null))
  }, [asId])

  async function open(d: Doc, download: boolean) {
    setBusy(`${d.id}${download}`); setMsg('')
    // a window opened straight away isn't blocked as a pop-up; it's pointed at the file once it's ready
    const w = download ? null : window.open('', '_blank')
    try {
      const res = await fetch(`/api/landlord/documents/open?type=${d.type}&id=${d.id}${download ? '&download=1' : ''}${q}`)
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'That document couldn’t be opened') }
      let url: string
      if ((res.headers.get('content-type') ?? '').includes('application/pdf')) url = URL.createObjectURL(await res.blob())
      else url = (await res.json()).url
      if (download) { const a = document.createElement('a'); a.href = url; a.download = `${d.title}.pdf`.replace(/[\\/:*?"<>|]+/g, ' '); document.body.appendChild(a); a.click(); a.remove() }
      else if (w) w.location.href = url
      else window.location.href = url
    } catch (e) { w?.close(); setMsg(e instanceof Error ? e.message : 'That document couldn’t be opened') } finally { setBusy('') }
  }

  if (!data) return null
  const groups: [string, string, Doc[]][] = ([
    ['Lettings statements', 'What came in for each let, our fee, and what was paid to you', data.statements],
    ['Tenancy agreements', '', data.agreements],
    ['Invoices and letters from us', '', data.invoices],
    ['Certificates', 'Safety certificates for the houses we manage', data.certificates],
  ] as [string, string, Doc[]][]).filter(([, , xs]) => xs.length)

  return (
    <section className="mx-auto mt-12 max-w-6xl px-6 md:px-14">
      <p className="pub-eyebrow m-0">Your documents</p>
      <h2 className="pub-serif m-0 mt-2 text-[28px] leading-tight md:text-[36px]">Statements, agreements and invoices</h2>
      {data.houses.length > 0 && <p className="pub-muted mt-2 text-[14px]">{data.houses.map(h => `${h.name}${h.lettingType === 'let_only' ? ' (tenant find)' : ''}`).join(' · ')}</p>}
      {msg && <p className="mt-3 text-[14px]" style={{ color: '#9B2C1F' }}>{msg}</p>}
      {!groups.length && <p className="pub-muted mt-6 text-[15px]">Nothing here yet — statements, agreements and invoices appear as soon as we have them.</p>}
      <div className="mt-6 flex flex-col gap-8">
        {groups.map(([title, sub, xs]) => (
          <div key={title}>
            <p className="m-0 text-[15px] font-semibold">{title} <span className="pub-muted font-normal">· {xs.length}</span></p>
            {sub && <p className="pub-muted m-0 mt-0.5 text-[13px]">{sub}</p>}
            <ul className="m-0 mt-3 list-none divide-y p-0" style={{ borderTop: '1px solid #E4E0D8', borderBottom: '1px solid #E4E0D8' }}>
              {xs.map(d => (
                <li key={`${d.type}-${d.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3" style={{ borderColor: '#E4E0D8' }}>
                  <div className="min-w-0">
                    <p className="m-0 truncate text-[15px]">{d.title}</p>
                    <p className="pub-muted m-0 text-[13px]">{[d.property, d.extra === 'moving in' ? `${d.date && d.date > new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) ? 'moving in' : 'moved in'} ${day(d.date)}` : day(d.date), d.extra && d.extra !== 'moving in' ? d.extra : ''].filter(Boolean).join(' · ')}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" disabled={!!busy} onClick={() => open(d, false)} className="rounded-full border px-4 py-1.5 text-[13px] font-semibold" style={{ borderColor: '#111' }}>{busy === `${d.id}false` ? 'Opening…' : 'View'}</button>
                    <button type="button" disabled={!!busy} onClick={() => open(d, true)} className="rounded-full px-4 py-1.5 text-[13px] font-semibold text-white" style={{ background: '#111' }}>{busy === `${d.id}true` ? 'Saving…' : 'Download'}</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
