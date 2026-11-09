'use client'
// Inspections + the repair approval limit (9 Nov 2026, migration 275). Walk round on a phone: each area gets a
// condition, a note and photos; "Send to landlord" emails them a private report link. Contractors and tenants are
// never named in the report.
import { useCallback, useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

type Cond = 'good' | 'fair' | 'needs_work'
type Area = { name: string; condition: Cond | null; note: string; photos: string[] }
type Insp = { id: string; kind: string; inspected_on: string; inspected_by: string | null; overall: Cond | null; summary: string | null; areas: Area[]; status: 'draft' | 'sent'; token: string | null; sent_at: string | null; sent_to: string[] | null; viewed_at: string | null }

const KINDS: [string, string][] = [['routine', 'Routine inspection'], ['check_in', 'Check-in'], ['check_out', 'Check-out'], ['other', 'Other']]
const CONDS: [Cond, string, string][] = [['good', 'Good', 'bg-green-700 text-white'], ['fair', 'Fair', 'bg-amber-500 text-white'], ['needs_work', 'Needs work', 'bg-red-700 text-white']]
const chip = (c: Cond | null) => c ? CONDS.find(x => x[0] === c)! : null
const longDate = (d: string) => new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
const input = 'w-full rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm text-neutral-900'

/** Shrink a phone photo before it leaves the phone (long side 1600px, JPEG). */
async function shrink(file: File): Promise<Blob> {
  const img = await createImageBitmap(file).catch(() => null)
  if (!img) return file
  const k = Math.min(1, 1600 / Math.max(img.width, img.height))
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  return await new Promise<Blob>(res => c.toBlob(b => res(b ?? file), 'image/jpeg', 0.82))
}

export default function InspectionsTab({ propertyId }: { propertyId: string }) {
  const [list, setList] = useState<Insp[] | null>(null)
  const [links, setLinks] = useState<Record<string, string>>({})
  const [emails, setEmails] = useState<string[]>([])
  const [limit, setLimit] = useState('')
  const [limitSaved, setLimitSaved] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Insp | null>(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    const r = await adminFetch(`/api/admin/inspections?propertyId=${propertyId}`)
    const d = await r.json().catch(() => ({}))
    if (d.error) setError(d.error)
    setList(d.inspections ?? []); setLinks(l => ({ ...l, ...(d.photos ?? {}) })); setEmails(d.landlordEmails ?? [])
    const l = d.limit == null ? '' : String(Number(d.limit)); setLimit(l); setLimitSaved(l)
    return (d.inspections ?? []) as Insp[]
  }, [propertyId])
  useEffect(() => { load() }, [load])

  function open(i: Insp | null) { setOpenId(i?.id ?? null); setDraft(i ? JSON.parse(JSON.stringify(i)) : null); setDirty(false); setError(''); setNotice('') }
  const edit = (patch: Partial<Insp>) => { setDraft(d => d ? { ...d, ...patch } : d); setDirty(true) }
  const editArea = (i: number, patch: Partial<Area>) => setDraft(d => { if (!d) return d; const areas = d.areas.map((a, j) => j === i ? { ...a, ...patch } : a); setDirty(true); return { ...d, areas } })

  async function call(url: string, method: string, body?: unknown) {
    const r = await adminFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const d = await r.json().catch(() => ({}))
    if (!r.ok || d.error) throw new Error(d.error || 'That didn’t work')
    return d
  }
  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key); setError(''); setNotice('')
    try { await fn() } catch (e) { setError(e instanceof Error ? e.message : 'That didn’t work') } finally { setBusy('') }
  }

  const saveLimit = () => run('limit', async () => {
    const d = await call('/api/admin/inspections', 'PATCH', { propertyId, repair_approval_limit: limit.trim() })
    const l = d.limit == null ? '' : String(d.limit); setLimit(l); setLimitSaved(l)
    setNotice(d.limit == null ? 'No approval limit — the office can accept any quote.' : `Quotes over £${d.limit} now go to the landlord to approve.`)
  })
  const create = (kind: string) => run('new', async () => {
    const d = await call('/api/admin/inspections', 'POST', { propertyId, kind })
    const rows = await load(); open(rows.find(r => r.id === d.id) ?? null)
  })
  async function save() {
    if (!draft) return
    await call(`/api/admin/inspections/${draft.id}`, 'PATCH', { kind: draft.kind, inspected_on: draft.inspected_on, inspected_by: draft.inspected_by, overall: draft.overall, summary: draft.summary, areas: draft.areas })
    setDirty(false)
  }
  const saveNow = () => run('save', async () => { await save(); await load(); setNotice('Saved.') })
  const send = () => draft && run('send', async () => {
    if (!window.confirm(`Send this report to ${emails.join(' and ') || 'the landlord'}?${draft.status === 'sent' ? ' They’ll get a fresh email with the same link.' : ''}`)) return
    await save()
    const d = await call(`/api/admin/inspections/${draft.id}`, 'POST', { action: 'send' })
    const rows = await load(); open(rows.find(r => r.id === draft.id) ?? null)
    setNotice(`Sent to ${(d.sentTo ?? []).join(' and ')}.`)
  })
  const remove = () => draft && run('delete', async () => {
    if (!window.confirm('Delete this draft inspection and its photos from the list?')) return
    await call(`/api/admin/inspections/${draft.id}`, 'DELETE'); open(null); await load()
  })
  async function addPhotos(i: number, files: FileList | null) {
    if (!draft || !files?.length) return
    setBusy('photo' + i); setError('')
    try {
      const added: string[] = []
      for (const f of Array.from(files).slice(0, 12)) {
        const fd = new FormData(); fd.append('file', new File([await shrink(f)], 'photo.jpg', { type: 'image/jpeg' }))
        const r = await adminFetch(`/api/admin/inspections/${draft.id}/photo`, { method: 'POST', body: fd })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || 'A photo didn’t upload')
        added.push(d.url); if (d.link) setLinks(l => ({ ...l, [d.url]: d.link }))
      }
      // keep the photos even if they never press Save
      const areas = draft.areas.map((a, j) => j === i ? { ...a, photos: [...a.photos, ...added].slice(0, 12) } : a)
      setDraft({ ...draft, areas })
      await call(`/api/admin/inspections/${draft.id}`, 'PATCH', { areas })
    } catch (e) { setError(e instanceof Error ? e.message : 'A photo didn’t upload') } finally { setBusy('') }
  }

  return (
    <div className="flex flex-col gap-lg">
      {/* Repair approval limit */}
      <section className="rounded-xl border border-neutral-200 bg-white p-md">
        <h3 className="font-bold text-neutral-900">Repair approval limit</h3>
        <p className="mt-xs text-xs text-neutral-500">Quotes over this amount go to the landlord to approve, with every quote side by side (contractors aren’t named). Leave blank for no limit.</p>
        <div className="mt-sm flex flex-wrap items-center gap-sm">
          <div className="relative w-40"><span className="pointer-events-none absolute left-md top-1/2 -translate-y-1/2 text-sm text-neutral-500">£</span>
            <input inputMode="decimal" value={limit} onChange={e => setLimit(e.target.value.replace(/[^\d.]/g, ''))} placeholder="No limit" className={`${input} pl-7`} aria-label="Repair approval limit in pounds" /></div>
          <button onClick={saveLimit} disabled={busy === 'limit' || limit === limitSaved} className="rounded-lg bg-neutral-900 px-md py-sm text-xs font-bold text-white disabled:opacity-40">{busy === 'limit' ? 'Saving…' : 'Save'}</button>
          {!emails.length && <span className="text-xs text-amber-700">The landlord has no email on file, so approvals can’t be sent yet.</span>}
        </div>
      </section>

      {error && <p className="rounded-lg bg-red-50 px-md py-sm text-sm text-red-700" role="alert">{error}</p>}
      {notice && <p className="rounded-lg bg-green-50 px-md py-sm text-sm text-green-800">{notice}</p>}

      {/* The list */}
      <section className="flex flex-col gap-sm">
        <div className="flex flex-wrap items-center justify-between gap-sm">
          <h3 className="font-bold text-neutral-900">Inspections</h3>
          <div className="flex flex-wrap gap-xs">
            {KINDS.slice(0, 3).map(([k, label]) => (
              <button key={k} disabled={!!busy} onClick={() => create(k)} className={`rounded-lg px-md py-sm text-xs font-bold disabled:opacity-40 ${k === 'routine' ? 'bg-neutral-900 text-white' : 'border border-neutral-300 text-neutral-800'}`}>{busy === 'new' && k === 'routine' ? 'Starting…' : k === 'routine' ? 'New inspection' : `New ${label.toLowerCase()}`}</button>
            ))}
          </div>
        </div>
        {list === null ? <p className="text-sm text-neutral-500">Loading…</p>
          : !list.length ? <p className="rounded-xl border border-dashed border-neutral-300 p-lg text-center text-sm text-neutral-500">No inspections yet. Start one when you’re at the house: each area gets a condition, a note and photos, then send the landlord the report.</p>
          : list.map(i => {
            const c = chip(i.overall); const isOpen = openId === i.id
            return (
              <div key={i.id} className={`rounded-xl border bg-white ${isOpen ? 'border-neutral-900' : 'border-neutral-200'}`}>
                <button onClick={() => open(isOpen ? null : i)} className="flex w-full flex-wrap items-center gap-sm p-md text-left">
                  <span className="font-semibold text-neutral-900">{longDate(i.inspected_on)}</span>
                  <span className="text-sm text-neutral-500">{KINDS.find(k => k[0] === i.kind)?.[1]}</span>
                  {c && <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${c[2]}`}>{c[1]}</span>}
                  <span className="ml-auto text-xs text-neutral-500">{i.status === 'sent' ? `Sent ${i.sent_at ? new Date(i.sent_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}${i.viewed_at ? ' · opened' : ' · not opened yet'}` : 'Draft'}</span>
                </button>
                {isOpen && draft && (
                  <div className="flex flex-col gap-md border-t border-neutral-100 p-md">
                    <div className="grid gap-sm sm:grid-cols-3">
                      <label className="text-xs font-semibold text-neutral-600">Date<input type="date" value={draft.inspected_on} onChange={e => edit({ inspected_on: e.target.value })} className={`${input} mt-xs`} /></label>
                      <label className="text-xs font-semibold text-neutral-600">Type<select value={draft.kind} onChange={e => edit({ kind: e.target.value })} className={`${input} mt-xs`}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                      <label className="text-xs font-semibold text-neutral-600">Inspected by<input value={draft.inspected_by ?? ''} onChange={e => edit({ inspected_by: e.target.value })} className={`${input} mt-xs`} /></label>
                    </div>

                    <div className="flex flex-col gap-sm">
                      {draft.areas.map((a, i) => (
                        <div key={i} className="rounded-lg bg-neutral-50 p-sm">
                          <div className="flex flex-wrap items-center gap-sm">
                            <input value={a.name} onChange={e => editArea(i, { name: e.target.value })} className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-xs py-xs text-sm font-semibold text-neutral-900 hover:border-neutral-300 focus:border-neutral-400" aria-label="Area name" />
                            <div className="flex gap-xs" role="radiogroup" aria-label={`${a.name} condition`}>
                              {CONDS.map(([k, l, on]) => (
                                <button key={k} role="radio" aria-checked={a.condition === k} onClick={() => editArea(i, { condition: a.condition === k ? null : k })} className={`rounded-md px-sm py-xs text-xs font-bold ${a.condition === k ? on : 'border border-neutral-300 bg-white text-neutral-700'}`}>{l}</button>
                              ))}
                            </div>
                          </div>
                          <textarea value={a.note} onChange={e => editArea(i, { note: e.target.value })} rows={2} placeholder="What you saw (optional)" className={`${input} mt-sm`} />
                          <div className="mt-sm flex flex-wrap items-center gap-xs">
                            {a.photos.map(p => (
                              <span key={p} className="relative">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                {links[p] ? <img src={links[p]} alt="" className="h-16 w-16 rounded-md object-cover" /> : <span className="block h-16 w-16 rounded-md bg-neutral-200" />}
                                <button onClick={() => editArea(i, { photos: a.photos.filter(x => x !== p) })} className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-neutral-900 text-[11px] leading-5 text-white" aria-label="Remove photo">×</button>
                              </span>
                            ))}
                            <label className={`flex h-16 w-16 cursor-pointer items-center justify-center rounded-md border border-dashed border-neutral-400 text-center text-[11px] font-semibold text-neutral-600 ${busy === 'photo' + i ? 'opacity-50' : ''}`}>
                              {busy === 'photo' + i ? 'Adding…' : '+ Photo'}
                              <input type="file" accept="image/*" multiple className="sr-only" disabled={!!busy} onChange={e => { addPhotos(i, e.target.files); e.target.value = '' }} />
                            </label>
                            <button onClick={() => { if (window.confirm(`Remove “${a.name}” from this inspection?`)) setDraft(d => { setDirty(true); return d ? { ...d, areas: d.areas.filter((_, j) => j !== i) } : d }) }} className="ml-auto text-xs font-semibold text-neutral-400 hover:text-red-700">Remove area</button>
                          </div>
                        </div>
                      ))}
                      <button onClick={() => setDraft(d => { setDirty(true); return d ? { ...d, areas: [...d.areas, { name: 'Room', condition: null, note: '', photos: [] }] } : d })} className="self-start rounded-lg border border-neutral-300 px-md py-xs text-xs font-bold text-neutral-800">+ Add an area</button>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-neutral-600">Overall</p>
                      <div className="mt-xs flex gap-xs">{CONDS.map(([k, l, on]) => <button key={k} onClick={() => edit({ overall: k })} className={`rounded-md px-md py-sm text-xs font-bold ${draft.overall === k ? on : 'border border-neutral-300 bg-white text-neutral-700'}`}>{l}</button>)}</div>
                    </div>
                    <label className="text-xs font-semibold text-neutral-600">Summary for the landlord<textarea value={draft.summary ?? ''} onChange={e => edit({ summary: e.target.value })} rows={3} placeholder="The house is clean and well kept. We’ve booked the bathroom extractor fan to be replaced." className={`${input} mt-xs`} /></label>

                    <div className="flex flex-wrap items-center gap-sm">
                      <button onClick={send} disabled={!!busy || !emails.length} className="rounded-lg bg-neutral-900 px-md py-sm text-xs font-bold text-white disabled:opacity-40">{busy === 'send' ? 'Sending…' : draft.status === 'sent' ? 'Send again' : 'Send to landlord'}</button>
                      <button onClick={saveNow} disabled={!!busy || !dirty} className="rounded-lg border border-neutral-300 px-md py-sm text-xs font-bold text-neutral-800 disabled:opacity-40">{busy === 'save' ? 'Saving…' : dirty ? 'Save' : 'Saved'}</button>
                      {draft.status === 'sent' && draft.token && <a href={`/inspection/${draft.token}`} target="_blank" rel="noreferrer" className="text-xs font-bold text-neutral-700 underline">See what the landlord sees</a>}
                      {draft.status === 'draft' && <button onClick={remove} disabled={!!busy} className="ml-auto text-xs font-semibold text-neutral-400 hover:text-red-700">Delete draft</button>}
                    </div>
                    {draft.status === 'sent' && <p className="text-[11px] text-neutral-500">Sent to {(draft.sent_to ?? []).join(' and ')}{draft.viewed_at ? ` · opened ${longDate(draft.viewed_at)}` : ''}. Changes you save show on their link straight away.</p>}
                  </div>
                )}
              </div>
            )
          })}
      </section>
    </div>
  )
}
