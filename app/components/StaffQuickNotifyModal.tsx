'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

type StaffRole = 'contractor' | 'cleaner' | 'lettings'
type NotificationType = 'running_late' | 'issue_found' | 'complication' | 'time_shift' | 'almost_done' | 'schedule_change' | 'custom'

interface StaffQuickNotifyModalProps {
  role: StaffRole
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

/**
 * Universal Quick Notify modal for staff (contractor, cleaner, lettings).
 * Adapts language and options based on who is sending the message.
 *
 * Contractor: "Your repair is running late..."
 * Cleaner: "Your clean is running late..."
 * Lettings: "Your viewing is running late..."
 */
export default function StaffQuickNotifyModal({
  role,
  propertyId,
  propertyName,
  onClose,
  onSuccess
}: StaffQuickNotifyModalProps) {
  const [notificationType, setNotificationType] = useState<NotificationType>('running_late')
  const [customSubject, setCustomSubject] = useState('')
  const [customMessage, setCustomMessage] = useState('')
  const [lateMinutes, setLateMinutes] = useState(15)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const supabase = createClient()

  // Role-specific context that adapts all language
  const getRoleConfig = () => {
    switch (role) {
      case 'contractor':
        return {
          title: 'Quick Notify Tenants',
          subtitle: 'Let tenants know about your repair visit',
          visitType: 'repair',
          visitArticle: 'your repair',
          endpoint: '/api/cleaner/quick-notify', // Reuse same endpoint, just different notification_type
          notificationType: 'contractor',
          options: [
            {
              value: 'running_late' as NotificationType,
              label: '⏰ Running Late',
              desc: 'Tell tenants you\'re delayed'
            },
            {
              value: 'complication' as NotificationType,
              label: '⚠️ Complication Found',
              desc: 'Found an issue you\'re working through'
            },
            {
              value: 'almost_done' as NotificationType,
              label: '✅ Almost Done',
              desc: 'Let them know you\'re finishing up'
            },
            {
              value: 'custom' as NotificationType,
              label: '✏️ Custom Message',
              desc: 'Write your own message'
            }
          ]
        }
      case 'cleaner':
        return {
          title: 'Quick Notify Tenants',
          subtitle: 'Let tenants know about your clean',
          visitType: 'clean',
          visitArticle: 'your clean',
          endpoint: '/api/cleaner/quick-notify',
          notificationType: 'cleaner',
          options: [
            {
              value: 'running_late' as NotificationType,
              label: '⏰ Running Late',
              desc: 'Tell tenants you\'re delayed'
            },
            {
              value: 'issue_found' as NotificationType,
              label: '⚠️ Issue Found',
              desc: 'Notify about a maintenance problem discovered'
            },
            {
              value: 'schedule_change' as NotificationType,
              label: '📋 Schedule Change',
              desc: 'Announce a reschedule'
            },
            {
              value: 'custom' as NotificationType,
              label: '✏️ Custom Message',
              desc: 'Write your own message'
            }
          ]
        }
      case 'lettings':
        return {
          title: 'Quick Notify Applicants',
          subtitle: 'Let applicants know about their viewing',
          visitType: 'viewing',
          visitArticle: 'your viewing',
          endpoint: '/api/cleaner/quick-notify', // Reuse same endpoint
          notificationType: 'lettings',
          options: [
            {
              value: 'running_late' as NotificationType,
              label: '⏰ Running Late',
              desc: 'Tell applicant you\'re delayed'
            },
            {
              value: 'time_shift' as NotificationType,
              label: '⏱️ Time Change',
              desc: 'Adjust the viewing time'
            },
            {
              value: 'custom' as NotificationType,
              label: '✏️ Custom Message',
              desc: 'Write your own message'
            }
          ]
        }
      default:
        throw new Error(`Unknown role: ${role}`)
    }
  }

  const config = getRoleConfig()

  // Generate default message based on type and role
  const getDefaultMessage = (type: NotificationType): { subject: string; message: string } => {
    const delayMsg = `${lateMinutes} minutes behind schedule`

    switch (type) {
      case 'running_late':
        return {
          subject: `Running Late — ${propertyName}`,
          message: `Hi, we're ${delayMsg}. We'll be with you shortly. Thank you for your patience.`
        }

      case 'complication': // Contractor only
        return {
          subject: `Update — ${propertyName}`,
          message: `We've found a complication during the repair and are working to resolve it. We'll have an update for you shortly.`
        }

      case 'almost_done': // Contractor only
        return {
          subject: `Nearly Complete — ${propertyName}`,
          message: `We're almost finished with your repair and should be done shortly.`
        }

      case 'issue_found': // Cleaner only
        return {
          subject: `Issue Discovered — ${propertyName}`,
          message: `We've discovered a maintenance issue during the clean. A specialist will contact you about this shortly.`
        }

      case 'schedule_change': // Cleaner only
        return {
          subject: `Schedule Update — ${propertyName}`,
          message: `Due to scheduling changes, your clean may need to be rescheduled. We'll confirm the new time with you shortly.`
        }

      case 'time_shift': // Lettings only
        return {
          subject: `Viewing Time Update — ${propertyName}`,
          message: `The viewing time has been adjusted to ${lateMinutes} minutes ${lateMinutes > 0 ? 'later' : 'earlier'}. Please confirm your availability.`
        }

      case 'custom':
        return {
          subject: customSubject,
          message: customMessage
        }

      default:
        return { subject: '', message: '' }
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
      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: propertyId,
          subject,
          message,
          notification_type: config.notificationType
        })
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || 'Failed to send notification')
      }

      setSuccess('✓ Notification sent!')
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
      <div className="bg-neutral-900 rounded-xl shadow-lg p-lg max-w-2xl w-full border border-neutral-700 max-h-[85vh] sm:max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-lg">
          <div>
            <h3 className="text-lg font-semibold text-white">{config.title}</h3>
            <p className="text-sm text-neutral-400 mt-sm">{propertyName}</p>
            <p className="text-xs text-neutral-500 mt-xs">{config.subtitle}</p>
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
          <label className="text-sm font-semibold text-white mb-md block">What's happening?</label>
          <div className="space-y-sm">
            {config.options.map(option => (
              <button
                key={option.value}
                onClick={() => setNotificationType(option.value)}
                className={`w-full px-md py-sm rounded-lg text-left transition border ${
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

        {/* Late Minutes Slider (for running_late) */}
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

        {/* Time Shift Slider (for lettings time_shift) */}
        {notificationType === 'time_shift' && role === 'lettings' && (
          <div className="mb-lg pb-lg border-b border-neutral-700">
            <label className="text-sm font-semibold text-white mb-md block">
              Shift by how many minutes?
            </label>
            <div className="flex items-center gap-md">
              <input
                type="range"
                min="-120"
                max="120"
                step="5"
                value={lateMinutes}
                onChange={(e) => setLateMinutes(parseInt(e.target.value))}
                className="flex-1"
              />
              <div className="text-lg font-bold text-blue-400 min-w-[60px]">
                {lateMinutes > 0 ? '+' : ''}{lateMinutes}m
              </div>
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
                placeholder={`e.g., Update on your ${config.visitType}`}
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
            {sending ? '⏳ Sending...' : '📤 Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
