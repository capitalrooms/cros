'use client'

// /admin/tenant/<person> — a tenant now lives in their letting file (Person tab), so this opens the file of their
// current tenancy (or the most recent), on the matching tab. Someone with no tenancy yet — or ?stay=1 — gets the
// profile on its own page (TenantProfileView).
import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { one, type PageSearchParams } from '@/lib/pageSearchParams'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { TenantProfileView } from './TenantProfileView'

// the profile's old tabs → where that now lives in the letting file
const TAB_IN_FILE: Record<string, string> = { tenancy: 'terms', documents: 'documents', payments: 'money' }

export default function TenantProfilePage({ params, searchParams }: { params: Promise<{ personId: string }>; searchParams: PageSearchParams }) {
  const { personId } = use(params)
  const sp = use(searchParams)
  const router = useRouter()
  const stay = one(sp.stay) === '1'
  const askedTab = one(sp.tab) ?? ''
  const [standalone, setStandalone] = useState(stay)

  useEffect(() => {
    if (stay) return
    let cancelled = false
    ;(async () => {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
      const { data } = await createClient().from('tenancies').select('id, start_date, end_date, let_cancelled_at').eq('person_id', personId).order('start_date', { ascending: false })
      const lets = ((data ?? []) as any[]).filter(t => !t.let_cancelled_at)
      const file = lets.find(t => !t.end_date || t.end_date >= today) ?? lets[0]
      if (cancelled) return
      if (!file) { setStandalone(true); return }
      const tab = TAB_IN_FILE[askedTab] ?? 'person'
      router.replace(`/admin/lettings/${file.id}?tab=${tab}&from=${encodeURIComponent('/admin/people?tab=tenants')}`)
    })()
    return () => { cancelled = true }
  }, [personId, stay, router, askedTab])

  if (!standalone) return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/people?tab=tenants" />} />
      <div className="flex items-center justify-center py-3xl"><p className="text-sm text-neutral-400">Opening their letting file…</p></div>
    </div>
  )
  return <TenantProfileView personId={personId} />
}
