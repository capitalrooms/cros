'use client'

// "Your documents" on the landlord app home (21 Oct 2026): lettings statements, tenancy agreements, our invoices and
// letters, and (managed houses) certificates — for this landlord's houses only (lib/landlord/documents). Each opens in
// a new tab or downloads; links are private and short-lived.
import { useEffect, useState } from 'react'

interface Doc { type: 'pd' | 'gd' | 'gf' | 'ls'; id: string; title: string; property: string; date: string | null; extra?: string }
interface Data { houses: { id: string; name: string; lettingType: string }[]; statements: Doc[]; agreements: Doc[]; invoices: Doc[]; receipts?: Doc[]; certificates: Doc[] }

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
      if (download) { const a = document.createElement('a'); a.href = url; a.download = d.type === 'gf' ? d.title : `${d.title}.pdf`.replace(/[\\/:*?"<>|]+/g, ' '); document.body.appendChild(a); a.click(); a.remove() }
      else if (w) w.location.href = url
      else window.location.href = url
    } catch (e) { w?.close(); setMsg(e instanceof Error ? e.message : 'That document couldn’t be opened') } finally { setBusy('') }
  }

  const [openGroup, setOpenGroup] = useState<string | null>(null)
  if (!data) return null
  // folded shut by kind, the newest first; tap a row to open it, the arrow to save it (17 Nov 2026 — it was 38 rows of
  // View / Download pairs under a second big heading)
  const groups: [string, string, Doc[]][] = ([
    ['Certificates', 'Safety certificates for the homes we manage', data.certificates],
    ['Tenancy agreements', '', data.agreements],
    ['Lettings statements', 'Each let we found: what came in, our fee, what was paid to you', data.statements],
    ['Invoices and letters', '', data.invoices],
    ['Receipts', '', data.receipts ?? []],
  ] as [string, string, Doc[]][]).filter(([, , xs]) => xs.length)

  return (
    <div className="px-4">
      {msg && <p className="py-2 text-[13px] text-[#8E2318]">{msg}</p>}
      {!groups.length && <p className="py-3 text-[14px] text-[#4E6158]">Statements, agreements and certificates show here as soon as we have them.</p>}
      {groups.map(([title, sub, xs], gi) => {
        const isOpen = openGroup === title
        return (
          <div key={title} className={gi ? 'border-t border-[#E3EAE4]' : ''}>
            <button type="button" onClick={() => setOpenGroup(isOpen ? null : title)} className="flex w-full items-center justify-between gap-3 py-3.5 text-left" aria-expanded={isOpen}>
              <span className="min-w-0"><span className="block text-[15px]">{title}</span>{sub && <span className="block text-[12px] text-[#4E6158]">{sub}</span>}</span>
              <span className="shrink-0 text-[13px] text-[#4E6158]">{xs.length} {isOpen ? '⌃' : '⌄'}</span>
            </button>
            {isOpen && (
              <ul className="m-0 list-none p-0 pb-2">
                {xs.map(d => (
                  <li key={`${d.type}-${d.id}`} className="flex items-center gap-2 border-t border-[#EEF2EC] py-2.5">
                    <button type="button" disabled={!!busy} onClick={() => open(d, false)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-[14px]">{busy === `${d.id}false` ? 'Opening…' : d.title}</span>
                      <span className="block truncate text-[12px] text-[#4E6158]">{[d.property, d.extra === 'moving in' ? `${d.date && d.date > new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) ? 'moving in' : 'moved in'} ${day(d.date)}` : day(d.date), d.extra && d.extra !== 'moving in' ? d.extra : ''].filter(Boolean).join(' · ')}</span>
                    </button>
                    <button type="button" disabled={!!busy} onClick={() => open(d, true)} aria-label={`Save ${d.title}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#EEF2EC] text-[#17332B]">{busy === `${d.id}true` ? '…' : '↓'}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}
