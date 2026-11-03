'use client'

// One letter to several landlords (3 Nov 2026, Harry: "send a document I prepare to all landlords or chosen landlords
// … to save me writing it 6 times"). Each chosen landlord gets their own copy — their name and correspondence address
// on the letterhead, "Dear …" to them, the email greeting to them, their copy-in list on cc — sent one by one through
// the same sending as a single letter (/api/admin/document-generator/send). Previewed by choosing; sent on confirm.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { adminFetch } from '@/lib/adminFetch'
import { dearName, landlordFormalNames } from '@/lib/people'

type Letter = { recipientName: string; recipientAddress: string; salutation: string; [k: string]: any }
interface LL { id: string; name: string; dear: string; email: string | null; address: string | null; cc: string[]; properties: number }

export default function SendToLandlords({ letter, subject, message, signer }: { letter: Letter; subject: string; message: string; signer: Record<string, unknown> }) {
  const [open, setOpen] = useState(false)
  const [lls, setLls] = useState<LL[] | null>(null)
  const [pick, setPick] = useState<Record<string, boolean>>({})
  const [result, setResult] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || lls) return
    ;(async () => {
      const sb = createClient()
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
  }, [open, lls])

  const chosen = (lls ?? []).filter(l => pick[l.id])
  const greet = (l: LL) => message.replace(/^(Dear|Hi|Hello)\b[^\n,]*,?/i, `Dear ${l.dear},`)
  async function sendAll() {
    if (!chosen.length) return
    const noEmail = chosen.filter(l => !l.email)
    if (!window.confirm(`Send this letter to ${chosen.length - noEmail.length} landlord${chosen.length - noEmail.length === 1 ? '' : 's'}, each with their own name and address on it?${noEmail.length ? `\n\nNo email address for: ${noEmail.map(l => l.name).join(', ')} — they’ll be skipped.` : ''}`)) return
    setBusy(true)
    for (const l of chosen) {
      if (!l.email) { setResult(r => ({ ...r, [l.id]: 'No email — skipped' })); continue }
      setResult(r => ({ ...r, [l.id]: 'Sending…' }))
      const mine = { ...letter, recipientName: l.name, recipientAddress: l.address ?? '', salutation: `Dear ${l.dear}` }
      const res = await adminFetch('/api/admin/document-generator/send', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: [l.email], cc: l.cc, subject, message: greet(l), letter: mine, signer }) })
      const j = await res.json().catch(() => ({}))
      setResult(r => ({ ...r, [l.id]: res.ok ? 'Sent ✓' : (j.error ?? 'Not sent') }))
    }
    setBusy(false)
  }

  if (!open) return <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold text-blue-700 hover:underline">Send to several landlords instead…</button>
  return (
    <div className="space-y-sm rounded-xl border border-neutral-200 p-md">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <p className="text-sm font-bold">Send to several landlords</p>
        <div className="flex gap-sm text-xs font-semibold">
          <button type="button" onClick={() => setPick(Object.fromEntries((lls ?? []).map(l => [l.id, true])))} className="text-blue-700 hover:underline">All</button>
          <button type="button" onClick={() => setPick({})} className="text-blue-700 hover:underline">None</button>
          <button type="button" onClick={() => setOpen(false)} className="text-neutral-600">Close</button>
        </div>
      </div>
      <p className="text-xs text-neutral-500">Each gets their own copy: their name and correspondence address on the letter, “Dear …” to them, and their copy-in contacts on cc. Write the letter for one landlord; the name and address are swapped for each.</p>
      {!lls && <p className="text-sm text-neutral-500">Loading landlords…</p>}
      <ul className="max-h-80 divide-y divide-neutral-100 overflow-y-auto">
        {lls?.map(l => (
          <li key={l.id} className="flex items-start gap-sm py-xs text-sm">
            <input type="checkbox" className="mt-1" checked={!!pick[l.id]} onChange={e => setPick(p => ({ ...p, [l.id]: e.target.checked }))} aria-label={`Send to ${l.name}`} />
            <span className="min-w-0 flex-1"><span className="font-semibold">{l.name}</span> <span className="text-xs text-neutral-500">· {l.properties} propert{l.properties === 1 ? 'y' : 'ies'}</span>
              <span className="block text-xs text-neutral-500">{l.email ?? <span className="text-red-700">no email</span>}{l.cc.length ? ` · cc ${l.cc.join(', ')}` : ''}</span>
              {!l.address && <span className="block text-xs text-amber-700">No correspondence address — fill it from People › Landlords › Addresses from statements</span>}
            </span>
            {result[l.id] && <span className={`text-xs font-semibold ${result[l.id].startsWith('Sent') ? 'text-green-700' : result[l.id] === 'Sending…' ? 'text-neutral-500' : 'text-red-700'}`}>{result[l.id]}</span>}
          </li>
        ))}
      </ul>
      <button type="button" disabled={busy || !chosen.length || !subject.trim() || !message.trim()} onClick={sendAll} className="rounded-lg bg-neutral-900 px-lg py-sm text-sm font-semibold text-white disabled:opacity-40">{busy ? 'Sending…' : `Send to ${chosen.length} landlord${chosen.length === 1 ? '' : 's'}`}</button>
    </div>
  )
}
