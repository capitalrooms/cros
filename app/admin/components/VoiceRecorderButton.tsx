'use client'

import { useState } from 'react'
import VoiceRecorder from './VoiceRecorder'

interface VoiceRecorderButtonProps {
  propertyId?: string
  propertyName?: string
  rooms?: { id: string; name: string; unit_code: string | null; room_type?: string | null }[]
  tenants?: { id: string; name: string; email: string; room_id: string }[]
  onComplete?: () => void
  className?: string
}

/**
 * Floating action button that opens the voice recorder modal.
 * Drop this into any admin page to enable voice commands.
 *
 * Usage:
 * <VoiceRecorderButton propertyId={id} propertyName={name} rooms={rooms} tenants={tenants} />
 */
export default function VoiceRecorderButton({
  propertyId,
  propertyName,
  rooms = [],
  tenants = [],
  onComplete,
  className,
}: VoiceRecorderButtonProps) {
  const [showRecorder, setShowRecorder] = useState(false)

  return (
    <>
      {/* Floating action button */}
      <button
        onClick={() => setShowRecorder(true)}
        className={`fixed bottom-lg right-lg z-40 w-14 h-14 rounded-full bg-blue-600 text-white flex items-center justify-center text-2xl hover:bg-blue-700 shadow-lg active:scale-95 transition ${
          className || ''
        }`}
        title="Voice command"
      >
        🎤
      </button>

      {/* Modal */}
      {showRecorder && (
        <VoiceRecorder
          propertyId={propertyId}
          propertyName={propertyName}
          rooms={rooms}
          tenants={tenants}
          onComplete={() => {
            setShowRecorder(false)
            onComplete?.()
          }}
        />
      )}
    </>
  )
}
