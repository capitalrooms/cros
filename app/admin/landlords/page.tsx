'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton';
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading';
import { nameFields, displayName } from '@/lib/people';

// All notification categories available to landlords
const NOTIF_CATEGORIES: { key: string; label: string; description: string; mandatory?: boolean }[] = [
  { key: 'urgent',               label: '🚨 Urgent issues',            description: 'Emergency maintenance, gas/fire/flood — always on', mandatory: true },
  { key: 'job_approval',         label: '✅ Job approvals',             description: 'Large or costly jobs requiring your sign-off' },
  { key: 'job_updates',          label: '🔧 Job updates',               description: 'Contractor booked, job completed, photos ready' },
  { key: 'rent_received',        label: '💷 Rent received',             description: 'Monthly rent payment confirmed' },
  { key: 'rent_arrears',         label: '⚠️ Rent arrears',              description: 'Tenant is late or in arrears' },
  { key: 'financial_statements', label: '📄 Monthly statements',        description: 'Statement available to view and download' },
  { key: 'compliance_expiry',    label: '📋 Compliance expiry',         description: 'Certificates expiring within 60 days' },
  { key: 'compliance_breach',    label: '🔴 Compliance breach',         description: 'Issue found requiring attention' },
  { key: 'tenant_changes',       label: '🏠 Tenant changes',            description: 'New tenant, notice given, move-out confirmed' },
  { key: 'cleaner_visits',       label: '🧹 Cleaner visits',            description: 'Cleaning scheduled and completion reports' },
  { key: 'viewings',             label: '👀 Viewings',                  description: 'Viewing booked at your property' },
]

interface Landlord {
  id: string;
  email: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  aml_risk_level?: 'low' | 'medium' | 'high';
  aml_risk_notes?: string;
  landlord_comms_enabled?: boolean;
  created_at: string;
}

interface AmlRecord {
  id: string;
  is_refresh: boolean;
  stage: number;
  created_at: string;
  docs_received_at: string | null;
  welcome_sent_at: string | null;
}

// How many months before AML is considered "due" for refresh
const AML_REVIEW_MONTHS = 24

function amlStatus(records: AmlRecord[]): { label: string; colour: string; lastCompleted: Date | null; dueDate: Date | null } {
  const completed = records.filter(r => r.stage >= 3 && r.docs_received_at)
  if (completed.length === 0) {
    return { label: 'Not on record', colour: 'text-neutral-400 bg-neutral-100', lastCompleted: null, dueDate: null }
  }
  const last = new Date(completed[0].docs_received_at!)
  const due = new Date(last)
  due.setMonth(due.getMonth() + AML_REVIEW_MONTHS)
  const now = new Date()
  const monthsUntilDue = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30)

  if (monthsUntilDue < 0) return { label: 'Overdue', colour: 'text-red-700 bg-red-100', lastCompleted: last, dueDate: due }
  if (monthsUntilDue < 3) return { label: 'Due soon', colour: 'text-amber-700 bg-amber-100', lastCompleted: last, dueDate: due }
  return { label: 'Up to date', colour: 'text-green-700 bg-green-100', lastCompleted: last, dueDate: due }
}

