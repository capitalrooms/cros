'use client'
// Update let-only houses from the landlord's own list (12 Oct 2026): paste the email or add a screenshot → CROS reads
// each row (house code, room, move-in, rent, bathroom, shared space, who lives there) → check → save. Houses not in
// CROS yet are added first with the let-only window (address suggested from the code where it can be).
// Who lives there is kept for reference only (let_only_occupants) — never a tenancy, never charged rent.
import { useState } from 'react'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import AddLetOnlyModal from '@/app/components/AddLetOnlyModal'
import { adminFetch } from '@/lib/adminFetch'

type Row = { house_code: string; room: string; move_in: string | null; persons_in_house: number | null; bathroom: string | null; shared_space: string | null
  rent: number | null; tenant_name: string | null; tenant_phone: string | null; note: string | null; roomId: string | null; roomName: string }
type Group = { code: string; property: { id: string; name: string } | null; suggestion: { address: string; postcode: string | null } | null; rows: Row[] }

const ukDate = (d: string | null) => d ? d.split('-').reverse().join('/') : '—'
const gbp = (n: number | null) => n == null ? '—' : `£${n.toLocaleString('en-GB', { maximumFractionDigits: 2 })}`

export default function RoomListPage() {
  const [text, setText] = useState('')
  const [image, setImage] = useState<{ mime: string; base64: string; url: string; name: string } | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [groups, setGroups] = useState<Group[] | null>(null)
  const [skip, setSkip] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState<Group | null>(null)
  const [saved, setSaved] = useState<{ property: string; changes: string[] }[] | null>(null)

  async function post(body: unknown) {
    const r = await adminFetch('/api/admin/let-only/room-list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.error || 'Something went wrong')
    return d
  }

  function pickImage(f: File | undefined) {
    setError('')
    if (!f) return
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(f.type)) { setError('Use a PNG or JPEG screenshot (on iPhone, a screenshot is a PNG).'); return }
    if (f.size > 5_000_000) { setError('That image is over 5 MB — a screenshot of just the table works best.'); return }
    const reader = new FileReader()
    reader.onload = () => { const url = String(reader.result); setImage({ mime: f.type, base64: url.split(',')[1] ?? '', url, name: f.name }) }
    reader.readAsDataURL(f)
  }

  async function read() {
    setBusy('read'); setError(''); setSaved(null)
    try { const d = await post({ action: 'read', text, image: image ? { mime: image.mime, base64: image.base64 } : undefined }); setGroups(d.groups); setSkip(new Set()) }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed') }
    setBusy('')
  }

  // after a house is added, match every row again so it picks the new house (and its rooms) up
  async function rematch() {
    if (!groups) return
    const rows = groups.flatMap(g => g.rows.map(({ roomId, roomName, ...r }) => r))
    try { const d = await post({ action: 'resolve', rows }); setGroups(d.groups) } catch (e) { setError(e instanceof Error ? e.message : 'Failed') }
  }

  async function save() {
    if (!groups) return
    const ready = groups.filter(g => g.property && !skip.has(g.code))
    if (!ready.length) return
    setBusy('save'); setError('')
    try {
      const d = await post({ action: 'apply', groups: ready.map(g => ({ propertyId: g.property!.id, rows: g.rows.map(({ roomId, roomName, ...r }) => r) })) })
      setSaved(d.saved); setGroups(null); setText(''); setImage(null)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed') }
    setBusy('')
  }

  const ready = (groups ?? []).filter(g => g.property && !skip.has(g.code))
  const missing = (groups ?? []).filter(g => !g.property)

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/let-only-properties" />} title="Landlord’s room list" />
      <PageHero title="Update from the landlord’s list" subtitle="Paste their email or add a screenshot — CROS fills in each house’s rooms, rents and who lives there" />
      <div className="mx-auto max-w-6xl px-lg py-xl space-y-lg">
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-md text-sm text-red-800">{error}</div>}

        {saved && (
          <div className="rounded-2xl border border-green-200 bg-green-50 p-lg text-sm text-green-900 space-y-sm">
            <p className="font-semibold">Saved. Each house now shows who lives there on the Let-only page.</p>
            {saved.map(x => <p key={x.property}><strong>{x.property}:</strong> {x.changes.length ? x.changes.join(' · ') : 'no changes'}</p>)}
          </div>
        )}

        {!groups && (
          <section className="rounded-2xl border border-neutral-200 bg-white p-lg space-y-md">
            <label className="block text-sm font-semibold text-neutral-800">Paste the landlord’s email
              <textarea value={text} onChange={e => setText(e.target.value)} rows={8} placeholder={'e.g.\n1  by 30/09/2026  9rc  4  4 persons  ensuite, part river view  kitchen with dining table etc  1,400.00  Sam Tomlin 07444 …'}
                className="mt-xs w-full rounded-xl border border-neutral-300 bg-white px-md py-sm font-mono text-xs text-neutral-900" />
            </label>
            <div className="flex flex-wrap items-center gap-md">
              <label className="cursor-pointer rounded-xl border border-neutral-300 px-md py-sm text-sm font-semibold text-neutral-800 hover:bg-neutral-50">
                {image ? 'Change screenshot' : 'Or add a screenshot'}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={e => pickImage(e.target.files?.[0])} />
              </label>
              {image && <span className="flex items-center gap-sm text-xs text-neutral-600">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt="" className="h-10 w-16 rounded border border-neutral-200 object-cover" />{image.name}
                <button type="button" onClick={() => setImage(null)} className="text-neutral-400 hover:text-neutral-700">✕</button>
              </span>}
              <button type="button" onClick={read} disabled={!!busy || (!text.trim() && !image)} className="ml-auto rounded-xl bg-neutral-900 px-lg py-sm text-sm font-bold text-white disabled:opacity-40">
                {busy === 'read' ? 'Reading the list…' : 'Read the list'}
              </button>
            </div>
            <p className="text-xs text-neutral-500">Nothing is saved until you check it and press Save. Tenants listed here are kept for reference — they aren’t tenancies, so no rent is charged or collected.</p>
          </section>
        )}

        {groups && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-md rounded-2xl border border-neutral-200 bg-white px-lg py-md">
              <p className="text-sm text-neutral-700">
                Read <strong>{groups.reduce((n, g) => n + g.rows.length, 0)} rooms</strong> in <strong>{groups.length} houses</strong>.
                {missing.length > 0 && <> <span className="font-semibold text-amber-800">{missing.length} not in CROS yet</span> — add them below, or they’re left out.</>}
              </p>
              <span className="flex gap-sm">
                <button type="button" onClick={() => { setGroups(null); setError('') }} className="rounded-xl px-md py-sm text-sm text-neutral-600 hover:bg-neutral-100">Start again</button>
                <button type="button" onClick={save} disabled={!!busy || !ready.length} className="rounded-xl bg-neutral-900 px-lg py-sm text-sm font-bold text-white disabled:opacity-40">
                  {busy === 'save' ? 'Saving…' : `Save ${ready.length} house${ready.length === 1 ? '' : 's'} to CROS`}
                </button>
              </span>
            </div>

            {groups.map(g => (
              <section key={g.code} className={`overflow-hidden rounded-2xl border bg-white ${g.property ? 'border-neutral-200' : 'border-amber-300'}`}>
                <header className="flex flex-wrap items-center justify-between gap-sm border-b border-neutral-100 bg-neutral-50 px-lg py-sm">
                  <span className="text-sm">
                    <span className="mr-sm rounded-md bg-neutral-900 px-sm py-0.5 font-mono text-xs font-bold text-white">{g.code}</span>
                    {g.property ? <strong className="text-neutral-900">{g.property.name}</strong> : <span className="font-semibold text-amber-800">Not in CROS yet{g.suggestion ? ` — probably ${g.suggestion.address}` : ''}</span>}
                  </span>
                  {g.property ? (
                    <label className="flex items-center gap-xs text-xs text-neutral-600">
                      <input type="checkbox" checked={!skip.has(g.code)} onChange={e => setSkip(prev => { const n = new Set(prev); if (e.target.checked) n.delete(g.code); else n.add(g.code); return n })} /> Include
                    </label>
                  ) : (
                    <button type="button" onClick={() => setAdding(g)} className="rounded-lg bg-amber-600 px-md py-xs text-xs font-bold text-white hover:bg-amber-700">+ Add this house</button>
                  )}
                </header>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-[11px] uppercase tracking-wide text-neutral-500">
                      <tr><th className="px-lg py-xs">Room</th><th className="px-sm py-xs">Moves in</th><th className="px-sm py-xs text-right">Rent</th><th className="px-sm py-xs">Bathroom</th><th className="px-sm py-xs">Shared</th><th className="px-lg py-xs">Living there</th></tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {g.rows.map((r, i) => (
                        <tr key={i}>
                          <td className="px-lg py-xs font-semibold text-neutral-900 whitespace-nowrap">{r.roomName}{g.property && !r.roomId && <span className="ml-xs rounded-full bg-blue-50 px-xs text-[10px] font-semibold text-blue-700">new</span>}</td>
                          <td className="px-sm py-xs tabular-nums whitespace-nowrap">{ukDate(r.move_in)}</td>
                          <td className="px-sm py-xs text-right tabular-nums">{gbp(r.rent)}</td>
                          <td className="px-sm py-xs text-neutral-600">{r.bathroom ?? '—'}</td>
                          <td className="px-sm py-xs text-neutral-600">{r.shared_space ?? '—'}</td>
                          <td className="px-lg py-xs">{r.tenant_name ? <><span className="font-semibold text-neutral-900">{r.tenant_name}</span>{r.tenant_phone && <span className="ml-sm tabular-nums text-neutral-500">{r.tenant_phone}</span>}</> : <span className="italic text-neutral-500">{r.note || 'Nobody listed'}</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </>
        )}
      </div>

      {adding && (
        <AddLetOnlyModal
          initialAddress={adding.suggestion?.address ?? ''}
          initialPostcode={adding.suggestion?.postcode ?? ''}
          onClose={() => setAdding(null)}
          onSave={async () => { setAdding(null); await rematch() }}
        />
      )}
    </div>
  )
}
