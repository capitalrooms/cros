'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import DocUploadDrawer from '@/components/DocUploadDrawer'
import DocViewDrawer from '@/components/DocViewDrawer'

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

const TYPE_LABELS: Record<string, string> = {
  tenancy_agreement: 'Tenancy Agreement',
  gas_safety: 'Gas Safety Certificate',
  electrical_cert: 'EICR',
  epc: 'EPC',
  fire_risk_assessment: 'Fire Risk Assessment',
  inventory: 'Inventory',
  right_to_rent: 'Right to Rent',
  deposit_certificate: 'Deposit Certificate',
  how_to_rent: 'How to Rent Guide',
  reference_report: 'Reference Report',
  id_proof: 'ID Proof',
  employment_letter: 'Employment Letter',
  floor_plan: 'Floor Plan',
  insurance_policy: 'Insurance Policy',
  hmo_licence: 'HMO Licence',
  management_agreement: 'Management Agreement',
  evacuation_plan: 'Evacuation Plan',
  emergency_contacts: 'Emergency Contacts',
  house_rules: 'House Rules',
  safety_info: 'Safety Information',
  utility_info: 'Utilities Info',
  other: 'Other',
}

export default function DocumentsTab({ propertyId, propertyName }: DocumentsTabProps) {
  const supabase = createClient()
  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
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
    (TYPE_LABELS[d.document_type] || d.document_type || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-lg">
      <div className="flex items-center justify-between gap-md flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-neutral-900">Documents</h2>
          <p className="text-sm text-neutral-400 mt-xs">Certificates, tenancy docs, floor plans and property files</p>
        </div>
        <button
          onClick={() => setShowDrawer(true)}
          className="rounded-lg bg-neutral-900 px-lg py-sm text-sm font-semibold text-white hover:bg-neutral-800 transition whitespace-nowrap"
        >
          + Upload document
        </button>
      </div>

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
          <p className="text-2xl mb-sm">📎</p>
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
              <span className="text-lg shrink-0">📄</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-neutral-900 truncate">{doc.file_name}</p>
                <div className="flex items-center gap-md mt-xs flex-wrap">
                  <span className="text-xs text-neutral-500">{TYPE_LABELS[doc.document_type] || doc.document_type}</span>
                  {doc.description && <span className="text-xs text-neutral-400">· {doc.description}</span>}
                  {doc.visible_to_tenants && <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded px-xs py-0">tenant visible</span>}
                  <span className="text-xs text-neutral-300">{new Date(doc.uploaded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}</span>
                </div>
              </div>
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
          onUploaded={() => loadDocs()}
        />
      )}

      {viewingDoc && (
        <DocViewDrawer
          title={propertyName || 'Property'}
          subtitle={TYPE_LABELS[viewingDoc.document_type] || viewingDoc.document_type}
          fileName={viewingDoc.file_name}
          storageUrl={viewingDoc.storage_url}
          onClose={() => setViewingDoc(null)}
          onReplace={() => { setViewingDoc(null); setShowDrawer(true) }}
        />
      )}
    </div>
  )
}
