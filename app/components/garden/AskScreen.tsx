'use client'
// The Ask screen for tenants, cleaners and contractors (14 Nov 2026, "Garden Ask" rendering "Tenant — Ask"): a green
// header with suggested questions, the conversation, and the box at the bottom. Answers come from /api/ask, using only
// that property's own details. For tenants, "Bins weren't collected?" opens a short check (/api/tenant/bins).
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { adminFetch } from '@/lib/adminFetch'
import { Spark, display } from './kit'

type Msg = { who: 'me' | 'cr'; text: string; source?: string; actions?: { label: string; href: string }[] }
const CHIPS: Record<'tenant' | 'cleaner' | 'contractor', string[]> = {
  tenant: ['When are the bins collected?', 'What’s the WiFi password?', 'When is my rent due?', 'Who do I call at night?'],
  cleaner: ['What’s on today?', 'Any notes for my next house?', 'When are the bins collected there?', 'Where are the cleaning things kept?'],
  contractor: ['What’s my next job?', 'Which room is it?', 'Is there parking?', 'When are the bins collected there?'],
}
const TITLE = { tenant: 'Ask about the house', cleaner: 'Ask about your houses', contractor: 'Ask about your jobs' }

/** **bold** → <strong>, safely */
function Rich({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>)}</>
}

