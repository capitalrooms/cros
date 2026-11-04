'use client'

// Letter to several landlords (3 Nov 2026, Harry: "send a document I prepare to all landlords or chosen landlords …
// to save me writing it 6 times"; "you have not built my multi client letter yet" — the first version sat at the bottom
// of a finished single letter, where nobody would find it). Its own screen, in three steps:
//   1 · Who — tick landlords (all, or chosen); each shows the email and correspondence address their copy will use.
//   2 · The letter — write it once (or say what it's about and let the assistant draft it); "Dear …" is filled per landlord.
//   3 · Check and send — preview any landlord's own copy; Send goes one by one, each copy filed on that landlord's
//       Letters tab (generated_documents, recipient_email) and emailed with their copy-in contacts on cc.
// Nothing is sent until you press Send and confirm. Test sends go to you only ("Send me a test").
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import PageHero, { HeroButton } from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import PdfView from '@/components/PdfView'
import { createClient } from '@/lib/supabase'
import { adminFetch } from '@/lib/adminFetch'
import { dearName, landlordFormalNames } from '@/lib/people'
import type { FormalLetter } from '@/lib/letters/formalLetter'
import { fill, bodyFor, messageFor as personalMessage, nameLeaks } from '@/lib/letters/personalise'

// the sign-offs the letterhead accepts (lib/letters/formalLetter CLOSINGS — that file also renders PDFs, server only)
const CLOSINGS: readonly string[] = ['Yours sincerely', 'Yours faithfully', 'Kind regards', 'With best wishes']

interface LL { id: string; name: string; dear: string; email: string | null; address: string | null; cc: string[]; properties: number }
type Status = { state: 'sending' | 'sent' | 'failed' | 'skipped'; text: string }

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const card = 'rounded-2xl border border-neutral-200 bg-white p-lg'
const input = 'w-full rounded-xl border border-neutral-300 bg-white px-md py-sm text-sm'
const label = 'text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-500'

