'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'

interface Guide {
  id: string
  slug: string
  title: string
  emoji: string
  sort_order: number
  visibility: 'essential' | 'stage-triggered'
  trigger_stage: string | null
  acknowledgment_required: boolean
  hero_image_url: string | null
  is_published: boolean
  guide_blocks: [{ count: number }]
  guide_acknowledgments: [{ count: number }]
}

const STAGE_LABELS: Record<string, string> = {
  active: 'Move-in / Active',
  on_notice: 'On notice',
  completed: 'Moved out',
}

function slugify(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

function NewGuideModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState('')
  const [emoji, setEmoji] = useState('📖')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function handleTitleChange(v: string) {
    setTitle(v)
    if (!slugEdited) setSlug(slugify(v))
  }

  async function create() {
    if (!title.trim() || !slug.trim()) { setError('Title and slug are required'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/guides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), slug: slug.trim(), emoji, sort_order: 99 }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Failed to create guide'); return }
      onCreated(d.guide.id)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-md">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-lg space-y-md mb-4 sm:mb-0">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-neutral-900">New guide</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none">×</button>
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-sm py-xs">{error}</p>
        )}

        <div className="grid grid-cols-[1fr,auto] gap-sm">
          <div>
            <label className="text-xs font-semibold text-neutral-600 block mb-xs">Title</label>
            <input
              value={title}
              onChange={e => handleTitleChange(e.target.value)}
              placeholder="e.g. Fire Safety Guide"
              autoFocus
              className="w-full rounded-lg border border-neutral-200 px-sm py-xs text-sm focus:outline-none focus:border-neutral-400"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-neutral-600 block mb-xs">Emoji</label>
            <input
              value={emoji}
              onChange={e => setEmoji(e.target.value)}
              className="w-16 rounded-lg border border-neutral-200 px-sm py-xs text-sm text-center focus:outline-none focus:border-neutral-400"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-neutral-600 block mb-xs">URL slug</label>
          <input
            value={slug}
            onChange={e => { setSlug(e.target.value); setSlugEdited(true) }}
            placeholder="fire-safety-guide"
            className="w-full rounded-lg border border-neutral-200 px-sm py-xs text-sm font-mono focus:outline-none focus:border-neutral-400"
          />
          <p className="text-xs text-neutral-400 mt-xs">/tenant/guides/<span className="text-neutral-600">{slug || '…'}</span></p>
        </div>

        <div className="flex gap-sm pt-xs">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-neutral-200 text-sm font-semibold py-sm text-neutral-600 hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            onClick={create}
            disabled={saving || !title.trim() || !slug.trim()}
            className="flex-1 rounded-xl bg-neutral-900 text-white text-sm font-semibold py-sm disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create guide'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminGuidesPage() {
  const router = useRouter()
  const [guides, setGuides] = useState<Guide[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

  useEffect(() => {
    fetch('/api/admin/guides')
      .then(r => r.json())
      .then(d => setGuides(d.guides || []))
      .finally(() => setLoading(false))
  }, [])

  function handleCreated(id: string) {
    setShowNew(false)
    router.push(`/admin/guides/${id}`)
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <AppBar
        left={<BackButton href="/admin" />}
        title="Tenant Guides"
      />

      {showNew && (
        <NewGuideModal onClose={() => setShowNew(false)} onCreated={handleCreated} />
      )}

      <main className="max-w-3xl mx-auto px-lg py-xl">
        <div className="flex items-center justify-between mb-xl">
          <div>
            <h1 className="text-xl font-bold text-neutral-900">Tenant Guides</h1>
            <p className="text-sm text-neutral-500 mt-xs">
              Create and manage guides shown to tenants in the app.
            </p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-xs rounded-xl bg-neutral-900 text-white text-sm font-semibold px-md py-sm hover:bg-neutral-700 transition-colors"
          >
            <span className="text-base leading-none">+</span>
            New guide
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-[20vh]">
            <div className="w-6 h-6 rounded-full border-2 border-neutral-300 border-t-neutral-700 animate-spin" />
          </div>
        ) : (
          <div className="space-y-sm">
            {guides.length === 0 && (
              <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-xl text-center text-sm text-neutral-400">
                No guides yet. Create your first one above.
              </div>
            )}
            {guides.map(guide => (
              <Link
                key={guide.id}
                href={`/admin/guides/${guide.id}`}
                className="flex items-center gap-md bg-white rounded-2xl border border-neutral-200 p-lg hover:border-neutral-400 transition-colors"
              >
                {/* Emoji / hero thumbnail */}
                <div className="flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden bg-neutral-100 flex items-center justify-center">
                  {guide.hero_image_url ? (
                    <img src={guide.hero_image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl">{guide.emoji}</span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-sm flex-wrap">
                    <p className="font-semibold text-neutral-900 text-sm">{guide.title}</p>
                    {!guide.is_published && (
                      <span className="text-xs bg-neutral-100 text-neutral-500 rounded-full px-sm py-[2px]">Draft</span>
                    )}
                    {guide.acknowledgment_required && (
                      <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-sm py-[2px]">Acknowledgment on</span>
                    )}
                  </div>
                  <div className="flex items-center gap-sm mt-xs flex-wrap">
                    <span className="text-xs text-neutral-500">
                      {guide.visibility === 'stage-triggered'
                        ? `Stage: ${STAGE_LABELS[guide.trigger_stage ?? ''] ?? guide.trigger_stage}`
                        : 'Always visible'}
                    </span>
                    <span className="text-neutral-300">·</span>
                    <span className="text-xs text-neutral-500">
                      {guide.guide_blocks?.[0]?.count ?? 0} blocks
                    </span>
                    <span className="text-neutral-300">·</span>
                    <span className="text-xs text-neutral-500">
                      {guide.guide_acknowledgments?.[0]?.count ?? 0} acknowledged
                    </span>
                  </div>
                </div>

                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 text-neutral-400">
                  <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
