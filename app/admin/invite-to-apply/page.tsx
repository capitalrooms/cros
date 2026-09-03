'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function InviteToApplyPage() {
  const [viewings, setViewings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any | null>(null)
  const [manualMode, setManualMode] = useState(false)
  const [manual, setManual] = useState({ name: '', email: '', phone: '', roomLabel: '', address: '' })
  const [method, setMethod] = useState<'email' | 'sms' | 'both'>('email')
  const [mode, setMode] = useState<'apply' | 'reserve'>('apply')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<any | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const load = async () => {
      const since = new Date()
      since.setDate(since.getDate() - 60)
      const { data } = await supabase
        .from('viewings')
        .select('id, visitor_name, visitor_email, visitor_phone, viewing_date, viewing_slot, room_id, property_id, rooms(name), properties(name, address)')
        .gte('viewing_date', since.toISOString().split('T')[0])
        .order('viewing_date', { ascending: false })
      setViewings(data || [])
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
    ? manual.name.trim() && (manual.email.trim() || manual.phone.trim())
    : !!selected

  const send = async () => {
    if (!canSend) return
    setSending(true)
    setResult(null)

    const body = manualMode
      ? { manual: { name: manual.name, email: manual.email, phone: manual.phone, roomLabel: manual.roomLabel, address: manual.address }, method, mode }
      : { viewingId: selected.id, method, mode }

    const res = await fetch('/api/lettings/invite-to-apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setResult(data)
    setSending(false)
  }

  const copyLink = async () => {
    if (!result?.link) return
    await navigator.clipboard.writeText(result.link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin" />} />
      <div className="mx-auto max-w-2xl py-xl px-lg">
        <div className="mb-lg">
          <h1 className="text-2xl font-bold text-neutral-900">📨 Invite to Apply</h1>
          <p className="text-sm text-neutral-500 mt-xs">
            Send a personalised application link by email or SMS after a viewing.
          </p>
        </div>

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
                        <p className="text-sm font-semibold text-neutral-900">
                          {v.visitor_name || 'Unknown visitor'}
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
                <div>
                  <label className="text-xs font-medium text-neutral-600 block mb-xs">Name *</label>
                  <input
                    type="text"
                    value={manual.name}
                    onChange={e => setManual(m => ({ ...m, name: e.target.value }))}
                    placeholder="e.g. Sarah Johnson"
                    className="w-full text-sm border border-neutral-300 rounded-lg px-sm py-xs focus:outline-none focus:border-neutral-500 bg-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-600 block mb-xs">Email</label>
                  <input
                    type="email"
                    value={manual.email}
                    onChange={e => setManual(m => ({ ...m, email: e.target.value }))}
                    placeholder="e.g. sarah@email.com"
                    className="w-full text-sm border border-neutral-300 rounded-lg px-sm py-xs focus:outline-none focus:border-neutral-500 bg-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-600 block mb-xs">Phone</label>
                  <input
                    type="tel"
                    value={manual.phone}
                    onChange={e => setManual(m => ({ ...m, phone: e.target.value }))}
                    placeholder="e.g. 07700 900000"
                    className="w-full text-sm border border-neutral-300 rounded-lg px-sm py-xs focus:outline-none focus:border-neutral-500 bg-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-600 block mb-xs">Room (optional)</label>
                  <input
                    type="text"
                    value={manual.roomLabel}
                    onChange={e => setManual(m => ({ ...m, roomLabel: e.target.value }))}
                    placeholder="e.g. Room 3"
                    className="w-full text-sm border border-neutral-300 rounded-lg px-sm py-xs focus:outline-none focus:border-neutral-500 bg-white"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-neutral-600 block mb-xs">Property address (optional)</label>
                <input
                  type="text"
                  value={manual.address}
                  onChange={e => setManual(m => ({ ...m, address: e.target.value }))}
                  placeholder="e.g. 4 Willis Road, London, E15 3HH"
                  className="w-full text-sm border border-neutral-300 rounded-lg px-sm py-xs focus:outline-none focus:border-neutral-500 bg-white"
                />
              </div>
              <p className="text-xs text-neutral-400">* At least name + email or phone required</p>
            </div>
          )}
        </div>

        {/* Step 2 — Choose what to send */}
        {(selected || manualMode) && (
          <div className="bg-white rounded-xl border border-neutral-200 p-lg mb-lg">
            <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide mb-md">
              2 · What to send
            </h2>
            <div className="grid grid-cols-2 gap-md mb-lg">
              <button
                type="button"
                onClick={() => setMode('apply')}
                className={`p-md rounded-xl border-2 text-left transition-all ${mode === 'apply' ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 hover:border-neutral-300'}`}
              >
                <div className="text-lg mb-xs">📋</div>
                <p className="text-sm font-semibold text-neutral-900">Invite to Apply</p>
                <p className="text-xs text-neutral-500 mt-xs">Send the application form link. Good when you have lots of interest.</p>
              </button>
              <button
                type="button"
                onClick={() => setMode('reserve')}
                className={`p-md rounded-xl border-2 text-left transition-all ${mode === 'reserve' ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 hover:border-neutral-300'}`}
              >
                <div className="text-lg mb-xs">🎉</div>
                <p className="text-sm font-semibold text-neutral-900">Reserve the Room</p>
                <p className="text-xs text-neutral-500 mt-xs">Send holding deposit details. Use when you&apos;re ready to offer the room.</p>
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
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="bg-white rounded-xl border border-neutral-200 p-lg space-y-sm">
            {result.emailSent && (
              <div className="flex items-center gap-sm text-green-700 text-sm font-medium">
                <span>✓</span> Email sent to {contactEmail}
              </div>
            )}
            {result.emailError && (
              <div className="text-amber-700 text-sm">⚠ Email: {result.emailError}</div>
            )}
            {result.smsSent && (
              <div className="flex items-center gap-sm text-green-700 text-sm font-medium">
                <span>✓</span> SMS sent to {contactPhone}
              </div>
            )}
            {result.smsError && (
              <div className="text-amber-700 text-sm">⚠ SMS: {result.smsError}</div>
            )}
            {result.link && (
              <div className="mt-sm">
                <p className="text-xs text-neutral-500 mb-xs">Link (copy to share manually):</p>
                <div className="flex items-center gap-sm">
                  <p className="text-xs text-neutral-600 bg-neutral-50 px-sm py-xs rounded border border-neutral-200 flex-1 break-all">
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
    </div>
  )
}
