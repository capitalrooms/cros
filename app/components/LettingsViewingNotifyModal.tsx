'use client'

import { useState } from 'react'

interface ViewingLite {
  id: string
  property_id: string
  viewing_date: string
  viewing_slot: string | null
}

interface Props {
  viewing: ViewingLite
  onClose: () => void
  onSuccess?: () => void
}

type NotifyType = 'running_late' | 'moved' | 'custom'

/**
 * Lets a lettings agent quickly tell the tenants in the house they're visiting
 * that a viewing is delayed or being moved. Sends to the property's tenants via
 * /api/admin/quick-notify-lettings.
 *
 * Anonymity: a viewing outs the leaver, so messages NEVER name the room — they
 * only reference "a viewing at your property", matching how the tenant dashboard
 * already shows viewings ("A prospective tenant").
 */
export default function LettingsViewingNotifyModal({ viewing, onClose, onSuccess }: Props) {
  const [type, setType] = useState<NotifyType>('running_late')
  const [newTime, setNewTime] = useState(viewing.viewing_slot || '')
  const [customSubject, setCustomSubject] = useState('')
  const [customMessage, setCustomMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function composed(): { subject: string; message: string } {
    switch (type) {
      case 'running_late':
        return {
          subject: 'A viewing at your home is running late',
          message: `Quick heads-up — a viewing scheduled at your property is running a little behind${
            newTime ? ` and is now expected around ${newTime}` : ''
          }. Sorry for any disruption to the communal areas, and thanks for your patience.`,
        }
      case 'moved':
        return {
          subject: 'A viewing at your home has moved',
          message: `Quick heads-up — a viewing scheduled at your property has been moved${
            newTime ? ` to ${newTime}` : ''
          }. Sorry for the change and any disruption to the communal areas.`,
        }
      case 'custom':
        return { subject: customSubject, message: customMessage }
    }
  }

  async function send() {
    const { subject, message } = composed()
    if (!subject.trim() || !message.trim()) {
      setError('Please add a subject and message')
      return
    }
    if (!viewing.property_id) {
      setError("This viewing isn't linked to a property, so tenants can't be notified.")
      return
    }
    setSending(true)
    setError(null)
    try {
      // One notify path for lettings: the server route (service-role) writes the
      // real notifications columns and fires push to opted-in tenants.
      const res = await fetch('/api/admin/quick-notify-lettings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: viewing.property_id,
          viewing_id: viewing.id,
          // Our message is already composed (no placeholders), so substitution
          // is a no-op; running_late just lets the route fetch viewing details.
          selector_type: type === 'custom' ? 'single' : 'running_late',
          new_arrival_time: newTime || null,
          subject,
          message,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to send')
      setSuccess(json.message || '✓ Tenants notified')
      setTimeout(() => { onSuccess?.(); onClose() }, 1800)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send notification')
    } finally {
      setSending(false)
    }
  }

  const preview = composed()

  return (
    <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-black/50 p-sm sm:p-lg" onClick={() => !sending && onClose()}>
      <div className="w-full max-w-lg rounded-2xl bg-neutral-900 p-lg border border-neutral-700 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-lg">
          <div>
            <h3 className="text-lg font-semibold text-white">Notify the house</h3>
            <p className="text-sm text-neutral-400 mt-xs">Tell tenants about a delay or change to this viewing.</p>
          </div>
          <button onClick={onClose} className="text-2xl text-neutral-400 hover:text-white leading-none">×</button>
        </div>

        {error && <div className="mb-lg rounded-lg bg-red-950 border border-red-800 p-md text-sm font-semibold text-red-400">{error}</div>}
        {success && <div className="mb-lg rounded-lg bg-green-950 border border-green-800 p-md text-sm font-semibold text-green-400">{success}</div>}

        <div className="space-y-sm mb-lg">
          {[
            { value: 'running_late' as NotifyType, label: '⏰ Running late', desc: 'The viewing is delayed' },
            { value: 'moved' as NotifyType, label: '📋 Appointment moved', desc: 'The viewing time has changed' },
            { value: 'custom' as NotifyType, label: '✏️ Custom message', desc: 'Write your own' },
          ].map((o) => (
            <button
              key={o.value}
              onClick={() => setType(o.value)}
              className={`w-full px-md py-sm rounded-lg text-left border transition ${
                type === o.value ? 'bg-blue-900 border-blue-600' : 'border-neutral-700 hover:border-neutral-500'
              }`}
            >
              <div className="font-semibold text-white">{o.label}</div>
              <div className="text-xs text-neutral-400">{o.desc}</div>
            </button>
          ))}
        </div>

        {type !== 'custom' && (
          <div className="mb-lg">
            <label className="block text-sm font-semibold text-white mb-sm">
              {type === 'running_late' ? 'New expected time' : 'New time'} <span className="text-neutral-500 font-normal">(optional)</span>
            </label>
            <input
              type="time"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              className="w-full min-w-0 rounded-lg border border-neutral-700 bg-neutral-900 px-md py-sm text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        {type === 'custom' && (
          <div className="mb-lg space-y-md">
            <div>
              <label className="block text-sm font-semibold text-white mb-sm">Subject</label>
              <input
                type="text"
                value={customSubject}
                onChange={(e) => setCustomSubject(e.target.value)}
                placeholder="e.g. Update on a viewing at your home"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-md py-sm text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-white mb-sm">Message</label>
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                rows={3}
                placeholder="Keep it general — please don't name the room."
                className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-md py-sm text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        {type !== 'custom' && (
          <div className="mb-lg rounded-lg bg-neutral-950 border border-neutral-800 p-md">
            <p className="text-xs text-neutral-500 mb-sm">Tenants will see:</p>
            <p className="text-sm font-semibold text-white">{preview.subject}</p>
            <p className="text-sm text-neutral-300 mt-xs">{preview.message}</p>
          </div>
        )}

        <div className="flex gap-md">
          <button onClick={onClose} disabled={sending} className="flex-1 rounded-lg border border-neutral-700 px-lg py-md text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50">Cancel</button>
          <button onClick={send} disabled={sending} className="flex-1 rounded-lg bg-blue-600 px-lg py-md text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {sending ? 'Sending…' : '📤 Notify tenants'}
          </button>
        </div>
      </div>
    </div>
  )
}
