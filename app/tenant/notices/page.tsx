'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { createClient } from '@/lib/supabase'

async function authHeaders() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }
    : { 'Content-Type': 'application/json' }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type NoticeType = 'info' | 'task' | 'update' | 'house_reminder' | 'maintenance'

interface Notice {
  id: string
  notice_type: NoticeType
  subtype: string | null
  raw_text: string
  ai_text: string | null
  photo_url: string | null
  status: 'active' | 'resolved'
  resolved_by: string | null
  resolved_at: string | null
  resolved_photo_url: string | null
  deadline: string | null
  created_at: string
  created_by_person: { id: string; first_name: string; last_name: string } | null
  resolved_by_person: { id: string; first_name: string; last_name: string } | null
}

// Guest staying over preset: auto-expires after 2 nights (48h)
const GUEST_PRESET = {
  type: 'update' as NoticeType,
  subtype: 'Guest staying over',
  text: 'Heads up — I have a guest staying over for a couple of nights. Just letting you know! 🏠',
  expiresHours: 48,
}

// Subtype presets by notice type
const SUBTYPES: Record<string, string[]> = {
  info:   ['General update', 'Maintenance scheduled', 'Inspection', 'Parcel / delivery', 'Reminder'],
  task:   ['Clean communal area', 'Take bins out', 'Sign document', 'Reply needed', 'Action required'],
  update: ['Guest staying over', 'Away this week', 'Back late tonight', 'Expecting a delivery'],
}

// ── Badge config ──────────────────────────────────────────────────────────────

const BADGE: Record<NoticeType, { label: string; emoji: string; stripe: string; pill: string; border: string }> = {
  info:          { label: 'Info',           emoji: '📢', stripe: 'bg-blue-400',    pill: 'bg-blue-50 text-blue-700',    border: '#dbeafe' },
  task:          { label: 'Task',           emoji: '✅', stripe: 'bg-amber-400',   pill: 'bg-amber-50 text-amber-700',  border: '#fde68a' },
  update:        { label: 'Update',         emoji: '💬', stripe: 'bg-green-400',   pill: 'bg-green-50 text-green-700',  border: '#bbf7d0' },
  house_reminder:{ label: 'House reminder', emoji: '🏠', stripe: 'bg-neutral-300', pill: 'bg-neutral-100 text-neutral-600', border: '#e5e7eb' },
  maintenance:   { label: 'Maintenance',    emoji: '🔧', stripe: 'bg-orange-400',  pill: 'bg-orange-50 text-orange-700', border: '#fed7aa' },
}

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

function authorName(p: { first_name: string; last_name: string } | null, _isHouseReminder: boolean, isMaintenance?: boolean) {
  if (isMaintenance) return 'Capital Rooms'
  if (!p) return 'A housemate'
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || 'A housemate'
}

// ── Compose Modal ─────────────────────────────────────────────────────────────

interface ComposeProps {
  propertyId: string
  personId: string
  onPosted: (notice: Notice) => void
  onClose: () => void
  initialPreset?: typeof GUEST_PRESET | null
}

