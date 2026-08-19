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

type RecipientType = 'all_tenants' | 'room' | 'individual' | 'cleaners' | 'contractors'

export default function QuickNotifyModal({ propertyId, onClose, onSuccess }: QuickNotifyModalProps) {
  const [activeTab, setActiveTab] = useState<'templates' | 'custom' | 'ai'>('templates')
  const [templates, setTemplates] = useState<Template[]>([])
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

    setSending(true)
    setError(null)

    try {
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

      setSuccess('Notification sent successfully!')
      setTimeout(() => {
        onSuccess?.()
        onClose()
      }, 2000)
    } catch (err) {
      setError('Failed to send notification. Please try again.')
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
      <div className="bg-neutral-950 rounded-xl shadow-lg p-lg max-w-2xl w-full border border-neutral-700 max-h-[90vh] overflow-y-auto z-[1001]">
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

        {/* Recipient Selection */}
        <div className="mb-lg pb-lg border-b border-neutral-700">
          <label className="text-sm font-semibold text-white mb-md block">Send to:</label>
          <div className="grid grid-cols-2 gap-md">
            {[
              { value: 'all_tenants' as RecipientType, label: 'All Tenants' },
              { value: 'room' as RecipientType, label: 'Specific Room' },
              { value: 'individual' as RecipientType, label: 'Individual Tenant' },
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
                    {templates.map(template => (
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
                        className="w-full px-md py-sm border border-neutral-700 bg-neutral-800 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
