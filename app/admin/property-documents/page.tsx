'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import DocUploadDrawer from '@/components/DocUploadDrawer'
import DocViewDrawer from '@/components/DocViewDrawer'
import { sortPropertiesNumerically } from '@/lib/sortProperties'

interface Property {
  id: string
  name: string
  address: string
}

interface Doc {
  id: string
  file_name: string
  document_type: string
  description?: string
  storage_url: string
  uploaded_at: string
  visible_to_tenants?: boolean
}

export default function PropertyDocumentsPage() {
  const supabase = createClient()
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [docs, setDocs] = useState<Record<string, Doc[]>>({})
  const [drawerProperty, setDrawerProperty] = useState<Property | null>(null)
  const [viewingDoc, setViewingDoc] = useState<{ doc: Doc; property: Property } | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      const { data: props } = await supabase.from('properties').select('id, name, address').order('name')
      const sorted = sortPropertiesNumerically(props || [])
      setProperties(sorted)

      const { data: allDocs } = await supabase
        .from('property_documents')
        .select('id, property_id, file_name, document_type, description, storage_url, uploaded_at, visible_to_tenants')
        .order('uploaded_at', { ascending: false })

      const grouped: Record<string, Doc[]> = {}
      for (const d of allDocs || []) {
        if (!grouped[d.property_id]) grouped[d.property_id] = []
        grouped[d.property_id].push(d)
      }
      setDocs(grouped)
      setLoading(false)
    }
    load()
  }, [])

  async function refreshDocs(propertyId: string) {
    const { data } = await supabase
      .from('property_documents')
      .select('id, property_id, file_name, document_type, description, storage_url, uploaded_at, visible_to_tenants')
      .eq('property_id', propertyId)
      .order('uploaded_at', { ascending: false })
    setDocs(prev => ({ ...prev, [propertyId]: data || [] }))
  }

  const filtered = properties.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.address.toLowerCase().includes(search.toLowerCase())
  )

  const totalDocs = Object.values(docs).reduce((n, arr) => n + arr.length, 0)

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin" />} />
      <PageHero eyebrow="Properties" title="Property Documents" subtitle="Evacuation plans, house rules, safety info, tenancy agreements — click a property to upload" />

      <main className="mx-auto max-w-6xl px-lg py-xl">

        {/* Summary bar */}
        <div className="mb-lg flex flex-wrap gap-lg rounded-2xl border border-neutral-200 bg-white px-lg py-md items-center">
          <div className="text-center">
            <p className="text-xl font-semibold text-neutral-900">{properties.length}</p>
            <p className="text-xs text-neutral-500">Properties</p>
          </div>
          <div className="w-px bg-neutral-100 self-stretch" />
          <div className="text-center">
            <p className="text-xl font-semibold text-neutral-900">{totalDocs}</p>
            <p className="text-xs text-neutral-500">Documents</p>
          </div>
          <div className="ml-auto">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search properties…"
              className="rounded-lg border border-neutral-200 px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 w-48"
            />
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-xl text-center text-sm text-neutral-400">Loading…</div>
        ) : (
          <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden divide-y divide-neutral-100">
            {filtered.map(prop => {
              const propDocs = docs[prop.id] || []
              return (
                <div key={prop.id} className="px-lg py-md flex items-center gap-lg">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-neutral-900 text-sm">{prop.name}</p>
                    <p className="text-xs text-neutral-400 truncate">{prop.address}</p>
                  </div>
                  <div className="flex items-center gap-md">
                    {propDocs.length > 0 ? (
                      <div className="flex gap-xs flex-wrap max-w-xs">
                        {propDocs.slice(0, 3).map(d => (
                          <button
                            key={d.id}
                            onClick={() => setViewingDoc({ doc: d, property: prop })}
                            className="inline-block rounded px-sm py-xs text-xs font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition truncate max-w-[120px]"
                            title={d.file_name}
                          >
                            📄 {d.document_type?.replace(/_/g, ' ')}
                          </button>
                        ))}
                        {propDocs.length > 3 && (
                          <span className="text-xs text-neutral-400">+{propDocs.length - 3} more</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-300">No documents</span>
                    )}
                    <button
                      onClick={() => setDrawerProperty(prop)}
                      className="shrink-0 rounded-lg border border-neutral-200 bg-white px-md py-sm text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition whitespace-nowrap"
                    >
                      + Upload
                    </button>
                  </div>
                </div>
              )
            })}
            {filtered.length === 0 && (
              <div className="px-lg py-xl text-center text-sm text-neutral-400">No properties found</div>
            )}
          </div>
        )}
      </main>

      {drawerProperty && (
        <DocUploadDrawer
          title={drawerProperty.name}
          subtitle="Upload document"
          propertyId={drawerProperty.id}
          onClose={() => setDrawerProperty(null)}
          onUploaded={() => refreshDocs(drawerProperty.id)}
        />
      )}

      {viewingDoc && (
        <DocViewDrawer
          title={viewingDoc.property.name}
          subtitle={viewingDoc.doc.document_type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
          fileName={viewingDoc.doc.file_name}
          storageUrl={viewingDoc.doc.storage_url}
          onClose={() => setViewingDoc(null)}
          onReplace={() => { setDrawerProperty(viewingDoc.property); setViewingDoc(null) }}
        />
      )}
    </div>
  )
}
