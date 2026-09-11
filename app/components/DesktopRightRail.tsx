'use client'

import { useState } from 'react'

/**
 * DesktopRightRail
 *
 * 300px right panel shown on desktop, matching the vision spec.
 * Contains: full month calendar grid + configurable alert cards.
 *
 * Usage:
 *   <DesktopRightRail dateCounts={countByDay} alerts={[{ title: '...', body: '...', variant, onClick }]} />
 */

export interface RailAlert {
  title: string
  body?: string
  variant?: 'red' | 'sage' | 'amber' | 'default'
  onClick?: () => void
}

interface Props {
  /** Map of ISO date → event count, used to show dots on the calendar */
  dateCounts?: Record<string, number>
  /** @deprecated use dateCounts — kept for backward-compat */
  weekCounts?: Record<string, number>
  /** Today's ISO date — defaults to computed */
  todayISO?: string
  alerts?: RailAlert[]
  /** Section heading above alerts, defaults to "Needs Attention" */
  alertsHeading?: string
  /** Any extra content below alerts */
  children?: React.ReactNode
}

const variantStyles: Record<string, { title: string; card: string; border: string }> = {
  red:     { title: '#B4472F', card: 'rgba(180,71,47,0.06)',   border: 'rgba(180,71,47,0.25)' },
  sage:    { title: '#4B6358', card: 'rgba(75,99,88,0.06)',    border: 'rgba(75,99,88,0.25)'  },
  amber:   { title: '#C97A3D', card: 'rgba(201,122,61,0.06)',  border: 'rgba(201,122,61,0.25)' },
  default: { title: '#181614', card: '#FFFFFF',                border: '#E7E1D4' },
}

const DAY_HDRS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function buildMonthDays(year: number, month: number): (number | null)[] {
  // month is 0-based
  const firstDow = new Date(year, month, 1).getDay() // 0=Sun
  // Shift so Monday is col 0
  const shift = firstDow === 0 ? 6 : firstDow - 1
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = Array(shift).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  return cells
}

function todayISOFn() {
  return new Date().toISOString().split('T')[0]
}

export default function DesktopRightRail({
  dateCounts,
  weekCounts,
  todayISO,
  alerts = [],
  alertsHeading = 'Needs Attention',
  children,
}: Props) {
  const counts = dateCounts ?? weekCounts ?? {}
  const today  = todayISO ?? todayISOFn()
  const [td] = today.split('T')
  const todayParts = td.split('-').map(Number)
  const [yearState, setYear] = useState(todayParts[0])
  const [monthState, setMonth] = useState(todayParts[1] - 1) // 0-based

  const cells = buildMonthDays(yearState, monthState)

  const prevMonth = () => {
    if (monthState === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (monthState === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  const monthLabel = new Date(yearState, monthState, 1)
    .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  return (
    <div
      style={{
        padding: '20px 16px 40px',
        borderLeft: '1px solid #E7E1D4',
        overflowY: 'auto',
      }}
    >
      {/* ── Month calendar ──────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        {/* Month nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <button
            onClick={prevMonth}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 6, color: '#59544C', fontSize: 14, fontWeight: 700, lineHeight: 1 }}
          >
            ‹
          </button>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#181614', letterSpacing: '0.02em' }}>
            {monthLabel}
          </span>
          <button
            onClick={nextMonth}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 6, color: '#59544C', fontSize: 14, fontWeight: 700, lineHeight: 1 }}
          >
            ›
          </button>
        </div>

        {/* Day-of-week headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px 0', marginBottom: 4 }}>
          {DAY_HDRS.map((h, i) => (
            <div key={i} style={{ textAlign: 'center', fontSize: 9.5, fontWeight: 700, color: '#9ca3af', paddingBottom: 2 }}>
              {h}
            </div>
          ))}
        </div>

        {/* Calendar cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {cells.map((day, idx) => {
            if (day === null) return <div key={`e-${idx}`} />
            const iso = `${yearState}-${String(monthState + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const isToday = iso === today
            const count = counts[iso] ?? 0
            return (
              <div
                key={iso}
                style={{
                  textAlign: 'center',
                  padding: '4px 1px 5px',
                  borderRadius: 8,
                  background: isToday ? '#181614' : 'transparent',
                  position: 'relative',
                }}
              >
                <span style={{
                  fontSize: 11,
                  fontWeight: isToday ? 800 : count > 0 ? 700 : 500,
                  color: isToday ? '#F6F3EC' : count > 0 ? '#181614' : '#9ca3af',
                  lineHeight: 1,
                }}>
                  {day}
                </span>
                {count > 0 && !isToday && (
                  <span style={{
                    display: 'block',
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    background: '#4B6358',
                    margin: '2px auto 0',
                  }} />
                )}
                {isToday && count > 0 && (
                  <span style={{
                    display: 'block',
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    background: '#DCE6DE',
                    margin: '2px auto 0',
                  }} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Alerts / modules ────────────────────────────────────────── */}
      {alerts.length > 0 && (
        <>
          <h3 style={{ fontFamily: 'var(--font-baloo-2,system-ui)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', margin: '0 0 8px', fontWeight: 700 }}>
            {alertsHeading}
          </h3>
          {alerts.map((a, i) => {
            const vs = variantStyles[a.variant ?? 'default']
            return (
              <div
                key={i}
                onClick={a.onClick}
                role={a.onClick ? 'button' : undefined}
                tabIndex={a.onClick ? 0 : undefined}
                onKeyDown={a.onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') a.onClick!() } : undefined}
                style={{
                  background: vs.card,
                  border: `1px solid ${vs.border}`,
                  borderRadius: 12,
                  padding: '11px 13px',
                  marginBottom: 7,
                  cursor: a.onClick ? 'pointer' : 'default',
                  transition: a.onClick ? 'opacity 0.12s' : undefined,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 6,
                }}
                onMouseEnter={a.onClick ? (e) => { (e.currentTarget as HTMLElement).style.opacity = '0.8' } : undefined}
                onMouseLeave={a.onClick ? (e) => { (e.currentTarget as HTMLElement).style.opacity = '1' } : undefined}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 12.5, color: vs.title, marginBottom: 1 }}>{a.title}</div>
                  {a.body && <div style={{ fontSize: 11, color: '#59544C', lineHeight: 1.3 }}>{a.body}</div>}
                </div>
                {a.onClick && (
                  <span style={{ fontSize: 13, color: vs.title, opacity: 0.5, flexShrink: 0 }}>›</span>
                )}
              </div>
            )
          })}
        </>
      )}

      {children}
    </div>
  )
}
