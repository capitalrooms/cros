'use client'

// Quick Notify — message the people at one house (rebuilt 22 Oct 2026, Harry: show who it's going to, show what
// they'll actually get, only tenant messages, pick what it's about first, re-send guides, say why a send failed).
// Ready-made messages: lib/notify/tenantMessages. Recipients, guides and licence details: GET /api/admin/quick-notify.
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { adminFetch } from '@/lib/adminFetch'
import { useAdminAccess } from '@/lib/admin-context'
import PeoplePicker, { type Recipient } from '@/app/components/notify/PeoplePicker'
import { PURPOSES, TENANT_MESSAGES, SLOTS, VISIT_PURPOSES, fillMessage, unfilled, type Purpose, type TenantMessage } from '@/lib/notify/tenantMessages'

interface QuickNotifyModalProps {
  propertyId: string
  onClose: () => void
  onSuccess?: () => void
  /** open already addressed to these people (a tenant's own screens — the room page, the tenant profile) */
  initialPeople?: string[]
  /** …or to everyone in this room */
  initialRoomId?: string
}

interface Tenant { personId: string; name: string; dear: string; room: string; roomId: string; hasApp: boolean; hasEmail: boolean; hasMobile: boolean; test: boolean }
interface HouseData {
  property: { id: string; name: string; address: string }
  rooms: { id: string; name: string }[]
  tenants: Tenant[]
  cleaners: number
  guides: { slug: string; title: string; emoji: string; sections: number }[]
  hmo: Record<string, string>
  sendingOn: boolean
}
type Who = 'everyone' | 'room' | 'people' | 'cleaners'
type Channels = 'push_email' | 'push_only' | 'push_email_sms'
type Receipt = { at: string; names: string[]; recipientCount: number; pushCount: number; emailCount: number; smsCount: number; smsFailed: string[]; pinned: boolean; others: string }

const CHANNELS: { value: Channels; label: string; hint: string }[] = [
  { value: 'push_email', label: 'App + email', hint: 'In their app (and a phone notification if they have the app), plus an email' },
  { value: 'push_only', label: 'App only', hint: 'In their app, and a phone notification if they have the app — no email' },
  { value: 'push_email_sms', label: 'App, email + text', hint: 'Everything, plus a text to everyone with a mobile' },
]

const errorText = async (r: Response, fallback: string) => {
  const d = await r.json().catch(() => ({}))
  if (r.status === 401) return d.error || 'We couldn’t confirm it’s you — please sign out and sign in again.'
  return d.error || d.message || `${fallback} (error ${r.status})`
}

