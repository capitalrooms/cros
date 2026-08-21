'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

interface CleanerQuickNotifyModalProps {
  propertyId: string
  propertyName: string
  onClose: () => void
  onSuccess?: () => void
}

interface Template {
  id: string
  name: string
  template_text: string
  subject_line: string
}

type NotificationType = 'running_late' | 'issue_found' | 'delay_notice' | 'custom'

export default function CleanerQuickNotifyModal({
  propertyId,
  propertyName,
  onClose,
  onSuccess
}: CleanerQuickNotifyModalProps) {
  const [notificationType, setNotificationType] = useState<NotificationType>('running_late')
  const [customSubject, setCustomSubject] = useState('')
  const [customMessage, setCustomMessage] = useState('')
  const [lateMinutes, setLateMinutes] = useState(15)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const supabase = createClient()

  // Get default message for notification type
  const getDefaultMessage = (type: NotificationType): { subject: string; message: string } => {
    const delayMsg = `Running ${lateMinutes} minutes behind schedule.`
    switch (type) {
      case 'running_late':
        return {
          subject: `Late Update - ${propertyName}`,
          message: `Hi there, we're ${delayMsg} We'll be with you as soon as possible. Thank you for your patience!`
        }
      case 'issue_found':
        return {
          subject: `Maintenance Issue - ${propertyName}`,
          message: "We've found an issue during the clean and are working on it. We'll update you shortly."
        }
      case 'delay_notice':
        return {
          subject: `Rescheduling Notice - ${propertyName}`,
          message: "Due to scheduling changes, your clean may need to be rescheduled. We'll confirm with you shortly."
        }
      case 'custom':
        return {
          subject: customSubject,
          message: customMessage
        }
    }
  }

  const sendNotification = async () => {
    const { subject, message } = getDefaultMessage(notificationType)

    if (!subject || !message) {
      setError('Please fill in subject and message')
      return
    }

    setSending(true)
    setError(null)

    try {
      const response = await fetch('/api/cleaner/quick-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: propertyId,
          subject,
          message,
          notification_type: notificationType
        })
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || 'Failed to send notification')
      }

      setSuccess('✓ Notification sent to all tenants!')
      setTimeout(() => {
        onSuccess?.()
        onClose()
      }, 2000)
    } catch (err) {
      setError((err as Error).message || 'Failed to send notification. Please try again.')
      console.error(err)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-sm sm:p-lg">
      <div className="bg-neutral-950 rounded-xl shadow-lg p-lg max-w-2xl w-full border border-neutral-700 max-h-[85vh] sm:max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-lg">
          <div>
            <h3 className="text-lg font-semibold text-white">Quick Notify Tenants</h3>
            <p className="text-sm text-neutral-400 mt-sm">{propertyName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-2xl text-neutral-400 hover:text-white"
          >
            ×
          </button>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="p-lg rounded-lg bg-red-950 border border-red-800 mb-lg">
            <p className="text-sm font-semibold text-red-400">{error}</p>
          </div>
        )}
        {success && (
          <div className="p-lg rounded-lg bg-green-950 border border-green-800 mb-lg">
            <p className="text-sm font-semibold text-green-400">{success}</p>
          </div>
        )}

        {/* Notification Type Selection */}
        <div className="mb-lg pb-lg border-b border-neutral-700">
          <label className="text-sm font-semibold text-white mb-md block">What's the situation?</label>
          <div className="grid grid-cols-1 gap-sm space-y-sm">
            {[
              { value: 'running_late' as NotificationType, label: '⏰ Running Late', desc: 'Tell tenants you\'re delayed' },
              { value: 'issue_found' as NotificationType, label: '⚠️ Issue Found', desc: 'Notify about a maintenance problem' },
              { value: 'delay_notice' as NotificationType, label: '📋 Schedule Change', desc: 'Announce a reschedule' },
              { value: 'custom' as NotificationType, label: '✏️ Custom Message', desc: 'Write your own message' }
            ].map(option => (
              <button
                key={option.value}
                onClick={() => setNotificationType(option.value)}
                className={`px-md py-sm rounded-lg text-left transition border ${
                  notificationType === option.value
                    ? 'bg-blue-900 border-blue-600'
                    : 'border-neutral-700 text-neutral-300 hover:text-white'
                }`}
              >
                <div className="font-semibold text-white">{option.label}</div>
                <div className="text-xs text-neutral-400">{option.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Late Minutes Slider */}
        {notificationType === 'running_late' && (
          <div className="mb-lg pb-lg border-b border-neutral-700">
            <label className="text-sm font-semibold text-white mb-md block">How many minutes late?</label>
            <div className="flex items-center gap-md">
              <input
                type="range"
                min="5"
                max="120"
                step="5"
                value={lateMinutes}
                onChange={(e) => setLateMinutes(parseInt(e.target.value))}
                className="flex-1"
              />
              <div className="text-lg font-bold text-blue-400 min-w-[60px]">{lateMinutes}m</div>
            </div>
          </div>
        )}

        {/* Custom Message Fields */}
        {notificationType === 'custom' && (
          <div className="mb-lg pb-lg border-b border-neutral-700 space-y-md">
            <div>
              <label className="text-sm font-semibold text-white mb-sm block">Subject:</label>
              <input
                type="text"
                value={customSubject}
                onChange={(e) => setCustomSubject(e.target.value)}
                placeholder="e.g., Update on your clean"
                className="w-full px-md py-sm border border-neutral-700 bg-neutral-900 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-white mb-sm block">Message:</label>
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Write your message here..."
                rows={4}
                className="w-full px-md py-sm border border-neutral-700 bg-neutral-900 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        {/* Preview */}
        {notificationType !== 'custom' && (
          <div className="mb-lg pb-lg border-b border-neutral-700 bg-neutral-900 p-md rounded-lg">
            <p className="text-xs text-neutral-400 mb-sm">Preview:</p>
            <div className="space-y-sm">
              <p className="text-sm font-semibold text-white">{getDefaultMessage(notificationType).subject}</p>
              <p className="text-sm text-neutral-300">{getDefaultMessage(notificationType).message}</p>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-md">
          <button
            onClick={onClose}
            className="flex-1 px-lg py-md border border-neutral-700 text-white rounded-lg font-semibold hover:bg-neutral-900 transition"
          >
            Cancel
          </button>
          <button
            onClick={sendNotification}
            disabled={sending}
            className="flex-1 px-lg py-md bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50"
          >
            {sending ? '⏳ Sending...' : '📤 Send Notification'}
          </button>
        </div>
      </div>
    </div>
  )
}
