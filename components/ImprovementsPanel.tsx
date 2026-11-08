'use client'

// Improvements (6 Nov 2026 — migration 272, lib/house/improvements, lib/house/redesign): the things noted that could be
// better, for one room (room page) or the whole house with every room's (property page). Tick some and have them written
// up for the landlord or as a quote request; add a photo of a space to see three redecoration ideas of it.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { adminFetch } from '@/lib/adminFetch'

const STATUS: Record<string, [string, string]> = {
  noted: ['Noted', 'bg-neutral-100 text-neutral-700'], sent_to_landlord: ['Sent to landlord', 'bg-blue-50 text-blue-800'], approved: ['Approved', 'bg-emerald-50 text-emerald-800'],
  quoting: ['Getting quotes', 'bg-amber-50 text-amber-900'], done: ['Done', 'bg-emerald-100 text-emerald-900'], dismissed: ['Not doing', 'bg-neutral-100 text-neutral-400'],
}
async function shrink(file: File | string): Promise<string> {
  // a File (uploaded now) or the link of a photo already saved on the house/room
  const url = typeof file === 'string' ? file : URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => rej(new Error('That photo couldn’t be opened — try uploading it instead')); i.src = url })
    const scale = Math.min(1, 1536 / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.88).split(',')[1]
  } finally { if (typeof file !== 'string') URL.revokeObjectURL(url) }
}

