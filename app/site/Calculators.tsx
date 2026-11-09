'use client'
// The affordability calculators from the old site, working: tenant (income 30× the monthly rent, or what an income can
// afford) and guarantor (36× the monthly rent).
import { useState } from 'react'
const gbp = (n: number) => '£' + Math.round(n).toLocaleString('en-GB')

export function TenantCalc({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<'rent' | 'income'>('rent')
  const [rent, setRent] = useState(1500)
  const [income, setIncome] = useState(45000)
  return (
    <div className="calc">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p className="eyebrow" style={{ color: 'var(--gold)' }}>Renting with us</p>
        <h2 className="h2">Can I afford it?</h2>
        {!compact && <div role="radiogroup" aria-label="Work it out from" style={{ display: 'flex', gap: 8 }}>
          {(['rent', 'income'] as const).map(m => <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={mode === m ? 'gold sm' : 'ghost sm'}>{m === 'rent' ? 'From the rent' : 'From my income'}</button>)}
        </div>}
        {mode === 'rent'
          ? <label style={{ display: 'flex', flexDirection: 'column', gap: 10, color: '#DCE5DA' }}>Monthly rent: {gbp(rent)}<input type="range" min={400} max={6000} step={50} value={rent} onChange={e => setRent(Number(e.target.value))} /></label>
          : <label style={{ display: 'flex', flexDirection: 'column', gap: 10, color: '#DCE5DA' }}>Annual income: {gbp(income)}<input type="range" min={12000} max={200000} step={1000} value={income} onChange={e => setIncome(Number(e.target.value))} /></label>}
        <p style={{ fontSize: 14, color: '#B9C7BC' }}>We look for an income of 30 times the monthly rent. A guarantor can help if you’re under.</p>
      </div>
      <div className="out" aria-live="polite">
        <span style={{ fontWeight: 600 }}>{mode === 'rent' ? 'You’ll need around' : 'You can afford rent of'}</span>
        <span className="big">{mode === 'rent' ? gbp(rent * 30) : gbp(income / 30)}</span>
        <span style={{ fontWeight: 600 }}>{mode === 'rent' ? 'a year' : 'a month'}</span>
      </div>
    </div>
  )
}

export function GuarantorCalc() {
  const [rent, setRent] = useState('')
  const [income, setIncome] = useState('')
  const r = Number(rent.replace(/[£,\s]/g, '')) || 0
  const t = Number(income.replace(/[£,\s]/g, '')) || 0
  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <form className="f" onSubmit={e => e.preventDefault()}>
        <label>Monthly rent<input inputMode="decimal" value={rent} onChange={e => setRent(e.target.value)} placeholder="£" /></label>
        <label>Tenant’s annual income (optional)<input inputMode="decimal" value={income} onChange={e => setIncome(e.target.value)} placeholder="£" /></label>
      </form>
      {r > 0 && (
        <dl aria-live="polite" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 24px', margin: '8px 0 0', fontSize: 17 }}>
          <dt>Annual rent</dt><dd style={{ margin: 0, fontWeight: 700 }}>{gbp(r * 12)}</dd>
          <dt>Minimum guarantor income</dt><dd style={{ margin: 0, fontWeight: 700 }}>{gbp(r * 36)}</dd>
          {t > 0 && <><dt>Tenant on their own</dt><dd style={{ margin: 0, fontWeight: 700 }}>{t >= r * 30 ? 'Should pass without a guarantor' : `Needs a guarantor (we look for ${gbp(r * 30)})`}</dd></>}
        </dl>
      )}
      <p style={{ fontSize: 14, color: 'var(--muted)' }}>Estimates based on standard UK letting ratios: a guarantor earning at least 36 times the monthly rent. Individual referencing criteria may vary.</p>
    </div>
  )
}
