'use client'

// The new tenant's move-in pack: what to pay, every document to read, then "I've read everything".
// Look: the shared public frame (components/public/PublicShell, design "C").
import { use, useEffect, useState } from 'react'
import PublicShell from '@/components/public/PublicShell'

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

const wrap = 'mx-auto max-w-6xl px-6 md:px-14'
function Shell({ children }: { children: React.ReactNode }) {
  return <PublicShell label="Move-in pack">{children}</PublicShell>
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

  if (error) return <Shell><section className={`${wrap} py-20 text-[17px]`}>{error}</section></Shell>
  if (!pack) return <Shell><p className={`${wrap} py-24 text-[16px] pub-muted`}>Loading your move-in pack…</p></Shell>

  const s = pack.summary
  // first full rent payment = the day after the first payment's period ends
  const nextRentDay = s.firstTo ? (() => { const x = new Date(s.firstTo + 'T12:00:00'); x.setDate(x.getDate() + 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` })() : null
  const available = pack.documents.filter(d => d.available)
  const openedCount = available.filter(d => opened.has(d.key)).length
  const roman = ['i', 'ii', 'iii', 'iv', 'v', 'vi']

  return (
    <Shell>
      {/* Greeting */}
      <section className={`${wrap} grid items-end gap-10 pt-10 md:grid-cols-2 md:gap-16 md:pt-14`}>
        <div className="flex flex-col gap-5">
          <p className="pub-eyebrow pub-enter m-0">Your new tenancy</p>
          <h1 className="pub-serif pub-display pub-enter m-0">
            <span className="pub-drift-l block">Welcome,</span>
            <span className="pub-drift-r block italic">{pack.firstName}</span>
          </h1>
          {/* the address can arrive as "Room 3, 75 X Road, E15, 75 X Road, E15": show each part once */}
          <p className="pub-enter-2 m-0 text-[16px]" style={{ color: '#4A4741' }}>{Array.from(new Set(pack.address.split(',').map(x => x.trim()).filter(Boolean))).join(', ')}</p>
        </div>
        <div className="pub-arch pub-arch-open mx-auto aspect-[3/4] w-full max-w-[300px] md:max-w-[420px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="pub-zoom" src="/illustrations/tenant-home.webp" alt="Illustration: relaxing at home" style={{ objectPosition: '9% 60%' }} />
        </div>
      </section>

      {pack.message && (
        <section className={`${wrap} pt-14`}>
          <div className="pub-rise flex max-w-3xl flex-col gap-4 text-[17px] leading-relaxed" style={{ borderLeft: '1px solid #111', paddingLeft: 18 }}>
            {pack.message.split(/\n{2,}/).map((p, i) => <p key={i} className="m-0 whitespace-pre-line">{p}</p>)}
          </div>
        </section>
      )}

      {/* ── Money ─────────────────────────────────────────── */}
      <section className={`${wrap} pt-16 md:pt-20`}>
        <div className="pub-rise grid gap-8 p-6 md:grid-cols-2 md:gap-14 md:p-10" style={{ background: '#111', color: '#F3F0EA' }}>
          <div className="flex flex-col gap-3">
            <p className="pub-eyebrow m-0" style={{ color: '#C9C4BA' }}>Before you move in</p>
            <p className="pub-serif pub-figure m-0">{gbp(s.amountDue)}</p>
            <p className="m-0 text-[15px]" style={{ color: '#C9C4BA' }}>{s.payBy ? `to pay by ${day(s.payBy)} — in cleared funds, 24 hours before you move in` : 'to pay before you move in'}</p>
            <dl className="m-0 mt-2 flex flex-col text-[15px]">
              {s.firstRent != null && <div className="flex justify-between gap-4 py-2" style={{ borderTop: '1px solid #3A3A3A' }}><dt style={{ color: '#C9C4BA' }}>{s.firstFull ? 'First month’s rent' : `Rent ${short(s.firstFrom)} – ${short(s.firstTo)}`}</dt><dd className="m-0 whitespace-nowrap" style={{ fontVariantNumeric: 'tabular-nums' }}>{gbp(s.firstRent)}</dd></div>}
              {s.deposit > 0 && <div className="flex justify-between gap-4 py-2" style={{ borderTop: '1px solid #3A3A3A' }}><dt style={{ color: '#C9C4BA' }}>Deposit (protected with the DPS)</dt><dd className="m-0 whitespace-nowrap" style={{ fontVariantNumeric: 'tabular-nums' }}>{gbp(s.deposit)}</dd></div>}
              {s.holdingDeposit > 0 && <div className="flex justify-between gap-4 py-2" style={{ borderTop: '1px solid #3A3A3A' }}><dt style={{ color: '#C9C4BA' }}>Holding deposit already paid</dt><dd className="m-0 whitespace-nowrap" style={{ fontVariantNumeric: 'tabular-nums' }}>− {gbp(s.holdingDeposit)}</dd></div>}
            </dl>
          </div>
          <div className="flex flex-col gap-3">
            <p className="pub-eyebrow m-0" style={{ color: '#C9C4BA' }}>Pay by bank transfer · tap to copy</p>
            {[['Account name', s.bank.name], ['Sort code', s.bank.sortCode], ['Account number', s.bank.accountNo], ['Reference', s.paymentRef]].map(([k, v]) => (
              <button key={k} type="button" onClick={() => copy(v, k)} className="flex min-h-[52px] items-center justify-between gap-3 text-left" style={{ borderBottom: '1px solid #3A3A3A', color: '#F3F0EA' }}>
                <span className="text-[13px]" style={{ color: '#C9C4BA' }}>{k}</span>
                <span className="break-all text-[17px] font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>{copied === k ? 'Copied ✓' : v}</span>
              </button>
            ))}
            <p className="m-0 mt-2 text-[14px]" style={{ color: '#C9C4BA' }}>After that, rent is {gbp(s.rentMonthly)} a month, due on the {ordinal(s.rentDueDay)}{nextRentDay ? `, starting ${day(nextRentDay)}` : ''}.</p>
          </div>
        </div>
      </section>

      {/* ── Documents ─────────────────────────────────────── */}
      <section className={`${wrap} pt-16 md:pt-24`}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="pub-h2">Your documents</h2>
          <span className="pub-eyebrow">{openedCount} of {available.length} opened</span>
        </div>
        <div className="mt-6 grid gap-x-14 md:grid-cols-2">
          {GROUPS.map((g, gi) => {
            const list = pack.documents.filter(d => d.group === g)
            if (!list.length) return null
            return (
              <div key={g} className="pub-rise pb-8">
                <h3 className="pub-h3 m-0 mb-2"><i className="mr-2">{roman[gi]}.</i>{g}</h3>
                <ul className="m-0 list-none p-0" style={{ borderTop: '1px solid #111' }}>
                  {list.map(d => (
                    <li key={d.key} className="flex items-center justify-between gap-3 py-3" style={{ borderBottom: '1px solid #E4E0D8' }}>
                      <span className="flex items-center gap-3 text-[16px]">
                        <span aria-hidden className={`pub-dot ${opened.has(d.key) ? 'on' : ''}`} />
                        {d.label}
                      </span>
                      {d.available ? (
                        <span className="flex shrink-0 gap-2">
                          <a href={`/api/pack/${token}/file/${d.key}`} target="_blank" rel="noreferrer" onClick={() => markOpened(d.key)} className="pub-btn-ghost" style={{ minHeight: 40, background: '#111', color: '#fff' }}>View</a>
                          <a href={`/api/pack/${token}/file/${d.key}?download=1`} onClick={() => markOpened(d.key)} className="pub-btn-ghost hidden sm:inline-flex" style={{ minHeight: 40 }}>Download</a>
                        </span>
                      ) : <span className="pub-eyebrow shrink-0" style={{ color: '#A86A12' }}>To follow</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Confirm ───────────────────────────────────────── */}
      <section className={`${wrap} pt-10`}>
        {pack.confirmedAt ? (
          <div className="pub-rise flex flex-col gap-3 p-6 md:p-10" style={{ background: '#111', color: '#F3F0EA' }}>
            <p className="pub-serif m-0 text-[40px] leading-tight md:text-[56px]">Thank you — you’re all <span className="italic">set.</span></p>
            <p className="m-0 text-[16px]" style={{ color: '#D8D3C8' }}>We’ve been told you’ve read your documents. We’ll send your agreement to sign online shortly.</p>
          </div>
        ) : (
          <form onSubmit={confirm} className="pub-rise flex max-w-3xl flex-col gap-6">
            <h2 className="pub-h2">Ready to <span className="italic">sign?</span></h2>
            <label className="pub-label">Any questions before you sign? (optional)
              <textarea className="pub-input" value={questions} onChange={e => setQuestions(e.target.value)} rows={3} placeholder="e.g. parking, furniture in the room, move-in time" />
            </label>
            <div style={{ borderTop: '1px solid #111' }}>
              <button type="button" className="pub-choice" onClick={() => setTicked(!ticked)} aria-pressed={ticked}>
                <span className={`pub-dot sq ${ticked ? 'on' : ''}`} />
                <span>I’ve read the documents above, including the tenancy agreement, and I’m ready to sign.</span>
              </button>
            </div>
            <label className="pub-label">Your full name
              <input className="pub-input" value={name} onChange={e => setName(e.target.value)} autoComplete="name" />
            </label>
            {formError && <p className="pub-error">{formError}</p>}
            <button disabled={saving || !ticked || name.trim().length < 2} className="pub-btn self-start">
              {saving ? 'Sending…' : 'I’ve read everything and I’m ready to sign'}
            </button>
          </form>
        )}
      </section>

      <section className={`${wrap} pb-16 pt-12`}>
        <p className="m-0 text-[15px]">Questions? Email <a className="pub-link" href={`mailto:${pack.contact.email}`}>{pack.contact.email}</a>{pack.contact.phone ? <> or call {pack.contact.phone}</> : null}.</p>
      </section>
    </Shell>
  )
}
