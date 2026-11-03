'use client'

// Documents › Library (rebuild, 3 Nov 2026): every filed document across every house — certificates, agreements,
// letters and more — in one searchable list; open one and it shows beside the list. Before this the Library tab was the
// old document scanner (upload / emailed in / waiting to confirm), which repeated Capture and listed nothing filed. The
// scanner lives on at /admin/documents/scanner for the documents still waiting to be confirmed there.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import DocViewDrawer from '@/components/DocViewDrawer'
import SubTabs from '@/app/components/SubTabs'
import { createClient } from '@/lib/supabase'
import { documentTabs } from '@/lib/documentTabs'
import { docTypeLabel, fullDatesIn } from '@/lib/documents/types'
import { sortPropertiesNumerically } from '@/lib/sortProperties'

interface Doc { id: string; property_id: string | null; file_name: string; document_type: string | null; description: string | null; storage_url: string; uploaded_at: string; visible_to_tenants: boolean | null }
type Shown = 'all' | 'certificates' | 'tenancy' | 'other'

const CERT = /gas|eicr|electr|epc|fire|pat|legionella|hmo|licen|alarm|emergency_light|asbestos|certificate/i
const TENANCY = /tenan|agreement|reference|right_to_rent|id_|passport|deposit|inventory|check_in|check_out|notice/i
const groupOf = (t: string | null): Exclude<Shown, 'all'> => CERT.test(t ?? '') ? 'certificates' : TENANCY.test(t ?? '') ? 'tenancy' : 'other'
const firstLine = (s: string | null | undefined) => String(s ?? '').split('\n')[0]
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' })

export default function DocumentLibraryPage() {
  const [docs, setDocs] = useState<Doc[] | null>(null)
  const [houses, setHouses] = useState<{ id: string; name: string }[]>([])
  const [waiting, setWaiting] = useState(0)
  const [q, setQ] = useState('')
  const [house, setHouse] = useState('')
  const [shown, setShown] = useState<Shown>('all')
  const [open, setOpen] = useState<Doc | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const sb = createClient()
    Promise.all([
      sb.from('property_documents').select('id, property_id, file_name, document_type, description, storage_url, uploaded_at, visible_to_tenants').order('uploaded_at', { ascending: false }).limit(2000),
      sb.from('properties').select('id, name, address'),
      sb.from('documents_pending').select('id', { count: 'exact', head: true }),
    ]).then(([d, p, w]) => {
      if (d.error) setError(d.error.message)
      setDocs((d.data ?? []) as Doc[])
      setHouses(sortPropertiesNumerically((p.data ?? []) as any[]).map((x: any) => ({ id: x.id, name: firstLine(x.name || x.address) })))
      setWaiting(w.count ?? 0)
    })
  }, [])

  const houseName = useMemo(() => new Map(houses.map(h => [h.id, h.name])), [houses])
  const needle = q.trim().toLowerCase()
  const list = (docs ?? []).filter(d =>
    (!house || d.property_id === house) && (shown === 'all' || groupOf(d.document_type) === shown) &&
    (!needle || [d.file_name, docTypeLabel(d.document_type), d.description, houseName.get(d.property_id ?? '')].some(v => String(v ?? '').toLowerCase().includes(needle))))
  const count = (g: Shown) => (docs ?? []).filter(d => (!house || d.property_id === house) && (g === 'all' || groupOf(d.document_type) === g)).length

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin" />} title="Documents" />
      <PageHero title="Documents" subtitle="Library: every filed document, across every house" tabs={documentTabs('library')} />
      <main className="mx-auto max-w-6xl px-lg py-xl space-y-md">
        {waiting > 0 && (
          <Link href="/admin/documents/scanner" className="flex items-center justify-between gap-md rounded-2xl bg-[var(--accent,#E8B931)] px-lg py-sm text-sm font-semibold text-[var(--ink,#23261A)]">
            <span>{waiting} read by the document scanner and waiting for you to confirm</span><span aria-hidden="true">›</span>
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-sm">
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search by file, type, house or note…"
            className="min-w-[220px] flex-1 rounded-xl border border-neutral-200 bg-white px-md py-sm text-sm" />
          <select value={house} onChange={e => setHouse(e.target.value)} aria-label="House" className="rounded-xl border border-neutral-200 bg-white px-md py-sm text-sm">
            <option value="">Every house</option>
            {houses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </div>
        <SubTabs<Shown> tabs={[['all', `All · ${count('all')}`], ['certificates', `Certificates · ${count('certificates')}`], ['tenancy', `Tenancy papers · ${count('tenancy')}`], ['other', `Other · ${count('other')}`]]} active={shown} onChange={setShown} />

        {error && <p className="rounded-xl border border-red-200 bg-red-50 px-lg py-sm text-sm text-red-800">{error}</p>}
        <div className="rounded-2xl border border-neutral-200 bg-white overflow-x-auto">
          {docs === null ? <p className="p-lg text-sm text-neutral-500">Loading the library…</p>
          : list.length === 0 ? <p className="p-lg text-sm text-neutral-500">{q || house || shown !== 'all' ? 'Nothing matches.' : 'Nothing filed yet. Capture files what comes in.'}</p>
          : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-neutral-200 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-neutral-500">
                <th className="px-lg py-sm">Document</th><th className="px-lg py-sm hidden md:table-cell">House</th><th className="px-lg py-sm hidden sm:table-cell">Filed</th>
              </tr></thead>
              <tbody>
                {list.slice(0, 400).map(d => (
                  <tr key={d.id} onClick={() => setOpen(d)} className={`cursor-pointer border-t border-neutral-100 hover:bg-neutral-50 ${open?.id === d.id ? 'bg-neutral-100' : ''}`}>
                    <td className="px-lg py-sm min-w-0">
                      <span className="block font-semibold text-neutral-900 break-all">{d.file_name}</span>
                      <span className="text-xs text-neutral-500">{docTypeLabel(d.document_type)}{d.description ? ` · ${fullDatesIn(d.description).slice(0, 90)}` : ''}{d.visible_to_tenants ? ' · tenants can see it' : ''}</span>
                      <span className="block text-xs text-neutral-500 md:hidden">{houseName.get(d.property_id ?? '') ?? ''}</span>
                    </td>
                    <td className="px-lg py-sm hidden md:table-cell text-neutral-700">{d.property_id ? <Link href={`/admin/properties/${d.property_id}?tab=documents`} onClick={e => e.stopPropagation()} className="hover:underline">{houseName.get(d.property_id) ?? '—'}</Link> : '—'}</td>
                    <td className="px-lg py-sm hidden sm:table-cell whitespace-nowrap text-neutral-600 tabular-nums">{day(d.uploaded_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {list.length > 400 && <p className="border-t border-neutral-100 px-lg py-sm text-xs text-neutral-500">Showing the newest 400 of {list.length}. Search or pick a house to narrow it.</p>}
        </div>
      </main>
      {open && <DocViewDrawer title={houseName.get(open.property_id ?? '') ?? 'Document'} subtitle={docTypeLabel(open.document_type)} fileName={open.file_name} storageUrl={open.storage_url} onClose={() => setOpen(null)} />}
    </div>
  )
}
