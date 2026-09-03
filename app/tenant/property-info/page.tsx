'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import Link from 'next/link'

interface PropertyDocument {
  id: string
  property_id: string
  document_type: string
  file_name: string
  storage_url: string
  uploaded_at: string
  description?: string
}

// All categories that can appear on this page, in display order.
// The emoji and description are shown even when no documents are filed yet.
const CATEGORIES: Array<{
  key: string
  emoji: string
  label: string
  description: string
  alwaysShow?: boolean  // show even when empty
}> = [
  { key: 'evacuation_plan',      emoji: '🚨', label: 'Emergency Fire Plan',        description: 'Emergency exit routes and assembly point', alwaysShow: true },
  { key: 'emergency_contacts',   emoji: '☎️', label: 'Important Contact Info',     description: 'Landlord, agent, emergency services and utility contacts', alwaysShow: true },
  { key: 'house_rules',          emoji: '📋', label: 'House Rules',                description: 'Property policies and shared-living guidelines' },
  { key: 'safety_info',          emoji: '🛡️', label: 'Safety Information',         description: 'Fire safety, security procedures and hazard information' },
  { key: 'utility_info',         emoji: '⚡', label: 'Utility Bills & Info',        description: 'Water shutoff, fuse board, meter readings, supplier accounts' },
  { key: 'policies',             emoji: '📄', label: 'Policy Documents',           description: 'Formal policies — parking, pets, smoking, noise' },
  { key: 'council_correspondence', emoji: '🏛️', label: 'Council Correspondence',   description: 'Letters, notices or decisions from the local authority' },
  { key: 'landlord_statement',   emoji: '💷', label: 'Landlord Statements',        description: 'Rent or financial statements relating to your tenancy' },
  { key: 'inventory',            emoji: '📦', label: 'Property Inventory',         description: 'Check-in inventory and condition report' },
  { key: 'wifi_details',         emoji: '📶', label: 'Wi-Fi & Internet',            description: 'Broadband provider, network name and access details' },
  { key: 'waste_schedule',       emoji: '♻️', label: 'Waste & Recycling',           description: 'Bin collection days and recycling guidelines' },
  { key: 'other',                emoji: '📁', label: 'Other Documents',            description: 'Additional documents from your agent or landlord' },
]

export default function PropertyInfoPage() {
  const [property, setProperty] = useState<{ id: string; name: string; address: string } | null>(null)
  const [documents, setDocuments] = useState<PropertyDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.email) { setError('Not signed in'); setLoading(false); return }

        const { data: person } = await supabase
          .from('people')
          .select('property_id')
          .eq('email', user.email)
          .maybeSingle()

        if (!person?.property_id) { setError('No property assigned'); setLoading(false); return }

        const { data: prop } = await supabase
          .from('properties')
          .select('id, name, address')
          .eq('id', person.property_id)
          .maybeSingle()

        if (!prop) { setError('Property not found'); setLoading(false); return }
        setProperty(prop)

        const { data: docs } = await supabase
          .from('property_documents')
          .select('*')
          .eq('property_id', prop.id)
          .eq('visible_to_tenants', true)
          .order('uploaded_at', { ascending: false })

        setDocuments(docs || [])
      } catch (err: any) {
        setError(err.message || 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton href="/tenant" />} />
        <p className="p-xl text-sm text-neutral-400">Loading…</p>
      </div>
    )
  }

  if (error || !property) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton href="/tenant" />} />
        <main className="mx-auto max-w-2xl px-lg py-2xl">
          <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-lg">
            <p className="font-bold text-red-900">⚠️ {error || 'Could not load property information'}</p>
          </div>
        </main>
      </div>
    )
  }

  // Group documents by category
  const byCategory = Object.fromEntries(
    CATEGORIES.map((c) => [c.key, documents.filter((d) => d.document_type === c.key)])
  )

  // Only show categories that have documents OR are flagged alwaysShow
  const visibleCategories = CATEGORIES.filter(
    (c) => c.alwaysShow || (byCategory[c.key]?.length ?? 0) > 0
  )

  const totalDocs = documents.length

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar right={<Link href="/tenant" className="text-sm font-bold text-white hover:text-white/80">← Home</Link>} />

      <main className="mx-auto max-w-2xl px-lg py-lg">
        {/* Property header */}
        <div className="rounded-2xl bg-neutral-900 px-lg py-md text-white">
          <p className="text-xs font-bold uppercase tracking-widest text-white/40">Property information</p>
          <h1 className="mt-xs text-xl font-bold">{property.name}</h1>
          <p className="text-sm text-white/60">{property.address}</p>
          {totalDocs > 0 && (
            <p className="mt-xs text-xs text-white/40">{totalDocs} document{totalDocs !== 1 ? 's' : ''} on file</p>
          )}
        </div>

        {/* Emergency callout — always at the top */}
        <div className="mt-lg rounded-2xl border-2 border-red-300 bg-red-50 p-lg">
          <h2 className="font-bold text-red-900">🚨 In an emergency</h2>
          <ul className="mt-sm space-y-xs text-sm text-red-800">
            <li><strong>Fire, gas or break-in →</strong> call 999 immediately</li>
            <li><strong>Gas smell →</strong> National Gas Emergency: 0800 111 999</li>
            <li><strong>Non-urgent repairs →</strong> use the Maintenance section</li>
          </ul>
        </div>

        {/* Document categories */}
        <div className="mt-lg space-y-lg">
          {visibleCategories.map((cat) => {
            const docs = byCategory[cat.key] || []
            return (
              <section key={cat.key}>
                <div className="flex items-center gap-sm mb-sm">
                  <span className="text-xl">{cat.emoji}</span>
                  <div>
                    <h2 className="text-base font-bold text-neutral-900">{cat.label}</h2>
                    <p className="text-xs text-neutral-500">{cat.description}</p>
                  </div>
                </div>

                {docs.length === 0 ? (
                  <div className="rounded-xl border-2 border-dashed border-neutral-200 bg-white px-lg py-md text-sm text-neutral-400">
                    Not uploaded yet — check back soon
                  </div>
                ) : (
                  <div className="space-y-sm">
                    {docs.map((doc) => (
                      <DocCard key={doc.id} doc={doc} />
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      </main>
    </div>
  )
}

function DocCard({ doc }: { doc: PropertyDocument }) {
  const hasFile = !!doc.storage_url

  const inner = (
    <div className={`flex items-center gap-md rounded-xl border-2 bg-white p-md transition-all ${
      hasFile ? 'border-neutral-200 hover:border-neutral-900 cursor-pointer' : 'border-neutral-100'
    }`}>
      <span className="text-2xl shrink-0">{hasFile ? '📄' : '📝'}</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-neutral-900 truncate">{doc.file_name}</p>
        {doc.description && (
          <p className="text-sm text-neutral-500 mt-xs line-clamp-2">{doc.description}</p>
        )}
        <p className="text-xs text-neutral-400 mt-xs">
          {new Date(doc.uploaded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      </div>
      {hasFile && <span className="shrink-0 text-neutral-400">→</span>}
    </div>
  )

  if (hasFile) {
    return (
      <a href={doc.storage_url} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    )
  }
  return inner
}
