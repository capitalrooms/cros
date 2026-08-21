'use client'

import { useState } from 'react'

interface PropertyExitReminderProps {
  propertyAddress?: string
  onDismiss: () => void
}

export default function PropertyExitReminder({ propertyAddress = 'the property', onDismiss }: PropertyExitReminderProps) {
  const [acknowledged, setAcknowledged] = useState(false)

  const handleAcknowledge = () => {
    setAcknowledged(true)
    // Auto-dismiss after acknowledgement
    setTimeout(() => {
      onDismiss()
    }, 1000)
  }

  if (acknowledged) {
    return null
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-md">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-lg">
        {/* Header */}
        <div className="mb-lg">
          <h2 className="text-2xl font-bold text-neutral-900 mb-md">✓ Before You Leave</h2>
          <p className="text-sm text-neutral-600">Please confirm you've completed these before leaving {propertyAddress}:</p>
        </div>

        {/* Checklist Items */}
        <div className="space-y-md mb-2xl">
          {/* Key Safe */}
          <div className="flex items-start gap-md p-md bg-neutral-50 rounded-lg border border-neutral-200">
            <input
              type="checkbox"
              className="mt-md w-md h-md accent-blue-600 cursor-pointer flex-shrink-0"
              defaultChecked
              disabled
            />
            <div className="flex-1">
              <p className="font-semibold text-neutral-900">🔐 Return key to key safe</p>
              <p className="text-xs text-neutral-600 mt-xs">Make sure the key is secure and the safe is locked</p>
            </div>
          </div>

          {/* Bedroom Doors */}
          <div className="flex items-start gap-md p-md bg-neutral-50 rounded-lg border border-neutral-200">
            <input
              type="checkbox"
              className="mt-md w-md h-md accent-blue-600 cursor-pointer flex-shrink-0"
              defaultChecked
              disabled
            />
            <div className="flex-1">
              <p className="font-semibold text-neutral-900">🚪 Leave bedroom doors as found</p>
              <p className="text-xs text-neutral-600 mt-xs">Don't lock/unlock what you didn't change</p>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={handleAcknowledge}
          className="w-full px-lg py-md bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg transition"
        >
          I've Completed These ✓
        </button>

        {/* Dismissible note */}
        <button
          onClick={onDismiss}
          className="w-full mt-sm text-xs text-neutral-500 hover:text-neutral-700 transition py-sm"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
