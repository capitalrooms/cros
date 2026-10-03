'use client'

// Emergencies — what CROS is doing about each out-of-hours emergency, so the office can pick it up at any point:
// who was asked, who answered (when, call-out fee), who's coming, what they reported, and every step in order.
// Tabs: Live · Emergency contractors · Settings. Data: /api/admin/emergencies (lib/emergencies/engine).

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import { adminFetch } from '@/lib/adminFetch'
import { one, type PageSearchParams } from '@/lib/pageSearchParams'

type Tab = 'live' | 'list' | 'settings'
const STATUS: Record<string, [string, string]> = {
  collecting: ['Asking contractors', 'bg-blue-50 text-blue-800'],
  awaiting_office: ['Needs you', 'bg-red-50 text-red-700'],
  assigned: ['Contractor on the way', 'bg-green-50 text-green-800'],
  on_site: ['On site', 'bg-green-50 text-green-800'],
  needs_return: ['Coming back to finish', 'bg-amber-50 text-amber-800'],
  resolved: ['Resolved', 'bg-neutral-100 text-neutral-600'],
  morning: ['Contained — book in the morning', 'bg-amber-50 text-amber-800'],
  call_999: ['999 / gas line', 'bg-red-50 text-red-700'],
  office_handling: ['Office handling', 'bg-violet-50 text-violet-800'],
  cancelled: ['Cancelled', 'bg-neutral-100 text-neutral-500'],
}
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London' }).replace(/\s/g, '')
const when = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  const same = d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) === new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  return same ? time(iso) : `${time(iso)}, ${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' })}`
}
const ago = (iso: string | null) => { if (!iso) return 'never'; const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago` }
const gbp = (n: number | null | undefined) => n == null ? 'no fee given' : `£${Number(n).toLocaleString('en-GB', { maximumFractionDigits: 2 })}`
const card = 'rounded-2xl border border-neutral-200 bg-white'
const btn = 'rounded-lg border border-neutral-300 px-md py-xs text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-40'
const btnDark = 'rounded-lg bg-neutral-900 px-md py-xs text-sm font-bold text-white hover:bg-neutral-700 disabled:opacity-40'
const input = 'rounded-lg border border-neutral-300 bg-white px-sm py-xs text-sm text-neutral-900'

export default function EmergenciesPage({ searchParams }: { searchParams: PageSearchParams }) {
  const sp = use(searchParams)
  return <Emergencies initialId={one(sp.id) ?? null} initialTab={(one(sp.tab) as Tab) ?? 'live'} />
}

function Emergencies({ initialId, initialTab }: { initialId: string | null; initialTab: Tab }) {
  const [tab, setTab] = useState<Tab>(['live', 'list', 'settings'].includes(initialTab) ? initialTab : 'live')
  const [data, setData] = useState<any>(null)
  const [id, setId] = useState<string | null>(initialId)
  const [detail, setDetail] = useState<any>(null)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const r = await adminFetch('/api/admin/emergencies')
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(d.error ?? 'Could not load'); return }
    setData(d)
    setId(cur => cur ?? d.emergencies?.find((e: any) => !['resolved', 'cancelled'].includes(e.status))?.id ?? d.emergencies?.[0]?.id ?? null)
  }, [])
  const loadDetail = useCallback(async (eid: string) => {
    const r = await adminFetch(`/api/admin/emergencies?id=${eid}`)
    const d = await r.json().catch(() => ({}))
    if (r.ok) setDetail(d)
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { if (id) loadDetail(id) }, [id, loadDetail])
  // live: refresh every 20 seconds while something is open
  useEffect(() => {
    const t = setInterval(() => { load(); if (id) loadDetail(id) }, 20000)
    return () => clearInterval(t)
  }, [id, load, loadDetail])

  async function act(body: Record<string, unknown>) {
    const r = await adminFetch('/api/admin/emergencies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { alert(d.error ?? 'Could not do that'); return false }
    await load(); if (id) await loadDetail(id)
    return true
  }

  const ems: any[] = data?.emergencies ?? []
  const open = ems.filter(e => !['resolved', 'cancelled'].includes(e.status))
  const needsYou = ems.filter(e => e.status === 'awaiting_office' || e.status === 'call_999' || e.status === 'morning')
  const tickAge = data?.lastTick ? (Date.now() - new Date(data.lastTick).getTime()) / 60000 : null

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin" />} title="Emergencies" />
      <PageHero
        eyebrow="Management"
        title="Emergencies"
        subtitle="Out-of-hours emergencies are texted to your emergency contractors and the soonest is confirmed automatically. Open one to see where it stands or step in."
        stats={[
          { label: 'Open now', value: open.length, tone: open.length ? 'warn' : undefined },
          { label: 'Need you', value: needsYou.length, tone: needsYou.length ? 'bad' : undefined },
          { label: 'Emergency contractors', value: (data?.list ?? []).filter((c: any) => c.active).length },
          { label: 'Last 30 days', value: ems.length },
        ]}
        actions={tickAge != null ? <span className={`text-xs ${tickAge > 5 ? 'text-[#F28B82]' : 'text-[#F6F3EC]/60'}`}>Automatic clock: {tickAge > 5 ? `not running (last ${ago(data.lastTick)})` : `running (${ago(data.lastTick)})`}</span> : undefined}
        tabs={([['live', 'Live'], ['list', 'Emergency contractors'], ['settings', 'Settings']] as [Tab, string][]).map(([k, l]) => ({ key: k, label: l, active: tab === k, onClick: () => setTab(k) }))}
      />
      <div className="mx-auto max-w-6xl px-lg py-xl">
        {err && <p className="mb-md rounded-xl border border-red-200 bg-red-50 px-lg py-sm text-sm text-red-800">{err}</p>}
        {data?.setupNeeded && <p className="mb-md rounded-xl border border-amber-200 bg-amber-50 px-lg py-sm text-sm text-amber-900">Run migration 203 in Supabase to switch emergencies on.</p>}
        {!data && !err && <p className="text-sm text-neutral-500">Loading…</p>}

        {data && tab === 'live' && (
          ems.length === 0 ? (
            <div className={`${card} p-xl text-center`}>
              <p className="text-sm text-neutral-600">No emergencies in the last 30 days.</p>
              {!(data.list ?? []).length && <button type="button" onClick={() => setTab('list')} className={`${btnDark} mt-md`}>Set up your emergency contractors</button>}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-lg lg:grid-cols-[320px_minmax(0,1fr)]">
              <ul className={`${card} h-fit divide-y divide-neutral-100`}>
                {ems.map(e => (
                  <li key={e.id}>
                    <button type="button" onClick={() => setId(e.id)} className={`block w-full px-md py-sm text-left hover:bg-neutral-50 ${id === e.id ? 'bg-neutral-100' : ''}`}>
                      <span className="flex items-baseline justify-between gap-sm">
                        <span className="truncate text-sm font-semibold text-neutral-900">{e.kind}</span>
                        <span className="shrink-0 text-xs text-neutral-500">{when(e.createdAt)}</span>
                      </span>
                      <span className="block truncate text-xs text-neutral-500">{e.where}</span>
                      <span className={`mt-0.5 inline-block rounded-full px-sm py-0.5 text-[11px] font-semibold ${STATUS[e.status]?.[1] ?? ''}`}>{STATUS[e.status]?.[0] ?? e.status}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {detail ? <Detail d={detail} act={act} /> : <p className="text-sm text-neutral-500">Choose an emergency.</p>}
            </div>
          )
        )}

        {data && tab === 'list' && <ContractorList data={data} act={act} />}
        {data && tab === 'settings' && <SettingsForm s={data.settings} act={act} />}
      </div>
    </div>
  )
}

// ── one emergency ────────────────────────────────────────────────────────────

function summary(em: any, rs: any[]) {
  const answered = rs.filter(r => r.answer), yes = rs.filter(r => r.answer === 'yes' && r.eta_at && r.outcome !== 'cant_attend')
  const chosen = rs.find(r => r.chosen)
  const soon = [...yes].sort((a, b) => a.eta_at.localeCompare(b.eta_at))[0]
  const asked = `${rs.length} asked, ${answered.length} answered${yes.length ? ` (${yes.length} can come)` : ''}`
  switch (em.status) {
    case 'collecting': return `${asked}. CROS confirms the soonest at ${when(em.window_ends_at)}${soon ? ` — right now that’s ${soon.name}, by ${when(soon.eta_at)} for ${gbp(soon.call_out_fee)}` : ''}.`
    case 'awaiting_office': return soon ? `${asked}. The soonest, ${soon.name}, can be there by ${when(soon.eta_at)} for ${gbp(soon.call_out_fee)} — that’s over your limit, so it’s waiting for you.` : `${asked}. No one can come yet — please call round. The tenant has the overnight steps.`
    case 'assigned': return chosen ? `${chosen.name} is coming — due by ${when(em.eta_at)}, call-out ${gbp(em.call_out_fee)}. CROS checks in with them at ${when(em.followup_due_at)}.` : 'A contractor is on the way.'
    case 'on_site': return `${chosen?.name ?? 'The contractor'} is on site${chosen?.on_site_at ? ` since ${when(chosen.on_site_at)}` : ''}.`
    case 'needs_return': return `${chosen?.name ?? 'The contractor'}: ${chosen?.outcome === 'made_safe' ? 'made safe' : 'not fixed'}${chosen?.part_needed ? `, needs ${chosen.part_needed}` : ''}${chosen?.fix_cost != null ? `, proper fix ${gbp(chosen.fix_cost)}` : ''}${chosen?.return_date ? `, back ${new Date(`${chosen.return_date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}` : ', no return date yet'}.`
    case 'resolved': return `Resolved${em.resolved_at ? ` ${when(em.resolved_at)}` : ''}${chosen ? ` by ${chosen.name}` : ''}.`
    case 'morning': return 'The tenant says it’s contained until morning. Book someone first thing — or send it out now if it needs it.'
    case 'call_999': return 'The tenant was told to call the emergency services / gas line. No contractor was sent — check in with them.'
    case 'office_handling': return `Being handled by ${em.office_by ?? 'the office'} — CROS won’t choose anyone.`
    case 'cancelled': return 'Cancelled.'
  }
  return ''
}

