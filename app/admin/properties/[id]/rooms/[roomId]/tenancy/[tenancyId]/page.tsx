'use client'

// Old room › tenancy links: every tenancy now has one page, its letting file at /admin/lettings/[tenancyId].
// Back from there returns to this room on its property.

import { useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'

export default function TenancyRedirectPage({
  params,
}: {
  params: Promise<{ id: string; roomId: string; tenancyId: string }>
}) {
  const router = useRouter()
  const { tenancyId, id, roomId } = use(params)

  useEffect(() => {
    router.replace(`/admin/lettings/${tenancyId}?from=${encodeURIComponent(`/admin/properties/${id}?tab=units&room=${roomId}`)}`)
  }, [tenancyId, id, roomId, router])

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href={`/admin/properties/${id}`} />} />
      <main className="mx-auto max-w-6xl px-lg py-xl">
        <div className="animate-pulse h-8 w-48 bg-neutral-300 rounded-lg" />
      </main>
    </div>
  )
}
