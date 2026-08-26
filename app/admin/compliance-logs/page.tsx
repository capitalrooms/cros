'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'

interface Property {
  id: string
  name: string
  address: string
  property_type: string
}

interface ComplianceLog {
  id: string
  check_type: 'fire_door' | 'smoke_alarm'
  checked_date: string
  checked_by: string
  notes: string | null
  created_at: string
  person?: { full_name: string; role: string } | null
}

export default function ComplianceLogsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [properties, setProperties] = useState<Property[]>([])
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null)
  const [logs, setLogs] = useState<ComplianceLog[]>([])
  const [tab, setTab] = useState<'fire_door' | 'smoke_alarm'>('fire_door')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<any>(null)

  const [form, setForm] = useState({
    checked_date: new Date().toISOString().split('T')[0],
    notes: '',
  })

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || !['admin', 'administrator'].includes(data.assignment?.role)) {
        router.push('/login')
        return
      }
      setCurrentUser(data)

      // Load properties
      const { data: propsData } = await supabase
        .from('properties')
        .select('id, name, address, property_type')
        .order('name')
      
      if (propsData) {
        setProperties(propsData)
        setSelectedProperty(propsData[0]?.id || null)
      }

      setLoading(false)
    }
    init()
  }, [router])

  useEffect(() => {
    if (selectedProperty) {
      loadLogs()
    }
  }, [selectedProperty, tab])

  async function loadLogs() {
    if (!selectedProperty) return

    const { data: logsData } = await supabase
      .from('compliance_logs')
      .select('*, people:checked_by(full_name, role)')
      .eq('property_id', selectedProperty)
      .eq('check_type', tab)
      .order('checked_date', { ascending: false })

    setLogs(logsData || [])
  }

  async function handleAddCheck() {
    if (!selectedProperty || !form.checked_date) {
      setError('Property and date are required')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const { error: insertError } = await supabase
        .from('compliance_logs')
        .insert({
          property_id: selectedProperty,
          check_type: tab,
          checked_by: currentUser?.user?.id,
          checked_by_role: currentUser?.assignment?.role,
          checked_date: form.checked_date,
          notes: form.notes || null,
        })

      if (insertError) throw new Error(insertError.message)

      setSuccess(`✓ ${tab === 'fire_door' ? 'Fire door' : 'Smoke alarm'} check recorded`)
      setForm({
        checked_date: new Date().toISOString().split('T')[0],
        notes: '',
      })
      setShowModal(false)
      await loadLogs()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save check')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <GenericPageSkeleton />

  const selectedProp = properties.find(p => p.id === selectedProperty)
  const filteredLogs = logs.filter(l => l.check_type === tab)

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar right={<BackButton href="/admin" />} />

      <main className="mx-auto max-w-4xl px-lg py-lg">
        <div className="mb-3xl">
          <h1 className="text-3xl font-bold text-neutral-900">Compliance Logs</h1>
          <p className="mt-sm text-neutral-600">Fire door and smoke alarm checks across your properties.</p>
        </div>

        {error && (
          <div className="mb-lg rounded-lg bg-red-50 border border-red-200 p-md text-sm text-red-800">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-lg rounded-lg bg-green-50 border border-green-200 p-md text-sm text-green-800">
            {success}
          </div>
        )}

        {/* Property selector */}
        <div className="mb-lg">
          <label className="block text-sm font-bold text-neutral-700 mb-sm">Property</label>
          <select
            value={selectedProperty || ''}
            onChange={(e) => setSelectedProperty(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-lg py-md text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
          >
            {properties.map((prop) => (
              <option key={prop.id} value={prop.id}>
                {prop.name} — {prop.address}
              </option>
            ))}
          </select>
        </div>

        {/* Tabs */}
        <div className="mb-lg flex gap-md border-b border-neutral-300">
          {['fire_door', 'smoke_alarm'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t as 'fire_door' | 'smoke_alarm')}
              className={`px-lg py-md text-sm font-semibold transition border-b-2 ${
                tab === t
                  ? 'border-neutral-900 text-neutral-900'
                  : 'border-transparent text-neutral-600 hover:text-neutral-900'
              }`}
            >
              {t === 'fire_door' ? '🚪 Fire Door Checks' : '🔔 Smoke Alarm Checks'}
            </button>
          ))}
        </div>

        {/* Add check button */}
        <div className="mb-lg">
          <button
            onClick={() => setShowModal(true)}
            className="px-lg py-md bg-neutral-900 text-white rounded-lg font-semibold text-sm hover:bg-neutral-800 transition"
          >
            + Add {tab === 'fire_door' ? 'fire door' : 'smoke alarm'} check
          </button>
        </div>

        {/* Logs list */}
        {filteredLogs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-xl text-center">
            <p className="text-sm text-neutral-500">No checks recorded yet</p>
          </div>
        ) : (
          <div className="rounded-lg border border-neutral-200 divide-y divide-neutral-200 bg-white">
            {filteredLogs.map((log) => (
              <div key={log.id} className="p-lg">
                <div className="flex items-start justify-between gap-lg mb-sm">
                  <div>
                    <p className="font-bold text-neutral-900">
                      {new Date(log.checked_date).toLocaleDateString('en-GB', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                    <p className="text-sm text-neutral-600 mt-xs">
                      Checked by: <span className="font-semibold">{log.person?.full_name || 'Unknown'}</span>
                      {' '}
                      <span className="text-xs text-neutral-500">
                        ({log.person?.role || 'unknown'})
                      </span>
                    </p>
                  </div>
                  <p className="text-xs text-neutral-500">
                    {new Date(log.created_at).toLocaleDateString('en-GB')}
                  </p>
                </div>
                {log.notes && (
                  <p className="text-sm text-neutral-700 bg-neutral-50 rounded p-md mt-sm">
                    {log.notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Add check modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-lg">
          <div className="w-full max-w-lg rounded-2xl bg-white p-lg shadow-xl">
            <div className="flex items-center justify-between mb-lg">
              <h2 className="text-xl font-bold text-neutral-900">
                Add {tab === 'fire_door' ? 'Fire Door' : 'Smoke Alarm'} Check
              </h2>
              <button
                onClick={() => setShowModal(false)}
                disabled={saving}
                className="text-neutral-400 hover:text-neutral-900 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="space-y-lg mb-lg">
              <div>
                <label className="block text-sm font-bold text-neutral-700 mb-sm">Date</label>
                <input
                  type="date"
                  value={form.checked_date}
                  onChange={(e) => setForm({ ...form, checked_date: e.target.value })}
                  className="w-full rounded-lg border border-neutral-300 px-lg py-md text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-neutral-700 mb-sm">Notes (optional)</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder={
                    tab === 'fire_door'
                      ? 'e.g. Door closing smoothly, latch secure'
                      : 'e.g. Battery level good, sensor responsive'
                  }
                  rows={3}
                  className="w-full rounded-lg border border-neutral-300 px-lg py-md text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>
            </div>

            <div className="flex gap-md">
              <button
                onClick={() => setShowModal(false)}
                disabled={saving}
                className="flex-1 rounded-lg border border-neutral-300 px-lg py-md text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCheck}
                disabled={saving}
                className="flex-1 rounded-lg bg-neutral-900 px-lg py-md text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save check'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