function Detail({ d, act }: { d: any; act: (b: Record<string, unknown>) => Promise<boolean> }) {
  const em = d.emergency, rs: any[] = d.responses ?? []
  const [note, setNote] = useState('')
  const closed = ['resolved', 'cancelled'].includes(em.status)
  const o = (op: string, extra: Record<string, unknown> = {}) => act({ action: 'office', id: em.id, op, ...extra })
  return (
    <div className="space-y-md">
      <section className={`${card} p-lg`}>
        <div className="flex flex-wrap items-start justify-between gap-sm">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">{em.kindLabel} · reported {when(em.created_at)}</p>
            <h2 className="text-lg font-bold text-neutral-900">{[em.room, em.property].filter(Boolean).join(', ')}</h2>
            {em.tenant && <p className="text-sm text-neutral-600">{em.tenant.name}{em.tenant.phone && <> · <a href={`tel:${em.tenant.phone}`} className="font-semibold text-blue-700">{em.tenant.phone}</a></>}</p>}
          </div>
          <span className={`rounded-full px-md py-xs text-xs font-bold ${STATUS[em.status]?.[1] ?? ''}`}>{STATUS[em.status]?.[0] ?? em.status}</span>
        </div>
        <p className="mt-md rounded-xl bg-neutral-50 px-md py-sm text-sm font-semibold text-neutral-900">{summary(em, rs)}</p>
        {em.title && <p className="mt-sm text-sm text-neutral-700">“{em.title}”</p>}
        {!closed && (
          <div className="mt-md flex flex-wrap gap-sm">
            {em.status === 'morning' && <button type="button" className={btnDark} onClick={() => o('dispatch')}>Send it out to contractors now</button>}
            {em.status !== 'office_handling' ? <button type="button" className={btn} onClick={() => o('hold')}>I’ll handle it</button> : <button type="button" className={btn} onClick={() => o('resume')}>Hand back to CROS</button>}
            <button type="button" className={btn} onClick={() => o('ask_again')}>Ask more contractors</button>
            <button type="button" className={btn} onClick={() => { const n = prompt('How was it resolved? (optional)'); if (n !== null) o('resolve', { note: n }) }}>Mark resolved</button>
            <button type="button" className="rounded-lg border border-red-200 px-md py-xs text-sm font-semibold text-red-700 hover:bg-red-50" onClick={() => { const n = prompt('Cancel this emergency and stand everyone down? Why?'); if (n !== null) o('cancel', { note: n }) }}>Cancel</button>
            {em.ticket_id && <Link href={`/admin/maintenance?job=${em.ticket_id}`} className={btn}>The job</Link>}
          </div>
        )}
      </section>

      <section className={card}>
        <h3 className="border-b border-neutral-100 px-lg py-sm text-xs font-bold uppercase tracking-wider text-neutral-500">Contractors asked</h3>
        {rs.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wide text-neutral-500"><th className="px-lg py-xs">Contractor</th><th className="py-xs">Answer</th><th className="py-xs">Can be there</th><th className="py-xs">Call-out</th><th className="py-xs">After the visit</th><th /></tr></thead>
              <tbody className="divide-y divide-neutral-100">
                {rs.map(r => (
                  <tr key={r.id} className={r.chosen ? 'bg-green-50' : ''}>
                    <td className="px-lg py-sm"><span className="font-semibold">{r.name}</span>{r.chosen && <span className="ml-xs rounded-full bg-green-600 px-sm py-0.5 text-[10px] font-bold text-white">COMING</span>}
                      <span className="block text-xs text-neutral-500">wave {r.wave} · {r.texted ? 'texted' : 'text failed'}{r.opened_at ? ' · opened' : ''}{r.phone ? <> · <a className="text-blue-700" href={`tel:${r.phone}`}>{r.phone}</a></> : ''}</span></td>
                    <td className="py-sm">{r.outcome === 'cant_attend' ? <span className="font-semibold text-red-700">Dropped out</span> : r.answer === 'yes' ? 'Can come' : r.answer === 'no' ? 'Can’t' : r.stood_down_at ? '—' : 'Waiting'}{r.note ? <span className="block text-xs text-neutral-500">“{r.note}”</span> : null}</td>
                    <td className="py-sm tabular-nums">{r.eta_at ? when(r.eta_at) : '—'}</td>
                    <td className="py-sm tabular-nums">{r.answer === 'yes' ? gbp(r.call_out_fee) : '—'}</td>
                    <td className="py-sm text-xs text-neutral-700">{r.outcome ? `${r.outcome.replace('_', ' ')}${r.part_needed ? ` · part: ${r.part_needed}` : ''}${r.fix_cost != null ? ` · fix ${gbp(r.fix_cost)}` : ''}${r.return_date ? ` · back ${r.return_date}` : ''}` : r.on_site_at ? `on site ${when(r.on_site_at)}` : '—'}</td>
                    <td className="py-sm pr-lg text-right">{!closed && r.answer === 'yes' && !r.chosen && r.outcome !== 'cant_attend' && <button type="button" className={btn} onClick={() => { if (confirm(`Send ${r.name}${em.chosen_response_id ? ' instead' : ''}?`)) o('choose', { responseId: r.id }) }}>Send them</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="px-lg py-md text-sm text-neutral-500">No one asked{em.status === 'morning' || em.status === 'call_999' ? ' (not needed tonight)' : ''}.</p>}
      </section>

      <section className={`${card} p-lg`}>
        <h3 className="mb-sm text-xs font-bold uppercase tracking-wider text-neutral-500">What happened</h3>
        <form className="mb-md flex gap-sm" onSubmit={async e => { e.preventDefault(); if (await o('note', { note })) setNote('') }}>
          <input className={`${input} flex-1`} value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note (e.g. called the tenant, all OK)" />
          <button type="submit" disabled={!note.trim()} className={btn}>Add</button>
        </form>
        <ol className="space-y-sm">
          {(d.events ?? []).map((ev: any) => (
            <li key={ev.id} className="flex gap-md text-sm">
              <span className="w-24 shrink-0 tabular-nums text-neutral-500">{when(ev.at)}</span>
              <span className="min-w-0 text-neutral-900">{ev.note}{ev.by_text && ev.by_text !== 'CROS' ? <span className="text-neutral-400"> · {ev.by_text}</span> : null}</span>
            </li>
          ))}
        </ol>
      </section>

      {em.steps?.length > 0 && (
        <section className={`${card} p-lg`}>
          <h3 className="mb-sm text-xs font-bold uppercase tracking-wider text-neutral-500">What the tenant was told to do</h3>
          <ul className="list-disc space-y-0.5 pl-lg text-sm text-neutral-700">{em.steps.map((s: string) => <li key={s}>{s}</li>)}</ul>
        </section>
      )}
    </div>
  )
}

// ── the emergency list ───────────────────────────────────────────────────────

function ContractorList({ data, act }: { data: any; act: (b: Record<string, unknown>) => Promise<boolean> }) {
  const trades: Record<string, string> = data.trades ?? {}
  const empty = { personId: '', trades: [] as string[], hoursFrom: 0, hoursTo: 24, backupOnly: false, fee: '', rank: 5, active: true, notes: '' }
  const [form, setForm] = useState<any>(empty)
  const listed = new Set((data.list ?? []).map((c: any) => c.personId))
  const hours = (c: any) => c.hoursFrom === 0 && c.hoursTo === 24 ? 'Any time' : `${String(c.hoursFrom).padStart(2, '0')}:00–${String(c.hoursTo % 24).padStart(2, '0')}:00`
  async function save() { if (await act({ action: 'save_contractor', ...form })) setForm(empty) }
  return (
    <div className="space-y-lg">
      <section className={card}>
        <h3 className="border-b border-neutral-100 px-lg py-sm text-xs font-bold uppercase tracking-wider text-neutral-500">Who we call</h3>
        {(data.list ?? []).length ? (
          <ul className="divide-y divide-neutral-100">
            {data.list.map((c: any) => (
              <li key={c.personId} className={`flex flex-wrap items-center justify-between gap-sm px-lg py-sm ${c.active ? '' : 'opacity-50'}`}>
                <span className="min-w-0">
                  <span className="font-semibold text-neutral-900">{c.name}</span>{!c.phone && <span className="ml-xs text-xs font-semibold text-red-700">no mobile number — can’t be texted</span>}
                  <span className="block text-xs text-neutral-500">{c.trades.map((t: string) => trades[t] ?? t).join(', ')} · {hours(c)}{c.backupOnly ? ' · backup only' : ''} · call-out {c.fee != null ? `£${c.fee}` : 'not set'} · preference {c.rank}{c.notes ? ` · ${c.notes}` : ''}</span>
                </span>
                <span className="flex gap-xs">
                  <button type="button" className={btn} onClick={() => setForm({ ...c, fee: c.fee ?? '' })}>Edit</button>
                  <button type="button" className={btn} onClick={() => { if (confirm(`Take ${c.name} off the emergency list?`)) act({ action: 'remove_contractor', personId: c.personId }) }}>Remove</button>
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="px-lg py-md text-sm text-neutral-600">No one yet. Add the contractors you’d call out of hours — CROS texts them all at once and confirms the soonest.</p>}
      </section>

      <section className={`${card} p-lg space-y-md`}>
        <h3 className="text-sm font-bold text-neutral-900">{form.personId && listed.has(form.personId) ? 'Edit' : 'Add a contractor'}</h3>
        <div className="grid gap-md sm:grid-cols-2">
          <label className="text-sm">Contractor
            <select className={`${input} mt-xs w-full`} value={form.personId} onChange={e => setForm({ ...form, personId: e.target.value })}>
              <option value="">Choose…</option>
              {(data.contractors ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}{p.phone ? '' : ' (no mobile)'}{listed.has(p.id) ? ' — on the list' : ''}</option>)}
            </select>
          </label>
          <label className="text-sm">Their usual call-out fee (£)
            <input className={`${input} mt-xs w-full`} inputMode="decimal" value={form.fee} onChange={e => setForm({ ...form, fee: e.target.value.replace(/[^\d.]/g, '') })} />
          </label>
        </div>
        <div>
          <p className="mb-xs text-sm">Trades</p>
          <div className="flex flex-wrap gap-xs">
            {Object.entries(trades).map(([k, l]) => (
              <label key={k} className={`cursor-pointer rounded-full border px-md py-xs text-sm ${form.trades.includes(k) ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300'}`}>
                <input type="checkbox" className="sr-only" checked={form.trades.includes(k)} onChange={e => setForm({ ...form, trades: e.target.checked ? [...form.trades, k] : form.trades.filter((t: string) => t !== k) })} />{l}
              </label>
            ))}
          </div>
        </div>
        <div className="grid gap-md sm:grid-cols-3">
          <label className="text-sm">Takes calls from
            <select className={`${input} mt-xs w-full`} value={form.hoursFrom} onChange={e => setForm({ ...form, hoursFrom: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select>
          </label>
          <label className="text-sm">until
            <select className={`${input} mt-xs w-full`} value={form.hoursTo} onChange={e => setForm({ ...form, hoursTo: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, h) => h + 1).map(h => <option key={h} value={h}>{h === 24 ? 'midnight (any time if from 00:00)' : `${String(h).padStart(2, '0')}:00`}</option>)}</select>
          </label>
          <label className="text-sm">Preference (1 = first choice)
            <select className={`${input} mt-xs w-full`} value={form.rank} onChange={e => setForm({ ...form, rank: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => <option key={n}>{n}</option>)}</select>
          </label>
        </div>
        <label className="flex items-center gap-sm text-sm"><input type="checkbox" checked={form.backupOnly} onChange={e => setForm({ ...form, backupOnly: e.target.checked })} /> Backup only — ask them when no one else can come (e.g. late at night, depending on how bad it is)</label>
        <label className="flex items-center gap-sm text-sm"><input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /> On the list (untick to pause them)</label>
        <input className={`${input} w-full`} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Notes (e.g. covers E-postcodes only)" />
        <div className="flex gap-sm">
          <button type="button" className={btnDark} disabled={!form.personId || !form.trades.length} onClick={save}>Save</button>
          {form.personId && <button type="button" className={btn} onClick={() => setForm(empty)}>Clear</button>}
        </div>
      </section>
    </div>
  )
}

function SettingsForm({ s, act }: { s: any; act: (b: Record<string, unknown>) => Promise<boolean> }) {
  const [v, setV] = useState({ ...s })
  const [saved, setSaved] = useState(false)
  return (
    <section className={`${card} p-lg space-y-md max-w-2xl`}>
      <label className="flex items-start gap-sm text-sm"><input type="checkbox" className="mt-1" checked={v.auto} onChange={e => setV({ ...v, auto: e.target.checked })} /><span><strong>Confirm the soonest automatically</strong><span className="block text-neutral-500">Off: CROS collects the answers and texts you to choose.</span></span></label>
      <label className="block text-sm">Collect answers for <input className={`${input} mx-xs w-16`} inputMode="numeric" value={v.windowMin} onChange={e => setV({ ...v, windowMin: e.target.value })} /> minutes before choosing <span className="text-neutral-500">(it chooses straight away if everyone asked has answered)</span></label>
      <label className="block text-sm">Call-out limit £<input className={`${input} mx-xs w-20`} inputMode="decimal" value={v.costLimit} onChange={e => setV({ ...v, costLimit: e.target.value })} /> — above this
        <select className={`${input} ml-xs`} value={v.overLimit} onChange={e => setV({ ...v, overLimit: e.target.value })}>
          <option value="send_after_15">ask me, and go ahead if I don’t answer in 15 minutes</option>
          <option value="wait">always wait for me</option>
        </select>
      </label>
      <label className="block text-sm">Check in with the contractor <input className={`${input} mx-xs w-16`} inputMode="numeric" value={v.followupMin} onChange={e => setV({ ...v, followupMin: e.target.value })} /> minutes after they were due</label>
      <label className="flex items-start gap-sm text-sm"><input type="checkbox" className="mt-1" checked={v.tenantUpdates} onChange={e => setV({ ...v, tenantUpdates: e.target.checked })} /><span><strong>Keep the house updated</strong><span className="block text-neutral-500">In-app messages and notifications to the tenants at that property (we’re on it, who’s coming and when, made safe / fixed) — even while other tenant messages are paused.</span></span></label>
      <div className="flex items-center gap-sm">
        <button type="button" className={btnDark} onClick={async () => { if (await act({ action: 'settings', values: v })) { setSaved(true); setTimeout(() => setSaved(false), 2000) } }}>Save settings</button>
        {saved && <span className="text-sm text-green-700">Saved</span>}
      </div>
    </section>
  )
}
