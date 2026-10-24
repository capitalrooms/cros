'use client'

// Initial monies — a let-only let's money through the client account (17 Oct 2026; lib/finance/initialMonies,
// migration 231). Three steps, each numbered and logged on the letting file:
//   1. Received  — the holding deposit already held + the balance, matched to its bank line (INIT…)
//   2. Landlord  — the rest paid to the landlord (PAY…) — the lettings statement shows them the figures
//   3. Fee       — the tenant-find fee moved to the operations account (TRF…)
// Wording as Alto and Reapit use it. Nothing is deleted: a mistake is voided with a reason.
import { useCallback, useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

const gbp = (n: number | null | undefined) => `£${Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const ukDay = (d?: string | null) => d ? new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const card = 'rounded-2xl border border-neutral-200 bg-white p-lg'
const input = 'rounded-lg border border-neutral-300 bg-white px-sm py-xs text-sm text-neutral-900'
const lbl = 'text-[11px] font-bold uppercase tracking-wider text-neutral-500'

export default function InitialMonies({ tenancyId, onChanged }: { tenancyId: string; onChanged?: () => void }) {
  const [d, setD] = useState<any>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [bankId, setBankId] = useState<string>('')
  const [balance, setBalance] = useState('')
  const [receivedOn, setReceivedOn] = useState(today())
  const [fee, setFee] = useState('')
  const [payOn, setPayOn] = useState(today()), [payRef, setPayRef] = useState('')
  const [trfOn, setTrfOn] = useState(today()), [trfRef, setTrfRef] = useState('')

  const load = useCallback(async () => {
    const r = await adminFetch(`/api/admin/initial-monies?tenancyId=${tenancyId}`)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setError(j.error ?? 'Couldn’t load the initial monies'); return }
    setD(j); setError('')
    if (!j.record) {
      setBalance(String(j.expected.balanceDue ?? ''))
      setFee(j.expected.feeSuggested != null ? String(j.expected.feeSuggested) : '')
      const best = j.bankMatches?.[0]
      if (best) { setBankId(best.id); setBalance(String(best.amount)); setReceivedOn(best.date) }
    }
  }, [tenancyId])
  useEffect(() => { load() }, [load])

  async function act(body: Record<string, unknown>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(true); setError('')
    const r = await adminFetch('/api/admin/initial-monies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenancyId, ...body }) })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setError(j.error ?? 'That didn’t save'); return }
    await load(); onChanged?.()
  }

  if (!d) return <section className={card}><h2 className="text-lg font-bold">Initial monies</h2><p className="mt-xs text-sm text-neutral-500">{error || 'Loading…'}</p></section>
  const e = d.expected, rec = d.record
  const toLandlord = Math.round((Number(e.holding) + Number(balance || 0) - Number(fee || 0)) * 100) / 100

  return (
    <section className={card}>
      <div className="mb-sm flex flex-wrap items-baseline justify-between gap-sm">
        <h2 className="text-lg font-bold">Initial monies</h2>
        <span className="text-xs text-neutral-500">Let only · the money before move-in, the tenant-find fee, and the landlord’s payment</span>
      </div>
      {error && <p className="mb-sm rounded-lg bg-red-50 px-sm py-xs text-sm text-red-800">{error}</p>}

      {/* what's due */}
      <dl className="grid grid-cols-2 gap-sm rounded-xl bg-neutral-50 px-md py-sm text-sm sm:grid-cols-4">
        <div><dt className={lbl}>First rent</dt><dd className="tabular-nums">{gbp(e.firstRent)}</dd></div>
        <div><dt className={lbl}>Deposit</dt><dd className="tabular-nums">{gbp(e.deposit)}</dd></div>
        <div><dt className={lbl}>Holding deposit held</dt><dd className="tabular-nums">− {gbp(e.holding)}</dd></div>
        <div><dt className={lbl}>Balance due from tenant</dt><dd className="font-bold tabular-nums">{gbp(e.balanceDue)}</dd></div>
      </dl>

      {!rec ? (
        <div className="mt-md space-y-md">
          <div>
            <p className={lbl}>1 · The balance — match it to the bank</p>
            {d.bankMatches?.length ? (
              <ul className="mt-xs divide-y divide-neutral-100 rounded-lg border border-neutral-200">
                {d.bankMatches.map((m: any) => (
                  <li key={m.id}>
                    <label className="flex cursor-pointer items-start gap-sm px-sm py-xs text-sm">
                      <input type="radio" name="bank" checked={bankId === m.id} onChange={() => { setBankId(m.id); setBalance(String(m.amount)); setReceivedOn(m.date) }} className="mt-1" />
                      <span className="min-w-0 flex-1"><span className="font-semibold tabular-nums">{gbp(m.amount)}</span> · {ukDay(m.date)} · <span className="text-neutral-600">{m.description}</span>
                        <span className="block text-xs text-green-700">{m.why}{m.number ? ` · ${m.number}` : ''}</span></span>
                    </label>
                  </li>
                ))}
                <li><label className="flex cursor-pointer items-center gap-sm px-sm py-xs text-sm"><input type="radio" name="bank" checked={!bankId} onChange={() => setBankId('')} /> None of these — enter it by hand</label></li>
              </ul>
            ) : <p className="mt-xs text-xs text-neutral-500">No imported bank line looks like it yet (import the bank file, or enter it by hand below).</p>}
            {!bankId && (
              <div className="mt-xs flex flex-wrap gap-sm">
                <label className="text-xs text-neutral-600">Amount received<br /><input value={balance} onChange={x => setBalance(x.target.value)} inputMode="decimal" className={`${input} w-32`} /></label>
                <label className="text-xs text-neutral-600">Date it arrived<br /><input type="date" value={receivedOn} onChange={x => setReceivedOn(x.target.value)} className={input} /></label>
              </div>
            )}
          </div>
          <div>
            <p className={lbl}>2 · Tenant-find fee</p>
            <div className="mt-xs flex flex-wrap items-end gap-sm">
              <label className="text-xs text-neutral-600">Fee (£)<br /><input value={fee} onChange={x => setFee(x.target.value)} inputMode="decimal" className={`${input} w-32`} /></label>
              <span className="pb-xs text-xs text-neutral-500">{e.feeBasis}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-sm rounded-xl border border-neutral-200 px-md py-sm">
            <p className="text-sm">{gbp(e.holding)} held + {gbp(Number(balance || 0))} balance − {gbp(Number(fee || 0))} fee = <strong className="tabular-nums">{gbp(toLandlord)} to the landlord</strong></p>
            <button type="button" disabled={busy || !balance || fee === '' || toLandlord < 0} onClick={() => act({ action: 'receive', balanceAmount: Number(balance), receivedOn, fee: Number(fee), bankTransactionId: bankId || null })}
              className="rounded-lg bg-neutral-900 px-md py-xs text-sm font-bold text-white disabled:opacity-40">{busy ? 'Saving…' : 'Record initial monies'}</button>
          </div>
        </div>
      ) : (
        <div className="mt-md space-y-sm text-sm">
          <Row done title={`Received ${gbp(Number(rec.holding_amount) + Number(rec.balance_amount))}`} detail={`${rec.txn_no} · holding ${gbp(rec.holding_amount)} + balance ${gbp(rec.balance_amount)} on ${ukDay(rec.received_on)}${rec.bank_transactions ? ` · bank ${rec.bank_transactions.txn_no ?? ''}` : ' · entered by hand'}`} />
          <Row done title={`Tenant-find fee ${gbp(rec.fee)}`} detail="Our fee — kept from the initial monies" />
          {rec.paid_on
            ? <Row done title={`Landlord paid ${gbp(rec.amount_paid)}`} detail={`${rec.payout_no} · ${ukDay(rec.paid_on)}${rec.paid_reference ? ` · ref ${rec.paid_reference}` : ''}`} />
            : <Step title={`Pay the landlord ${gbp(rec.to_landlord)}`} hint="Record it once the bank payment has gone." date={payOn} setDate={setPayOn} reference={payRef} setReference={setPayRef} busy={busy}
                button="Record landlord payment" onGo={() => act({ action: 'pay', paidOn: payOn, reference: payRef }, `Record ${gbp(rec.to_landlord)} paid to the landlord on ${ukDay(payOn)}?`)} />}
          {Number(rec.fee) > 0 && (rec.feeTransfer
            ? <Row done title={`Fee moved to the operations account ${gbp(rec.feeTransfer.amount)}`} detail={`${rec.feeTransfer.txn_no} · ${ukDay(rec.feeTransfer.transferred_on)}${rec.feeTransfer.reference ? ` · ref ${rec.feeTransfer.reference}` : ''}`} />
            : <Step title={`Move the fee ${gbp(rec.fee)} to the operations account`} hint="From the client account to the operations account." date={trfOn} setDate={setTrfOn} reference={trfRef} setReference={setTrfRef} busy={busy}
                button="Record transfer" onGo={() => act({ action: 'transfer_fee', transferredOn: trfOn, reference: trfRef }, `Record ${gbp(rec.fee)} moved to the operations account on ${ukDay(trfOn)}?`)} />)}
          <div className="flex flex-wrap items-center gap-md border-t border-neutral-100 pt-sm">
            <button type="button" onClick={() => openSignedIn(`/api/lettings-statement/${tenancyId}`)} className="text-sm font-semibold text-blue-700 hover:underline">Lettings statement (PDF)</button>
            <span className="text-xs text-neutral-500">Send it to the landlord with “Signed &amp; paid” in Landlord updates.</span>
            <button type="button" disabled={busy} onClick={() => { const reason = window.prompt('Why void these initial monies? They stay on record, and the bank line and holding deposit are freed.'); if (reason) act({ action: 'void', reason }) }} className="ml-auto text-xs font-semibold text-neutral-500 underline">Void</button>
          </div>
        </div>
      )}
    </section>
  )
}

/** a PDF behind the sign-in: fetched signed in, then opened (a plain link can't carry it) */
async function openSignedIn(url: string) {
  const win = window.open('', '_blank')
  try {
    const r = await adminFetch(url)
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error ?? 'Couldn’t open it') }
    const href = URL.createObjectURL(await r.blob())
    if (win) win.location.href = href; else window.location.href = href
  } catch (e) { win?.close(); alert(e instanceof Error ? e.message : 'Couldn’t open it') }
}

function Row({ title, detail, done }: { title: string; detail: string; done?: boolean }) {
  return (
    <div className="flex items-start gap-sm">
      <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${done ? 'bg-green-600 text-white' : 'bg-neutral-200 text-neutral-700'}`}>{done ? '✓' : '•'}</span>
      <span><span className="font-semibold text-neutral-900">{title}</span><span className="block text-xs text-neutral-500">{detail}</span></span>
    </div>
  )
}

function Step({ title, hint, date, setDate, reference, setReference, button, onGo, busy }: { title: string; hint: string; date: string; setDate: (v: string) => void; reference: string; setReference: (v: string) => void; button: string; onGo: () => void; busy: boolean }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 px-md py-sm">
      <p className="font-semibold text-neutral-900">{title}</p>
      <p className="text-xs text-neutral-600">{hint}</p>
      <div className="mt-xs flex flex-wrap items-end gap-sm">
        <label className="text-xs text-neutral-600">Date<br /><input type="date" value={date} onChange={x => setDate(x.target.value)} className={input} /></label>
        <label className="text-xs text-neutral-600">Bank reference (optional)<br /><input value={reference} onChange={x => setReference(x.target.value)} className={`${input} w-48`} /></label>
        <button type="button" disabled={busy} onClick={onGo} className="rounded-lg bg-neutral-900 px-md py-xs text-sm font-bold text-white disabled:opacity-40">{busy ? 'Saving…' : button}</button>
      </div>
    </div>
  )
}
