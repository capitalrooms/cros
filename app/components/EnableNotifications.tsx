'use client'

import { useEffect, useState } from 'react'
import { getCurrentUser } from '@/lib/auth'
import { enablePush, pushPermission, pushSupported } from '@/lib/push'

/**
 * A small "Turn on notifications" prompt. Hides itself once granted or if the
 * device can't do push. Drop it near the top of any dashboard.
 */
export default function EnableNotifications() {
  const [state, setState] = useState<'hidden' | 'prompt' | 'busy' | 'denied'>('hidden')

  useEffect(() => {
    if (!pushSupported()) return
    const p = pushPermission()
    if (p === 'granted') setState('hidden')
    else if (p === 'denied') setState('denied')
    else setState('prompt')
  }, [])

  async function turnOn() {
    setState('busy')
    try {
      const data = await getCurrentUser()
      const a = data?.assignment as any
      const res = await enablePush({
        id: a?.id,
        email: a?.email ?? data?.user?.email,
        role: a?.role,
      })
      setState(res.ok ? 'hidden' : res.reason === 'denied' ? 'denied' : 'prompt')
    } catch {
      setState('prompt')
    }
  }

  if (state === 'hidden') return null
  if (state === 'denied') {
    return (
      <p className="rounded-xl bg-neutral-100 px-lg py-md text-xs text-neutral-500">
        🔕 Notifications are blocked — turn them on in your browser/phone settings for this app.
      </p>
    )
  }
  return (
    <button
      onClick={turnOn}
      disabled={state === 'busy'}
      className="w-full rounded-xl border-2 border-neutral-900 bg-white px-lg py-md text-sm font-bold text-neutral-900 hover:bg-neutral-50 disabled:opacity-50"
    >
      {state === 'busy' ? 'Enabling…' : '🔔 Turn on notifications'}
    </button>
  )
}
