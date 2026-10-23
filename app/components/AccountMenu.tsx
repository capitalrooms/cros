'use client'

// The account button at the right of the top bar — the same for every user (21 Oct 2026, Harry: "one top bar for all
// users"). Your initial and first name; your profile (the right one for your role), password & sign-in, the office's
// settings, and sign out. Moved here from the admin layout, where it started. Nothing shows when nobody's signed in.
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { needsTwoStep } from '@/components/TwoStepCode'
import { isAdministrator, REQUIRE_TWO_STEP_FOR_ADMINS } from '@/lib/access/areas'
import { useAdminAccess, useIsAdmin } from '@/lib/admin-context'

const OFFICE = ['administrator', 'admin', 'lettings']
const PROFILE: Record<string, string> = {
  administrator: '/admin/profile', admin: '/admin/profile', lettings: '/lettings/profile', tenant: '/tenant/profile',
  contractor: '/contractor/profile', cleaner: '/cleaner/profile', landlord: '/landlord/profile',
}

export default function AccountMenu() {
  // Settings for administrators, and for anyone the Settings area is ticked for (inside the office app)
  const allowed = useAdminAccess(), inOffice = useIsAdmin()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const [signedIn, setSignedIn] = useState(false)
  const [initial, setInitial] = useState('')
  const [first, setFirst] = useState('')
  const [role, setRole] = useState('')

  useEffect(() => {
    const sb = createClient()
    sb.auth.getSession().then(async ({ data }) => {
      const email = data.session?.user?.email ?? ''
      if (!email) return
      setSignedIn(true)
      setInitial(email[0].toUpperCase())
      const { data: p } = await sb.from('people').select('salutation, first_name, role').ilike('email', email).order('created_at').limit(1).maybeSingle()
      const r = String((p as any)?.role ?? '')
      setRole(r)
      const fn = (p as any)?.first_name as string | undefined
      if (fn) { setFirst(fn); setInitial(fn[0].toUpperCase()) }
      if (!OFFICE.includes(r)) return
      // the office: two-step sign-in set up but the code not entered → the server refuses everything, so go and enter it
      if (await needsTwoStep(sb)) { router.replace('/account'); return }
      // this device's "Share to CROS" key (lib/shareKey) — lets the phone's share sheet send files in
      if (data.session?.access_token) fetch('/api/auth/share-key', { method: 'POST', headers: { Authorization: `Bearer ${data.session.access_token}` } }).catch(() => {})
      // administrators must have two-step sign-in (lib/auth/aal — the server refuses them until it's set up)
      if (REQUIRE_TWO_STEP_FOR_ADMINS && isAdministrator(r)) {
        const { data: f } = await sb.auth.mfa.listFactors()
        if (!(f?.all ?? []).some(x => x.status === 'verified')) router.replace('/account?setup=two-step')
      }
    })
  }, [router])

  useEffect(() => {
    function handleClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleSignOut() {
    try { sessionStorage.removeItem('cros-view-as') } catch { /* noop */ }
    await createClient().auth.signOut()
    router.push('/login')
  }

  if (!signedIn) return null
  const profile = PROFILE[role] ?? '/account'
  const item = 'flex items-center gap-2 px-3 py-2.5 text-xs text-neutral-700 hover:bg-neutral-50'
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} aria-label="Account menu" aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 p-1 text-xs font-semibold text-white/80 transition-colors hover:bg-white/20 md:pr-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-[11px] text-white">{initial || '·'}</span>
        <span className="hidden md:inline">{first || 'My account'}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-52 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg">
          <Link href={profile} onClick={() => setOpen(false)} className={item}>👤 My profile</Link>
          <Link href="/account" onClick={() => setOpen(false)} className={item}>🔑 Password &amp; sign-in</Link>
          {(isAdministrator(role) || (OFFICE.includes(role) && inOffice && allowed('/admin/settings'))) && <Link href="/admin/settings" onClick={() => setOpen(false)} className={`${item} border-t border-neutral-100`}>⚙️ Settings</Link>}
          {OFFICE.includes(role) && <Link href="/admin/settings/signatures" onClick={() => setOpen(false)} className={item}>✍️ Email signatures</Link>}
          <button onClick={handleSignOut} className="flex w-full items-center gap-2 border-t border-neutral-100 px-3 py-2.5 text-xs text-red-600 hover:bg-red-50">🚪 Sign out</button>
        </div>
      )}
    </div>
  )
}
