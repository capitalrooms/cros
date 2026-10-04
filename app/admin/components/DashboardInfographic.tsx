'use client'

// Desktop dashboard: the whole managed portfolio at a glance (layout agreed 4 Oct 2026 from the options canvas).
// All figures come from /api/admin/dashboard; each tile opens the page that deals with it.

import Link from 'next/link'

export interface DashboardData {
  today: string
  portfolio: { managed: number; letOnly: number; landlords: number }
  rooms: { total: number; let: number; notice: number; empty: number; byHouse: { id: string; name: string; let: number; notice: number; empty: number; other: number }[]; onNotice: { room: string; house: string; leaves: string | null; noticeRecorded: boolean; tenancyId: string | null }[] }
  rent: { roll: number; monthDue: number; monthIn: number; overdueAmount: number; overdueCount: number; min: number | null; max: number | null; median: number | null; average: number | null; increasesOnRecord: number; tenancies: number }
  ends: { buckets: { label: string; count: number; noNotice: number }[]; noNoticeSoon: number }
  lettings: { toFill: number; applied: number; offerSent: number; referencing: number; movingIn: number; nextMoveIn: string | null; viewingsNext7: number; avgStayMonths: number | null }
  repairs: { open: number; toApprove: number; needContractor: number; visitPassed: number; bookedAhead: number; waitingDate: number; inProgress: number; held: number; perMonth: { label: string; count: number; partial: boolean }[]; avgDaysToFix: number | null; finished: number }
  deposits: { withDeposit: number; protected: number; prescribed: number; holdingHeld: number; holdingAmount: number }
  certs: { types: string[]; rows: { id: string; name: string; cells: string[] }[]; valid: number; due: number; expired: number; missing: number }
  waiting: { label: string; count: number; href: string; bad: boolean }[]
}

const INK = '#181614', CREAM = '#F6F3EC', LET = '#2F6B4F', NOTICE = '#E8A33A', EMPTY = '#6E95D2', RED = '#C8372D'
const gbp0 = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`
const gbp2 = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const day = (iso: string | null) => iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '—'
const pct = (a: number, b: number) => b ? Math.round(a / b * 100) : 0

function Tile({ title, note, href, children, foot, wide }: { title: string; note?: React.ReactNode; href?: string; children: React.ReactNode; foot?: React.ReactNode; wide?: boolean }) {
  return (
    <section className={`flex min-w-0 flex-col rounded-[10px] border border-[#E4E1DB] bg-white ${wide ? 'lg:col-span-2' : ''}`}>
      <header className="flex items-center justify-between gap-sm border-b border-[#E4E1DB] px-md py-sm">
        {href ? <Link href={href} className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-neutral-600 hover:text-neutral-900">{title} →</Link>
          : <h2 className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-neutral-600">{title}</h2>}
        {note && <span className="text-[11.5px] text-neutral-500">{note}</span>}
      </header>
      <div className="flex-1">{children}</div>
      {foot && <div className="border-t border-[#F0EEEA] px-md py-sm text-[12.5px] leading-relaxed text-neutral-800">{foot}</div>}
    </section>
  )
}

const Warn = ({ children }: { children: React.ReactNode }) => <span className="font-semibold" style={{ color: RED }}>{children}</span>
const Dot = ({ c }: { c: string }) => <i className="inline-block h-3 w-3 rounded-[3px]" style={{ background: c }} />

function Donut({ let: l, notice, empty, total }: { let: number; notice: number; empty: number; total: number }) {
  const C = 2 * Math.PI * 42
  let off = 0
  const seg = (n: number, col: string) => { const L = total ? C * n / total : 0; const el = <circle key={col} r="42" cx="60" cy="60" fill="none" stroke={col} strokeWidth="16" strokeDasharray={`${L} ${C - L}`} strokeDashoffset={-off} transform="rotate(-90 60 60)" />; off += L; return el }
  return (
    <svg viewBox="0 0 120 120" width="124" height="124" role="img" aria-label={`${l} let, ${notice} on notice, ${empty} empty`}>
      <circle r="42" cx="60" cy="60" fill="none" stroke="#EFEDE9" strokeWidth="16" />
      {seg(l, LET)}{seg(notice, NOTICE)}{seg(empty, EMPTY)}
      <text x="60" y="60" textAnchor="middle" fontWeight="800" fontSize="24" fill={INK} style={{ fontFamily: 'var(--font-baloo-2, system-ui)' }}>{pct(l, total)}%</text>
      <text x="60" y="76" textAnchor="middle" fontSize="10" fill="#75706A">let</text>
    </svg>
  )
}

