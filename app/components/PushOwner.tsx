'use client'
// One phone, whoever is signed in (15 Nov 2026): when someone signs in on a phone that already allows notifications,
// that phone's notifications move to them (lib/push claimThisDevice). Signing out removes the phone first
// (forgetThisDevice, called by every sign-out button). Never while an administrator is viewing someone's app.
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { claimThisDevice } from '@/lib/push'

export default function PushOwner() {
  useEffect(() => {
    const sb = createClient()
    const claim = (authId?: string) => {
      if (!authId) return
      try { if (sessionStorage.getItem('cros-view-as')) return } catch { /* private mode */ }
      // the server decides whose phone it is from the sign-in; the id here only remembers it was done for this person
      claimThisDevice(authId).catch(() => {})
    }
    sb.auth.getSession().then(({ data }) => claim(data.session?.user.id))
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => { if (event === 'SIGNED_IN') claim(session?.user.id) })
    return () => sub.subscription.unsubscribe()
  }, [])
  return null
}
