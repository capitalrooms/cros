'use client'

import { useState } from 'react'

export interface UpcomingItem {
  id: string
  date: string       // ISO yyyy-mm-dd
  time?: string      // HH:MM
  label: string      // Primary label (property name, job title…)
  sublabel?: string  // Secondary info (visitor name, room, status…)
  badge?: string     // Pill text shown on the right
  badgeColor?: string // Tailwind bg class, defaults to neutral
}

interface Props {
  items: UpcomingItem[]         // All future items, pre-sorted by date asc
  onItemClick: (item: UpcomingItem) => void
  title?: string
  emptyMessage?: string
  initialShowCount?: number
}

function friendlyDate(iso: string): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(iso + 'T00:00:00')
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff <= 6) return d.toLocaleDateString('en-GB', { weekday: 'long' })
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

function weekLabel(iso: string): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(iso + 'T00:00:00')
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff < 0) return 'Overdue'
  if (diff <= 1) return 'Today & tomorrow'
  if (diff <= 7) return 'This week'
  if (diff <= 14) return 'Next week'
  const month = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  return month
}

export default function UpcomingList({
  items,
  onItemClick,
  title = 'All upcoming',
  emptyMessage = 'Nothing booked yet',
  initialShowCount = 10,
}: Props) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? items : items.slice(0, initialShowCount)

  // Group visible items by week-bucket label
  const groups: { label: string; items: UpcomingItem[] }[] = []
  for (const item of visible) {
    const bucket = weekLabel(item.date)
    const last = groups[groups.length - 1]
    if (last && last.label === bucket) {
      last.items.push(item)
    } else {
      groups.push({ label: bucket, items: [item] })
    }
  }

  return (
    <section className="mt-3xl">
      <div className="flex items-center justify-between mb-md">
        <div className="flex items-center gap-sm">
          <h2 className="text-xl font-bold text-neutral-900">{title}</h2>
          {items.length > 0 && (
            <span className="rounded-full bg-neutral-200 px-sm py-0.5 text-xs font-bold text-neutral-700">
              {items.length}
            </span>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
          <p className="text-sm text-neutral-500">{emptyMessage}</p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="mb-sm text-xs font-bold uppercase tracking-widest text-neutral-500">
                  {group.label}
                </p>
                <div className="space-y-sm">
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => onItemClick(item)}
                      className="group w-full flex items-center gap-md rounded-xl border border-neutral-200 bg-white px-md py-md text-left transition-all hover:border-neutral-900 hover:shadow-sm"
                    >
                      {/* Date chip */}
                      <div className="shrink-0 w-14 text-center">
                        <p className="text-xs font-bold text-neutral-500 leading-tight">
                          {new Date(item.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase()}
                        </p>
                        <p className="text-lg font-black text-neutral-900 leading-tight">
                          {new Date(item.date + 'T00:00:00').getDate()}
                        </p>
                        <p className="text-xs text-neutral-400 leading-tight">
                          {new Date(item.date + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short' })}
                        </p>
                      </div>

                      {/* Divider */}
                      <div className="w-px self-stretch bg-neutral-200 group-hover:bg-neutral-900 transition-colors" />

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-neutral-900">{item.label}</p>
                        {item.sublabel && (
                          <p className="truncate text-xs text-neutral-500 mt-0.5">{item.sublabel}</p>
                        )}
                        {item.time && (
                          <p className="text-xs font-semibold text-neutral-400 mt-0.5">⏰ {item.time}</p>
                        )}
                      </div>

                      {/* Badge + arrow */}
                      <div className="shrink-0 flex items-center gap-sm">
                        {item.badge && (
                          <span className={`rounded-full px-sm py-0.5 text-xs font-bold ${item.badgeColor || 'bg-neutral-100 text-neutral-600'}`}>
                            {item.badge}
                          </span>
                        )}
                        <span className="text-neutral-300 group-hover:text-neutral-900 transition-colors text-sm">
                          ↗
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {!showAll && items.length > initialShowCount && (
            <button
              onClick={() => setShowAll(true)}
              className="mt-md w-full rounded-xl border border-dashed border-neutral-300 py-sm text-sm font-semibold text-neutral-500 hover:border-neutral-600 hover:text-neutral-700 transition-colors"
            >
              Show all {items.length} bookings ↓
            </button>
          )}
          {showAll && items.length > initialShowCount && (
            <button
              onClick={() => setShowAll(false)}
              className="mt-md w-full rounded-xl border border-dashed border-neutral-300 py-sm text-sm font-semibold text-neutral-500 hover:border-neutral-600 hover:text-neutral-700 transition-colors"
            >
              Show less ↑
            </button>
          )}
        </>
      )}
    </section>
  )
}