function Bars({ items, height = 96, highlight }: { items: { label: string; count: number; faded?: boolean }[]; height?: number; highlight?: (i: number) => boolean }) {
  const max = Math.max(1, ...items.map(i => i.count))
  const w = 46
  return (
    <svg viewBox={`0 0 ${items.length * w + 12} ${height + 36}`} width="100%" height={height + 36} role="img" aria-label={items.map(i => `${i.label} ${i.count}`).join(', ')}>
      <line x1="4" x2={items.length * w + 8} y1={height + 16.5} y2={height + 16.5} stroke="#E4E1DB" />
      {items.map((it, i) => {
        const h = Math.max(2, it.count / max * height), x = 10 + i * w
        return (
          <g key={it.label}>
            <rect x={x} y={height + 16 - h} width="30" height={h} rx="3" fill={highlight?.(i) ? RED : it.faded ? '#9C968E' : INK} opacity={it.faded ? 0.55 : 1} />
            <text x={x + 15} y={height + 10 - h} textAnchor="middle" fontSize="11" fontWeight="700" fill={INK}>{it.count}</text>
            <text x={x + 15} y={height + 31} textAnchor="middle" fontSize="10" fill="#75706A">{it.label}</text>
          </g>
        )
      })}
    </svg>
  )
}

const CELL: Record<string, { bg: string; fg?: string; text: string }> = {
  valid: { bg: '#CFE6D9', text: '' }, due: { bg: '#F6D58E', fg: '#6B4600', text: 'due' }, expired: { bg: RED, fg: '#fff', text: 'exp' },
  missing: { bg: 'repeating-linear-gradient(135deg,#F1EFEB 0 4px,#E6E2DC 4px 5px)', text: '' }, na: { bg: 'transparent', fg: '#75706A', text: 'n/a' },
}

