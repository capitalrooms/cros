'use client'
// "Their app" on a landlord's profile (14 Oct 2026): which parts of the landlord app they can see — switched on by an
// administrator as and when (lib/access/landlordSections) — and the button that emails them their sign-in link.
// Hidden for anyone who isn't an administrator.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { adminFetch } from '@/lib/adminFetch'
import { LANDLORD_SECTIONS, type LandlordSection } from '@/lib/access/landlordSections'

interface State {
  sections: LandlordSection[]
  custom: boolean
  login: { hasLogin: boolean; confirmed: boolean; lastSignIn: string | null; off: boolean }
  email: string | null
  boardId: string | null
}

const when = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

export default function LandlordAppAccess({ personId, name }: { personId: string; name: string }) {
  const [st, setSt] = useState<State | null>(null)
  const [hidden, setHidden] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function load() {
    const r = await adminFetch(`/api/admin/landlord-access?personId=${personId}`).catch(() => null)
    if (!r || r.status === 403 || r.status === 401) { setHidden(true); return }
    const d = await r.json().catch(() => null)
    if (r.ok && d) setSt(d)
  }
  useEffect(() => { load() }, [personId])   // eslint-disable-line react-hooks/exhaustive-deps

  async function post(body: Record<string, unknown>) {
    const r = await adminFetch('/api/admin/landlord-access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ personId, ...body }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.error || 'That didn’t work')
    return d
  }

  async function toggle(key: LandlordSection) {
    if (!st) return
    const next = st.sections.includes(key) ? st.sections.filter(k => k !== key) : [...st.sections, key]
    setBusy(key); setMsg(null)
    try {
      const d = await post({ sections: next })
      setSt({ ...st, sections: d.sections, custom: true, boardId: d.boardId ?? st.boardId })
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Not saved' }) }
    setBusy(null)
  }

  async function send() {
    setBusy('send'); setMsg(null)
    try {
      const d = await post({ action: 'send' })
      setMsg({ ok: true, text: d.sent === 'invite' ? `Sign-in link sent to ${d.to} — they choose a password, then their app opens.` : `Password reset link sent to ${d.to}.` })
      load()
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Not sent' }) }
    setBusy(null)
  }

  if (hidden || !st) return null
  const status = st.login.off ? 'Sign-in turned off' : !st.login.hasLogin ? 'No login yet' : !st.login.confirmed ? 'Invited — not signed in yet' : `Signed in${st.login.lastSignIn ? ` · last ${when(st.login.lastSignIn)}` : ''}`

  return (
    <section className="rounded-xl border border-neutral-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-md border-b border-neutral-100 px-xl py-lg">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Their app</p>
          <p className="mt-xs text-sm text-neutral-600">What {name} sees when they sign in. Only administrators can change this.</p>
        </div>
        <span className={`rounded-full px-sm py-xs text-xs font-semibold ${st.login.confirmed && !st.login.off ? 'bg-green-100 text-green-800' : 'bg-neutral-100 text-neutral-600'}`}>{status}</span>
      </div>
      <ul className="divide-y divide-neutral-100">
        {LANDLORD_SECTIONS.map(s => {
          const on = st.sections.includes(s.key)
          return (
            <li key={s.key} className="flex items-center justify-between gap-md px-xl py-md">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-neutral-900">{s.label}</p>
                <p className="text-xs text-neutral-500">{s.hint}</p>
                {s.key === 'planner' && on && st.boardId && (
                  <Link href={`/admin/planner/shared?board=${st.boardId}`} className="mt-xs inline-block text-xs font-semibold text-blue-600 hover:underline">Open your board with them →</Link>
                )}
              </div>
              <button type="button" role="switch" aria-checked={on} aria-label={s.label} disabled={!!busy} onClick={() => toggle(s.key)}
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-emerald-500' : 'bg-neutral-300'}`}>
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-md border-t border-neutral-100 px-xl py-lg">
        <button type="button" onClick={send} disabled={!!busy || !st.email || st.login.off}
          className="rounded-lg bg-neutral-900 px-md py-sm text-sm font-semibold text-white disabled:opacity-40">
          {busy === 'send' ? 'Sending…' : st.login.confirmed ? 'Email a password reset link' : 'Email their sign-in link'}
        </button>
        <p className="text-xs text-neutral-500">{st.email ? `Goes to ${st.email}.` : 'Add an email address on Contact & Identity first.'}{!st.custom ? ' Set up before these switches existed — showing what they already see.' : ''}</p>
        {msg && <p className={`w-full text-sm ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</p>}
      </div>
    </section>
  )
}
