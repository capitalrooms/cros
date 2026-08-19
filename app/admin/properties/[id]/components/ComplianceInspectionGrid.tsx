'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

interface InspectionLog {
  id: string
  date: string
  user_type: 'admin' | 'tenant' | 'cleaner'
  user_name: string
  fire_door_status?: 'pass' | 'fail' | 'not_checked'
  smoke_alarm_status?: 'pass' | 'fail' | 'not_checked'
  notes?: string
  photo_url?: string
  created_at: string
}

interface ComplianceInspectionGridProps {
  propertyId: string
}

export default function ComplianceInspectionGrid({ propertyId }: ComplianceInspectionGridProps) {
  const [inspections, setInspections] = useState<InspectionLog[]>([])
  const [loading, setLoading] = useState(true)
  const [isAddingInspection, setIsAddingInspection] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    check_type: 'both', // 'fire_door', 'smoke_alarm', 'both'
    fire_door_status: 'pass' as 'pass' | 'fail' | 'not_checked',
    smoke_alarm_status: 'pass' as 'pass' | 'fail' | 'not_checked',
    notes: '',
    inspection_date: new Date().toISOString().split('T')[0]
  })

  const supabase = createClient()

  useEffect(() => {
    loadInspections()
  }, [propertyId])

  async function loadInspections() {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('compliance_logs')
      .select('*')
      .eq('property_id', propertyId)
      .order('checked_date', { ascending: false })
      .limit(100)

    if (err) {
      console.error('Failed to load inspections:', err)
      setError('Failed to load inspection history')
    } else {
      const mapped = (data || []).map((log: any) => ({
        id: log.id,
        date: log.checked_date,
        user_type: log.checked_by_role || 'admin',
        user_name: log.checked_by_name || 'Unknown',
        fire_door_status: log.fire_door_status,
        smoke_alarm_status: log.smoke_alarm_status,
        notes: log.notes,
        photo_url: log.photo_url,
        created_at: log.created_at
      }))
      setInspections(mapped)
    }
    setLoading(false)
  }

  async function handleAddInspection() {
    if (!formData.inspection_date) {
      setError('Inspection date is required')
      return
    }

    const { data: currentUser } = await supabase.auth.getUser()
    if (!currentUser.user) {
      setError('Not authenticated')
      return
    }

    const { data, error: err } = await supabase
      .from('compliance_logs')
      .insert({
        property_id: propertyId,
        check_type: formData.check_type,
        fire_door_status: formData.check_type !== 'smoke_alarm' ? formData.fire_door_status : null,
        smoke_alarm_status: formData.check_type !== 'fire_door' ? formData.smoke_alarm_status : null,
        checked_by: currentUser.user.id,
        checked_by_role: 'admin',
        checked_date: formData.inspection_date,
        notes: formData.notes || null
      })
      .select()

    if (err) {
      setError('Failed to save inspection')
      console.error(err)
      return
    }

    if (data) {
      await loadInspections()
      setFormData({
        check_type: 'both',
        fire_door_status: 'pass',
        smoke_alarm_status: 'pass',
        notes: '',
        inspection_date: new Date().toISOString().split('T')[0]
      })
      setIsAddingInspection(false)
      setSuccess('Inspection recorded')
      setTimeout(() => setSuccess(null), 3000)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'pass': return 'bg-green-50 text-green-700 border-green-200'
      case 'fail': return 'bg-red-50 text-red-700 border-red-200'
      case 'not_checked': return 'bg-neutral-50 text-neutral-600 border-neutral-200'
      default: return 'bg-neutral-50 text-neutral-600 border-neutral-200'
    }
  }

  const getStatusLabel = (status?: string) => {
    switch (status) {
      case 'pass': return '✓ Pass'
      case 'fail': return '✗ Fail'
      case 'not_checked': return '—'
      default: return '—'
    }
  }

  if (loading) {
    return <div className="text-sm text-neutral-400">Loading inspection history...</div>
  }

  return (
    <div className="space-y-lg">
      {/* Header */}
      <div className="flex items-center justify-between gap-md">
        <div className="flex-1">
          <h3 className="text-sm font-bold uppercase text-neutral-400">🔍 Inspection Log</h3>
          <p className="text-xs text-neutral-500 mt-xs">Fire door & smoke alarm checks</p>
        </div>
        <div className="flex gap-sm">
          {inspections.length > 0 && (
            <button
              onClick={async () => {
                try {
                  const response = await fetch('/api/compliance/export-pdf', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ property_id: propertyId })
                  })
                  if (response.ok) {
                    const blob = await response.blob()
                    const url = window.URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `compliance-log-${new Date().getTime()}.csv`
                    a.click()
                  }
                } catch (err) {
                  console.error('Export failed:', err)
                }
              }}
              className="px-lg py-md bg-neutral-700 text-white rounded-lg font-semibold text-sm hover:bg-neutral-600 transition"
            >
              📥 Export
            </button>
          )}
          <button
            onClick={() => setIsAddingInspection(true)}
            className="px-lg py-md bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition"
          >
            + Record Check
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-lg rounded-lg bg-red-950 border border-red-800">
          <p className="text-sm font-semibold text-red-400">{error}</p>
        </div>
      )}
      {success && (
        <div className="p-lg rounded-lg bg-green-950 border border-green-800">
          <p className="text-sm font-semibold text-green-400">✓ {success}</p>
        </div>
      )}

      {/* Add Inspection Modal */}
      {isAddingInspection && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-lg">
          <div className="bg-neutral-950 rounded-xl shadow-lg p-lg max-w-md w-full border border-neutral-700">
            <h3 className="text-lg font-semibold text-white mb-lg">Record Inspection</h3>

            <div className="space-y-lg">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                  Date *
                </label>
                <input
                  type="date"
                  value={formData.inspection_date}
                  onChange={(e) => setFormData({ ...formData, inspection_date: e.target.value })}
                  className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                  Check Type
                </label>
                <select
                  value={formData.check_type}
                  onChange={(e) => setFormData({ ...formData, check_type: e.target.value })}
                  className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="both">Both (Fire Door & Smoke Alarm)</option>
                  <option value="fire_door">Fire Door Only</option>
                  <option value="smoke_alarm">Smoke Alarm Only</option>
                </select>
              </div>

              {(formData.check_type === 'both' || formData.check_type === 'fire_door') && (
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                    Fire Door Status
                  </label>
                  <select
                    value={formData.fire_door_status}
                    onChange={(e) => setFormData({ ...formData, fire_door_status: e.target.value as any })}
                    className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="pass">✓ Pass</option>
                    <option value="fail">✗ Fail</option>
                    <option value="not_checked">Not Checked</option>
                  </select>
                </div>
              )}

              {(formData.check_type === 'both' || formData.check_type === 'smoke_alarm') && (
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                    Smoke Alarm Status
                  </label>
                  <select
                    value={formData.smoke_alarm_status}
                    onChange={(e) => setFormData({ ...formData, smoke_alarm_status: e.target.value as any })}
                    className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="pass">✓ Pass</option>
                    <option value="fail">✗ Fail</option>
                    <option value="not_checked">Not Checked</option>
                  </select>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                  Notes (Optional)
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Any issues found or additional notes..."
                  className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex gap-md mt-lg">
              <button
                onClick={() => {
                  setIsAddingInspection(false)
                  setError(null)
                }}
                className="flex-1 px-lg py-md border border-neutral-700 text-white rounded-lg font-semibold text-sm hover:bg-neutral-900 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAddInspection}
                className="flex-1 px-lg py-md bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inspection Grid */}
      {inspections.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-neutral-700 bg-neutral-900 p-xl text-center">
          <p className="text-sm text-neutral-400 mb-md">No inspections recorded yet</p>
          <button
            onClick={() => setIsAddingInspection(true)}
            className="px-lg py-md bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition mx-auto"
          >
            + Record First Check
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-neutral-700 bg-neutral-950 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-700 bg-neutral-900">
                <th className="px-lg py-md text-left font-semibold text-neutral-300">Date</th>
                <th className="px-lg py-md text-left font-semibold text-neutral-300">Checked By</th>
                <th className="px-lg py-md text-left font-semibold text-neutral-300">Type</th>
                <th className="px-lg py-md text-left font-semibold text-neutral-300">Fire Door</th>
                <th className="px-lg py-md text-left font-semibold text-neutral-300">Smoke Alarm</th>
                <th className="px-lg py-md text-left font-semibold text-neutral-300">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-700">
              {inspections.map((inspection) => (
                <tr key={inspection.id} className="hover:bg-neutral-900 transition">
                  <td className="px-lg py-md text-white">{formatDate(inspection.date)}</td>
                  <td className="px-lg py-md text-neutral-300">
                    <div className="flex items-center gap-xs">
                      <span className="text-xs px-2 py-1 rounded bg-neutral-800 text-neutral-400">
                        {inspection.user_type === 'admin' ? '🔧' : inspection.user_type === 'tenant' ? '👤' : '🧹'}
                      </span>
                      <span>{inspection.user_name}</span>
                    </div>
                  </td>
                  <td className="px-lg py-md text-neutral-400 text-xs">
                    {inspection.fire_door_status && inspection.smoke_alarm_status ? 'Both' : inspection.fire_door_status ? 'Fire Door' : 'Smoke Alarm'}
                  </td>
                  <td className="px-lg py-md">
                    {inspection.fire_door_status && (
                      <span className={`inline-block px-2 py-1 rounded text-xs font-semibold border ${getStatusColor(inspection.fire_door_status)}`}>
                        {getStatusLabel(inspection.fire_door_status)}
                      </span>
                    )}
                  </td>
                  <td className="px-lg py-md">
                    {inspection.smoke_alarm_status && (
                      <span className={`inline-block px-2 py-1 rounded text-xs font-semibold border ${getStatusColor(inspection.smoke_alarm_status)}`}>
                        {getStatusLabel(inspection.smoke_alarm_status)}
                      </span>
                    )}
                  </td>
                  <td className="px-lg py-md text-xs text-neutral-400 max-w-xs truncate">{inspection.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary Stats */}
      {inspections.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-md">
          <div className="rounded-lg border border-neutral-700 bg-neutral-950 p-lg text-center">
            <p className="text-2xl font-bold text-white">{inspections.length}</p>
            <p className="text-xs text-neutral-400 mt-xs uppercase tracking-wider font-semibold">Total Checks</p>
          </div>
          <div className="rounded-lg border border-neutral-700 bg-neutral-950 p-lg text-center">
            <p className="text-2xl font-bold text-green-400">{inspections.filter(i => i.fire_door_status === 'pass').length}</p>
            <p className="text-xs text-neutral-400 mt-xs uppercase tracking-wider font-semibold">Fire Door Pass</p>
          </div>
          <div className="rounded-lg border border-neutral-700 bg-neutral-950 p-lg text-center">
            <p className="text-2xl font-bold text-green-400">{inspections.filter(i => i.smoke_alarm_status === 'pass').length}</p>
            <p className="text-xs text-neutral-400 mt-xs uppercase tracking-wider font-semibold">Smoke Alarm Pass</p>
          </div>
          <div className="rounded-lg border border-neutral-700 bg-neutral-950 p-lg text-center">
            <p className="text-2xl font-bold text-red-400">{inspections.filter(i => i.fire_door_status === 'fail' || i.smoke_alarm_status === 'fail').length}</p>
            <p className="text-xs text-neutral-400 mt-xs uppercase tracking-wider font-semibold">Issues Found</p>
          </div>
        </div>
      )}
    </div>
  )
}
