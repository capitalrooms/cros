'use client'

// Capture — photos and paperwork from your phone, filed in a couple of taps (migration 204).
// Take a photo or pick from the camera roll (or share to the "Send to CROS" iPhone shortcut); a quick look suggests
// what it is and which property; you confirm and it's filed: room / property photos, letters and post, bills,
// certificates (through the AI Doc Scanner), handwritten smoke-alarm / fire-door sheets (each line becomes a check,
// the photo kept as proof), or company post. Data: /api/admin/capture.

import { use, useCallback, useEffect, useRef, useState } from 'react'
import AppBar from '@/components/AppBar'
import PageHero, { HeroButton } from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import { adminFetch } from '@/lib/adminFetch'
import { createClient } from '@/lib/supabase'
import { one, type PageSearchParams } from '@/lib/pageSearchParams'

type Tab = 'inbox' | 'company' | 'iphone'
const card = 'rounded-2xl border border-neutral-200 bg-white'
const input = 'w-full rounded-lg border border-neutral-300 bg-white px-sm py-xs text-sm text-neutral-900'
const btn = 'rounded-lg border border-neutral-300 px-md py-xs text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-40'
const btnDark = 'rounded-lg bg-neutral-900 px-md py-xs text-sm font-bold text-white hover:bg-neutral-700 disabled:opacity-40'
const SITE = typeof window !== 'undefined' ? window.location.origin : 'https://cros-sigma.vercel.app'

/** A small JPEG of a photo for the quick look (cheaper and faster than the original). */
async function thumbnail(file: File, max = 900): Promise<string | null> {
  if (!file.type.startsWith('image/')) return null
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.72)
  } catch { return null }
}

export default function CapturePage({ searchParams }: { searchParams: PageSearchParams }) {
  const sp = use(searchParams)
  const t = one(sp.tab) as Tab
  return <Capture initialTab={['inbox', 'company', 'iphone'].includes(t) ? t : 'inbox'} />
}

