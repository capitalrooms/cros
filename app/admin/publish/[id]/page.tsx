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

type Pub = { id: string; kind: string; title: string; period: string | null; areas: string[]; intro: string | null; body: string | null; sms_text: string | null; push_title: string | null; push_body: string | null; social_caption: string | null; audience: { lists?: string[]; people?: Recipient[]; ownAreas?: boolean }; channels: Record<string, boolean>; status: string; scheduled_for: string | null; website_published_at: string | null; approved_by: string | null }
type Data = {
  pub: Pub; channels: { key: string; label: string; note: string }[]; lists: { key: string; label: string }[]; areaNames: string[]
  reach: { total: number; email: number; sms: number; push: number; optedOut: number; sample: { name: string | null; email: string | null; phone: string | null; landlord: boolean }[] }
  previews: { email: { subject: string; html: string }; sms: string; push: { title: string; body: string; link: string }; caption: string; images: { square: string; wide: string }; website: string | null }
  log: { channel: string; name: string | null; address: string | null; status: string; note: string | null; at: string }[]
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
    const r = await adminFetch(`/api/admin/publish/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: f.title, intro: f.intro, body: f.body, sms_text: f.sms_text, push_title: f.push_title, push_body: f.push_body, social_caption: f.social_caption, areas: f.areas, audience: f.audience, channels: f.channels }) })
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
          {/* the words */}
          <section className={card}>
            <div className="space-y-md">
              <label className={label}>Title (the email subject and the post’s headline)<input disabled={locked} value={f.title ?? ''} onChange={e => set('title', e.target.value)} className={field} /></label>
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
              {tab === 'email' && (<><p className="text-sm text-neutral-600">Subject: <b>{d.previews.email.subject}</b>{aud.ownAreas ? ' · each landlord sees their own areas' : ''}</p><iframe title="The email" srcDoc={d.previews.email.html} className="mt-xs h-[640px] w-full rounded-xl ring-1 ring-neutral-200" /></>)}
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
                  <a href={d.previews.images.square} target="_blank" rel="noreferrer" download><img src={d.previews.images.square} alt="Instagram square" className="w-full rounded-xl ring-1 ring-neutral-200" /><span className="mt-xs block text-xs font-semibold underline">Instagram (square) — download</span></a>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <a href={d.previews.images.wide} target="_blank" rel="noreferrer" download><img src={d.previews.images.wide} alt="Facebook wide" className="w-full rounded-xl ring-1 ring-neutral-200" /><span className="mt-xs block text-xs font-semibold underline">Facebook / LinkedIn (wide) — download</span></a></div>
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

          {d.log.length > 0 && (
            <section className={card}>
              <p className={label}>Sent ({d.log.filter(x => x.status === 'sent').length}{d.log.some(x => x.status === 'failed') ? `, ${d.log.filter(x => x.status === 'failed').length} failed` : ''})</p>
              <ul className="mt-xs max-h-80 divide-y divide-neutral-100 overflow-y-auto text-xs">{d.log.map((x, i) => <li key={i} className="flex justify-between gap-sm py-xs"><span className="min-w-0 truncate">{x.status === 'sent' ? '✓' : '✕'} {x.name ?? x.address} · {x.channel === 'sms' ? 'text' : x.channel === 'push' ? 'app' : 'email'}{x.note ? ` — ${x.note}` : ''}</span><span className="shrink-0 text-neutral-500">{new Date(x.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></li>)}</ul>
            </section>
          )}
          <p className="text-xs text-neutral-500"><Link href="/admin/publish" className="underline">All of Publish</Link></p>
        </div>
      </main>
    </div>
  )
}
