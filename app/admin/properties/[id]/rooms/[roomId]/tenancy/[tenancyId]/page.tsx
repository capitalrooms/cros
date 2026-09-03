'use client'

// Redirects to the canonical tenant profile at /admin/tenant/[personId]
// All admin paths that used to link here now arrive at one unified view.

import { useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'

export default function TenancyRedirectPage({
  params,
}: {
  params: Promise<{ id: string; roomId: string; tenancyId: string }>
}) {
  const router = useRouter()
  const { tenancyId, id } = use(params)

  useEffect(() => {
    async function redirect() {
      const supabase = createClient()
      const { data: tenancy } = await supabase
        .from('tenancies')
        .select('person_id')
        .eq('id', tenancyId)
        .single()

      if (tenancy?.person_id) {
        router.replace(`/admin/tenant/${tenancy.person_id}?tab=tenancy`)
      } else {
        // Fallback: go to the property page if we can't find the person
        router.replace(`/admin/properties/${id}`)
      }
    }
    redirect()
  }, [tenancyId, id, router])

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton />} />
      <main className="mx-auto max-w-3xl px-lg py-2xl">
        <div className="animate-pulse h-8 w-48 bg-neutral-300 rounded-lg" />
      </main>
    </div>
  )
}
