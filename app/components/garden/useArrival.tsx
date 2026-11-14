'use client'
// "I've arrived" for cleaners and contractors (14 Nov 2026, lib/access/arrival via /api/arrive). One call:
//   const { arrive, sheet } = useArrival()
//   const r = await arrive('job', id)      // → { keySafe, where } once they're in, or null if they stopped
//   …and render {sheet} somewhere on the page.
// Too little notice for the shared areas → a warning they tick, then the code. A tenant's room without 24 hours'
// notice → it says so, and (for a job) asks the tenant in one tap; they can go in once the tenant says yes.
import { useRef, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'
import { display } from './kit'

type Done = { keySafe: string | null; where: string; warned?: boolean }
type Sheet = { kind: 'job' | 'clean'; id: string; state: 'warn' | 'blocked' | 'code'; message: string; canAskTenant?: boolean; asked?: boolean; code?: string | null; where?: string }

export function useArrival() {
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [busy, setBusy] = useState(false)
  const [ticked, setTicked] = useState(false)
  const resolver = useRef<((v: Done | null) => void) | null>(null)
  const onDone = useRef<(() => void) | null>(null)

  const post = (body: unknown) => adminFetch('/api/arrive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => ({ ok: r.ok, j: await r.json().catch(() => ({})) as any }))
  const finish = (v: Done | null) => { resolver.current?.(v); resolver.current = null }

  /** onDone runs when they close the code sheet (e.g. to open the job) — so the code stays up until they've seen it */
  async function arrive(kind: 'job' | 'clean', id: string, opts: { onDone?: () => void } = {}): Promise<Done | null> {
    onDone.current = opts.onDone ?? null
    const r = await adminFetch(`/api/arrive?kind=${kind}&id=${id}`).then(async x => ({ ok: x.ok, j: await x.json().catch(() => ({})) as any })).catch(() => null)
    if (!r?.ok && !r?.j?.state) { alert(r?.j?.error || 'Couldn’t check the visit — try again.'); return null }
    const c = r.j
    if (['not_today', 'not_booked', 'not_yours', 'not_found'].includes(c.state)) { alert(c.message); return null }
    return new Promise<Done | null>(resolve => {
      resolver.current = resolve
      setTicked(false)
      if (c.state === 'ok') { void go(kind, id, false); return }
      setSheet({ kind, id, state: c.state, message: c.message, canAskTenant: c.canAskTenant, asked: c.asked, where: c.where })
    })
  }

  async function go(kind: 'job' | 'clean', id: string, ack: boolean) {
    setBusy(true)
    const r = await post({ kind, id, ack }).catch(() => null)
    setBusy(false)
    if (!r?.ok || r.j.state !== 'ok') { setSheet(null); alert(r?.j?.message || r?.j?.error || 'That didn’t work — try again.'); finish(null); return }
    setSheet({ kind, id, state: 'code', message: '', code: r.j.keySafe, where: r.j.where })
    finish({ keySafe: r.j.keySafe ?? null, where: r.j.where, warned: r.j.warned })
  }

  async function ask() {
    if (!sheet) return
    setBusy(true)
    const r = await post({ action: 'ask_tenant', id: sheet.id }).catch(() => null)
    setBusy(false)
    if (!r?.ok) { alert(r?.j?.error || 'Couldn’t ask the tenant — call the office.'); return }
    setSheet({ ...sheet, asked: true, canAskTenant: false, message: 'We’ve asked the tenant on their phone. You can go in the moment they say yes — tap “Check again” in a minute, or carry on with another job.' })
  }

  // the tenant may have said yes since — look again without losing the page's place
  async function recheck() {
    if (!sheet) return
    setBusy(true)
    const r = await adminFetch(`/api/arrive?kind=${sheet.kind}&id=${sheet.id}`).then(async x => ({ ok: x.ok, j: await x.json().catch(() => ({})) as any })).catch(() => null)
    setBusy(false)
    const c = r?.j
    if (!c?.state) return
    if (c.state === 'ok') return go(sheet.kind, sheet.id, false)
    if (c.state === 'warn' || c.state === 'blocked') setSheet({ ...sheet, state: c.state, message: c.message, canAskTenant: c.canAskTenant, asked: c.asked })
  }

  const close = () => { setSheet(null); finish(null) }
  const node = sheet && (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" onMouseDown={e => { if (e.target === e.currentTarget && sheet.state !== 'code') close() }}>
      <div className="w-full max-w-md rounded-t-[28px] bg-[#EEF2EC] p-5 sm:rounded-[28px]" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 20px)' }}>
        {sheet.state === 'code' ? (
          <>
            <p className="text-xs font-bold uppercase tracking-widest text-[#4E6158]">You’re in · {sheet.where}</p>
            {sheet.code
              ? <><p className="mt-2 text-sm text-[#14261F]">Key safe code — it opens the front door only:</p><p className="mt-1 text-[44px] font-extrabold tracking-[0.2em] text-[#14261F]" style={display}>{sheet.code}</p><p className="text-xs text-[#4E6158]">Scramble the dial and close the box when you leave.</p></>
              : <p className="mt-2 text-sm text-[#14261F]">Marked as arrived. There’s no key safe code on file for this property — the tenants or the office will let you in.</p>}
            <button type="button" onClick={() => { setSheet(null); const f = onDone.current; onDone.current = null; f?.() }} className="mt-4 h-12 w-full rounded-full text-[15px] font-bold text-[#17332B] shadow-[0_3px_0_var(--cr-honey-edge)]" style={{ background: 'var(--cr-gold)' }}>Done</button>
          </>
        ) : (
          <>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: sheet.state === 'blocked' ? '#8E2318' : '#7A5410' }}>{sheet.state === 'blocked' ? 'Not yet' : 'Short notice'}</p>
            <p className="mt-2 text-[15px] leading-snug text-[#14261F]">{sheet.message}</p>
            {sheet.state === 'warn' && (
              <label className="mt-3 flex items-start gap-2 rounded-2xl bg-white p-3 text-sm text-[#14261F]">
                <input type="checkbox" checked={ticked} onChange={e => setTicked(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#17332B]" />
                <span>I understand — I’ll give the tenants more notice next time.</span>
              </label>
            )}
            <div className="mt-4 flex flex-col gap-2">
              {sheet.state === 'warn' && <button type="button" disabled={!ticked || busy} onClick={() => go(sheet.kind, sheet.id, true)} className="h-12 rounded-full text-[15px] font-bold text-[#17332B] shadow-[0_3px_0_var(--cr-honey-edge)] disabled:opacity-40" style={{ background: 'var(--cr-gold)' }}>{busy ? 'One moment…' : 'I’ve arrived — show the code'}</button>}
              {sheet.state === 'blocked' && sheet.canAskTenant && <button type="button" disabled={busy} onClick={ask} className="h-12 rounded-full text-[15px] font-bold text-[#17332B] shadow-[0_3px_0_var(--cr-honey-edge)] disabled:opacity-40" style={{ background: 'var(--cr-gold)' }}>{busy ? 'Asking…' : 'Ask the tenant to let me in now'}</button>}
              {sheet.state === 'blocked' && sheet.asked && <button type="button" disabled={busy} onClick={recheck} className="h-12 rounded-full border-[1.5px] border-[#17332B] text-[15px] font-bold text-[#17332B]">Check again</button>}
              <button type="button" onClick={close} className="h-11 rounded-full text-sm font-semibold text-[#4E6158]">Not now</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
  return { arrive, sheet: node }
}
