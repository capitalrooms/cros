'use client'
// One piece in Publish (13 Nov 2026): the words, the channels with a preview of each, who it goes to, then
// test → approve → send now or on a date, and the log of every send. /api/admin/publish/[id], lib/publish.
import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import PageHero from '@/components/PageHero'
import { adminFetch } from '@/lib/adminFetch'
import PeoplePicker, { type Recipient } from '@/app/components/notify/PeoplePicker'
import { pictureStyle, withStyle, type SizeKey, type FontKey } from '@/lib/publish/pictures'

type Pub = { id: string; kind: string; title: string; period: string | null; areas: string[]; intro: string | null; body: string | null; sms_text: string | null; push_title: string | null; push_body: string | null; social_caption: string | null; audience: { lists?: string[]; people?: Recipient[]; ownAreas?: boolean }; channels: Record<string, boolean>; status: string; scheduled_for: string | null; website_published_at: string | null; approved_by: string | null; image?: string | null; preheader?: string | null; blocks?: any[]; template?: string | null }
type Data = {
  pub: Pub; channels: { key: string; label: string; note: string }[]; lists: { key: string; label: string }[]; areaNames: string[]
  reach: { total: number; email: number; sms: number; push: number; optedOut: number; sample: { name: string | null; email: string | null; phone: string | null; landlord: boolean }[] }
  previews: { email: { subject: string; html: string }; sms: string; push: { title: string; body: string; link: string }; caption: string; images: { square: string; wide: string }; website: string | null }
  log: { channel: string; name: string | null; address: string | null; status: string; note: string | null; at: string; opened_at?: string | null; clicked_at?: string | null; opens?: number; clicks?: number; bounced?: string | null; variant?: string | null }[]
  report: { trackingReady: boolean; sent: number; delivered: number; bounced: number; opened: number; clicked: number; links: { url: string; clicks: number }[]; byVariant: { v: string; sent: number; opened: number; clicked: number }[] }
  looks: { key: string; name: string }[]
  blockTypes: { type: string; label: string; make: any }[]
  pictures: Record<'figures' | 'scenes' | 'illustrations' | 'photos', { key: string; label: string; thumb: string }[]>
}
const STATUS: Record<string, string> = { draft: 'Draft', approved: 'Approved — ready to send', scheduled: 'Scheduled', sending: 'Sending', sent: 'Sent' }
const card = 'rounded-2xl bg-white p-lg ring-1 ring-neutral-200'
const label = 'block text-xs font-bold uppercase tracking-wide text-neutral-500'
const field = 'mt-xs block w-full rounded-xl border border-neutral-300 px-md py-sm text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none'

