'use client'

// "Their preferred details" card on the AML review (3 Nov 2026). Shows the contact details and nominated bank account
// the landlord gave on their form next to what their landlord record holds, and takes the ticked ones onto the record.
// Shown before they submit too (what they've saved so far), with a preview of the agreement built from their details.
import { useCallback, useEffect, useState } from 'react'
import { adminFetch, downloadPdf } from '@/lib/adminFetch'

interface Data {
  submitted: boolean; landlordLinked: boolean
  contact: { theirs: { email: string; phone: string }; record: { email: string; phone: string }; differs: boolean }
  bank: { theirs: { account_name: string; bank_name: string; sort_code: string; account_number: string; iban: string } | null; record: { account_name: string; bank_name: string; account_number: string } | null; onFile: boolean }
}

export default function TakeDetails({ id, card, h2, hasAgreement }: { id: string; card: string; h2: string; hasAgreement: boolean }) {
  const [d, setD] = useState<Data | null>(null)
  const [contact, setContact] = useState(true)
  const [bank, setBank] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const r = await adminFetch(`/api/landlord-onboarding/${id}/take-details`)
    if (r.ok) setD(await r.json())
  }, [id])
  useEffect(() => { load() }, [load])
  if (!d) return null

  const b = d.bank.theirs
  const sortCode = (s: string) => s.replace(/(\d{2})(?=\d)/g, '$1-')
  const canContact = d.contact.differs, canBank = !!b && !d.bank.onFile
  const save = async () => {
    if (!window.confirm(`Put ${[contact && canContact && 'their contact details', bank && canBank && 'their bank account'].filter(Boolean).join(' and ')} on the landlord record?`)) return
    setBusy(true); setMsg('')
    const r = await adminFetch(`/api/landlord-onboarding/${id}/take-details`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact: contact && canContact, bank: bank && canBank }) })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    setMsg(r.ok ? (j.done?.length ? `Saved ${j.done.join(' and ')} on the landlord record.` : 'Nothing to change.') : j.error ?? 'Could not save')
    load()
  }

  return (
    <div className={card}>
      <h2 className={h2}>Their preferred details</h2>
      {!d.submitted && <p className="mb-sm text-xs text-amber-700">Not submitted yet — this is what they have saved so far.</p>}
      <div className="space-y-sm text-sm">
        <div className="rounded-lg border border-neutral-200 px-sm py-xs">
          <p className="font-semibold text-neutral-900">Contact</p>
          <p className="text-neutral-900">Theirs: {[d.contact.theirs.email, d.contact.theirs.phone].filter(Boolean).join(' · ') || '—'}</p>
          <p className="text-neutral-500">On record: {[d.contact.record.email, d.contact.record.phone].filter(Boolean).join(' · ') || '—'}</p>
          {canContact && <label className="mt-xs flex items-center gap-xs text-xs"><input type="checkbox" checked={contact} onChange={e => setContact(e.target.checked)} /> Use theirs</label>}
          {d.landlordLinked && !canContact && <p className="mt-xs text-xs text-green-700">Matches the landlord record.</p>}
        </div>
        <div className="rounded-lg border border-neutral-200 px-sm py-xs">
          <p className="font-semibold text-neutral-900">Bank account for rent</p>
          <p className="text-neutral-900">Theirs: {b ? [b.account_name, b.bank_name, b.sort_code && sortCode(b.sort_code), b.account_number || b.iban].filter(Boolean).join(' · ') : 'Not given'}</p>
          <p className="text-neutral-500">On record: {d.bank.record ? [d.bank.record.account_name, d.bank.record.bank_name, d.bank.record.account_number].filter(Boolean).join(' · ') : 'None'}</p>
          {canBank && <label className="mt-xs flex items-center gap-xs text-xs"><input type="checkbox" checked={bank} onChange={e => setBank(e.target.checked)} /> Add as their default account (the old one is kept)</label>}
          {b && d.bank.onFile && <p className="mt-xs text-xs text-green-700">Already on the landlord record.</p>}
        </div>
      </div>
      {!d.landlordLinked && <p className="mt-sm text-xs text-neutral-500">Not linked to a landlord record yet — these go on when you approve and create the landlord.</p>}
      {d.landlordLinked && (canContact || canBank) && (
        <button onClick={save} disabled={busy || !((contact && canContact) || (bank && canBank))} className="mt-md w-full rounded-xl bg-neutral-900 py-sm text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-40">{busy ? 'Saving…' : 'Put these on the landlord record'}</button>
      )}
      {hasAgreement && <button onClick={() => downloadPdf(`/api/landlord-onboarding/${id}/agreement?pdf=1`, 'Management-Agreement-preview.pdf')} className="mt-sm w-full rounded-xl border border-neutral-300 py-sm text-sm font-semibold text-neutral-700 hover:bg-neutral-50">Preview agreement with their details</button>}
      {msg && <p className="mt-sm text-xs text-neutral-700">{msg}</p>}
    </div>
  )
}
