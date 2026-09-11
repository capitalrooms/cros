'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { sortPropertiesNumerically } from '@/lib/sortProperties'

/**
 * Share Target landing page.
 *
 * After the iOS/Android share sheet posts to /api/share-target, the API
 * route processes the content and redirects here with query params describing
 * what was shared:
 *
 *   ?path=...&fileUrl=...&fileName=...&fileType=...   — a file was shared
 *   ?title=...&text=...&url=...                       — text / URL was shared
 */
export default function ShareTargetPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const path     = searchParams.get('path')     || ''
  const fileUrl  = searchParams.get('fileUrl')  || ''
  const fileName = searchParams.get('fileName') || 'shared-file'
  const fileType = searchParams.get('fileType') || ''
  const sharedTitle = searchParams.get('title') || ''
  const sharedText  = searchParams.get('text')  || ''
  const sharedUrl   = searchParams.get('url')   || ''
  const hasFile     = !!path && !!fileUrl
  const hasText     = !!(sharedText || sharedUrl)

  const [loading, setLoading]        = useState(true)
  const [properties, setProperties]  = useState<any[]>([])
  const [propertyId, setPropertyId]  = useState('')
  const [noteText, setNoteText]      = useState(
    [sharedTitle, sharedText, sharedUrl].filter(Boolean).join('\n')
  )
  const [saving, setSaving]          = useState(false)
  const [saved, setSaved]            = useState(false)
  const [error, setError]            = useState('')
  const [userRole, setUserRole]      = useState('')

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data) { router.push('/login'); return }
      setUserRole(data.assignment?.role || '')

      const supabase = createClient()
      const { data: props } = await supabase
        .from('properties')
        .select('id, name, address')
        .order('name')
      setProperties(sortPropertiesNumerically(props || []))
      if (props?.[0]) setPropertyId(props[0].id)
      setLoading(false)
    }
    init()
  }, [router])

  async function handleSendToAI() {
    // Redirect to the AI document upload page with the pre-uploaded file URL
    const params = new URLSearchParams({ sharedFileUrl: fileUrl, sharedFileName: fileName })
    router.push(`/admin/ai-upload?${params}`)
  }

  async function handleSaveNote() {
    if (!noteText.trim()) return
    setSaving(true); setError('')
    try {
      const supabase = createClient()
      const { error: err } = await supabase
        .from('property_notes')
        .insert({
          property_id: propertyId || null,
          title: sharedTitle || 'Shared note',
          content: noteText.trim(),
          category: 'general',
          is_deleted: false,
        })
      if (err) throw err
      setSaved(true)
    } catch (e: any) {
      setError(e.message || 'Failed to save note')
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center">
        <p className="text-sm text-neutral-400">Loading…</p>
      </div>
    )
  }

  const isAdmin = ['administrator', 'admin'].includes(userRole)
  const backHref = userRole === 'contractor' ? '/contractor'
    : userRole === 'cleaner' ? '/cleaner'
    : userRole === 'lettings' ? '/lettings'
    : userRole === 'landlord' ? '/landlord'
    : userRole === 'tenant' ? '/tenant'
    : '/admin'

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href={backHref} />} title="Shared content" />

      <main className="mx-auto max-w-md px-lg py-2xl">

        {/* ── Shared file ─────────────────────────────────────────────────── */}
        {hasFile && (
          <div className="space-y-lg">
            <div>
              <h1 className="text-xl font-bold text-neutral-900">📎 File shared</h1>
              <p className="text-sm text-neutral-500 mt-xs truncate">{fileName}</p>
            </div>

            {/* Image preview */}
            {fileType.startsWith('image/') && (
              <div className="rounded-2xl overflow-hidden border border-neutral-200 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fileUrl} alt="Shared file" className="w-full object-contain max-h-64" />
              </div>
            )}

            {/* PDF badge */}
            {fileType === 'application/pdf' && (
              <div className="rounded-2xl border border-neutral-200 bg-white p-lg flex items-center gap-md">
                <span className="text-4xl">📄</span>
                <div>
                  <p className="font-semibold text-neutral-900 truncate">{fileName}</p>
                  <p className="text-xs text-neutral-500 mt-xs">PDF document</p>
                </div>
              </div>
            )}

            {/* Action buttons */}
            {isAdmin ? (
              <div className="space-y-sm">
                <button
                  onClick={handleSendToAI}
                  className="w-full rounded-2xl bg-neutral-950 text-white font-bold py-md px-lg text-sm hover:bg-neutral-800 transition"
                >
                  ✨ Process with AI → Upload
                </button>
                <p className="text-xs text-neutral-400 text-center">
                  AI will extract property, tenancy, or invoice data from this file
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-neutral-200 bg-white p-lg text-sm text-neutral-600">
                File received. An admin will process this shortly.
              </div>
            )}
          </div>
        )}

        {/* ── Shared text / URL ────────────────────────────────────────────── */}
        {hasText && !hasFile && (
          <div className="space-y-lg">
            <div>
              <h1 className="text-xl font-bold text-neutral-900">💬 Shared text</h1>
              {sharedTitle && <p className="text-sm font-semibold text-neutral-700 mt-xs">{sharedTitle}</p>}
            </div>

            {saved ? (
              <div className="rounded-2xl bg-green-50 border border-green-200 p-lg text-center">
                <p className="text-2xl mb-sm">✅</p>
                <p className="font-bold text-green-900">Saved as note</p>
                <button
                  onClick={() => router.push(backHref)}
                  className="mt-md text-sm font-semibold text-green-700 underline"
                >
                  Back to dashboard
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-sm">
                  <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Note</label>
                  <textarea
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    rows={5}
                    className="w-full rounded-xl border border-neutral-300 bg-white px-md py-sm text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900 resize-none"
                  />
                </div>

                {properties.length > 0 && (
                  <div className="space-y-sm">
                    <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Property (optional)</label>
                    <select
                      value={propertyId}
                      onChange={e => setPropertyId(e.target.value)}
                      className="w-full rounded-xl border border-neutral-300 bg-white px-md py-sm text-sm text-neutral-900 focus:outline-none"
                    >
                      <option value="">— No property —</option>
                      {properties.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {error && <p className="text-sm text-red-600">{error}</p>}

                <button
                  onClick={handleSaveNote}
                  disabled={saving || !noteText.trim()}
                  className="w-full rounded-2xl bg-neutral-950 text-white font-bold py-md px-lg text-sm hover:bg-neutral-800 transition disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save note'}
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Nothing shared ───────────────────────────────────────────────── */}
        {!hasFile && !hasText && (
          <div className="text-center py-3xl">
            <p className="text-4xl mb-md">🤔</p>
            <p className="font-bold text-neutral-900">Nothing was shared</p>
            <p className="text-sm text-neutral-500 mt-sm">Try sharing a photo or text from another app.</p>
            <button
              onClick={() => router.push(backHref)}
              className="mt-xl text-sm font-semibold text-neutral-700 underline"
            >
              Back to dashboard
            </button>
          </div>
        )}

      </main>
    </div>
  )
}
