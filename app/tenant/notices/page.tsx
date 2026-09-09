'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { createClient } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Notice {
  id: string
  notice_type: 'info' | 'task'
  subtype: string | null
  raw_text: string
  ai_text: string | null
  photo_url: string | null
  status: 'active' | 'resolved'
  resolved_by: string | null
  resolved_at: string | null
  resolved_photo_url: string | null
  created_at: string
  created_by_person: { id: string; first_name: string; last_name: string } | null
  resolved_by_person: { id: string; first_name: string; last_name: string } | null
}

const INFO_SUBTYPES = ['General update', 'Maintenance scheduled', 'Inspection', 'Parcel / delivery', 'Guest access', 'Reminder']
const TASK_SUBTYPES = ['Clean communal area', 'Take bins out', 'Sign document', 'Reply needed', 'Action required']

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 2) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function authorName(p: { first_name: string; last_name: string } | null) {
  if (!p) return 'Someone'
  return p.first_name || `${p.first_name} ${p.last_name}`.trim()
}

// ── Compose Modal ─────────────────────────────────────────────────────────────

interface ComposeProps {
  propertyId: string
  personId: string
  onPosted: (notice: Notice) => void
  onClose: () => void
}

function ComposeModal({ propertyId, personId, onPosted, onClose }: ComposeProps) {
  const [step, setStep] = useState<'type' | 'write'>('type')
  const [noticeType, setNoticeType] = useState<'info' | 'task'>('info')
  const [subtype, setSubtype] = useState('')
  const [rawText, setRawText] = useState('')
  const [aiText, setAiText] = useState('')
  const [rewriting, setRewriting] = useState(false)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  const textRef = useRef<HTMLTextAreaElement>(null)

  const subtypes = noticeType === 'info' ? INFO_SUBTYPES : TASK_SUBTYPES
  const displayText = aiText || rawText

  async function handleRewrite() {
    if (!rawText.trim()) return
    setRewriting(true)
    setError('')
    try {
      const res = await fetch('/api/tenant/notices/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: rawText, notice_type: noticeType, subtype }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Rewrite failed')
      setAiText(json.ai_text)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setRewriting(false)
    }
  }

  async function handlePost() {
    if (!displayText.trim()) return
    setPosting(true)
    setError('')
    try {
      const res = await fetch('/api/tenant/notices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: propertyId,
          notice_type: noticeType,
          subtype: subtype || null,
          raw_text: rawText,
          ai_text: aiText || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to post')
      onPosted(json.notice)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="mt-auto bg-white rounded-t-3xl overflow-hidden" style={{ maxHeight: '90vh' }}>
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-neutral-300" />
        </div>

        {step === 'type' ? (
          <div className="px-6 pb-10 pt-2">
            <h2 className="notice-board text-2xl font-bold text-neutral-900 mb-1">New Notice</h2>
            <p className="text-sm text-neutral-500 mb-6">What kind of notice is this?</p>

            <div className="space-y-3 mb-8">
              <button
                onClick={() => { setNoticeType('info'); setStep('write') }}
                className="w-full flex items-start gap-4 rounded-2xl border-2 border-neutral-200 bg-white p-4 text-left hover:border-neutral-900 transition-colors"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-2xl shrink-0">📢</div>
                <div>
                  <p className="font-bold text-neutral-900 notice-board">Info notice</p>
                  <p className="text-sm text-neutral-500 mt-0.5">Share an update, reminder, or heads-up. No action needed from housemates.</p>
                </div>
              </button>

              <button
                onClick={() => { setNoticeType('task'); setStep('write') }}
                className="w-full flex items-start gap-4 rounded-2xl border-2 border-neutral-200 bg-white p-4 text-left hover:border-neutral-900 transition-colors"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-2xl shrink-0">✅</div>
                <div>
                  <p className="font-bold text-neutral-900 notice-board">Task notice</p>
                  <p className="text-sm text-neutral-500 mt-0.5">Ask housemates to do something — bins, cleaning, signing a form.</p>
                </div>
              </button>
            </div>

            <button onClick={onClose} className="w-full text-center text-sm text-neutral-400 hover:text-neutral-700 py-2">
              Cancel
            </button>
          </div>
        ) : (
          <div className="px-6 pb-10 pt-2 overflow-y-auto" style={{ maxHeight: '85vh' }}>
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => setStep('type')} className="text-sm text-neutral-500 hover:text-neutral-900">← Back</button>
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${noticeType === 'info' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                {noticeType === 'info' ? '📢 Info notice' : '✅ Task notice'}
              </div>
            </div>

            <h2 className="notice-board text-xl font-bold text-neutral-900 mb-4">
              {noticeType === 'info' ? "What's the news?" : "What needs doing?"}
            </h2>

            {/* Subtype chips */}
            <div className="flex flex-wrap gap-2 mb-4">
              {subtypes.map(st => (
                <button
                  key={st}
                  onClick={() => setSubtype(subtype === st ? '' : st)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    subtype === st
                      ? 'bg-neutral-900 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            {/* Text area */}
            <textarea
              ref={textRef}
              value={rawText}
              onChange={e => { setRawText(e.target.value); if (aiText) setAiText('') }}
              rows={4}
              placeholder={
                noticeType === 'info'
                  ? 'e.g. "The boiler engineer is coming Thursday 9-11am, access to airing cupboard needed"'
                  : 'e.g. "Can someone take the blue bins out before Tuesday? They are full and it is our turn"'
              }
              className="w-full rounded-2xl border-2 border-neutral-200 px-4 py-3 text-sm text-neutral-900 resize-none focus:outline-none focus:border-neutral-900 placeholder:text-neutral-400"
            />

            {/* AI rewrite panel */}
            {aiText ? (
              <div className="mt-3 rounded-2xl border-2 border-neutral-900 bg-neutral-50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-neutral-500 uppercase tracking-wide">✨ AI polished</p>
                  <button onClick={() => setAiText('')} className="text-xs text-neutral-400 hover:text-neutral-700">Use original</button>
                </div>
                <p className="text-sm text-neutral-900 leading-relaxed">{aiText}</p>
              </div>
            ) : rawText.trim().length > 10 ? (
              <button
                onClick={handleRewrite}
                disabled={rewriting}
                className="mt-3 flex items-center gap-2 text-sm font-semibold text-neutral-600 hover:text-neutral-900 disabled:opacity-50"
              >
                <span>{rewriting ? '✨ Polishing…' : '✨ Polish with AI'}</span>
              </button>
            ) : null}

            {error && (
              <p className="mt-3 text-sm text-red-600">{error}</p>
            )}

            <button
              onClick={handlePost}
              disabled={posting || !displayText.trim()}
              className="mt-6 w-full rounded-2xl bg-neutral-900 py-4 text-base font-bold text-white hover:bg-neutral-700 disabled:opacity-40 transition-colors notice-board"
            >
              {posting ? 'Posting…' : noticeType === 'info' ? 'Post notice' : 'Post task'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Resolve Modal ─────────────────────────────────────────────────────────────

interface ResolveProps {
  notice: Notice
  onResolved: (id: string) => void
  onClose: () => void
}

function ResolveModal({ notice, onResolved, onClose }: ResolveProps) {
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState('')

  async function handleResolve() {
    setResolving(true)
    setError('')
    try {
      const res = await fetch(`/api/tenant/notices/${notice.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      onResolved(notice.id)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setResolving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="mt-auto bg-white rounded-t-3xl px-6 pt-4 pb-10">
        <div className="flex justify-center mb-4">
          <div className="w-10 h-1 rounded-full bg-neutral-300" />
        </div>
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-50 text-3xl mx-auto mb-4">✅</div>
        <h2 className="notice-board text-xl font-bold text-center text-neutral-900 mb-2">Mark as done?</h2>
        <p className="text-sm text-center text-neutral-500 mb-6">
          Let your housemates know this has been taken care of.
        </p>
        <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4 mb-6">
          <p className="text-sm text-neutral-800 leading-relaxed">{notice.ai_text || notice.raw_text}</p>
        </div>
        {error && <p className="text-sm text-red-600 mb-4 text-center">{error}</p>}
        <button
          onClick={handleResolve}
          disabled={resolving}
          className="w-full rounded-2xl bg-green-600 py-4 text-base font-bold text-white hover:bg-green-700 disabled:opacity-40 notice-board mb-3"
        >
          {resolving ? 'Marking done…' : '✅ Mark as done'}
        </button>
        <button onClick={onClose} className="w-full text-center text-sm text-neutral-400 hover:text-neutral-700 py-2">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Notice Card ───────────────────────────────────────────────────────────────

interface NoticeCardProps {
  notice: Notice
  personId: string
  onResolve: (n: Notice) => void
}

function NoticeCard({ notice, personId, onResolve }: NoticeCardProps) {
  const isTask = notice.notice_type === 'task'
  const isResolved = notice.status === 'resolved'
  const displayText = notice.ai_text || notice.raw_text

  return (
    <article
      className={`rounded-2xl border bg-white overflow-hidden transition-opacity ${isResolved ? 'opacity-60' : ''}`}
      style={{ borderColor: isResolved ? '#e5e7eb' : isTask ? '#fde68a' : '#dbeafe' }}
    >
      {/* Type stripe */}
      <div className={`h-1 w-full ${isResolved ? 'bg-neutral-200' : isTask ? 'bg-amber-400' : 'bg-blue-400'}`} />

      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
              isResolved ? 'bg-green-50 text-green-700' :
              isTask ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
            }`}>
              {isResolved ? '✅ Done' : isTask ? '🔔 Task' : '📢 Info'}
              {notice.subtype && ` · ${notice.subtype}`}
            </span>
          </div>
          <span className="text-xs text-neutral-400 shrink-0">{timeAgo(notice.created_at)}</span>
        </div>

        {/* Notice text */}
        <p className="text-sm text-neutral-800 leading-relaxed mb-3">{displayText}</p>

        {/* Photo */}
        {notice.photo_url && (
          <img src={notice.photo_url} alt="Notice photo" className="w-full rounded-xl object-cover mb-3" style={{ maxHeight: 200 }} />
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-neutral-100">
          <p className="text-xs text-neutral-400">
            {isResolved && notice.resolved_by_person
              ? `✅ Done by ${authorName(notice.resolved_by_person)}${notice.resolved_at ? ` · ${timeAgo(notice.resolved_at)}` : ''}`
              : `${authorName(notice.created_by_person)} · ${new Date(notice.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
            }
          </p>
          {isTask && !isResolved && (
            <button
              onClick={() => onResolve(notice)}
              className="rounded-xl bg-neutral-900 px-4 py-2 text-xs font-bold text-white hover:bg-neutral-700 transition-colors notice-board"
            >
              Done ✓
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function NoticesPage() {
  const router = useRouter()
  const [notices, setNotices] = useState<Notice[]>([])
  const [propertyId, setPropertyId] = useState<string | null>(null)
  const [personId, setPersonId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'tasks' | 'resolved'>('all')
  const [composing, setComposing] = useState(false)
  const [resolveTarget, setResolveTarget] = useState<Notice | null>(null)

  useEffect(() => {
    fetchNotices()
  }, [])

  async function fetchNotices() {
    setLoading(true)
    try {
      const res = await fetch('/api/tenant/notices')
      if (res.status === 401) { router.push('/login'); return }
      const json = await res.json()
      setNotices(json.notices || [])
      setPropertyId(json.propertyId || null)
      setPersonId(json.personId || '')
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  function handlePosted(notice: Notice) {
    setNotices(prev => [notice, ...prev])
    setComposing(false)
  }

  function handleResolved(id: string) {
    setNotices(prev => prev.map(n =>
      n.id === id ? { ...n, status: 'resolved', resolved_at: new Date().toISOString() } : n
    ))
    setResolveTarget(null)
  }

  const filtered = notices.filter(n => {
    if (filter === 'tasks') return n.notice_type === 'task' && n.status === 'active'
    if (filter === 'resolved') return n.status === 'resolved'
    return n.status === 'active'
  })

  const taskCount = notices.filter(n => n.notice_type === 'task' && n.status === 'active').length

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/tenant" />} />

      <main className="mx-auto max-w-xl px-4 pb-24 pt-4">

        {/* Hero header */}
        <div className="mb-6">
          <h1 className="notice-board text-3xl font-extrabold text-neutral-900 leading-tight">
            📋 Notice Board
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Updates and tasks for your house.
          </p>
        </div>

        {/* Compose button */}
        {propertyId && (
          <button
            onClick={() => setComposing(true)}
            className="notice-board mb-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-neutral-900 py-4 text-base font-bold text-white hover:bg-neutral-700 transition-colors"
          >
            <span className="text-lg">+</span> Post a notice
          </button>
        )}

        {/* Filter tabs */}
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
          {(['all', 'tasks', 'resolved'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`notice-board rounded-full px-4 py-2 text-sm font-bold whitespace-nowrap transition-colors ${
                filter === f
                  ? 'bg-neutral-900 text-white'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              {f === 'all' && 'All active'}
              {f === 'tasks' && <>Tasks{taskCount > 0 && <span className="ml-1.5 rounded-full bg-amber-400 text-neutral-900 px-1.5 py-0.5 text-xs font-extrabold">{taskCount}</span>}</>}
              {f === 'resolved' && 'Done'}
            </button>
          ))}
        </div>

        {/* Notice list */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-28 rounded-2xl bg-neutral-100 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 py-16 text-center">
            <p className="text-3xl mb-3">{filter === 'tasks' ? '✅' : filter === 'resolved' ? '📦' : '🏡'}</p>
            <p className="notice-board font-bold text-neutral-700">
              {filter === 'tasks' ? 'No open tasks' : filter === 'resolved' ? 'Nothing done yet' : 'All quiet'}
            </p>
            <p className="text-sm text-neutral-400 mt-1">
              {filter === 'all' ? 'Be the first to post a notice.' : ''}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map(n => (
              <NoticeCard
                key={n.id}
                notice={n}
                personId={personId}
                onResolve={setResolveTarget}
              />
            ))}
          </div>
        )}
      </main>

      {composing && propertyId && (
        <ComposeModal
          propertyId={propertyId}
          personId={personId}
          onPosted={handlePosted}
          onClose={() => setComposing(false)}
        />
      )}

      {resolveTarget && (
        <ResolveModal
          notice={resolveTarget}
          onResolved={handleResolved}
          onClose={() => setResolveTarget(null)}
        />
      )}
    </div>
  )
}
