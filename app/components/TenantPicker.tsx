'use client'
import { useState, useRef, useEffect } from 'react'

type Person = {
  id: string
  first_name?: string | null
  last_name?: string | null
  full_name?: string | null
  email?: string | null
}

type Tenancy = {
  person_id?: string | null
  people?: { id: string } | null
  rooms?: { name: string } | null
  properties?: { name: string } | null
  end_date?: string | null
}

interface Props {
  people: Person[]
  tenancies?: Tenancy[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  className?: string
}

export function personDisplayName(p: Person) {
  return p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || 'Unknown'
}

function getPropertyForPerson(personId: string, tenancies: Tenancy[]): string {
  const today = new Date().toISOString().split('T')[0]
  const active = tenancies
    .filter(t => {
      const pid = t.person_id ?? t.people?.id
      if (pid !== personId) return false
      if (!t.end_date) return true
      return t.end_date >= today
    })
    .sort((a, b) => (!a.end_date ? -1 : !b.end_date ? 1 : 0))[0]
  return active?.properties?.name || ''
}

export default function TenantPicker({ people, tenancies = [], value, onChange, placeholder = 'Search tenants…', className = '' }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const selected = people.find(p => p.id === value)
  const displayValue = selected ? personDisplayName(selected) : ''

  useEffect(() => {
    function onClickOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOut)
    return () => document.removeEventListener('mousedown', onClickOut)
  }, [])

  const filtered = query.length === 0
    ? people
    : people.filter(p => {
        const name = personDisplayName(p).toLowerCase()
        const email = (p.email || '').toLowerCase()
        const q = query.toLowerCase()
        return name.includes(q) || email.includes(q)
      })

  const grouped: Record<string, Person[]> = {}
  for (const p of filtered) {
    const prop = getPropertyForPerson(p.id, tenancies) || 'No active tenancy'
    if (!grouped[prop]) grouped[prop] = []
    grouped[prop].push(p)
  }
  const groups = Object.keys(grouped).sort((a, b) => {
    if (a === 'No active tenancy') return 1
    if (b === 'No active tenancy') return -1
    return a.localeCompare(b)
  })

  return (
    <div ref={ref} className={`relative ${className}`}>
      <div className="relative">
        <input
          type="text"
          value={open ? query : displayValue}
          placeholder={placeholder}
          onFocus={() => { setOpen(true); setQuery('') }}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          className="w-full rounded-xl border border-neutral-300 bg-white px-md py-sm pr-xl text-sm focus:border-neutral-900 focus:outline-none"
        />
        {value && (
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); onChange(''); setQuery('') }}
            className="absolute right-sm top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 text-xs px-xs leading-none"
          >
            ✕
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-50 mt-xs w-full rounded-xl border border-neutral-200 bg-white shadow-lg max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-md py-sm text-sm text-neutral-400">No tenants match &ldquo;{query}&rdquo;</p>
          ) : (
            groups.map(group => (
              <div key={group}>
                <p className="sticky top-0 bg-white border-b border-neutral-100 px-md pt-sm pb-xs text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                  {group}
                </p>
                {grouped[group].map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onMouseDown={() => { onChange(p.id); setQuery(''); setOpen(false) }}
                    className={`w-full text-left px-md py-sm text-sm hover:bg-neutral-50 flex items-center justify-between gap-md ${value === p.id ? 'bg-neutral-50 font-semibold' : ''}`}
                  >
                    <span>{personDisplayName(p)}</span>
                    {p.email && <span className="text-[11px] text-neutral-400 truncate">{p.email}</span>}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