export default function ImprovementsPanel({ propertyId, roomId }: { propertyId: string; roomId?: string }) {
  const [d, setD] = useState<{ ready: boolean; redesign: boolean; items: any[]; photos?: { id: string; room_id: string | null; room: string | null; caption: string | null; url: string }[] } | null>(null)
  const [picking, setPicking] = useState<any | null>(null)   // the note whose photo is being chosen
  const [ticked, setTicked] = useState<string[]>([])
  const [draft, setDraft] = useState<{ to: 'landlord' | 'contractor'; emails: string; subject: string; message: string } | null>(null)
  const [busy, setBusy] = useState('')
  const [prop, setProp] = useState<{ propertyId: string; emails: string; intro: string; costs: Record<string, string> } | null>(null)
  const [msg, setMsg] = useState('')
  const q = `propertyId=${propertyId}${roomId ? `&roomId=${roomId}` : ''}`
  const load = () => adminFetch(`/api/admin/improvements?${q}`).then(r => r.json()).then(setD).catch(() => {})
  useEffect(() => { load() }, [q])   // eslint-disable-line react-hooks/exhaustive-deps
  const post = (body: unknown) => adminFetch('/api/admin/improvements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => ({ ok: r.ok, j: await r.json().catch(() => ({})) }))
  const patch = async (id: string, body: Record<string, unknown>) => { await adminFetch('/api/admin/improvements', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }) }); load() }

  async function write(to: 'landlord' | 'contractor') {
    setBusy(to); setMsg('')
    const { ok, j } = await post({ action: 'draft', ids: ticked, to })
    setBusy('')
    if (!ok) { setMsg(j.error ?? 'Couldn’t write it'); return }
    setDraft({ to, emails: to === 'landlord' ? j.landlordEmail ?? '' : '', subject: j.subject, message: j.message })
  }
  async function send() {
    if (!draft) return
    setBusy('send')
    const { ok, j } = await post({ action: 'send', ids: ticked, ...draft })
    setBusy('')
    if (!ok) { setMsg(j.error ?? 'It didn’t send'); return }
    setDraft(null); setTicked([]); setMsg(`Sent to ${j.sentTo.join(', ')}`); load()
  }
  async function startProposal() {
    setBusy('prop'); setMsg('')
    const { ok, j } = await post({ action: 'proposal_prep', ids: ticked })
    setBusy('')
    if (!ok) { setMsg(j.error ?? 'Couldn’t start it'); return }
    setProp({ propertyId: j.propertyId, emails: j.email, intro: j.intro, costs: {} })
  }
  async function sendProposal() {
    if (!prop) return
    setBusy('send')
    const { ok, j } = await post({ action: 'proposal', ids: ticked, ...prop })
    setBusy('')
    if (!ok) { setMsg(j.error ?? 'It didn’t send'); return }
    setProp(null); setTicked([]); setMsg(`Proposal sent with ${j.spaces} space${j.spaces === 1 ? '' : 's'} — you’ll get an email when the landlord answers.`); load()
  }
  async function reimagine(id: string, file: File | string | undefined) {
    if (!file) return
    setPicking(null); setBusy(`r-${id}`); setMsg('')
    let image: string
    try { image = await shrink(file) } catch (e: any) { setBusy(''); setMsg(e.message); return }
    const { ok, j } = await post({ action: 'redesign', id, image })
    setBusy('')
    if (!ok) { setMsg(j.error ?? 'Couldn’t make the redesigns'); return }
    load()
  }

  if (!d) return <p className="text-sm text-neutral-400">Loading…</p>
  if (!d.ready) return <p className="text-sm text-amber-800">Run migration 272 in Supabase to record improvements.</p>
  const live = d.items.filter(i => i.status !== 'dismissed' && i.status !== 'done')
  return (
    <div className="space-y-sm">
      {picking && (() => {
        const all = d.photos ?? []
        // this room's photos first, then shared areas, then the rest of the house
        const order = (p: any) => picking.room_id ? (p.room_id === picking.room_id ? 0 : p.room_id ? 2 : 1) : (p.room_id ? 1 : 0)
        const list = [...all].sort((a, b) => order(a) - order(b))
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-md" onClick={() => setPicking(null)}>
            <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-lg shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-sm">
                <div><h3 className="m-0 text-lg font-bold text-neutral-900">Choose a photo to reimagine</h3>
                  <p className="m-0 mt-1 text-sm text-neutral-600">{picking.room_id ? picking.rooms?.name : picking.area} — {picking.note}</p></div>
                <button type="button" className="text-sm text-neutral-500 hover:text-neutral-900" onClick={() => setPicking(null)}>Cancel</button>
              </div>
              {list.length ? <div className="mt-md grid grid-cols-2 gap-sm sm:grid-cols-3">
                {list.map(p => (
                  <button key={p.id} type="button" onClick={() => reimagine(picking.id, p.url)} className="overflow-hidden rounded-lg border border-neutral-200 text-left hover:border-neutral-900">
                    <img src={p.url} alt={p.caption ?? ''} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                    <span className="block truncate px-sm py-1 text-xs text-neutral-600">{p.room ?? 'Shared areas'}{p.caption ? ` · ${p.caption}` : ''}</span>
                  </button>
                ))}
              </div> : <p className="mt-md text-sm text-neutral-500">No photos saved on this house yet.</p>}
              <label className="mt-md inline-block cursor-pointer rounded-lg border border-neutral-300 px-md py-sm text-sm font-semibold text-neutral-900 hover:bg-neutral-50">Upload a new photo instead
                <input type="file" accept="image/*" className="hidden" onChange={e => { reimagine(picking.id, e.target.files?.[0]); e.target.value = '' }} /></label>
            </div>
          </div>
        )
      })()}
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <p className="text-sm text-neutral-600">{roomId ? 'Things noted in this room that could be better.' : 'Things noted around the house and in each room that could be better.'} Add them on a <Link href={`/admin/walkthrough?propertyId=${propertyId}`} className="font-semibold text-blue-700 hover:underline">walk round</Link>.</p>
        <span className="flex flex-wrap gap-xs">
          <button type="button" disabled={!ticked.length || !!busy} onClick={() => write('landlord')} className="rounded-lg border border-neutral-300 px-md py-xs text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-40">{busy === 'landlord' ? 'Writing…' : `Write to the landlord${ticked.length ? ` (${ticked.length})` : ''}`}</button>
          <button type="button" disabled={!ticked.length || !!busy || !d?.items.some(i => ticked.includes(i.id) && i.designs?.length)} onClick={startProposal} title="Ticked notes with redesigns, as a page the landlord can choose from" className="rounded-lg bg-neutral-900 px-md py-xs text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-40">{busy === 'prop' ? 'Preparing…' : 'Send as a proposal'}</button>
          <button type="button" disabled={!ticked.length || !!busy} onClick={() => write('contractor')} className="rounded-lg border border-neutral-300 px-md py-xs text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-40">{busy === 'contractor' ? 'Writing…' : 'Ask a contractor to quote'}</button>
        </span>
      </div>
      {msg && <p className="rounded-lg bg-neutral-50 px-md py-xs text-sm text-neutral-800">{msg}</p>}
      {!d.items.length ? <p className="text-sm text-neutral-500">Nothing noted yet.</p> : (
        <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
          {[...live, ...d.items.filter(i => !live.includes(i))].map(i => { const ans = [...(i.sent_log ?? [])].reverse().find((e: any) => e.kind === 'answer'); return (
            <li key={i.id} className={`space-y-xs px-md py-sm text-sm ${i.status === 'dismissed' ? 'opacity-50' : ''}`}>
              <div className="flex flex-wrap items-start gap-sm">
                <input type="checkbox" className="mt-1" checked={ticked.includes(i.id)} onChange={() => setTicked(t => t.includes(i.id) ? t.filter(x => x !== i.id) : [...t, i.id])} />
                <span className="min-w-[200px] flex-1"><span className="font-semibold text-neutral-900">{i.room_id ? i.rooms?.name : i.area}</span>{i.rooms?.room_size ? <span className="text-xs text-neutral-500"> · {i.rooms.room_size} m²</span> : null} — {i.note}
                  <span className="block text-xs text-neutral-500">{new Date(i.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}{i.sent_log?.filter((e: any) => e.kind !== 'answer').length ? ` · sent ${i.sent_log.filter((e: any) => e.kind !== 'answer').length}×` : ''}</span></span>
                <select value={i.status} onChange={e => patch(i.id, { status: e.target.value })} className={`rounded-full px-sm py-0.5 text-xs font-semibold ${STATUS[i.status]?.[1] ?? ''}`}>{Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
                {d.redesign && <button type="button" disabled={!!busy} onClick={() => setPicking(i)} className="text-xs font-semibold text-blue-700 hover:underline disabled:text-neutral-400">{busy === `r-${i.id}` ? 'Imagining three looks… (a minute or two)' : 'Reimagine from a photo'}</button>}
              </div>
              {ans && <p className="ml-lg rounded-lg bg-emerald-50 px-sm py-xs text-xs text-emerald-900">
                <strong>Landlord’s answer</strong> ({new Date(ans.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}): {ans.style ? `likes “${ans.style}”` : ans.choice === 'none' ? 'not this one' : 'no choice made'}
                {ans.note ? ` — “${ans.note}”` : ''}{ans.budget ? ` · spending ceiling ${ans.budget}` : ''}{ans.comments ? ` · “${ans.comments}”` : ''}</p>}
              {i.designs?.length > 0 && <div className="grid gap-sm pl-lg sm:grid-cols-3">
                {i.designs.map((g: any, k: number) => (
                  <figure key={k} className={`m-0 overflow-hidden rounded-lg border ${ans?.choice === k ? 'border-emerald-500 ring-2 ring-emerald-400' : 'border-neutral-200'}`}>
                    {g.url && <a href={g.url} target="_blank" rel="noreferrer"><img src={g.url} alt={g.style} className="aspect-[4/3] w-full object-cover" /></a>}
                    <figcaption className="space-y-0.5 p-sm text-xs"><span className="font-semibold">{g.style}</span> · {g.cost}<span className="block text-neutral-600">{g.brief}</span></figcaption>
                  </figure>
                ))}
              </div>}
            </li>
          ) })}
        </ul>
      )}
      {!d.redesign && <p className="text-xs text-neutral-500">Redesign images appear once the OpenAI key is added in Vercel (OPENAI_API_KEY).</p>}

      {prop && d && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center md:p-lg" onClick={() => setProp(null)}>
          <div className="max-h-[92dvh] w-full max-w-2xl space-y-sm overflow-y-auto rounded-t-2xl bg-white p-lg shadow-xl md:rounded-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-neutral-900">Proposal for the landlord</h3>
            <p className="text-xs text-neutral-500">They get an email with a private page (30 days) to look through each space’s designs, choose favourites, and tell you their spending ceiling.</p>
            <input className="w-full rounded-lg border border-neutral-300 px-sm py-xs text-sm" placeholder="landlord@example.com" value={prop.emails} onChange={e => setProp({ ...prop, emails: e.target.value })} />
            <textarea rows={5} className="w-full rounded-lg border border-neutral-300 px-sm py-xs text-sm" value={prop.intro} onChange={e => setProp({ ...prop, intro: e.target.value })} />
            <p className="text-xs font-semibold text-neutral-700">Spaces included — add your own rough cost if you have one (optional)</p>
            {d.items.filter(i => ticked.includes(i.id) && i.designs?.length).map(i => (
              <label key={i.id} className="flex items-center justify-between gap-sm text-sm"><span>{i.room_id ? i.rooms?.name : i.area} · {i.designs.length} designs</span>
                <input className="w-40 rounded-lg border border-neutral-300 px-sm py-xs text-sm" placeholder="e.g. £800–£1,200" value={prop.costs[i.id] ?? ''} onChange={e => setProp({ ...prop, costs: { ...prop.costs, [i.id]: e.target.value } })} /></label>
            ))}
            {d.items.some(i => ticked.includes(i.id) && !i.designs?.length) && <p className="text-xs text-amber-800">Ticked notes without redesigns are left out of the proposal.</p>}
            <div className="flex gap-sm pt-xs"><button type="button" disabled={busy === 'send' || !prop.emails.trim()} onClick={sendProposal} className="rounded-lg bg-neutral-900 px-lg py-sm text-sm font-bold text-white disabled:opacity-40">{busy === 'send' ? 'Sending…' : 'Send the proposal'}</button>
              <button type="button" onClick={() => setProp(null)} className="text-sm font-semibold text-neutral-600 underline">Cancel</button></div>
          </div>
        </div>
      )}
      {draft && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center md:p-lg" onClick={() => setDraft(null)}>
          <div className="w-full max-w-2xl space-y-sm rounded-t-2xl bg-white p-lg shadow-xl md:rounded-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-neutral-900">{draft.to === 'landlord' ? 'To the landlord' : 'Quote request'}</h3>
            <input className="w-full rounded-lg border border-neutral-300 px-sm py-xs text-sm" placeholder={draft.to === 'landlord' ? 'landlord@example.com' : 'contractor@example.com'} value={draft.emails} onChange={e => setDraft({ ...draft, emails: e.target.value })} />
            <input className="w-full rounded-lg border border-neutral-300 px-sm py-xs text-sm" value={draft.subject} onChange={e => setDraft({ ...draft, subject: e.target.value })} />
            <textarea rows={14} className="w-full rounded-lg border border-neutral-300 px-sm py-xs text-sm leading-relaxed" value={draft.message} onChange={e => setDraft({ ...draft, message: e.target.value })} />
            <div className="flex gap-sm"><button type="button" disabled={busy === 'send' || !draft.emails.trim()} onClick={send} className="rounded-lg bg-neutral-900 px-lg py-sm text-sm font-bold text-white disabled:opacity-40">{busy === 'send' ? 'Sending…' : 'Send'}</button>
              <button type="button" onClick={() => setDraft(null)} className="text-sm font-semibold text-neutral-600 underline">Cancel</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
