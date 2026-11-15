'use client'
// One emergency, as the tenant sees it (15 Nov 2026, Harry: "Alice needs to see her report in her app clearly and see
// what to do in the meantime if she clicks on it, she can also say whether they have managed to find a solution for it
// until morning"). Where it stands, what to do now and overnight, and two buttons: made safe until morning / got worse.
// Every emergency message to the house opens this screen. /api/tenant/emergency. Never shows the contractor's name.
import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { adminFetch } from '@/lib/adminFetch'
import { display } from '@/app/components/garden/kit'

type View = {
  id: string; label: string; stage: 'finding' | 'booked' | 'on_site' | 'morning' | 'call_999' | 'closed'; status: string
  reportedAt: string; etaText: string | null; controlled: boolean; bathroomAbove: boolean
  steps: string[]; overnight: string[]; callServices: string | null; house: string
}
const STAGES = [
  { key: 'reported', label: 'Reported' },
  { key: 'finding', label: 'Finding a contractor' },
  { key: 'booked', label: 'Contractor booked' },
  { key: 'on_site', label: 'Contractor there' },
  { key: 'closed', label: 'Sorted' },
] as const
const RANK: Record<View['stage'], number> = { finding: 1, morning: 1, call_999: 0, booked: 2, on_site: 3, closed: 4 }
const when = (d: string) => new Date(d).toLocaleString('en-GB', { weekday: 'long', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London' }).replace(',', ' at').replace(':00', '').replace(/\s?(am|pm)/i, (_, x) => x.toLowerCase())

export default function TenantEmergency({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [v, setV] = useState<View | null>(null)
  const [err, setErr] = useState('')
  const [ask, setAsk] = useState<null | 'contained' | 'worse'>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')

  const load = useCallback(() => adminFetch(`/api/tenant/emergency?id=${id}`).then(async r => {
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(j.error === 'Not found' ? 'We couldn’t find this emergency.' : j.error || 'Couldn’t load it — pull down to try again.'); return }
    setV(j.item); setErr('')
  }).catch(() => setErr('No connection — it’ll update when you’re back online.')), [id])
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t) }, [load])

  async function send(action: 'contained' | 'worse') {
    setBusy(true)
    const r = await adminFetch('/api/tenant/emergency', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action, note }) }).catch(() => null)
    const j = r ? await r.json().catch(() => ({})) : {}
    setBusy(false)
    if (!r?.ok) { alert(j.error || 'That didn’t send — try again, or call the office.'); return }
    setAsk(null); setNote('')
    setDone(action === 'contained' ? 'Thanks — we’ve told the office. We’ll book someone first thing in the morning.' : 'We’ve told the office straight away and we’re contacting contractors.')
    load()
  }

  const headline = !v ? '' : v.stage === 'finding' ? 'We’re finding a contractor'
    : v.stage === 'booked' ? `A contractor is coming${v.etaText ? ` — ${v.etaText}` : ''}`
    : v.stage === 'on_site' ? 'The contractor is there now'
    : v.stage === 'morning' ? 'Made safe — we’ll book someone first thing'
    : v.stage === 'call_999' ? 'Call the emergency services'
    : 'Sorted'
  const sub = !v ? '' : v.stage === 'finding' ? 'Our emergency contractors have been asked. We usually have someone booked within the hour — we’ll message you the moment it’s confirmed.'
    : v.stage === 'booked' ? 'We’ll message you if anything changes. Keep following the steps below until they arrive.'
    : v.stage === 'on_site' ? 'They’ll tell us what they’ve done before they leave.'
    : v.stage === 'morning' ? 'Tell us straight away if it gets worse — we’ll send someone tonight.'
    : v.stage === 'call_999' ? (v.callServices ?? 'Please call 999.')
    : 'Thanks for your patience. Tell us if anything isn’t right.'
  const open = v && v.stage !== 'closed'
  const canContain = v && ['finding', 'booked'].includes(v.stage)

  return (
    <div className="min-h-screen bg-[#EEF2EC] pb-28">
      <div className="rounded-b-[30px] px-[18px] pb-[22px] text-white" style={{ background: v?.stage === 'closed' ? '#17332B' : '#8E2318', paddingTop: 'max(calc(env(safe-area-inset-top) + 14px), 22px)' }}>
        <div className="mx-auto max-w-xl">
          <Link href="/tenant" className="inline-flex h-9 items-center gap-1 rounded-full bg-white/15 px-3 text-sm font-semibold">‹ Home</Link>
          <p className="mt-4 text-xs font-bold uppercase tracking-[0.14em] text-white/75">Emergency{v ? ` · ${v.label}` : ''}</p>
          <h1 className="mt-1 text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em]" style={display}>{headline || 'Loading…'}</h1>
          {v && <p className="mt-2 text-[15px] leading-snug text-white/90">{sub}</p>}
          {v && <p className="mt-2 text-xs text-white/70">{v.house} · reported {when(v.reportedAt)}</p>}
        </div>
      </div>

      <main className="mx-auto max-w-xl space-y-3 px-4 pt-4">
        {err && <p className="rounded-2xl bg-white p-4 text-sm text-[#8E2318]">{err}</p>}
        {done && <p className="rounded-2xl bg-white p-4 text-sm font-semibold text-[#17332B] shadow-[0_2px_0_#DCE5DD]">{done}</p>}

        {v && v.stage !== 'call_999' && (
          <ol className="flex rounded-2xl bg-white p-3 shadow-[0_2px_0_#DCE5DD]" aria-label="Progress">
            {STAGES.map((st, i) => {
              const reached = i <= RANK[v.stage] || (v.stage === 'morning' && i <= 1)
              const now = i === RANK[v.stage]
              return (
                <li key={st.key} className="flex flex-1 flex-col items-center gap-1 text-center">
                  <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${reached ? 'text-[#17332B]' : 'bg-[#E4EAE3] text-[#8A9A90]'}`} style={reached ? { background: 'var(--cr-gold, #F2B84B)' } : undefined} aria-current={now ? 'step' : undefined}>{reached && !now ? '✓' : i + 1}</span>
                  <span className={`text-[11px] leading-tight ${now ? 'font-bold text-[#14261F]' : 'text-[#4E6158]'}`}>{v.stage === 'morning' && i === 1 ? 'Booking for the morning' : st.label}</span>
                </li>
              )
            })}
          </ol>
        )}

        {v?.bathroomAbove && open && (
          <section className="rounded-2xl border-2 border-[#8E2318] bg-[#FCE9E6] p-4">
            <p className="text-[15px] font-extrabold text-[#8E2318]">Don’t use the bathroom above the leak</p>
            <p className="mt-1 text-sm leading-snug text-[#5A1A12]">No showers, baths, sinks or flushing the toilet there until our contractor has been and says it’s OK. Use another bathroom or toilet if there is one.</p>
          </section>
        )}

        {v && open && !!v.steps.length && (
          <section className="rounded-2xl bg-white p-4 shadow-[0_2px_0_#DCE5DD]">
            <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-[#8E2318]">Do this now</h2>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[15px] leading-snug text-[#14261F]">{v.steps.map(x => <li key={x}>{x}</li>)}</ol>
          </section>
        )}

        {v && open && !!v.overnight.length && (
          <section className="rounded-2xl bg-white p-4 shadow-[0_2px_0_#DCE5DD]">
            <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-[#4E6158]">If no one can come until tomorrow</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[15px] leading-snug text-[#14261F]">{v.overnight.map(x => <li key={x}>{x}</li>)}</ul>
          </section>
        )}

        {v && open && (
          <section className="space-y-2 rounded-2xl bg-white p-4 shadow-[0_2px_0_#DCE5DD]">
            <h2 className="text-[15px] font-extrabold text-[#14261F]">How is it now?</h2>
            {ask ? (
              <>
                <p className="text-sm text-[#4E6158]">{ask === 'contained' ? 'Great — anything we should know? (optional)' : 'What’s happening now? (optional)'}</p>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder={ask === 'contained' ? 'e.g. stopcock off, bucket under the drip, we’re fine until morning' : 'e.g. water is now coming through the light'}
                  className="w-full rounded-xl border-[1.5px] border-[#DCE5DD] px-3 py-2 text-[16px] text-[#14261F]" />
                <button type="button" disabled={busy} onClick={() => send(ask)} className={`h-12 w-full rounded-full text-[15px] font-bold disabled:opacity-40 ${ask === 'worse' ? 'bg-[#8E2318] text-white' : 'text-[#17332B] shadow-[0_3px_0_var(--cr-honey-edge)]'}`} style={ask === 'contained' ? { background: 'var(--cr-gold)' } : undefined}>
                  {busy ? 'Sending…' : ask === 'contained' ? 'Send — we’re OK until morning' : 'Send — tell the office now'}
                </button>
                <button type="button" onClick={() => { setAsk(null); setNote('') }} className="h-10 w-full text-sm font-semibold text-[#4E6158]">Back</button>
              </>
            ) : (
              <>
                {canContain && <button type="button" onClick={() => setAsk('contained')} className="h-12 w-full rounded-full text-[15px] font-bold text-[#17332B] shadow-[0_3px_0_var(--cr-honey-edge)]" style={{ background: 'var(--cr-gold)' }}>We’ve made it safe until morning</button>}
                <button type="button" onClick={() => setAsk('worse')} className="h-12 w-full rounded-full border-[1.5px] border-[#8E2318] text-[15px] font-bold text-[#8E2318]">It’s got worse</button>
                <p className="pt-1 text-xs text-[#4E6158]">If anyone is in danger, call 999 first.</p>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  )
}