export default function DashboardInfographic({ d, name }: { d: DashboardData; name: string }) {
  const hour = new Date().getHours()
  const r = d.rooms, rent = d.rent, rep = d.repairs, dep = d.deposits
  const dateLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  const kpis: { v: React.ReactNode; l: string; href: string; bad?: boolean }[] = [
    { v: `${pct(r.let, r.total)}%`, l: `rooms let · ${r.let} of ${r.total}`, href: '/admin/active-rooms' },
    { v: r.notice, l: 'rooms on notice', href: '/admin/tenancies' },
    { v: r.empty, l: 'rooms empty', href: '/admin/available-and-lettings' },
    { v: gbp0(rent.roll), l: 'rent roll / month', href: '/admin/rent-roll' },
    { v: <>{gbp0(rent.monthIn)} <small className="text-[12px] font-semibold" style={{ color: 'rgba(246,243,236,.55)' }}>of {gbp0(rent.monthDue)}</small></>, l: `${new Date().toLocaleDateString('en-GB', { month: 'long' })} rent in so far`, href: '/admin/rent-roll' },
    { v: gbp0(rent.overdueAmount), l: 'earlier rent still owed', href: '/admin/arrears', bad: rent.overdueAmount > 0 },
    { v: rep.open, l: 'open repairs', href: '/admin/maintenance' },
  ]
  const fill = d.lettings
  const funnel = [['Applied', fill.applied], ['Offer sent', fill.offerSent], ['Referencing', fill.referencing], [fill.nextMoveIn ? `Moving in · next ${day(fill.nextMoveIn)}` : 'Moving in', fill.movingIn]] as [string, number][]
  const unprotected = dep.withDeposit - dep.protected

  return (
    <div>
      <section className="bg-[#181614] text-[#F6F3EC]">
        <div className="mx-auto max-w-6xl px-lg pb-lg pt-lg">
          <div className="flex flex-wrap items-end justify-between gap-md">
            <div>
              <h1 className="text-2xl font-extrabold leading-tight sm:text-[28px]" style={{ fontFamily: 'var(--font-baloo-2, system-ui, sans-serif)' }}>Good {hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}{name ? `, ${name}` : ''}</h1>
              <p className="mt-0.5 text-sm" style={{ color: 'rgba(246,243,236,.6)' }}>{dateLabel} · {d.portfolio.managed} managed houses · {d.portfolio.letOnly} let-only · {d.portfolio.landlords} landlords</p>
            </div>
            <div className="flex gap-sm">
              <Link href="/admin/appointments" className="inline-flex h-8 items-center rounded-lg px-md text-[12.5px] font-semibold" style={{ background: 'rgba(246,243,236,.1)' }}>Diary</Link>
              <Link href="/admin/finance-check" className="inline-flex h-8 items-center rounded-lg px-md text-[12.5px] font-semibold" style={{ background: 'rgba(246,243,236,.1)' }}>Health check</Link>
            </div>
          </div>
          <div className="mt-md grid grid-cols-2 gap-sm sm:grid-cols-4 xl:grid-cols-7">
            {kpis.map(k => (
              <Link key={k.l} href={k.href} className="grid gap-0.5 rounded-[10px] px-md py-sm transition-colors hover:brightness-125" style={{ background: 'rgba(246,243,236,.07)' }}>
                <b className="text-[22px] font-extrabold leading-tight tabular-nums" style={{ fontFamily: 'var(--font-baloo-2, system-ui)', color: k.bad ? '#F28B82' : CREAM }}>{k.v}</b>
                <span className="text-[11px]" style={{ color: 'rgba(246,243,236,.6)' }}>{k.l}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <main className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-md px-lg py-lg lg:grid-cols-3">

        <Tile title="Rooms" href="/admin/active-rooms" wide note={`${r.total} managed rooms · by house`}
          foot={r.onNotice.length ? <>On notice: {r.onNotice.map((n, i) => <span key={i}>{i ? ' · ' : ''}{n.room}, {n.house} leaves <b>{day(n.leaves)}</b>{!n.noticeRecorded && <Warn> (no notice date recorded)</Warn>}</span>)}</> : 'No rooms on notice.'}>
          <div className="grid grid-cols-1 items-center gap-md p-md sm:grid-cols-[150px_minmax(0,1fr)]">
            <div className="grid justify-items-center gap-sm">
              <Donut let={r.let} notice={r.notice} empty={r.empty} total={r.total} />
              <div className="flex flex-wrap justify-center gap-x-md gap-y-1 text-[11.5px] text-neutral-500"><span className="inline-flex items-center gap-1"><Dot c={LET} />Let {r.let}</span><span className="inline-flex items-center gap-1"><Dot c={NOTICE} />On notice {r.notice}</span><span className="inline-flex items-center gap-1"><Dot c={EMPTY} />Empty {r.empty}</span></div>
            </div>
            <div className="grid grid-cols-1 gap-x-lg gap-y-1.5 sm:grid-cols-2">
              {r.byHouse.map(h => (
                <Link key={h.id} href={`/admin/properties/${h.id}`} className="flex items-center justify-between gap-sm text-[12px] hover:underline">
                  <span className="truncate">{h.name}</span>
                  <span className="flex flex-none gap-[3px]">
                    {Array.from({ length: h.let }, (_, i) => <Dot key={`l${i}`} c={LET} />)}
                    {Array.from({ length: h.notice }, (_, i) => <Dot key={`n${i}`} c={NOTICE} />)}
                    {Array.from({ length: h.empty }, (_, i) => <Dot key={`e${i}`} c={EMPTY} />)}
                    {Array.from({ length: h.other }, (_, i) => <Dot key={`o${i}`} c="#CFCAC2" />)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </Tile>

        <Tile title="Tenancies ending" href="/admin/tenancies" note={`${rent.tenancies} current`}
          foot={d.ends.noNoticeSoon ? <><Warn>{d.ends.noNoticeSoon} rolling tenanc{d.ends.noNoticeSoon === 1 ? 'y has' : 'ies have'} an end date in the next two months with no notice given.</Warn> If they are carrying on, clear the end date so next month’s rent is raised. <Link href="/admin/finance-check" className="mt-1 inline-flex h-[26px] items-center rounded-lg border border-[#E4E1DB] px-sm text-[12px] font-semibold">Review them</Link></> : 'Every end date has notice behind it.'}>
          <div className="px-sm pt-xs"><Bars items={d.ends.buckets.map((b, i) => ({ label: b.label, count: b.count, faded: i === d.ends.buckets.length - 1 }))} highlight={i => (d.ends.buckets[i]?.noNotice ?? 0) > 0} /></div>
        </Tile>

        <Tile title="Rent" href="/admin/rent-roll" note={new Date().toLocaleDateString('en-GB', { month: 'long' })}>
          <div className="grid gap-sm p-md text-[12.5px]">
            <div className="h-3 overflow-hidden rounded-full bg-[#EFEDE9]"><i className="block h-full" style={{ width: `${Math.min(100, pct(rent.monthIn, rent.monthDue))}%`, background: LET }} /></div>
            <div className="flex justify-between text-[11.5px] text-neutral-500"><span>{gbp0(rent.monthIn)} received</span><span>{gbp0(rent.monthDue)} due</span></div>
            {rent.min != null && rent.max != null && rent.median != null && (
              <div className="mt-xs grid gap-1">
                <span>Rent per room</span>
                <div className="relative mx-1.5 mt-1.5 h-1.5 rounded-full" style={{ background: 'linear-gradient(90deg,#DCD8D1,#B9B3AA)' }}>
                  {[rent.min, rent.median, rent.max].map((v, i) => <i key={i} className="absolute -top-1 h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2" style={{ left: `${rent.max === rent.min ? 50 : (v - rent.min!) / (rent.max! - rent.min!) * 100}%`, borderColor: INK, background: i === 1 ? INK : '#fff' }} />)}
                </div>
                <div className="flex justify-between text-[11.5px] text-neutral-500"><span>{gbp0(rent.min)}</span><span>median {gbp0(rent.median)} · average {gbp0(rent.average ?? 0)}</span><span>{gbp0(rent.max)}</span></div>
              </div>
            )}
            <div className="flex justify-between border-t border-[#F0EEEA] pt-sm"><span className="text-neutral-500">Overdue from earlier months</span><b style={{ color: rent.overdueCount ? RED : undefined }}>{rent.overdueCount} · {gbp2(rent.overdueAmount)}</b></div>
            <div className="flex justify-between border-t border-[#F0EEEA] pt-sm"><span className="text-neutral-500">Rent increases on record</span><b>{rent.increasesOnRecord} of {rent.tenancies}</b></div>
          </div>
        </Tile>

        <Tile title="Lettings" href="/admin/lettings" note={`${fill.toFill} room${fill.toFill === 1 ? '' : 's'} to fill`}
          foot={<>{fill.viewingsNext7 ? <>{fill.viewingsNext7} viewing{fill.viewingsNext7 === 1 ? '' : 's'} booked in the next 7 days.</> : <Warn>No viewings booked in the next 7 days.</Warn>}{fill.avgStayMonths != null && <> Average stay is <b>{fill.avgStayMonths} months</b>.</>}</>}>
          <div className="grid gap-1.5 p-md">
            {funnel.map(([l, n], i) => (
              <div key={l} className="flex min-w-[160px] justify-between rounded-md px-sm py-1 text-[12px]" style={{ width: `${100 - i * 18}%`, background: INK, color: CREAM }}>
                <span>{l}</span><b className="text-[15px] leading-tight" style={{ fontFamily: 'var(--font-baloo-2, system-ui)' }}>{n}</b>
              </div>
            ))}
          </div>
        </Tile>

        <Tile title="Repairs" href="/admin/maintenance" note={`${rep.open} open`}>
          <div className="grid gap-sm p-md text-[12px]">
            {(() => {
              const parts = [
                { n: rep.toApprove, c: '#6E95D2', l: 'To approve' }, { n: rep.needContractor, c: NOTICE, l: 'Need a contractor' },
                { n: rep.waitingDate, c: '#B9B3AA', l: 'Waiting for a date' }, { n: rep.bookedAhead + rep.inProgress, c: LET, l: 'Booked or under way' },
                { n: rep.visitPassed, c: RED, l: 'Visit date passed, not signed off' }, { n: rep.held, c: '#8C8780', l: 'Held to batch' },
              ].filter(p => p.n > 0)
              return (<>
                <div className="flex h-[22px] gap-[2px] overflow-hidden rounded-md">{parts.map(p => <i key={p.l} className="grid place-items-center text-[11.5px] font-bold not-italic text-white" style={{ flex: p.n, background: p.c }}>{p.n}</i>)}</div>
                <div className="flex flex-wrap gap-x-md gap-y-1 text-[11.5px] text-neutral-500">{parts.map(p => <span key={p.l} className="inline-flex items-center gap-1"><Dot c={p.c} />{p.l}</span>)}</div>
              </>)
            })()}
            <div className="flex items-end gap-md">
              <div className="w-[130px] flex-none"><Bars height={52} items={rep.perMonth.map(m => ({ label: m.partial ? `${m.label}*` : m.label, count: m.count, faded: m.partial }))} /></div>
              <div className="grid gap-0.5">
                {rep.avgDaysToFix != null && <span><b>{rep.avgDaysToFix} days</b> average to fix ({rep.finished} finished)</span>}
                <span><b>{rep.perMonth.reduce((a, m) => a + m.count, 0)}</b> reported in 3 months</span>
                <span className="text-neutral-400">*this month so far</span>
              </div>
            </div>
          </div>
        </Tile>

        <Tile title="Deposits" href="/admin/deposits" note={`${dep.withDeposit} tenancies with a deposit`}>
          <div className="grid gap-sm p-md text-[12.5px]">
            <div className="grid grid-cols-3 gap-sm">
              {[[dep.protected, 'protected', false], [unprotected, 'no protection recorded', unprotected > 0], [dep.prescribed, 'prescribed info served', dep.prescribed < dep.withDeposit]].map(([n, l, bad]) => (
                <div key={l as string} className="grid"><b className="text-[26px] font-extrabold leading-none" style={{ fontFamily: 'var(--font-baloo-2, system-ui)', color: bad ? RED : INK }}>{n as number}</b><span className="text-[11.5px] text-neutral-500">{l as string}</span></div>
              ))}
            </div>
            {dep.withDeposit > 0 && <div className="flex h-[22px] gap-[2px] overflow-hidden rounded-md"><i className="grid place-items-center text-[11.5px] font-bold not-italic text-white" style={{ flex: dep.protected || 0.0001, background: LET }}>{dep.protected || ''}</i>{unprotected > 0 && <i className="grid place-items-center text-[11.5px] font-bold not-italic text-white" style={{ flex: unprotected, background: RED }}>{unprotected}</i>}</div>}
            <div className="flex justify-between border-t border-[#F0EEEA] pt-sm"><span className="text-neutral-500">Holding deposits held</span><b>{dep.holdingHeld} · {gbp2(dep.holdingAmount)}</b></div>
          </div>
        </Tile>

        <Tile title="Certificates · every house, every type" href="/admin/compliance?tab=certificates" wide
          note={<span className="flex flex-wrap gap-x-md gap-y-1">{([['valid', 'Valid'], ['due', 'Due in 30 days'], ['expired', 'Expired'], ['missing', 'Not on file']] as const).map(([k, l]) => <span key={k} className="inline-flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-[3px]" style={{ background: CELL[k].bg }} />{l}</span>)}</span>}
          foot={<><b>{d.certs.valid} valid</b> · {d.certs.expired || d.certs.due ? <Warn>{d.certs.expired} expired · {d.certs.due} due</Warn> : 'none expired'} · {d.certs.missing} not on file.</>}>
          <div className="overflow-x-auto px-sm pb-sm pt-xs">
            <table className="w-full border-separate text-[11.5px]" style={{ borderSpacing: 3 }}>
              <thead><tr><th />{d.certs.types.map(t => <th key={t} className="whitespace-nowrap px-0.5 text-center text-[10.5px] font-semibold text-neutral-500">{t}</th>)}</tr></thead>
              <tbody>
                {d.certs.rows.map(row => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap pr-sm font-semibold"><Link href={`/admin/properties/${row.id}`} className="hover:underline">{row.name}</Link></td>
                    {row.cells.map((c, i) => <td key={i}><i className="block h-[18px] min-w-[52px] rounded text-center text-[10px] font-bold not-italic leading-[18px]" style={{ background: CELL[c].bg, color: CELL[c].fg }}>{CELL[c].text}</i></td>)}
                  </tr>
                ))}
                <tr><td className="pt-1 text-[11px] font-semibold text-neutral-500">Valid</td>{d.certs.types.map((t, i) => {
                  const col = d.certs.rows.map(r => r.cells[i]); const applies = col.filter(c => c !== 'na').length
                  return <td key={t} className="pt-1 text-center text-[11px] font-semibold text-neutral-500">{col.filter(c => c === 'valid').length}/{applies}</td>
                })}</tr>
              </tbody>
            </table>
          </div>
        </Tile>

        <Tile title="Waiting on you" note="by area">
          <div className="grid py-1">
            {d.waiting.length ? d.waiting.map(w => (
              <Link key={w.label} href={w.href} className="flex items-center justify-between gap-sm border-t border-[#F0EEEA] px-md py-[7px] text-[12.5px] first:border-t-0 hover:bg-neutral-50">
                <span>{w.label}</span><b className="text-[16px] font-extrabold leading-none" style={{ fontFamily: 'var(--font-baloo-2, system-ui)', color: w.bad ? RED : INK }}>{w.count}</b>
              </Link>
            )) : <p className="px-md py-sm text-[12.5px] text-neutral-500">Nothing waiting.</p>}
          </div>
        </Tile>

      </main>
    </div>
  )
}
