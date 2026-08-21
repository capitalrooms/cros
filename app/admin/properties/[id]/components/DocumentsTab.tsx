'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

interface Document {
  id: string
  file_name: string
  file_type: string
  file_size: number
  created_at: string
  uploader_id: string
  category?: string
}

interface DocumentsTabProps {
  propertyId: string
}

export default function DocumentsTab({ propertyId }: DocumentsTabProps) {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')

  const supabase = createClient()

  useEffect(() => {
    loadDocuments()
  }, [propertyId])

  async function loadDocuments() {
    setLoading(true)
    const { data, error } = await supabase
      .from('attachments')
      .select('*')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error(error)
    } else {
      // Categorize documents by type
      const docs = (data || []).map((d: any) => ({
        ...d,
        category: categorizeDocument(d.file_type, d.file_name)
      }))
      setDocuments(docs)
    }
    setLoading(false)
  }

  const categorizeDocument = (fileType: string, fileName: string): string => {
    if (fileType?.includes('pdf') || fileName?.includes('certificate') || fileName?.includes('gas') || fileName?.includes('eicr')) {
      return 'certificates'
    }
    if (fileType?.includes('pdf') || fileName?.includes('policy') || fileName?.includes('insurance')) {
      return 'insurance'
    }
    if (fileType?.includes('image')) {
      return 'photos'
    }
    if (fileName?.includes('floor') || fileName?.includes('plan')) {
      return 'floor_plans'
    }
    if (fileName?.includes('tenancy') || fileName?.includes('agreement')) {
      return 'tenancies'
    }
    return 'other'
  }

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'certificates': return '📄 Certificates'
      case 'insurance': return '🛡️ Insurance'
      case 'photos': return '📷 Photos'
      case 'floor_plans': return '🏗️ Floor Plans'
      case 'tenancies': return '📋 Tenancy Docs'
      case 'maintenance': return '🔧 Maintenance'
      default: return '📁 Other'
    }
  }

  const filtered = documents.filter(doc => {
    const matchesCategory = categoryFilter === 'all' || doc.category === categoryFilter
    const matchesSearch = searchQuery === '' ||
      doc.file_name.toLowerCase().includes(searchQuery.toLowerCase())

    return matchesCategory && matchesSearch
  })

  const groupedDocuments = filtered.reduce((acc: Record<string, Document[]>, doc) => {
    const cat = doc.category || 'other'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(doc)
    return acc
  }, {})

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const categories = ['all', 'certificates', 'insurance', 'photos', 'floor_plans', 'tenancies', 'maintenance', 'other']

  if (loading) {
    return (
      <div className="flex items-center justify-center p-xl">
        <div className="text-sm text-neutral-400">Loading documents...</div>
      </div>
    )
  }

  return (
    <div className="space-y-xl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-white">Documents</h2>
        <p className="text-sm text-neutral-400 mt-xs">Certificates, insurance, floor plans, and property files</p>
      </div>

      {/* Filters */}
      <div className="space-y-md">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
            Search Documents
          </label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by filename..."
            className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
            Category
          </label>
          <div className="flex flex-wrap gap-sm">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-md py-sm rounded-lg font-semibold text-sm transition ${
                  categoryFilter === cat
                    ? 'bg-blue-600 text-white'
                    : 'border border-neutral-700 text-white hover:bg-neutral-900'
                }`}
              >
                {cat === 'all' ? 'All' : getCategoryLabel(cat).split(' ')[0]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Documents List */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-neutral-700 bg-neutral-900 p-xl text-center">
          <div className="text-3xl mb-md opacity-50">📁</div>
          <p className="text-sm font-semibold text-white mb-md">No documents found</p>
          <p className="text-xs text-neutral-400 mb-lg">
            {documents.length === 0
              ? 'Upload documents to get started'
              : 'Try adjusting your filters'}
          </p>
        </div>
      ) : (
        <div className="space-y-lg">
          {Object.entries(groupedDocuments).map(([category, docs]) => (
            <div key={category}>
              <h3 className="text-sm font-bold uppercase text-neutral-400 mb-md pb-md border-b border-neutral-100">
                {getCategoryLabel(category)}
              </h3>
              <div className="space-y-md">
                {docs.map(doc => (
                  <div key={doc.id} className="rounded-lg border border-neutral-700 bg-neutral-900 p-lg hover:shadow-md transition">
                    <div className="flex items-start justify-between gap-lg mb-md">
                      <div className="flex-1">
                        <a
                          href="#"
                          className="font-semibold text-blue-400 hover:text-blue-300 underline"
                        >
                          {doc.file_name}
                        </a>
                        <div className="flex items-center gap-md text-xs text-neutral-400 mt-sm">
                          <span>{formatFileSize(doc.file_size)}</span>
                          <span>•</span>
                          <span>{formatDate(doc.created_at)}</span>
                        </div>
                      </div>
                      <div className="flex gap-sm">
                        <button className="text-xs font-semibold text-blue-400 hover:text-blue-300">
                          View
                        </button>
                        <button className="text-xs font-semibold text-blue-400 hover:text-blue-300">
                          Download
                        </button>
                        <button className="text-xs font-semibold text-red-400 hover:text-red-400">
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Zone Coming Soon */}
      <div className="rounded-lg border-2 border-dashed border-blue-300 bg-blue-50 p-xl text-center">
        <div className="text-3xl mb-md">☁️</div>
        <p className="text-sm font-semibold text-blue-300 mb-sm">Upload files</p>
        <p className="text-xs text-blue-700">Drag & drop documents here to upload</p>
      </div>
    </div>
  )
}
