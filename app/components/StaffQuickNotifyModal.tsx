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
  const [channels, setChannels] = useState<'push_email' | 'push_only' | 'email_only'>('push_email')
  const [sentReceipt, setSentReceipt] = useState<{ count: number; channels: string; sentAt: string } | null>(null)

  const supabase = createClient()

  // Role-specific context that adapts all language
  const getRoleConfig = () => {
    switch (role) {
      case 'contractor':
        return {
          title: 'Message the tenants',
          subtitle: 'Let tenants know about your repair visit',
          visitType: 'repair',
          visitArticle: 'your repair',
          endpoint: '/api/cleaner/quick-notify', // Reuse same endpoint, just different notification_type
          notificationType: 'contractor',
          options: [
            {
              value: 'running_late' as NotificationType,
              label: 'Running late',
              desc: 'Tell tenants you\'re delayed'
            },
            {
              value: 'complication' as NotificationType,
              label: 'Found a complication',
              desc: 'Found an issue you\'re working through'
            },
            {
              value: 'almost_done' as NotificationType,
              label: 'Almost done',
              desc: 'Let them know you\'re finishing up'
            },
            {
              value: 'custom' as NotificationType,
              label: 'Write my own message',
              desc: 'Anything else they should know'
            }
          ]
        }
      case 'cleaner':
        return {
          title: 'Message the tenants',
          subtitle: 'Let tenants know about your clean',
          visitType: 'clean',
          visitArticle: 'your clean',
          endpoint: '/api/cleaner/quick-notify',
          notificationType: 'cleaner',
          options: [
            {
              value: 'running_late' as NotificationType,
              label: 'Running late',
              desc: 'Tell tenants you\'re delayed'
            },
            {
              value: 'issue_found' as NotificationType,
              label: 'Found an issue',
              desc: 'Notify about a maintenance problem discovered'
            },
            {
              value: 'schedule_change' as NotificationType,
              label: 'Change of day',
              desc: 'Announce a reschedule'
            },
            {
              value: 'custom' as NotificationType,
              label: 'Write my own message',
              desc: 'Anything else they should know'
            }
          ]
        }
      case 'lettings':
        return {
          title: 'Message the applicants',
          subtitle: 'Let applicants know about their viewing',
          visitType: 'viewing',
          visitArticle: 'your viewing',
          endpoint: '/api/cleaner/quick-notify', // Reuse same endpoint
          notificationType: 'lettings',
          options: [
            {
              value: 'running_late' as NotificationType,
              label: 'Running late',
              desc: 'Tell applicant you\'re delayed'
            },
            {
              value: 'time_shift' as NotificationType,
              label: 'Change of time',
              desc: 'Adjust the viewing time'
            },
            {
              value: 'custom' as NotificationType,
              label: 'Write my own message',
              desc: 'Anything else they should know'
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
          subject: `Running late — ${propertyName}`,
          message: `Hi, we're ${delayMsg}. We'll be with you shortly. Thank you for your patience.`
        }

      case 'complication': // Contractor only
        return {
          subject: `Update — ${propertyName}`,
          message: `We've found a complication during the repair and are working to resolve it. We'll have an update for you shortly.`
        }

      case 'almost_done': // Contractor only
        return {
          subject: `Nearly done — ${propertyName}`,
          message: `We're almost finished with your repair and should be done shortly.`
        }

      case 'issue_found': // Cleaner only
        return {
          subject: `Found an issue — ${propertyName}`,
          message: `We've discovered a maintenance issue during the clean. A specialist will contact you about this shortly.`
        }

      case 'schedule_change': // Cleaner only
        return {
          subject: `Change of day — ${propertyName}`,
          message: `Due to scheduling changes, your clean may need to be rescheduled. We'll confirm the new time with you shortly.`
        }

      case 'time_shift': // Lettings only
        return {
          subject: `Viewing time change — ${propertyName}`,
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
          notification_type: config.notificationType,
          channels,
        })
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || 'Failed to send notification')
      }

      const result = await response.json()
      const channelLabel = channels === 'push_email' ? 'push + email' : channels === 'push_only' ? 'push notification' : 'email'
      setSentReceipt({
        count: result.recipientCount ?? result.tenant_count ?? 0,
        channels: channelLabel,
        sentAt: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      })
      onSuccess?.()
    } catch (err) {
      setError((err as Error).message || 'Failed to send notification. Please try again.')
      console.error(err)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[1000] p-sm sm:p-lg">
      <div className="bg-[#EEF2EC] rounded-[24px] shadow-lg p-lg max-w-2xl w-full max-h-[85dvh] sm:max-h-[90dvh] overflow-y-auto">
        <div className="flex items-start justify-between mb-lg">
          <div>
            <h3 className="text-lg font-extrabold text-[#14261F]">{config.title}</h3>
            <p className="text-sm text-[#4E6158] mt-xs">{propertyName}</p>
            <p className="text-xs text-[#4E6158] mt-xs">{config.subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="text-2xl text-[#4E6158] hover:text-[#14261F]"
          >
            ×
          </button>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="p-lg rounded-lg bg-[#FCE9E6] border border-[#F3C2B8] mb-lg">
            <p className="text-sm font-semibold text-[#8E2318]">{error}</p>
          </div>
        )}
        {success && (
          <div className="p-lg rounded-lg bg-green-50 border border-green-200 mb-lg">
            <p className="text-sm font-semibold text-green-800">{success}</p>
          </div>
        )}

        {/* Notification Type Selection */}
        <div className="mb-lg pb-lg border-b border-[#DCE5DD]">
          <label className="text-sm font-semibold text-[#14261F] mb-md block">What's happening?</label>
          <div className="space-y-sm">
            {config.options.map(option => (
              <button
                key={option.value}
                onClick={() => setNotificationType(option.value)}
                className={`w-full px-md py-sm rounded-lg text-left transition border ${
                  notificationType === option.value
                    ? 'bg-white border-[#17332B] ring-2 ring-[color:var(--cr-gold)]'
                    : 'bg-white border-[#DCE5DD] text-[#4E6158]'
                }`}
              >
                <div className="font-semibold text-[#14261F]">{option.label}</div>
                <div className="text-xs text-[#4E6158]">{option.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Late Minutes Slider (for running_late) */}
        {notificationType === 'running_late' && (
          <div className="mb-lg pb-lg border-b border-[#DCE5DD]">
            <label className="text-sm font-semibold text-[#14261F] mb-md block">How many minutes late?</label>
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
              <div className="text-lg font-bold text-[#17332B] min-w-[60px]">{lateMinutes}m</div>
            </div>
          </div>
        )}

        {/* Time Shift Slider (for lettings time_shift) */}
        {notificationType === 'time_shift' && role === 'lettings' && (
          <div className="mb-lg pb-lg border-b border-[#DCE5DD]">
            <label className="text-sm font-semibold text-[#14261F] mb-md block">
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
              <div className="text-lg font-bold text-[#17332B] min-w-[60px]">
                {lateMinutes > 0 ? '+' : ''}{lateMinutes}m
              </div>
            </div>
          </div>
        )}

        {/* Custom Message Fields */}
        {notificationType === 'custom' && (
          <div className="mb-lg pb-lg border-b border-[#DCE5DD] space-y-md">
            <div>
              <label className="text-sm font-semibold text-[#14261F] mb-sm block">Subject:</label>
              <input
                type="text"
                value={customSubject}
                onChange={(e) => setCustomSubject(e.target.value)}
                placeholder={`e.g., Update on your ${config.visitType}`}
                className="w-full px-md py-sm border border-[#DCE5DD] bg-white text-[#14261F] rounded-lg text-[16px] focus:outline-none focus:ring-2 focus:ring-[color:var(--cr-gold)]"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-[#14261F] mb-sm block">Message:</label>
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Write your message here..."
                rows={4}
                className="w-full px-md py-sm border border-[#DCE5DD] bg-white text-[#14261F] rounded-lg text-[16px] focus:outline-none focus:ring-2 focus:ring-[color:var(--cr-gold)]"
              />
            </div>
          </div>
        )}

        {/* Preview */}
        {notificationType !== 'custom' && (
          <div className="mb-lg pb-lg border-b border-[#DCE5DD] bg-white p-md rounded-lg">
            <p className="text-xs text-[#4E6158] mb-sm">Preview:</p>
            <div className="space-y-sm">
              <p className="text-sm font-semibold text-[#14261F]">{getDefaultMessage(notificationType).subject}</p>
              <p className="text-sm text-[#4E6158]">{getDefaultMessage(notificationType).message}</p>
            </div>
          </div>
        )}

        {/* Sent receipt */}
        {sentReceipt && (
          <div className="mt-lg p-lg rounded-xl bg-green-50 border border-green-200 space-y-sm">
            <p className="text-sm font-bold text-green-800">✓ Sent at {sentReceipt.sentAt}</p>
            <p className="text-sm text-green-900">Reached <strong>{sentReceipt.count}</strong> {sentReceipt.count === 1 ? 'person' : 'people'} via <strong>{sentReceipt.channels}</strong></p>
            <button onClick={onClose} className="mt-sm w-full px-md py-sm bg-[#17332B] text-white rounded-full text-sm font-semibold transition">Close</button>
          </div>
        )}

        {/* Channel picker */}
        {!sentReceipt && (
          <div className="mb-lg pb-lg border-b border-[#DCE5DD]">
            <label className="text-sm font-semibold text-[#14261F] mb-sm block">How to deliver:</label>
            <div className="grid grid-cols-3 gap-sm">
              {([
                { value: 'push_email', label: 'App + email' },
                { value: 'push_only', label: 'App only' },
                { value: 'email_only', label: 'Email only' },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setChannels(opt.value)}
                  className={`px-sm py-sm rounded-lg font-semibold text-xs transition border ${
                    channels === opt.value
                      ? 'bg-[#17332B] border-[#17332B] text-white'
                      : 'bg-white border-[#DCE5DD] text-[#4E6158]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {!sentReceipt && (
          <div className="flex gap-md">
            <button
              onClick={onClose}
              className="flex-1 px-lg py-md border border-[#DCE5DD] bg-white text-[#14261F] rounded-full font-semibold transition"
            >
              Cancel
            </button>
            <button
              onClick={sendNotification}
              disabled={sending}
              className="flex-1 px-lg py-md bg-[#17332B] text-white rounded-full font-bold transition disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
