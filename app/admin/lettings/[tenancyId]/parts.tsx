'use client'

// The letting file's tabs (page.tsx holds the header, tabs and people). Each step to move-in is ticked off here;
// documents open as PDFs; nothing is sent from this page — sending happens in the move-in pack, Letters & Invoices
// or the holding deposit, each with its own review.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { adminFetch } from '@/lib/adminFetch'
import HoldingDepositModal from '@/components/HoldingDepositModal'
import SetOnNoticeModal, { type OnNoticeData } from '@/app/components/SetOnNoticeModal'
import { createClient } from '@/lib/supabase'
import type { LettingFile, StepId } from '@/lib/lettings/lettingFile'

type Patch = (body: Record<string, unknown>) => Promise<void>

export const gbp = (n: number | null | undefined) => n == null || n === ('' as any) ? '—' : `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const day = (iso: string | null | undefined) => iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—'
const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const ordinal = (n: number) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th')
const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86400000)

/** Opens a PDF from an admin API route in a new tab (the route needs the sign-in header, so a plain link won't do). */
export async function openPdf(url: string) {
  const win = window.open('', '_blank')
  try {
    const r = await adminFetch(url)
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error ?? 'Could not open it') }
    const blob = await r.blob()
    const href = URL.createObjectURL(blob)
    if (win) win.location.href = href; else window.location.href = href
  } catch (e) {
    win?.close()
    alert(e instanceof Error ? e.message : 'Could not open it')
  }
}

async function openGenerated(id: string) {
  const win = window.open('', '_blank')
  const r = await adminFetch(`/api/admin/documents/generated?id=${id}&mode=view`)
  const d = await r.json().catch(() => ({}))
  if (r.ok && d.url && win) win.location.href = d.url
  else { win?.close(); alert(d.error ?? 'Could not open it') }
}

const card = 'rounded-2xl border border-neutral-200 bg-white p-lg'
const label = 'text-[11px] font-bold uppercase tracking-wider text-neutral-500'
const input = 'rounded-lg border border-neutral-300 px-sm py-xs text-sm text-neutral-900 bg-white'
const btn = 'rounded-lg border border-neutral-300 px-md py-xs text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-40'
const btnDark = 'rounded-lg bg-neutral-900 px-md py-xs text-sm font-bold text-white hover:bg-neutral-700 disabled:opacity-40'

// ── A step that is ticked off with a date ───────────────────────────────────

function Tick({ title, help, value, step, patch, extra, extraValues, confirmText, disabled }: {
  title: string; help?: string; value: string | null | undefined; step: string; patch: Patch
  extra?: React.ReactNode; extraValues?: Record<string, unknown>; confirmText?: string; disabled?: boolean
}) {
  const [date, setDate] = useState(todayIso())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function go(undo: boolean) {
    if (undo && !confirm(`Undo “${title}”? It stays in the activity log.`)) return
    if (!undo && confirmText && !confirm(confirmText)) return
    setBusy(true); setErr('')
    try { await patch({ action: 'step', step, date, undo, ...(extraValues ?? {}) }) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save') }
    finally { setBusy(false) }
  }
  return (
    <div className="rounded-xl border border-neutral-200 p-md">
      {value ? (
        <div className="flex flex-wrap items-center justify-between gap-sm">
          <p className="text-sm"><span className="font-bold text-green-700">✓</span> <span className="font-semibold text-neutral-900">{title}</span> <span className="text-neutral-500">· {day(value)}</span></p>
          <button type="button" onClick={() => go(true)} disabled={busy || disabled} className="text-xs font-semibold text-neutral-500 hover:text-red-600">Undo</button>
        </div>
      ) : (
        <div className="space-y-sm">
          <p className="text-sm font-semibold text-neutral-900">{title}</p>
          {help && <p className="text-xs text-neutral-500">{help}</p>}
          {extra}
          <div className="flex flex-wrap items-center gap-sm">
            <input type="date" className={input} value={date} max={todayIso()} onChange={e => setDate(e.target.value)} />
            <button type="button" onClick={() => go(false)} disabled={busy || disabled} className={btnDark}>{busy ? 'Saving…' : 'Mark done'}</button>
          </div>
        </div>
      )}
      {err && <p className="mt-xs text-xs text-red-700">{err}</p>}
    </div>
  )
}

function CopyRow({ name, value }: { name: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-baseline justify-between gap-md border-b border-neutral-100 py-xs last:border-0">
      <span className="text-xs text-neutral-500 w-36 shrink-0">{name}</span>
      <span className="min-w-0 flex-1 text-sm text-neutral-900 break-words">{value || '—'}</span>
      <button type="button" disabled={!value} onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200) }}
        className="shrink-0 text-xs font-semibold text-blue-700 hover:underline disabled:opacity-30">{copied ? 'Copied' : 'Copy'}</button>
    </div>
  )
}

// ── Progress ────────────────────────────────────────────────────────────────

export function ProgressTab({ file, step, setStep, patch, reload }: { file: LettingFile; step: StepId; setStep: (s: StepId) => void; patch: Patch; reload: () => Promise<void> }) {
  const t = file.tenancy
  const [recordFor, setRecordFor] = useState<string | null>(null)
  const ended = file.stage === 'fell_through'
  const untracked = file.stage !== 'let_agreed' && !t.referencing_sent_at && !t.agreement_signed_at && !t.keys_handed_at && !file.liveHold
  const left = file.deadline ? daysBetween(file.today, file.deadline) : null
  const money = file.money

  return (
    <div className="space-y-md">
      {file.stage === 'let_agreed' && file.deadline && !t.agreement_signed_at && (
        <div className={`rounded-xl px-lg py-sm text-sm ${left != null && left < 4 ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-amber-50 text-amber-900 border border-amber-200'}`}>
          <strong>Agreement to be signed by {day(file.deadline)}</strong> — 15 days from the holding deposit{left != null ? left >= 0 ? `, ${left} day${left === 1 ? '' : 's'} left` : `, ${-left} day${left === -1 ? '' : 's'} overdue` : ''}. After that the holding deposit may have to be returned, unless a later date was agreed in writing.
        </div>
      )}
      {untracked && (
        <p className="rounded-xl bg-neutral-50 px-lg py-sm text-sm text-neutral-600">This tenancy started before the letting file, so the steps before move-in weren’t tracked here. Anything still to do can be ticked off now.</p>
      )}

      <div className="grid grid-cols-1 gap-md md:grid-cols-[230px_minmax(0,1fr)]">
        <ol className={`${card} !p-sm space-y-xs h-fit`}>
          {file.steps.map((s, i) => {
            const cur = s.id === file.currentStep && !ended
            const picked = s.id === step
            return (
              <li key={s.id}>
                <button type="button" onClick={() => setStep(s.id)}
                  className={`flex w-full items-start gap-sm rounded-lg px-sm py-xs text-left ${picked ? 'bg-neutral-100' : 'hover:bg-neutral-50'}`}>
                  <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${s.done ? 'border-green-700 bg-green-700 text-white' : cur ? 'border-blue-700 bg-blue-50 text-blue-700' : 'border-neutral-300 text-neutral-500'}`}>{s.done ? '✓' : i + 1}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-neutral-900">{s.label}</span>
                    <span className={`block text-xs ${s.done ? 'text-green-700' : cur ? 'text-blue-700' : 'text-neutral-500'}`}>{s.done && s.date ? day(s.date) : s.sub.match(/^\d{4}-\d{2}-\d{2}$/) ? day(s.sub) : s.sub.replace(/(\d{4}-\d{2}-\d{2})/, m => day(m))}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>

        <section className={`${card} space-y-md`}>
          {step === 'offer' && (
            <>
              <h2 className="text-lg font-bold">Offer accepted</h2>
              {file.applicant ? (
                <p className="text-sm text-neutral-700">Application from {file.applicant.full_name}{file.applicant.submitted_at ? ` received ${day(file.applicant.submitted_at)}` : ''}. <Link href="/admin/applicants" className="font-semibold text-blue-700 hover:underline">Applicants</Link></p>
              ) : <p className="text-sm text-neutral-500">No application on file for this tenancy.</p>}
            </>
          )}

          {step === 'holding' && (
            <>
              <h2 className="text-lg font-bold">Holding deposit</h2>
              {file.holds.length ? (
                <ul className="divide-y divide-neutral-100">
                  {file.holds.map((h: any) => (
                    <li key={h.id} className="py-sm text-sm">
                      <p className="font-semibold">{h.hold_no} · {gbp(h.amount)} <span className="font-normal text-neutral-600">received {day(h.received_on)}</span> <span className={`ml-xs rounded-full px-sm py-0.5 text-xs ${h.status === 'held' ? 'bg-green-50 text-green-800' : h.status === 'reversed' ? 'bg-neutral-100 text-neutral-500' : 'bg-blue-50 text-blue-800'}`}>{h.status}</span></p>
                      <p className="text-xs text-neutral-500">{h.method.replace('_', ' ')}{h.payer_reference ? ` · ref ${h.payer_reference}` : ''} · from {h.payer_name} · towards the {h.apply_to === 'first_rent' ? 'first rent' : 'deposit'} · recorded by {h.recorded_by}{h.outcome_reason ? ` · ${h.status} ${day(h.outcome_on)}: ${h.outcome_reason}` : ''}</p>
                      {h.receipt_document_id && <button type="button" onClick={() => openGenerated(h.receipt_document_id)} className="mt-xs text-xs font-semibold text-blue-700 hover:underline">View receipt</button>}
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-neutral-500">No holding deposit recorded for this tenancy.</p>}
              {file.applicant && !ended && (
                <button type="button" onClick={() => setRecordFor(file.applicant.id)} className={btn}>{file.liveHold ? 'Holding deposit — receipt, messages, reverse…' : 'Record holding deposit'}</button>
              )}
              {file.liveHold?.status === 'held' && <p className="text-xs text-neutral-500">It’s marked applied automatically when the move-in monies are received.</p>}
            </>
          )}

          {step === 'referencing' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-sm">
                <h2 className="text-lg font-bold">Referencing with Homeppl</h2>
                <a href="https://www.homeppl.com" target="_blank" rel="noreferrer" className={btn}>Open Homeppl ↗</a>
              </div>
              <p className="text-sm text-neutral-600">Everything Homeppl asks for, ready to copy. Mark it sent once the invite has gone.</p>
              <div className="rounded-xl bg-neutral-50 px-md py-xs">
                <CopyRow name="Full name" value={file.tenant.name} />
                <CopyRow name="Email" value={file.tenant.email ?? ''} />
                <CopyRow name="Mobile" value={file.tenant.phone ?? ''} />
                <CopyRow name="Monthly rent · start" value={t.rent_amount ? `${gbp(t.rent_amount)} · ${day(t.start_date)}` : ''} />
                <CopyRow name="Property" value={[file.room.name, file.property.address || file.property.name].filter(Boolean).join(', ')} />
                {file.applicant?.guarantor_name && <>
                  <CopyRow name="Guarantor" value={file.applicant.guarantor_name} />
                  <CopyRow name="Guarantor mobile" value={file.applicant.guarantor_phone ?? ''} />
                  <CopyRow name="Guarantor email" value={file.applicant.guarantor_email ?? ''} />
                </>}
              </div>
              {file.applicant?.guarantor_needed === 'not_sure' && !file.applicant?.guarantor_name && <p className="text-xs text-amber-800">They weren’t sure whether they need a guarantor — check before sending to Homeppl.</p>}
              <button type="button" className={btn} onClick={() => navigator.clipboard.writeText([
                `Name: ${file.tenant.name}`, `Email: ${file.tenant.email ?? ''}`, `Mobile: ${file.tenant.phone ?? ''}`,
                `Rent: ${gbp(t.rent_amount)} per month from ${day(t.start_date)}`, `Property: ${[file.room.name, file.property.address || file.property.name].filter(Boolean).join(', ')}`,
                ...(file.applicant?.guarantor_name ? [`Guarantor: ${file.applicant.guarantor_name}, ${file.applicant.guarantor_phone ?? ''}, ${file.applicant.guarantor_email ?? ''}`] : []),
              ].join('\n'))}>Copy all for Homeppl</button>
              <Tick title="Sent to Homeppl" step="referencing_sent" value={t.referencing_sent_at} patch={patch} disabled={ended} />
              <Tick title="Referencing passed" help="Add any guarantor in the tenant’s profile." step="referencing_passed" value={t.referencing_passed_at} patch={patch} disabled={ended} />
            </>
          )}

          {step === 'right_to_rent' && <RightToRent file={file} patch={patch} disabled={ended} />}

          {step === 'agreement' && (
            <>
              <h2 className="text-lg font-bold">Tenancy agreement</h2>
              <p className="text-sm text-neutral-600">{file.property.lettingType === 'let_only' ? 'Let-only agreement — rent to the landlord.' : 'Capital Rooms — APT room agreement · rent to the client account.'} The move-in pack sends it with the check-in balance and certificates for the tenant to read and confirm.</p>
              <div className="flex flex-wrap gap-sm">
                <button type="button" className={btn} onClick={() => openPdf(`/api/admin/move-in/${t.id}/doc?key=agreement`)}>Preview agreement</button>
                <Link href={`/admin/move-in/${t.id}`} className={btnDark}>Move-in pack →</Link>
              </div>
              {file.pack ? (
                <p className="text-sm text-neutral-700">Move-in pack sent {day(file.pack.sent_at)}{file.pack.first_viewed_at ? ` · opened ${day(file.pack.first_viewed_at)}` : ' · not opened yet'}{file.pack.confirmed_at ? ` · read and confirmed ${day(file.pack.confirmed_at)}${file.pack.confirmed_name ? ` by ${file.pack.confirmed_name}` : ''}` : ''}</p>
              ) : <p className="text-sm text-neutral-500">Move-in pack not sent yet.</p>}
              <Tick title="Sent for signing" help="Once the tenant has confirmed reading the pack, send the agreement through Adobe Sign." step="agreement_sent" value={t.agreement_sent_at} patch={patch} disabled={ended} />
              <Tick title="Agreement signed" help="Both signed copies come back by email — upload the signed copy to the tenant’s documents." step="agreement_signed" value={t.agreement_signed_at} patch={patch} disabled={ended} />
            </>
          )}

          {step === 'monies' && (
            <>
              <h2 className="text-lg font-bold">Move-in monies</h2>
              {money ? (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-neutral-100">
                    <tr><td className="py-xs">Deposit (five weeks)</td><td className="py-xs text-right tabular-nums">{gbp(money.deposit)}</td></tr>
                    {money.firstRent != null && <tr><td className="py-xs">Rent {day(money.firstFrom)} – {day(money.firstTo)}{money.firstFull === false ? ' (part month)' : ''}</td><td className="py-xs text-right tabular-nums">{gbp(money.firstRent)}</td></tr>}
                    {money.holdingDeposit > 0 && <tr><td className="py-xs">Less holding deposit received</td><td className="py-xs text-right tabular-nums">−{gbp(money.holdingDeposit)}</td></tr>}
                    <tr className="font-bold"><td className="py-xs">Balance due{money.payBy ? ` by ${day(money.payBy)}` : ''}</td><td className="py-xs text-right tabular-nums">{gbp(money.amountDue)}</td></tr>
                  </tbody>
                </table>
              ) : <p className="text-sm text-neutral-500">Add the start date and rent in Terms to work this out.</p>}
              {money && <p className="text-xs text-neutral-500">Paid to {money.bank.name} · {money.bank.sortCode} · {money.bank.accountNo} · reference <strong>{money.paymentRef}</strong></p>}
              {file.moneyWarnings.length > 0 && <ul className="text-xs text-amber-800 list-disc pl-lg">{file.moneyWarnings.map(w => <li key={w}>{w}</li>)}</ul>}
              <button type="button" className={btn} onClick={() => openPdf(`/api/admin/move-in/${t.id}/doc?key=check_in`)}>Check-in balance (PDF)</button>
              <Tick title="Move-in monies received" step="monies" value={t.move_in_monies_received_at} patch={patch} disabled={ended}
                help="Record the payment against the rent in Rent roll as usual; this marks the step done."
                confirmText={file.liveHold?.status === 'held' ? `This also marks holding deposit ${file.liveHold.hold_no} as applied — that can’t be undone. Continue?` : undefined} />
            </>
          )}

          {step === 'deposit' && <DepositStep file={file} patch={patch} disabled={ended} />}

          {step === 'keys' && (
            <>
              <h2 className="text-lg font-bold">Keys &amp; check-in</h2>
              <p className="text-sm text-neutral-600">Meet them at the property for the tour and key handover, with the inventory and any existing damage noted beforehand. Keys only once the balance has cleared.</p>
              {!t.move_in_monies_received_at && <p className="text-xs text-amber-800">Move-in monies aren’t marked received yet.</p>}
              <Tick title="Keys handed over" step="keys" value={t.keys_handed_at} patch={patch} disabled={ended} />
            </>
          )}

          {step === 'move_in' && (
            <>
              <h2 className="text-lg font-bold">Move in</h2>
              <p className="text-sm text-neutral-700">{t.start_date ? (t.start_date <= file.today ? `Moved in ${day(t.start_date)}. The room shows as occupied and the rent schedule runs from the start date.` : `On ${day(t.start_date)} the tenancy goes live: the room shows as occupied and the rent schedule starts.`) : 'Set the start date in Terms.'}</p>
            </>
          )}
        </section>
      </div>

      {recordFor && (
        <HoldingDepositModal applicantId={recordFor} onClose={() => setRecordFor(null)} onDone={() => { setRecordFor(null); reload() }} />
      )}
    </div>
  )
}

function RightToRent({ file, patch, disabled }: { file: LettingFile; patch: Patch; disabled: boolean }) {
  const [until, setUntil] = useState('')
  return (
    <>
      <h2 className="text-lg font-bold">Right to Rent</h2>
      <p className="text-sm text-neutral-600">Check before {day(file.tenancy.start_date)} and keep a copy of what you saw (upload it to the tenant’s documents). If their right is time-limited, add the date to recheck.</p>
      {file.tenant.rightToRentUntil && <p className="text-sm text-amber-800">Time-limited — recheck by {day(file.tenant.rightToRentUntil)}.</p>}
      <Tick title="Right to Rent checked" step="right_to_rent" value={file.tenancy.right_to_rent_checked_at} patch={patch} disabled={disabled}
        extra={<label className="flex flex-wrap items-center gap-sm text-xs text-neutral-600">Time-limited? Recheck by <input type="date" className={input} value={until} onChange={e => setUntil(e.target.value)} /></label>}
        extraValues={until ? { rightToRentUntil: until } : undefined} />
    </>
  )
}

function DepositStep({ file, patch, disabled }: { file: LettingFile; patch: Patch; disabled: boolean }) {
  const t = file.tenancy
  const [scheme, setScheme] = useState(t.deposit_scheme || 'DPS')
  const [ref, setRef] = useState('')
  return (
    <>
      <h2 className="text-lg font-bold">Deposit protected</h2>
      <p className="text-sm text-neutral-600">Protect the {gbp(t.deposit_amount)} deposit within 30 days of receiving it, and serve the prescribed information on {file.tenant.name}{file.landlord ? ` and ${file.landlord.name}` : ''}.</p>
      {t.deposit_protection_assumed && !t.deposit_protected_at && <p className="text-xs text-neutral-500">Taken as protected — this tenancy started before CROS records began.</p>}
      <Tick title="Deposit protected" step="deposit_protected" value={t.deposit_protected_at} patch={patch} disabled={disabled}
        extra={<div className="flex flex-wrap gap-sm">
          <select className={input} value={scheme} onChange={e => setScheme(e.target.value)}>
            {['DPS', 'mydeposits', 'TDS'].map(x => <option key={x}>{x}</option>)}
          </select>
          <input className={input} placeholder="Scheme reference" value={ref} onChange={e => setRef(e.target.value)} />
        </div>}
        extraValues={{ scheme, schemeRef: ref }} />
      {t.deposit_scheme_ref && <p className="text-xs text-neutral-500">{t.deposit_scheme} reference {t.deposit_scheme_ref}</p>}
      <Tick title="Prescribed information served" step="prescribed_info" value={t.prescribed_info_served_at} patch={patch} disabled={disabled} />
    </>
  )
}

// ── Terms ───────────────────────────────────────────────────────────────────

const TERM_FIELDS: { key: string; label: string; kind: 'date' | 'money' | 'int' | 'text' | 'long' | 'agreement'; beforeMoveIn: boolean }[] = [
  { key: 'start_date', label: 'Start date', kind: 'date', beforeMoveIn: true },
  { key: 'rent_amount', label: 'Rent (pcm)', kind: 'money', beforeMoveIn: true },
  { key: 'rent_due_day', label: 'Rent due day', kind: 'int', beforeMoveIn: true },
  { key: 'deposit_amount', label: 'Deposit', kind: 'money', beforeMoveIn: true },
  { key: 'payment_reference', label: 'Payment reference', kind: 'text', beforeMoveIn: true },
  { key: 'agreement_type', label: 'Agreement type', kind: 'agreement', beforeMoveIn: true },
  { key: 'notice_period_months', label: 'Notice period (months)', kind: 'int', beforeMoveIn: false },
  { key: 'special_clauses', label: 'Special clauses', kind: 'long', beforeMoveIn: false },
  { key: 'permitted_occupiers', label: 'Permitted occupiers', kind: 'text', beforeMoveIn: false },
  { key: 'office_notes', label: 'Office notes (not shown to the tenant)', kind: 'long', beforeMoveIn: false },
]
const AGREEMENT_TYPES: [string, string][] = [['assured_periodic', 'Assured periodic'], ['fixed_term', 'Fixed term'], ['company_let', 'Company let'], ['licence', 'Licence'], ['room_licence', 'Room licence']]

export function TermsTab({ file, patch }: { file: LettingFile; patch: Patch }) {
  const t = file.tenancy
  const beforeMoveIn = file.stage === 'let_agreed'
  const [edit, setEdit] = useState(false)
  const [vals, setVals] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  function start() { setVals(Object.fromEntries(TERM_FIELDS.map(f => [f.key, t[f.key] == null ? '' : String(t[f.key])]))); setEdit(true); setErr('') }
  async function save() {
    setBusy(true); setErr('')
    const changes = Object.fromEntries(TERM_FIELDS.filter(f => (beforeMoveIn || !f.beforeMoveIn) && vals[f.key] !== (t[f.key] == null ? '' : String(t[f.key]))).map(f => [f.key, vals[f.key]]))
    try { await patch({ action: 'terms', changes }); setEdit(false) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save') }
    finally { setBusy(false) }
  }
  const show = (f: typeof TERM_FIELDS[number]) => {
    const v = t[f.key]
    if (v == null || v === '') return '—'
    if (f.kind === 'date') return day(v)
    if (f.kind === 'money') return gbp(v)
    if (f.kind === 'agreement') return AGREEMENT_TYPES.find(a => a[0] === v)?.[1] ?? v
    if (f.key === 'rent_due_day') return `${ordinal(Number(v))} of the month`
    return String(v)
  }
  const fixed: [string, string][] = [
    ['End date', t.end_date ? day(t.end_date) : t.is_periodic ? 'Periodic — no end date' : '—'],
    ['Letting fee', t.letting_fee_charged == null ? 'Property’s usual fee' : Number(t.letting_fee_charged) === 0 ? 'No fee' : gbp(t.letting_fee_charged)],
    ['Management fee', t.management_fee_type ? `${t.management_fee_type === 'fixed' ? gbp(t.management_fee_fixed) : `${t.management_fee_pct}%`} (this tenancy)` : 'Property’s usual fee'],
    ['Deposit number', t.deposit_no ?? '—'],
    ['Letting fee number', t.letting_fee_no ?? '—'],
    ['Rent review date', day(t.rent_review_date)],
  ]
  return (
    <section className={`${card} space-y-md`}>
      <div className="flex items-center justify-between gap-sm">
        <h2 className="text-lg font-bold">Terms</h2>
        {!edit && file.stage !== 'fell_through' && <button type="button" onClick={start} className={btn}>Edit</button>}
      </div>
      {!beforeMoveIn && <p className="text-xs text-neutral-500">Rent, dates, deposit and reference are fixed once the tenancy has started — change the rent with a rent review.</p>}
      {err && <p className="text-sm text-red-700">{err}</p>}
      <dl className="grid grid-cols-1 gap-x-lg gap-y-sm sm:grid-cols-2">
        {TERM_FIELDS.map(f => {
          const locked = f.beforeMoveIn && !beforeMoveIn
          return (
            <div key={f.key} className={f.kind === 'long' ? 'sm:col-span-2' : ''}>
              <dt className={label}>{f.label}</dt>
              <dd className="mt-0.5 text-sm text-neutral-900 whitespace-pre-wrap">
                {edit && !locked ? (
                  f.kind === 'long' ? <textarea rows={3} className={`${input} w-full`} value={vals[f.key]} onChange={e => setVals(v => ({ ...v, [f.key]: e.target.value }))} />
                  : f.kind === 'agreement' ? <select className={`${input} w-full`} value={vals[f.key]} onChange={e => setVals(v => ({ ...v, [f.key]: e.target.value }))}>{AGREEMENT_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                  : <input type={f.kind === 'date' ? 'date' : 'text'} inputMode={f.kind === 'money' ? 'decimal' : f.kind === 'int' ? 'numeric' : undefined} className={`${input} w-full`} value={vals[f.key]} onChange={e => setVals(v => ({ ...v, [f.key]: e.target.value }))} />
                ) : show(f)}
              </dd>
            </div>
          )
        })}
        {fixed.map(([k, v]) => (
          <div key={k}><dt className={label}>{k}</dt><dd className="mt-0.5 text-sm text-neutral-900">{v}</dd></div>
        ))}
      </dl>
      {edit && (
        <div className="flex gap-sm">
          <button type="button" onClick={() => setEdit(false)} disabled={busy} className={btn}>Cancel</button>
          <button type="button" onClick={save} disabled={busy} className={btnDark}>{busy ? 'Saving…' : 'Save terms'}</button>
        </div>
      )}
    </section>
  )
}

// ── Money ───────────────────────────────────────────────────────────────────

export function MoneyTab({ file }: { file: LettingFile }) {
  const t = file.tenancy
  const acc = file.account
  return (
    <div className="space-y-md">
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-sm mb-sm">
          <h2 className="text-lg font-bold">Rent account</h2>
          <button type="button" className={btn} onClick={() => openPdf(`/api/admin/tenancies/${t.id}/statement-of-account`)}>Statement of account (PDF)</button>
        </div>
        {acc && acc.lines.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wide text-neutral-500 border-b border-neutral-200">
                <th className="py-xs pr-sm font-semibold">Date</th><th className="py-xs pr-sm font-semibold">Details</th><th className="py-xs pr-sm font-semibold">Ref</th>
                <th className="py-xs pr-sm font-semibold text-right">Charged</th><th className="py-xs pr-sm font-semibold text-right">Paid</th><th className="py-xs font-semibold text-right">Balance</th>
              </tr></thead>
              <tbody className="divide-y divide-neutral-100 tabular-nums">
                {acc.lines.map((l, i) => (
                  <tr key={i}><td className="py-xs pr-sm whitespace-nowrap">{l.date}</td><td className="py-xs pr-sm">{l.details}</td><td className="py-xs pr-sm text-xs text-neutral-500">{l.reference}</td>
                    <td className="py-xs pr-sm text-right">{l.charged != null ? gbp(l.charged) : ''}</td><td className="py-xs pr-sm text-right">{l.paid != null ? gbp(l.paid) : ''}</td><td className="py-xs text-right font-semibold">{gbp(l.balance)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-neutral-500">{file.stage === 'let_agreed' ? 'Rent charges start from the move-in date.' : 'No rent charges recorded for this tenancy yet.'}</p>}
      </section>

      <section className={card}>
        <h2 className="text-lg font-bold mb-sm">Deposit</h2>
        <dl className="grid grid-cols-2 gap-sm text-sm sm:grid-cols-3">
          <div><dt className={label}>Amount</dt><dd>{gbp(t.deposit_amount)}{t.deposit_no ? ` · ${t.deposit_no}` : ''}</dd></div>
          <div><dt className={label}>Protected</dt><dd>{t.deposit_protected_at ? `${day(t.deposit_protected_at)} · ${t.deposit_scheme ?? ''} ${t.deposit_scheme_ref ?? ''}` : t.deposit_protection_assumed ? 'Taken as protected (before CROS)' : 'Not yet'}</dd></div>
          <div><dt className={label}>Prescribed info</dt><dd>{t.prescribed_info_served_at ? day(t.prescribed_info_served_at) : 'Not yet'}</dd></div>
          {file.depositReturn && <div className="col-span-2 sm:col-span-3"><dt className={label}>Return</dt><dd>{file.depositReturn.txn_no} · {file.depositReturn.status} · to tenant {gbp(file.depositReturn.to_tenant)}, to landlord {gbp(file.depositReturn.to_landlord)}{file.depositReturn.returned_on ? ` · returned ${day(file.depositReturn.returned_on)}` : ''}</dd></div>}
        </dl>
      </section>

      <section className={card}>
        <h2 className="text-lg font-bold mb-sm">Holding deposit</h2>
        {file.holds.length ? file.holds.map((h: any) => (
          <p key={h.id} className="text-sm py-xs">{h.hold_no} · {gbp(h.amount)} received {day(h.received_on)} · <strong>{h.status}</strong>{h.outcome_on ? ` ${day(h.outcome_on)}` : ''}
            {h.receipt_document_id && <> · <button type="button" onClick={() => openGenerated(h.receipt_document_id)} className="font-semibold text-blue-700 hover:underline">receipt</button></>}</p>
        )) : <p className="text-sm text-neutral-500">None recorded.</p>}
      </section>
    </div>
  )
}

// ── Documents ───────────────────────────────────────────────────────────────

export function DocumentsTab({ file }: { file: LettingFile }) {
  const t = file.tenancy
  return (
    <div className="space-y-md">
      <section className={card}>
        <h2 className="text-lg font-bold mb-sm">Made from this tenancy</h2>
        <div className="flex flex-wrap gap-sm">
          <button type="button" className={btn} onClick={() => openPdf(`/api/admin/move-in/${t.id}/doc?key=agreement`)}>Tenancy agreement</button>
          <button type="button" className={btn} onClick={() => openPdf(`/api/admin/move-in/${t.id}/doc?key=check_in`)}>Check-in balance</button>
          <button type="button" className={btn} onClick={() => openPdf(`/api/admin/tenancies/${t.id}/statement-of-account`)}>Statement of account</button>
        </div>
        <p className="mt-sm text-xs text-neutral-500">Always made from the current terms, so the figures match.</p>
      </section>
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-sm mb-sm">
          <h2 className="text-lg font-bold">Filed documents</h2>
          <Link href={`/admin/tenant/${file.tenant.id}?tab=documents`} className="text-sm font-semibold text-blue-700 hover:underline">Upload in the tenant’s profile →</Link>
        </div>
        {file.files.length ? (
          <ul className="divide-y divide-neutral-100 text-sm">
            {file.files.map((d: any) => (
              <li key={d.id} className="flex items-baseline justify-between gap-md py-xs">
                <span className="min-w-0"><span className="font-semibold">{d.file_name}</span><span className="block text-xs text-neutral-500">{String(d.document_type ?? '').replace(/_/g, ' ')} · {day(d.uploaded_at)}</span></span>
                {/^https?:/.test(d.storage_url ?? '') && <a href={d.storage_url} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-semibold text-blue-700 hover:underline">Open</a>}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-neutral-500">Nothing filed against this tenancy yet — references and Right to Rent from the application move here at let agreed.</p>}
      </section>
    </div>
  )
}

// ── Letters & invoices ──────────────────────────────────────────────────────

export function LettersTab({ file }: { file: LettingFile }) {
  return (
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-sm mb-sm">
        <h2 className="text-lg font-bold">Letters &amp; invoices</h2>
        <Link href={`/admin/document-generator?tenancy=${file.tenancy.id}`} className={btnDark}>New letter or invoice</Link>
      </div>
      {file.documents.length ? (
        <ul className="divide-y divide-neutral-100 text-sm">
          {file.documents.map((d: any) => (
            <li key={d.id} className="flex items-baseline justify-between gap-md py-xs">
              <span className="min-w-0"><span className="font-semibold">{d.kind === 'letter' ? d.title : `${d.number}${d.title ? ` — ${d.title}` : ''}`}</span>
                <span className="block text-xs text-neutral-500">{d.kind} to {d.recipient_name} · {day(d.created_at)}{d.total != null ? ` · ${gbp(d.total)}` : ''} · {d.emailed_at ? `emailed ${day(d.emailed_at)}` : 'not emailed'}</span></span>
              <button type="button" onClick={() => openGenerated(d.id)} className="shrink-0 text-xs font-semibold text-blue-700 hover:underline">View</button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-neutral-500">Nothing yet. Letters, invoices and receipts made for this tenancy appear here and in Letters &amp; Invoices.</p>}
    </section>
  )
}

// ── Notice & renewal ────────────────────────────────────────────────────────

type Person = { id: string; name: string; email?: string; phone?: string }
const pname = (p: any) => p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email

export function NoticeTab({ file, patch, reload, startMarking }: { file: LettingFile; patch: Patch; reload: () => Promise<void>; startMarking?: boolean }) {
  const t = file.tenancy
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [marking, setMarking] = useState(false)
  const [cleaners, setCleaners] = useState<Person[]>([])
  const [contractors, setContractors] = useState<Person[]>([])
  const [done, setDone] = useState('')

  async function openMarking() {
    setMarking(true); setDone('')
    const sb = createClient()
    const [{ data: cl }, { data: co }] = await Promise.all([
      sb.from('people').select('id, first_name, last_name, full_name, email, phone').eq('role', 'cleaner').order('first_name'),
      sb.from('people').select('id, first_name, last_name, full_name, email').eq('role', 'contractor').order('first_name'),
    ])
    setCleaners(((cl ?? []) as any[]).map(p => ({ id: p.id, name: pname(p), email: p.email, phone: p.phone })))
    setContractors(((co ?? []) as any[]).map(p => ({ id: p.id, name: pname(p), email: p.email })))
  }
  // opened from a list's "Mark on notice" (…?tab=notice&mark=1)
  useEffect(() => { if (startMarking && file.stage === 'live') openMarking() }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  async function cancelNotice() {
    const why = prompt('Cancel this notice? The tenancy carries on and the room shows as occupied again.\n\nWhy (optional, kept in the activity):')
    if (why === null) return
    setBusy(true); setErr(''); setDone('')
    try { await patch({ action: 'cancel_notice', reason: why }); setDone('Notice cancelled — the tenancy carries on.') }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not cancel the notice') }
    finally { setBusy(false) }
  }

  async function confirmNotice(d: OnNoticeData) {
    const cleaner = cleaners.find(c => c.id === d.cleanerId)
    const r = await adminFetch('/api/tenancies/set-on-notice', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenancyId: t.id, roomId: file.room.id, propertyId: file.property.id, roomName: file.room.name, propertyAddress: file.property.address || file.property.name || '',
        moveOutDate: d.moveOutDate, noticeReceivedDate: d.noticeReceivedDate, rentDueDay: d.rentDueDay, newAskingRent: d.newAskingRent,
        emailTenant: d.emailTenant, tenantEmail: file.tenant.email, tenantName: file.tenant.name, checkoutEmailHtml: d.checkoutEmailHtml,
        emailCleaner: d.emailCleaner, cleanerId: d.cleanerId, cleanerEmail: cleaner?.email, cleanerName: cleaner?.name,
        notesForLettings: d.notesForLettings, pendingJobs: d.pendingJobs ?? [], jobContractorId: d.jobContractorId,
        proRataAmount: d.proRataAmount, proRataDays: d.proRataDays, dailyRate: d.dailyRate, monthlyRent: t.rent_amount,
      }),
    })
    const res = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(res.error ?? 'Could not mark on notice')
    setMarking(false)
    setDone(`On notice — moving out ${day(d.moveOutDate)}.${res.emailsSent?.tenant ? ' Checkout email sent to the tenant.' : ' No email went to the tenant.'}${res.emailsSent?.cleaner ? ' Cleaner told.' : ''} The lettings team has been alerted.`)
    await reload()
  }
  async function fellThrough() {
    if (!confirm('Mark this let as fallen through? It’s kept on record, comes off every current list, and the room goes back on the market. Deal with the holding deposit (refund or retain) separately.')) return
    setBusy(true); setErr('')
    try { await patch({ action: 'cancel', reason }) } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save') } finally { setBusy(false) }
  }
  return (
    <div className="space-y-md">
      <section className={`${card} space-y-sm`}>
        <h2 className="text-lg font-bold">Notice &amp; renewal</h2>
        <dl className="grid grid-cols-2 gap-sm text-sm sm:grid-cols-3">
          <div><dt className={label}>Notice received</dt><dd>{day(t.notice_received_date)}</dd></div>
          <div><dt className={label}>Moves out</dt><dd>{day(t.end_date)}</dd></div>
          <div><dt className={label}>Notice period</dt><dd>{t.notice_period_months ? `${t.notice_period_months} month${t.notice_period_months === 1 ? '' : 's'}` : '—'}</dd></div>
          <div><dt className={label}>Last rent change</dt><dd>{t.last_rent_change_date ? `${day(t.last_rent_change_date)} (was ${gbp(t.previous_rent_amount)})` : '—'}</dd></div>
          <div><dt className={label}>Rent review due</dt><dd>{day(t.rent_review_date)}</dd></div>
        </dl>
        {done && <p className="rounded-xl border border-green-200 bg-green-50 px-md py-sm text-sm font-semibold text-green-800">{done}</p>}
        {err && file.stage !== 'let_agreed' && <p className="text-sm text-red-700">{err}</p>}
        {(file.stage === 'live' || file.stage === 'on_notice') && (
          <div className="flex flex-wrap gap-sm pt-sm">
            {file.stage === 'live' && <button type="button" onClick={openMarking} className={btnDark}>Mark on notice</button>}
            <Link href={`/admin/rent-increase/${t.id}`} className={btn}>Rent review</Link>
            {file.stage === 'on_notice' && <Link href="/admin/deposits" className={btn}>Deposit return</Link>}
            {file.stage === 'on_notice' && <button type="button" disabled={busy} onClick={cancelNotice} className={btn}>Cancel notice</button>}
          </div>
        )}
        {file.stage === 'live' && <p className="text-xs text-neutral-500">Mark on notice records the dates, works out the final rent, and lets you preview the checkout email before choosing whether to send it.</p>}
      </section>

      {marking && (
        <SetOnNoticeModal
          tenancy={{ id: t.id, person: { name: file.tenant.name, email: file.tenant.email ?? '', phone: file.tenant.phone ?? '' }, room: { name: file.room.name }, property: { name: String(file.property.name ?? '').split('\n')[0], address: [String(file.property.name ?? '').split('\n')[0], file.property.address].filter(Boolean).join(', ') }, rent_amount: Number(t.rent_amount) || 0, rent_due_day: t.rent_due_day }}
          cleaners={cleaners}
          contractors={contractors}
          onClose={() => setMarking(false)}
          onConfirm={confirmNotice}
          initialMoveOutDate={t.end_date ?? undefined}
        />
      )}

      {file.stage === 'let_agreed' && (
        <section className={`${card} space-y-sm border-red-200`}>
          <h2 className="text-lg font-bold">The let fell through</h2>
          <p className="text-sm text-neutral-600">If the applicant withdraws, fails referencing or the landlord pulls out before the start date. The record is kept; the room goes back on the market.</p>
          <input className={`${input} w-full`} placeholder="What happened" value={reason} onChange={e => setReason(e.target.value)} />
          {err && <p className="text-xs text-red-700">{err}</p>}
          <button type="button" disabled={busy || !reason.trim()} onClick={fellThrough} className="rounded-lg border border-red-300 px-md py-xs text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40">{busy ? 'Saving…' : 'Mark as fallen through'}</button>
        </section>
      )}
    </div>
  )
}

// ── Activity ────────────────────────────────────────────────────────────────

/** Everything that happened on this tenancy, newest first (Activity tab and the side panel). */
export function activityItems(file: LettingFile) {
  const items: { at: string; text: string; who?: string | null }[] = []
  for (const e of file.events as any[]) items.push({ at: e.at, text: e.note, who: e.by_email })
  for (const h of file.holds as any[]) {
    if (!(file.events as any[]).some(e => e.kind === 'holding_deposit' && e.note.includes(h.hold_no))) items.push({ at: h.recorded_at, text: `Holding deposit ${h.hold_no} ${gbp(h.amount)} recorded (received ${day(h.received_on)})`, who: h.recorded_by })
    if (h.outcome_at) items.push({ at: h.outcome_at, text: `Holding deposit ${h.hold_no} ${h.status}${h.outcome_reason ? `: ${h.outcome_reason}` : ''}`, who: h.outcome_by })
    if (h.receipt_emailed_at) items.push({ at: h.receipt_emailed_at, text: `Receipt ${h.hold_no} emailed to ${(h.receipt_emailed_to ?? []).join(', ')}` })
  }
  for (const d of file.documents as any[]) {
    items.push({ at: d.created_at, text: `${d.kind === 'letter' ? `Letter “${d.title}”` : `${d.kind === 'receipt' ? 'Receipt' : 'Invoice'} ${d.number}`} made for ${d.recipient_name}` })
    if (d.emailed_at && d.kind !== 'receipt') items.push({ at: d.emailed_at, text: `${d.kind === 'letter' ? 'Letter' : 'Invoice'} emailed to ${(d.emailed_to ?? []).join(', ')}` })
  }
  if (file.pack) {
    items.push({ at: file.pack.sent_at, text: 'Move-in pack sent' })
    if (file.pack.first_viewed_at) items.push({ at: file.pack.first_viewed_at, text: 'Move-in pack opened by the tenant' })
    if (file.pack.confirmed_at) items.push({ at: file.pack.confirmed_at, text: `Move-in pack read and confirmed${file.pack.confirmed_name ? ` by ${file.pack.confirmed_name}` : ''}` })
  }
  if (file.applicant?.submitted_at) items.push({ at: file.applicant.submitted_at, text: 'Application received' })
  items.sort((a, b) => b.at.localeCompare(a.at))
  return items
}

export function ActivityTab({ file }: { file: LettingFile }) {
  const items = activityItems(file)
  return (
    <section className={card}>
      <h2 className="text-lg font-bold mb-sm">Activity</h2>
      {!file.eventsReady && <p className="mb-sm text-xs text-amber-800">The step-by-step log starts once migration 199 is run.</p>}
      {items.length ? (
        <ol className="space-y-sm">
          {items.map((it, i) => (
            <li key={i} className="flex gap-md text-sm">
              <span className="w-24 shrink-0 tabular-nums text-neutral-500">{day(it.at)}</span>
              <span className="min-w-0 text-neutral-900">{it.text}{it.who ? <span className="text-neutral-400"> · {it.who}</span> : null}</span>
            </li>
          ))}
        </ol>
      ) : <p className="text-sm text-neutral-500">Nothing recorded yet.</p>}
    </section>
  )
}
