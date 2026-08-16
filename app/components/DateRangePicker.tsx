'use client'

import { useState } from 'react'

interface DateRangePickerProps {
  onRangeChange: (startDate: string, endDate: string) => void
  minDate: string
  maxDate: string
  initialStart?: string
  initialEnd?: string
}

export default function DateRangePicker({
  onRangeChange,
  minDate,
  maxDate,
  initialStart,
  initialEnd
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false)

  // Simple date formatting
  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return ''
    const parts = dateStr.split('-')
    if (parts.length !== 3) return dateStr
    const year = parts[0]
    const month = parseInt(parts[1])
    const day = parts[2]
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${day} ${months[month - 1]} ${year}`
  }

  // Preset ranges anchored to the most recent statement (maxDate). One tap widens
  // the view from the latest month out to the whole history.
  const monthsBack = (n: number) => {
    const end = new Date(maxDate)
    const start = new Date(maxDate)
    start.setMonth(start.getMonth() - n)
    // Clamp to the oldest statement we actually have.
    const startIso = start.toISOString().split('T')[0]
    return startIso < minDate ? minDate : startIso
  }
  const presets = [
    { label: 'Latest month', start: initialStart || maxDate, end: maxDate },
    { label: 'Last 3 months', start: monthsBack(2), end: maxDate },
    { label: 'Last 6 months', start: monthsBack(5), end: maxDate },
    { label: 'Last 12 months', start: monthsBack(11), end: maxDate },
    { label: 'All time', start: minDate, end: maxDate },
  ]

  return (
    <div className="relative">
      <button
        type="button"
        className="flex items-center gap-sm px-md py-xs bg-neutral-700 text-white rounded hover:bg-neutral-600 transition"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>📅</span>
        <span className="text-sm font-medium">{formatDisplayDate(initialStart || minDate)}</span>
        <span className="text-xs text-white/60">→</span>
        <span className="text-sm font-medium">{formatDisplayDate(initialEnd || maxDate)}</span>
        <span className="text-xs">▼</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 bg-neutral-800 border border-neutral-700 rounded-lg p-lg z-50 w-72 shadow-xl">
          <div className="space-y-md">
            <div>
              <label className="block text-xs font-bold text-white/60 mb-xs">QUICK RANGES</label>
              <div className="flex flex-wrap gap-xs">
                {presets.map((p) => {
                  const active = initialStart === p.start && initialEnd === p.end
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => onRangeChange(p.start, p.end)}
                      className={`px-sm py-xs rounded text-xs font-medium transition ${
                        active
                          ? 'bg-blue-600 text-white'
                          : 'bg-neutral-700 text-white/80 hover:bg-neutral-600'
                      }`}
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="border-t border-neutral-700 pt-md">
              <label className="block text-xs font-bold text-white/60 mb-xs">FROM DATE</label>
              <input
                type="date"
                defaultValue={initialStart || minDate}
                onChange={(e) => {
                  if (e.target.value) {
                    onRangeChange(e.target.value, initialEnd || maxDate)
                  }
                }}
                className="w-full px-md py-sm bg-neutral-700 text-white rounded border border-neutral-600 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-white/60 mb-xs">TO DATE</label>
              <input
                type="date"
                defaultValue={initialEnd || maxDate}
                onChange={(e) => {
                  if (e.target.value) {
                    onRangeChange(initialStart || minDate, e.target.value)
                  }
                }}
                className="w-full px-md py-sm bg-neutral-700 text-white rounded border border-neutral-600 text-sm"
              />
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="w-full mt-md px-md py-sm bg-blue-600 hover:bg-blue-700 text-white rounded font-bold text-sm transition"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
