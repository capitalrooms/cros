'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import DocUploadDrawer from '@/components/DocUploadDrawer'
import DocViewDrawer from '@/components/DocViewDrawer'
import { docTypeLabel, fullDatesIn } from '@/lib/documents/types'
import LineIcon from '@/components/LineIcon'
import FloorPlanMap from './FloorPlanMap'
import FloorPlanText from './FloorPlanText'

interface Doc {
  id: string
  file_name: string
  document_type: string
  description?: string
  storage_url: string
  uploaded_at: string
  visible_to_tenants?: boolean
}

interface DocumentsTabProps {
  propertyId: string
  propertyName?: string
}



export default function DocumentsTab({ propertyId, propertyName }: DocumentsTabProps) {
  const supabase = createClient()
  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
  // a floor plan filed here is read for room sizes straight away, then shown beside them to confirm (12 Nov 2026)
  const [plan, setPlan] = useState<{ url: string; pdf: boolean; detected: any[]; notes: string; bathrooms?: number; ensuites: string[]; layout: string; existing: string } | null>(null)
  const [planMsg, setPlanMsg] = useState('')

  async function readPlan(doc: { storage_url: string; file_name: string }) {
    setPlanMsg('Reading the room sizes from the floor plan…')
    try {
      const body = new FormData()
      body.append('storage_url', doc.storage_url)
      const pdf = /\.pdf$/i.test(doc.file_name) || /\.pdf(\?|$)/i.test(doc.storage_url)
      if (pdf) body.append('mime_type', 'application/pdf')
      const [res, prop] = await Promise.all([
        fetch('/api/ai/scan-floorplan', { method: 'POST', body }),
        supabase.from('properties').select('property_notes').eq('id', propertyId).maybeSingle(),
      ])
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setPlanMsg(json.error || 'Couldn’t read the floor plan for room sizes.'); return }
      const r = json.result ?? {}
      setPlan({ url: doc.storage_url, pdf, detected: r.detected_rooms || [], notes: r.notes || '', bathrooms: r.bathrooms_count, ensuites: r.ensuite_room_labels || [], layout: r.layout_notes || '', existing: (prop.data as any)?.property_notes || '' })
      setPlanMsg('')
    } catch (e: any) { setPlanMsg(e?.message || 'Couldn’t read the floor plan for room sizes.') }
  }
  const [search, setSearch] = useState('')
  const [showDrawer, setShowDrawer] = useState(false)
  const [viewingDoc, setViewingDoc] = useState<Doc | null>(null)

  useEffect(() => { loadDocs() }, [propertyId])

  async function loadDocs() {
    setLoading(true)
    const { data } = await supabase
      .from('property_documents')
      .select('id, file_name, document_type, description, storage_url, uploaded_at, visible_to_tenants')
      .eq('property_id', propertyId)
      .order('uploaded_at', { ascending: false })
    setDocs(data || [])
    setLoading(false)
  }

  const filtered = docs.filter(d =>
    !search ||
    d.file_name.toLowerCase().includes(search.toLowerCase()) ||
    docTypeLabel(d.document_type).toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-lg">
      <div className="flex items-center justify-between gap-md flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-neutral-900">Documents</h2>
          <p className="text-sm text-neutral-400 mt-xs">Certificates, tenancy docs, floor plans and property files</p>
        </div>
        <div className="flex items-center gap-sm">
          <FloorPlanText propertyId={propertyId} onApplied={setPlanMsg} className="rounded-lg border border-neutral-300 px-md py-sm text-sm font-semibold text-neutral-800 hover:bg-neutral-100 whitespace-nowrap" />
          <button
            onClick={() => setShowDrawer(true)}
            className="rounded-lg bg-neutral-900 px-lg py-sm text-sm font-semibold text-white hover:bg-neutral-800 transition whitespace-nowrap"
          >
            + Upload document
          </button>
        </div>
      </div>

      {planMsg && <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-md py-sm text-sm text-neutral-700 flex justify-between gap-md">{planMsg}<button onClick={() => setPlanMsg('')} className="text-neutral-400">×</button></p>}

      {docs.length > 0 && (
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search documents…"
          className="w-full rounded-lg border border-neutral-200 px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
        />
      )}

      {loading ? (
        <div className="text-sm text-neutral-400 py-xl text-center">Loading…</div>
      ) : filtered.length === 0 ? (
        <div
          onClick={() => setShowDrawer(true)}
          className="rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50 hover:border-neutral-500 hover:bg-white transition cursor-pointer p-xl text-center"
        >
          <p className="text-2xl mb-sm"><LineIcon glyph="📎" /></p>
          <p className="text-sm font-semibold text-neutral-700">
            {docs.length === 0 ? 'No documents yet — click to upload' : 'No results — click to upload a new document'}
          </p>
          <p className="text-xs text-neutral-400 mt-xs">PDF, JPG, PNG or DOCX · AI will identify the type</p>
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden divide-y divide-neutral-100">
          {filtered.map(doc => (
            <button
              key={doc.id}
              onClick={() => setViewingDoc(doc)}
              className="w-full px-lg py-md flex items-center gap-lg text-left hover:bg-neutral-50 transition"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-neutral-900 truncate">{doc.file_name}</p>
                <div className="flex items-center gap-md mt-xs flex-wrap">
                  <span className="text-xs text-neutral-500">{docTypeLabel(doc.document_type)}</span>
                  {doc.description && <span className="text-xs text-neutral-400">· {fullDatesIn(doc.description)}</span>}
                  {doc.visible_to_tenants && <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded px-xs py-0">tenant visible</span>}
                  <span className="text-xs text-neutral-300">uploaded {new Date(doc.uploaded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' })}</span>
                </div>
              </div>
              {doc.document_type === 'floor_plan' && (
                <span role="button" tabIndex={0} onClick={e => { e.stopPropagation(); readPlan(doc) }} onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); readPlan(doc) } }}
                  className="shrink-0 rounded-md border border-neutral-300 px-sm py-xs text-xs font-semibold text-neutral-800 hover:bg-neutral-100">Room sizes</span>
              )}
              <span className="shrink-0 text-xs font-semibold text-neutral-500">View →</span>
            </button>
          ))}
        </div>
      )}

      {showDrawer && (
        <DocUploadDrawer
          title={propertyName || 'Property'}
          subtitle="Upload document"
          propertyId={propertyId}
          onClose={() => setShowDrawer(false)}
          onUploaded={(d) => { loadDocs(); if (d?.document_type === 'floor_plan') readPlan(d) }}
        />
      )}

      {plan && (
        <FloorPlanMap
          propertyId={propertyId}
          detected={plan.detected}
          notes={plan.notes}
          bathroomsCount={plan.bathrooms}
          ensuiteLabels={plan.ensuites}
          layoutNotes={plan.layout}
          existingNotes={plan.existing}
          planUrl={plan.url}
          planIsPdf={plan.pdf}
          onClose={() => setPlan(null)}
          onApplied={(msg) => { setPlan(null); setPlanMsg(msg) }}
        />
      )}

      {viewingDoc && (
        <DocViewDrawer
          title={propertyName || 'Property'}
          subtitle={docTypeLabel(viewingDoc.document_type)}
          fileName={viewingDoc.file_name}
          storageUrl={viewingDoc.storage_url}
          onClose={() => setViewingDoc(null)}
          onReplace={() => { setViewingDoc(null); setShowDrawer(true) }}
        />
      )}
    </div>
  )
}