function ComposeModal({ propertyId, personId, onPosted, onClose, initialPreset }: ComposeProps) {
  const [step, setStep] = useState<'type' | 'jedi' | 'write'>(initialPreset ? 'write' : 'type')
  const [noticeType, setNoticeType] = useState<NoticeType>(initialPreset?.type ?? 'info')
  const [subtype, setSubtype] = useState(initialPreset?.subtype ?? '')
  const [rawText, setRawText] = useState(initialPreset?.text ?? '')
  const [aiText, setAiText] = useState('')
  const [deadline, setDeadline] = useState('')
  const [rewriting, setRewriting] = useState(false)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  const [jediInput, setJediInput] = useState('')
  const [jediLoading, setJediLoading] = useState(false)
  const textRef = useRef<HTMLTextAreaElement>(null)

  const subtypeList = SUBTYPES[noticeType] || []
  const displayText = aiText || rawText
  const badge = BADGE[noticeType]

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
      // For guest preset: server will set expires_at = now + 48h
      const body: any = {
        property_id: propertyId,
        notice_type: noticeType,
        subtype: subtype || null,
        raw_text: rawText,
        ai_text: aiText || null,
      }
      if (noticeType === 'task' && deadline) body.deadline = deadline
      if (subtype === 'Guest staying over') body.auto_expire_hours = GUEST_PRESET.expiresHours

      const headers = await authHeaders()
      const res = await fetch('/api/tenant/notices', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
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

  const TYPE_OPTIONS: Array<{ type: NoticeType; emoji: string; title: string; desc: string; examples: string[] }> = [
    {
      type: 'update',
      emoji: '💬',
      title: 'Quick update',
      desc: 'A personal heads-up that auto-disappears after a few days.',
      examples: ['Away this week', 'Back late tonight', 'Expecting a delivery Tue 2–5pm', 'Working from home today'],
    },
    {
      type: 'task',
      emoji: '✅',
      title: 'Task for the house',
      desc: 'Something that needs doing. Stays on the board until someone marks it done.',
      examples: ['Blue bins out by Tuesday', 'Clean the hob — it\'s been a while', 'Someone needs to buy washing-up liquid', 'Sign the inspection form on the kitchen table'],
    },
    {
      type: 'info',
      emoji: '📢',
      title: 'Info / announcement',
      desc: 'General news for the house. No action needed from anyone.',
      examples: ['Engineer coming Thursday 9–11am', 'Broadband may be slow this evening', 'Landlord inspection Friday afternoon', 'Parcel left at the front door for everyone'],
    },
  ]

  async function handleJediCompose() {
    if (!jediInput.trim() || jediLoading) return
    setJediLoading(true)
    setError('')
    try {
      const res = await fetch('/api/tenant/notices/smart-compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: jediInput.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'AI unavailable')
      setNoticeType(json.notice_type as NoticeType)
      setSubtype(json.subtype || '')
      setAiText(json.ai_text || '')
      setRawText(jediInput.trim())
      if (json.deadline) setDeadline(json.deadline)
      setStep('write')
    } catch (e: any) {
      setError('AI couldn\'t draft this — pick a type manually below.')
      setStep('type')
    } finally {
      setJediLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="mt-auto bg-white rounded-t-3xl overflow-hidden" style={{ maxHeight: '92vh' }}>
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-neutral-300" />
        </div>

        {step === 'jedi' ? (
          <div className="px-6 pb-10 pt-2 overflow-y-auto" style={{ maxHeight: '88vh' }}>
            <button onClick={() => setStep('type')} className="text-sm text-neutral-500 hover:text-neutral-900 mb-4 block">← Back</button>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">⚡</span>
              <h2 className="notice-board text-xl font-bold text-neutral-900">AI draft</h2>
            </div>
            <p className="text-sm text-neutral-500 mb-5">Just describe what you want to post — AI will pick the type, write it properly, and even set a deadline if you mention one.</p>
            <textarea
              autoFocus
              value={jediInput}
              onChange={e => setJediInput(e.target.value)}
              rows={4}
              placeholder={'e.g. "Can someone take the blue bins out before Tuesday — they\'re full" or "I have a friend staying Wednesday and Thursday night"'}
              className="w-full rounded-2xl border-2 border-neutral-200 px-4 py-3 text-sm text-neutral-900 resize-none focus:outline-none focus:border-neutral-900 placeholder:text-neutral-400 mb-4"
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleJediCompose() }}
            />
            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
            <button
              onClick={handleJediCompose}
              disabled={!jediInput.trim() || jediLoading}
              className="w-full rounded-2xl bg-neutral-900 py-4 text-sm font-bold text-white disabled:opacity-40 transition-colors notice-board"
            >
              {jediLoading ? '⚡ Drafting…' : '⚡ Draft with AI'}
            </button>
            <p className="text-xs text-center text-neutral-400 mt-3">You'll be able to review and edit before posting.</p>
          </div>
        ) : step === 'type' ? (
          <div className="px-6 pb-10 pt-2 overflow-y-auto" style={{ maxHeight: '88vh' }}>
            <h2 className="notice-board text-2xl font-bold text-neutral-900 mb-1">New notice</h2>
            <p className="text-sm text-neutral-500 mb-4">What would you like to post?</p>

            {/* AI Jedi path */}
            <button
              onClick={() => setStep('jedi')}
              className="w-full flex items-start gap-4 rounded-2xl border-2 border-neutral-900 bg-neutral-900 p-4 text-left hover:bg-neutral-800 transition-colors mb-4"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-2xl shrink-0">⚡</div>
              <div>
                <p className="font-bold text-white notice-board">Let AI write it</p>
                <p className="text-sm text-white/60 mt-0.5">Describe what you need in plain English — AI picks the type, writes it properly, and sets deadlines.</p>
              </div>
            </button>

            {/* Guest staying over quick-tap */}
            <button
              onClick={() => {
                setNoticeType(GUEST_PRESET.type)
                setSubtype(GUEST_PRESET.subtype)
                setRawText(GUEST_PRESET.text)
                setStep('write')
              }}
              className="w-full flex items-start gap-4 rounded-2xl border-2 border-green-300 bg-green-50 p-4 text-left hover:border-green-500 transition-colors mb-3"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-100 text-2xl shrink-0">🛌</div>
              <div>
                <p className="font-bold text-green-900 notice-board">Guest staying over</p>
                <p className="text-sm text-green-700 mt-0.5">Quick one-tap notice. Auto-disappears after 2 nights.</p>
              </div>
            </button>

            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400 mb-3">Or pick a type</p>

            <div className="space-y-3 mb-6">
              {TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.type}
                  onClick={() => { setNoticeType(opt.type); setStep('write') }}
                  className="w-full flex items-start gap-4 rounded-2xl border-2 border-neutral-200 bg-white p-4 text-left hover:border-neutral-900 transition-colors"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-50 text-2xl shrink-0">{opt.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-neutral-900 notice-board">{opt.title}</p>
                    <p className="text-sm text-neutral-500 mt-0.5">{opt.desc}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {opt.examples.map(ex => (
                        <span key={ex} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">e.g. {ex}</span>
                      ))}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <button onClick={onClose} className="w-full text-center text-sm text-neutral-400 hover:text-neutral-700 py-2">Cancel</button>
          </div>
        ) : (
          <div className="px-6 pb-10 pt-2 overflow-y-auto" style={{ maxHeight: '88vh' }}>
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => setStep('type')} className="text-sm text-neutral-500 hover:text-neutral-900">← Back</button>
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${badge.pill}`}>
                {badge.emoji} {badge.label}
              </div>
            </div>

            <h2 className="notice-board text-xl font-bold text-neutral-900 mb-4">
              {noticeType === 'task' ? "What needs doing?" : noticeType === 'update' ? "Quick heads-up" : "What's the news?"}
            </h2>

            {/* Subtype chips */}
            {subtypeList.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {subtypeList.map(st => (
                  <button
                    key={st}
                    onClick={() => {
                      setSubtype(subtype === st ? '' : st)
                      if (st === 'Guest staying over') setRawText(GUEST_PRESET.text)
                    }}
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
            )}

            {/* Text area */}
            <textarea
              ref={textRef}
              value={rawText}
              onChange={e => { setRawText(e.target.value); if (aiText) setAiText('') }}
              rows={4}
              placeholder={
                noticeType === 'task'
                  ? 'e.g. "Can someone take the blue bins out before Tuesday? They are full."'
                  : noticeType === 'update'
                    ? 'e.g. "I have a guest staying tonight and tomorrow — just letting you know!"'
                    : 'e.g. "The boiler engineer is coming Thursday 9–11am"'
              }
              className="w-full rounded-2xl border-2 border-neutral-200 px-4 py-3 text-sm text-neutral-900 resize-none focus:outline-none focus:border-neutral-900 placeholder:text-neutral-400"
            />

            {/* Deadline (tasks only) */}
            {noticeType === 'task' && (
              <div className="mt-3">
                <label className="block text-xs font-semibold text-neutral-500 mb-1">Deadline (optional)</label>
                <input
                  type="date"
                  value={deadline}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => setDeadline(e.target.value)}
                  className="rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:border-neutral-900"
                />
              </div>
            )}

            {/* Auto-expire note for updates */}
            {noticeType === 'update' && (
              <p className="mt-2 text-xs text-neutral-400">
                {subtype === 'Guest staying over'
                  ? '🛌 Auto-expires after 2 nights.'
                  : 'Updates disappear automatically after a few days.'}
              </p>
            )}

            {/* AI rewrite */}
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
                {rewriting ? '✨ Polishing…' : '✨ Polish with AI'}
              </button>
            ) : null}

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <button
              onClick={handlePost}
              disabled={posting || !displayText.trim()}
              className="mt-6 w-full rounded-2xl bg-neutral-900 py-4 text-base font-bold text-white hover:bg-neutral-700 disabled:opacity-40 transition-colors notice-board"
            >
              {posting ? 'Posting…' : noticeType === 'task' ? 'Post task' : noticeType === 'update' ? 'Post update' : 'Post notice'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Resolve Modal ─────────────────────────────────────────────────────────────

function ResolveModal({ notice, onResolved, onClose }: { notice: Notice; onResolved: (id: string) => void; onClose: () => void }) {
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState('')

  async function handleResolve() {
    setResolving(true)
    try {
      const headers = await authHeaders()
      const res = await fetch(`/api/tenant/notices/${notice.id}/resolve`, { method: 'POST', headers, body: JSON.stringify({}) })
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
        <div className="flex justify-center mb-4"><div className="w-10 h-1 rounded-full bg-neutral-300" /></div>
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-50 text-3xl mx-auto mb-4">✅</div>
        <h2 className="notice-board text-xl font-bold text-center text-neutral-900 mb-2">Mark as done?</h2>
        <p className="text-sm text-center text-neutral-500 mb-6">Let your housemates know this has been taken care of.</p>
        <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4 mb-6">
          <p className="text-sm text-neutral-800 leading-relaxed">{notice.ai_text || notice.raw_text}</p>
        </div>
        {error && <p className="text-sm text-red-600 mb-4 text-center">{error}</p>}
        <button onClick={handleResolve} disabled={resolving}
          className="w-full rounded-2xl bg-green-600 py-4 text-base font-bold text-white hover:bg-green-700 disabled:opacity-40 notice-board mb-3">
          {resolving ? 'Marking done…' : '✅ Mark as done'}
        </button>
        <button onClick={onClose} className="w-full text-center text-sm text-neutral-400 hover:text-neutral-700 py-2">Cancel</button>
      </div>
    </div>
  )
}

// ── Notice Card ───────────────────────────────────────────────────────────────

function NoticeCard({ notice, personId, onResolve, onWithdraw }: { notice: Notice; personId: string; onResolve: (n: Notice) => void; onWithdraw: (n: Notice) => void }) {
  // Maintenance notices are 'info' type but contain [ref:ticketId] in raw_text
  const isMaintenance = /\[ref:[^\]]+\]/.test(notice.raw_text)
  const type = isMaintenance ? ('maintenance' as NoticeType) : (notice.notice_type as NoticeType)
  const badge = BADGE[type] ?? BADGE.info
  const isTask = type === 'task'
  const isHouseReminder = type === 'house_reminder'
  const isResolved = notice.status === 'resolved'
  // Strip internal [ref:...] suffix from maintenance notices
  const rawDisplay = notice.ai_text || notice.raw_text
  const displayText = isMaintenance ? rawDisplay.replace(/\s*\[ref:[^\]]+\]$/, '') : rawDisplay
  const isOverdue = isTask && !isResolved && notice.deadline && new Date(notice.deadline) < new Date()
  // Is this notice posted by the current user? (house reminders now store created_by)
  const isMine = !!personId && notice.created_by_person?.id === personId && !isMaintenance

  return (
    <article
      className={`rounded-2xl border bg-white overflow-hidden transition-opacity ${isResolved ? 'opacity-60' : ''}`}
      style={{ borderColor: isResolved ? '#e5e7eb' : badge.border }}
    >
      {/* Type stripe */}
      <div className={`h-1 w-full ${isResolved ? 'bg-neutral-200' : badge.stripe}`} />

      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${isResolved ? 'bg-green-50 text-green-700' : badge.pill}`}>
              {isResolved ? '✅ Done' : `${badge.emoji} ${badge.label}`}
              {notice.subtype && !isResolved && ` · ${notice.subtype}`}
            </span>
            {isOverdue && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
                Overdue
              </span>
            )}
          </div>
          <span className="text-xs text-neutral-400 shrink-0">{timeAgo(notice.created_at)}</span>
        </div>

        {/* Notice text */}
        <p className="text-sm text-neutral-800 leading-relaxed mb-2">{displayText}</p>

        {/* Deadline */}
        {isTask && notice.deadline && !isResolved && (
          <p className={`text-xs font-semibold mb-2 ${isOverdue ? 'text-red-600' : 'text-neutral-500'}`}>
            📅 By {new Date(notice.deadline + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
          </p>
        )}

        {/* Photo */}
        {notice.photo_url && (
          <img src={notice.photo_url} alt="Notice photo" className="w-full rounded-xl object-cover mb-3" style={{ maxHeight: 200 }} />
        )}

        {/* House reminder — no anonymity note */}
        {/* Maintenance notice note */}
        {isMaintenance && !isResolved && (
          <p className="text-xs text-neutral-400 mb-2 italic">Auto-posted when the issue was reported. Will be removed once the job is complete.</p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-neutral-100">
          <p className="text-xs text-neutral-400">
            {isResolved && notice.resolved_by_person
              ? `✅ Done by ${authorName(notice.resolved_by_person, false)}${notice.resolved_at ? ` · ${timeAgo(notice.resolved_at)}` : ''}`
              : `${authorName(notice.created_by_person, isHouseReminder, isMaintenance)} · ${new Date(notice.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
            }
          </p>
          <div className="flex items-center gap-2">
            {/* Withdraw button — only shown to the original poster, only on active notices */}
            {isMine && !isResolved && (
              <button
                onClick={() => onWithdraw(notice)}
                className="rounded-xl border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-500 hover:border-red-300 hover:text-red-600 transition-colors"
              >
                Withdraw
              </button>
            )}
            {/* Done button — tasks: any housemate; others: any housemate can dismiss */}
            {!isResolved && (
              <button
                onClick={() => onResolve(notice)}
                className="rounded-xl bg-neutral-900 px-4 py-2 text-xs font-bold text-white hover:bg-neutral-700 transition-colors notice-board"
              >
                {isTask ? 'Done ✓' : 'Dismiss'}
              </button>
            )}
          </div>
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
  const [guestPreset, setGuestPreset] = useState(false)
  const [resolveTarget, setResolveTarget] = useState<Notice | null>(null)
  const [withdrawing, setWithdrawing] = useState<string | null>(null)

  useEffect(() => { fetchNotices() }, [])

  async function fetchNotices() {
    setLoading(true)
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/tenant/notices', { headers })
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
    setGuestPreset(false)
  }

  function handleResolved(id: string) {
    setNotices(prev => prev.map(n =>
      n.id === id ? { ...n, status: 'resolved', resolved_at: new Date().toISOString() } : n
    ))
    setResolveTarget(null)
  }

  async function handleWithdraw(notice: Notice) {
    if (!confirm('Withdraw this notice? It will be removed from the board.')) return
    setWithdrawing(notice.id)
    try {
      const headers = await authHeaders()
      const res = await fetch(`/api/tenant/notices/${notice.id}`, { method: 'DELETE', headers })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        alert(json.error || 'Could not withdraw — please try again.')
        return
      }
      setNotices(prev => prev.filter(n => n.id !== notice.id))
    } catch {
      alert('Something went wrong. Please try again.')
    } finally {
      setWithdrawing(null)
    }
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

        <div className="mb-5">
          <h1 className="notice-board text-3xl font-extrabold text-neutral-900 leading-tight">📋 Notice Board</h1>
          <p className="mt-1 text-sm text-neutral-500">Updates, tasks, and reminders for your house.</p>
        </div>

        {/* Quick guest staying tap — kept as a shortcut at top */}
        {propertyId && (
          <button
            onClick={() => { setGuestPreset(true); setComposing(true) }}
            className="w-full flex items-center gap-3 rounded-2xl border border-green-300 bg-green-50 px-4 py-3 text-sm font-bold text-green-800 hover:bg-green-100 transition-colors mb-5"
          >
            <span>🛌</span>
            <span>Guest staying over</span>
            <span className="ml-auto text-xs font-normal text-green-600">One tap →</span>
          </button>
        )}

        {/* Filter tabs */}
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
          {([
            ['all',      'All active'],
            ['tasks',    null],
            ['resolved', 'Done'],
          ] as const).map(([f, label]) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`notice-board rounded-full px-4 py-2 text-sm font-bold whitespace-nowrap transition-colors ${
                filter === f ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              {f === 'tasks' && <>✅ Tasks{taskCount > 0 && <span className="ml-1.5 rounded-full bg-amber-400 text-neutral-900 px-1.5 py-0.5 text-xs font-extrabold">{taskCount}</span>}</>}
              {(f === 'all' || f === 'resolved') && (label as string)}
            </button>
          ))}
        </div>

        {/* Notice list */}
        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-28 rounded-2xl bg-neutral-100 animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 py-16 text-center">
            <p className="text-3xl mb-3">{filter === 'tasks' ? '✅' : filter === 'resolved' ? '📦' : '🏡'}</p>
            <p className="notice-board font-bold text-neutral-700">
              {filter === 'tasks' ? 'No open tasks' : filter === 'resolved' ? 'Nothing done yet' : 'All quiet'}
            </p>
            {filter === 'all' && <p className="text-sm text-neutral-400 mt-1">Be the first to post a notice.</p>}
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map(n => (
              <NoticeCard key={n.id} notice={n} personId={personId} onResolve={setResolveTarget} onWithdraw={handleWithdraw} />
            ))}
          </div>
        )}
      </main>

      {/* Floating + button */}
      {propertyId && !composing && (
        <button
          onClick={() => { setGuestPreset(false); setComposing(true) }}
          className="fixed bottom-8 right-6 z-40 flex h-16 w-16 items-center justify-center rounded-full bg-neutral-900 text-white shadow-2xl hover:bg-neutral-700 transition-all active:scale-95 notice-board"
          aria-label="Post a notice"
        >
          <span className="text-3xl font-light leading-none">+</span>
        </button>
      )}

      {composing && propertyId && (
        <ComposeModal
          propertyId={propertyId}
          personId={personId}
          onPosted={handlePosted}
          onClose={() => { setComposing(false); setGuestPreset(false) }}
          initialPreset={guestPreset ? GUEST_PRESET : null}
        />
      )}

      {resolveTarget && (
        <ResolveModal notice={resolveTarget} onResolved={handleResolved} onClose={() => setResolveTarget(null)} />
      )}
    </div>
  )
}
