'use client'

// Report an emergency — the quick way in from the tenant home screen (Harry, 13 Oct 2026). One tap for what's
// happening, the safety steps straight away (with a call button for gas / fire / carbon monoxide), then "is it under
// control?" and send. It creates the same emergency job as Report an issue › Emergency and starts the same call-out
// (/api/emergencies/start → lib/emergencies/engine): the emergency contractors who cover this house are contacted the
// way each has asked, the soonest is confirmed, and the house is kept told.

import BackButton from '@/app/components/BackButton'
import AppBar from '@/components/AppBar'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { KINDS, type EmergencyKind } from '@/lib/emergencies/guide'
import { currentTenancy } from '@/lib/tenancy'

const ORDER: EmergencyKind[] = ['gas', 'co', 'fire', 'flooding', 'ceiling_water', 'electrical', 'power', 'heating', 'security', 'window', 'toilet', 'appliance_leak', 'smoke_alarm', 'other']
const ICON: Record<EmergencyKind, string> = {
  gas: '🔥', co: '⚠️', fire: '🚒', flooding: '💧', ceiling_water: '🌧️', electrical: '⚡', power: '🔌', heating: '🥶',
  security: '🔐', window: '🪟', toilet: '🚽', appliance_leak: '🫧', smoke_alarm: '🔔', other: '🆘',
}
// the number to ring, from the guide's wording ("call … 0800 111 999", "call 999")
const numberIn = (text?: string) => text?.match(/0800 111 999/)?.[0] ?? (/\b999\b/.test(text ?? '') ? '999' : null)

