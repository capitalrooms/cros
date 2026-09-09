'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
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
}

interface GuideBlock {
  id: string
  sort_order: number
  heading: string
  body: string
  inline_image_url: string | null
}

const STAGE_OPTIONS = [
  { value: 'active', label: 'Active tenancy (move-in)' },
  { value: 'on_notice', label: 'On notice (notice given)' },
  { value: 'completed', label: 'Tenancy completed' },
]

// ── Reusable image upload button ─────────────────────────────────────────────
function ImageUploadButton({
  currentUrl,
  onUploaded,
  uploadPath,
  label = 'Upload image',
}: {
  currentUrl: string
  onUploaded: (url: string) => void
  uploadPath: string
  label?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(file: File) {
    setUploading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('path', uploadPath)
      const res = await fetch('/api/admin/guides/upload-image', { method: 'POST', body: form })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Upload failed'); return }
      onUploaded(d.url)
    } catch {
      setError('Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex items-center gap-sm flex-wrap">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-xs rounded-lg border border-neutral-300 bg-white text-xs font-semibold px-sm py-xs hover:bg-neutral-50 transition-colors disabled:opacity-50"
      >
        {uploading ? (
          <>
            <span className="w-3 h-3 rounded-full border border-neutral-400 border-t-neutral-700 animate-spin" />
            Uploading…
          </>
        ) : (
          <>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v7M3 4l3-3 3 3M1 10h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {label}
          </>
        )}
      </button>
      {currentUrl && (
        <button
          type="button"
          onClick={() => onUploaded('')}
          className="text-xs text-red-500 hover:text-red-700"
        >
          Remove
        </button>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

// ── Block editor ─────────────────────────────────────────────────────────────
function BlockEditor({
  block,
  guideId,
  onSaved,
  onDeleted,
}: {
  block: GuideBlock
  guideId: string
  onSaved: (b: GuideBlock) => void
  onDeleted: (id: string) => void
}) {
  const [heading, setHeading] = useState(block.heading)
  const [body, setBody] = useState(block.body)
  const [imageUrl, setImageUrl] = useState(block.inline_image_url || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [expanded, setExpanded] = useState(false)

  async function save() {
    setSaving(true)
    setSaved(false)
    const res = await fetch(`/api/admin/guides/${guideId}/blocks/${block.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ heading, body, inline_image_url: imageUrl || null }),
    })
    const d = await res.json()
    if (d.block) { onSaved(d.block); setSaved(true) }
    setSaving(false)
  }

  async function del() {
    if (!confirm('Delete this block? This cannot be undone.')) return
    setDeleting(true)
    await fetch(`/api/admin/guides/${guideId}/blocks/${block.id}`, { method: 'DELETE' })
    onDeleted(block.id)
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-sm px-md py-sm text-left hover:bg-neutral-50 transition-colors"
      >
        <span className="text-neutral-400 text-xs font-mono w-8 flex-shrink-0">{block.sort_order}</span>
        <span className="flex-1 text-sm font-semibold text-neutral-800 truncate">{heading || 'Untitled block'}</span>
        {imageUrl && <span className="text-xs text-blue-400 flex-shrink-0">🖼</span>}
        {saved && !expanded && <span className="text-xs text-green-600 flex-shrink-0">✓</span>}
        <svg
          width="14" height="14" viewBox="0 0 14 14" fill="none"
          className={`flex-shrink-0 text-neutral-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
        >
          <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {expanded && (
        <div className="px-md pb-md space-y-md border-t border-neutral-100 pt-md">
          <div>
            <label className="text-xs font-semibold text-neutral-600 block mb-xs">Heading</label>
            <input
              value={heading}
              onChange={e => setHeading(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 px-sm py-xs text-sm focus:outline-none focus:border-neutral-400"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-600 block mb-xs">Body text — one line per bullet</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={5}
              className="w-full rounded-lg border border-neutral-200 px-sm py-xs text-sm focus:outline-none focus:border-neutral-400 resize-y font-mono"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-600 block mb-xs">Inline image</label>
            <ImageUploadButton
              currentUrl={imageUrl}
              onUploaded={url => { setImageUrl(url); setSaved(false) }}
              uploadPath="block-images"
              label="Upload image"
            />
            {imageUrl && (
              <div className="mt-sm rounded-xl overflow-hidden bg-neutral-100 border border-neutral-200">
                <img
                  src={imageUrl}
                  alt=""
                  className="w-full object-contain max-h-40"
                  onError={e => (e.currentTarget.style.display = 'none')}
                />
              </div>
            )}
            {/* Also allow direct URL paste */}
            <input
              value={imageUrl}
              onChange={e => { setImageUrl(e.target.value); setSaved(false) }}
              placeholder="Or paste a URL…"
              className="mt-xs w-full rounded-lg border border-neutral-200 px-sm py-xs text-xs text-neutral-500 focus:outline-none focus:border-neutral-400"
            />
          </div>

          <div className="flex gap-sm pt-xs">
            <button
              onClick={save}
              disabled={saving}
              className="flex-1 rounded-lg bg-neutral-900 text-white text-xs font-semibold py-sm disabled:opacity-50"
            >
              {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save block'}
            </button>
            <button
              onClick={del}
              disabled={deleting}
              className="rounded-lg border border-red-200 text-red-600 text-xs font-semibold px-md py-sm disabled:opacity-50 hover:bg-red-50"
            >
              {deleting ? '…' : 'Delete'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminGuideDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [guide, setGuide] = useState<Guide | null>(null)
  const [blocks, setBlocks] = useState<GuideBlock[]>([])
  const [ackCount, setAckCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // editable guide fields
  const [title, setTitle] = useState('')
  const [emoji, setEmoji] = useState('')
  const [sortOrder, setSortOrder] = useState(0)
  const [visibility, setVisibility] = useState<'essential' | 'stage-triggered'>('essential')
  const [triggerStage, setTriggerStage] = useState('')
  const [ackRequired, setAckRequired] = useState(false)
  const [heroUrl, setHeroUrl] = useState('')
  const [isPublished, setIsPublished] = useState(false)

  useEffect(() => {
    fetch(`/api/admin/guides/${id}`)
      .then(r => r.json())
      .then(d => {
        const g = d.guide as Guide
        setGuide(g)
        setBlocks(d.blocks || [])
        setAckCount(d.acknowledgmentCount ?? 0)
        setTitle(g.title)
        setEmoji(g.emoji)
        setSortOrder(g.sort_order)
        setVisibility(g.visibility)
        setTriggerStage(g.trigger_stage || '')
        setAckRequired(g.acknowledgment_required)
        setHeroUrl(g.hero_image_url || '')
        setIsPublished(g.is_published)
      })
      .finally(() => setLoading(false))
  }, [id])

  async function saveGuide() {
    setSaving(true)
    setSaved(false)
    const res = await fetch(`/api/admin/guides/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title, emoji, sort_order: sortOrder,
        visibility, trigger_stage: triggerStage || null,
        acknowledgment_required: ackRequired,
        hero_image_url: heroUrl || null,
        is_published: isPublished,
      }),
    })
    const d = await res.json()
    if (d.guide) { setGuide(d.guide); setSaved(true) }
    setSaving(false)
  }

  async function addBlock() {
    const res = await fetch(`/api/admin/guides/${id}/blocks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ heading: 'New block', body: 'Add content here.' }),
    })
    const d = await res.json()
    if (d.block) setBlocks(prev => [...prev, d.block])
  }

  if (loading || !guide) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <AppBar left={<BackButton href="/admin/guides" />} />
        <div className="flex items-center justify-center pt-[30vh]">
          <div className="w-6 h-6 rounded-full border-2 border-neutral-300 border-t-neutral-700 animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50 pb-[80px]">
      <AppBar left={<BackButton href="/admin/guides" />} title="Edit Guide" />

      <main className="max-w-2xl mx-auto px-lg py-xl space-y-xl">

        {/* Guide settings */}
        <section className="bg-white rounded-2xl border border-neutral-200 p-lg space-y-md">
          <h2 className="text-sm font-bold text-neutral-900">Guide settings</h2>

          <div className="grid grid-cols-[1fr,auto] gap-sm">
            <div>
              <label className="text-xs font-semibold text-neutral-600 block mb-xs">Title</label>
              <input value={title} onChange={e => { setTitle(e.target.value); setSaved(false) }}
                className="w-full rounded-lg border border-neutral-200 px-sm py-xs text-sm focus:outline-none focus:border-neutral-400" />
            </div>
            <div>
              <label className="text-xs font-semibold text-neutral-600 block mb-xs">Emoji</label>
              <input value={emoji} onChange={e => { setEmoji(e.target.value); setSaved(false) }}
                className="w-16 rounded-lg border border-neutral-200 px-sm py-xs text-sm text-center focus:outline-none focus:border-neutral-400" />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-600 block mb-xs">URL slug</label>
            <div className="rounded-lg border border-neutral-100 bg-neutral-50 px-sm py-xs text-xs text-neutral-500 font-mono">
              /tenant/guides/<span className="text-neutral-700">{guide.slug}</span>
            </div>
            <p className="text-xs text-neutral-400 mt-xs">Slug is fixed after creation.</p>
          </div>

          <div className="grid grid-cols-2 gap-sm">
            <div>
              <label className="text-xs font-semibold text-neutral-600 block mb-xs">Sort order</label>
              <input type="number" value={sortOrder} onChange={e => { setSortOrder(Number(e.target.value)); setSaved(false) }}
                className="w-full rounded-lg border border-neutral-200 px-sm py-xs text-sm focus:outline-none focus:border-neutral-400" />
            </div>
            <div>
              <label className="text-xs font-semibold text-neutral-600 block mb-xs">Visibility</label>
              <select value={visibility} onChange={e => { setVisibility(e.target.value as any); setSaved(false) }}
                className="w-full rounded-lg border border-neutral-200 px-sm py-xs text-sm focus:outline-none focus:border-neutral-400 bg-white">
                <option value="essential">Always visible</option>
                <option value="stage-triggered">Stage-triggered</option>
              </select>
            </div>
          </div>

          {visibility === 'stage-triggered' && (
            <div>
              <label className="text-xs font-semibold text-neutral-600 block mb-xs">Show at tenancy stage</label>
              <select value={triggerStage} onChange={e => { setTriggerStage(e.target.value); setSaved(false) }}
                className="w-full rounded-lg border border-neutral-200 px-sm py-xs text-sm focus:outline-none focus:border-neutral-400 bg-white">
                <option value="">— select stage —</option>
                {STAGE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Acknowledgment toggle */}
          <div className="flex items-center justify-between rounded-xl bg-neutral-50 border border-neutral-200 px-md py-sm">
            <div>
              <p className="text-sm font-semibold text-neutral-800">Require acknowledgment</p>
              <p className="text-xs text-neutral-500">Tenant must confirm they've read the guide</p>
            </div>
            <button
              onClick={() => { setAckRequired(v => !v); setSaved(false) }}
              className={`relative w-11 h-6 rounded-full transition-colors ${ackRequired ? 'bg-neutral-900' : 'bg-neutral-300'}`}
            >
              <span className={`absolute top-[3px] left-[3px] w-[18px] h-[18px] bg-white rounded-full shadow transition-transform ${ackRequired ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          {ackCount > 0 && (
            <p className="text-xs text-neutral-500">
              ✓ {ackCount} tenant{ackCount !== 1 ? 's have' : ' has'} acknowledged this guide.
            </p>
          )}

          {/* Published toggle */}
          <div className="flex items-center justify-between rounded-xl bg-neutral-50 border border-neutral-200 px-md py-sm">
            <div>
              <p className="text-sm font-semibold text-neutral-800">Published</p>
              <p className="text-xs text-neutral-500">Tenants can see this guide</p>
            </div>
            <button
              onClick={() => { setIsPublished(v => !v); setSaved(false) }}
              className={`relative w-11 h-6 rounded-full transition-colors ${isPublished ? 'bg-neutral-900' : 'bg-neutral-300'}`}
            >
              <span className={`absolute top-[3px] left-[3px] w-[18px] h-[18px] bg-white rounded-full shadow transition-transform ${isPublished ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          {/* Hero image */}
          <div>
            <label className="text-xs font-semibold text-neutral-600 block mb-xs">Hero image</label>
            <ImageUploadButton
              currentUrl={heroUrl}
              onUploaded={url => { setHeroUrl(url); setSaved(false) }}
              uploadPath="hero-images"
              label="Upload hero image"
            />
            {heroUrl && (
              <div className="mt-sm rounded-xl overflow-hidden bg-neutral-100 border border-neutral-200">
                <img
                  src={heroUrl}
                  alt=""
                  className="w-full object-cover max-h-40"
                  onError={e => (e.currentTarget.style.display = 'none')}
                />
              </div>
            )}
            <input
              value={heroUrl}
              onChange={e => { setHeroUrl(e.target.value); setSaved(false) }}
              placeholder="Or paste a URL…"
              className="mt-xs w-full rounded-lg border border-neutral-200 px-sm py-xs text-xs text-neutral-500 focus:outline-none focus:border-neutral-400"
            />
          </div>

          <button
            onClick={saveGuide}
            disabled={saving}
            className="w-full rounded-xl bg-neutral-900 text-white text-sm font-semibold py-sm disabled:opacity-50"
          >
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save settings'}
          </button>
        </section>

        {/* Content blocks */}
        <section>
          <div className="flex items-center justify-between mb-md">
            <h2 className="text-sm font-bold text-neutral-900">
              Content blocks ({blocks.length})
            </h2>
            <button
              onClick={addBlock}
              className="text-xs font-semibold text-neutral-700 border border-neutral-300 rounded-lg px-sm py-xs hover:bg-neutral-100 transition-colors"
            >
              + Add block
            </button>
          </div>

          {blocks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 p-lg text-center text-sm text-neutral-400">
              No content blocks yet. Add the first one above.
            </div>
          ) : (
            <div className="space-y-sm">
              {blocks
                .sort((a, b) => a.sort_order - b.sort_order)
                .map(block => (
                  <BlockEditor
                    key={block.id}
                    block={block}
                    guideId={id}
                    onSaved={updated => setBlocks(prev => prev.map(b => b.id === updated.id ? updated : b))}
                    onDeleted={bid => setBlocks(prev => prev.filter(b => b.id !== bid))}
                  />
                ))}
            </div>
          )}
        </section>

        {/* Preview link */}
        <a
          href={`/tenant/guides/${guide.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-sm w-full rounded-2xl border border-neutral-200 bg-white py-md text-sm font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors"
        >
          Preview as tenant →
        </a>
      </main>
    </div>
  )
}
