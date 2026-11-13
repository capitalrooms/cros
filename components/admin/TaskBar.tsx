'use client'
// The task bar (13 Nov 2026, Harry: "literally say what we want to do … then it shows you the options before sending").
// Type what you want done; CROS looks up the people and property (/api/admin/task, lib/taskbar/plan) and answers, asks
// which one, or fills in a card for each step. Every card is checked and edited here, and nothing happens until you
// press its button — which goes through the same route as the matching screen, so the same checks apply.
// Opens from the top bar, ⌘J anywhere, or "Ask CROS to do this" in search (an event: cros:task).
// The look follows the Ask bar from the tenant app designs: a pill with the spark in a filled circle.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminFetch } from '@/lib/adminFetch'
import type { Action, Plan } from '@/lib/taskbar/plan'

type Card = Action & { _state?: 'busy' | 'done' | 'error' | 'gone'; _note?: string; _link?: string; _dup?: boolean }
type Turn = { you: string; reply?: Omit<Plan, 'actions'>; cards?: Card[]; error?: string }

const EXAMPLES = [
  'Email the tenant of Room 2 at Crownfield to say the cleaner is coming Thursday',
  'Add the WiFi password Skyline-4471 to Crownfield Road',
  'Send the tenant of Room 3 at Saltwell their full rent payment history',
  'Get quotes to paint Room 2 at Claverton from my usual decorators',
  'Lewisham 2-bed rents over the last 6 months — email it to Chris',
  'Market analysis for 1 beds in Newham for a new landlord; furnished could beat the average',
  'Text everyone at Willis Road that the boiler engineer comes tomorrow morning',
  'Add a £85 plumber invoice to Alloa Road, dated today',
  'Draft a newsletter to landlords about the Renters’ Rights changes',
  'Who lives at Spurgeon Road?',
]
const IDEAS: [string, string[]][] = [
  ['Tell someone', ['Email the tenant of [room] at [property] that…', 'Text everyone at [property] that…', 'Send [tenant] their rent payment history']],
  ['Property', ['Add the WiFi details to [property]: network … password …', 'Get quotes to [job] in [room] at [property]', 'Add a £[amount] [supplier] invoice to [property]']],
  ['Market & news', ['[Borough] [n]-bed rents over the last 6 months for [landlord]', 'Market analysis for a new landlord in [borough]', 'Draft an announcement to landlords about…']],
  ['Find out', ['Who lives at [property]?', 'When did we last charge a TV licence at [property]?', 'When does [tenant]’s tenancy end?']],
]
const KIND: Record<Action['kind'], string> = { message: 'Email or text', house_message: 'Message the house', wifi: 'WiFi details', quotes: 'Ask for quotes', market_report: 'Market report', expense: 'Add an expense', publish: 'Draft in Publish', open: 'Open' }

const Spark = ({ size = 18 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden><path d="M12 3l1.8 4.6L18 9.4l-4.2 1.8L12 16l-1.8-4.8L6 9.4l4.2-1.8z" /><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z" /></svg>
const field = 'mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm text-neutral-900 disabled:bg-neutral-50 disabled:text-neutral-600'
const lab = 'block text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500'

/** The top-bar pill. */
export function TaskBarButton() {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('cros:task', { detail: '' }))} aria-label="Ask CROS to do something"
      className="flex h-8 items-center gap-2 rounded-full border border-neutral-300 bg-white py-0 pl-1 pr-1 text-left text-[13px] text-neutral-500 hover:border-neutral-500 sm:pr-3">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--accent,#E8B931)] text-[var(--ink,#23261A)]"><Spark size={14} /></span>
      <span className="hidden sm:inline">What do you need to do?</span>
      <kbd className="hidden rounded border border-neutral-200 px-1 text-[10px] text-neutral-400 lg:inline">⌘J</kbd>
    </button>
  )
}

