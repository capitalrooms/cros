'use client'

// The tenant's online move-out form (4 Nov 2026, Harry: the attached PDF "can't easily be filled in … very boring to
// look at"; "can the tenants book a cleaner for their final day which we will deduct from their deposit — £20 per
// hour"). Reached from the move-out email; no sign-in (a signed link). Saved to CROS as they send it, and they can come
// back to change it. Public frame (components/public/PublicShell) with the office's Forest and brand gold inside.
import { use, useEffect, useMemo, useState } from 'react'
import PublicShell from '@/components/public/PublicShell'

interface View {
  firstName: string; place: string; whole: boolean; moveOutDate: string | null; deposit: number | null; depositProtected: boolean
  rate: number; checklist: { title: string; items: string[] }[]; charges: [string, string][]
  saved: { answers: any; cleaner_hours: number | null; cleaner_agreed_at: string | null; updated_at: string } | null
  ready: boolean; contact: { email: string; phone: string }
}
const F = { forest: '#1F3B2E', gold: '#C4922A', ink: '#132219', text: '#3A4A40', muted: '#5C6B62', mint: '#E6EFE8', cream: '#F8F0DE', line: '#DCE3DD' }
const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const day = (iso: string | null) => iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''
const HOURS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8]

const input = 'w-full rounded-xl border px-4 py-3 text-[16px] outline-none focus:ring-2'   // 16px stops phones zooming in
const inputStyle = { borderColor: F.line, color: F.ink, background: '#fff' } as const

