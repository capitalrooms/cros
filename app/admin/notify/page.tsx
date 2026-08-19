'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppBar from '@/components/AppBar'

export default function QuickNotifyPage() {
  const router = useRouter()
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const [selectedTargets, setSelectedTargets] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [title, setTitle] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [aiRewriteVisible, setAiRewriteVisible] = useState(false)
  const [aiRewrittenText, setAiRewrittenText] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  const targets = [
    { id: 'all_tenants', label: 'All Tenants', icon: '👥' },
    { id: 'all_contractors', label: 'All Contractors', icon: '🔧' },
    { id: 'all_properties', label: 'All Properties (Landlords)', icon: '🏢' },
    { id: 'specific_property', label: 'Specific Property', icon: '🏘️' },
  ]

  const toggleTarget = (id: string) => {
    setSelectedTargets(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    )
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        await processAudio(audioBlob)
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
      setRecordingTime(0)

      const timer = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 120) {
            clearInterval(timer)
            mediaRecorder.stop()
            return prev
          }
          return prev + 1
        })
      }, 1000)
    } catch (error) {
      console.error('Error accessing microphone:', error)
      alert('Please allow microphone access to use audio recording')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const processAudio = async (audioBlob: Blob) => {
    setIsProcessing(true)
    try {
      // Simulate transcription and AI rewriting
      // In production, this would call your backend API with the audio
      await new Promise(resolve => setTimeout(resolve, 2000))

      const mockTranscription = 'There is a scheduled maintenance on Tuesday at 2pm. Please make sure someone is home.'
      const aiRewritten = 'Scheduled maintenance: Tuesday at 2:00 PM. Please ensure property access is available.'

      setMessage(mockTranscription)
      setAiRewrittenText(aiRewritten)
      setAiRewriteVisible(true)
    } catch (error) {
      console.error('Error processing audio:', error)
      alert('Failed to process audio recording')
    } finally {
      setIsProcessing(false)
    }
  }

  const acceptAiRewrite = () => {
    setMessage(aiRewrittenText)
    setAiRewriteVisible(false)
    setTitle('Message from Audio')
  }

  const handleSend = async () => {
    if (!title.trim() || !message.trim() || selectedTargets.length === 0) {
      alert('Please fill in all fields and select at least one recipient group')
      return
    }

    setSending(true)
    try {
      // Simulate sending notification
      await new Promise(resolve => setTimeout(resolve, 1000))
      setSent(true)
      setTimeout(() => {
        router.push('/admin')
      }, 2000)
    } catch (error) {
      console.error('Error sending notification:', error)
      alert('Failed to send notification')
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar
          right={
            <Link href="/admin" className="shrink-0 hover:opacity-80">
              ← Dashboard
            </Link>
          }
        />
        <main className="mx-auto max-w-2xl px-lg py-3xl">
          <div className="rounded-lg border border-neutral-200 bg-white p-3xl text-center">
            <div className="text-4xl mb-lg">✓</div>
            <h2 className="text-2xl font-bold text-neutral-900 mb-md">Notification Sent</h2>
            <p className="text-neutral-600">Your message has been delivered to all selected recipients</p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar
        right={
          <Link href="/admin" className="shrink-0 hover:opacity-80">
            ← Dashboard
          </Link>
        }
      />

      <main className="mx-auto max-w-2xl px-lg py-3xl">
        <div className="space-y-3xl">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 mb-md">Quick Notify</h1>
            <p className="text-sm text-neutral-600">Send a message instantly to properties, tenants, or contractors</p>
          </div>

          <div className="rounded-lg border border-neutral-200 bg-white p-lg space-y-lg">
            {/* Title */}
            <div>
              <label className="block text-sm font-semibold text-neutral-900 mb-md">
                Message Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Scheduled Maintenance"
                className="w-full px-md py-sm border border-neutral-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
              />
            </div>

            {/* Audio Recording Section */}
            <div className="border-t border-neutral-200 pt-lg">
              <label className="block text-sm font-semibold text-neutral-900 mb-md">
                🎤 Record Message (or type below)
              </label>
              <div className="flex gap-md mb-lg">
                {isRecording ? (
                  <>
                    <button
                      onClick={stopRecording}
                      className="flex-1 px-lg py-md bg-red-600 text-white font-semibold rounded-md hover:bg-red-700"
                    >
                      ⏹ Stop Recording ({recordingTime}s)
                    </button>
                  </>
                ) : (
                  <button
                    onClick={startRecording}
                    disabled={isProcessing}
                    className="flex-1 px-lg py-md bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isProcessing ? '⏳ Processing Audio...' : '🎙️ Start Recording'}
                  </button>
                )}
              </div>
            </div>

            {/* AI Rewrite Confirmation */}
            {aiRewriteVisible && (
              <div className="border-2 border-blue-200 bg-blue-50 rounded-lg p-lg">
                <div className="flex items-start justify-between mb-md">
                  <h3 className="font-semibold text-neutral-900">✨ AI-Rewritten Message</h3>
                  <span className="text-xs bg-blue-600 text-white px-md py-sm rounded-full">Suggested</span>
                </div>
                <div className="bg-white rounded p-md mb-md border border-blue-100">
                  <p className="text-sm text-neutral-900">{aiRewrittenText}</p>
                </div>
                <div className="flex gap-md">
                  <button
                    onClick={acceptAiRewrite}
                    className="flex-1 px-md py-sm bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 text-sm"
                  >
                    ✓ Accept
                  </button>
                  <button
                    onClick={() => setAiRewriteVisible(false)}
                    className="flex-1 px-md py-sm border border-neutral-200 text-neutral-900 font-semibold rounded-md hover:bg-neutral-50 text-sm"
                  >
                    ✎ Keep Original
                  </button>
                </div>
              </div>
            )}

            {/* Message */}
            <div>
              <label className="block text-sm font-semibold text-neutral-900 mb-md">
                Message {message ? `(${message.length} characters)` : ''}
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your message here or use audio recording above..."
                rows={6}
                className="w-full px-md py-sm border border-neutral-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
              />
            </div>

            {/* Recipients */}
            <div>
              <label className="block text-sm font-semibold text-neutral-900 mb-md">
                Send To
              </label>
              <div className="space-y-md">
                {targets.map((target) => (
                  <button
                    key={target.id}
                    onClick={() => toggleTarget(target.id)}
                    className={`w-full text-left p-md rounded-lg border-2 transition-all ${
                      selectedTargets.includes(target.id)
                        ? 'border-neutral-900 bg-neutral-50'
                        : 'border-neutral-200 bg-white hover:border-neutral-300'
                    }`}
                  >
                    <div className="flex items-center gap-md">
                      <input
                        type="checkbox"
                        checked={selectedTargets.includes(target.id)}
                        onChange={() => {}}
                        className="w-4 h-4"
                      />
                      <span className="text-lg">{target.icon}</span>
                      <span className="text-sm font-medium text-neutral-900">{target.label}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-md pt-lg border-t border-neutral-200">
              <button
                onClick={handleSend}
                disabled={sending}
                className="flex-1 px-lg py-md bg-neutral-900 text-white font-semibold rounded-md hover:bg-neutral-800 disabled:opacity-50"
              >
                {sending ? 'Sending...' : 'Send Notification'}
              </button>
              <Link
                href="/admin"
                className="flex-1 px-lg py-md border border-neutral-200 text-neutral-900 font-semibold rounded-md hover:bg-neutral-50 text-center"
              >
                Cancel
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
