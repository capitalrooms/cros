'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

interface QuickNotifyModalProps {
  propertyId: string
  onClose: () => void
  onSuccess?: () => void
}

interface Template {
  id: string
  name: string
  template_text: string
  subject_line: string
  category: string
}

interface Viewing {
  id: string
  room_id: string
  room_name: string
  viewing_date: string
  viewing_slot: string
  visitor_name: string
  visitor_email: string
}

type RecipientType = 'all_tenants' | 'room' | 'individual' | 'cleaners' | 'contractors'
type NotificationCategory = 'general' | 'lettings' | 'maintenance' | 'compliance'
type ViewingSelector = 'single' | 'running_late' | 'time_shift' | 'period_notice' | 'multiple_batch'

export default function QuickNotifyModal({ propertyId, onClose, onSuccess }: QuickNotifyModalProps) {
  const [activeTab, setActiveTab] = useState<'templates' | 'custom' | 'ai'>('templates')
  const [notificationCategory, setNotificationCategory] = useState<NotificationCategory>('general')
  const [templates, setTemplates] = useState<Template[]>([])
  const [viewings, setViewings] = useState<Viewing[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Form state
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [customSubject, setCustomSubject] = useState('')
  const [customMessage, setCustomMessage] = useState('')
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiDraftMessage, setAiDraftMessage] = useState('')
  const [recipientType, setRecipientType] = useState<RecipientType>('all_tenants')
  const [roomId, setRoomId] = useState('')
  const [personId, setPersonId] = useState('')

  // Lettings-specific state
  const [viewingSelector, setViewingSelector] = useState<ViewingSelector>('single')
  const [selectedViewing, setSelectedViewing] = useState<Viewing | null>(null)
  const [newArrivalTime, setNewArrivalTime] = useState('')
  const [timeShiftMinutes, setTimeShiftMinutes] = useState(15)
  const [viewingPeriodStart, setViewingPeriodStart] = useState('')
  const [viewingPeriodEnd, setViewingPeriodEnd] = useState('')

  const supabase = createClient()

  // Load templates on mount
  const loadTemplates = async () => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('notification_templates')
      .select('*')
      .order('category')

    if (!err && data) {
      setTemplates(data)
    }
    setLoading(false)
  }

  // Load viewings for this property
  const loadViewings = async () => {
    const { data, error: err } = await supabase
      .from('viewings')
      .select('id, room_id, viewing_date, viewing_slot, visitor_name, visitor_email, rooms(name)')
      .eq('property_id', propertyId)
      .gte('viewing_date', new Date().toISOString().split('T')[0])
      .order('viewing_date', { ascending: true })

    if (!err && data) {
      setViewings(data.map(v => ({
        id: v.id,
        room_id: v.room_id,
        room_name: (v.rooms as any)?.name || 'Unknown Room',
        viewing_date: v.viewing_date,
        viewing_slot: v.viewing_slot,
        visitor_name: v.visitor_name,
        visitor_email: v.visitor_email
      })))
    }
  }

  // Generate AI message
  const generateAIMessage = async () => {
    if (!aiPrompt.trim()) {
      setError('Please describe what you want to communicate')
      return
    }

    setSending(true)
    setError(null)

    try {
      const response = await fetch('/api/ai/compose-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiPrompt,
          property_id: propertyId,
          recipient_type: recipientType
        })
      })

      if (!response.ok) {
        throw new Error('Failed to generate message')
      }

      const { subject, message } = await response.json()
      setCustomSubject(subject)
      setAiDraftMessage(message)
      setSuccess('Message generated! Review and edit if needed, then send.')
    } catch (err) {
      setError('Failed to generate message. Please try again.')
      console.error(err)
    } finally {
      setSending(false)
    }
  }

  // Send notification
  const sendNotification = async () => {
    const subject = activeTab === 'templates' && selectedTemplate ? selectedTemplate.subject_line : customSubject
    const message = activeTab === 'ai' ? aiDraftMessage : customMessage

    if (!subject || !message) {
      setError('Please fill in subject and message')
      return
    }

    // Lettings-specific validation
    if (notificationCategory === 'lettings') {
      if (viewingSelector === 'single' && !selectedViewing) {
        setError('Please select a viewing')
        return
      }
      if (viewingSelector === 'running_late' && (!selectedViewing || !newArrivalTime)) {
        setError('Please select a viewing and new arrival time')
        return
      }
      if (viewingSelector === 'period_notice' && (!viewingPeriodStart || !viewingPeriodEnd)) {
        setError('Please specify the viewing period (from/to times)')
        return
      }
    }

    setSending(true)
    setError(null)

    try {
      // Handle lettings-specific workflows
      if (notificationCategory === 'lettings') {
        // Time shift: update viewing times in DB before sending
        if (viewingSelector === 'time_shift') {
          const shiftResponse = await fetch('/api/viewings/time-shift', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              property_id: propertyId,
              shift_minutes: timeShiftMinutes
            })
          })
          if (!shiftResponse.ok) {
            throw new Error('Failed to shift viewing times')
          }
        }

        // Send via lettings API
        const response = await fetch('/api/admin/quick-notify-lettings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            property_id: propertyId,
            subject,
            message,
            selector_type: viewingSelector,
            viewing_id: selectedViewing?.id || null,
            viewing_period_start: viewingPeriodStart || null,
            viewing_period_end: viewingPeriodEnd || null,
            new_arrival_time: newArrivalTime || null
          })
        })

        if (!response.ok) {
          throw new Error('Failed to send lettings notification')
        }
      } else {
        // Standard notification send
        const response = await fetch('/api/admin/quick-notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            property_id: propertyId,
            subject,
            message,
            recipient_type: recipientType,
            room_id: recipientType === 'room' ? roomId : null,
            person_id: recipientType === 'individual' ? personId : null
          })
        })

        if (!response.ok) {
          throw new Error('Failed to send notification')
        }
      }

      setSuccess('Notification sent successfully!')
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

  // Handle template selection
  const handleTemplateSelect = (template: Template) => {
    setSelectedTemplate(template)
    setCustomSubject(template.subject_line)
    setCustomMessage(template.template_text)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-lg">
      <div className="bg-neutral-900 rounded-xl shadow-lg p-lg max-w-2xl w-full border border-neutral-700 max-h-[90vh] overflow-y-auto z-[1001]">
        <div className="flex items-start justify-between mb-lg">
          <h3 className="text-lg font-semibold text-white">Quick Notify</h3>
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
            <p className="text-sm font-semibold text-green-400">✓ {success}</p>
          </div>
        )}

        {/* Notification Category */}
        <div className="mb-lg pb-lg border-b border-neutral-700">
          <label className="text-sm font-semibold text-white mb-md block">Notification Type:</label>
          <div className="grid grid-cols-2 gap-md">
            {[
              { value: 'general' as NotificationCategory, label: 'General' },
              { value: 'lettings' as NotificationCategory, label: '📅 Lettings' },
              { value: 'maintenance' as NotificationCategory, label: '🔧 Maintenance' },
              { value: 'compliance' as NotificationCategory, label: '✓ Compliance' }
            ].map(option => (
              <button
                key={option.value}
                onClick={() => {
                  setNotificationCategory(option.value)
                  if (option.value === 'lettings') {
                    loadViewings()
                  }
                }}
                className={`px-md py-sm rounded-lg font-semibold text-sm transition ${
                  notificationCategory === option.value
                    ? 'bg-blue-600 text-white'
                    : 'border border-neutral-700 text-neutral-300 hover:text-white'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lettings-Specific Options */}
        {notificationCategory === 'lettings' && (
          <div className="mb-lg pb-lg border-b border-neutral-700 space-y-md">
            <div>
              <label className="text-sm font-semibold text-white mb-md block">What do you want to do?</label>
              <div className="grid grid-cols-1 gap-sm">
                {[
                  { value: 'single' as ViewingSelector, label: '📍 Single Viewing', desc: 'Notify about one viewing' },
                  { value: 'running_late' as ViewingSelector, label: '⏰ Running Late', desc: 'Tell tenants you\'re delayed' },
                  { value: 'time_shift' as ViewingSelector, label: '↻ Time Shift All', desc: 'Push all viewings back' },
                  { value: 'period_notice' as ViewingSelector, label: '📋 Viewing Period', desc: 'Non-specific time window' },
                  { value: 'multiple_batch' as ViewingSelector, label: '📊 Multiple Viewings', desc: 'Batch notification' }
                ].map(option => (
                  <button
                    key={option.value}
                    onClick={() => setViewingSelector(option.value)}
                    className={`px-md py-sm rounded-lg text-left font-semibold text-sm transition border ${
                      viewingSelector === option.value
                        ? 'bg-blue-900 border-blue-600'
                        : 'border-neutral-700 text-neutral-300 hover:text-white'
                    }`}
                  >
                    <div className="font-semibold">{option.label}</div>
                    <div className="text-xs text-neutral-400">{option.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Single Viewing Selector */}
            {viewingSelector === 'single' && (
              <div>
                <label className="text-sm font-semibold text-white mb-sm block">Select Viewing:</label>
                <select
                  value={selectedViewing?.id || ''}
                  onChange={(e) => {
                    const v = viewings.find(v => v.id === e.target.value)
                    setSelectedViewing(v || null)
                  }}
                  className="w-full px-md py-sm border border-neutral-700 bg-neutral-900 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Choose a viewing...</option>
                  {viewings.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.room_name} • {v.viewing_date} @ {v.viewing_slot} • {v.visitor_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Running Late */}
            {viewingSelector === 'running_late' && (
              <div className="space-y-md">
                <div>
                  <label className="text-sm font-semibold text-white mb-sm block">Which viewing are you late for?</label>
                  <select
                    value={selectedViewing?.id || ''}
                    onChange={(e) => {
                      const v = viewings.find(v => v.id === e.target.value)
                      setSelectedViewing(v || null)
                    }}
                    className="w-full px-md py-sm border border-neutral-700 bg-neutral-900 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Choose a viewing...</option>
                    {viewings.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.room_name} • {v.viewing_date} @ {v.viewing_slot}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-semibold text-white mb-sm block">New arrival time:</label>
                  <input
                    type="time"
                    value={newArrivalTime}
                    onChange={(e) => setNewArrivalTime(e.target.value)}
                    className="w-full px-md py-sm border border-neutral-700 bg-neutral-900 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            {/* Time Shift All */}
            {viewingSelector === 'time_shift' && (
              <div>
                <label className="text-sm font-semibold text-white mb-sm block">Shift all viewings by:</label>
                <div className="grid grid-cols-4 gap-sm">
                  {[15, 30, 60].map(mins => (
                    <button
                      key={mins}
                      onClick={() => setTimeShiftMinutes(mins)}
                      className={`px-md py-sm rounded-lg font-semibold text-sm transition border ${
                        timeShiftMinutes === mins
                          ? 'bg-blue-600 border-blue-600'
                          : 'border-neutral-700 text-neutral-300 hover:text-white'
                      }`}
                    >
                      +{mins}m
                    </button>
                  ))}
                </div>
                <p className="text-xs text-neutral-400 mt-sm">All viewing times will be updated in the database</p>
              </div>
            )}

            {/* Viewing Period */}
            {viewingSelector === 'period_notice' && (
              <div className="space-y-md">
                <div className="grid grid-cols-2 gap-md">
                  <div>
                    <label className="text-sm font-semibold text-white mb-sm block">From:</label>
                    <input
                      type="time"
                      value={viewingPeriodStart}
                      onChange={(e) => setViewingPeriodStart(e.target.value)}
                      className="w-full px-md py-sm border border-neutral-700 bg-neutral-900 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-white mb-sm block">To:</label>
                    <input
                      type="time"
                      value={viewingPeriodEnd}
                      onChange={(e) => setViewingPeriodEnd(e.target.value)}
                      className="w-full px-md py-sm border border-neutral-700 bg-neutral-900 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Multiple Batch */}
            {viewingSelector === 'multiple_batch' && (
              <div>
                <p className="text-sm text-neutral-300 mb-md">
                  Will send "Multiple Viewings - Time Frame" template to all tenants for this property.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Recipient Selection (Non-Lettings) */}
        {notificationCategory !== 'lettings' && (
          <div className="mb-lg pb-lg border-b border-neutral-700">
            <label className="text-sm font-semibold text-white mb-md block">Send to:</label>
            <div className="grid grid-cols-2 gap-md">
              {[
                { value: 'all_tenants' as RecipientType, label: 'All Tenants' },
                { value: 'room' as RecipientType, label: 'Specific Unit' },
                { value: 'cleaners' as RecipientType, label: 'Cleaners' }
              ].map(option => (
                <button
                  key={option.value}
                  onClick={() => setRecipientType(option.value)}
                  className={`px-md py-sm rounded-lg font-semibold text-sm transition ${
                    recipientType === option.value
                      ? 'bg-blue-600 text-white'
                      : 'border border-neutral-700 text-neutral-300 hover:text-white'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex gap-md mb-lg border-b border-neutral-700">
          {[
            { id: 'templates' as const, label: '📋 Templates' },
            { id: 'custom' as const, label: '✏️ Compose' },
            { id: 'ai' as const, label: '🤖 AI Draft' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-lg py-md font-semibold text-sm transition ${
                activeTab === tab.id
                  ? 'text-white border-b-2 border-blue-600'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="space-y-lg">
          {/* Templates Tab */}
          {activeTab === 'templates' && (
            <div className="space-y-md">
              {loading ? (
                <p className="text-sm text-neutral-400">Loading templates...</p>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-md max-h-[300px] overflow-y-auto">
                    {templates
                      .filter(t => {
                        if (notificationCategory === 'lettings') {
                          return t.category === 'lettings'
                        }
                        return t.category !== 'lettings'
                      })
                      .map(template => (
                        <button
                          key={template.id}
                          onClick={() => handleTemplateSelect(template)}
                          className={`p-md rounded-lg text-left transition border ${
                            selectedTemplate?.id === template.id
                              ? 'bg-blue-900 border-blue-600'
                              : 'bg-neutral-900 border-neutral-700 hover:border-neutral-600'
                          }`}
                        >
                          <p className="font-semibold text-white text-sm">{template.name}</p>
                          <p className="text-xs text-neutral-400 mt-xs">{template.category}</p>
                        </button>
                      ))}
                  </div>
                  {selectedTemplate && (
                    <div className="bg-neutral-900 p-lg rounded-lg border border-neutral-700">
                      <p className="text-sm font-semibold text-white mb-md">Preview:</p>
                      <p className="text-xs text-neutral-400">{selectedTemplate.template_text}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Custom Compose Tab */}
          {activeTab === 'custom' && (
            <div className="space-y-md">
              <div>
                <label className="text-sm font-semibold text-white mb-sm block">Subject</label>
                <input
                  type="text"
                  value={customSubject}
                  onChange={(e) => setCustomSubject(e.target.value)}
                  placeholder="Subject line"
                  className="w-full px-md py-sm border border-neutral-700 bg-neutral-900 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-white mb-sm block">Message</label>
                <textarea
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder="Write your message..."
                  rows={6}
                  className="w-full px-md py-sm border border-neutral-700 bg-neutral-900 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {/* AI Draft Tab */}
          {activeTab === 'ai' && (
            <div className="space-y-md">
              <div>
                <label className="text-sm font-semibold text-white mb-sm block">Describe what to communicate</label>
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="E.g., 'Tell tenants about gas safety inspection next Friday at 2pm'"
                  rows={3}
                  className="w-full px-md py-sm border border-neutral-700 bg-neutral-900 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={generateAIMessage}
                  disabled={sending}
                  className="mt-md w-full px-lg py-md bg-purple-600 text-white rounded-lg font-semibold text-sm hover:bg-purple-700 disabled:opacity-50 transition"
                >
                  {sending ? 'Generating...' : '✨ Generate Message'}
                </button>
              </div>
              {aiDraftMessage && (
                <div className="bg-neutral-900 p-lg rounded-lg border border-neutral-700">
                  <p className="text-sm font-semibold text-white mb-md">Generated Message:</p>
                  <div className="space-y-md">
                    <div>
                      <p className="text-xs text-neutral-400 mb-sm">Subject:</p>
                      <p className="text-sm text-white">{customSubject}</p>
                    </div>
                    <div>
                      <p className="text-xs text-neutral-400 mb-sm">Message:</p>
                      <textarea
                        value={aiDraftMessage}
                        onChange={(e) => setAiDraftMessage(e.target.value)}
                        className="w-full px-md py-sm border border-neutral-700 bg-neutral-900 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-neutral-500"
                        rows={4}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-md mt-lg pt-lg border-t border-neutral-700">
          <button
            onClick={onClose}
            className="flex-1 px-lg py-md border border-neutral-700 text-white rounded-lg font-semibold text-sm hover:bg-neutral-900 transition"
          >
            Cancel
          </button>
          <button
            onClick={sendNotification}
            disabled={sending}
            className="flex-1 px-lg py-md bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {sending ? 'Sending...' : '📤 Send Notification'}
          </button>
        </div>
      </div>
    </div>
  )
}
