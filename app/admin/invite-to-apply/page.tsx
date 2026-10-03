'use client'

import NameInput, { emptyName, toLegalName, type NameValue } from '@/app/components/NameInput'
import { useEffect, useRef, useState, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { sortPropertiesNumerically } from '@/lib/sortProperties'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function InviteToApplyPage() {
  const searchParams = useSearchParams()
  const preselectedViewingId = searchParams.get('viewingId')

  const [viewings, setViewings] = useState<any[]>([])
  const [properties, setProperties] = useState<any[]>([])
  const [rooms, setRooms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any | null>(null)
  const [manualMode, setManualMode] = useState(false)
  const [manual, setManual] = useState({ name: '', email: '', phone: '', property_id: '', room_id: '' })
  const [manualNm, setManualNm] = useState<NameValue>(emptyName())
  const [method, setMethod] = useState<'email' | 'sms' | 'both'>('email')
  const [mode, setMode] = useState<'apply' | 'fasttrack' | 'reserve'>('apply')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<any | null>(null)
  const [copied, setCopied] = useState(false)
  const resultRef = useRef<HTMLDivElement>(null)

  // Rooms filtered to the selected property in manual mode
  const filteredRooms = useMemo(
    () => manual.property_id ? rooms.filter(r => r.property_id === manual.property_id) : [],
    [manual.property_id, rooms]
  )

  useEffect(() => {
    const load = async () => {
      const since = new Date()
      since.setDate(since.getDate() - 60)
      const [viewingsRes, propertiesRes, roomsRes] = await Promise.all([
        supabase
          .from('viewings')
          .select('id, visitor_name, visitor_email, visitor_phone, viewing_date, viewing_slot, room_id, property_id, rooms(name, is_let_only), properties(name, address)')
          .gte('viewing_date', since.toISOString().split('T')[0])
          .order('viewing_date', { ascending: false }),
        supabase.from('properties').select('id, name, address'),
        supabase.from('rooms').select('id, name, property_id, is_let_only, current_asking_rent').order('name'),
      ])
      const loadedViewings = viewingsRes.data || []
      setViewings(loadedViewings)
      setProperties(sortPropertiesNumerically(propertiesRes.data || []))
      setRooms(roomsRes.data || [])
      // Auto-select if navigated here with ?viewingId=
      if (preselectedViewingId) {
        const match = loadedViewings.find((v: any) => v.id === preselectedViewingId)
        if (match) setSelected(match)
      }
      setLoading(false)
    }
    load()
  }, [])

  const selectViewing = (v: any) => {
    setSelected(v)
    setManualMode(false)
    setResult(null)
  }

  const switchToManual = () => {
    setSelected(null)
    setManualMode(true)
    setResult(null)
  }

  const contactEmail = manualMode ? manual.email : selected?.visitor_email
  const contactPhone = manualMode ? manual.phone : selected?.visitor_phone

  const canSend = manualMode
    ? manualNm.salutation && manualNm.first_name.trim() && manualNm.last_name.trim() && manual.room_id && (manual.email.trim() || manual.phone.trim())
    : !!selected

  const send = async () => {
    if (!canSend) return
    setSending(true)
    setResult(null)

    const body = manualMode
      ? { manual: { name: manual.name, salutation: manualNm.salutation, first_name: manualNm.first_name.trim(), last_name: manualNm.last_name.trim(), email: manual.email, phone: manual.phone, room_id: manual.room_id, property_id: manual.property_id }, method, mode }
      : { viewingId: selected.id, method, mode }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/lettings/invite-to-apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      setResult(data)
    } catch (err) {
      setResult({ emailError: 'Network error — please try again', smsError: null })
    } finally {
      setSending(false)
    }
  }

  // Scroll result into view whenever it updates
  useEffect(() => {
    if (result) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [result])

  const copyLink = async () => {
    if (!result?.link) return
    await navigator.clipboard.writeText(result.link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin" />} />
      <PageHero title="Invite to Apply" subtitle="Send a personalised application link by email or text after a viewing" />
      <div className="mx-auto max-w-6xl py-xl px-lg">

        {/* Step 1 — Pick a viewing or enter manually */}
        <div className="bg-white rounded-xl border border-neutral-200 p-lg mb-lg">
          <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide mb-md">
            1 · Select a viewing
          </h2>
          {loading ? (
            <p className="text-sm text-neutral-400">Loading recent viewings…</p>
          ) : viewings.length === 0 ? (
            <p className="text-sm text-neutral-400">No viewings in the last 60 days.</p>
          ) : (
            <div className="space-y-sm max-h-72 overflow-y-auto pr-xs">
              {viewings.map((v) => {
                const room = (v.rooms as any)?.name || 'Room'
                const isLetOnly = (v.rooms as any)?.is_let_only
                const prop = (v.properties as any)?.address || (v.properties as any)?.name || ''
                const isSelected = !manualMode && selected?.id === v.id
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => selectViewing(v)}
                    className={`w-full text-left p-md rounded-lg border-2 transition-all ${
                      isSelected
                        ? 'border-neutral-900 bg-neutral-50'
                        : 'border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-neutral-900 flex items-center gap-xs">
                          {v.visitor_name || 'Unknown visitor'}
                          {isLetOnly && <span className="text-xs bg-purple-100 text-purple-700 px-xs py-0.5 rounded font-medium">Let Only</span>}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {room}{prop ? ` · ${prop}` : ''} · {v.viewing_date}
                        </p>
                      </div>
                      <div className="flex gap-xs">
                        {v.visitor_email && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-xs py-0.5 rounded">✉ email</span>
                        )}
                        {v.visitor_phone && (
                          <span className="text-xs bg-green-100 text-green-700 px-xs py-0.5 rounded">📱 SMS</span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Other — manual entry toggle */}
          <button
            type="button"
            onClick={switchToManual}
            className={`mt-md w-full text-left p-md rounded-lg border-2 transition-all ${
              manualMode
                ? 'border-neutral-900 bg-neutral-50'
                : 'border-dashed border-neutral-300 hover:border-neutral-400'
            }`}
          >
            <p className="text-sm font-semibold text-neutral-700">+ Other — enter contact details manually</p>
            <p className="text-xs text-neutral-400 mt-xs">Use this if the applicant wasn't in the viewing diary</p>
          </button>

          {/* Manual entry form */}
          {manualMode && (
            <div className="mt-md space-y-sm border border-neutral-200 rounded-lg p-md bg-neutral-50">
              <div className="grid grid-cols-2 gap-sm">
                <div className="col-span-2">
                  <NameInput value={manualNm} required titleRequired
                    onChange={n => { setManualNm(n); setManual(m => ({ ...m, name: toLegalName(n) })) }}
                    inputClass="w-full text-sm border border-neutral-300 rounded-lg px-sm py-xs focus:outline-none focus:border-neutral-500 bg-white"
                    labelClass="text-xs font-medium text-neutral-600 block mb-xs" />
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-600 block mb-xs">
                    Email{(method === 'email' || method === 'both') ? <span className="text-red-500 ml-xs">*</span> : <span className="text-neutral-400 ml-xs font-normal">(for email invite)</span>}
                  </label>
                  <input
                    type="email"
                    value={manual.email}
                    onChange={e => setManual(m => ({ ...m, email: e.target.value }))}
                    placeholder="e.g. sarah@email.com"
                    className="w-full text-sm border border-neutral-300 rounded-lg px-sm py-xs focus:outline-none focus:border-neutral-500 bg-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-600 block mb-xs">
                    Phone{(method === 'sms' || method === 'both') ? <span className="text-red-500 ml-xs">*</span> : <span className="text-neutral-400 ml-xs font-normal">(for SMS)</span>}
                  </label>
                  <input
                    type="tel"
                    value={manual.phone}
                    onChange={e => setManual(m => ({ ...m, phone: e.target.value }))}
                    placeholder="e.g. 07700 900000"
                    className="w-full text-sm border border-neutral-300 rounded-lg px-sm py-xs focus:outline-none focus:border-neutral-500 bg-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-600 block mb-xs">Property *</label>
                  <select
                    value={manual.property_id}
                    onChange={e => setManual(m => ({ ...m, property_id: e.target.value, room_id: '' }))}
                    className="w-full text-sm border border-neutral-300 rounded-lg px-sm py-xs focus:outline-none focus:border-neutral-500 bg-white"
                  >
                    <option value="">Select property…</option>
                    {properties.map(p => (
                      <option key={p.id} value={p.id}>{p.name || p.address}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-neutral-600 block mb-xs">
                  Room *
                  {!manual.property_id && <span className="text-neutral-400 ml-xs font-normal">(select a property first)</span>}
                </label>
                <select
                  value={manual.room_id}
                  onChange={e => setManual(m => ({ ...m, room_id: e.target.value }))}
                  disabled={!manual.property_id}
                  className="w-full text-sm border border-neutral-300 rounded-lg px-sm py-xs focus:outline-none focus:border-neutral-500 bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">Select room…</option>
                  {filteredRooms.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name}{r.is_let_only ? ' — Let Only' : ''}{r.current_asking_rent ? ` (£${r.current_asking_rent}/mo)` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-neutral-400">* Name, room, and at least email or phone are required</p>
            </div>
          )}
        </div>

        {/* Step 2 — Choose what to send */}
        {(selected || manualMode) && (
          <div className="bg-white rounded-xl border border-neutral-200 p-lg mb-lg">
            <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide mb-md">
              2 · What to send
            </h2>
            <div className="grid grid-cols-3 gap-md mb-lg">
              <button
                type="button"
                onClick={() => setMode('apply')}
                className={`p-md rounded-xl border-2 text-left transition-all ${mode === 'apply' ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 hover:border-neutral-300'}`}
              >
                <div className="text-lg mb-xs">📋</div>
                <p className="text-sm font-semibold text-neutral-900">Make an offer</p>
                <p className="text-xs text-neutral-500 mt-xs">Send the application form. You review it, then decide whether to accept.</p>
              </button>
              <button
                type="button"
                onClick={() => setMode('fasttrack')}
                className={`p-md rounded-xl border-2 text-left transition-all ${mode === 'fasttrack' ? 'border-amber-500 bg-amber-50' : 'border-neutral-200 hover:border-neutral-300'}`}
              >
                <div className="text-lg mb-xs">⚡</div>
                <p className="text-sm font-semibold text-neutral-900">Fast-track</p>
                <p className="text-xs text-neutral-500 mt-xs">They fill in their details then go straight to paying the holding deposit — no review step.</p>
              </button>
              <button
                type="button"
                onClick={() => setMode('reserve')}
                className={`p-md rounded-xl border-2 text-left transition-all ${mode === 'reserve' ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 hover:border-neutral-300'}`}
              >
                <div className="text-lg mb-xs">🎉</div>
                <p className="text-sm font-semibold text-neutral-900">Reserve only</p>
                <p className="text-xs text-neutral-500 mt-xs">Send holding deposit details directly. Use after you&apos;ve already accepted an offer.</p>
              </button>
            </div>
            <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide mb-md">
              3 · Send via
            </h2>
            <div className="grid grid-cols-3 gap-md">
              {(['email', 'sms', 'both'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`p-md rounded-lg border-2 text-sm font-medium transition-all capitalize ${
                    method === m
                      ? 'border-neutral-900 bg-neutral-900 text-white'
                      : 'border-neutral-200 text-neutral-700 hover:border-neutral-400'
                  }`}
                >
                  {m === 'email' ? '✉ Email' : m === 'sms' ? '📱 SMS' : '✉ + 📱 Both'}
                </button>
              ))}
            </div>

            {/* Contact preview */}
            <div className="mt-md p-md bg-neutral-50 rounded-lg border border-neutral-200 text-sm space-y-xs">
              <div className="flex gap-md">
                <span className="text-neutral-500 w-16 shrink-0">Email</span>
                <span className="text-neutral-900 font-medium">
                  {contactEmail || <span className="text-neutral-400 italic">not recorded</span>}
                </span>
              </div>
              <div className="flex gap-md">
                <span className="text-neutral-500 w-16 shrink-0">Phone</span>
                <span className="text-neutral-900 font-medium">
                  {contactPhone || <span className="text-neutral-400 italic">not recorded</span>}
                </span>
              </div>
            </div>

            <button
              onClick={send}
              disabled={sending || !canSend}
              className="mt-md w-full bg-neutral-900 text-white py-sm rounded-lg font-semibold text-sm hover:bg-neutral-800 disabled:opacity-50 transition-colors"
            >
              {sending ? 'Sending…' : 'Send Invitation'}
            </button>

            {/* Result — inline, right under the button */}
            {result && (
              <div ref={resultRef} className="mt-md rounded-lg border border-neutral-200 bg-neutral-50 p-md space-y-sm">
                {result.emailSent && (
                  <div className="flex items-center gap-sm text-green-700 text-sm font-semibold">
                    <span>✓</span> Email sent to {contactEmail}
                  </div>
                )}
                {result.emailError && (
                  <div className="text-amber-700 text-sm font-medium">⚠ Email: {result.emailError}</div>
                )}
                {result.smsSent && (
                  <div className="flex items-center gap-sm text-green-700 text-sm font-semibold">
                    <span>✓</span> SMS sent to {contactPhone}
                  </div>
                )}
                {result.smsError && (
                  <div className="text-amber-700 text-sm font-medium">⚠ SMS: {result.smsError}</div>
                )}
                {!result.emailSent && !result.emailError && !result.smsSent && !result.smsError && !result.link && (
                  <div className="text-red-700 text-sm font-medium bg-red-50 border border-red-200 rounded-lg px-md py-sm">
                    {result.error ? `Error: ${result.error}` : `Unexpected response: ${JSON.stringify(result)}`}
                  </div>
                )}
                {result.link && (
                  <div className="pt-xs border-t border-neutral-200">
                    <p className="text-xs text-neutral-500 mb-xs">Application link (copy to share manually):</p>
                    <div className="flex items-center gap-sm">
                      <p className="text-xs text-neutral-600 bg-white px-sm py-xs rounded border border-neutral-200 flex-1 break-all">
                        {result.link}
                      </p>
                      <button
                        onClick={copyLink}
                        className="shrink-0 text-xs font-medium bg-neutral-900 text-white px-sm py-xs rounded hover:bg-neutral-800 transition-colors"
                      >
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
