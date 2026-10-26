'use client'

// Landlord updates — every update a landlord gets about their incoming tenant, in one panel (17 Oct 2026, migration
// 228; lib/landlordUpdates). Used on the letting file and on Applicants (an offer for the landlord to review first).
// It follows the tenancy (Harry: "two years into the agreement are we still prioritising move-in emails?"):
//   letting      — before move-in: every update
//   settling     — the first two months after move-in: only the new-tenant report, for anything that was missed
//   established  — after that: nothing to send, just what was sent (if anything)
// Each update opens as a draft: change the wording, untick any line or document, then Send. Nothing goes by itself.
// "Due" marks a step that's done but the landlord hasn't heard about yet. Data: /api/admin/landlord-updates.
import { useCallback, useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

interface StageRow { stage: string; label: string; ready: boolean; due: boolean; sentAt: string | null; why: string }
interface Sent { id: string; stage: string; sent_at: string; sent_to: string[]; answer: string | null; answer_note: string | null; first_viewed_at: string | null }
interface Data {
  setupNeeded?: boolean; error?: string
  landlord: { id: string; name: string; emails: string[]; commsOn: boolean; tenantUpdatesOff: boolean } | null
  letOnly: boolean; place: string; tenant: string; stages: StageRow[]; sent: Sent[]; tenancyId: string | null
}
interface Draft { subject: string; message: string; facts: { label: string; value: string; on: boolean }[]; docs: { id: string; label: string; fileName: string; on: boolean; idDoc: boolean }[] }

const LABEL: Record<string, string> = { offer: 'Offer to review', reserved: 'Room reserved', referenced: 'Referencing passed', signed_paid: 'Signed & paid', summary: 'New tenant report' }
const day = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Europe/London' }) : ''
const input = 'w-full rounded-lg border border-neutral-300 bg-white px-sm py-xs text-sm text-neutral-900'

export default function LandlordUpdates({ applicantId, tenancyId, only, bare = false, phase = 'letting' }: { applicantId?: string | null; tenancyId?: string | null; only?: string[]; bare?: boolean; phase?: 'letting' | 'settling' | 'established' }) {
  const [d, setD] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [to, setTo] = useState('')
  const [statement, setStatement] = useState(false)   // let-only: attach the lettings statement PDF
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')
  const q = tenancyId ? `tenancyId=${tenancyId}` : `applicantId=${applicantId}`

  const load = useCallback(async () => {
    const r = await adminFetch(`/api/admin/landlord-updates?${q}`)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setError(j.error ?? 'Couldn’t load the landlord updates'); return }
    setD(j); setError('')
  }, [q])
  useEffect(() => { load() }, [load])

  async function start(stage: string) {
    setOpen(stage); setDraft(null); setDone(''); setError('')
    const r = await adminFetch(`/api/admin/landlord-updates?${q}&stage=${stage}`)
    const j = await r.json().catch(() => ({}))
    if (!r.ok || !j.draft) { setError(j.error ?? 'Couldn’t draft that'); setOpen(null); return }
    setDraft(j.draft); setTo((j.landlord?.emails ?? []).join(', '))
    setStatement(!!j.letOnly && !!j.tenancyId && (stage === 'signed_paid' || stage === 'summary'))
  }
  async function send() {
    if (!draft || !open) return
    setBusy(true); setError('')
    const r = await adminFetch('/api/admin/landlord-updates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicantId, tenancyId, stage: open, to, subject: draft.subject, message: draft.message, facts: draft.facts.filter(f => f.on), docIds: draft.docs.filter(x => x.on).map(x => x.id), attachStatement: statement }),
    })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setError(j.error ?? 'It didn’t send'); return }
    setDone(`${LABEL[open]} sent to ${j.sentTo.join(', ')}`); setOpen(null); setDraft(null); load()
  }

  const wrapCls = bare ? 'space-y-sm' : 'rounded-2xl border border-neutral-200 bg-white p-md space-y-sm'
  if (d?.setupNeeded) return <section className={wrapCls}><h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Landlord updates</h2><p className="text-xs text-amber-800">Needs migration 228 running in Supabase first.</p></section>
  if (!d) return <section className={wrapCls}><h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Landlord updates</h2><p className="text-xs text-neutral-500">{error || 'Loading…'}</p></section>

  const stages = d.stages.filter(s => (!only || only.includes(s.stage)) && (phase === 'letting' || (phase === 'settling' && s.stage === 'summary')))
  // an established tenancy: nothing to send — only a note of what was sent, and nothing at all if nothing was
  if (phase === 'established' && !d.sent.length) return null
  const answers = d.sent.filter(s => s.stage === 'offer')
  return (
    <section className={wrapCls}>
      <div className="flex items-baseline justify-between gap-sm">
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Landlord updates</h2>
        <span className="truncate text-xs text-neutral-500">{d.landlord ? d.landlord.name : 'No landlord on file'}{d.letOnly ? ' · let only' : ''}</span>
      </div>
      {d.landlord && !d.landlord.emails.length && <p className="text-xs text-amber-800">No email address for the landlord — add it on their profile, or type one in the draft.</p>}
      {d.landlord && (!d.landlord.commsOn || d.landlord.tenantUpdatesOff) && (
        <p className="text-xs text-neutral-500">{!d.landlord.commsOn ? 'Automatic emails to this landlord are paused' : 'This landlord has turned off automatic tenant updates'} — anything you send from here still goes.</p>
      )}
      {done && <p className="rounded-lg bg-green-50 px-sm py-xs text-xs font-semibold text-green-800">{done}</p>}
      {error && <p className="rounded-lg bg-red-50 px-sm py-xs text-xs text-red-800">{error}</p>}

      {phase === 'established' && (
        <ul className="space-y-0.5 text-xs text-neutral-600">
          {d.sent.slice(0, 5).map(x => <li key={x.id}>{LABEL[x.stage] ?? x.stage} · sent {day(x.sent_at)}</li>)}
        </ul>
      )}
      <ul className="divide-y divide-neutral-100">
        {stages.map(s => (
          <li key={s.stage} className="flex items-center justify-between gap-sm py-xs">
            <span className="min-w-0">
              <span className="text-sm font-semibold text-neutral-900">{s.label}</span>
              {s.due && <span className="ml-xs rounded-full bg-amber-100 px-xs py-px text-[10px] font-bold uppercase tracking-wide text-amber-800">Due</span>}
              <span className="block truncate text-xs text-neutral-500">{s.sentAt ? `Sent ${day(s.sentAt)}` : s.why}</span>
            </span>
            <button type="button" onClick={() => start(s.stage)} disabled={!s.ready}
              className="shrink-0 rounded-lg border border-neutral-300 px-sm py-0.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-35">
              {s.sentAt ? 'Again' : 'Draft'}
            </button>
          </li>
        ))}
      </ul>

      {answers.map(a => (
        <p key={a.id} className={`rounded-lg px-sm py-xs text-xs ${a.answer === 'approved' ? 'bg-green-50 text-green-800' : a.answer === 'declined' ? 'bg-red-50 text-red-800' : 'bg-neutral-50 text-neutral-600'}`}>
          Offer sent {day(a.sent_at)} · {a.answer === 'approved' ? 'Landlord is happy to go ahead' : a.answer === 'declined' ? 'Landlord said not this one' : a.first_viewed_at ? `Opened ${day(a.first_viewed_at)}, no answer yet` : 'Not opened yet'}
          {a.answer_note ? ` — “${a.answer_note}”` : ''}
        </p>
      ))}

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center" onClick={() => !busy && setOpen(null)}>
          <div className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-lg shadow-xl md:rounded-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-md flex items-baseline justify-between gap-md">
              <h3 className="text-lg font-bold text-neutral-900">{LABEL[open]} · {d.tenant || d.place}</h3>
              <button type="button" onClick={() => setOpen(null)} className="text-sm font-semibold text-neutral-500">Close</button>
            </div>
            {!draft ? <p className="text-sm text-neutral-500">Drafting…</p> : (
              <div className="space-y-md">
                <label className="block text-xs font-bold uppercase tracking-wide text-neutral-500">To
                  <input value={to} onChange={e => setTo(e.target.value)} className={`${input} mt-1 normal-case tracking-normal`} placeholder="landlord@example.com" />
                </label>
                <label className="block text-xs font-bold uppercase tracking-wide text-neutral-500">Subject
                  <input value={draft.subject} onChange={e => setDraft({ ...draft, subject: e.target.value })} className={`${input} mt-1 normal-case tracking-normal`} />
                </label>
                <label className="block text-xs font-bold uppercase tracking-wide text-neutral-500">Message
                  <textarea value={draft.message} onChange={e => setDraft({ ...draft, message: e.target.value })} rows={11} className={`${input} mt-1 normal-case leading-relaxed tracking-normal`} />
                </label>
                {draft.facts.length > 0 && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">Details under the message</p>
                    <ul className="mt-1 divide-y divide-neutral-100 rounded-lg border border-neutral-200">
                      {draft.facts.map((f, i) => (
                        <li key={f.label} className="flex items-start gap-sm px-sm py-xs text-sm">
                          <input type="checkbox" checked={f.on} onChange={() => setDraft({ ...draft, facts: draft.facts.map((x, j) => j === i ? { ...x, on: !x.on } : x) })} className="mt-1" />
                          <span className="w-32 shrink-0 text-neutral-500">{f.label}</span>
                          <span className={`min-w-0 break-words ${f.on ? 'text-neutral-900' : 'text-neutral-400 line-through'}`}>{f.value}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {draft.docs.length > 0 ? (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">Documents on their private page (7 days)</p>
                    <ul className="mt-1 divide-y divide-neutral-100 rounded-lg border border-neutral-200">
                      {draft.docs.map((x, i) => (
                        <li key={x.id} className="flex items-start gap-sm px-sm py-xs text-sm">
                          <input type="checkbox" checked={x.on} onChange={() => setDraft({ ...draft, docs: draft.docs.map((y, j) => j === i ? { ...y, on: !y.on } : y) })} className="mt-1" />
                          <span className="min-w-0"><span className="font-semibold">{x.label}</span> <span className="break-all text-neutral-500">{x.fileName}</span>
                            {x.idDoc && !d.letOnly && <span className="block text-xs text-amber-800">Managed house: we did the Right to Rent check, so the ID usually stays with us.</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : ['referenced', 'signed_paid', 'summary'].includes(open) && (
                  <p className="text-xs text-neutral-500">No documents filed on this tenancy yet — add them in the letting file’s steps to share them.</p>
                )}
                {d.letOnly && d.tenancyId && (open === 'signed_paid' || open === 'summary') && (
                  <label className="flex items-start gap-sm rounded-lg border border-neutral-200 px-sm py-xs text-sm">
                    <input type="checkbox" checked={statement} onChange={() => setStatement(v => !v)} className="mt-1" />
                    <span><span className="font-semibold">Attach the lettings statement (PDF)</span> — rent and deposit received, our letting fee, the balance paid to them.{' '}
                      <a href={`/api/lettings-statement/${d.tenancyId}`} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 hover:underline">Preview</a></span>
                  </label>
                )}
                {open === 'offer' && <p className="text-xs text-neutral-500">The landlord gets a private page with the details and two buttons: “Happy to go ahead” or “Not this one”. You’ll get an email as soon as they answer.</p>}
                <div className="flex flex-wrap items-center gap-sm border-t border-neutral-100 pt-md">
                  <button type="button" onClick={send} disabled={busy || !to.trim()} className="rounded-lg bg-neutral-900 px-lg py-sm text-sm font-bold text-white hover:bg-neutral-700 disabled:opacity-40">{busy ? 'Sending…' : 'Send to the landlord'}</button>
                  <button type="button" onClick={() => setOpen(null)} disabled={busy} className="text-sm font-semibold text-neutral-600 underline">Cancel</button>
                  <span className="text-xs text-neutral-500">You get a copy.</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
