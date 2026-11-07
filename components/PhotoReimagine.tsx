'use client'

// Reimagine a room photo (7 Nov 2026, Harry: "dress bedrooms for just general marketing photo improvement … a reimagine
// button to help us redesign and then use that to make new proposals to landlord or just simple room refresh photo").
// Two kinds: Dress for photos (same room, loose items styled — bedding, lamp, plant, no clutter) or Redesign (new decor,
// no building work). Three looks each (lib/house/redesign). Any look can be added to the room's photos (captioned), and
// the looks are kept as a note under Notes → Improvements, ready to send to the landlord as a proposal.
import { useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

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

type Look = { style: string; brief: string; items: string[]; cost: string; url: string | null }

export default function PhotoReimagine({ url, propertyId, roomId, onClose, onSaved }: { url: string; propertyId: string; roomId: string; onClose: () => void; onSaved: (photo: { id: string; file_url: string; file_path: string }) => void }) {
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [made, setMade] = useState<{ id: string; mode: 'dress' | 'redesign'; looks: Look[] } | null>(null)
  const [saved, setSaved] = useState<number[]>([])
  const post = (body: unknown) => adminFetch('/api/admin/improvements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => ({ ok: r.ok, j: await r.json().catch(() => ({})) }))

  async function go(mode: 'dress' | 'redesign') {
    setBusy(mode); setMsg('')
    let image: string
    try { image = await shrink(url) } catch (e: any) { setBusy(''); setMsg(e.message); return }
    const { ok, j } = await post({ action: 'reimagine-photo', propertyId, roomId, image, mode })
    setBusy('')
    if (!ok) { setMsg(j.error ?? 'Couldn’t make the looks'); return }
    setMade({ id: j.id, mode, looks: j.designs }); setSaved([])
  }
  async function keep(i: number) {
    if (!made) return
    setBusy(`s${i}`); setMsg('')
    const { ok, j } = await post({ action: 'save-photo', id: made.id, index: i })
    setBusy('')
    if (!ok) { setMsg(j.error ?? 'Couldn’t add it'); return }
    setSaved(x => [...x, i]); onSaved(j.photo)
  }

  const btn = 'rounded-lg px-md py-sm text-sm font-semibold transition disabled:opacity-50'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-md" onClick={() => !busy && onClose()}>
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-lg shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-sm">
          <h3 className="m-0 text-lg font-bold text-neutral-900">Reimagine this photo</h3>
          <button type="button" disabled={!!busy} className="text-sm text-neutral-500 hover:text-neutral-900" onClick={onClose}>Close</button>
        </div>
        {!made && (
          <div className="mt-md grid gap-md md:grid-cols-[1fr_1.2fr]">
            <img src={url} alt="" className="aspect-[4/3] w-full rounded-lg object-cover" />
            <div className="space-y-sm">
              <button type="button" disabled={!!busy} onClick={() => go('dress')} className="block w-full rounded-lg border border-neutral-300 p-md text-left hover:border-neutral-900 disabled:opacity-50">
                <span className="block font-semibold text-neutral-900">{busy === 'dress' ? 'Styling three looks… (a minute or two)' : 'Dress for photos'}</span>
                <span className="block text-sm text-neutral-600">The same room, styled for the advert — bedding made up, lamp on, a plant and prints, clutter gone. Walls, floor and furniture stay as they are.</span>
              </button>
              <button type="button" disabled={!!busy} onClick={() => go('redesign')} className="block w-full rounded-lg border border-neutral-300 p-md text-left hover:border-neutral-900 disabled:opacity-50">
                <span className="block font-semibold text-neutral-900">{busy === 'redesign' ? 'Imagining three looks… (a minute or two)' : 'Redesign'}</span>
                <span className="block text-sm text-neutral-600">New decor with no building work — paint, flooring, furniture and lighting — with rough costs, to propose to the landlord.</span>
              </button>
            </div>
          </div>
        )}
        {made && (
          <>
            <div className="mt-md grid gap-md sm:grid-cols-3">
              {made.looks.map((g, i) => (
                <figure key={i} className="m-0 flex flex-col overflow-hidden rounded-lg border border-neutral-200">
                  {g.url && <a href={g.url} target="_blank" rel="noreferrer"><img src={g.url} alt={g.style} className="aspect-[4/3] w-full object-cover" /></a>}
                  <figcaption className="flex flex-1 flex-col gap-1 p-sm text-xs">
                    <span className="text-sm font-semibold text-neutral-900">{g.style}</span>
                    <span className="text-neutral-600">{g.brief}</span>
                    <span className="text-neutral-500">{g.items.join(' · ')}</span>
                    <span className="font-semibold">Roughly {g.cost}</span>
                    <button type="button" disabled={!!busy || saved.includes(i)} onClick={() => keep(i)} className={`${btn} mt-auto border border-neutral-300 text-neutral-900 hover:bg-neutral-50`}>{saved.includes(i) ? 'Added to the room’s photos ✓' : busy === `s${i}` ? 'Adding…' : 'Add to the room’s photos'}</button>
                  </figcaption>
                </figure>
              ))}
            </div>
            <p className="mt-md text-sm text-neutral-600">
              {made.mode === 'dress' ? 'Added photos are captioned “Styled for photos”. Before using them in an advert, make sure the room really is set up the same way when people view it.' : 'Added photos are captioned as an illustration — don’t advertise a redesign until the work is done.'}
              {' '}These looks are also kept on the room’s <strong>Notes → Improvements</strong>, where you can tick them and press <strong>Send as a proposal</strong> to the landlord.
            </p>
            <button type="button" disabled={!!busy} onClick={() => setMade(null)} className={`${btn} mt-sm border border-neutral-300 text-neutral-900 hover:bg-neutral-50`}>Try the other kind</button>
          </>
        )}
        {msg && <p className="mt-sm text-sm text-red-700">{msg}</p>}
      </div>
    </div>
  )
}