function Section({ title, sub, children, tint }: { title: string; sub?: string; children: React.ReactNode; tint?: string }) {
  return (
    <section className="rounded-3xl p-5 md:p-7" style={{ background: tint ?? '#fff', border: tint ? 'none' : `1px solid ${F.line}` }}>
      <h2 className="text-[20px] font-extrabold leading-tight" style={{ color: F.forest, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" }}>{title}</h2>
      {sub && <p className="mt-1 text-[14px] leading-relaxed" style={{ color: F.muted }}>{sub}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[13px] font-bold" style={{ color: F.ink }}>{label}</span>{children}</label>
}

export default function MoveOutForm({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [v, setV] = useState<View | null>(null)
  const [error, setError] = useState('')
  const [a, setA] = useState<any>({ meters: {}, ticked: [] })
  const [hours, setHours] = useState<number | null>(null)
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetch(`/api/moveout/${token}`).then(async r => {
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error ?? 'This link isn’t right.'); return }
      setV(d)
      if (d.saved) { setA({ meters: {}, ticked: [], ...d.saved.answers }); setHours(d.saved.cleaner_hours ?? null); setAgreed(!!d.saved.cleaner_agreed_at); setDone(d.saved.updated_at) }
    }).catch(() => setError('Couldn’t load your form — check your connection and try again.'))
  }, [token])

  const set = (k: string, val: unknown) => setA((x: any) => ({ ...x, [k]: val }))
  const setMeter = (k: string, val: string) => setA((x: any) => ({ ...x, meters: { ...(x.meters ?? {}), [k]: val } }))
  const tick = (item: string) => setA((x: any) => ({ ...x, ticked: (x.ticked ?? []).includes(item) ? x.ticked.filter((i: string) => i !== item) : [...(x.ticked ?? []), item] }))
  const cost = useMemo(() => (hours ?? 0) * (v?.rate ?? 20), [hours, v])

  async function save() {
    if (hours && !agreed) { setMsg(`Tick the box to say ${gbp(cost)} can come off your deposit — or choose “No thanks”.`); return }
    setBusy(true); setMsg('')
    const r = await fetch(`/api/moveout/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: a, cleanerHours: hours, cleanerAgreed: agreed }) })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setMsg(d.error ?? 'Couldn’t send it — try again.'); return }
    setDone(d.savedAt); window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (error) return <PublicShell label="Move-out"><div className="mx-auto max-w-xl px-6 py-16"><p className="text-[16px]" style={{ color: F.ink }}>{error}</p></div></PublicShell>
  if (!v) return <PublicShell label="Move-out"><div className="mx-auto max-w-xl px-6 py-16"><p style={{ color: F.muted }}>Opening your form…</p></div></PublicShell>

  return (
    <PublicShell label="Move-out">
      <div className="mx-auto max-w-2xl space-y-5 px-4 py-6 md:py-10" style={{ color: F.text }}>
        {/* the date, big */}
        <section className="rounded-3xl p-6 md:p-8" style={{ background: F.forest, borderBottom: `6px solid ${F.gold}` }}>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: F.gold }}>Your move-out · {v.place}</p>
          <h1 className="mt-2 text-[30px] font-extrabold leading-tight text-white md:text-[38px]" style={{ fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" }}>{day(v.moveOutDate) || 'Your move-out'}</h1>
          <p className="mt-2 text-[15px]" style={{ color: '#D7E2DA' }}>Hi {v.firstName} — a few details so your move-out and deposit go smoothly. It saves when you press Send, and you can come back to change it.</p>
        </section>

        {done && <div className="rounded-2xl px-5 py-4 text-[15px] font-semibold" style={{ background: F.mint, color: F.forest }}>✓ Thank you — we’ve got your form{hours ? ` and booked our cleaner for ${hours} hour${hours === 1 ? '' : 's'}` : ''}. You can change anything and send it again.</div>}
        {!v.ready && <div className="rounded-2xl px-5 py-4 text-[14px]" style={{ background: F.cream }}>We’re just setting this form up — if it won’t send, reply to your move-out email with your answers instead.</div>}

        <Section title="Where to reach you" sub="For your deposit letters, and any post that arrives after you go.">
          <Field label="Forwarding address"><textarea rows={3} className={input} style={inputStyle} value={a.forwardingAddress ?? ''} onChange={e => set('forwardingAddress', e.target.value)} autoComplete="street-address" /></Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Phone after you move"><input type="tel" className={input} style={inputStyle} value={a.phoneAfter ?? ''} onChange={e => set('phoneAfter', e.target.value)} autoComplete="tel" /></Field>
            <Field label="Email after you move"><input type="email" className={input} style={inputStyle} value={a.emailAfter ?? ''} onChange={e => set('emailAfter', e.target.value)} autoComplete="email" /></Field>
          </div>
        </Section>

        {/* the cleaner — the new bit */}
        <Section title={`Book our cleaner — ${gbp(v.rate)} an hour`} sub={`Skip the last-day scrub. Our cleaner comes on your move-out day and the cost comes off your deposit — nothing to pay now.${v.whole ? '' : ' Most rooms take two to three hours.'}`} tint={F.cream}>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { setHours(null); setAgreed(false) }} className="rounded-full px-4 py-2 text-[15px] font-semibold" style={hours === null ? { background: F.forest, color: '#fff' } : { background: '#fff', color: F.ink, border: `1px solid ${F.line}` }}>No thanks</button>
            {HOURS.map(h => (
              <button key={h} type="button" onClick={() => setHours(h)} className="rounded-full px-4 py-2 text-[15px] font-semibold" style={hours === h ? { background: F.forest, color: '#fff' } : { background: '#fff', color: F.ink, border: `1px solid ${F.line}` }}>{h} hr{h === 1 ? '' : 's'}</button>
            ))}
          </div>
          {hours !== null && (
            <div className="rounded-2xl bg-white p-4">
              <p className="text-[15px]" style={{ color: F.ink }}><b>{hours} hour{hours === 1 ? '' : 's'}</b> × {gbp(v.rate)} = <b style={{ color: F.forest, fontSize: 20 }}>{gbp(cost)}</b></p>
              <label className="mt-3 flex items-start gap-3 text-[15px]" style={{ color: F.ink }}>
                <input type="checkbox" className="mt-1 h-5 w-5" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
                <span>Please book the clean for my move-out day and take <b>{gbp(cost)}</b> from my deposit.</span>
              </label>
            </div>
          )}
        </Section>

        {v.whole && (
          <Section title="Meter readings" sub="On the day you leave — keep a photo of each.">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Gas"><input inputMode="numeric" className={input} style={inputStyle} value={a.meters?.gas ?? ''} onChange={e => setMeter('gas', e.target.value)} /></Field>
              <Field label="Electricity"><input inputMode="numeric" className={input} style={inputStyle} value={a.meters?.electricity ?? ''} onChange={e => setMeter('electricity', e.target.value)} /></Field>
              <Field label="Water (if metered)"><input inputMode="numeric" className={input} style={inputStyle} value={a.meters?.water ?? ''} onChange={e => setMeter('water', e.target.value)} /></Field>
              <Field label="Date and time read"><input className={input} style={inputStyle} value={a.meters?.readAt ?? ''} onChange={e => setMeter('readAt', e.target.value)} /></Field>
            </div>
          </Section>
        )}

        <Section title="Keys" sub="Every key, fob and permit we gave you — and any copies you had cut.">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={v.whole ? 'Keys and fobs you’re returning' : 'Keys you’re returning (room, front door, fob)'}><input className={input} style={inputStyle} value={a.keys ?? ''} onChange={e => set('keys', e.target.value)} /></Field>
            <Field label="When you’ll hand them back"><input type="date" className={input} style={inputStyle} value={a.keysOn ?? ''} onChange={e => set('keysOn', e.target.value)} /></Field>
          </div>
        </Section>

        <Section title="Anything we should know" sub="Something broken, worn or not working — telling us now is always better than finding it at check-out.">
          <Field label="Broken, worn or not working"><textarea rows={3} className={input} style={inputStyle} value={a.issues ?? ''} onChange={e => set('issues', e.target.value)} /></Field>
          <Field label="Anything else — best times for the check-out, questions"><textarea rows={3} className={input} style={inputStyle} value={a.other ?? ''} onChange={e => set('other', e.target.value)} /></Field>
        </Section>

        <Section title="Before you hand back the keys" sub="Tick them off as you go — it’s saved with your form.">
          {v.checklist.map(g => (
            <div key={g.title}>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: F.muted }}>{g.title}</p>
              <div className="space-y-2">
                {g.items.map(it => (
                  <label key={it} className="flex items-start gap-3 rounded-xl px-3 py-2.5 text-[15px]" style={{ background: (a.ticked ?? []).includes(it) ? F.mint : '#F6F8F6', color: F.ink }}>
                    <input type="checkbox" className="mt-1 h-5 w-5" checked={(a.ticked ?? []).includes(it)} onChange={() => tick(it)} /><span>{it}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </Section>

        <Section title="How check-out and your deposit work">
          <ol className="space-y-3 text-[15px] leading-relaxed">
            <li><b style={{ color: F.ink }}>Check-out.</b> On or just before {day(v.moveOutDate)} we check {v.whole ? 'the property' : 'your room'} against your move-in inventory. We’ll agree a time — you’re welcome to be there.</li>
            <li><b style={{ color: F.ink }}>Your deposit.</b> {v.deposit ? `Your deposit is ${gbp(v.deposit)}${v.depositProtected ? ', held in a government-approved protection scheme' : ''}. ` : ''}We show you any deductions with photos; once agreed, it’s paid back within 10 days.</li>
          </ol>
          <div className="space-y-2.5 rounded-2xl p-4" style={{ background: '#F6F8F6' }}>
            <p className="text-[13px] font-bold" style={{ color: F.ink }}>What can come off a deposit</p>
            {v.charges.map(([k, t]) => <p key={k} className="text-[14px] leading-relaxed"><b style={{ color: F.ink }}>{k}.</b> {t}</p>)}
            <p className="text-[13px]" style={{ color: F.muted }}>Fair wear and tear is never charged.{v.depositProtected ? ' If you disagree with anything, the deposit scheme’s free dispute service decides.' : ''}</p>
          </div>
        </Section>

        <div className="sticky bottom-3 z-10 rounded-3xl p-3 shadow-[0_8px_30px_rgba(19,34,25,0.18)]" style={{ background: '#fff' }}>
          {msg && <p className="mb-2 px-2 text-[14px] font-semibold" style={{ color: '#A3301F' }}>{msg}</p>}
          <button type="button" onClick={save} disabled={busy} className="w-full rounded-2xl py-4 text-[17px] font-bold text-white disabled:opacity-50" style={{ background: F.forest }}>{busy ? 'Sending…' : done ? 'Send my changes' : 'Send my move-out form'}</button>
        </div>
        <p className="px-2 pb-4 text-[13px]" style={{ color: F.muted }}>Questions? Email {v.contact.email} or call {v.contact.phone}.</p>
      </div>
    </PublicShell>
  )
}