export default function LetterToLandlordsPage() {
  const [lls, setLls] = useState<LL[] | null>(null)
  const [pick, setPick] = useState<Record<string, boolean>>({})
  const [q, setQ] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [closing, setClosing] = useState<string>('Kind regards')
  const [date, setDate] = useState(today())
  const [about, setAbout] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailMessage, setEmailMessage] = useState('')
  const [previewFor, setPreviewFor] = useState<string>('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewErr, setPreviewErr] = useState('')
  const [status, setStatus] = useState<Record<string, Status>>({})
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [me, setMe] = useState<string>('')

  useEffect(() => {
    ;(async () => {
      const sb = createClient()
      const { data: { session } } = await sb.auth.getSession()
      setMe(session?.user?.email ?? '')
      const [{ data: people }, { data: props }] = await Promise.all([
        sb.from('people').select('id, salutation, first_name, last_name, full_name, company, email, home_address, correspondence_cc, joint_salutation, joint_first_name, joint_last_name, joint_email').eq('role', 'landlord'),
        sb.from('properties').select('landlord_id, is_demo'),
      ])
      const count = new Map<string, number>()
      for (const p of (props ?? []) as any[]) if (!p.is_demo && p.landlord_id) count.set(p.landlord_id, (count.get(p.landlord_id) ?? 0) + 1)
      setLls(((people ?? []) as any[]).filter(p => count.get(p.id)).map(p => ({
        id: p.id, name: p.company || landlordFormalNames(p), dear: dearName(p) || p.company || 'Sir or Madam', email: p.email ?? null, address: p.home_address ?? null,
        cc: [p.joint_email, ...(Array.isArray(p.correspondence_cc) ? p.correspondence_cc.map((c: any) => c?.email) : [])].map((e: any) => String(e ?? '').trim()).filter(Boolean),
        properties: count.get(p.id) ?? 0,
      })).sort((a, b) => a.name.localeCompare(b.name)))
    })()
  }, [])

  const chosen = useMemo(() => (lls ?? []).filter(l => pick[l.id]), [lls, pick])
  const shown = (lls ?? []).filter(l => !q.trim() || `${l.name} ${l.email ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))
  const letterFor = (l: LL): FormalLetter => ({ recipientName: l.name, recipientAddress: l.address ?? '', date, reference: '', subject: fill(subject, l), salutation: `Dear ${l.dear}`, body: bodyFor(body, l), closing })
  const messageFor = (l: LL) => personalMessage(emailMessage, subject, l)
  const placeholder = /\[[^\]\n]{2,60}\]/.test(`${subject}\n${body}`)
  // ── safety (4 Nov 2026, Harry: "are you 100% … they all get it personalised … announcing VAT") ──
  // 1 · a landlord's own name typed into the shared wording would go to everyone: refuse to send
  const shared = `${subject}\n${body}\n${emailSubject}\n${emailMessage}`
  const leaks = nameLeaks(shared, chosen)
  const leakWords = [...new Set(leaks.map(x => x.word))]
  // 2 · Send unlocks only after a test of exactly this wording has reached you
  const wording = JSON.stringify([subject, body, closing, date, emailSubject, emailMessage])
  const [testedWording, setTestedWording] = useState('')
  const tested = testedWording === wording
  // 3 · one send at a time, whatever is clicked
  const sendingRef = useRef(false)
  const ready = chosen.length > 0 && subject.trim() && body.trim() && !placeholder && leakWords.length === 0

  // the wording is kept on this device as you type, so a refresh never loses it
  useEffect(() => {
    try { const d = JSON.parse(localStorage.getItem('cros-letter-to-landlords') ?? 'null'); if (d) { setSubject(d.subject ?? ''); setBody(d.body ?? ''); setClosing(d.closing ?? 'Kind regards'); setEmailSubject(d.emailSubject ?? ''); setEmailMessage(d.emailMessage ?? '') } } catch {}
  }, [])
  useEffect(() => {
    try { localStorage.setItem('cros-letter-to-landlords', JSON.stringify({ subject, body, closing, emailSubject, emailMessage })) } catch {}
  }, [subject, body, closing, emailSubject, emailMessage])

  // preview the chosen landlord's own copy (or the first chosen)
  const previewLl = (lls ?? []).find(l => l.id === previewFor) ?? chosen[0] ?? null
  useEffect(() => {
    if (!previewLl || !subject.trim() || !body.trim()) { setPreviewUrl(''); return }
    const t = setTimeout(async () => {
      setPreviewErr('')
      const r = await adminFetch('/api/admin/document-generator/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ letter: letterFor(previewLl), signer: {}, inline: true }) })
      if (!r.ok) { const j = await r.json().catch(() => ({})); setPreviewErr(j.error ?? 'Could not make the preview'); return }
      const u = URL.createObjectURL(await r.blob())
      setPreviewUrl(old => { if (old) URL.revokeObjectURL(old); return u })
    }, 700)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewLl?.id, subject, body, closing, date])

  async function draft() {
    if (!about.trim()) return
    setDrafting(true); setNote(null)
    // with a letter already written, Draft it changes that letter as asked rather than starting again
    const revising = !!(subject.trim() && body.trim())
    const rule = "This letter goes to several landlords; each copy is addressed to them by name, so don't name a landlord, property or amount that applies to only one."
    try {
      const r = await adminFetch('/api/admin/document-generator/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(revising
          ? { instructions: `Revise the current letter. ${rule}`, changes: about, current: letterFor({ id: '', name: 'the landlord', dear: 'Landlord', email: null, address: '', cc: [], properties: 0 }), kind: 'letter', recipient: { name: 'the landlord', address: '', role: 'landlord' } }
          : { instructions: `${about}\n\n${rule}`, kind: 'letter', recipient: { name: 'the landlord', address: '', role: 'landlord' } }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setNote({ ok: false, text: d.error ?? 'Could not draft the letter' }); return }
      setSubject(d.letter.subject); setBody(d.letter.body); setAbout(''); if (CLOSINGS.includes(d.letter.closing)) setClosing(d.letter.closing)
      if (!emailSubject) setEmailSubject(d.letter.subject)
      if (d.coverEmail && !emailMessage) setEmailMessage(String(d.coverEmail).replace(/^(Dear|Hi|Hello)\b[^\n,]*,?/i, 'Dear {dear},'))
    } finally { setDrafting(false) }
  }

  // one landlord's copy: file it on their Letters tab, then email it with their copy-in contacts
  async function sendOne(l: LL, toOverride?: string): Promise<Status> {
    const to = toOverride ?? l.email
    if (!to) return { state: 'skipped', text: 'No email address — skipped' }
    let documentId: string | undefined
    if (!toOverride) {
      const saved = await adminFetch('/api/admin/documents/generated', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'letter', letter: letterFor(l), signer: {}, recipientEmail: l.email, respond: 'json' }) })
      const sj = await saved.json().catch(() => ({}))
      if (!saved.ok) return { state: 'failed', text: sj.error ?? 'Could not file the letter — not sent' }
      documentId = sj.doc?.id
    }
    const r = await adminFetch('/api/admin/document-generator/send', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: [to], cc: toOverride ? [] : l.cc, subject: (toOverride ? 'TEST · ' : '') + (emailSubject || subject), message: messageFor(l), letter: letterFor(l), signer: {}, documentId }) })
    const j = await r.json().catch(() => ({}))
    return r.ok ? { state: 'sent', text: toOverride ? `Test sent to ${to}` : `Sent to ${to}${l.cc.length ? ` · cc ${l.cc.join(', ')}` : ''}` } : { state: 'failed', text: j.error ?? 'Not sent' }
  }

  async function sendTest() {
    if (!previewLl || !me) return
    setBusy(true); setNote(null)
    const s = await sendOne(previewLl, me)
    if (s.state === 'sent') setTestedWording(wording)
    setNote({ ok: s.state === 'sent', text: s.state === 'sent' ? `${s.text} — ${previewLl.name}’s copy, to you only. Check it, then Send unlocks for this wording.` : s.text })
    setBusy(false)
  }

  async function sendAll() {
    if (sendingRef.current || !ready || !tested) return
    sendingRef.current = true
    const noEmail = chosen.filter(l => !l.email)
    const todo = chosen.filter(l => l.email && status[l.id]?.state !== 'sent')
    const lines = todo.map(l => `• ${l.name} — ${l.email} — “Dear ${l.dear}”`).join('\n')
    if (!window.confirm(`Send “${subject}” to ${todo.length} landlord${todo.length === 1 ? '' : 's'}, each their own copy:\n\n${lines}${noEmail.length ? `\n\nNo email address, so skipped: ${noEmail.map(l => l.name).join(', ')}.` : ''}`)) { sendingRef.current = false; return }
    setBusy(true); setNote(null)
    for (const l of chosen) {
      if (status[l.id]?.state === 'sent') continue      // never twice if you press Send again after a failure
      setStatus(s => ({ ...s, [l.id]: { state: 'sending', text: 'Sending…' } }))
      const r = await sendOne(l)
      setStatus(s => ({ ...s, [l.id]: r }))
    }
    setBusy(false); sendingRef.current = false
  }

  const sentCount = Object.values(status).filter(s => s.state === 'sent').length
  const failed = Object.values(status).filter(s => s.state === 'failed').length

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin/document-generator" />} title="Letter to several landlords" />
      <PageHero trail={[{ label: 'Letters & Invoices', href: '/admin/document-generator' }]} title="Letter to several landlords"
        subtitle="Write it once. Each landlord gets their own copy: their name and address, “Dear …” to them, their copy-in contacts on cc, and it’s filed on their Letters tab."
        actions={<HeroButton href="/admin/people?tab=landlords">Landlord addresses</HeroButton>} />
      <main className="mx-auto max-w-6xl px-lg py-xl grid grid-cols-1 gap-lg lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <fieldset disabled={busy} className="space-y-lg min-w-0 disabled:opacity-60">
          {/* 1 · Who */}
          <section className={card}>
            <div className="mb-sm flex flex-wrap items-baseline justify-between gap-sm">
              <h2 className="text-lg font-bold">1 · Who it goes to</h2>
              <span className="flex gap-md text-sm font-semibold">
                <button type="button" onClick={() => setPick(Object.fromEntries((lls ?? []).map(l => [l.id, true])))} className="text-blue-700 hover:underline">All {lls?.length ?? ''}</button>
                <button type="button" onClick={() => setPick({})} className="text-blue-700 hover:underline">None</button>
              </span>
            </div>
            <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Find a landlord…" className={`${input} mb-sm`} />
            {!lls ? <p className="text-sm text-neutral-500">Loading landlords…</p> : (
              <ul className="max-h-[360px] divide-y divide-neutral-100 overflow-y-auto">
                {shown.map(l => (
                  <li key={l.id} className="flex items-start gap-sm py-sm text-sm">
                    <input type="checkbox" className="mt-1 h-4 w-4" checked={!!pick[l.id]} onChange={e => setPick(p => ({ ...p, [l.id]: e.target.checked }))} aria-label={`Send to ${l.name}`} />
                    <button type="button" onClick={() => setPreviewFor(l.id)} className="min-w-0 flex-1 text-left">
                      <span className="font-semibold">{l.name}</span> <span className="text-xs text-neutral-500">· {l.properties} propert{l.properties === 1 ? 'y' : 'ies'}</span>
                      <span className="block text-xs text-neutral-500">{l.email ?? <span className="text-red-700">No email — will be skipped</span>}{l.cc.length ? ` · cc ${l.cc.join(', ')}` : ''}</span>
                      {!l.address && <span className="block text-xs text-amber-700">No correspondence address on file — the letter goes out without one</span>}
                    </button>
                    {status[l.id] && <span className={`shrink-0 text-xs font-semibold ${status[l.id].state === 'sent' ? 'text-green-700' : status[l.id].state === 'sending' ? 'text-neutral-500' : 'text-red-700'}`} title={status[l.id].text}>{status[l.id].state === 'sent' ? 'Sent ✓' : status[l.id].state === 'sending' ? 'Sending…' : status[l.id].state === 'skipped' ? 'Skipped' : 'Not sent'}</span>}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-sm text-sm font-semibold">{chosen.length} chosen</p>
          </section>

          {/* 2 · The letter */}
          <section className={card}>
            <h2 className="mb-sm text-lg font-bold">2 · The letter</h2>
            <div className="mb-md rounded-xl bg-neutral-50 p-md">
              <p className={label}>Or say what it’s about and have it drafted</p>
              <textarea value={about} onChange={e => setAbout(e.target.value)} rows={3} placeholder="e.g. Tell landlords about the Renters’ Rights Act changes from 1 May 2026 and what we’re doing for them" className={`${input} mt-xs`} />
              <button type="button" onClick={draft} disabled={drafting || !about.trim()} className="mt-sm rounded-lg bg-neutral-900 px-md py-xs text-sm font-bold text-white disabled:opacity-40">{drafting ? 'Drafting…' : 'Draft it'}</button>
            </div>
            <label className="block"><span className={label}>Subject</span><input value={subject} onChange={e => setSubject(e.target.value)} className={`${input} mt-xs`} /></label>
            <p className="mt-md text-sm text-neutral-600">{previewLl ? <>Dear {previewLl.dear}, <span className="text-xs text-neutral-500">— each copy greets its own landlord. Type {'{name}'} in the letter for their full name.</span></> : <>Dear <i>each landlord’s name</i>,</>}</p>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={12} placeholder="The letter itself — paragraphs separated by a blank line." className={`${input} mt-xs`} />
            {placeholder && <p className="mt-xs text-sm text-red-700">There are [placeholders] still to fill in.</p>}
            <div className="mt-md grid grid-cols-2 gap-md">
              <label className="block"><span className={label}>Sign-off</span>
                <select value={closing} onChange={e => setClosing(e.target.value)} className={`${input} mt-xs`}>{CLOSINGS.map(c => <option key={c}>{c}</option>)}</select></label>
              <label className="block"><span className={label}>Dated</span><input type="date" value={date} onChange={e => setDate(e.target.value)} className={`${input} mt-xs`} /></label>
            </div>
            <p className="mt-xs text-xs text-neutral-500">Signed by you, from your profile (name, job title and signature).</p>
          </section>

          {/* the email it travels with */}
          <section className={card}>
            <h2 className="mb-sm text-lg font-bold">The email it’s attached to</h2>
            <label className="block"><span className={label}>Email subject</span><input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder={subject || 'Same as the letter'} className={`${input} mt-xs`} /></label>
            <label className="mt-md block"><span className={label}>Email message — opens “Dear …” to each landlord by name</span>
              <textarea value={emailMessage} onChange={e => setEmailMessage(e.target.value)} rows={5} placeholder={`Dear {dear},\n\nPlease find attached a letter from Capital Rooms${subject ? `: ${subject}` : ''}.\n\nKind regards,\nCapital Rooms`} className={`${input} mt-xs`} /></label>
          </section>
        </fieldset>

        {/* 3 · Check and send */}
        <div className="space-y-lg min-w-0 lg:sticky lg:top-md lg:self-start">
          <section className={card}>
            <div className="mb-sm flex flex-wrap items-baseline justify-between gap-sm">
              <h2 className="text-lg font-bold">3 · Check and send</h2>
              {chosen.length > 1 && (
                <select value={previewLl?.id ?? ''} onChange={e => setPreviewFor(e.target.value)} aria-label="Whose copy to preview" className="rounded-lg border border-neutral-300 bg-white px-sm py-xs text-sm">
                  {chosen.map(l => <option key={l.id} value={l.id}>{l.name}’s copy</option>)}
                </select>
              )}
            </div>
            {!previewLl ? <p className="text-sm text-neutral-500">Choose who it goes to, and their copy shows here.</p>
            : !subject.trim() || !body.trim() ? <p className="text-sm text-neutral-500">Write the subject and the letter, and {previewLl.name}’s copy shows here.</p>
            : previewErr ? <p className="text-sm text-red-700">{previewErr}</p>
            : previewUrl ? <PdfView title={`${previewLl.name}’s copy`} src={previewUrl} className="h-[560px] w-full rounded border border-neutral-200" />
            : <p className="text-sm text-neutral-500">Making {previewLl.name}’s copy…</p>}
            <div className="mt-md flex flex-wrap gap-sm">
              <button type="button" onClick={sendTest} disabled={busy || !ready || !me} className="rounded-lg border border-neutral-300 px-md py-sm text-sm font-semibold disabled:opacity-40">Send me a test</button>
              <button type="button" onClick={sendAll} disabled={busy || !ready || !tested} title={!tested ? 'Send yourself a test of this wording first' : undefined} className="rounded-lg bg-neutral-900 px-lg py-sm text-sm font-bold text-white disabled:opacity-40">{busy ? 'Sending…' : `Send to ${chosen.length} landlord${chosen.length === 1 ? '' : 's'}`}</button>
            </div>
            {leakWords.length > 0 && <p className="mt-sm rounded-lg bg-red-50 px-md py-sm text-sm font-semibold text-red-800">Your wording names {leakWords.join(', ')} ({[...new Set(leaks.map(x => x.who))].join(', ')}) — every landlord would get that. Use {'{name}'} in the email, or take it out. Each letter’s “Dear …”, name and address are filled in for you.</p>}
            {ready && !tested && <p className="mt-sm text-sm text-neutral-700">Send yourself a test of this wording first — Send unlocks once it has gone to you. Changing anything asks for a fresh test.</p>}
            {note && <p className={`mt-sm text-sm font-semibold ${note.ok ? 'text-green-700' : 'text-red-700'}`}>{note.text}</p>}
            {(sentCount > 0 || failed > 0) && <p className="mt-sm text-sm">{sentCount} sent{failed ? <> · <b className="text-red-700">{failed} not sent</b> — press Send again to retry those (sent ones aren’t sent twice)</> : ''}. Each sent copy is on that landlord’s <b>Letters</b> tab.</p>}
            <p className="mt-sm text-xs text-neutral-500">Nothing is sent until you press Send and confirm. “Send me a test” emails {me || 'you'} the copy shown, and files nothing.</p>
          </section>
          <p className="text-xs text-neutral-500">One landlord only? Use <Link href="/admin/document-generator" className="font-semibold underline">Letters &amp; Invoices</Link>.</p>
        </div>
      </main>
    </div>
  )
}
