'use client'

// /admin/invite-to-apply retired (3 Nov 2026, Harry: "remove invite to apply as we already have send offer letter in
// the available rooms window"). Available Rooms › Send offer uses the same invite panel and sending
// (components/InviteApplicant, /api/lettings/invite-to-apply). Old links land there. The old page is in git history.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Moved() {
  const router = useRouter()
  useEffect(() => { router.replace('/admin/available-and-lettings#send-offer') }, [router])
  return null
}
