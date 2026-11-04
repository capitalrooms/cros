'use client'
// Follow up a landlord we've asked for more (4 Nov 2026, Harry): just the missing details, or the missing details and
// the new management agreement. The email is written for you from what was asked, and you can change any of it;
// it always carries the button to their form. Sent from /api/landlord-onboarding/<id>/follow-up.
import { useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' })

function draft(dear: string, items: string[], withAgreement: boolean) {
  return [
    `Dear ${dear},`,
    'Thank you for sending your details. To finish your registration we still need:',
    items.map(i => `• ${i}`).join('\n'),
    'You can add these on your registration form with the button below. Everything you have already given us is saved.',
    ...(withAgreement ? ['I have also attached your new management agreement. Please read it through, and let me know if anything in it needs changing.'] : []),
    'Kind regards,',
  ].join('\n\n')
}

export default function FollowUp({ id, dear, items, followups, onSent }: { id: string; dear: string; items: string[]; followups: { at: string; withAgreement?: boolean }[]; onSent: () => void }) {
  const [open, setOpen] = useState(false)
  const [withAgreement, setWithAgreement] = useState(false)
  const [message, setMessage] = useState(() => draft(dear, items, false))
  const [edited, setEdited] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [preview, setPreview] = useState<{ to: string[]; subject: string; html: string; attachment: string | null } | null>(null)
  const last = followups[followups.length - 1]

  function choose(w: boolean) {
    setWithAgreement(w)
    // keep their edits; only rewrite the email if it hasn't been touched
    if (!edited) setMessage(draft(dear, items, w))
    else if (w && !/management agreement/i.test(message)) setMessage(m => m.replace(/\n\nKind regards,/, '\n\nI have also attached your new management agreement. Please read it through, and let me know if anything in it needs changing.\n\nKind regards,'))
  }
  async function previewAgreement() {
    const win = window.open('', '_blank')
    const r = await adminFetch(`/api/landlord-onboarding/${id}/agreement?pdf=1`)
    if (!r.ok) { win?.close(); setMsg({ ok: false, text: (await r.json().catch(() => ({}))).error ?? 'Couldn’t open the agreement' }); return }
    const u = URL.createObjectURL(await r.blob()); if (win) win.location.href = u; else window.location.href = u
  }
  async function showPreview() {
    setMsg(null)
    const r = await adminFetch(`/api/landlord-onboarding/${id}/follow-up`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, withAgreement, preview: true }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setMsg({ ok: false, text: d.error ?? 'Couldn’t make the preview' }); return }
    setPreview(d)
  }
  async function send() {
    if (!confirm(withAgreement ? 'Send this follow-up with the new management agreement attached?' : 'Send this follow-up asking for the missing details?')) return
    setBusy(true); setMsg(null)
    const r = await adminFetch(`/api/landlord-onboarding/${id}/follow-up`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, withAgreement }) })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    setMsg(r.ok ? { ok: true, text: `Sent to ${(d.to ?? []).join(' and ')}${d.attached ? ', with the management agreement attached' : ''}.` } : { ok: false, text: d.error ?? 'Couldn’t send it' })
    if (r.ok) { setOpen(false); onSent() }
  }

  return (
    <div className="space-y-sm">
      {last && <p className="text-xs text-amber-800">Followed up {fmt(last.at)}{last.withAgreement ? ', with the management agreement' : ''}{followups.length > 1 ? ` · ${followups.length} follow-ups so far` : ''}.</p>}
      {msg && <p className={`text-xs font-semibold ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</p>}
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="w-full rounded-xl bg-neutral-900 py-sm text-sm font-semibold text-white hover:bg-neutral-700">Follow up by email…</button>
      ) : (
        <div className="space-y-sm rounded-xl border border-neutral-200 bg-white p-md">
          <div className="grid gap-xs text-sm">
            <label className="flex items-start gap-sm"><input type="radio" className="mt-1" checked={!withAgreement} onChange={() => choose(false)} /> <span><b>Just ask for what’s still missing</b></span></label>
            <label className="flex items-start gap-sm"><input type="radio" className="mt-1" checked={withAgreement} onChange={() => choose(true)} /> <span><b>Ask for what’s missing and send the new management agreement</b> <button type="button" onClick={previewAgreement} className="text-xs font-semibold text-blue-700 underline">see it</button></span></label>
          </div>
          <textarea value={message} onChange={e => { setMessage(e.target.value); setEdited(true) }} rows={12} className="w-full rounded-lg border border-neutral-300 px-sm py-xs text-sm" />
          <p className="text-xs text-neutral-500">Ends with a button to their registration form. Sent to them (and their co-owner, if they gave one).{withAgreement ? ' The agreement is the one you sent, with their own details from the form where you accepted them. It doesn’t count as approving their AML.' : ''}</p>
          <div className="flex gap-sm">
            <button type="button" onClick={showPreview} disabled={busy || !message.trim()} className="rounded-xl border border-neutral-300 px-md text-sm font-semibold">Preview the email</button>
            <button type="button" onClick={send} disabled={busy || !message.trim()} className="flex-1 rounded-xl bg-neutral-900 py-sm text-sm font-semibold text-white disabled:opacity-40">{busy ? 'Sending…' : 'Send the follow-up'}</button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-neutral-300 px-md text-sm font-semibold">Close</button>
          </div>
          {preview && (
            <div className="space-y-xs rounded-xl border border-neutral-300 bg-neutral-50 p-sm">
              <div className="flex items-start justify-between gap-sm text-xs">
                <span><b>To</b> {preview.to.join(', ')}<br /><b>Subject</b> {preview.subject}{preview.attachment && <><br /><b>Attached</b> {preview.attachment} <button type="button" onClick={previewAgreement} className="font-semibold text-blue-700 underline">open it</button></>}</span>
                <button type="button" onClick={() => setPreview(null)} className="font-semibold text-neutral-600">Hide</button>
              </div>
              <iframe title="The email as it will arrive" srcDoc={preview.html} sandbox="" className="h-[520px] w-full rounded-lg border border-neutral-200 bg-white" />
              <p className="text-xs text-neutral-500">Change the wording above and press Preview again to see it updated.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