function fmtDate(d: Date | null) {
  if (!d) return '—'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function LandlordsPage() {
  const router = useRouter();
  const [landlords, setLandlords] = useState<Landlord[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [amlMap, setAmlMap] = useState<Record<string, AmlRecord[]>>({});
  // Track which landlords have registered on the app (push_subscriptions row exists)
  const [registeredSet, setRegisteredSet] = useState<Set<string>>(new Set());
  // Notification prefs per landlord: { [landlordId]: { [category]: boolean } }
  const [prefsMap, setPrefsMap] = useState<Record<string, Record<string, boolean>>>({});
  const [savingPrefs, setSavingPrefs] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [selectedLandlord, setSelectedLandlord] = useState<Landlord | null>(null);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [riskEdits, setRiskEdits] = useState<Record<string, { level: string; notes: string }>>({});
  const [savingRisk, setSavingRisk] = useState<string | null>(null);
  const [invitingApp, setInvitingApp] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<Record<string, { ok: boolean; msg: string }>>({});

  const [formData, setFormData] = useState({
    email: '',
    first_name: '',
    last_name: '',
    selectedProperties: [] as string[],
  });

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser();
      if (!data || (data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin')) {
        router.push('/login');
        return;
      }

      const supabase = createClient();

      const { data: landlordData } = await supabase
        .from('people')
        .select('id, email, full_name, first_name, last_name, phone, created_at, aml_risk_level, aml_risk_notes, landlord_comms_enabled')
        .eq('role', 'landlord')
        .order('created_at', { ascending: false });

      const list: Landlord[] = landlordData || [];
      setLandlords(list);

      // Check which landlords have push_subscriptions (= registered on app)
      if (list.length > 0) {
        const ids = list.map(l => l.id)
        const { data: subs } = await supabase
          .from('push_subscriptions')
          .select('person_id')
          .in('person_id', ids)
        setRegisteredSet(new Set((subs || []).map((s: any) => s.person_id)))

        // Fetch AML records per landlord
        const map: Record<string, AmlRecord[]> = {}
        await Promise.all(list.map(async l => {
          try {
            const r = await fetch(`/api/landlord-aml-refresh?landlordId=${l.id}`)
            const d = await r.json()
            map[l.id] = d.records ?? []
          } catch { map[l.id] = [] }
        }))
        setAmlMap(map)

        // Fetch notification prefs
        const { data: prefsData } = await supabase
          .from('landlord_notification_prefs')
          .select('person_id, category, enabled')
          .in('person_id', ids)

        const pm: Record<string, Record<string, boolean>> = {}
        for (const row of (prefsData || [])) {
          if (!pm[row.person_id]) pm[row.person_id] = {}
          pm[row.person_id][row.category] = row.enabled
        }
        setPrefsMap(pm)
      }

      const { data: propsData } = await supabase
        .from('properties')
        .select('id, name, address, bedrooms')
        .order('name');

      setProperties(propsData || []);
      setLoading(false);
    }
    init();
  }, [router]);

  async function handleAddLandlord() {
    if (!formData.email || !formData.first_name) {
      alert('Please fill in email and first name');
      return;
    }

    const supabase = createClient();
    const names = nameFields(formData.first_name, formData.last_name);

    const { data: landlord, error } = await supabase
      .from('people')
      .insert({ email: formData.email, ...names, role: 'landlord', landlord_comms_enabled: false })
      .select()
      .single();

    if (error) { alert(`Error: ${error.message}`); return; }

    for (const propertyId of formData.selectedProperties) {
      await supabase.from('properties').update({ landlord_id: landlord.id }).eq('id', propertyId)
    }

    setSuccessMessage(`✓ Landlord added: ${names.full_name}`);
    setFormData({ email: '', first_name: '', last_name: '', selectedProperties: [] });
    setShowInviteForm(false);

    const { data: updated } = await supabase
      .from('people')
      .select('id, email, name, phone, created_at, aml_risk_level, aml_risk_notes, landlord_comms_enabled')
      .eq('role', 'landlord')
      .order('created_at', { ascending: false });
    setLandlords(updated || []);
    setTimeout(() => setSuccessMessage(''), 3000);
  }

  async function saveRiskAssessment(landlord: Landlord) {
    const edit = riskEdits[landlord.id]
    if (!edit?.level) return
    setSavingRisk(landlord.id)
    const supabase = createClient()
    await supabase.from('people').update({
      aml_risk_level: edit.level,
      aml_risk_notes: edit.notes || null,
    }).eq('id', landlord.id)
    setLandlords(prev => prev.map(l => l.id === landlord.id
      ? { ...l, aml_risk_level: edit.level as any, aml_risk_notes: edit.notes }
      : l
    ))
    setSavingRisk(null)
  }

  async function requestAmlRefresh(landlord: Landlord) {
    setSending(true)
    setSendResult(null)
    try {
      const res = await fetch('/api/landlord-aml-refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ landlordId: landlord.id, reason: 'periodic_review' }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed')
      setSendResult({ ok: true, msg: d.emailSent ? 'Re-verification email sent.' : `Form created but email failed: ${d.emailError}` })
      const r = await fetch(`/api/landlord-aml-refresh?landlordId=${landlord.id}`)
      const rd = await r.json()
      setAmlMap(prev => ({ ...prev, [landlord.id]: rd.records ?? [] }))
    } catch (e) {
      setSendResult({ ok: false, msg: e instanceof Error ? e.message : 'Error' })
    } finally {
      setSending(false)
    }
  }

  async function sendAppInvite(landlord: Landlord) {
    setInvitingApp(landlord.id)
    setInviteResult(prev => ({ ...prev, [landlord.id]: { ok: false, msg: '' } }))
    try {
      const res = await fetch('/api/invite-landlord', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId: landlord.id }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed')
      setInviteResult(prev => ({ ...prev, [landlord.id]: { ok: true, msg: `Invite sent to ${d.sentTo}` } }))
    } catch (e) {
      setInviteResult(prev => ({ ...prev, [landlord.id]: { ok: false, msg: e instanceof Error ? e.message : 'Error' } }))
    } finally {
      setInvitingApp(null)
    }
  }

  async function toggleMasterComms(landlord: Landlord) {
    const newVal = !landlord.landlord_comms_enabled
    const supabase = createClient()
    await supabase.from('people').update({ landlord_comms_enabled: newVal }).eq('id', landlord.id)

    // If enabling for first time and no prefs exist yet, seed all categories as enabled
    if (newVal && !prefsMap[landlord.id]) {
      const rows = NOTIF_CATEGORIES.map(c => ({ person_id: landlord.id, category: c.key, enabled: true }))
      await supabase.from('landlord_notification_prefs').upsert(rows, { onConflict: 'person_id,category' })
      const newPrefs: Record<string, boolean> = {}
      NOTIF_CATEGORIES.forEach(c => { newPrefs[c.key] = true })
      setPrefsMap(prev => ({ ...prev, [landlord.id]: newPrefs }))
    }

    setLandlords(prev => prev.map(l => l.id === landlord.id ? { ...l, landlord_comms_enabled: newVal } : l))
  }

  async function toggleCategory(landlordId: string, category: string, currentValue: boolean) {
    const newVal = !currentValue
    // Optimistic update
    setPrefsMap(prev => ({
      ...prev,
      [landlordId]: { ...prev[landlordId], [category]: newVal }
    }))
    const supabase = createClient()
    await supabase.from('landlord_notification_prefs').upsert(
      { person_id: landlordId, category, enabled: newVal, updated_at: new Date().toISOString() },
      { onConflict: 'person_id,category' }
    )
  }

  const togglePropertySelection = (propertyId: string) => {
    setFormData(prev => ({
      ...prev,
      selectedProperties: prev.selectedProperties.includes(propertyId)
        ? prev.selectedProperties.filter(id => id !== propertyId)
        : [...prev.selectedProperties, propertyId],
    }));
  };

  if (loading) return <GenericPageSkeleton />;

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin" />} />

      <main className="mx-auto max-w-6xl px-lg py-lg">
        <div className="mb-3xl flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900">Landlords</h1>
            <p className="mt-sm text-sm text-neutral-600">Manage landlords, AML compliance, and notification settings</p>
          </div>
          <button
            onClick={() => setShowInviteForm(!showInviteForm)}
            className="rounded-xl bg-neutral-900 px-lg py-md text-sm font-bold text-white hover:bg-neutral-800"
          >
            + Add Landlord
          </button>
        </div>

        {successMessage && (
          <div className="mb-lg rounded-xl bg-green-100 p-md text-sm text-green-700 font-semibold">{successMessage}</div>
        )}

        {/* Add Landlord Form */}
        {showInviteForm && (
          <div className="mb-3xl rounded-2xl border-2 border-neutral-900 bg-white p-lg">
            <h2 className="text-lg font-bold text-neutral-900 mb-md">Add New Landlord</h2>
            <div className="grid gap-md md:grid-cols-3 mb-md">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-xs">First Name</label>
                <input type="text" placeholder="John" value={formData.first_name}
                  onChange={e => setFormData({ ...formData, first_name: e.target.value })}
                  className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-xs">Last Name</label>
                <input type="text" placeholder="Smith" value={formData.last_name}
                  onChange={e => setFormData({ ...formData, last_name: e.target.value })}
                  className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-xs">Email</label>
                <input type="email" placeholder="john@example.com" value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm" />
              </div>
            </div>
            <div className="mb-md">
              <label className="block text-xs font-semibold text-neutral-700 mb-md">Select Properties</label>
              <div className="grid gap-sm md:grid-cols-2">
                {properties.map(prop => (
                  <label key={prop.id} className="flex items-start gap-sm p-md border border-neutral-200 rounded-lg cursor-pointer hover:bg-neutral-50">
                    <input type="checkbox" checked={formData.selectedProperties.includes(prop.id)}
                      onChange={() => togglePropertySelection(prop.id)} className="mt-xs" />
                    <div>
                      <p className="font-semibold text-sm text-neutral-900">{prop.name}</p>
                      <p className="text-xs text-neutral-600">{prop.address}</p>
                      <p className="text-xs text-neutral-500 mt-xs">{prop.bedrooms} bed HMO</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-md">
              <button onClick={handleAddLandlord}
                className="rounded-xl bg-neutral-900 px-lg py-sm text-sm font-bold text-white hover:bg-neutral-800">
                Add Landlord
              </button>
              <button onClick={() => setShowInviteForm(false)}
                className="rounded-xl border border-neutral-300 px-lg py-sm text-sm font-semibold hover:bg-neutral-50">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Landlords List */}
        {landlords.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
            <p className="text-sm text-neutral-500">No landlords added yet</p>
          </div>
        ) : (
          <div className="space-y-md">
            {landlords.map(landlord => {
              const records = amlMap[landlord.id] ?? []
              const aml = amlStatus(records)
              const isOpen = selectedLandlord?.id === landlord.id
              const isRegistered = registeredSet.has(landlord.id)
              const prefs = prefsMap[landlord.id] ?? {}

              return (
                <div key={landlord.id} className={`rounded-2xl border bg-white transition-all ${isOpen ? 'border-neutral-900 shadow-md' : 'border-neutral-200 hover:border-neutral-300'}`}>
                  {/* Card header — always visible */}
                  <button
                    className="w-full text-left p-lg"
                    onClick={() => setSelectedLandlord(isOpen ? null : landlord)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-md flex-wrap">
                          <h3 className="text-lg font-bold text-neutral-900">{displayName(landlord) || landlord.email}</h3>
                          <span className={`text-xs font-semibold px-sm py-xs rounded-full ${aml.colour}`}>
                            {aml.label}
                          </span>
                          {/* App registration badge */}
                          <span className={`text-xs font-semibold px-sm py-xs rounded-full ${isRegistered ? 'text-blue-700 bg-blue-100' : 'text-neutral-400 bg-neutral-100'}`}>
                            {isRegistered ? '📱 App active' : '📱 Not on app'}
                          </span>
                          {/* Comms status */}
                          {landlord.landlord_comms_enabled && (
                            <span className="text-xs font-semibold px-sm py-xs rounded-full text-emerald-700 bg-emerald-100">
                              🔔 Notifications on
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-neutral-500 mt-xs">{landlord.email}</p>
                      </div>
                      <div className="flex items-center gap-sm">
                        <a
                          href={`/admin/landlord/${landlord.id}`}
                          onClick={e => e.stopPropagation()}
                          className="text-xs font-semibold text-blue-600 hover:underline whitespace-nowrap"
                        >
                          Full profile →
                        </a>
                        <span className="text-neutral-400 text-lg">{isOpen ? '▲' : '▼'}</span>
                      </div>
                    </div>
                  </button>

                  {/* Expanded profile */}
                  {isOpen && (
                    <div className="border-t border-neutral-100 px-lg pb-lg">
                      <div className="grid md:grid-cols-2 gap-lg pt-lg">

                        {/* Contact info + App invite */}
                        <div>
                          <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-md">Contact</p>
                          <div className="space-y-sm text-sm text-neutral-700 mb-md">
                            <p>📧 {landlord.email}</p>
                            {landlord.phone && <p>📞 {landlord.phone}</p>}
                            <p className="text-neutral-400 text-xs">Added {fmtDate(new Date(landlord.created_at))}</p>
                          </div>

                          {/* App invite section */}
                          <div className={`rounded-xl p-md border ${isRegistered ? 'bg-blue-50 border-blue-200' : 'bg-neutral-50 border-neutral-200'}`}>
                            <p className="text-xs font-semibold text-neutral-700 mb-xs">
                              {isRegistered ? '📱 Landlord is active on the app' : '📱 Invite to app'}
                            </p>
                            {!isRegistered && (
                              <p className="text-xs text-neutral-500 mb-sm">
                                Sends a welcome email with a one-tap sign-in link and home screen install guide.
                              </p>
                            )}
                            {inviteResult[landlord.id]?.msg && (
                              <div className={`rounded-lg p-xs mb-sm text-xs font-semibold ${inviteResult[landlord.id].ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {inviteResult[landlord.id].msg}
                              </div>
                            )}
                            <button
                              onClick={() => sendAppInvite(landlord)}
                              disabled={invitingApp === landlord.id}
                              className="w-full rounded-xl bg-neutral-900 text-white py-sm text-xs font-semibold hover:bg-neutral-700 transition disabled:opacity-40"
                            >
                              {invitingApp === landlord.id ? 'Sending…' : isRegistered ? '↻ Re-send invite email' : '✉ Send invite to app'}
                            </button>
                          </div>
                        </div>

                        {/* AML status */}
                        <div>
                          <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-md">AML / CDD Record</p>

                          <div className={`rounded-xl p-md mb-md text-sm ${aml.lastCompleted ? 'bg-neutral-50 border border-neutral-200' : 'bg-amber-50 border border-amber-200'}`}>
                            {aml.lastCompleted ? (
                              <div className="space-y-xs">
                                <div className="flex justify-between">
                                  <span className="text-neutral-500">Last completed</span>
                                  <span className="font-semibold text-neutral-900">{fmtDate(aml.lastCompleted)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-neutral-500">Next due</span>
                                  <span className={`font-semibold ${aml.label === 'Overdue' ? 'text-red-600' : aml.label === 'Due soon' ? 'text-amber-600' : 'text-neutral-900'}`}>
                                    {fmtDate(aml.dueDate)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-neutral-500">Records on file</span>
                                  <span className="font-semibold text-neutral-900">{records.filter(r => r.stage >= 3).length}</span>
                                </div>
                              </div>
                            ) : (
                              <p className="text-amber-700 text-xs leading-relaxed">
                                No completed AML record found for this landlord. Send a re-verification request to collect their information.
                              </p>
                            )}
                          </div>

                          {sendResult && selectedLandlord?.id === landlord.id && (
                            <div className={`rounded-xl p-sm mb-sm text-xs font-semibold ${sendResult.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {sendResult.msg}
                            </div>
                          )}

                          <button
                            onClick={() => requestAmlRefresh(landlord)}
                            disabled={sending}
                            className="w-full rounded-xl bg-neutral-900 text-white py-sm text-sm font-semibold hover:bg-neutral-700 transition disabled:opacity-40 mb-sm"
                          >
                            {sending && selectedLandlord?.id === landlord.id
                              ? 'Sending…'
                              : aml.lastCompleted
                                ? '↻ Request AML Re-verification'
                                : '✉ Send AML Verification Request'}
                          </button>
                          <p className="text-xs text-neutral-400 mb-sm text-center">
                            Sends a secure, unique form link via email
                          </p>

                          <a
                            href={`/api/aml-report?landlordId=${landlord.id}&generatedBy=Capital+Rooms`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full block text-center rounded-xl border border-neutral-300 text-neutral-700 py-sm text-sm font-semibold hover:bg-neutral-50 transition"
                          >
                            ⬇ Download AML Compliance Report (PDF)
                          </a>
                        </div>
                      </div>

                      {/* Risk Assessment */}
                      <div className="mt-lg pt-lg border-t border-neutral-100">
                        <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-md">Risk Assessment</p>
                        <div className="grid grid-cols-3 gap-sm mb-md">
                          {(['low', 'medium', 'high'] as const).map(level => {
                            const current = riskEdits[landlord.id]?.level ?? landlord.aml_risk_level ?? ''
                            const colours = { low: 'border-green-500 bg-green-50 text-green-800', medium: 'border-amber-400 bg-amber-50 text-amber-800', high: 'border-red-500 bg-red-50 text-red-800' }
                            const inactive = 'border-neutral-200 bg-white text-neutral-500 hover:border-neutral-400'
                            return (
                              <button key={level}
                                onClick={() => setRiskEdits(prev => ({ ...prev, [landlord.id]: { level, notes: prev[landlord.id]?.notes ?? landlord.aml_risk_notes ?? '' } }))}
                                className={`rounded-xl border-2 py-sm text-sm font-bold capitalize transition ${current === level ? colours[level] : inactive}`}>
                                {level}
                              </button>
                            )
                          })}
                        </div>
                        <textarea
                          rows={2}
                          placeholder="Risk assessment notes (required for Medium/High)"
                          value={riskEdits[landlord.id]?.notes ?? landlord.aml_risk_notes ?? ''}
                          onChange={e => setRiskEdits(prev => ({ ...prev, [landlord.id]: { level: prev[landlord.id]?.level ?? landlord.aml_risk_level ?? 'low', notes: e.target.value } }))}
                          className="w-full rounded-xl border border-neutral-200 px-md py-sm text-sm mb-sm resize-none"
                        />
                        <button
                          onClick={() => saveRiskAssessment(landlord)}
                          disabled={savingRisk === landlord.id || !riskEdits[landlord.id]?.level}
                          className="rounded-xl border border-neutral-300 px-md py-xs text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 transition"
                        >
                          {savingRisk === landlord.id ? 'Saving…' : 'Save Risk Assessment'}
                        </button>
                      </div>

                      {/* ─── Notification Preferences ─── */}
                      <div className="mt-lg pt-lg border-t border-neutral-100">
                        <div className="flex items-center justify-between mb-md">
                          <div>
                            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Notifications</p>
                            <p className="text-xs text-neutral-400 mt-xs">
                              {landlord.landlord_comms_enabled
                                ? 'Landlord will receive notifications per the categories below'
                                : 'Notifications are paused — enable to start sending'}
                            </p>
                          </div>
                          {/* Master toggle */}
                          <button
                            onClick={() => toggleMasterComms(landlord)}
                            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none ${landlord.landlord_comms_enabled ? 'bg-emerald-500' : 'bg-neutral-300'}`}
                          >
                            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${landlord.landlord_comms_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                          </button>
                        </div>

                        {landlord.landlord_comms_enabled && (
                          <div className="rounded-xl border border-neutral-200 overflow-hidden">
                            {NOTIF_CATEGORIES.map((cat, i) => {
                              const isEnabled = cat.mandatory ? true : (prefs[cat.key] ?? true)
                              return (
                                <div key={cat.key} className={`flex items-center justify-between px-md py-sm ${i < NOTIF_CATEGORIES.length - 1 ? 'border-b border-neutral-100' : ''}`}>
                                  <div className="flex-1 min-w-0 mr-md">
                                    <p className="text-sm font-semibold text-neutral-800">{cat.label}</p>
                                    <p className="text-xs text-neutral-400">{cat.description}</p>
                                  </div>
                                  {cat.mandatory ? (
                                    <span className="text-xs text-neutral-400 italic">Always on</span>
                                  ) : (
                                    <button
                                      onClick={() => toggleCategory(landlord.id, cat.key, prefs[cat.key] ?? true)}
                                      className={`relative inline-flex h-6 w-10 flex-shrink-0 items-center rounded-full transition-colors ${isEnabled ? 'bg-emerald-500' : 'bg-neutral-300'}`}
                                    >
                                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isEnabled ? 'translate-x-5' : 'translate-x-1'}`} />
                                    </button>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {!landlord.landlord_comms_enabled && (
                          <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-md text-center">
                            <p className="text-xs text-neutral-400">Toggle the switch above to enable notifications for this landlord.</p>
                            <p className="text-xs text-neutral-400 mt-xs">All categories will be on by default — you can turn off individual ones after enabling.</p>
                          </div>
                        )}
                      </div>

                      {/* AML history */}
                      {records.length > 0 && (
                        <div className="mt-lg pt-lg border-t border-neutral-100">
                          <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-md">AML History</p>
                          <div className="space-y-xs">
                            {records.map(r => (
                              <div key={r.id} className="flex items-center justify-between text-xs text-neutral-600 py-xs border-b border-neutral-50">
                                <span>{r.is_refresh ? 'Re-verification' : 'Initial verification'}</span>
                                <span className="text-neutral-400">{fmtDate(new Date(r.created_at))}</span>
                                <span className={`font-semibold ${r.stage >= 3 ? 'text-green-600' : r.stage >= 2 ? 'text-amber-600' : 'text-neutral-400'}`}>
                                  {r.stage >= 3 ? 'Completed' : r.stage >= 2 ? 'Sent — awaiting' : 'Draft'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  );
}