export default function QuickNotifyModal({ propertyId, onClose, onSuccess, initialPeople, initialRoomId }: QuickNotifyModalProps) {
  const [house, setHouse] = useState<HouseData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // sending is part of Comms (lib/access/areas). Lettings and diary staff without it may send viewing and visit
  // messages only (24 Oct 2026) — through /api/admin/quick-notify/visits, which checks the same thing
  const allowed = useAdminAccess()
  const fullComms = allowed('/admin/notify')
  const visitsOnly = !fullComms && (allowed('/admin/lettings') || allowed('/admin/agency-diary'))
  const canSend = fullComms || visitsOnly
  const purposes = visitsOnly ? PURPOSES.filter(p => VISIT_PURPOSES.includes(p.key)) : PURPOSES

  const [who, setWho] = useState<Who>(initialPeople?.length ? 'people' : initialRoomId ? 'room' : 'everyone')
  const [roomId, setRoomId] = useState(initialRoomId ?? '')
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const [purpose, setPurpose] = useState<Purpose | null>(null)
  const [msg, setMsg] = useState<TenantMessage | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [rawSubject, setRawSubject] = useState('')
  const [rawBody, setRawBody] = useState('')
  const [link, setLink] = useState('/tenant/inbox')
  const [aiPrompt, setAiPrompt] = useState('')
  const [drafting, setDrafting] = useState(false)

  const [channels, setChannels] = useState<Channels>('push_email')
  const [pin, setPin] = useState(false)
  const [alsoTell, setAlsoTell] = useState<Recipient[]>([])
  const [previewAs, setPreviewAs] = useState<'phone' | 'email'>('phone')

  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<Receipt | null>(null)

  useEffect(() => {
    let off = false
    adminFetch(`/api/admin/quick-notify?property_id=${encodeURIComponent(propertyId)}`).then(async r => {
      if (off) return
      if (!r.ok) { setLoadError(await errorText(r, 'Couldn’t load this house')); return }
      const d: HouseData = await r.json()
      setHouse(d)
      const only = (initialPeople ?? []).filter(id => d.tenants.some(t => t.personId === id))
      // opened for particular people: never fall back to the whole house if they aren't current tenants here
      if (initialPeople?.length && !only.length) { setLoadError('Quick Notify reaches the current tenants of this house, and this person isn’t one yet (or any more). Email them from their letting file instead.'); return }
      setPicked(new Set(initialPeople?.length ? only : d.tenants.map(t => t.personId)))
    }).catch(() => !off && setLoadError('Couldn’t reach CROS — check your connection and try again.'))
    return () => { off = true }
  }, [propertyId])

  // the people it goes to, as they'll be sent
  const recipients: Tenant[] = useMemo(() => {
    if (!house) return []
    if (who === 'cleaners') return []
    if (who === 'room') return house.tenants.filter(t => t.roomId === roomId)
    if (who === 'people') return house.tenants.filter(t => picked.has(t.personId))
    return house.tenants
  }, [house, who, roomId, picked])
  const count = who === 'cleaners' ? house?.cleaners ?? 0 : recipients.length
  const withApp = recipients.filter(t => t.hasApp).length

  const houseFill = { name: house?.property.name ?? '', address: house?.property.address ?? '' }
  const subject = fillMessage(rawSubject, msg, values, houseFill)
  const body = fillMessage(rawBody, msg, values, houseFill)
  const missing = unfilled(`${subject} ${body}`)

  const chooseMessage = (m: TenantMessage) => {
    setMsg(m); setRawSubject(m.subject); setRawBody(m.body); setLink(m.link ?? '/tenant/inbox'); setError(null)
    const v: Record<string, string> = {}
    for (const f of m.fields) v[f.key] = (house?.hmo[f.key] ?? '') || f.default || ''
    setValues(v)
  }
  const chooseGuide = (g: HouseData['guides'][number]) => {
    setMsg(null); setValues({}); setError(null)
    setRawSubject(`Our guide: ${g.title}`)
    setRawBody(`Here’s our guide to ${g.title.toLowerCase()} again – it only takes a couple of minutes to read and it’s worth a look.\n\nYou’ll find it, and the other house guides, in the app under Guides.`)
    setLink(`/tenant/guides/${g.slug}`)
  }
  const choosePurpose = (p: Purpose) => {
    setPurpose(p); setMsg(null); setValues({}); setRawSubject(''); setRawBody(''); setLink('/tenant/inbox'); setError(null)
  }

  const draftWithAi = async () => {
    if (!aiPrompt.trim()) { setError('Say in a few words what the message is about.'); return }
    setDrafting(true); setError(null)
    try {
      const r = await adminFetch('/api/ai/compose-notification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: aiPrompt, property_id: propertyId, recipient_type: 'all_tenants' }) })
      if (!r.ok) { setError(await errorText(r, 'The AI draft didn’t work')); return }
      const d = await r.json()
      setMsg(null); setRawSubject(d.subject ?? ''); setRawBody(d.message ?? '')
    } finally { setDrafting(false) }
  }

  const send = async () => {
    if (!house) return
    if (!subject.trim() || !body.trim()) { setError('Add a subject and a message first.'); return }
    if (missing.length) { setError(`Fill in ${missing.map(k => msg?.fields.find(f => f.key === k)?.label.toLowerCase() ?? k).join(', ')} first.`); return }
    if (who === 'room' && !roomId) { setError('Pick the room.'); return }
    if (count === 0) { setError('No one is picked to send to.'); return }
    setSending(true); setError(null)
    try {
      const r = await adminFetch(visitsOnly ? '/api/admin/quick-notify/visits' : '/api/admin/quick-notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: propertyId, subject, message: body, channels, link, purpose, message_id: msg?.id ?? null,
          recipient_type: who === 'everyone' ? 'all_tenants' : who,
          room_id: who === 'room' ? roomId : null,
          person_ids: who === 'people' ? [...picked] : undefined,
        }),
      })
      if (!r.ok) { setError(await errorText(r, 'The message didn’t send')); return }
      const d = await r.json()

      let pinned = false
      if (pin && who !== 'cleaners') {
        const n = await adminFetch('/api/tenant/notices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ property_id: propertyId, notice_type: 'info', subtype: 'General update', raw_text: `${subject}\n\n${body}`, ai_text: null }) })
        pinned = n.ok
      }
      let others = ''
      if (alsoTell.length) {
        const o = await adminFetch('/api/notify/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipients: alsoTell.map(x => ({ name: x.name, email: x.email, phone: x.phone })), subject, message: body }) })
        const od = await o.json().catch(() => ({}))
        const failed = (od.failed ?? []) as any[]
        others = failed.length ? `Not sent to: ${failed.map(f => f.who).join(', ')}` : `Also sent to ${alsoTell.length} other${alsoTell.length === 1 ? '' : 's'}`
      }
      setReceipt({
        at: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }),
        names: who === 'cleaners' ? ['the cleaners'] : recipients.map(t => t.name),
        recipientCount: d.recipientCount ?? 0, pushCount: d.pushCount ?? 0, emailCount: d.emailCount ?? 0,
        smsCount: d.smsCount ?? 0, smsFailed: d.smsFailed ?? [], pinned, others,
      })
      onSuccess?.()
    } catch {
      setError('Couldn’t reach CROS — check your connection and try again.')
    } finally {
      setSending(false)
    }
  }

  const sendAnother = () => { setReceipt(null); setPurpose(null); setMsg(null); setRawSubject(''); setRawBody(''); setValues({}); setAlsoTell([]); setPin(false) }

  const firstName = recipients[0]?.dear ?? 'Ms Smith'
  const chip = (on: boolean) => `rounded-lg border px-md py-sm text-sm font-semibold transition ${on ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400'}`
  const label = 'mb-sm block text-xs font-bold uppercase tracking-wide text-neutral-500'
  const input = 'w-full rounded-lg border border-neutral-200 bg-white px-md py-sm text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none'

  // drawn on <body>, above the top bar and the menu (23 Oct 2026: inside the page's scrolling area the top bar and rail
  // sat over its backdrop and the page showed through — "proportions all wrong, bleeding everywhere")
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  if (!mounted) return null
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-stretch justify-center bg-black/50 md:items-center md:p-lg" role="dialog" aria-modal="true" aria-label="Quick Notify">
      <div className="flex w-full flex-col overflow-hidden bg-neutral-50 shadow-2xl md:max-h-[92vh] md:max-w-3xl md:rounded-2xl">
        {/* header: the house it's going to */}
        <div className="flex items-start justify-between gap-md bg-[#181614] px-lg py-md text-white">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-neutral-400">Quick Notify</p>
            <p className="truncate text-lg font-bold">{house?.property.name ?? 'Loading…'}</p>
            {/* the address only when it says more than the name (most houses are named after it) */}
            {house && house.property.address.replace(/[\s,]/g, '').toLowerCase() !== house.property.name.replace(/[\s,]/g, '').toLowerCase() && <p className="truncate text-xs text-neutral-400">{house.property.address}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg px-sm text-2xl leading-none text-neutral-400 hover:text-white">×</button>
        </div>

        <div className="flex-1 space-y-lg overflow-y-auto px-lg py-lg">
          {!canSend && <p className="rounded-xl border border-amber-200 bg-amber-50 p-md text-sm font-semibold text-amber-900">Sending messages is part of Comms, which isn’t in your access — you can look, but Send won’t go. Ask an administrator if you need it.</p>}
          {visitsOnly && <p className="rounded-xl border border-neutral-200 bg-white p-md text-sm text-neutral-700">You can send <b>viewing and visit</b> messages to the tenants. Other messages are part of Comms.</p>}
          {loadError && <p className="rounded-xl border border-red-200 bg-red-50 p-md text-sm font-semibold text-red-800">{loadError}</p>}
          {!house && !loadError && <p className="text-sm text-neutral-400">Loading the house…</p>}

          {house && receipt && (
            <div className="space-y-sm rounded-xl border border-green-200 bg-green-50 p-lg text-sm text-green-900">
              <p className="text-base font-bold">✓ Sent at {receipt.at}</p>
              <p>To {receipt.names.join(', ')}.</p>
              <ul className="space-y-xs text-xs">
                <li>In their app: {receipt.recipientCount}</li>
                <li>Phone notifications: {receipt.pushCount} {receipt.pushCount === 1 ? 'device' : 'devices'}{receipt.pushCount === 0 && channels !== 'push_email_sms' ? ' — no one picked has the app on their phone yet' : ''}</li>
                {channels !== 'push_only' && <li>Emails: {receipt.emailCount}</li>}
                {channels === 'push_email_sms' && <li>Texts: {receipt.smsCount}{receipt.smsFailed.length ? ` — not texted: ${receipt.smsFailed.join(', ')}` : ''}</li>}
                {receipt.pinned && <li>Pinned to the house notice board</li>}
                {receipt.others && <li>{receipt.others}</li>}
              </ul>
              <div className="flex gap-sm pt-sm">
                <button onClick={sendAnother} className="rounded-lg bg-green-800 px-md py-sm text-sm font-bold text-white hover:bg-green-700">Send another</button>
                <button onClick={onClose} className="rounded-lg border border-green-300 bg-white px-md py-sm text-sm font-bold text-green-900">Close</button>
              </div>
            </div>
          )}

          {house && !receipt && (<>
            {!house.sendingOn && <p className="rounded-xl border border-amber-200 bg-amber-50 p-md text-sm text-amber-900">“Messages you send yourself” is switched off in Settings, so nothing will go until it’s switched back on.</p>}

            {/* 1 — who */}
            <section>
              <p className={label}>Who it’s going to</p>
              <div className="flex flex-wrap gap-sm">
                <button onClick={() => setWho('everyone')} className={chip(who === 'everyone')}>Everyone at the house ({house.tenants.length})</button>
                <button onClick={() => setWho('room')} className={chip(who === 'room')}>One room</button>
                <button onClick={() => setWho('people')} className={chip(who === 'people')}>Pick people</button>
                {!visitsOnly && <button onClick={() => setWho('cleaners')} className={chip(who === 'cleaners')}>Cleaners ({house.cleaners})</button>}
              </div>
              {who === 'room' && (
                <select value={roomId} onChange={e => setRoomId(e.target.value)} className={`${input} mt-sm`}>
                  <option value="">Choose the room…</option>
                  {house.rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              )}
              {who !== 'cleaners' && (
                house.tenants.length === 0
                  ? <p className="mt-sm text-sm text-neutral-500">No one lives at this house at the moment.</p>
                  : <ul className="mt-sm divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-white">
                      {house.tenants.filter(t => who !== 'room' || t.roomId === roomId).map(t => {
                        const on = who === 'people' ? picked.has(t.personId) : true
                        return (
                          <li key={t.personId} className={`flex items-center gap-md px-md py-sm text-sm ${on ? '' : 'opacity-50'}`}>
                            {who === 'people' && (
                              <input type="checkbox" checked={on} aria-label={`Send to ${t.name}`} className="h-4 w-4"
                                onChange={() => setPicked(prev => { const n = new Set(prev); n.has(t.personId) ? n.delete(t.personId) : n.add(t.personId); return n })} />
                            )}
                            <span className="min-w-0 flex-1 truncate font-semibold text-neutral-900">{t.name}</span>
                            <span className="text-xs text-neutral-500">{t.room}</span>
                            <span className={`rounded-full px-sm py-[2px] text-[11px] font-bold ${t.hasApp ? 'bg-green-100 text-green-800' : 'bg-neutral-100 text-neutral-500'}`}>{t.hasApp ? 'App on phone' : t.hasEmail ? 'Email' : 'No email'}</span>
                          </li>
                        )
                      })}
                    </ul>
              )}
            </section>

            {/* 2 — what it's about */}
            <section>
              <p className={label}>What it’s about</p>
              <div className="grid grid-cols-2 gap-sm sm:grid-cols-4">
                {purposes.map(p => (
                  <button key={p.key} onClick={() => choosePurpose(p.key)} title={p.hint}
                    className={`rounded-xl border p-sm text-left transition ${purpose === p.key ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-800 hover:border-neutral-400'}`}>
                    <span className="block text-sm font-bold">{p.label}</span>
                    <span className={`block text-[11px] leading-snug ${purpose === p.key ? 'text-neutral-300' : 'text-neutral-500'}`}>{p.hint}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* 3 — the message */}
            {purpose && purpose !== 'guides' && purpose !== 'other' && (
              <section>
                <p className={label}>Pick a message</p>
                <div className="grid gap-sm sm:grid-cols-2">
                  {TENANT_MESSAGES.filter(m => m.purpose === purpose).map(m => (
                    <button key={m.id} onClick={() => chooseMessage(m)} className={`rounded-lg border px-md py-sm text-left text-sm font-semibold transition ${msg?.id === m.id ? 'border-blue-600 bg-blue-50 text-blue-900' : 'border-neutral-200 bg-white text-neutral-800 hover:border-neutral-400'}`}>{m.name}</button>
                  ))}
                </div>
                {purpose === 'hmo' && <p className="mt-sm text-xs text-neutral-500">The formal reg 7(5) notice letter is on the house’s Compliance tab → HMO licence → Application notice.</p>}
                {purpose === 'feedback' && <p className="mt-sm text-xs text-neutral-500">Answers come into <a href={`/admin/feedback?property=${propertyId}`} className="font-semibold text-blue-700 underline">Tenant feedback</a>, where AI sums up what would improve the house most.</p>}
                {purpose === 'viewings' && <p className="mt-sm text-xs text-neutral-500">Telling one viewer you’re late, or moving a viewing, is in Lettings → Quick Notify.</p>}
              </section>
            )}
            {purpose === 'guides' && (
              <section>
                <p className={label}>Which guide</p>
                <div className="grid gap-sm sm:grid-cols-2">
                  {house.guides.map(g => (
                    <button key={g.slug} onClick={() => g.sections && chooseGuide(g)} disabled={!g.sections}
                      className={`rounded-lg border px-md py-sm text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${link === `/tenant/guides/${g.slug}` ? 'border-blue-600 bg-blue-50 text-blue-900' : 'border-neutral-200 bg-white text-neutral-800 hover:border-neutral-400'}`}>
                      <span className="font-semibold">{g.emoji} {g.title}</span>
                      {!g.sections && <span className="block text-[11px] text-neutral-500">No pages written yet — can’t be sent</span>}
                    </button>
                  ))}
                </div>
              </section>
            )}
            {purpose === 'other' && (
              <section>
                <p className={label}>Ask AI to draft it <span className="font-normal normal-case text-neutral-400">(or just write it below)</span></p>
                <div className="flex gap-sm">
                  <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="e.g. the boiler is being replaced next Tuesday morning" className={input} />
                  <button onClick={draftWithAi} disabled={drafting} className="shrink-0 rounded-lg bg-neutral-900 px-md py-sm text-sm font-bold text-white disabled:opacity-50">{drafting ? 'Drafting…' : 'Draft'}</button>
                </div>
              </section>
            )}

            {msg && msg.fields.length > 0 && (
              <section>
                <p className={label}>Fill in the details</p>
                <div className="grid gap-sm sm:grid-cols-2">
                  {msg.fields.map(f => (
                    <label key={f.key} className={`block text-xs font-semibold text-neutral-700 ${f.type === 'longtext' ? 'sm:col-span-2' : ''}`}>
                      {f.label}
                      {f.type === 'slot' ? (
                        <select value={values[f.key] ?? ''} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} className={`${input} mt-xs`}>
                          {SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : f.type === 'longtext' ? (
                        <textarea rows={2} value={values[f.key] ?? ''} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} className={`${input} mt-xs`} />
                      ) : (
                        <input type={f.type === 'date' ? 'date' : f.type === 'time' ? 'time' : 'text'} value={values[f.key] ?? ''} placeholder={f.placeholder}
                          onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} className={`${input} mt-xs`} />
                      )}
                    </label>
                  ))}
                </div>
              </section>
            )}

            {purpose && (
              <section className="space-y-sm">
                <p className={label}>The message <span className="font-normal normal-case text-neutral-400">(change anything you like)</span></p>
                <input value={subject} onChange={e => setRawSubject(e.target.value)} placeholder="Subject" className={`${input} font-semibold`} />
                <textarea value={body} onChange={e => setRawBody(e.target.value)} rows={7} placeholder="Write your message…" className={input} />
                {missing.length > 0 && <p className="text-xs font-semibold text-amber-700">Still to fill in: {missing.map(k => msg?.fields.find(f => f.key === k)?.label ?? k).join(', ')}</p>}
              </section>
            )}

            {/* 4 — what they'll see */}
            {purpose && subject && body && (
              <section>
                <div className="mb-sm flex items-center justify-between">
                  <p className={`${label} mb-0`}>What {firstName} will see</p>
                  <div className="flex gap-xs">
                    <button onClick={() => setPreviewAs('phone')} className={chip(previewAs === 'phone')}>Phone</button>
                    {channels !== 'push_only' && <button onClick={() => setPreviewAs('email')} className={chip(previewAs === 'email')}>Email</button>}
                  </div>
                </div>
                {previewAs === 'phone' || channels === 'push_only' ? (
                  <div className="mx-auto max-w-sm space-y-sm rounded-[28px] bg-neutral-800 p-md">
                    <div className="rounded-2xl bg-white/90 p-sm shadow">
                      <div className="flex items-center gap-sm text-[11px] text-neutral-500"><span className="grid h-5 w-5 place-items-center rounded bg-[#181614] text-[9px] font-bold text-white">CR</span>Capital Rooms · now</div>
                      <p className="mt-xs text-sm font-bold text-neutral-900">{subject}</p>
                      <p className="line-clamp-2 text-xs text-neutral-700">{body}</p>
                    </div>
                    <div className="rounded-2xl bg-white p-md">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-400">In the app · Messages</p>
                      <p className="mt-xs text-sm font-bold text-neutral-900">{subject}</p>
                      <p className="whitespace-pre-line text-xs leading-relaxed text-neutral-700">{body}</p>
                      {link !== '/tenant/inbox' && <p className="mt-sm inline-block rounded-lg bg-neutral-900 px-md py-xs text-xs font-bold text-white">Open</p>}
                    </div>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white text-sm text-neutral-800">
                    <div className="border-b border-neutral-100 px-md py-sm text-xs text-neutral-500">Subject: <strong className="text-neutral-900">{subject}</strong></div>
                    <div className="space-y-sm px-md py-md">
                      <p>Dear {firstName},</p>
                      <p className="font-bold">{subject}</p>
                      {body.split(/\n{2,}/).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}
                      <p className="inline-block rounded-lg bg-[#181614] px-md py-xs text-xs font-bold text-white">View details</p>
                      <p className="text-xs text-neutral-500">— signed with your email signature, with the Capital Rooms footer</p>
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* 5 — how */}
            {purpose && (
              <section>
                <p className={label}>How to send it</p>
                <div className="grid gap-sm sm:grid-cols-3">
                  {CHANNELS.map(c => (
                    <button key={c.value} onClick={() => setChannels(c.value)} className={`rounded-xl border p-sm text-left transition ${channels === c.value ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-800 hover:border-neutral-400'}`}>
                      <span className="block text-sm font-bold">{c.label}</span>
                      <span className={`block text-[11px] leading-snug ${channels === c.value ? 'text-neutral-300' : 'text-neutral-500'}`}>{c.hint}</span>
                    </button>
                  ))}
                </div>
                {who !== 'cleaners' && (
                  <label className="mt-sm flex items-center gap-sm text-sm text-neutral-700">
                    <input type="checkbox" checked={pin} onChange={e => setPin(e.target.checked)} className="h-4 w-4" />
                    Also pin it to the house notice board
                  </label>
                )}
                <div className="mt-md rounded-xl border border-neutral-200 bg-white p-md">
                  <p className="mb-xs text-xs font-bold uppercase tracking-wide text-neutral-500">Also tell <span className="font-normal normal-case text-neutral-400">(people there who aren’t on CROS — optional)</span></p>
                  <PeoplePicker value={alsoTell} onChange={setAlsoTell} compact />
                </div>
              </section>
            )}

            {error && <p className="rounded-xl border border-red-200 bg-red-50 p-md text-sm font-semibold text-red-800">{error}</p>}
          </>)}
        </div>

        {/* footer: the summary and the button */}
        {house && !receipt && (
          <div className="flex flex-wrap items-center justify-between gap-sm border-t border-neutral-200 bg-white px-lg py-md">
            <p className="text-xs text-neutral-600">
              {who === 'cleaners' ? `${count} cleaner${count === 1 ? '' : 's'}` : `${count} ${count === 1 ? 'person' : 'people'} at ${house.property.name}`}
              {who !== 'cleaners' && count > 0 && <> · {withApp} with the app on their phone</>}
            </p>
            <div className="flex gap-sm">
              <button onClick={onClose} className="rounded-lg border border-neutral-200 px-md py-sm text-sm font-semibold text-neutral-700">Cancel</button>
              <button onClick={send} disabled={!canSend || sending || !purpose || !house.sendingOn || count === 0 || !subject.trim() || !body.trim()}
                className="rounded-lg bg-blue-600 px-lg py-sm text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                {sending ? 'Sending…' : `Send to ${count} ${count === 1 ? 'person' : 'people'}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
