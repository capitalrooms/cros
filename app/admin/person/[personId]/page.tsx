'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { displayName, landlordName } from '@/lib/people'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Person {
  id: string
  first_name: string | null
  last_name: string | null
  full_name: string | null
  name: string | null
  email: string
  phone: string | null
  role: string
  company: string | null
  using_app: boolean | null
  created_at: string
}

interface Job {
  id: string
  title: string
  status: string
  booked_date: string | null
  created_at: string
  properties: { name: string; address: string } | null
  rooms: { name: string } | null
}

interface Clean {
  id: string
  status: string | null
  clean_date: string | null
  properties: { name: string; address: string } | null
}

interface Property {
  id: string
  name: string
  address: string
  property_code: string | null
  cc_emails: string | null
}

interface Statement {
  id: string
  statement_reference: string
  statement_date: string
  net_to_landlord: number
  properties: { name: string; address: string } | null
}

type Tab = 'profile' | 'work' | 'properties' | 'statements'

// ─── Role meta ────────────────────────────────────────────────────────────────

const ROLE_META: Record<string, { label: string; emoji: string; colour: string }> = {
  contractor: { label: 'Contractor', emoji: '👷', colour: 'bg-blue-100 text-blue-800' },
  cleaner:    { label: 'Cleaner',    emoji: '🧹', colour: 'bg-teal-100 text-teal-800' },
  landlord:   { label: 'Landlord',  emoji: '🤝', colour: 'bg-purple-100 text-purple-800' },
  administrator: { label: 'Admin',  emoji: '⚙️', colour: 'bg-neutral-200 text-neutral-700' },
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PersonPage({ params }: { params: Promise<{ personId: string }> }) {
  const router = useRouter()
  const { personId } = use(params)
  const supabase = createClient()

  const [loading, setLoading]     = useState(true)
  const [person, setPerson]       = useState<Person | null>(null)
  const [jobs, setJobs]           = useState<Job[]>([])
  const [cleans, setCleans]       = useState<Clean[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [statements, setStatements] = useState<Statement[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('profile')

  // Edit state
  const [editing, setEditing]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [editFirst, setEditFirst] = useState('')
  const [editLast, setEditLast]   = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editCompany, setEditCompany] = useState('')
  const [saveBanner, setSaveBanner]   = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser()
      if (!user || !['administrator', 'admin'].includes(user.assignment?.role || '')) {
        router.push('/login')
        return
      }

      const { data: p } = await supabase
        .from('people')
        .select('id, first_name, last_name, full_name, name, email, phone, role, company, using_app, created_at')
        .eq('id', personId)
        .maybeSingle()

      if (!p) { router.push('/admin/people'); return }
      setPerson(p as Person)

      // Redirect tenants to the richer tenant page
      if (p.role === 'tenant') {
        router.replace(`/admin/tenant/${personId}`)
        return
      }

      // Pre-fill edit form
      setEditFirst(p.first_name || '')
      setEditLast(p.last_name || '')
      setEditPhone(p.phone || '')
      setEditCompany(p.company || '')

      // Role-specific data
      if (p.role === 'contractor') {
        const { data: j } = await supabase
          .from('maintenance_tickets')
          .select('id, title, status, booked_date, created_at, properties(name, address), rooms(name)')
          .eq('contractor_id', personId)
          .order('created_at', { ascending: false })
          .limit(50)
        setJobs((j || []) as Job[])
      }

      if (p.role === 'cleaner') {
        const { data: c } = await supabase
          .from('cleans')
          .select('id, status, clean_date, properties(name, address)')
          .eq('cleaner_id', personId)
          .order('clean_date', { ascending: false })
          .limit(50)
        setCleans((c || []) as Clean[])
      }

      if (p.role === 'landlord') {
        const { data: pr } = await supabase
          .from('properties')
          .select('id, name, address, property_code, cc_emails')
          .eq('landlord_id', personId)
        setProperties((pr || []) as Property[])

        const { data: st } = await supabase
          .from('landlord_statements')
          .select('id, statement_reference, statement_date, net_to_landlord, properties(name, address)')
          .eq('landlord_id', personId)
          .order('statement_date', { ascending: false })
          .limit(20)
        setStatements((st as any) || [])
      }

      setLoading(false)
    }
    init()
  }, [personId, router])

  async function handleSave() {
    if (!person) return
    setSaving(true)
    setSaveBanner(null)
    const { error } = await supabase.from('people').update({
      first_name: editFirst.trim() || null,
      last_name: editLast.trim() || null,
      phone: editPhone.trim() || null,
      company: editCompany.trim() || null,
    }).eq('id', personId)

    if (error) {
      setSaveBanner('Error: ' + error.message)
    } else {
      const updated = {
        ...person,
        first_name: editFirst.trim() || null,
        last_name: editLast.trim() || null,
        phone: editPhone.trim() || null,
        company: editCompany.trim() || null,
      }
      setPerson(updated)
      setEditing(false)
      setSaveBanner('Saved')
      setTimeout(() => setSaveBanner(null), 3000)
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center">
        <p className="text-white text-sm">Loading…</p>
      </div>
    )
  }
  if (!person) return null

  const meta = ROLE_META[person.role] || { label: person.role, emoji: '👤', colour: 'bg-neutral-100 text-neutral-600' }
  const name = landlordName(person) || displayName(person) || person.email

  // Which tabs to show
  const tabs: { key: Tab; label: string }[] = [{ key: 'profile', label: 'Profile' }]
  if (person.role === 'contractor') tabs.push({ key: 'work', label: 'Jobs' })
  if (person.role === 'cleaner')    tabs.push({ key: 'work', label: 'Cleans' })
  if (person.role === 'landlord') {
    tabs.push({ key: 'properties', label: 'Properties' })
    tabs.push({ key: 'statements', label: 'Statements' })
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      {/* ── Dark header ── */}
      <div className="bg-neutral-900 text-white">
        <AppBar left={<BackButton href="/admin/people" />} />
        <div className="mx-auto max-w-4xl px-lg pb-0 pt-lg">
          <div className="flex items-start justify-between gap-lg mb-lg">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-xs">
                {meta.emoji} {meta.label}
              </p>
              <h1 className="text-3xl font-bold">{name}</h1>
              <p className="text-sm text-neutral-400 mt-xs">{person.email}</p>
            </div>
            <div className="flex items-start gap-sm shrink-0">
              <Link
                href={`/admin/view-as/${person.id}`}
                className="text-sm font-semibold text-amber-400 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/30 px-md py-sm rounded-lg transition-colors"
              >
                👁 View as
              </Link>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-xl border-t border-neutral-700 pt-0">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`py-md text-sm font-semibold transition border-b-2 ${
                  activeTab === t.key
                    ? 'border-white text-white'
                    : 'border-transparent text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-4xl px-lg py-lg">
        {saveBanner && (
          <div className={`rounded-xl px-lg py-md mb-lg text-sm font-semibold border ${
            saveBanner.startsWith('Error') ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-800'
          }`}>{saveBanner}</div>
        )}

        {/* ── Profile tab ── */}
        {activeTab === 'profile' && (
          <div className="space-y-lg">
            <div className="bg-white rounded-2xl border border-neutral-200 p-lg">
              <div className="flex items-center justify-between mb-lg">
                <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400">Contact details</h2>
                {!editing ? (
                  <button onClick={() => setEditing(true)} className="text-xs font-semibold text-blue-600 hover:text-blue-800">Edit</button>
                ) : (
                  <div className="flex gap-sm">
                    <button onClick={handleSave} disabled={saving} className="text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-700 px-md py-xs rounded-lg disabled:opacity-50">
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={() => setEditing(false)} className="text-xs font-semibold text-neutral-500 hover:text-neutral-700">Cancel</button>
                  </div>
                )}
              </div>

              {editing ? (
                <div className="grid gap-md sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs block">First name</label>
                    <input value={editFirst} onChange={e => setEditFirst(e.target.value)} className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs block">Last name</label>
                    <input value={editLast} onChange={e => setEditLast(e.target.value)} className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs block">Phone</label>
                    <input value={editPhone} onChange={e => setEditPhone(e.target.value)} type="tel" className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm" />
                  </div>
                  {person.role === 'landlord' && (
                    <div>
                      <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs block">Company</label>
                      <input value={editCompany} onChange={e => setEditCompany(e.target.value)} className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm" placeholder="e.g. Page Properties Ltd" />
                    </div>
                  )}
                </div>
              ) : (
                <dl className="grid gap-md sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs">Email</dt>
                    <dd className="text-sm font-semibold text-neutral-900">{person.email}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs">Phone</dt>
                    <dd className="text-sm font-semibold text-neutral-900">{person.phone || '—'}</dd>
                  </div>
                  {person.role === 'landlord' && (
                    <div>
                      <dt className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs">Company</dt>
                      <dd className="text-sm font-semibold text-neutral-900">{person.company || '—'}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs">Added</dt>
                    <dd className="text-sm text-neutral-700">{new Date(person.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs">Using app</dt>
                    <dd className="text-sm font-semibold text-neutral-900">{person.using_app ? 'Yes' : 'Not yet'}</dd>
                  </div>
                </dl>
              )}
            </div>

            {/* Role badge */}
            <div className="bg-white rounded-2xl border border-neutral-200 px-lg py-md flex items-center gap-sm">
              <span className={`text-xs font-bold px-md py-xs rounded-full ${meta.colour}`}>{meta.emoji} {meta.label}</span>
              <p className="text-xs text-neutral-400">Role determines what this person sees when they log in</p>
            </div>
          </div>
        )}

        {/* ── Jobs tab (contractor) ── */}
        {activeTab === 'work' && person.role === 'contractor' && (
          <div className="space-y-sm">
            <div className="flex items-center justify-between mb-md">
              <h2 className="text-sm font-bold text-neutral-700">{jobs.length} job{jobs.length !== 1 ? 's' : ''} on record</h2>
            </div>
            {jobs.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-neutral-300 p-xl text-center">
                <p className="text-sm text-neutral-400">No jobs assigned</p>
              </div>
            ) : (
              jobs.map(j => (
                <div key={j.id} className="bg-white rounded-xl border border-neutral-200 p-md flex items-center justify-between gap-md">
                  <div className="min-w-0">
                    <p className="font-semibold text-neutral-900 text-sm">{j.title}</p>
                    <p className="text-xs text-neutral-500 mt-xs">
                      {j.properties?.address}{j.rooms ? ` · ${j.rooms.name}` : ''}
                      {j.booked_date ? ` · ${new Date(j.booked_date).toLocaleDateString('en-GB')}` : ''}
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs font-bold px-sm py-xs rounded-full ${
                    j.status === 'completed' ? 'bg-green-100 text-green-800' :
                    j.status === 'booked'    ? 'bg-purple-100 text-purple-800' :
                    j.status === 'assigned'  ? 'bg-blue-100 text-blue-800' :
                    'bg-neutral-100 text-neutral-600'
                  }`}>{j.status}</span>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Cleans tab (cleaner) ── */}
        {activeTab === 'work' && person.role === 'cleaner' && (
          <div className="space-y-sm">
            <div className="mb-md">
              <h2 className="text-sm font-bold text-neutral-700">{cleans.length} clean{cleans.length !== 1 ? 's' : ''} on record</h2>
            </div>
            {cleans.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-neutral-300 p-xl text-center">
                <p className="text-sm text-neutral-400">No cleans on record</p>
              </div>
            ) : (
              cleans.map(c => (
                <div key={c.id} className="bg-white rounded-xl border border-neutral-200 p-md flex items-center justify-between gap-md">
                  <div className="min-w-0">
                    <p className="font-semibold text-neutral-900 text-sm">{c.properties?.address || '—'}</p>
                    <p className="text-xs text-neutral-500 mt-xs">
                      {c.clean_date ? new Date(c.clean_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No date'}
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs font-bold px-sm py-xs rounded-full ${
                    c.status === 'completed' ? 'bg-green-100 text-green-800' :
                    c.status === 'scheduled' ? 'bg-blue-100 text-blue-800' :
                    'bg-neutral-100 text-neutral-600'
                  }`}>{c.status || '—'}</span>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Properties tab (landlord) ── */}
        {activeTab === 'properties' && (
          <div className="space-y-sm">
            <div className="mb-md">
              <h2 className="text-sm font-bold text-neutral-700">{properties.length} propert{properties.length !== 1 ? 'ies' : 'y'}</h2>
            </div>
            {properties.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-neutral-300 p-xl text-center">
                <p className="text-sm text-neutral-400">No properties linked to this landlord</p>
              </div>
            ) : (
              properties.map(p => (
                <Link key={p.id} href={`/admin/properties/${p.id}`}
                  className="block bg-white rounded-xl border border-neutral-200 p-md hover:border-neutral-900 transition-colors">
                  <div className="flex items-center justify-between gap-md">
                    <div className="min-w-0">
                      {p.property_code && <span className="font-mono text-xs text-neutral-400 mr-sm">{p.property_code}</span>}
                      <span className="font-semibold text-neutral-900 text-sm">{p.address}</span>
                      {p.name && p.name !== p.address && <p className="text-xs text-neutral-500 mt-xs">{p.name}</p>}
                    </div>
                    {p.cc_emails && (
                      <p className="text-xs text-neutral-400 shrink-0">CC: {p.cc_emails}</p>
                    )}
                  </div>
                </Link>
              ))
            )}
          </div>
        )}

        {/* ── Statements tab (landlord) ── */}
        {activeTab === 'statements' && (
          <div className="space-y-sm">
            <div className="flex items-center justify-between mb-md">
              <h2 className="text-sm font-bold text-neutral-700">{statements.length} statement{statements.length !== 1 ? 's' : ''}</h2>
              <Link href="/admin/statements" className="text-xs font-semibold text-blue-600 hover:text-blue-800">All statements →</Link>
            </div>
            {statements.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-neutral-300 p-xl text-center">
                <p className="text-sm text-neutral-400">No statements on record</p>
              </div>
            ) : (
              statements.map(s => (
                <div key={s.id} className="bg-white rounded-xl border border-neutral-200 p-md flex items-center justify-between gap-md">
                  <div className="min-w-0">
                    <p className="font-semibold text-neutral-900 text-sm">{s.properties?.address || '—'}</p>
                    <p className="text-xs text-neutral-500 mt-xs">
                      {s.statement_reference} · {new Date(s.statement_date).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                  <p className="shrink-0 font-bold text-neutral-900">£{s.net_to_landlord.toFixed(2)}</p>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  )
}
