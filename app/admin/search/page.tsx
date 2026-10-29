'use client'

// Search — find any screen, person, house, room or job from one box (the same finder as the desktop rail and More).
import { useAdminAccess } from '@/lib/admin-context'
import { InlineFinder } from '../components/AdminFinder'

export default function AdminSearchPage() {
  const allowed = useAdminAccess()
  return (
    <div className="min-h-screen bg-neutral-100">
      <div className="mx-auto max-w-6xl px-lg py-xl space-y-4">
        <h1 className="text-[26px] leading-tight font-bold text-neutral-950">Search</h1>
        <InlineFinder allowed={allowed} autoFocus />
      </div>
    </div>
  )
}
