'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import Link from 'next/link'

interface ComplianceLog {
  id: string
  property_id: string
  property: { name: string }
  check_type: 'fire_door' | 'smoke_alarm'
  checked_by: string
  checked_by_role: string
  checked_date: string
  notes: string | null
  created_at: string
}

interface Property {
  id: string
  name: string
}

export default function ComplianceLogsPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState<ComplianceLog[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null)
  const [selectedCheckType, setSelectedCheckType] = useState<'fire_door' | 'smoke_alarm'>('fire_door')
  const [showAddForm, setShowAddForm] = useState(false)
  const [formData, setFormData] = useState({
    checked_date: new Date().toISOString().split('T')[0],
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || !['administrator', 'admin'].includes(data.assignment?.role)) {
        router.push('/login')
        return
      }
      setUser(data.user)

      const supabase = createClient()

      // Fetch properties
      const { data: propsData } = await supabase.from('properties').select('id, name').order('name')
      setProperties(propsData || [])

      if (propsData && propsData.length > 0) {
        setSelectedPropertyId(propsData[0].id)
      }

      setLoading(false)
    }
    init()
  }, [router])

  useEffect(() => {
    async function fetchLogs() {
      if (!selectedPropertyId) return

      const supabase = createClient()
      const { data } = await supabase
        .from('compliance_logs')
        .select('*, property:properties(name)')
        .eq('property_id', selectedPropertyId)
        .eq('check_type', selectedCheckType)
        .order('checked_date', { ascending: false })

      setLogs(data || [])
    }

    fetchLogs()
  }, [selectedPropertyId, selectedCheckType])

  async function handleAddLog() {
    if (!selectedPropertyId || !formData.checked_date) {
      alert('Please fill in all required fields')
      return
    }

    setSubmitting(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('compliance_logs').insert([
        {
          property_id: selectedPropertyId,
          check_type: selectedCheckType,
          checked_by: user.id,
          checked_by_role: 'admin',
          checked_date: formData.checked_date,
          notes: formData.notes || null,
        },
      ])

      if (error) throw error

      alert('✅ Compliance log added')
      setFormData({ checked_date: new Date().toISOString().split('T')[0], notes: '' })
      setShowAddForm(false)

      // Refresh logs
      const { data } = await supabase
        .from('compliance_logs')
        .select('*, property:properties(name)')
        .eq('property_id', selectedPropertyId)
        .eq('check_type', selectedCheckType)
        .order('checked_date', { ascending: false })

      setLogs(data || [])
    } catch (err) {
      alert('Error adding log: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar right={<Link href="/admin" className="text-sm font-bold text-white">← Admin</Link>} />

      <main className="mx-auto max-w-4xl px-lg py-2xl">
        <h1 className="text-3xl font-bold text-neutral-900 mb-lg">🏠 Compliance Logs</h1>

        <div className="rounded-2xl border border-neutral-200 bg-white p-lg shadow-sm">
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-md mb-lg">
            <div>
              <label className="block text-sm font-semibold text-neutral-900 mb-sm">Property</label>
              <select
                value={selectedPropertyId || ''}
                onChange={(e) => setSelectedPropertyId(e.target.value)}
                className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm"
              >
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-neutral-900 mb-sm">Check Type</label>
              <select
                value={selectedCheckType}
                onChange={(e) => setSelectedCheckType(e.target.value as 'fire_door' | 'smoke_alarm')}
                className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm"
              >
                <option value="fire_door">🚪 Fire Door</option>
                <option value="smoke_alarm">🔔 Smoke Alarm</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="w-full rounded-xl bg-blue-600 px-md py-sm text-sm font-semibold text-white hover:bg-blue-700"
              >
                + Add Check
              </button>
            </div>
          </div>

          {/* Add Form */}
          {showAddForm && (
            <div className="mb-lg p-lg border-2 border-blue-200 bg-blue-50 rounded-xl">
              <h3 className="font-semibold text-neutral-900 mb-md">Add New Check</h3>
              <div className="space-y-md">
                <div>
                  <label className="block text-sm font-semibold text-neutral-900 mb-sm">Date</label>
                  <input
                    type="date"
                    value={formData.checked_date}
                    onChange={(e) => setFormData({ ...formData, checked_date: e.target.value })}
                    className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-neutral-900 mb-sm">Notes (Optional)</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm"
                    rows={3}
                    placeholder="e.g., Fire door closing properly, no obstructions..."
                  />
                </div>

                <div className="flex gap-md">
                  <button
                    onClick={handleAddLog}
                    disabled={submitting}
                    className="flex-1 rounded-xl bg-green-600 px-md py-sm text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {submitting ? 'Saving...' : '✓ Save Log'}
                  </button>
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="flex-1 rounded-xl border border-neutral-300 px-md py-sm text-sm font-semibold hover:bg-neutral-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Logs List */}
          <div className="space-y-sm">
            <h2 className="text-lg font-semibold text-neutral-900">
              {selectedCheckType === 'fire_door' ? '🚪 Fire Door' : '🔔 Smoke Alarm'} History
            </h2>

            {logs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-lg text-center">
                <p className="text-sm text-neutral-600">No checks recorded yet</p>
              </div>
            ) : (
              <div className="space-y-sm">
                {logs.map((log) => (
                  <div key={log.id} className="rounded-lg border border-neutral-200 bg-neutral-50 p-md">
                    <div className="flex items-start justify-between gap-md">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-neutral-900">
                          {new Date(log.checked_date).toLocaleDateString('en-GB', {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </p>
                        {log.notes && <p className="mt-xs text-sm text-neutral-600">{log.notes}</p>}
                        <p className="mt-sm text-xs text-neutral-500">
                          Checked by admin • {new Date(log.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <span className="text-lg">✅</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
