'use client'

import { useState, useRef, useEffect } from 'react'
import { parseVoiceCommand, executeCommands } from '@/lib/voice/parseCommand'
import { ParsedCommand, VoiceSessionState } from '@/lib/voice/types'

interface VoiceRecorderProps {
  propertyId?: string
  propertyName?: string
  rooms?: { id: string; name: string; unit_code: string | null; room_type?: string | null }[]
  tenants?: { id: string; name: string; email: string; room_id: string }[]
  onComplete?: () => void
}

export default function VoiceRecorder({
  propertyId,
  propertyName,
  rooms = [],
  tenants = [],
  onComplete,
}: VoiceRecorderProps) {
  const recognitionRef = useRef<any>(null)
  const [state, setState] = useState<VoiceSessionState>({
    isRecording: false,
    transcript: '',
    isLoading: false,
    error: null,
    commands: [],
    showConfirm: false,
  })

  useEffect(() => {
    // Initialize Web Speech API (cross-browser compat)
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setState((s) => ({ ...s, error: 'Speech recognition not supported on this device' }))
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onstart = () => {
      setState((s) => ({ ...s, isRecording: true, error: null, transcript: '' }))
    }

    recognition.onresult = (event: any) => {
      let interim = ''
      let final = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          final += transcript + ' '
        } else {
          interim += transcript
        }
      }
      setState((s) => ({
        ...s,
        transcript: (s.transcript + final + interim).trim(),
      }))
    }

    recognition.onerror = (event: any) => {
      setState((s) => ({ ...s, error: `Speech error: ${event.error}` }))
    }

    recognition.onend = () => {
      setState((s) => ({ ...s, isRecording: false }))
    }

    recognitionRef.current = recognition
  }, [])

  const startListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.start()
    }
  }

  const stopListening = async () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }

    if (!state.transcript.trim()) {
      setState((s) => ({ ...s, error: 'No transcript recorded' }))
      return
    }

    setState((s) => ({ ...s, isLoading: true, error: null }))

    const result = await parseVoiceCommand(state.transcript, {
      propertyId,
      propertyName,
      rooms,
      tenants,
    })

    if (result.error) {
      setState((s) => ({ ...s, error: result.error, isLoading: false }))
      return
    }

    setState((s) => ({
      ...s,
      commands: result.commands,
      showConfirm: result.commands.length > 0,
      isLoading: false,
    }))
  }

  const handleConfirm = async () => {
    setState((s) => ({ ...s, isLoading: true }))
    const result = await executeCommands(state.commands)

    if (result.failed.length > 0) {
      const failMsg = result.failed.map((f) => `${f.command}: ${f.error}`).join('\n')
      setState((s) => ({
        ...s,
        error: `${result.executed} executed, ${result.failed.length} failed:\n${failMsg}`,
        isLoading: false,
        showConfirm: false,
      }))
    } else {
      setState((s) => ({
        ...s,
        transcript: '',
        commands: [],
        showConfirm: false,
        isLoading: false,
      }))
      onComplete?.()
    }
  }

  const handleCancel = () => {
    setState((s) => ({
      ...s,
      showConfirm: false,
      transcript: '',
      commands: [],
      error: null,
    }))
  }

  const handleClear = () => {
    setState((s) => ({
      ...s,
      transcript: '',
      commands: [],
      showConfirm: false,
      error: null,
    }))
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end">
      <div className="w-full bg-white rounded-t-2xl p-lg space-y-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Voice Command</h2>
          <button
            onClick={handleClear}
            className="text-neutral-400 hover:text-neutral-600"
          >
            ✕
          </button>
        </div>

        {/* Mic control */}
        <div className="flex gap-sm justify-center py-lg">
          {!state.isRecording ? (
            <button
              onClick={startListening}
              disabled={state.isLoading}
              className="w-16 h-16 rounded-full bg-blue-600 text-white flex items-center justify-center text-2xl hover:bg-blue-700 disabled:opacity-50"
            >
              🎤
            </button>
          ) : (
            <button
              onClick={stopListening}
              className="w-16 h-16 rounded-full bg-red-600 text-white flex items-center justify-center text-2xl hover:bg-red-700 animate-pulse"
            >
              ⏹
            </button>
          )}
        </div>

        {/* Transcript */}
        {state.transcript && (
          <div className="bg-neutral-50 rounded-lg p-md">
            <p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Transcript</p>
            <p className="text-sm text-neutral-900 leading-relaxed">{state.transcript}</p>
          </div>
        )}

        {/* Loading */}
        {state.isLoading && (
          <div className="text-center py-lg">
            <div className="inline-block">
              <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
            <p className="text-xs text-neutral-400 mt-sm">Parsing command...</p>
          </div>
        )}

        {/* Error */}
        {state.error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-md">
            <p className="text-xs text-red-800 font-semibold mb-xs">Error</p>
            <p className="text-sm text-red-700 whitespace-pre-wrap">{state.error}</p>
          </div>
        )}

        {/* Confirmation modal */}
        {state.showConfirm && !state.isLoading && (
          <div className="border-t border-neutral-200 pt-lg space-y-md">
            <div className="bg-blue-50 rounded-lg p-md">
              <p className="text-xs text-blue-800 font-semibold mb-md">Actions to execute:</p>
              <div className="space-y-xs">
                {state.commands.map((cmd, i) => (
                  <div key={i} className="bg-white rounded p-sm border border-blue-100">
                    <p className="text-sm font-medium text-neutral-900">{cmd.summary}</p>
                    {cmd.warnings && cmd.warnings.length > 0 && (
                      <div className="mt-xs space-y-0.5">
                        {cmd.warnings.map((w, j) => (
                          <p key={j} className="text-xs text-amber-700">
                            ⚠️ {w}
                          </p>
                        ))}
                      </div>
                    )}
                    <p className="text-[11px] text-neutral-400 mt-xs">
                      Confidence: {Math.round(cmd.confidence * 100)}%
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-sm">
              <button
                onClick={handleCancel}
                className="flex-1 rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 rounded-lg bg-blue-600 px-md py-sm text-sm font-semibold text-white hover:bg-blue-700"
              >
                Proceed
              </button>
            </div>
          </div>
        )}

        {/* Buttons when recording/done */}
        {!state.showConfirm && state.transcript && !state.isLoading && (
          <div className="flex gap-sm">
            <button
              onClick={handleClear}
              className="flex-1 rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              Clear
            </button>
            <button
              onClick={stopListening}
              className="flex-1 rounded-lg bg-blue-600 px-md py-sm text-sm font-semibold text-white hover:bg-blue-700"
            >
              Parse
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
