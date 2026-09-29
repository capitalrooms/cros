'use client'

import { useState, useEffect } from 'react'
import { parseVoiceCommand, executeCommands } from '@/lib/voice/parseCommand'
import type { ParsedCommand } from '@/lib/voice/types'

interface Props {
  onClose: () => void
  onComplete: () => void
}

export default function VoiceRecorder({ onClose, onComplete }: Props) {
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [commands, setCommands] = useState<ParsedCommand[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const SpeechRecognition = window.webkitSpeechRecognition || (window as any).SpeechRecognition
    if (!SpeechRecognition) {
      setError('Speech recognition not supported in this browser')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = true

    recognition.onstart = () => {
      setTranscript('')
      setError('')
      setCommands([])
      setShowConfirm(false)
    }

    recognition.onresult = (event) => {
      let interimText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          setTranscript((prev) => (prev ? prev + ' ' + text : text))
        } else {
          interimText += text
        }
      }
      if (interimText) setTranscript((prev) => prev + interimText)
    }

    recognition.onerror = (event) => {
      setError(`Error: ${event.error}`)
      setIsRecording(false)
    }

    recognition.onend = async () => {
      setIsRecording(false)
      if (transcript.trim()) {
        setIsLoading(true)
        const { commands: parsed, error: parseError } = await parseVoiceCommand(transcript, {})
        setIsLoading(false)
        if (parseError) {
          setError(parseError)
        } else {
          setCommands(parsed)
          setShowConfirm(true)
        }
      }
    }

    if (isRecording) {
      recognition.start()
    } else {
      recognition.abort()
    }

    return () => recognition.abort()
  }, [isRecording])

  const handleProceed = async () => {
    setIsLoading(true)
    const { executed, failed } = await executeCommands(commands)
    setIsLoading(false)

    if (failed.length === 0) {
      setTranscript('')
      setCommands([])
      setShowConfirm(false)
      onComplete()
      setTimeout(onClose, 500)
    } else {
      setError(`${executed} executed, ${failed.length} failed`)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end z-50">
      <div className="w-full bg-white rounded-t-3xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Voice Command</h2>
          <button onClick={onClose} className="text-2xl">×</button>
        </div>

        {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>}

        {!showConfirm && (
          <>
            <div className="flex flex-col items-center gap-4 py-6">
              <button
                onClick={() => setIsRecording(!isRecording)}
                className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl transition ${
                  isRecording ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'
                }`}
              >
                🎤
              </button>
              <p className="text-sm text-neutral-600">
                {isRecording ? 'Listening...' : isLoading ? 'Processing...' : 'Tap to start speaking'}
              </p>
            </div>

            {transcript && (
              <div className="bg-neutral-100 rounded-lg p-4">
                <p className="text-sm text-neutral-600">Transcript:</p>
                <p className="text-neutral-900 font-medium">{transcript}</p>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              {isRecording && (
                <button
                  onClick={() => setIsRecording(false)}
                  className="flex-1 bg-red-100 text-red-700 py-2 rounded-lg font-semibold text-sm"
                >
                  Stop Recording
                </button>
              )}
              <button
                onClick={onClose}
                className="flex-1 bg-neutral-200 text-neutral-900 py-2 rounded-lg font-semibold text-sm"
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {showConfirm && commands.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm text-neutral-600">Parsed commands:</p>
            {commands.map((cmd, i) => (
              <div key={i} className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded">
                <p className="font-semibold text-blue-900">{cmd.summary}</p>
                {cmd.warnings && cmd.warnings.length > 0 && (
                  <p className="text-xs text-blue-700 mt-1">⚠️ {cmd.warnings[0]}</p>
                )}
                <p className="text-xs text-blue-600 mt-1">Confidence: {Math.round(cmd.confidence * 100)}%</p>
              </div>
            ))}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setShowConfirm(false)
                  setCommands([])
                  setTranscript('')
                }}
                className="flex-1 bg-neutral-200 text-neutral-900 py-2 rounded-lg font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleProceed}
                disabled={isLoading}
                className="flex-1 bg-neutral-950 text-white py-2 rounded-lg font-semibold disabled:opacity-50"
              >
                {isLoading ? 'Executing...' : 'Proceed'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
