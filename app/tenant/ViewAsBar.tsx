'use client'
// The "Viewing as …" bar on every tenant screen while an administrator is viewing a tenant's app (13 Nov 2026).
// The home screen draws its own; the others get it here. lib/viewAs.
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import ViewAsBanner from '@/app/components/ViewAsBanner'
import { viewAsId } from '@/lib/viewAs'
import { createClient } from '@/lib/supabase'
import { displayName } from '@/lib/people'

export default function ViewAsBar() {
  const path = usePathname()
  const [who, setWho] = useState<{ id: string; name: string } | null>(null)
  useEffect(() => {
    const id = viewAsId()
    if (!id || path === '/tenant') { setWho(null); return }
    createClient().from('people').select('id, salutation, first_name, last_name, full_name').eq('id', id).maybeSingle()
      .then(({ data }) => setWho(data ? { id, name: displayName(data as any) } : null))
  }, [path])
  return who ? <ViewAsBanner name={who.name} role="tenant" personId={who.id} /> : null
}
