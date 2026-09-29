'use client'

// The new tenant's move-in pack: what to pay, every document to read, then "I've read everything".
import { use, useEffect, useState } from 'react'
import Logo from '@/components/Logo'

interface PackView {
  firstName: string
  address: string
  summary: {
    startDate: string | null; rentMonthly: number; rentDueDay: number; firstRent: number | null; firstFrom: string | null; firstTo: string | null
    firstFull: boolean | null; deposit: number; holdingDeposit: number; amountDue: number; payBy: string | null; paymentRef: string
    bank: { name: string; bank: string; sortCode: string; accountNo: string; iban: string; swift: string }
  }
  message: string | null
  documents: { key: string; label: string; group: string; available: boolean }[]
  confirmedAt: string | null
  contact: { name: string; email: string; phone: string }
}

const GROUPS = ['Your tenancy', 'Safety certificates', 'Your deposit', 'Your rights', 'Living in the house']
const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const day = (iso: string | null) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''
const short = (iso: string | null) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) : ''
const ordinal = (n: number) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th')

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-100">
      <nav className="bg-neutral-900 text-white" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto flex max-w-2xl justify-center px-4 py-md" style={{ minHeight: 52 }}>
          <Logo variant="emblem" height={30} invert priority />
        </div>
      </nav>
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-4">{children}</div>
      <p className="py-8 text-center text-xs text-neutral-400">Capital Rooms Ltd · Member of The Property Ombudsman · ClientMoney Protect</p>
    </div>
  )
}