export default function TaskBar() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [thinking, setThinking] = useState(false)
  const [ex, setEx] = useState(0)
  const input = useRef<HTMLTextAreaElement>(null)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onTask = (e: Event) => { setOpen(true); const t = (e as CustomEvent).detail; if (t) setText(String(t)); setTimeout(() => input.current?.focus(), 0) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'j' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setOpen(true); setTimeout(() => input.current?.focus(), 0) } }
    window.addEventListener('cros:task', onTask); window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('cros:task', onTask); window.removeEventListener('keydown', onKey) }
  }, [])
  useEffect(() => { if (!open || text) return; const t = setInterval(() => setEx(i => (i + 1) % EXAMPLES.length), 3500); return () => clearInterval(t) }, [open, text])
  useEffect(() => { end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }) }, [turns, thinking])

  const ask = useCallback(async (said: string) => {
    const t = said.trim(); if (t.length < 3 || thinking) return
    const history = turns.flatMap(x => [{ role: 'user' as const, content: x.you }, ...(x.reply ? [{ role: 'assistant' as const, content: [x.reply.message, ...(x.cards ?? []).map(c => `[proposed: ${c.title}]`)].join(' ') }] : [])])
    setTurns(v => [...v, { you: t }]); setText(''); setThinking(true)
    const r = await adminFetch('/api/admin/task', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t, history }) }).catch(() => null)
    const j = r ? await r.json().catch(() => ({})) : {}
    setThinking(false)
    setTurns(v => v.map((x, i) => i !== v.length - 1 ? x : r?.ok ? { ...x, reply: { message: j.message, choices: j.choices ?? [] }, cards: j.actions ?? [] } : { ...x, error: j.error || 'That didn’t work — try again.' }))
  }, [turns, thinking])

  const setCard = (ti: number, ci: number, patch: Partial<Card>) => setTurns(v => v.map((x, i) => i !== ti ? x : { ...x, cards: (x.cards ?? []).map((c, k) => k !== ci ? c : { ...c, ...patch } as Card) }))

  async function run(ti: number, ci: number) {
    const c = turns[ti]?.cards?.[ci]; if (!c) return
    const post = (url: string, body: unknown) => adminFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => ({ ok: r.ok, status: r.status, j: await r.json().catch(() => ({})) as any }))
    const fail = (note: string) => setCard(ti, ci, { _state: 'error', _note: note })
    setCard(ti, ci, { _state: 'busy', _note: '' })
    try {
      if (c.kind === 'open') { setOpen(false); router.push(c.href); setCard(ti, ci, { _state: 'done', _note: 'Opened' }); return }
      if (c.kind === 'message') {
        const r = await post('/api/notify/contacts', { recipients: c.recipients, subject: c.subject, message: c.message, email: c.email, sms: c.sms, statementTenancyId: c.statementTenancyId || undefined })
        if (!r.ok && !r.j.emailed && !r.j.texted) return fail(r.j.error || (r.j.failed ?? []).map((f: any) => `${f.who}: ${f.email ?? f.text}`).join('; ') || 'Not sent')
        return setCard(ti, ci, { _state: 'done', _note: [r.j.emailed ? `Emailed ${r.j.emailed}` : '', r.j.texted ? `texted ${r.j.texted}` : '', r.j.failed?.length ? `${r.j.failed.length} failed` : ''].filter(Boolean).join(', ') })
      }
      if (c.kind === 'house_message') {
        const r = await post('/api/admin/quick-notify', { property_id: c.propertyId, recipient_type: c.roomId ? 'room' : 'all', room_id: c.roomId || undefined, subject: c.subject, message: c.message, channels: c.channels })
        if (!r.ok) return fail(r.j.error || 'Not sent')
        return setCard(ti, ci, { _state: 'done', _note: `Sent to ${r.j.recipientCount} — ${r.j.emailCount ?? 0} by email${r.j.pushCount ? `, ${r.j.pushCount} on the app` : ''}${r.j.smsCount ? `, ${r.j.smsCount} by text` : ''}` })
      }
      if (c.kind === 'wifi') {
        // keep everything else on an existing internet account — only the WiFi details change
        let existing: any = {}
        if (c.serviceId) { const g = await adminFetch(`/api/admin/property-services?propertyId=${c.propertyId}`).then(r => r.json()).catch(() => ({})); existing = (g.services ?? []).find((x: any) => x.id === c.serviceId) ?? {} }
        const r = await post('/api/admin/property-services', { propertyId: c.propertyId, service: { ...existing, id: c.serviceId || undefined, kind: 'internet', supplier: c.supplier ?? existing.supplier ?? null, wifi_network: c.network, wifi_password: c.password } })
        if (!r.ok) return fail(r.j.error || 'Not saved')
        return setCard(ti, ci, { _state: 'done', _note: 'Saved — tenants see it in their house info', _link: `/admin/properties/${c.propertyId}?tab=services` })
      }
      if (c.kind === 'quotes') {
        if (!c.contractors.length && !c.others?.length) return fail('Choose at least one contractor')
        const a = await post('/api/admin/maintenance/arrange', { roomId: c.roomId, title: c.job, details: c.details, when: c.when, mode: 'quotes' })
        if (!a.ok || !a.j.ticketId) return fail(a.j.error || 'The job wasn’t made')
        const q = await post('/api/admin/quotes', { ticketId: a.j.ticketId, contractorIds: c.contractors.map(x => x.id), others: c.others ?? [], message: c.message || null })
        if (!q.ok) return fail(`The job was made but the quote requests didn’t go: ${q.j.error ?? 'error'}`)
        return setCard(ti, ci, { _state: 'done', _note: `Asked ${c.contractors.length + (c.others?.length ?? 0)} for a quote`, _link: `/admin/maintenance?ticket=${a.j.ticketId}` })
      }
      if (c.kind === 'market_report') {
        if (!c.to?.email) return fail('Add who it goes to')
        const r = await post('/api/admin/market/report', { action: 'email', codes: c.codes, commentary: c.commentary ?? '', landlordId: c.landlordId || undefined, to: c.to.email, name: c.to.name })
        if (!r.ok) return fail(r.j.error || 'Not sent')
        return setCard(ti, ci, { _state: 'done', _note: `Emailed to ${c.to.email} with the PDF` })
      }
      if (c.kind === 'expense') {
        const r = await post('/api/admin/expenses', { property_id: c.propertyId, description: c.description, amount: c.amount, expense_date: c.expense_date, supplier: c.supplier || null, invoice_number: c.invoice_number || null, confirm_duplicate: !!c._dup })
        if (r.j.duplicates) return setCard(ti, ci, { _state: 'error', _dup: true, _note: `This looks like one already on record (${r.j.duplicates.map((d: any) => [d.description, d.amount != null ? `£${d.amount}` : '', d.date ?? d.expense_date].filter(Boolean).join(' ')).slice(0, 2).join('; ')}). Press again to add it anyway.` })
        if (!r.ok) return fail(r.j.error || 'Not added')
        return setCard(ti, ci, { _state: 'done', _note: r.j.message || 'Added', _link: '/admin/expenses' })
      }
      if (c.kind === 'publish') {
        const n = await post('/api/admin/publish', { template: 'announcement', kind: 'announcement' })
        if (!n.ok || !n.j.id) return fail(n.j.error || 'Couldn’t start it')
        const w = await post(`/api/admin/publish/${n.j.id}`, { action: 'write', brief: c.brief, tone: c.tone, withMarket: c.withMarket })
        setCard(ti, ci, { _state: 'done', _note: w.ok ? 'Drafted — check it, choose who gets it, then send' : 'Started — the writing didn’t come back, write it there', _link: `/admin/publish/${n.j.id}` })
        return
      }
    } catch (e) { fail(e instanceof Error ? e.message : 'That didn’t work') }
  }

  if (!open) return null
  const idle = !turns.length
  return (
    <div className="fixed inset-0 z-[85] flex items-start justify-center bg-black/35 px-3 pt-[6vh] sm:pt-[9vh]" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false) }}>
      <div role="dialog" aria-label="Ask CROS to do something" className="flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-[22px] bg-[#F7F5EF] shadow-2xl ring-1 ring-black/5">
        {/* the bar */}
        <div className="flex items-start gap-2.5 border-b border-neutral-200 bg-white p-2.5">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--accent,#E8B931)] text-[var(--ink,#23261A)]"><Spark /></span>
          <textarea ref={input} rows={1} value={text} onChange={e => setText(e.target.value)} placeholder={EXAMPLES[ex]} aria-label="What do you need to do?"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(text) } else if (e.key === 'Escape') setOpen(false) }}
            className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent py-2 text-[15.5px] leading-snug text-neutral-950 outline-none placeholder:text-neutral-400" style={{ fieldSizing: 'content' } as any} />
          <button type="button" onClick={() => ask(text)} disabled={text.trim().length < 3 || thinking} className="mt-0.5 h-9 shrink-0 rounded-full bg-[var(--ink,#23261A)] px-4 text-sm font-semibold text-white disabled:opacity-30">Go</button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-4">
          {idle && (
            <div className="space-y-3">
              <p className="text-sm text-neutral-600">Say what you want done, the way you’d tell a colleague. CROS finds the people and property and sets it up for you to check — <b className="font-semibold text-neutral-800">nothing goes until you press send</b>.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {IDEAS.map(([group, items]) => (
                  <div key={group} className="rounded-2xl bg-white p-3 ring-1 ring-neutral-200">
                    <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-neutral-400">{group}</p>
                    <div className="mt-1.5 flex flex-col items-start gap-1">{items.map(t => <button key={t} type="button" onClick={() => { setText(t); input.current?.focus() }} className="text-left text-[13px] text-neutral-700 hover:text-neutral-950 hover:underline">{t}</button>)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4">
            {turns.map((t, ti) => (
              <div key={ti} className="space-y-2">
                <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-[var(--ink,#23261A)] px-3.5 py-2 text-sm text-white">{t.you}</p>
                {t.error && <p className="text-sm text-red-700">{t.error}</p>}
                {t.reply && (
                  <div className="space-y-2">
                    {t.reply.message && <p className="max-w-[90%] whitespace-pre-line text-sm text-neutral-800">{t.reply.message}</p>}
                    {t.reply.choices.length > 0 && <div className="flex flex-wrap gap-1.5">{t.reply.choices.map(c => <button key={c} type="button" disabled={thinking} onClick={() => ask(c)} className="rounded-full bg-white px-3 py-1 text-[13px] font-medium text-neutral-800 ring-1 ring-neutral-300 hover:ring-neutral-700">{c}</button>)}</div>}
                    {(t.cards ?? []).map((c, ci) => c._state === 'gone' ? null : <CardView key={ci} c={c} set={p => setCard(ti, ci, p)} run={() => run(ti, ci)} onLink={href => { setOpen(false); router.push(href) }} />)}
                  </div>
                )}
              </div>
            ))}
            {thinking && <p className="flex items-center gap-2 text-sm text-neutral-500"><span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--accent,#E8B931)]" /> Looking it up…</p>}
            <div ref={end} />
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-neutral-200 bg-white px-4 py-2 text-[11px] text-neutral-500">
          <span>Enter to go · Shift+Enter for a new line · Esc to close</span>
          {!idle && <button type="button" onClick={() => setTurns([])} className="font-semibold underline">Start again</button>}
        </div>
      </div>
    </div>
  )
}

function CardView({ c, set, run, onLink }: { c: Card; set: (p: Partial<Card>) => void; run: () => void; onLink: (href: string) => void }) {
  const done = c._state === 'done', busy = c._state === 'busy', lock = done || busy
  const f = (k: string, v: unknown) => set({ [k]: v } as any)
  const verb = c.kind === 'message' ? `Send${c.email && c.sms ? ' email and text' : c.sms ? ' text' : ' email'}${c.recipients.length > 1 ? ` to ${c.recipients.length}` : ''}`
    : c.kind === 'house_message' ? `Send to ${c.roomName ? c.roomName : 'everyone'}` : c.kind === 'wifi' ? 'Save WiFi details' : c.kind === 'quotes' ? `Ask ${c.contractors.length + (c.others?.length ?? 0)} for quotes`
    : c.kind === 'market_report' ? 'Email the report' : c.kind === 'expense' ? (c._dup ? 'Add it anyway' : `Add £${c.amount.toFixed(2)}`) : c.kind === 'publish' ? 'Draft it' : 'Open'
  const gaps = JSON.stringify(c).match(/\[[^\]"]{2,60}\]/g)
  return (
    <div className={`rounded-2xl bg-white p-3 ring-1 ${done ? 'ring-emerald-300' : 'ring-neutral-200'}`}>
      <div className="flex items-start justify-between gap-2">
        <div><p className="text-[11px] font-bold uppercase tracking-[0.1em] text-neutral-400">{KIND[c.kind]}</p><p className="font-semibold text-neutral-900">{c.title}</p></div>
        {!lock && <button type="button" onClick={() => set({ _state: 'gone' })} className="text-xs text-neutral-400 hover:text-neutral-700">Remove</button>}
      </div>

      <div className="mt-2 space-y-2">
        {c.kind === 'message' && (<>
          <div className="flex flex-wrap gap-1">{c.recipients.map((r, i) => <span key={i} className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs text-neutral-800">{r.name || r.email || r.phone}<span className="text-neutral-500">{c.email && r.email ? ` · ${r.email}` : ''}{c.sms && r.phone ? ` · ${r.phone}` : ''}</span></span>)}</div>
          <div className="flex gap-3 text-xs text-neutral-700"><label className="flex items-center gap-1"><input type="checkbox" disabled={lock} checked={c.email} onChange={e => f('email', e.target.checked)} /> Email</label><label className="flex items-center gap-1"><input type="checkbox" disabled={lock} checked={c.sms} onChange={e => f('sms', e.target.checked)} /> Text</label>{c.statementTenancyId && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-900">+ statement of account PDF</span>}</div>
          {c.email && <label className={lab}>Subject<input disabled={lock} value={c.subject} onChange={e => f('subject', e.target.value)} className={field} /></label>}
          <label className={lab}>Message <span className="normal-case tracking-normal text-neutral-400">— “Hi [name],” and your sign-off are added</span><textarea disabled={lock} rows={4} value={c.message} onChange={e => f('message', e.target.value)} className={field} /></label>
        </>)}
        {c.kind === 'house_message' && (<>
          <p className="text-xs text-neutral-600">{c.roomName ? `Whoever lives in ${c.roomName} at ${c.propertyName} now` : `Everyone living at ${c.propertyName} now`} — in their app inbox, plus
            <select disabled={lock} value={c.channels} onChange={e => f('channels', e.target.value)} className="ml-1 rounded border border-neutral-300 bg-white px-1 py-0.5"><option value="push_email">app notification and email</option><option value="email_only">email</option><option value="push_email_sms">app, email and text</option><option value="sms_only">text</option></select></p>
          <label className={lab}>Subject<input disabled={lock} value={c.subject} onChange={e => f('subject', e.target.value)} className={field} /></label>
          <label className={lab}>Message<textarea disabled={lock} rows={4} value={c.message} onChange={e => f('message', e.target.value)} className={field} /></label>
        </>)}
        {c.kind === 'wifi' && (<>
          <p className="text-xs text-neutral-600">{c.propertyName}{c.serviceId ? ' — updates its internet account' : ' — adds an internet account'}</p>
          <div className="grid gap-2 sm:grid-cols-3"><label className={lab}>Network<input disabled={lock} value={c.network} onChange={e => f('network', e.target.value)} className={field} /></label><label className={lab}>Password<input disabled={lock} value={c.password} onChange={e => f('password', e.target.value)} className={field} /></label><label className={lab}>Supplier<input disabled={lock} value={c.supplier ?? ''} onChange={e => f('supplier', e.target.value)} className={field} /></label></div>
        </>)}
        {c.kind === 'quotes' && (<>
          <p className="text-xs text-neutral-600">{c.roomName}, {c.propertyName} · <select disabled={lock} value={c.when} onChange={e => f('when', e.target.value)} className="rounded border border-neutral-300 bg-white px-1 py-0.5"><option value="empty">while the room is empty</option><option value="asap">as soon as possible</option></select></p>
          <label className={lab}>The job<input disabled={lock} value={c.job} onChange={e => f('job', e.target.value)} className={field} /></label>
          <label className={lab}>Details for the contractors<textarea disabled={lock} rows={3} value={c.details} onChange={e => f('details', e.target.value)} className={field} /></label>
          <div className="flex flex-wrap gap-1">{c.contractors.map(x => <span key={x.id} className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs">{x.name}{!lock && <button type="button" aria-label={`Remove ${x.name}`} onClick={() => f('contractors', c.contractors.filter(y => y.id !== x.id))}>×</button>}</span>)}
            {(c.others ?? []).map(x => <span key={x.email} className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs">{x.name || x.email} <span className="text-neutral-500">· {x.email}</span>{!lock && <button type="button" aria-label={`Remove ${x.name || x.email}`} onClick={() => f('others', (c.others ?? []).filter(y => y.email !== x.email))}>×</button>}</span>)}</div>
        </>)}
        {c.kind === 'market_report' && (<>
          <p className="text-xs text-neutral-600">{c.areaNames.join(', ') || c.codes.join(', ')} · official ONS rents and Land Registry prices, with a PDF{c.focus ? ` · focus: ${c.focus}` : ''}</p>
          <div className="grid gap-2 sm:grid-cols-2"><label className={lab}>To (name)<input disabled={lock} value={c.to?.name ?? ''} onChange={e => f('to', { name: e.target.value, email: c.to?.email ?? '' })} className={field} /></label><label className={lab}>Email<input disabled={lock} value={c.to?.email ?? ''} onChange={e => f('to', { name: c.to?.name ?? '', email: e.target.value })} className={field} /></label></div>
          <label className={lab}>The commentary — edit freely<textarea disabled={lock} rows={8} value={c.commentary ?? ''} onChange={e => f('commentary', e.target.value)} className={field} /></label>
          {!c.commentary && <p className="text-xs text-amber-800">The commentary didn’t come back — write a few lines, or the report goes with figures only.</p>}
        </>)}
        {c.kind === 'expense' && (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={`${lab} sm:col-span-2`}>Description<input disabled={lock} value={c.description} onChange={e => f('description', e.target.value)} className={field} /></label>
            <label className={lab}>Amount £<input disabled={lock} type="number" step="0.01" value={c.amount} onChange={e => f('amount', Number(e.target.value))} className={field} /></label>
            <label className={lab}>Date<input disabled={lock} type="date" value={c.expense_date} onChange={e => f('expense_date', e.target.value)} className={field} /></label>
            <label className={lab}>Supplier<input disabled={lock} value={c.supplier ?? ''} onChange={e => f('supplier', e.target.value)} className={field} /></label>
            <label className={lab}>Invoice no.<input disabled={lock} value={c.invoice_number ?? ''} onChange={e => f('invoice_number', e.target.value)} className={field} /></label>
            <p className="text-xs text-neutral-500 sm:col-span-2">{c.propertyName} — comes off the next statement that hasn’t gone out.</p>
          </div>
        )}
        {c.kind === 'publish' && (<>
          <label className={lab}>Notes for the writer<textarea disabled={lock} rows={3} value={c.brief} onChange={e => f('brief', e.target.value)} className={field} /></label>
          <p className="text-xs text-neutral-600">Tone <select disabled={lock} value={c.tone} onChange={e => f('tone', e.target.value)} className="rounded border border-neutral-300 bg-white px-1 py-0.5"><option value="friendly">friendly</option><option value="professional">professional</option><option value="celebratory">celebratory</option><option value="important">important</option></select> · <label className="inline-flex items-center gap-1"><input type="checkbox" disabled={lock} checked={c.withMarket} onChange={e => f('withMarket', e.target.checked)} /> use market figures</label> · you choose who gets it in Publish</p>
        </>)}
        {c.kind === 'open' && <p className="text-xs text-neutral-600">{c.href}</p>}
      </div>

      {gaps && !done && <p className="mt-2 text-xs font-semibold text-amber-800">Fill in {[...new Set(gaps)].join(', ')} first.</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!done && <button type="button" disabled={busy || !!gaps} onClick={run} className={`rounded-full px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40 ${c.kind === 'open' ? 'bg-neutral-700' : 'bg-emerald-700'}`}>{busy ? 'Working…' : verb}</button>}
        {c._note && <span className={`text-xs ${done ? 'font-semibold text-emerald-800' : 'text-red-700'}`}>{done ? '✓ ' : ''}{c._note}</span>}
        {done && c._link && <button type="button" onClick={() => onLink(c._link!)} className="text-xs font-semibold underline">View</button>}
      </div>
    </div>
  )
}