export default function TenantEmergencyPage() {
  const router = useRouter()
  const [kind, setKind] = useState<EmergencyKind | null>(null)
  const [controlled, setControlled] = useState<boolean | null>(null)
  const [details, setDetails] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [home, setHome] = useState<{ propertyId: string | null; roomId: string | null } | null>(null)

  useEffect(() => {
    getCurrentUser().then(u => {
      if (!u) { router.push('/login'); return }
      // the tenancy running now, not the static people.property_id
      currentTenancy<{ property_id: string; room_id: string | null }>(u.assignment?.id, 'property_id, room_id')
        .then(t => setHome({ propertyId: t?.property_id ?? u.assignment?.property_id ?? null, roomId: t?.room_id ?? u.assignment?.room_id ?? null }))
    })
  }, [router])

  const info = kind ? KINDS[kind] : null
  const phone = numberIn(info?.callServices)
  const needsAnswer = !!info?.trade && controlled === null

  async function send() {
    if (!kind || !info) return
    setSending(true); setError('')
    try {
      const sb = createClient()
      const { data: session } = await sb.auth.getSession()
      const u = await getCurrentUser()
      if (!session?.session || !u) { router.push('/login'); return }
      if (!home?.propertyId) { setError('We couldn’t find your home on file — please call the office.'); return }
      const { data: t, error: tErr } = await sb.from('maintenance_tickets').insert([{
        reporter_id: u.assignment?.id ?? u.user.id,
        title: `${info.label}`,
        description: [details.trim(), controlled === true ? 'Tenant says it’s under control until morning.' : controlled === false ? 'Tenant says it’s still happening / not safe.' : ''].filter(Boolean).join('\n\n') || info.label,
        category: 'Emergency',
        location: 'Reported as an emergency',
        priority: 'emergency',
        status: 'reported',
        property_id: home.propertyId,
        room_id: home.roomId,
      }]).select('id').single()
      if (tErr || !t) throw new Error(tErr?.message || 'Could not send your report')
      const r = await fetch('/api/emergencies/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.session.access_token}` },
        body: JSON.stringify({ ticketId: t.id, kind, controlled: !!controlled }),
      })
      const d = await r.json().catch(() => ({}))
      setStatus(r.ok ? (d.status ?? 'collecting') : 'failed')
      // the office's usual new-job alert as well
      fetch('/api/notify-job-raised', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketId: t.id }) }).catch(() => {})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send your report — please call the office.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/tenant" />} />
      <header className="bg-[#7F1D1D] px-lg pb-lg pt-lg text-white">
        <div className="mx-auto max-w-xl">
          <h1 className="text-2xl font-bold">Report an emergency</h1>
          <p className="mt-xs text-sm text-white/80">Something that can’t wait — water pouring, no power or heating, a door that won’t lock. For anything else, use Report an issue.</p>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-md px-lg py-lg">
        {status ? (
          <section className="rounded-2xl bg-white p-lg">
            <p className="text-lg font-bold text-neutral-900">{status === 'failed' ? 'Your report is in' : 'We’ve got it'}</p>
            <p className="mt-sm text-sm text-neutral-700">
              {status === 'collecting' ? 'We’re contacting our emergency contractors now and will tell you who is coming and when — usually within 15 minutes. Keep following the steps below until they arrive.'
                : status === 'morning' ? 'Thanks for making it safe. We’ll arrange someone first thing in the morning — tell us straight away if it gets worse.'
                : status === 'call_999' ? `${info?.callServices ?? 'Please call the emergency services.'} We’ve told the office.`
                : 'We couldn’t start the emergency call-out automatically, but the office has your report. If it isn’t safe, call us.'}
            </p>
            {phone && <a href={`tel:${phone.replace(/\s/g, '')}`} className="mt-md block rounded-xl bg-red-700 py-md text-center text-base font-bold text-white">Call {phone}</a>}
            {info && <ol className="mt-md list-decimal space-y-xs pl-lg text-sm text-neutral-800">{info.steps.map(s => <li key={s}>{s}</li>)}</ol>}
            <Link href="/tenant" className="mt-lg block rounded-xl border border-neutral-300 py-sm text-center text-sm font-semibold text-neutral-800">Back to home</Link>
          </section>
        ) : !kind ? (
          <section>
            <p className="mb-sm text-sm font-semibold text-neutral-700">What’s happening?</p>
            <div className="grid grid-cols-2 gap-sm">
              {ORDER.map(k => (
                <button key={k} type="button" onClick={() => { setKind(k); setControlled(null) }}
                  className={`rounded-2xl border bg-white p-md text-left active:scale-[0.98] ${KINDS[k].trade ? 'border-neutral-200' : 'border-red-300'}`}>
                  <span className="block text-2xl" aria-hidden>{ICON[k]}</span>
                  <span className="mt-xs block text-sm font-semibold text-neutral-900">{KINDS[k].label}</span>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <>
            <section className="rounded-2xl border border-red-200 bg-red-50 p-lg">
              <div className="flex items-start justify-between gap-sm">
                <p className="text-base font-bold text-red-800">{ICON[kind]} {info!.label}</p>
                <button type="button" onClick={() => setKind(null)} className="shrink-0 text-xs font-semibold text-red-800 underline">Change</button>
              </div>
              {info!.callServices && <p className="mt-sm text-sm font-bold text-red-900">{info!.callServices}</p>}
              {phone && <a href={`tel:${phone.replace(/\s/g, '')}`} className="mt-sm block rounded-xl bg-red-700 py-md text-center text-base font-bold text-white">Call {phone}</a>}
              <p className="mt-md text-xs font-bold uppercase tracking-wider text-red-800">Do this now</p>
              <ol className="mt-xs list-decimal space-y-xs pl-lg text-sm text-red-900">{info!.steps.map(s => <li key={s}>{s}</li>)}</ol>
            </section>

            <section className="space-y-md rounded-2xl bg-white p-lg">
              {info!.trade && (
                <div>
                  <p className="text-sm font-bold text-neutral-900">Right now, is it under control?</p>
                  <div className="mt-sm space-y-xs">
                    {([[false, 'No — it’s still happening / not safe'], [true, 'Yes — it’s contained until morning']] as const).map(([v, l]) => (
                      <button key={String(v)} type="button" onClick={() => setControlled(v)}
                        className={`block w-full rounded-xl border px-md py-sm text-left text-sm font-semibold ${controlled === v ? 'border-red-700 bg-red-50 text-neutral-900' : 'border-neutral-200 text-neutral-800'}`}>{l}</button>
                    ))}
                  </div>
                  <p className="mt-xs text-xs text-neutral-500">{controlled === false ? 'We’ll contact our emergency contractors as soon as you send this.' : controlled === true ? 'We’ll arrange someone first thing — tell us straight away if it gets worse.' : 'This tells us whether to send someone tonight.'}</p>
                </div>
              )}
              <label className="block text-sm font-semibold text-neutral-900">Anything we should know? <span className="font-normal text-neutral-500">(optional)</span>
                <textarea value={details} onChange={e => setDetails(e.target.value)} rows={3} placeholder="e.g. water coming through the kitchen ceiling, stopcock is off"
                  className="mt-xs w-full rounded-xl border border-neutral-300 px-md py-sm text-sm font-normal text-neutral-900" />
              </label>
              {error && <p className="rounded-xl bg-red-50 px-md py-sm text-sm text-red-800">{error}</p>}
              <button type="button" onClick={send} disabled={sending || needsAnswer || !home}
                className="w-full rounded-xl bg-red-700 py-md text-base font-bold text-white disabled:opacity-40">
                {sending ? 'Sending…' : info!.trade ? 'Send emergency report' : 'Tell Capital Rooms'}
              </button>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
