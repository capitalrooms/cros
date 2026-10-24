'use client'

// Who to send a Quick notify to, when it isn't "the tenants at a house" (17 Oct 2026): search applicants and anyone
// with a viewing booked, type an email or mobile, or paste a whole email thread — the addresses and numbers are
// picked out (lib/contacts/parse). One picker for lettings and the office alike.
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { parseContacts, type PastedContact } from '@/lib/contacts/parse'

export interface Recipient extends PastedContact { from?: string; propertyName?: string | null }

const key = (r: Recipient) => `${r.email ?? ''}|${r.phone ?? ''}`
const words = (v: string) => v.toLowerCase().split(/[^a-z0-9@.+]+/).filter(Boolean)

export default function PeoplePicker({ value, onChange, compact = false }: { value: Recipient[]; onChange: (v: Recipient[]) => void; compact?: boolean }) {
  const [known, setKnown] = useState<Recipient[]>([])
  const [q, setQ] = useState('')
  const [pasteOpen, setPasteOpen] = useState(false)
  const [paste, setPaste] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    const s = createClient()
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
    Promise.all([
      s.from('viewings').select('visitor_name, visitor_email, visitor_phone, viewing_date, properties(name)').gte('viewing_date', today).order('viewing_date').limit(100),
      s.from('applicants').select('full_name, email, phone, pipeline_stage, archived_at, properties(name)').is('archived_at', null).order('created_at', { ascending: false }).limit(200),
    ]).then(([v, a]) => {
      const list: Recipient[] = [
        ...((v.data ?? []) as any[]).filter(x => x.visitor_email || x.visitor_phone).map(x => ({ name: x.visitor_name, email: x.visitor_email?.toLowerCase() ?? null, phone: x.visitor_phone ?? null, from: `Viewing ${new Date(`${x.viewing_date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`, propertyName: x.properties?.name ?? null })),
        ...((a.data ?? []) as any[]).filter(x => x.email || x.phone).map(x => ({ name: x.full_name, email: x.email?.toLowerCase() ?? null, phone: x.phone ?? null, from: 'Applicant', propertyName: x.properties?.name ?? null })),
      ]
      setKnown([...new Map(list.map(r => [key(r), r])).values()])
    })
  }, [])

  const chosen = new Set(value.map(key))
  const hits = useMemo(() => {
    const ws = words(q)
    if (!ws.length) return []
    return known.filter(r => !chosen.has(key(r)) && ws.every(w => words(`${r.name ?? ''} ${r.email ?? ''} ${r.phone ?? ''} ${r.propertyName ?? ''}`).some(x => x.includes(w)))).slice(0, 8)
  }, [q, known, value])   // eslint-disable-line react-hooks/exhaustive-deps

  function add(list: Recipient[]) {
    const merged = [...value]
    for (const r of list) if (!merged.some(x => key(x) === key(r))) merged.push(r)
    onChange(merged)
  }
  function addTyped() {
    const found = parseContacts(q)
    if (found.length) { add(found); setQ('') }
  }
  function addPasted() {
    const found = parseContacts(paste)
    setNote(found.length ? `Added ${found.length} ${found.length === 1 ? 'person' : 'people'}.` : 'No email addresses or UK mobile numbers found in that.')
    if (found.length) { add(found); setPaste(''); setPasteOpen(false) }
  }

  const field = 'w-full rounded-xl border border-neutral-300 px-md py-sm text-sm text-neutral-900 bg-white'
  return (
    <div className="space-y-sm">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-xs">
          {value.map(r => (
            <span key={key(r)} className="inline-flex max-w-full items-center gap-xs rounded-full bg-neutral-100 py-0.5 pl-sm pr-1 text-xs text-neutral-800">
              <span className="truncate"><b>{r.name || r.email || r.phone}</b>{r.name ? ` · ${[r.phone, r.email].filter(Boolean).join(' · ')}` : r.email && r.phone ? ` · ${r.phone}` : ''}</span>
              <button type="button" aria-label="Remove" onClick={() => onChange(value.filter(x => key(x) !== key(r)))} className="rounded-full px-1 text-neutral-500 hover:bg-neutral-200">×</button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); hits[0] ? (add([hits[0]]), setQ('')) : addTyped() } }}
          placeholder="Search applicants and viewers, or type an email / mobile" className={field} />
        {(hits.length > 0 || parseContacts(q).length > 0) && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-lg">
            {hits.map(r => (
              <button key={key(r)} type="button" onMouseDown={e => { e.preventDefault(); add([r]); setQ('') }} className="block w-full border-b border-neutral-100 px-md py-sm text-left text-sm last:border-0 hover:bg-neutral-50">
                <span className="font-semibold text-neutral-900">{r.name || r.email || r.phone}</span>
                <span className="block text-xs text-neutral-500">{[r.from, r.propertyName, r.phone, r.email].filter(Boolean).join(' · ')}</span>
              </button>
            ))}
            {parseContacts(q).length > 0 && (
              <button type="button" onMouseDown={e => { e.preventDefault(); addTyped() }} className="block w-full px-md py-sm text-left text-sm font-semibold text-blue-700 hover:bg-neutral-50">+ Add {q.trim()}</button>
            )}
          </div>
        )}
      </div>
      {!pasteOpen ? (
        <button type="button" onClick={() => setPasteOpen(true)} className="text-xs font-semibold text-neutral-600 underline">{compact ? '+ Paste emails or numbers' : 'Paste from an email — names, emails and numbers are picked out'}</button>
      ) : (
        <div className="space-y-xs">
          <textarea rows={3} value={paste} onChange={e => setPaste(e.target.value)} placeholder={'Paste anything — e.g.\nJane Smith <jane@gmail.com>\nTom 07700 900123'} className={field} />
          <div className="flex gap-sm">
            <button type="button" onClick={addPasted} className="rounded-lg bg-neutral-900 px-md py-1 text-xs font-bold text-white">Add them</button>
            <button type="button" onClick={() => { setPasteOpen(false); setPaste('') }} className="text-xs text-neutral-600 underline">Cancel</button>
          </div>
        </div>
      )}
      {note && <p className="text-[11px] text-neutral-500">{note}</p>}
    </div>
  )
}
