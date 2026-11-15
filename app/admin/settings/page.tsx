'use client'
import Link from 'next/link'
import { adminFetch } from '@/lib/adminFetch'

import { useState, useEffect } from 'react'
import { isOfficeRole } from '@/lib/access/areas'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'
import LineIcon from '@/components/LineIcon'
import DataProtection from './components/DataProtection'
import { REQUEST_ITEMS, OK_SETTING } from '@/lib/applicants/requests'

interface Setting {
  key: string
  value: string
  updated_at: string
}


export default function AdminSettingsPage() {
  const router = useRouter()
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState<string | null>(null)
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [banner, setBanner]     = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser()
      if (!user || !isOfficeRole(user.assignment?.role)) {
        router.push('/login')
        return
      }
      await loadSettings()
      setLoading(false)
    }
    init()
  }, [router])

  async function loadSettings() {
    const res = await fetch('/api/admin/settings')
    const json = await res.json()
    const map: Record<string, string> = {}
    for (const s of (json.settings || [])) map[s.key] = s.value
    setSettings(map)
  }

  // room requests the office is happy to agree without looking first (lib/applicants/requests)
  const okList: string[] = (() => { try { const v = JSON.parse(settings[OK_SETTING] ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] } })()
  async function saveOk(next: string[]) {
    setSaving(OK_SETTING); setBanner(null)
    try {
      const value = JSON.stringify(next)
      const res = await fetch('/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: OK_SETTING, value }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Could not save')
      setSettings(prev => ({ ...prev, [OK_SETTING]: value }))
    } catch (e: any) { setBanner({ type: 'err', text: e.message }) } finally { setSaving(null) }
  }

  async function saveGrace(v: string) {
    setSaving('rent_grace_days'); setBanner(null)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'rent_grace_days', value: v }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Could not save')
      setSettings(prev => ({ ...prev, rent_grace_days: v }))
      setBanner({ type: 'ok', text: `Saved — unpaid rent now counts as overdue ${v} day${v === '1' ? '' : 's'} after it’s due.` })
    } catch (e: any) {
      setBanner({ type: 'err', text: e.message })
    } finally { setSaving(null) }
  }

  if (loading) return <GenericPageSkeleton />

  const commsLive = settings['comms_live'] === 'true'
  const grace = settings['rent_grace_days'] ?? '5'
  const ledgerStart = settings['client_ledger_start']

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar />
      <PageHero eyebrow="Office" title="Office settings" subtitle="Settings for the whole of Capital Rooms — they apply to everyone, straight away. Your own details are under your name, top right." />
      <main className="mx-auto max-w-6xl px-lg py-xl">
        <BackButton href="/admin" label="Dashboard" />

        {banner && (
          <div className={`rounded-xl px-lg py-md mb-lg text-sm font-semibold border ${
            banner.type === 'ok'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {banner.text}
          </div>
        )}

        {/* the sections on this page, so each is one tap away (14 Nov 2026 tidy) */}
        <nav aria-label="On this page" className="mb-lg flex flex-wrap gap-xs">
          {[['messages', 'Tenant messages'], ['rent', 'Rent & records'], ['lettings', 'Lettings'], ['emails', 'Emails'], ['privacy', 'Data protection'], ['elsewhere', 'Other office settings']].map(([id, label]) => (
            <a key={id} href={`#${id}`} className="rounded-full bg-white px-md py-xs text-sm font-semibold text-neutral-800 ring-1 ring-neutral-200 hover:ring-neutral-900">{label}</a>
          ))}
        </nav>

        {/* ── Notifications now live in one place: /admin/notifications (14 Nov 2026, Harry: "we have too many places to go
            to simply control what and who gets notifications") ── */}
        <div id="messages" className="scroll-mt-lg" />
        <a href="/admin/notifications" className="mb-lg flex items-center justify-between gap-lg rounded-2xl border border-neutral-200 bg-white px-lg py-md hover:border-neutral-900">
          <span>
            <span className="block text-base font-bold text-neutral-900">Notifications — who gets what</span>
            <span className="mt-xs block text-xs text-neutral-500">Tenants (everyone or property by property), landlords, contractors, cleaners and the office — all in one list. Tenant automatic messages are {commsLive ? 'on for every property' : 'paused, except properties switched on'}.</span>
          </span>
          <span aria-hidden="true" className="text-xl text-neutral-400">→</span>
        </a>

        {/* ── Your records: the two set-up dates (lib/finance/dates; 14 Oct 2026) ── */}
        <div id="rent" className="scroll-mt-lg" />
        <RecordsDates onSaved={(text) => { setBanner({ type: 'ok', text }); loadSettings() }} onError={(text) => setBanner({ type: 'err', text })} />

        {/* ── Rent ── */}
        <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden mb-lg">
          <div className="px-lg py-md border-b border-neutral-100">
            <h2 className="font-bold text-neutral-900 text-base">Rent</h2>
            <p className="text-xs text-neutral-500 mt-xs">
              {ledgerStart
                ? <>CROS collects rent from <strong>{new Date(ledgerStart + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>. Earlier months are your import period — what you already collected and paid, copied in from your statements — and never count as arrears.</>
                : 'When CROS starts collecting rent.'}
            </p>
          </div>
          <div className="px-lg py-lg flex flex-wrap items-center gap-md">
            <label htmlFor="grace" className="flex-1 min-w-[220px]">
              <span className="block text-sm font-semibold text-neutral-900">Grace period</span>
              <span className="block text-xs text-neutral-500 mt-xs">Days after rent is due before an unpaid charge counts as overdue and appears in Arrears. Bank transfers can take a day or two.</span>
            </label>
            <select id="grace" value={grace} disabled={saving === 'rent_grace_days'} onChange={e => saveGrace(e.target.value)}
              className="rounded-xl border border-neutral-300 bg-white px-md py-sm text-sm text-neutral-900">
              {[0, 1, 2, 3, 5, 7, 10, 14].map(n => <option key={n} value={String(n)}>{n === 0 ? 'None — overdue on the due date' : `${n} day${n === 1 ? '' : 's'}`}</option>)}
            </select>
            {saving === 'rent_grace_days' && <span className="text-xs text-neutral-400">Saving…</span>}
          </div>
        </div>

        {/* ── Room requests on the application form ── */}
        <div id="lettings" className="scroll-mt-lg" />
        <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden mb-lg">
          <div className="px-lg py-md border-b border-neutral-100">
            <h2 className="font-bold text-neutral-900 text-base">Room requests</h2>
            <p className="text-xs text-neutral-500 mt-xs">On the application form, applicants say whether they’d need anything provided or changed. Tick what you’re happy to agree without looking first — an offer asking only for ticked items can still go straight to reserving. Anything else, anything they describe in their own words, and any offer below the asking rent comes to you to review before they can pay.</p>
          </div>
          <div className="px-lg py-lg flex flex-wrap gap-sm">
            {REQUEST_ITEMS.map(i => {
              const on = okList.includes(i.key)
              return (
                <button key={i.key} type="button" disabled={saving === OK_SETTING} onClick={() => saveOk(on ? okList.filter(k => k !== i.key) : [...okList, i.key])}
                  className={`rounded-full border px-md py-xs text-sm font-semibold ${on ? 'border-emerald-700 bg-emerald-50 text-emerald-800' : 'border-neutral-300 text-neutral-600 hover:bg-neutral-50'}`}>
                  {on ? '✓ ' : ''}{i.label}
                </button>
              )
            })}
            <p className="w-full text-xs text-neutral-500">{okList.length ? `Agreed without review: ${REQUEST_ITEMS.filter(i => okList.includes(i.key)).map(i => i.label.replace(/^A /, '')).join(', ')}.` : 'Nothing is agreed without review at the moment — every request comes to you first.'}</p>
          </div>
        </div>

        <div id="privacy" className="scroll-mt-lg" />
        <DataProtection />

        {/* ── Emails ── */}
        <div id="emails" className="scroll-mt-lg" />
        <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden mb-lg">
          <div className="px-lg py-md border-b border-neutral-100">
            <h2 className="font-bold text-neutral-900 text-base">Email Signatures</h2>
          </div>
          <div className="px-lg py-lg flex items-center gap-lg">
            <div className="flex-1">
              <p className="text-sm font-semibold text-neutral-900">Gmail signatures in the house style</p>
              <p className="text-xs text-neutral-500 mt-xs">Make a signature for anyone on the team — name, job title, mobile and email filled in — ready to paste into Gmail.</p>
            </div>
            <Link href="/admin/settings/signatures"
              className="shrink-0 rounded-xl bg-neutral-900 px-lg py-sm text-sm font-semibold text-white hover:bg-neutral-700 transition-colors">
              Make a signature →
            </Link>
          </div>
        </div>

        {/* ── Email Branding — moved ── */}
        <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden mb-lg">
          <div className="px-lg py-md border-b border-neutral-100">
            <h2 className="font-bold text-neutral-900 text-base">Email Branding</h2>
          </div>

          <div className="px-lg py-lg flex items-center gap-lg">
            <div className="text-2xl"><LineIcon glyph="🎨" /></div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-neutral-900">Moved to Message Templates</p>
              <p className="text-xs text-neutral-500 mt-xs">
                Logo, theme, and business contact details are now edited in the{' '}
                <strong>Branding &amp; Contact Details</strong> tab — alongside all the other outbound email settings.
              </p>
            </div>
            <a
              href="/admin/message-templates"
              className="shrink-0 rounded-xl bg-neutral-900 px-lg py-sm text-sm font-semibold text-white hover:bg-neutral-700 transition-colors"
            >
              Go to Message Templates →
            </a>
          </div>
        </div>

        {/* ── Other office settings — kept with the things they control ── */}
        <div id="elsewhere" className="scroll-mt-lg bg-white rounded-2xl border border-neutral-200 overflow-hidden mb-lg">
          <div className="px-lg py-md border-b border-neutral-100">
            <h2 className="font-bold text-neutral-900 text-base">Other office settings</h2>
            <p className="text-xs text-neutral-500 mt-xs">Set where you use them.</p>
          </div>
          <ul className="divide-y divide-neutral-100">
            {[
              ['/admin/emergencies', 'Emergencies', 'Who’s on the emergency list, how long contractors have to answer, the call-out cost limit'],
              ['/admin/email-hub', 'Email looks', 'The theme every email goes out in — for all, on set dates, or per email'],
              ['/admin/people?tab=office', 'Staff and access', 'Who’s in the office team and what each person can open'],
              ['/admin/message-templates', 'Message templates', 'The wording of automatic messages, branding and contact details'],
            ].map(([href, title, note]) => (
              <li key={href}><Link href={href} className="flex items-center justify-between gap-md px-lg py-md hover:bg-neutral-50">
                <span><span className="block text-sm font-semibold text-neutral-900">{title}</span><span className="block text-xs text-neutral-500">{note}</span></span>
                <span className="text-neutral-400" aria-hidden="true">›</span>
              </Link></li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  )
}

// Your records — when the books start in CROS, and when CROS starts collecting rent. Chosen once when an agency starts.
function RecordsDates({ onSaved, onError }: { onSaved: (t: string) => void; onError: (t: string) => void }) {
  const [d, setD] = useState<{ recordsStart: string; ledgerStart: string } | null>(null)
  const [records, setRecords] = useState('')
  const [ledger, setLedger] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    fetch('/api/admin/finance-dates').then(r => r.json()).then(j => { if (j.recordsStart) { setD(j); setRecords(j.recordsStart.slice(0, 7)); setLedger(j.ledgerStart.slice(0, 7)) } }).catch(() => null)
  }, [])
  if (!d) return null
  const long = (m: string) => new Date(`${m}-01T12:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const changed = records !== d.recordsStart.slice(0, 7) || ledger !== d.ledgerStart.slice(0, 7)
  const bad = !!records && !!ledger && records > ledger
  async function save() {
    if (ledger !== d!.ledgerStart.slice(0, 7) && !confirm(`Change when CROS starts collecting rent to ${long(ledger)}? Arrears, bank matching and the client account will count from then.`)) return
    setBusy(true)
    try {
      const r = await fetch('/api/admin/finance-dates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recordsStart: `${records}-01`, ledgerStart: `${ledger}-01` }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Not saved')
      setD(j); onSaved(`Saved — your records start ${long(records)}; CROS collects rent from ${long(ledger)}.`)
    } catch (e: any) { onError(e.message) } finally { setBusy(false) }
  }
  const input = 'rounded-xl border border-neutral-300 bg-white px-md py-sm text-base sm:text-sm text-neutral-900'
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden mb-lg">
      <div className="px-lg py-md border-b border-neutral-100">
        <h2 className="font-bold text-neutral-900 text-base">Your records</h2>
        <p className="text-xs text-neutral-500 mt-xs">Set once, when you start using CROS. Tenancies can begin long before either date — you only need statements and rent records from these months on.</p>
      </div>
      <div className="px-lg py-lg grid gap-lg md:grid-cols-2">
        <label className="flex flex-col gap-xs">
          <span className="text-sm font-semibold text-neutral-900">Your records start</span>
          <span className="text-xs text-neutral-500">The first month you keep the books in CROS. Landlord statements are expected from this month. Months before it aren’t needed.</span>
          <input type="month" className={input} value={records} max={ledger || undefined} onChange={e => setRecords(e.target.value)} />
        </label>
        <label className="flex flex-col gap-xs">
          <span className="text-sm font-semibold text-neutral-900">CROS collects rent from</span>
          <span className="text-xs text-neutral-500">The month CROS takes over collecting rent. Before it, upload the statements from your old system; from it, CROS prepares them, and arrears and bank matching start.</span>
          <input type="month" className={input} value={ledger} min={records || undefined} onChange={e => setLedger(e.target.value)} />
        </label>
      </div>
      <div className="px-lg pb-lg flex flex-wrap items-center gap-md">
        <button type="button" onClick={save} disabled={!changed || bad || busy} className="rounded-xl bg-neutral-900 px-lg py-sm text-sm font-semibold text-white disabled:opacity-40">{busy ? 'Saving…' : 'Save dates'}</button>
        {bad ? <span className="text-xs text-red-700">Your records can’t start after CROS starts collecting rent.</span>
          : <span className="text-xs text-neutral-500">Statements to upload: {long(records)} – {ledger > records ? long(new Date(Date.UTC(+ledger.slice(0, 4), +ledger.slice(5, 7) - 2, 1)).toISOString().slice(0, 7)) : '—'}. See Finance › Statements.</span>}
      </div>
    </div>
  )
}

