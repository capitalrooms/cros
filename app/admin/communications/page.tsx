'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'

interface Msg {
  id: string
  date: string
  type: 'Tenant' | 'Maintenance' | 'Landlord' | 'Cleaning' | 'Lettings'
  from: string
  to: string
  message: string
  threadLabel: string
  link: string | null
  propertyId: string | null
  roomId: string | null
  former: boolean
}
interface PropOpt { id: string; name: string; rooms: { id: string; name: string }[] }

const TYPES = ['All', 'Tenant', 'Maintenance', 'Landlord', 'Cleaning', 'Lettings'] as const
type TypeFilter = (typeof TYPES)[number]

const TYPE_PILL: Record<string, string> = {
  Tenant: 'bg-neutral-200 text-neutral-700',
  Maintenance: 'bg-blue-100 text-blue-700',
  Landlord: 'bg-purple-100 text-purple-700',
  Cleaning: 'bg-green-100 text-green-700',
  Lettings: 'bg-amber-100 text-amber-700',
}

export default function CommunicationsHubPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState<Msg[]>([])
  const [total, setTotal] = useState(0)
  const [properties, setProperties] = useState<PropOpt[]>([])
  const [type, setType] = useState<TypeFilter>('All')
  const [propertyId, setPropertyId] = useState('')
  const [roomId, setRoomId] = useState('')

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || !['administrator', 'admin'].includes(data.assignment?.role)) {
        router.push('/login')
        return
      }
      const res = await fetch('/api/admin/communications')
      if (res.ok) {
        const json = await res.json()
        setMessages(json.messages || [])
        setTotal(json.total || 0)
        setProperties(json.properties || [])
      }
      setLoading(false)
    }
    init()
  }, [router])

  const roomsForProperty = useMemo(
    () => properties.find((p) => p.id === propertyId)?.rooms || [],
    [properties, propertyId]
  )

  const filtered = useMemo(() => {
    return messages.filter((m) => {
      if (type !== 'All' && m.type !== type) return false
      if (propertyId && m.propertyId !== propertyId) return false
      if (roomId && m.roomId !== roomId) return false
      return true
    })
  }, [messages, type, propertyId, roomId])

  const propName = properties.find((p) => p.id === propertyId)?.name
  const roomLabel = roomsForProperty.find((r) => r.id === roomId)?.name

  if (loading) return <GenericPageSkeleton />

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin" />} />

      <main className="mx-auto max-w-6xl px-lg py-lg">
        <div className="mb-lg text-center">
          <h1 className="text-3xl font-bold text-neutral-900">Communications Hub</h1>
          <p className="mt-xs text-sm text-neutral-500">Every message, every channel, one filterable place.</p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
          {/* Header bar */}
          <div className="flex items-center justify-between bg-neutral-900 px-lg py-md text-white">
            <h2 className="text-lg font-bold">All Communications</h2>
            <span className="text-sm text-white/60">{total.toLocaleString()} messages</span>
          </div>

          {/* Type filter */}
          <div className="flex flex-wrap items-center gap-sm border-b border-neutral-200 px-lg py-md">
            <span className="mr-sm text-xs font-bold uppercase tracking-widest text-neutral-400">Type</span>
            {TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`rounded-full px-md py-xs text-sm font-semibold transition ${
                  type === t ? 'bg-neutral-900 text-white' : 'border border-neutral-300 text-neutral-600 hover:border-neutral-500'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Drill-down */}
          <div className="flex flex-wrap items-center gap-sm border-b border-neutral-200 bg-neutral-50 px-lg py-md">
            <span className="mr-sm text-xs font-bold uppercase tracking-widest text-neutral-400">Drill down</span>
            <select
              value={propertyId}
              onChange={(e) => { setPropertyId(e.target.value); setRoomId('') }}
              className="min-w-0 rounded-full border border-neutral-300 bg-white px-md py-sm text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
            >
              <option value="">All properties</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <span className="text-neutral-400" aria-hidden>→</span>
            <select
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              disabled={!propertyId}
              className="min-w-0 rounded-full border border-neutral-300 bg-white px-md py-sm text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900 disabled:opacity-50"
            >
              <option value="">{propertyId ? 'All rooms' : 'Pick a property first'}</option>
              {roomsForProperty.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>

          {roomId && (
            <p className="border-b border-neutral-200 px-lg py-sm text-sm text-neutral-600">
              Showing all messages for <strong className="text-neutral-900">{roomLabel}, {propName}</strong> — includes former tenants associated with this room
            </p>
          )}

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b border-neutral-200 text-xs font-bold uppercase tracking-wide text-neutral-400">
                  <th className="px-lg py-sm">Date</th>
                  <th className="px-lg py-sm">Type</th>
                  <th className="px-lg py-sm">From → To</th>
                  <th className="px-lg py-sm">Message</th>
                  <th className="px-lg py-sm">Thread</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={5} className="px-lg py-2xl text-center text-sm text-neutral-400">No messages in this view.</td></tr>
                ) : (
                  filtered.map((m) => (
                    <tr
                      key={m.id}
                      onClick={() => m.link && router.push(m.link)}
                      className={`border-b border-neutral-100 align-top text-sm ${m.link ? 'cursor-pointer hover:bg-neutral-50' : ''} ${m.former ? 'opacity-55' : ''}`}
                    >
                      <td className="whitespace-nowrap px-lg py-sm text-neutral-600">
                        {new Date(m.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        <span className="block text-xs text-neutral-400">
                          {new Date(m.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                      <td className="px-lg py-sm">
                        <span className={`inline-block rounded-full px-sm py-0.5 text-xs font-semibold ${TYPE_PILL[m.type] || 'bg-neutral-200 text-neutral-700'}`}>{m.type}</span>
                      </td>
                      <td className="px-lg py-sm text-neutral-800">
                        {m.from} <span className="text-neutral-400">→</span> {m.to}
                        {m.former && <span className="block text-xs italic text-neutral-400">former tenant</span>}
                      </td>
                      <td className="px-lg py-sm text-neutral-700">{m.message}</td>
                      <td className="whitespace-nowrap px-lg py-sm text-neutral-500">{m.threadLabel}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-md text-center text-xs text-neutral-400">
          View-only — click any row to open the original flow and respond there.
        </p>
      </main>
    </div>
  )
}
