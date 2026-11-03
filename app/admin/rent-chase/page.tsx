'use client'

// Rent chase (1 Nov 2026, Harry: "import rents on 2nd Nov … 10 received and 40 missing … go through list just to
// confirm the rent amount owed and then click to send at the end"). Every current tenant whose rent account shows
// unpaid rent, with the amount; untick anyone not to chase, correct an amount if needed, pick the reminder and
// send them all at once. Let-only tenants pay their landlord, so they aren't listed. /api/admin/rent-chase.
import { useEffect, useState } from 'react'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import { rentOwedTabs } from '@/lib/financeTabs'
import BackButton from '@/app/components/BackButton'
import { adminFetch } from '@/lib/adminFetch'

interface Row { tenancyId: string; tenants: string; room: string; house: string; rent: number | null; owed: number; owedMonths: string[]; ref: string | null; email: boolean; phone: boolean }
type Channel = 'email' | 'sms' | 'push'
const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const MESSAGES = [['rent-late', 'Friendly reminder'], ['rent-late-2', 'Second reminder (asks for payment by a date)']] as const

export default function RentChasePage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [checked, setChecked] = useState(0)
  const [statementsOnly, setStatementsOnly] = useState(false)
  const [error, setError] = useState('')
  const [tick, setTick] = useState<Record<string, boolean>>({})
  const [amount, setAmount] = useState<Record<string, string>>({})
  const [messageId, setMessageId] = useState<string>('rent-late')
  const [byDate, setByDate] = useState('')
  const [channels, setChannels] = useState<Channel[]>(['email', 'sms', 'push'])
  const [preview, setPreview] = useState<{ subject: string; email: string; sms: string } | null>(null)
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState<any[] | null>(null)

  useEffect(() => {
    adminFetch('/api/admin/rent-chase').then(async r => {
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error ?? 'Could not load'); return }
      setRows(d.rows); setChecked(d.checked); setStatementsOnly(!!d.statementsOnly)
      // ?only=id,id from Rents due ("Chase selected"): tick just those
      const only = new URLSearchParams(window.location.search).get('only')?.split(',').filter(Boolean)
      setTick(Object.fromEntries(d.rows.map((x: Row) => [x.tenancyId, !only?.length || only.includes(x.tenancyId)])))
      setAmount(Object.fromEntries(d.rows.map((x: Row) => [x.tenancyId, x.owed.toFixed(2)])))
    })
  }, [])

  const chosen = (rows ?? []).filter(r => tick[r.tenancyId])
  const first = chosen[0]
  useEffect(() => {
    if (!first) { setPreview(null); return }
    adminFetch('/api/admin/rent-chase', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId, tenancyId: first.tenancyId, owed: amount[first.tenancyId] }) })
      .then(r => r.ok ? r.json() : null).then(setPreview)
  }, [messageId, first?.tenancyId, amount[first?.tenancyId ?? '']]) // eslint-disable-line react-hooks/exhaustive-deps

  const total = chosen.reduce((t, r) => t + (Number(amount[r.tenancyId]) || 0), 0)
  async function send() {
    if (messageId === 'rent-late-2' && !byDate.trim()) { alert('Enter the date to pay by'); return }
    if (!window.confirm(`Send the ${messageId === 'rent-late' ? 'friendly reminder' : 'second reminder'} to ${chosen.length} tenanc${chosen.length === 1 ? 'y' : 'ies'} (${gbp(total)} in all) by ${channels.map(c => c === 'sms' ? 'text' : c === 'push' ? 'app' : 'email').join(', ')}?`)) return
    setSending(true); setDone(null)
    const r = await adminFetch('/api/admin/rent-chase', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId, channels, date: byDate, items: chosen.map(x => ({ tenancyId: x.tenancyId, owed: Number(amount[x.tenancyId]) })) }) })
    const d = await r.json().catch(() => ({}))
    setSending(false)
    if (!r.ok) { setError(d.error ?? 'Not sent'); return }
    setDone(d.results)
  }

  const label = (id: string) => (rows ?? []).find(r => r.tenancyId === id)
  return (
    <div className="min-h-screen fin">
      <AppBar left={<BackButton href="/admin/finance" />} title="Rent owed" />
      <PageHero look="olive" title="Rent owed" subtitle="Rent chase: remind everyone who owes, in one send" tabs={rentOwedTabs('chase')} />
      <div className="mx-auto max-w-6xl px-lg py-xl space-y-lg">
        <div>
          <p className="text-sm text-neutral-600">Everyone whose rent account shows rent unpaid, from the payments matched so far. Import and match the bank statement first, then check the amounts, untick anyone you don’t want to chase, and send.</p>
        </div>
        {error && <p className="rounded-xl bg-red-50 px-md py-sm text-sm text-red-700">{error}</p>}
        {rows === null && !error && <p className="text-sm text-neutral-500">Checking every rent account…</p>}
        {rows && rows.length === 0 && (statementsOnly
          ? <p className="rounded-xl bg-neutral-50 px-md py-sm text-sm text-neutral-700"><b>Statements only.</b> Rent is collected in your other system, so reminders aren’t sent from CROS.</p>
          : <p className="rounded-xl bg-green-50 px-md py-sm text-sm text-green-800">All {checked} current rent accounts are up to date. Nobody to chase.</p>)}

        {rows && rows.length > 0 && (<>
          <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr><th className="px-md py-sm"><input type="checkbox" checked={chosen.length === rows.length} onChange={e => setTick(Object.fromEntries(rows.map(r => [r.tenancyId, e.target.checked])))} /></th>
                  <th className="px-md py-sm">Tenant</th><th className="px-md py-sm">Room</th><th className="px-md py-sm">Unpaid for</th><th className="px-md py-sm text-right">Rent</th><th className="px-md py-sm text-right">Amount to ask for</th><th className="px-md py-sm">Reaches</th></tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map(r => (
                  <tr key={r.tenancyId} className={tick[r.tenancyId] ? '' : 'opacity-50'}>
                    <td className="px-md py-sm"><input type="checkbox" checked={!!tick[r.tenancyId]} onChange={e => setTick(t => ({ ...t, [r.tenancyId]: e.target.checked }))} /></td>
                    <td className="px-md py-sm font-semibold"><a href={`/admin/lettings/${r.tenancyId}?tab=money`} className="hover:underline">{r.tenants}</a></td>
                    <td className="px-md py-sm text-neutral-600">{r.room}, {r.house}</td>
                    <td className="px-md py-sm text-neutral-600">{r.owedMonths.join(', ')}</td>
                    <td className="px-md py-sm text-right tabular-nums">{r.rent != null ? gbp(r.rent) : '—'}</td>
                    <td className="px-md py-sm text-right"><span className="text-neutral-400">£</span><input value={amount[r.tenancyId] ?? ''} onChange={e => setAmount(a => ({ ...a, [r.tenancyId]: e.target.value }))} className="w-24 rounded border border-neutral-200 px-xs py-[2px] text-right tabular-nums" /></td>
                    <td className="px-md py-sm text-xs text-neutral-500">{[r.email && 'email', r.phone && 'text'].filter(Boolean).join(', ') || <span className="text-amber-700">no email or mobile</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-lg rounded-2xl border border-neutral-200 bg-white p-lg md:grid-cols-2">
            <div className="space-y-md">
              <div>
                <p className="mb-xs text-xs font-semibold uppercase tracking-wide text-neutral-500">Which reminder</p>
                {MESSAGES.map(([id, name]) => (
                  <label key={id} className="mb-xs flex items-center gap-sm text-sm"><input type="radio" checked={messageId === id} onChange={() => setMessageId(id)} />{name}</label>
                ))}
                {messageId === 'rent-late-2' && <input value={byDate} onChange={e => setByDate(e.target.value)} placeholder="Pay by, e.g. 9 November 2026" className="mt-xs w-full rounded-lg border border-neutral-200 px-md py-sm text-sm" />}
              </div>
              <div>
                <p className="mb-xs text-xs font-semibold uppercase tracking-wide text-neutral-500">Send by</p>
                {(['email', 'sms', 'push'] as Channel[]).map(c => (
                  <label key={c} className="mr-lg inline-flex items-center gap-xs text-sm"><input type="checkbox" checked={channels.includes(c)} onChange={e => setChannels(x => e.target.checked ? [...x, c] : x.filter(y => y !== c))} />{c === 'email' ? 'Email' : c === 'sms' ? 'Text' : 'App notification'}</label>
                ))}
              </div>
              <button type="button" onClick={send} disabled={sending || !chosen.length || !channels.length}
                className="w-full rounded-xl bg-neutral-900 py-md text-base font-bold text-white disabled:opacity-40">
                {sending ? 'Sending…' : `Send to ${chosen.length} tenanc${chosen.length === 1 ? 'y' : 'ies'} · ${gbp(total)}`}
              </button>
            </div>
            <div>
              <p className="mb-xs text-xs font-semibold uppercase tracking-wide text-neutral-500">What {first ? first.tenants : 'they'} will get{chosen.length > 1 ? ' (each tenant gets their own amount)' : ''}</p>
              {preview ? (<div className="rounded-xl bg-neutral-50 p-md text-sm">
                <p className="font-semibold">{preview.subject}</p>
                <p className="mt-sm whitespace-pre-line text-neutral-700">{preview.email.replace(/\*\*/g, '')}</p>
                <p className="mt-md border-t border-neutral-200 pt-sm text-xs text-neutral-500">Text: {preview.sms}</p>
              </div>) : <p className="text-sm text-neutral-400">Tick a tenant to see the message.</p>}
            </div>
          </div>
        </>)}

        {done && (
          <div className="rounded-2xl border border-green-200 bg-green-50 p-lg text-sm">
            <p className="font-semibold text-green-900">Sent.</p>
            <ul className="mt-sm space-y-xs text-green-900">
              {done.map((d: any) => (
                <li key={d.tenancyId}>{label(d.tenancyId)?.tenants ?? d.tenancyId}: {d.error ?? (d.sent as any[]).map(x => [x.email && `email ${x.email}`, x.sms && `text ${x.sms}`, x.push && `app ${x.push}`].filter(Boolean).join(', ')).join(' · ')}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