export default function MoveInPackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [pack, setPack] = useState<PackView | null>(null)
  const [error, setError] = useState('')
  const [opened, setOpened] = useState<Set<string>>(new Set())
  const [ticked, setTicked] = useState(false)
  const [name, setName] = useState('')
  const [questions, setQuestions] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [copied, setCopied] = useState('')

  useEffect(() => {
    fetch(`/api/pack/${encodeURIComponent(token)}`)
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'This link isn’t valid.'); return d })
      .then(setPack).catch(e => setError(e.message))
    try { const saved = JSON.parse(localStorage.getItem(`pack-opened-${token}`) || '[]'); setOpened(new Set(saved)) } catch { /* private mode */ }
  }, [token])

  function markOpened(key: string) {
    setOpened(prev => {
      const next = new Set(prev); next.add(key)
      try { localStorage.setItem(`pack-opened-${token}`, JSON.stringify([...next])) } catch { /* ignore */ }
      return next
    })
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setFormError('')
    try {
      const r = await fetch(`/api/pack/${encodeURIComponent(token)}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, questions }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Could not save your confirmation.')
      setPack(p => p && { ...p, confirmedAt: new Date().toISOString() })
    } catch (err) { setFormError(err instanceof Error ? err.message : 'Could not save your confirmation.') }
    finally { setSaving(false) }
  }

  function copy(text: string, key: string) {
    navigator.clipboard?.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(''), 1500) }).catch(() => {})
  }

  if (error) return <Shell><section className="rounded-2xl bg-white p-5 text-[15px]">{error}</section></Shell>
  if (!pack) return <Shell><div className="h-48 rounded-2xl bg-white animate-pulse" /></Shell>

  const s = pack.summary
  // first full rent payment = the day after the first payment's period ends
  const nextRentDay = s.firstTo ? (() => { const x = new Date(s.firstTo + 'T12:00:00'); x.setDate(x.getDate() + 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` })() : null
  const available = pack.documents.filter(d => d.available)
  const openedCount = available.filter(d => opened.has(d.key)).length

  return (
    <Shell>
      <header className="px-1">
        <p className="text-sm text-neutral-500">Your new tenancy</p>
        <h1 className="mt-1 text-[28px] font-bold leading-tight text-neutral-950 text-balance">Welcome, {pack.firstName}</h1>
        <p className="mt-1 text-[15px] text-neutral-600">{pack.address}</p>
      </header>

      {pack.message && (
        <section className="rounded-2xl bg-white p-5 text-[15px] leading-relaxed text-neutral-800 space-y-3">
          {pack.message.split(/\n{2,}/).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}
        </section>
      )}

      {/* ── Money ─────────────────────────────────────────── */}
      <section className="rounded-2xl bg-neutral-950 p-5 text-white">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/60">Before you move in</p>
        <p className="mt-1 text-[32px] font-bold tabular-nums leading-none">{gbp(s.amountDue)}</p>
        <p className="mt-1 text-sm text-white/70">{s.payBy ? `to pay by ${day(s.payBy)} — in cleared funds, 24 hours before you move in` : 'to pay before you move in'}</p>
        <dl className="mt-4 space-y-1.5 text-sm">
          {s.firstRent != null && <div className="flex justify-between gap-4"><dt className="text-white/70">{s.firstFull ? 'First month’s rent' : `Rent ${short(s.firstFrom)} – ${short(s.firstTo)}`}</dt><dd className="tabular-nums">{gbp(s.firstRent)}</dd></div>}
          {s.deposit > 0 && <div className="flex justify-between gap-4"><dt className="text-white/70">Deposit (protected with the DPS)</dt><dd className="tabular-nums">{gbp(s.deposit)}</dd></div>}
          {s.holdingDeposit > 0 && <div className="flex justify-between gap-4"><dt className="text-white/70">Holding deposit already paid</dt><dd className="tabular-nums">− {gbp(s.holdingDeposit)}</dd></div>}
        </dl>
        <div className="mt-4 rounded-xl bg-white/10 p-3 text-sm space-y-1">
          {[['Account name', s.bank.name], ['Sort code', s.bank.sortCode], ['Account number', s.bank.accountNo], ['Reference', s.paymentRef]].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3">
              <span className="text-white/60">{k}</span>
              <button type="button" onClick={() => copy(v, k)} className="font-semibold tabular-nums">{copied === k ? 'Copied' : v}</button>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-white/70">After that, rent is {gbp(s.rentMonthly)} a month, due on the {ordinal(s.rentDueDay)}{nextRentDay ? `, starting ${day(nextRentDay)}` : ''}.</p>
      </section>

      {/* ── Documents ─────────────────────────────────────── */}
      <section className="rounded-2xl bg-white p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-500">Your documents</h2>
          <span className="text-xs text-neutral-500">{openedCount} of {available.length} opened</span>
        </div>
        <div className="mt-3 space-y-5">
          {GROUPS.map(g => {
            const list = pack.documents.filter(d => d.group === g)
            if (!list.length) return null
            return (
              <div key={g}>
                <h3 className="text-sm font-bold text-neutral-900">{g}</h3>
                <ul className="mt-2 divide-y divide-neutral-100 rounded-xl border border-neutral-200">
                  {list.map(d => (
                    <li key={d.key} className="flex items-center justify-between gap-3 px-3.5 py-3">
                      <span className="flex items-center gap-2 text-[15px] text-neutral-900">
                        <span aria-hidden className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${opened.has(d.key) ? 'bg-emerald-600 text-white' : 'border border-neutral-300'}`}>{opened.has(d.key) ? '✓' : ''}</span>
                        {d.label}
                      </span>
                      {d.available ? (
                        <span className="flex shrink-0 gap-2">
                          <a href={`/api/pack/${token}/file/${d.key}`} target="_blank" rel="noreferrer" onClick={() => markOpened(d.key)} className="rounded-lg bg-neutral-950 px-3 py-1.5 text-xs font-bold text-white">View</a>
                          <a href={`/api/pack/${token}/file/${d.key}?download=1`} onClick={() => markOpened(d.key)} className="hidden rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-bold text-neutral-800 sm:inline-block">Download</a>
                        </span>
                      ) : <span className="shrink-0 text-xs font-semibold text-amber-700">To follow</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Confirm ───────────────────────────────────────── */}
      {pack.confirmedAt ? (
        <section className="rounded-2xl bg-emerald-700 p-5 text-white">
          <p className="text-lg font-bold">Thank you — you’re all set</p>
          <p className="mt-1 text-sm text-white/85">We’ve been told you’ve read your documents. We’ll send your agreement to sign online shortly.</p>
        </section>
      ) : (
        <form onSubmit={confirm} className="rounded-2xl bg-white p-5 space-y-4">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-500">Ready to sign?</h2>
          <label className="block">
            <span className="text-sm font-semibold text-neutral-800">Any questions before you sign? <span className="font-normal text-neutral-500">(optional)</span></span>
            <textarea value={questions} onChange={e => setQuestions(e.target.value)} rows={3} placeholder="e.g. parking, furniture in the room, move-in time"
              className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-[16px] text-neutral-950 outline-none focus:ring-2 focus:ring-neutral-900" />
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={ticked} onChange={e => setTicked(e.target.checked)} className="mt-1 h-5 w-5" />
            <span className="text-sm text-neutral-800">I’ve read the documents above, including the tenancy agreement, and I’m ready to sign.</span>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-neutral-800">Your full name</span>
            <input value={name} onChange={e => setName(e.target.value)} autoComplete="name"
              className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-3 text-[16px] text-neutral-950 outline-none focus:ring-2 focus:ring-neutral-900" />
          </label>
          {formError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
          <button disabled={saving || !ticked || name.trim().length < 2} className="w-full rounded-xl bg-neutral-950 py-3.5 text-[15px] font-bold text-white disabled:opacity-40">
            {saving ? 'Sending…' : 'I’ve read everything and I’m ready to sign'}
          </button>
        </form>
      )}

      <p className="px-1 text-sm text-neutral-500">Questions? Email <a className="underline" href={`mailto:${pack.contact.email}`}>{pack.contact.email}</a>{pack.contact.phone ? <> or call {pack.contact.phone}</> : null}.</p>
    </Shell>
  )
}