export default function PublishEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [d, setD] = useState<Data | null>(null)
  const [f, setF] = useState<Partial<Pub>>({})
  const [dirty, setDirty] = useState(false)
  const [tab, setTab] = useState('email')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [when, setWhen] = useState('')
  const [areas, setAreas] = useState<{ code: string; name: string }[]>([])
  const [q, setQ] = useState('')
  // the writer (lib/publish/write)
  const [brief, setBrief] = useState('')
  const [tone, setTone] = useState<'friendly' | 'professional' | 'celebratory' | 'important'>('friendly')
  const [length, setLength] = useState<'short' | 'standard'>('standard')
  const [withMarket, setWithMarket] = useState(false)
  const [missing, setMissing] = useState<string[]>([])
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [picTab, setPicTab] = useState<'figures' | 'scenes' | 'illustrations' | 'photos'>('figures')

  const load = useCallback(async () => {
    const r = await adminFetch(`/api/admin/publish/${id}`)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setMsg({ ok: false, text: j.error || 'Couldn’t open it' }); return }
    setD(j); setF(j.pub); setDirty(false)
  }, [id])
  useEffect(() => { load(); adminFetch('/api/admin/market').then(r => r.json()).then(x => setAreas((x.areas ?? []).map((a: any) => ({ code: a.code, name: a.name })))).catch(() => null) }, [load])

  const set = (k: keyof Pub, v: unknown) => { setF(x => ({ ...x, [k]: v })); setDirty(true) }
  const locked = !!d && ['sending', 'sent'].includes(d.pub.status)
  async function save() {
    setBusy('save'); setMsg(null)
    const r = await adminFetch(`/api/admin/publish/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: f.title, intro: f.intro, body: f.body, sms_text: f.sms_text, push_title: f.push_title, push_body: f.push_body, social_caption: f.social_caption, areas: f.areas, audience: f.audience, channels: f.channels, image: f.image ?? null, preheader: f.preheader ?? null, blocks: f.blocks ?? [] }) })
    const j = await r.json().catch(() => ({}))
    setBusy('')
    if (!r.ok) { setMsg({ ok: false, text: j.error || 'Couldn’t save' }); return false }
    if (d?.pub.status !== 'draft' && j.status === 'draft') setMsg({ ok: true, text: 'Saved. It changed after it was approved, so approve it again before sending.' })
    await load(); return true
  }
  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (dirty && !(await save())) return null
    setBusy(action); setMsg(null)
    const r = await adminFetch(`/api/admin/publish/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) })
    const j = action === 'pdf' ? null : await r.json().catch(() => ({}))
    setBusy('')
    if (!r.ok) { setMsg({ ok: false, text: j?.error || 'That didn’t work' }); return null }
    if (action === 'pdf') { window.open(URL.createObjectURL(await r.blob()), '_blank'); return true }
    return j
  }
  async function sendNow() {
    if (!d || !window.confirm(`Send it now to ${d.reach.total} ${d.reach.total === 1 ? 'person' : 'people'}${d.reach.optedOut ? ` (${d.reach.optedOut} who unsubscribed are left off)` : ''}?`)) return
    let total = 0, failed = 0
    for (let i = 0; i < 20; i++) {
      setBusy('send'); setMsg({ ok: true, text: `Sending… ${total} so far` })
      const r = await adminFetch(`/api/admin/publish/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'send' }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setBusy(''); setMsg({ ok: false, text: j.error || 'Sending stopped — press Send again to carry on (nobody gets it twice).' }); break }
      total += j.sent; failed += j.failed
      if (!j.remaining) { setBusy(''); setMsg({ ok: !failed, text: `Sent — ${total} delivered${failed ? `, ${failed} failed (see the log)` : ''}.` }); break }
    }
    setBusy(''); load()
  }

  if (!d) return <div className="min-h-screen bg-neutral-100"><AppBar left={<BackButton href="/admin/publish" />} /><p className="p-xl text-sm text-neutral-500">{msg?.text ?? 'Opening…'}</p></div>
  const p = d.pub, ch = f.channels ?? {}, aud = f.audience ?? {}
  const hits = q.trim().length >= 2 ? areas.filter(a => a.name.toLowerCase().includes(q.trim().toLowerCase()) && !(f.areas ?? []).includes(a.code)).slice(0, 6) : []
  const smsLen = d.previews.sms.length
  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin/publish" />} />
      <PageHero eyebrow={`Communications · Publish · ${p.kind === 'market_update' ? 'Market update' : 'News'}`} title={p.title} chip={{ label: STATUS[p.status] ?? p.status, tone: p.status === 'sent' ? 'good' : p.status === 'draft' ? 'plain' : 'info' }} />
      <main className="mx-auto grid max-w-6xl gap-lg px-lg py-xl lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-lg">
          {/* the writer — notes in, every version out (like Generate letter) */}
          {!locked && (
            <section className="rounded-2xl bg-neutral-900 p-lg text-white">
              <p className="text-xs font-bold uppercase tracking-wide text-neutral-400">Write it for me</p>
              <textarea value={brief} onChange={e => setBrief(e.target.value)} rows={3} placeholder={p.kind === 'market_update' ? 'Anything to add to the market update — e.g. mention we have rooms available in Newham from January' : 'What do you want to tell them? Rough notes are fine — e.g. office closed 24 Dec to 2 Jan, emergencies still covered on 0207 112 9163, thank landlords for a great year'} className="mt-xs block w-full rounded-xl border-0 bg-white/10 px-md py-sm text-sm text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-white/40" />
              <div className="mt-sm flex flex-wrap items-center gap-sm text-xs">
                <span className="flex gap-1 rounded-full bg-white/10 p-1 font-semibold">{([['friendly', 'Friendly'], ['professional', 'Professional'], ['celebratory', 'Celebratory'], ['important', 'Important']] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setTone(k)} className={`rounded-full px-sm py-0.5 ${tone === k ? 'bg-white text-neutral-900' : 'text-neutral-300'}`}>{l}</button>)}</span>
                <span className="flex gap-1 rounded-full bg-white/10 p-1 font-semibold">{([['short', 'Short'], ['standard', 'Standard']] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setLength(k)} className={`rounded-full px-sm py-0.5 ${length === k ? 'bg-white text-neutral-900' : 'text-neutral-300'}`}>{l}</button>)}</span>
                <label className="flex items-center gap-xs"><input type="checkbox" checked={withMarket} onChange={e => setWithMarket(e.target.checked)} /> Include market figures{withMarket ? ` — ${(f.areas ?? []).length ? (f.areas ?? []).map(c => areas.find(a => a.code === c)?.name ?? c).join(', ') : 'London'}` : ''}</label>
              </div>
              {withMarket && p.kind !== 'market_update' && (
                <div className="mt-xs">
                  <div className="flex flex-wrap gap-xs">{(f.areas ?? []).map(c => <span key={c} className="inline-flex items-center gap-xs rounded-full bg-white/15 px-md py-0.5 text-xs">{areas.find(a => a.code === c)?.name ?? c}<button type="button" onClick={() => set('areas', (f.areas ?? []).filter(x => x !== c))} aria-label="Remove">×</button></span>)}</div>
                  {(f.areas ?? []).length < 3 && <div className="relative mt-xs"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Areas for the figures (London if none) — e.g. Lambeth" className="w-full rounded-xl border-0 bg-white/10 px-md py-xs text-sm text-white placeholder:text-neutral-400" />
                    {hits.length > 0 && <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl bg-white text-neutral-900 shadow-lg">{hits.map(a => <li key={a.code}><button type="button" onClick={() => { set('areas', [...(f.areas ?? []), a.code]); setQ('') }} className="block w-full px-md py-sm text-left text-sm hover:bg-neutral-50">{a.name}</button></li>)}</ul>}</div>}
                </div>
              )}
              <div className="mt-sm flex flex-wrap items-center gap-sm">
                <button type="button" disabled={!!busy || (brief.trim().length < 8)} onClick={async () => { const j = await act('write', { brief, tone, length, withMarket }); if (j) { setMissing(j.missing ?? []); setMsg({ ok: true, text: 'Written — headline, message, text, app notification and caption. Read it through and change anything.' }); setBrief(''); load() } }} className="rounded-full bg-white px-lg py-xs text-sm font-semibold text-neutral-900 disabled:opacity-40">{busy === 'write' ? 'Writing…' : 'Write it'}</button>
                {(f.body ?? '').trim() && <span className="text-xs text-neutral-400">or redo what’s there:</span>}
                {(f.body ?? '').trim() && ([['shorter', 'Shorter'], ['friendlier', 'Friendlier'], ['formal', 'More formal'], ['cta', 'With a call to action']] as const).map(([k, l]) => <button key={k} type="button" disabled={!!busy} onClick={async () => { const j = await act('write', { rewrite: k, tone, length, withMarket }); if (j) { setMissing(j.missing ?? []); setMsg({ ok: true, text: `Rewritten — ${l.toLowerCase()}.` }); load() } }} className="rounded-full border border-white/30 px-md py-xs text-xs font-semibold">{busy === 'write' ? '…' : l}</button>)}
              </div>
              {missing.length > 0 && <p className="mt-sm rounded-lg bg-amber-300/20 px-md py-xs text-xs text-amber-100">Fill these in before sending: {missing.join(' · ')} — they’re in [square brackets] in the text.</p>}
            </section>
          )}

          {/* the words */}
          <section className={card}>
            <div className="space-y-md">
              <label className={label}>Title (the email subject and the post’s headline)<input disabled={locked} value={f.title ?? ''} onChange={e => set('title', e.target.value)} className={field} /></label>
              <label className={label}>Preview text — the grey line after the subject in the inbox<input disabled={locked} value={f.preheader ?? ''} onChange={e => set('preheader', e.target.value)} placeholder={f.intro ?? 'Adds to the subject — e.g. what it means for your rent this year'} className={field} /></label>
              {/* how it looks in an inbox */}
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-md py-sm text-sm">
                <div className="flex items-baseline justify-between gap-sm"><span className="font-semibold text-neutral-900">Capital Rooms</span><span className="text-xs text-neutral-500">now</span></div>
                <p className="truncate font-semibold text-neutral-900">{f.title || 'Subject'}</p>
                <p className="truncate text-neutral-500">{f.preheader || f.intro || 'The preview text shows here'}</p>
              </div>
              {p.kind === 'market_update' && (
                <div>
                  <p className={label}>Areas for the shared version {(!f.areas || !f.areas.length) && <span className="normal-case tracking-normal text-neutral-400">— London as a whole</span>}</p>
                  <div className="mt-xs flex flex-wrap gap-xs">{(f.areas ?? []).map(c => <span key={c} className="inline-flex items-center gap-xs rounded-full bg-neutral-900 px-md py-xs text-sm text-white">{areas.find(a => a.code === c)?.name ?? c}{!locked && <button type="button" onClick={() => set('areas', (f.areas ?? []).filter(x => x !== c))} aria-label="Remove">×</button>}</span>)}</div>
                  {!locked && (f.areas ?? []).length < 3 && <div className="relative mt-xs"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Add an area — e.g. Lambeth" className={field} />
                    {hits.length > 0 && <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-neutral-200">{hits.map(a => <li key={a.code}><button type="button" onClick={() => { set('areas', [...(f.areas ?? []), a.code]); setQ('') }} className="block w-full px-md py-sm text-left text-sm hover:bg-neutral-50">{a.name}</button></li>)}</ul>}</div>}
                </div>
              )}
              <label className={label}>Opening line<input disabled={locked} value={f.intro ?? ''} onChange={e => set('intro', e.target.value)} className={field} /></label>
              <label className={label}>{p.kind === 'market_update' ? 'Commentary' : 'Message'}<textarea disabled={locked} rows={10} value={f.body ?? ''} onChange={e => set('body', e.target.value)} className={`${field} leading-relaxed`} /></label>
              {p.kind === 'market_update' && !locked && <button type="button" disabled={!!busy} onClick={async () => { const j = await act('rewrite'); if (j) { setMsg({ ok: true, text: 'Written again from the latest figures.' }); load() } }} className="text-xs font-semibold underline">{busy === 'rewrite' ? 'Writing…' : 'Write the commentary again from the figures'}</button>}
            </div>
          </section>


          {/* content blocks — add, edit, move and remove (13 Nov 2026) */}
          <section className={card}>
            <div className="flex flex-wrap items-center justify-between gap-sm">
              <p className={label}>More in the email</p>
              <label className="flex items-center gap-xs text-xs font-semibold text-neutral-600">Email look
                <select disabled={locked} value={(f.channels as any)?.look ?? ''} onChange={e => set('channels', { ...(f.channels ?? {}), look: e.target.value || undefined })} className="rounded-lg border border-neutral-300 bg-white px-sm py-xs text-xs">
                  <option value="">The usual for all emails</option>{d.looks.map(l => <option key={l.key} value={l.key}>{l.name}</option>)}
                </select></label>
            </div>
            <div className="mt-sm space-y-sm">
              {(f.blocks ?? []).map((b: any, i: number) => {
                const upd = (patch: any) => set('blocks', (f.blocks ?? []).map((x: any, j: number) => j === i ? { ...x, ...patch } : x))
                const move = (dir: number) => { const arr = [...(f.blocks ?? [])]; const k = i + dir; if (k < 0 || k >= arr.length) return; [arr[i], arr[k]] = [arr[k], arr[i]]; set('blocks', arr) }
                const name = d.blockTypes.find(t => t.type === b.type)?.label ?? b.type
                const inp = 'mt-xs block w-full rounded-lg border border-neutral-300 px-sm py-xs text-sm'
                return (
                  <div key={i} className="rounded-xl border border-neutral-200 p-sm">
                    <div className="flex items-center justify-between gap-sm"><span className="text-xs font-bold uppercase tracking-wide text-neutral-500">{name}</span>
                      {!locked && <span className="flex gap-xs text-xs"><button type="button" onClick={() => move(-1)} aria-label="Move up" className="rounded border border-neutral-300 px-xs">↑</button><button type="button" onClick={() => move(1)} aria-label="Move down" className="rounded border border-neutral-300 px-xs">↓</button><button type="button" onClick={() => set('blocks', (f.blocks ?? []).filter((_: any, j: number) => j !== i))} className="rounded border border-neutral-300 px-xs text-red-700">Remove</button></span>}</div>
                    {b.type === 'heading' && <input disabled={locked} value={b.text} onChange={e => upd({ text: e.target.value })} className={inp} />}
                    {b.type === 'text' && <textarea disabled={locked} rows={3} value={b.text} onChange={e => upd({ text: e.target.value })} placeholder="Write here" className={inp} />}
                    {b.type === 'button' && <div className="grid gap-xs sm:grid-cols-[1fr_1.4fr_auto]"><input disabled={locked} value={b.label} onChange={e => upd({ label: e.target.value })} placeholder="Button words" className={inp} /><input disabled={locked} value={b.url} onChange={e => upd({ url: e.target.value })} placeholder="Link — a web address, tel:… or mailto:…" className={inp} /><select disabled={locked} value={b.style ?? 'solid'} onChange={e => upd({ style: e.target.value })} className={inp}><option value="solid">Solid</option><option value="outline">Outline</option></select></div>}
                    {b.type === 'picture' && <div className="mt-xs space-y-xs"><div className="flex gap-xs overflow-x-auto pb-xs">{[...(d.pictures?.illustrations ?? []), ...(d.pictures?.scenes ?? []).slice(0, 4), ...(d.pictures?.photos ?? []).slice(0, 12)].map(x => <button key={x.key} type="button" disabled={locked} onClick={() => upd({ pic: x.key })} className={`shrink-0 overflow-hidden rounded-lg ring-2 ${b.pic === x.key ? 'ring-neutral-900' : 'ring-transparent'}`}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={x.thumb} alt={x.label} className="h-16 w-16 object-cover" /></button>)}</div><input disabled={locked} value={b.caption ?? ''} onChange={e => upd({ caption: e.target.value })} placeholder="Caption (optional)" className={inp} /></div>}
                    {b.type === 'columns' && <div className="grid gap-sm sm:grid-cols-2">{(['left', 'right'] as const).map(side => <div key={side}><input disabled={locked} value={b[side].title} onChange={e => upd({ [side]: { ...b[side], title: e.target.value } })} placeholder="Title" className={inp} /><textarea disabled={locked} rows={3} value={b[side].text} onChange={e => upd({ [side]: { ...b[side], text: e.target.value } })} placeholder="Text" className={inp} /></div>)}</div>}
                    {b.type === 'quote' && <div className="grid gap-xs sm:grid-cols-[2fr_1fr]"><input disabled={locked} value={b.text} onChange={e => upd({ text: e.target.value })} placeholder="The quote" className={inp} /><input disabled={locked} value={b.by ?? ''} onChange={e => upd({ by: e.target.value })} placeholder="Who said it" className={inp} /></div>}
                    {b.type === 'figures' && <p className="mt-xs text-xs text-neutral-600">Rents and prices for {(f.areas ?? []).length ? 'the areas above' : 'London'} — official figures, always the latest.</p>}
                    {b.type === 'contact' && <p className="mt-xs text-xs text-neutral-600">“Questions? We’re here” — our number and a button to the website.</p>}
                    {b.type === 'divider' && <hr className="mt-xs border-neutral-200" />}
                  </div>
                )
              })}
            </div>
            {!locked && <div className="mt-sm flex flex-wrap gap-xs">{d.blockTypes.map(t => <button key={t.type} type="button" onClick={() => set('blocks', [...(f.blocks ?? []), (t.type === 'figures' ? { ...t.make, areas: f.areas ?? [] } : t.make)])} className="rounded-full border border-neutral-300 px-md py-0.5 text-xs font-semibold hover:bg-neutral-50">+ {t.label}</button>)}</div>}
            <p className="mt-xs text-xs text-neutral-500">Blocks go after the message, in this order. Built the way email apps keep them, so they look right in Gmail, Outlook and on a phone. Save to see them in the preview.</p>
          </section>

          {/* the picture — used for Instagram, Facebook / the website cover and the top of the email */}
          <section className={card}>
            <div className="flex flex-wrap items-center justify-between gap-sm">
              <p className={label}>Picture</p>
              <div className="flex gap-1 rounded-full bg-neutral-100 p-1 text-xs font-semibold">
                {([['figures', 'Figures'], ['scenes', 'London scenes'], ['illustrations', 'Illustrations'], ['photos', 'Our photos']] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setPicTab(k)} className={`rounded-full px-md py-xs ${picTab === k ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>{l}</button>)}
              </div>
            </div>
            <div className="mt-sm flex flex-wrap items-center gap-md text-xs">
              <span className="flex items-center gap-xs"><span className="font-semibold text-neutral-600">Text</span>
                <span className="flex gap-1 rounded-full bg-neutral-100 p-1 font-semibold">{(['standard', 'large', 'larger'] as SizeKey[]).map(k => { const st = pictureStyle(f.image); return <button key={k} type="button" disabled={locked} onClick={() => set('image', withStyle(f.image ?? 'figures:dark', k, st.font))} className={`rounded-full px-sm py-0.5 capitalize ${st.size === k ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>{k}</button> })}</span></span>
              <span className="flex items-center gap-xs"><span className="font-semibold text-neutral-600">Font</span>
                <span className="flex gap-1 rounded-full bg-neutral-100 p-1 font-semibold">{([['clean', 'Clean'], ['bold', 'Bold']] as [FontKey, string][]).map(([k, l]) => { const st = pictureStyle(f.image); return <button key={k} type="button" disabled={locked} onClick={() => set('image', withStyle(f.image ?? 'figures:dark', st.size, k))} className={`rounded-full px-sm py-0.5 ${st.font === k ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>{l}</button> })}</span></span>
              <span className="text-neutral-500">Every size is measured to fit — a long headline steps down so it never runs off.</span>
            </div>
            <div className={`mt-sm grid gap-sm ${picTab === 'scenes' ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-3 sm:grid-cols-5'}`}>
              {(d.pictures?.[picTab] ?? []).map(x => {
                const on = (f.image ?? 'figures:dark').split('|')[0] === x.key
                return (
                  <button key={x.key} type="button" disabled={locked} onClick={() => { const st = pictureStyle(f.image); set('image', withStyle(x.key, st.size, st.font)) }} className={`overflow-hidden rounded-xl text-left ring-2 transition ${on ? 'ring-neutral-900' : 'ring-transparent hover:ring-neutral-300'}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={x.thumb} alt={x.label} loading="lazy" className={`w-full ${picTab === 'scenes' ? 'aspect-[5/2]' : 'aspect-square'} object-cover bg-neutral-100`} />
                    <span className="block truncate px-xs py-0.5 text-[11px] text-neutral-600">{on ? '✓ ' : ''}{x.label || 'Photo'}</span>
                  </button>
                )
              })}
              {picTab === 'photos' && !(d.pictures?.photos ?? []).length && <p className="col-span-full text-sm text-neutral-500">No property photos in CROS yet — add them on a property’s Photos tab.</p>}
            </div>
            <div className="mt-md grid gap-sm sm:grid-cols-[1fr_1.6fr]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${d.previews.images.square}&k=${encodeURIComponent(f.image ?? 'figures:dark')}`} alt="Instagram" className="w-full rounded-xl ring-1 ring-neutral-200" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${d.previews.images.wide}&k=${encodeURIComponent(f.image ?? 'figures:dark')}`} alt="Facebook and the website" className="w-full self-start rounded-xl ring-1 ring-neutral-200" />
            </div>
            <p className="mt-xs text-xs text-neutral-500">Square for Instagram; wide for Facebook, LinkedIn, the website post and the top of the email. Logo and headline are added for you.{dirty ? ' Save to keep your choice.' : ''}</p>
          </section>

          {/* the channels, with a preview of each */}
          <section className={card}>
            <p className={label}>Where it goes</p>
            <div className="mt-sm grid gap-xs sm:grid-cols-2">
              {d.channels.map(c => (
                <label key={c.key} className={`flex cursor-pointer items-start gap-sm rounded-xl border px-md py-sm ${ch[c.key] ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200'}`}>
                  <input type="checkbox" disabled={locked && !['website', 'social'].includes(c.key)} className="mt-1" checked={!!ch[c.key]} onChange={e => set('channels', { ...ch, [c.key]: e.target.checked })} />
                  <span><span className="block text-sm font-semibold">{c.label}</span><span className="block text-xs text-neutral-500">{c.note}</span></span>
                </label>
              ))}
            </div>
            <div className="mt-md flex flex-wrap gap-1 rounded-full bg-neutral-100 p-1 text-xs font-semibold" style={{ width: 'fit-content' }}>
              {[['email', 'Email'], ['pdf', 'PDF'], ['sms', 'Text'], ['push', 'App'], ['website', 'Website'], ['social', 'Social']].map(([k, l]) => <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-full px-md py-xs ${tab === k ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>{l}</button>)}
            </div>
            <div className="mt-sm">
              {tab === 'email' && (<>
                <div className="flex flex-wrap items-center justify-between gap-sm"><p className="text-sm text-neutral-600">Subject: <b>{d.previews.email.subject}</b>{aud.ownAreas ? ' · each landlord sees their own areas' : ''}</p>
                  <span className="flex gap-1 rounded-full bg-neutral-100 p-1 text-xs font-semibold">{([['desktop', 'Desktop'], ['mobile', 'Phone']] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setDevice(k)} className={`rounded-full px-md py-0.5 ${device === k ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>{l}</button>)}</span></div>
                <div className={`mt-xs ${device === 'mobile' ? 'mx-auto w-[390px] rounded-[36px] border-[10px] border-neutral-900 bg-neutral-900 p-0 shadow-xl' : ''}`}>
                  <iframe title="The email" srcDoc={d.previews.email.html} className={`w-full bg-white ${device === 'mobile' ? 'h-[720px] rounded-[26px]' : 'h-[640px] rounded-xl ring-1 ring-neutral-200'}`} />
                </div>
                {dirty && <p className="mt-xs text-xs text-amber-800">Save to see your changes in the preview.</p>}
              </>)}
              {tab === 'pdf' && (p.kind === 'market_update' ? <div className="space-y-xs text-sm"><p className="text-neutral-600">The report on our letterhead. Tick “PDF letter” to attach it to every email{aud.ownAreas ? ' (each landlord’s for their own areas)' : ''}, or open it to print and post.</p><button type="button" disabled={!!busy} onClick={() => act('pdf')} className="rounded-full border border-neutral-300 px-md py-xs font-semibold">{busy === 'pdf' ? 'Making it…' : 'Open the PDF'}</button></div> : <p className="text-sm text-neutral-600">PDF letters are for market updates for now.</p>)}
              {tab === 'sms' && (<div className="space-y-sm"><label className={label}>The text (the link and opt-out are added)<textarea disabled={locked} rows={3} value={f.sms_text ?? ''} onChange={e => set('sms_text', e.target.value)} className={field} /></label>
                <div className="max-w-sm rounded-2xl rounded-bl-sm bg-neutral-100 px-md py-sm text-sm">{d.previews.sms}</div>
                <p className={`text-xs ${smsLen > 306 ? 'text-red-700' : 'text-neutral-500'}`}>{smsLen} characters · {Math.ceil(smsLen / 153)} text{Math.ceil(smsLen / 153) === 1 ? '' : 's'} each{!d.previews.website ? ' · publish it to the website first so the text can link to it' : ''}</p></div>)}
              {tab === 'push' && (<div className="space-y-sm"><div className="grid gap-sm sm:grid-cols-2"><label className={label}>Title<input disabled={locked} value={f.push_title ?? ''} onChange={e => set('push_title', e.target.value)} className={field} /></label><label className={label}>Line<input disabled={locked} value={f.push_body ?? ''} onChange={e => set('push_body', e.target.value)} className={field} /></label></div>
                <div className="flex max-w-sm gap-sm rounded-2xl bg-neutral-900/90 p-md text-white"><span className="mt-0.5 h-8 w-8 shrink-0 rounded-lg bg-[#1F3B2E]" /><span className="min-w-0"><span className="block text-sm font-semibold">{d.previews.push.title}</span><span className="block text-sm opacity-80">{d.previews.push.body}</span></span></div>
                <p className="text-xs text-neutral-500">Landlords with the app get it as a notification, and it sits in their app inbox.</p></div>)}
              {tab === 'website' && (<div className="space-y-sm text-sm">{d.previews.website ? <p>On the website: <a href={d.previews.website} target="_blank" rel="noreferrer" className="font-semibold underline">{d.previews.website}</a></p> : <p className="text-neutral-600">Not on the website yet. Publishing makes a post under News &amp; advice with the figures and the words, and the picture as its cover.</p>}
                <div className="flex gap-sm">{['approved', 'scheduled', 'sending', 'sent'].includes(p.status) ? <button type="button" disabled={!!busy} onClick={async () => { const j = await act('website'); if (j) { setMsg({ ok: true, text: `On the website: ${j.url}` }); load() } }} className="rounded-full bg-neutral-900 px-md py-xs font-semibold text-white">{d.previews.website ? 'Update the post' : 'Publish to the website'}</button> : <span className="text-xs text-neutral-500">Approve it first.</span>}
                  {d.previews.website && <button type="button" onClick={async () => { if (await act('unpublish')) load() }} className="rounded-full border border-neutral-300 px-md py-xs font-semibold">Take it down</button>}</div></div>)}
              {tab === 'social' && (<div className="space-y-sm"><div className="grid gap-sm sm:grid-cols-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <a href={`${d.previews.images.square}&k=${encodeURIComponent(f.image ?? 'figures:dark')}`} target="_blank" rel="noreferrer" download><img src={`${d.previews.images.square}&k=${encodeURIComponent(f.image ?? 'figures:dark')}`} alt="Instagram square" className="w-full rounded-xl ring-1 ring-neutral-200" /><span className="mt-xs block text-xs font-semibold underline">Instagram (square) — download</span></a>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <a href={`${d.previews.images.wide}&k=${encodeURIComponent(f.image ?? 'figures:dark')}`} target="_blank" rel="noreferrer" download><img src={`${d.previews.images.wide}&k=${encodeURIComponent(f.image ?? 'figures:dark')}`} alt="Facebook wide" className="w-full rounded-xl ring-1 ring-neutral-200" /><span className="mt-xs block text-xs font-semibold underline">Facebook / LinkedIn (wide) — download</span></a></div>
                <label className={label}>Caption<textarea disabled={locked && false} rows={5} value={f.social_caption ?? d.previews.caption} onChange={e => set('social_caption', e.target.value)} className={field} /></label>
                <button type="button" onClick={() => { navigator.clipboard.writeText(f.social_caption ?? d.previews.caption); setMsg({ ok: true, text: 'Caption copied — paste it with the picture on Instagram or Facebook.' }) }} className="rounded-full border border-neutral-300 px-md py-xs text-sm font-semibold">Copy the caption</button>
                <p className="text-xs text-neutral-500">Post them yourself for now. Posting straight from CROS needs your Instagram/Facebook business account connected — that’s the next step.</p></div>)}
            </div>
          </section>
        </div>

        <div className="space-y-lg">
          {/* who */}
          <section className={card}>
            <p className={label}>Who it goes to</p>
            <div className="mt-sm space-y-xs">
              {d.lists.map(l => (
                <label key={l.key} className="flex items-start gap-sm text-sm"><input type="checkbox" disabled={locked} className="mt-1" checked={(aud.lists ?? []).includes(l.key)} onChange={e => set('audience', { ...aud, lists: e.target.checked ? [...(aud.lists ?? []), l.key] : (aud.lists ?? []).filter(x => x !== l.key) })} />{l.label}{l.key === 'landlords_in_areas' && !(f.areas ?? []).length ? <span className="text-neutral-400"> (choose areas)</span> : ''}</label>
              ))}
              {p.kind === 'market_update' && <label className="flex items-start gap-sm text-sm"><input type="checkbox" disabled={locked} className="mt-1" checked={!!aud.ownAreas} onChange={e => set('audience', { ...aud, ownAreas: e.target.checked })} /><span>Each landlord gets <b>their own properties’ areas</b>, with a commentary for them</span></label>}
            </div>
            <p className={`${label} mt-md`}>And these people</p>
            <div className="mt-xs">{locked ? <p className="text-sm text-neutral-600">{(aud.people ?? []).map(x => x.name || x.email).join(', ') || '—'}</p> : <PeoplePicker value={aud.people ?? []} onChange={v => set('audience', { ...aud, people: v })} includeLandlords compact />}</div>
            <div className="mt-md rounded-xl bg-neutral-50 p-md text-sm">
              <p><b>{d.reach.total}</b> {d.reach.total === 1 ? 'person' : 'people'} · {d.reach.email} by email · {d.reach.sms} by text · {d.reach.push} with the app</p>
              {d.reach.optedOut > 0 && <p className="text-xs text-neutral-600">{d.reach.optedOut} unsubscribed — left off.</p>}
              {dirty && <p className="text-xs text-amber-800">Save to see who it reaches now.</p>}
              {d.reach.sample.length > 0 && <details className="mt-xs text-xs"><summary className="cursor-pointer font-semibold">See who</summary><ul className="mt-xs max-h-48 overflow-y-auto">{d.reach.sample.map((x, i) => <li key={i}>{x.name}{x.email ? ` · ${x.email}` : ''}</li>)}</ul></details>}
            </div>
          </section>

          {/* go */}
          <section className={card}>
            {msg && <p className={`mb-sm rounded-lg px-md py-sm text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-800'}`}>{msg.text}</p>}
            <div className="flex flex-col gap-sm">
              {!locked && <button type="button" disabled={!dirty || !!busy} onClick={save} className="rounded-xl border border-neutral-300 py-sm text-sm font-semibold disabled:opacity-40">{busy === 'save' ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</button>}
              {!locked && <button type="button" disabled={!!busy} onClick={async () => { const j = await act('test'); if (j) setMsg({ ok: true, text: j.message }) }} className="rounded-xl border border-neutral-300 py-sm text-sm font-semibold">{busy === 'test' ? 'Sending the test…' : 'Send a test to me'}</button>}
              {p.status === 'draft' && <button type="button" disabled={!!busy} onClick={async () => { if (await act('approve')) { setMsg({ ok: true, text: 'Approved — send it now or choose a time.' }); load() } }} className="rounded-xl bg-neutral-900 py-sm text-sm font-semibold text-white">Approve</button>}
              {['approved', 'scheduled', 'sending'].includes(p.status) && (<>
                <button type="button" disabled={!!busy} onClick={sendNow} className="rounded-xl bg-emerald-700 py-sm text-sm font-bold text-white">{busy === 'send' ? 'Sending…' : p.status === 'sending' ? 'Carry on sending' : `Send now to ${d.reach.total}`}</button>
                {p.status !== 'sending' && <div className="flex gap-xs"><input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} className="flex-1 rounded-xl border border-neutral-300 px-sm py-xs text-sm" /><button type="button" disabled={!when || !!busy} onClick={async () => { if (await act('schedule', { at: new Date(when).toISOString() })) { setMsg({ ok: true, text: 'Scheduled — it goes out then on its own.' }); load() } }} className="rounded-xl border border-neutral-300 px-md text-sm font-semibold disabled:opacity-40">Schedule</button></div>}
                {p.status === 'scheduled' && p.scheduled_for && <p className="text-xs text-neutral-600">Goes {new Date(p.scheduled_for).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.</p>}
                <button type="button" disabled={!!busy} onClick={async () => { if (await act('unapprove')) load() }} className="text-xs font-semibold underline">Back to draft</button>
              </>)}
              {['draft', 'approved'].includes(p.status) && <button type="button" disabled={!!busy} onClick={async () => { if (window.confirm('Delete this draft?') && await act('delete')) router.push('/admin/publish') }} className="text-xs font-semibold text-red-700 underline">Delete the draft</button>}
            </div>
            <p className="mt-sm text-xs text-neutral-500">Every email and text has an unsubscribe; anyone who uses it is left off from then on. Things about their own properties still reach them.</p>
          </section>

          {d.report && d.report.sent > 0 && (
            <section className={card}>
              <p className={label}>How it did</p>
              {!d.report.trackingReady && <p className="mt-xs rounded-lg bg-amber-50 px-md py-xs text-xs text-amber-900">Opens and clicks aren’t switched on yet — see the note on the Publish page.</p>}
              <div className="mt-sm grid grid-cols-2 gap-sm text-center">
                {([['Sent', d.report.sent, ''], ['Delivered', d.report.delivered, d.report.sent ? `${Math.round(d.report.delivered / d.report.sent * 100)}%` : ''], ['Opened', d.report.opened, d.report.sent ? `${Math.round(d.report.opened / d.report.sent * 100)}%` : ''], ['Clicked', d.report.clicked, d.report.sent ? `${Math.round(d.report.clicked / d.report.sent * 100)}%` : '']] as const).map(([k, n, pctTxt]) => (
                  <div key={k} className="rounded-xl bg-neutral-50 p-sm"><p className="text-[11px] uppercase tracking-wider text-neutral-500">{k}</p><p className="text-xl font-bold tabular-nums">{pctTxt || n}</p>{pctTxt && <p className="text-xs text-neutral-500">{n} people</p>}</div>
                ))}
              </div>
              {d.report.bounced > 0 && <p className="mt-xs text-xs text-red-700">{d.report.bounced} bounced — the address may be wrong; check them in the list below.</p>}
              {d.report.byVariant.length > 1 && <div className="mt-sm text-xs">{d.report.byVariant.map(v => <p key={v.v}><b>Subject {v.v}</b>: {v.sent} sent · {v.sent ? Math.round(v.opened / v.sent * 100) : 0}% opened · {v.sent ? Math.round(v.clicked / v.sent * 100) : 0}% clicked</p>)}</div>}
              {d.report.links.length > 0 && <div className="mt-sm"><p className="text-xs font-semibold text-neutral-600">Links clicked</p><ul className="mt-xs space-y-0.5 text-xs">{d.report.links.map(l => <li key={l.url} className="flex justify-between gap-sm"><span className="truncate">{l.url.replace(/^https?:\/\//, '')}</span><span className="shrink-0 font-semibold tabular-nums">{l.clicks}</span></li>)}</ul></div>}
              <p className="mt-sm text-[11px] text-neutral-500">Some mail apps (Apple Mail) open emails on their own to protect privacy, so opens read high — clicks are the surer sign someone read it.</p>
            </section>
          )}

          {d.log.length > 0 && (
            <section className={card}>
              <p className={label}>Sent ({d.log.filter(x => x.status === 'sent').length}{d.log.some(x => x.status === 'failed') ? `, ${d.log.filter(x => x.status === 'failed').length} failed` : ''})</p>
              <ul className="mt-xs max-h-80 divide-y divide-neutral-100 overflow-y-auto text-xs">{d.log.map((x, i) => <li key={i} className="flex justify-between gap-sm py-xs"><span className="min-w-0 truncate">{x.status === 'sent' ? '✓' : '✕'} {x.name ?? x.address} · {x.channel === 'sms' ? 'text' : x.channel === 'push' ? 'app' : 'email'}{x.note ? ` — ${x.note}` : ''}{x.bounced ? ' · bounced' : x.clicked_at ? ' · clicked' : x.opened_at ? ' · opened' : ''}</span><span className="shrink-0 text-neutral-500">{new Date(x.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></li>)}</ul>
            </section>
          )}
          <p className="text-xs text-neutral-500"><Link href="/admin/publish" className="underline">All of Publish</Link></p>
        </div>
      </main>
    </div>
  )
}