export default function AskScreen({ role, houseName }: { role: 'tenant' | 'cleaner' | 'contractor'; houseName?: string | null }) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [bins, setBins] = useState<null | 'ask' | 'yes' | 'no'>(null)
  const [binInfo, setBinInfo] = useState<{ day: string | null; next: { date: string; names: string[] } | null; councilName: string | null; councilWebsite: string | null } | null>(null)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }) }, [msgs, busy, bins])
  useEffect(() => {
    if (role !== 'tenant') return
    if (new URLSearchParams(window.location.search).get('bins')) setBins('ask')
    adminFetch('/api/tenant/bins').then(r => r.ok ? r.json() : null).then(d => d && setBinInfo(d)).catch(() => {})
  }, [role])

  async function ask(q: string) {
    const question = q.trim(); if (!question || busy) return
    const history = msgs.slice(-6).map(m => ({ role: m.who === 'me' ? 'user' as const : 'assistant' as const, content: m.text }))
    setMsgs(v => [...v, { who: 'me', text: question }]); setText(''); setBusy(true)
    const r = await adminFetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, history }) }).catch(() => null)
    const j = r ? await r.json().catch(() => ({})) : {}
    setBusy(false)
    setMsgs(v => [...v, r?.ok ? { who: 'cr', text: j.answer, source: j.source, actions: j.actions } : { who: 'cr', text: j.error || 'That didn’t work — try again in a moment.' }])
  }
  async function reportBins(leftOut: boolean) {
    setBins(leftOut ? 'yes' : 'no')
    await adminFetch('/api/tenant/bins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'missed', leftOut }) }).catch(() => null)
  }
  const nextBin = binInfo?.next ? `${new Date(binInfo.next.date + 'T12:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}${binInfo.next.names.length ? ` — ${binInfo.next.names.join(', ')}` : ''}` : binInfo?.day ? `every ${binInfo.day}` : null

  return (
    <div className="flex min-h-screen flex-col bg-[#EEF2EC]">
      <div className="rounded-b-[30px] px-[18px] pb-[22px] text-[#F1F5EE] lg:mx-lg lg:mt-lg lg:rounded-[30px]" style={{ background: '#17332B', paddingTop: 'max(calc(env(safe-area-inset-top) + 18px), 28px)' }}>
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[#17332B]" style={{ background: 'var(--cr-gold)' }}><Spark size={22} /></span>
          <div className="min-w-0">
            <h1 className="text-[26px] font-extrabold leading-none tracking-[-0.02em] text-[#F1F5EE]" style={display}>{TITLE[role]}</h1>
            <p className="mt-1 truncate text-[13px] text-[#B9CBBF]">{role === 'tenant' ? `Answers from ${houseName ?? 'your property'}’s own details` : 'Answers from your houses’ own details'}</p>
          </div>
        </div>
        <div className="mt-3.5 flex flex-wrap gap-1.5">
          {CHIPS[role].map(q => <button key={q} type="button" disabled={busy} onClick={() => ask(q)} className="rounded-full border border-white/20 bg-white/[.08] px-3 py-[7px] text-[13px] font-semibold text-[#F1F5EE] active:bg-white/20">{q}</button>)}
          {role === 'tenant' && <button type="button" onClick={() => setBins('ask')} className="rounded-full border border-white/20 bg-white/[.08] px-3 py-[7px] text-[13px] font-semibold text-[#F1F5EE]">Bins weren’t collected?</button>}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3 px-4 pt-[18px]">
        {!msgs.length && !bins && <p className="px-1 text-sm text-[#4E6158]">Ask anything — the WiFi, bins, heating, when someone’s coming. If it’s something broken, Ask points you to the right place.</p>}

        {bins && (
          <div className="max-w-[92%] self-start rounded-[18px] rounded-bl-md bg-white p-3.5 text-[14.5px] leading-snug shadow-[0_2px_0_#DCE5DD]">
            {bins === 'ask' && <>
              <p>Sorry about that. <strong>Did you leave them out on the kerb</strong> by 7am on collection day?</p>
              <div className="mt-2.5 flex gap-2">
                <button type="button" onClick={() => reportBins(true)} className="h-10 flex-1 rounded-xl font-bold text-[#17332B] shadow-[0_3px_0_var(--cr-honey-edge)]" style={{ background: 'var(--cr-gold)' }}>Yes, they were out</button>
                <button type="button" onClick={() => reportBins(false)} className="h-10 flex-1 rounded-xl border-[1.5px] border-[#DCE5DD] bg-white font-bold text-[#14261F]">No</button>
              </div>
            </>}
            {bins === 'yes' && <p>Thanks — we’ve told the office. <strong>We’ll check it isn’t the wrong day</strong> and update it here for everyone.{binInfo?.councilWebsite ? <> You can also check on <a href={binInfo.councilWebsite} target="_blank" rel="noreferrer" className="font-bold underline">{binInfo.councilName ?? 'the council'}’s website</a>.</> : ''}</p>}
            {bins === 'no' && <p>No problem — they need to be <strong>on the kerb by 7am</strong> on collection day.{nextBin ? <> The next one is <strong>{nextBin}</strong>.</> : ''}{binInfo?.councilWebsite ? <> The council’s own dates are on <a href={binInfo.councilWebsite} target="_blank" rel="noreferrer" className="font-bold underline">their website</a>.</> : ''}</p>}
          </div>
        )}

        {msgs.map((m, i) => m.who === 'me'
          ? <p key={i} className="max-w-[80%] self-end rounded-[18px] rounded-br-md px-3.5 py-2.5 text-[14.5px] leading-snug text-[#F1F5EE]" style={{ background: '#17332B' }}>{m.text}</p>
          : (
            <div key={i} className="max-w-[88%] self-start rounded-[18px] rounded-bl-md bg-white px-3.5 py-3 text-[14.5px] leading-[1.45] text-[#14261F] shadow-[0_2px_0_#DCE5DD]">
              <p className="whitespace-pre-line"><Rich text={m.text} /></p>
              {!!m.actions?.length && <div className="mt-2.5 flex flex-wrap gap-2">{m.actions.map((a, k) => (
                <Link key={a.href} href={a.href} className={k === 0 ? 'inline-flex h-10 flex-1 items-center justify-center rounded-xl px-3 text-[13.5px] font-bold text-[#17332B] shadow-[0_3px_0_var(--cr-honey-edge)]' : 'inline-flex h-10 flex-1 items-center justify-center rounded-xl border-[1.5px] border-[#DCE5DD] px-3 text-[13.5px] font-bold text-[#14261F]'} style={k === 0 ? { background: 'var(--cr-gold)' } : undefined}
                  onClick={e => { if (a.href.includes('bins=1')) { e.preventDefault(); setBins('ask') } }}>{a.label}</Link>
              ))}</div>}
              {m.source && <p className="mt-2 text-xs text-[#4E6158]">{m.source}</p>}
            </div>
          ))}
        {busy && <p className="flex items-center gap-2 px-1 text-sm text-[#4E6158]"><span className="h-2 w-2 animate-pulse rounded-full" style={{ background: 'var(--cr-gold)' }} /> Looking it up…</p>}
        <div ref={end} />
      </div>

      <form onSubmit={e => { e.preventDefault(); ask(text) }} className="sticky bottom-0 z-30 mx-auto w-full max-w-2xl bg-gradient-to-t from-[#EEF2EC] via-[#EEF2EC] to-transparent px-4 pb-[112px] pt-3 lg:pb-6">
        <div className="flex h-[52px] items-center gap-2 rounded-full border-[1.5px] border-[#DCE5DD] bg-white pl-4 pr-1.5">
          <input value={text} onChange={e => setText(e.target.value)} placeholder={role === 'tenant' ? 'Ask anything about the house…' : role === 'cleaner' ? 'Ask about a house or a clean…' : 'Ask about a job or a property…'}
            className="min-w-0 flex-1 bg-transparent text-[16px] text-[#14261F] outline-none placeholder:text-[#4E6158]" aria-label="Your question" enterKeyHint="send" />
          <button type="submit" disabled={busy || !text.trim()} aria-label="Ask" className="grid h-10 w-10 place-items-center rounded-full disabled:opacity-40" style={{ background: '#17332B', color: 'var(--cr-gold)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </button>
        </div>
      </form>
    </div>
  )
}