function Capture({ initialTab }: { initialTab: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [data, setData] = useState<any>(null)
  const [err, setErr] = useState('')
  const [uploading, setUploading] = useState<string[]>([])
  const camRef = useRef<HTMLInputElement>(null)
  const pickRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const r = await adminFetch('/api/admin/capture')
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(d.error ?? 'Could not load'); return }
    setData(d)
  }, [])
  useEffect(() => { load() }, [load])

  async function addFiles(list: FileList | null) {
    const files = Array.from(list ?? [])
    if (!files.length) return
    setErr('')
    for (const f of files) {
      setUploading(u => [...u, f.name])
      try {
        const r = await adminFetch('/api/admin/capture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'upload_url', fileName: f.name || 'photo.jpg', mime: f.type, size: f.size }) })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error ?? 'Could not upload')
        const { error } = await createClient().storage.from('capture').uploadToSignedUrl(d.path, d.token, f, { contentType: f.type || undefined })
        if (error) throw new Error(error.message)
        const thumb = await thumbnail(f)
        await adminFetch('/api/admin/capture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'look', id: d.itemId, thumb }) })
      } catch (e) { setErr(`${f.name}: ${e instanceof Error ? e.message : 'upload failed'}`) }
      finally { setUploading(u => u.filter(n => n !== f.name)) }
      await load()
    }
  }

  const items: any[] = data?.items ?? []
  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin" />} title="Capture" />
      <PageHero
        eyebrow="Documents"
        title="Capture"
        subtitle="Photos and paperwork from your phone: take a photo or pick from your camera roll, check what CROS thinks it is, and file it."
        stats={[{ label: 'To file', value: items.length, tone: items.length ? 'warn' : undefined }, { label: 'Company post', value: (data?.company ?? []).length }]}
        actions={<>
          <HeroButton primary onClick={() => camRef.current?.click()}>📷 Take a photo</HeroButton>
          <HeroButton onClick={() => pickRef.current?.click()}>Choose photos or files</HeroButton>
        </>}
        tabs={([['inbox', `To file${items.length ? ` · ${items.length}` : ''}`], ['company', 'Company post'], ['iphone', 'Share from iPhone']] as [Tab, string][]).map(([k, l]) => ({ key: k, label: l, active: tab === k, onClick: () => setTab(k) }))}
      />
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
      <input ref={pickRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = '' }} />

      <div className="mx-auto max-w-6xl px-lg py-xl space-y-md">
        {err && <p className="rounded-xl border border-red-200 bg-red-50 px-lg py-sm text-sm text-red-800">{err}</p>}
        {data?.setupNeeded && <p className="rounded-xl border border-amber-200 bg-amber-50 px-lg py-sm text-sm text-amber-900">Run migration 204 in Supabase to switch Capture on.</p>}
        {uploading.length > 0 && <p className="rounded-xl bg-white px-lg py-sm text-sm text-neutral-600">Uploading and taking a quick look: {uploading.join(', ')}…</p>}
        {!data && !err && <p className="text-sm text-neutral-500">Loading…</p>}

        {data && tab === 'inbox' && (
          items.length ? items.map(it => <Item key={it.id} it={it} data={data} reload={load} />) : (
            <div className={`${card} p-xl text-center`}>
              <p className="text-sm text-neutral-600">Nothing waiting. Take a photo of a letter, a room or a safety-check sheet — or share one from your camera roll.</p>
              <div className="mt-md flex justify-center gap-sm"><button type="button" className={btnDark} onClick={() => camRef.current?.click()}>📷 Take a photo</button><button type="button" className={btn} onClick={() => pickRef.current?.click()}>Choose files</button></div>
            </div>
          )
        )}
        {data && tab === 'inbox' && (data.recent ?? []).length > 0 && (
          <section className={card}>
            <h3 className="border-b border-neutral-100 px-lg py-sm text-xs font-bold uppercase tracking-wider text-neutral-500">Recently filed</h3>
            <ul className="divide-y divide-neutral-100 text-sm">
              {data.recent.map((r: any) => <li key={r.id} className="flex justify-between gap-sm px-lg py-xs"><span className="truncate">{r.name} <span className="text-neutral-500">· {r.kind}{r.property ? ` · ${r.property}` : ''}</span></span><span className="shrink-0 text-xs text-neutral-400">{new Date(r.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></li>)}
            </ul>
          </section>
        )}

        {data && tab === 'company' && (
          <section className={card}>
            {(data.company ?? []).length ? (
              <ul className="divide-y divide-neutral-100 text-sm">
                {data.company.map((c: any) => (
                  <li key={c.id} className="flex items-baseline justify-between gap-sm px-lg py-sm">
                    <span className="min-w-0"><span className="font-semibold text-neutral-900">{c.title}</span><span className="block text-xs text-neutral-500">{c.category} · received {new Date(`${c.received_on}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}{c.notes ? ` · ${c.notes}` : ''}</span></span>
                    {c.url && <a href={c.url} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-semibold text-blue-700 hover:underline">Open</a>}
                  </li>
                ))}
              </ul>
            ) : <p className="px-lg py-md text-sm text-neutral-500">No company post filed yet. Anything you capture that isn’t about one property can be filed here.</p>}
          </section>
        )}

        {data && tab === 'iphone' && <IphoneSetup keys={data.keys ?? []} reload={load} />}
      </div>
    </div>
  )
}

// ── one item waiting to be filed ─────────────────────────────────────────────

function Item({ it, data, reload }: { it: any; data: any; reload: () => Promise<void> }) {
  const g = it.guess ?? {}
  const kinds: Record<string, string> = data.kinds ?? {}
  const [kind, setKind] = useState<string>(g.kind ?? '')
  const [propertyId, setPropertyId] = useState<string>(g.propertyId ?? '')
  const roomsHere = (data.rooms ?? []).filter((r: any) => r.property_id === propertyId)
  const guessRoom = roomsHere.find((r: any) => g.room && r.name.toLowerCase() === String(g.room).toLowerCase())
  const [roomId, setRoomId] = useState<string>('')
  const [title, setTitle] = useState<string>(g.title ?? '')
  const [rows, setRows] = useState<any[] | null>(null)
  const [unreadable, setUnreadable] = useState('')
  const [bill, setBill] = useState<any>(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  useEffect(() => { if (guessRoom && !roomId) setRoomId(guessRoom.id) }, [guessRoom, roomId])
  const isImage = String(it.mime ?? '').startsWith('image/') || /\.(jpe?g|png|webp|gif|heic)$/i.test(it.file_name)

  async function post(body: Record<string, unknown>) {
    const r = await adminFetch('/api/admin/capture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: it.id, ...body }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.error ?? 'Something went wrong')
    return d
  }
  async function read(k: 'safety_sheet' | 'bill') {
    setBusy('read'); setMsg('')
    try {
      const d = await post({ action: 'read', kind: k })
      if (k === 'safety_sheet') { setRows(d.rows ?? []); setUnreadable(d.unreadable ?? '') } else setBill(d.bill)
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not read it') } finally { setBusy('') }
  }
  async function file() {
    setBusy('file'); setMsg('')
    try {
      const d = await post({ action: 'file', kind, propertyId: propertyId || null, roomId: roomId || null, title, rows, bill })
      setMsg(`✅ Filed: ${d.filedTo}`)
      setTimeout(reload, 1200)
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not file it') } finally { setBusy('') }
  }
  async function toScanner() {
    await post({ action: 'handed_to_scanner' })
    window.location.href = `/admin/ai-upload?capture=${it.id}`
  }

  const needsProperty = ['room_photo', 'property_photo', 'safety_sheet', 'certificate'].includes(kind)
  const canFile = kind && kind !== 'certificate' && (!needsProperty || propertyId) && (kind !== 'room_photo' || roomId) && (kind !== 'safety_sheet' || (rows && rows.length))
  return (
    <section className={`${card} p-md`}>
      <div className="grid gap-md sm:grid-cols-[160px_minmax(0,1fr)]">
        <a href={it.url ?? '#'} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl bg-neutral-100">
          {isImage && it.url ? <img src={it.url} alt="" className="h-40 w-full object-cover" /> : <div className="flex h-40 items-center justify-center text-3xl">📄</div>}
        </a>
        <div className="min-w-0 space-y-sm">
          <p className="text-xs text-neutral-500">{it.file_name} · {it.source === 'shortcut' ? 'shared from iPhone' : 'from your phone'} · {new Date(it.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
          {g.kind ? <p className="text-sm text-neutral-700">Looks like <strong>{kinds[g.kind] ?? g.kind}</strong>{g.title ? ` — ${g.title}` : ''}{g.reason ? <span className="text-neutral-500"> ({g.reason})</span> : null}</p> : <p className="text-sm text-neutral-500">Say what it is:</p>}
          <div className="flex flex-wrap gap-xs">
            {Object.entries(kinds).map(([k, l]) => (
              <button key={k} type="button" onClick={() => { setKind(k); setRows(null); setBill(null) }} className={`rounded-full border px-sm py-0.5 text-xs font-semibold ${kind === k ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 text-neutral-700'}`}>{l}</button>
            ))}
          </div>
          {kind && kind !== 'company_post' && (
            <div className="grid gap-sm sm:grid-cols-2">
              <select className={input} value={propertyId} onChange={e => { setPropertyId(e.target.value); setRoomId('') }}>
                <option value="">{needsProperty ? 'Which property?' : 'Which property? (none = company post)'}</option>
                {(data.properties ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}{p.letOnly ? ' (let only)' : ''}</option>)}
              </select>
              {kind === 'room_photo' && <select className={input} value={roomId} onChange={e => setRoomId(e.target.value)} disabled={!propertyId}>
                <option value="">Which room?</option>
                {roomsHere.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>}
            </div>
          )}
          {kind && <input className={input} value={title} onChange={e => setTitle(e.target.value)} placeholder="A short name for it" />}

          {kind === 'safety_sheet' && (
            rows ? (
              <div className="rounded-xl bg-neutral-50 p-sm">
                <p className="mb-xs text-xs font-semibold text-neutral-600">{rows.length} check{rows.length === 1 ? '' : 's'} read — fix anything wrong, then file. Checks already on record for that day are skipped.</p>
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-neutral-200">
                      {rows.map((r, i) => (
                        <tr key={i}>
                          <td className="py-0.5 pr-xs"><input type="date" className="rounded border border-neutral-300 px-1 py-0.5" value={r.date} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, date: e.target.value } : x))} /></td>
                          <td className="pr-xs"><select className="rounded border border-neutral-300 px-1 py-0.5" value={r.check} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, check: e.target.value } : x))}><option value="smoke_alarm">Smoke alarm</option><option value="fire_door">Fire door</option></select></td>
                          <td className="pr-xs">{r.result === 'fault' ? <span className="font-semibold text-red-700">Fault</span> : r.result === 'unclear' ? <span className="text-amber-700">Unclear</span> : 'OK'}</td>
                          <td className="pr-xs text-neutral-600">{[r.location, r.checked_by, r.notes].filter(Boolean).join(' · ')}</td>
                          <td><button type="button" className="text-neutral-400 hover:text-red-600" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {unreadable && <p className="mt-xs text-xs text-amber-800">Couldn’t read: {unreadable}</p>}
              </div>
            ) : <button type="button" className={btn} disabled={!!busy} onClick={() => read('safety_sheet')}>{busy === 'read' ? 'Reading the sheet…' : 'Read the checks'}</button>
          )}
          {kind === 'bill' && (
            bill ? (
              <p className="rounded-xl bg-neutral-50 p-sm text-xs text-neutral-700">{[bill.supplier, bill.what_for, bill.amount ? `£${Number(bill.amount).toFixed(2)}` : '', bill.period_from && bill.period_to ? `${bill.period_from} → ${bill.period_to}` : '', bill.account_number ? `account ${bill.account_number}` : '', bill.direct_debit ? 'paid by direct debit' : ''].filter(Boolean).join(' · ') || 'Nothing readable'} — saved with the document.</p>
            ) : <button type="button" className={btn} disabled={!!busy} onClick={() => read('bill')}>{busy === 'read' ? 'Reading…' : 'Read the bill (supplier, amount, period, account)'}</button>
          )}
          {kind === 'certificate' && <p className="text-xs text-neutral-600">Certificates are read in the AI Doc Scanner so the property’s expiry dates update.</p>}

          <div className="flex flex-wrap items-center gap-sm pt-xs">
            {kind === 'certificate'
              ? <button type="button" className={btnDark} onClick={toScanner}>Read it in the scanner →</button>
              : <button type="button" className={btnDark} disabled={!canFile || !!busy} onClick={file}>{busy === 'file' ? 'Filing…' : 'File it'}</button>}
            <button type="button" className={btn} disabled={!!busy} onClick={async () => { if (confirm('Discard this? It won’t be filed anywhere.')) { await post({ action: 'discard' }); reload() } }}>Discard</button>
            {msg && <span className={`text-sm ${msg.startsWith('✅') ? 'text-green-700' : 'text-red-700'}`}>{msg}</span>}
          </div>
        </div>
      </div>
    </section>
  )
}

// ── the iPhone share-sheet shortcut ──────────────────────────────────────────

function IphoneSetup({ keys, reload }: { keys: any[]; reload: () => Promise<void> }) {
  const [key, setKey] = useState('')
  async function make() {
    const r = await adminFetch('/api/admin/capture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'new_key', label: 'iPhone' }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { alert(d.error ?? 'Could not make a key'); return }
    setKey(d.key); reload()
  }
  return (
    <section className={`${card} p-lg space-y-md max-w-3xl`}>
      <div>
        <h2 className="text-lg font-bold text-neutral-900">“Send to CROS” in your iPhone’s share menu</h2>
        <p className="mt-xs text-sm text-neutral-600">Apple doesn’t let web apps appear in the share menu, so a two-minute Shortcut does it: share any photo, PDF or screenshot to “Send to CROS” and it lands here, ready to file. (Or just use “Choose photos or files” above.)</p>
      </div>
      <div className="rounded-xl bg-neutral-50 p-md">
        <p className="text-sm font-semibold text-neutral-900">1. Your personal key</p>
        {key ? (
          <>
            <p className="mt-xs text-xs text-amber-800">Copy it now — it’s shown only once. Anyone with it can add files to your inbox (never anything else).</p>
            <code className="mt-xs block break-all rounded bg-white p-sm font-mono text-xs">{key}</code>
            <button type="button" className={`${btn} mt-xs`} onClick={() => navigator.clipboard.writeText(key)}>Copy</button>
          </>
        ) : <button type="button" className={`${btnDark} mt-xs`} onClick={make}>Make a key</button>}
        {keys.length > 0 && <p className="mt-sm text-xs text-neutral-500">Keys in use: {keys.map(k => `${k.label ?? 'key'} (made ${new Date(k.created_at).toLocaleDateString('en-GB')}${k.last_used_at ? `, last used ${new Date(k.last_used_at).toLocaleDateString('en-GB')}` : ''})`).join(', ')}</p>}
      </div>
      <ol className="list-decimal space-y-xs pl-lg text-sm text-neutral-800">
        <li>Open the <strong>Shortcuts</strong> app → <strong>+</strong> → name it <strong>Send to CROS</strong>.</li>
        <li>Tap the <strong>ⓘ</strong> (details) → turn on <strong>Show in Share Sheet</strong>; for “Receive” choose <strong>Images, PDFs and Files</strong>.</li>
        <li>Add the action <strong>Convert Image</strong> → to <strong>JPEG</strong> (iPhone photos are HEIC, which CROS can’t read).</li>
        <li>Add <strong>Get Contents of URL</strong>. URL: <code className="rounded bg-neutral-100 px-1">{SITE}/api/capture/upload</code> · Method <strong>POST</strong> · Headers: <strong>Authorization</strong> = <code className="rounded bg-neutral-100 px-1">Bearer</code> + a space + your key · Request Body <strong>Form</strong>: add a <strong>File</strong> field called <strong>file</strong> = the converted image (Shortcut Input for PDFs).</li>
        <li>Optional: add <strong>Show Notification</strong> “Sent to CROS”.</li>
        <li>Try it: open a photo → Share → <strong>Send to CROS</strong>. It appears here under “To file”, and you get a notification.</li>
      </ol>
    </section>
  )
}
