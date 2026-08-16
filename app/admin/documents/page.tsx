'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import AppBar from '@/components/AppBar'

interface DocumentPending {
  id: string
  document_type: string
  confidence: number
  summary: string
  status: string
  property_id: string | null
  property_address_extracted: string
  extracted_data: any
  created_at: string
}

interface Property {
  id: string
  name: string
  address: string
}

export default function DocumentsPage() {
  const supabase = createClient()
  const [docs, setDocs] = useState<DocumentPending[]>([])
  const [selected, setSelected] = useState<DocumentPending | null>(null)
  const [properties, setProperties] = useState<Property[]>([])
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filing, setFiling] = useState(false)

  useEffect(() => {
    async function load() {
      // Fetch pending documents
      const { data: docsData } = await supabase
        .from('documents_pending')
        .select('*')
        .eq('status', 'pending_review')
        .order('created_at', { ascending: false })
      setDocs(docsData || [])

      // Fetch all properties for dropdown
      const { data: propsData } = await supabase.from('properties').select('id, name, address')
      setProperties(propsData || [])

      setLoading(false)
    }
    load()
  }, [])

  async function handleFile(doc: DocumentPending) {
    if (!selectedPropertyId) {
      alert('Please select a property')
      return
    }

    setFiling(true)
    try {
      // Update the document: set property_id, status='property_matched'
      const { error } = await supabase
        .from('documents_pending')
        .update({ property_id: selectedPropertyId, status: 'property_matched' })
        .eq('id', doc.id)

      if (error) throw error

      // TODO: Implement filing logic based on document_type
      // For now, just mark it as filed
      await supabase
        .from('documents_pending')
        .update({ status: 'filed', filed_at: new Date().toISOString() })
        .eq('id', doc.id)

      alert('✅ Document filed!')
      setSelected(null)
      setSelectedPropertyId(null)
      setDocs(docs.filter((d) => d.id !== doc.id))
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setFiling(false)
    }
  }

  if (loading) return <div className="p-lg">Loading...</div>

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar right={<Link href="/admin" className="text-sm font-bold text-neutral-700">← Admin</Link>} />

      <main className="mx-auto max-w-6xl px-lg py-2xl">
        <h1 className="text-3xl font-bold text-neutral-900 mb-lg">📄 Documents Pending Review</h1>
        <p className="text-neutral-600 mb-2xl">
          Extracted data from uploaded documents. Review, confirm the property, and file into the system.
        </p>

        {docs.length === 0 ? (
          <div className="rounded-2xl border-2 border-neutral-200 bg-white p-2xl text-center">
            <p className="text-neutral-600">No documents awaiting review.</p>
            <Link href="/admin/ai-upload" className="mt-md inline-block text-sm font-bold text-blue-600 hover:text-blue-800">
              ↓ Upload a document
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-lg">
            {/* List */}
            <div className="col-span-1 space-y-sm max-h-[600px] overflow-y-auto">
              {docs.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => { setSelected(doc); setSelectedPropertyId(doc.property_id); }}
                  className={`w-full text-left rounded-lg border-2 p-md transition ${
                    selected?.id === doc.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-neutral-200 bg-white hover:border-neutral-300'
                  }`}
                >
                  <div className="text-xs font-bold text-neutral-500 uppercase">{doc.document_type}</div>
                  <div className="mt-xs text-sm font-semibold text-neutral-900">{doc.summary || '(no summary)'}</div>
                  <div className="mt-sm flex items-center gap-sm text-xs text-neutral-600">
                    <span>📍 {doc.property_address_extracted || 'No address'}</span>
                    <span className="ml-auto">🎯 {(doc.confidence * 100).toFixed(0)}%</span>
                  </div>
                </button>
              ))}
            </div>

            {/* Detail */}
            {selected && (
              <div className="col-span-2 rounded-2xl border-2 border-neutral-200 bg-white p-lg">
                <h2 className="text-xl font-bold text-neutral-900 mb-md">{selected.document_type.toUpperCase()}</h2>
                <p className="text-sm text-neutral-600 mb-lg">{selected.summary}</p>

                {/* Property selector */}
                <div className="mb-lg">
                  <label className="block text-sm font-bold text-neutral-700 mb-sm">Confirm property:</label>
                  <select
                    value={selectedPropertyId || ''}
                    onChange={(e) => setSelectedPropertyId(e.target.value || null)}
                    className="w-full rounded border-2 border-neutral-300 px-md py-sm text-sm"
                  >
                    <option value="">— Select a property —</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.address})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Extracted fields (simplified view) */}
                <div className="mb-lg max-h-[300px] overflow-y-auto bg-neutral-50 rounded p-md">
                  <h3 className="text-xs font-bold text-neutral-600 uppercase mb-sm">Extracted Data</h3>
                  <pre className="text-xs text-neutral-700 whitespace-pre-wrap break-words">
                    {JSON.stringify(selected.extracted_data, null, 2)}
                  </pre>
                </div>

                {/* Actions */}
                <div className="flex gap-md">
                  <button
                    onClick={() => handleFile(selected)}
                    disabled={!selectedPropertyId || filing}
                    className="flex-1 rounded bg-green-600 px-lg py-md text-white font-bold hover:bg-green-700 disabled:opacity-50"
                  >
                    {filing ? 'Filing...' : '✅ File Document'}
                  </button>
                  <button
                    onClick={() => setSelected(null)}
                    className="rounded border-2 border-neutral-300 px-lg py-md font-bold hover:bg-neutral-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
