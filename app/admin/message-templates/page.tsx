'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'
import { createClient } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

interface MessageTemplate {
  id: string
  name: string
  category: string
  group_name: string
  sort_order: number
  trigger_description: string | null
  recipient_description: string | null
  channels: string[] | null
  is_hardcoded: boolean
  route_path: string | null
  subject_line: string | null
  template_text: string | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const GROUPS = [
  'Maintenance / Repairs',
  'Viewings / Lettings',
  'Onboarding / Account Access',
  'New Business / Acquisition',
  'Ad-Hoc / Quick Notify',
  'Move-Out / Checkout',
  'Staff Calendar',
] as const
type Group = (typeof GROUPS)[number]

const GROUP_ICONS: Record<Group, string> = {
  'Maintenance / Repairs':       '🔧',
  'Viewings / Lettings':         '🏠',
  'Onboarding / Account Access': '👤',
  'New Business / Acquisition':  '📈',
  'Ad-Hoc / Quick Notify':       '💬',
  'Move-Out / Checkout':         '📦',
  'Staff Calendar':              '📅',
}

const CHANNEL_LABELS: Record<string, { label: string; colour: string }> = {
  email:   { label: '📧 Email',   colour: 'bg-blue-100 text-blue-700' },
  in_app:  { label: '🔔 In-app', colour: 'bg-neutral-200 text-neutral-700' },
  push:    { label: '📲 Push',    colour: 'bg-purple-100 text-purple-700' },
  sms:     { label: '📱 SMS',     colour: 'bg-green-100 text-green-700' },
}

// ── Helper: status badge ──────────────────────────────────────────────────────

function StatusBadge({ template }: { template: MessageTemplate }) {
  const text = template.template_text || ''

  if (text.startsWith('⚠️')) {
    return (
      <span className="inline-flex items-center gap-xs rounded-full bg-red-100 px-sm py-0.5 text-xs font-semibold text-red-700">
        ⚠️ Not wired
      </span>
    )
  }
  if (!template.is_hardcoded) {
    return (
      <span className="inline-flex items-center gap-xs rounded-full bg-emerald-100 px-sm py-0.5 text-xs font-semibold text-emerald-700">
        ✏️ Editable
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-xs rounded-full bg-amber-100 px-sm py-0.5 text-xs font-semibold text-amber-700">
      ⚙️ In code
    </span>
  )
}

// ── Helper: channel chips ─────────────────────────────────────────────────────

function ChannelChips({ channels }: { channels: string[] | null }) {
  if (!channels?.length) return null
  return (
    <div className="flex flex-wrap gap-xs">
      {channels.map(ch => {
        const meta = CHANNEL_LABELS[ch]
        if (!meta) return null
        return (
          <span key={ch} className={`rounded-full px-sm py-0.5 text-xs font-semibold ${meta.colour}`}>
            {meta.label}
          </span>
        )
      })}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MessageTemplatesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [activeGroup, setActiveGroup] = useState<Group | 'all'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser()
      if (!user || !['administrator', 'admin'].includes(user.assignment?.role)) {
        router.push('/login')
        return
      }

      const supabase = createClient()
      const { data, error } = await supabase
        .from('notification_templates')
        .select('id, name, category, group_name, sort_order, trigger_description, recipient_description, channels, is_hardcoded, route_path, subject_line, template_text')
        .eq('is_system_message', true)
        .order('group_name')
        .order('sort_order')

      if (!error && data) {
        setTemplates(data as MessageTemplate[])
      }
      setLoading(false)
    }
    init()
  }, [router])

  if (loading) return <GenericPageSkeleton />

  // Group the templates
  const grouped = GROUPS.reduce<Record<string, MessageTemplate[]>>((acc, g) => {
    acc[g] = templates.filter(t => t.group_name === g)
    return acc
  }, {} as Record<string, MessageTemplate[]>)

  const visible = activeGroup === 'all'
    ? GROUPS.filter(g => (grouped[g]?.length ?? 0) > 0)
    : [activeGroup]

  const totalCount = templates.length
  const editableCount = templates.filter(t => !t.is_hardcoded && !t.template_text?.startsWith('⚠️')).length
  const unwiredCount  = templates.filter(t => t.template_text?.startsWith('⚠️')).length

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin" />} />

      <main className="mx-auto max-w-6xl px-lg py-2xl">

        {/* Page header */}
        <div className="mb-2xl">
          <h1 className="text-3xl font-bold text-neutral-900">✉️ Message Templates</h1>
          <p className="mt-sm text-sm text-neutral-600">
            Every automated message the system sends — grouped by purpose. Phase 1: visibility only.
            Changes to hardcoded content require a code edit; use Phase 2 to migrate them.
          </p>

          {/* Summary chips */}
          <div className="mt-lg flex flex-wrap gap-sm">
            <span className="rounded-full bg-neutral-900 px-md py-xs text-sm font-semibold text-white">
              {totalCount} message types
            </span>
            {editableCount > 0 && (
              <span className="rounded-full bg-emerald-100 px-md py-xs text-sm font-semibold text-emerald-700">
                ✏️ {editableCount} editable
              </span>
            )}
            <span className="rounded-full bg-amber-100 px-md py-xs text-sm font-semibold text-amber-700">
              ⚙️ {totalCount - editableCount - unwiredCount} in code
            </span>
            {unwiredCount > 0 && (
              <span className="rounded-full bg-red-100 px-md py-xs text-sm font-semibold text-red-700">
                ⚠️ {unwiredCount} not wired
              </span>
            )}
          </div>
        </div>

        {/* Group filter tabs */}
        <div className="mb-xl flex flex-wrap gap-xs border-b border-neutral-300 pb-0">
          <button
            onClick={() => setActiveGroup('all')}
            className={`px-md py-sm text-sm font-semibold transition ${
              activeGroup === 'all'
                ? 'border-b-2 border-neutral-900 text-neutral-900'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            All
          </button>
          {GROUPS.map(g => (
            <button
              key={g}
              onClick={() => setActiveGroup(g)}
              className={`px-md py-sm text-sm font-semibold transition whitespace-nowrap ${
                activeGroup === g
                  ? 'border-b-2 border-neutral-900 text-neutral-900'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {GROUP_ICONS[g]} {g}
              {grouped[g]?.length > 0 && (
                <span className="ml-xs text-xs text-neutral-400">({grouped[g].length})</span>
              )}
            </button>
          ))}
        </div>

        {/* Message list */}
        <div className="space-y-2xl">
          {visible.map(group => {
            const rows = grouped[group] ?? []
            if (rows.length === 0) return null

            return (
              <section key={group}>
                {/* Group heading — shown when showing all groups */}
                {activeGroup === 'all' && (
                  <h2 className="mb-md flex items-center gap-sm text-base font-bold text-neutral-700">
                    <span className="text-xl">{GROUP_ICONS[group]}</span>
                    {group}
                    <span className="text-sm font-normal text-neutral-400">({rows.length})</span>
                  </h2>
                )}

                <div className="rounded-2xl bg-white border border-neutral-200 divide-y divide-neutral-100 overflow-hidden">
                  {rows.map(t => {
                    const isExpanded = expandedId === t.id
                    const isUnwired = t.template_text?.startsWith('⚠️')

                    return (
                      <div key={t.id}>
                        {/* Row */}
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : t.id)}
                          className="w-full text-left px-lg py-md hover:bg-neutral-50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-md">
                            {/* Left: name + trigger + recipients */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-sm flex-wrap mb-xs">
                                <p className="text-sm font-semibold text-neutral-900">{t.name}</p>
                                <StatusBadge template={t} />
                              </div>

                              {t.trigger_description && (
                                <p className="text-xs text-neutral-500 mb-xs">
                                  <span className="font-medium text-neutral-600">Trigger:</span>{' '}
                                  {t.trigger_description}
                                </p>
                              )}

                              {t.recipient_description && (
                                <p className="text-xs text-neutral-500">
                                  <span className="font-medium text-neutral-600">To:</span>{' '}
                                  {t.recipient_description}
                                </p>
                              )}
                            </div>

                            {/* Right: channels + expand chevron */}
                            <div className="flex flex-col items-end gap-sm shrink-0">
                              <ChannelChips channels={t.channels} />
                              <span className="text-xs text-neutral-400">
                                {isExpanded ? '▲ hide' : '▼ detail'}
                              </span>
                            </div>
                          </div>
                        </button>

                        {/* Expanded detail */}
                        {isExpanded && (
                          <div className="px-lg pb-lg pt-0 bg-neutral-50 border-t border-neutral-100">

                            {/* Route reference */}
                            {t.route_path && (
                              <div className="mb-md pt-md">
                                <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-xs">
                                  Route
                                </p>
                                <code className="text-xs bg-neutral-200 text-neutral-700 px-sm py-xs rounded font-mono">
                                  {t.route_path}
                                </code>
                              </div>
                            )}

                            {/* Subject */}
                            {t.subject_line && (
                              <div className="mb-md">
                                <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-xs">
                                  Subject
                                </p>
                                <p className="text-sm text-neutral-700">{t.subject_line}</p>
                              </div>
                            )}

                            {/* Body / status */}
                            <div>
                              <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-xs">
                                {t.is_hardcoded || isUnwired ? 'Status' : 'Body template'}
                              </p>
                              {isUnwired ? (
                                <p className="text-sm text-red-700 font-medium">{t.template_text}</p>
                              ) : t.is_hardcoded ? (
                                <p className="text-sm text-neutral-500 italic">{t.template_text}</p>
                              ) : (
                                <pre className="whitespace-pre-wrap text-sm text-neutral-700 font-mono bg-white border border-neutral-200 rounded-lg p-md">
                                  {t.template_text}
                                </pre>
                              )}
                            </div>

                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}

          {templates.length === 0 && (
            <div className="rounded-2xl bg-white border border-neutral-200 px-lg py-3xl text-center">
              <p className="text-neutral-400 text-sm">
                No system message types found. Run migration 121 in Supabase first.
              </p>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="mt-2xl rounded-2xl bg-white border border-neutral-200 px-lg py-md">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-sm">Legend</p>
          <div className="flex flex-wrap gap-lg text-xs text-neutral-600">
            <span><strong className="text-emerald-700">✏️ Editable</strong> — subject + body stored in the database; Phase 2 will add an edit UI</span>
            <span><strong className="text-amber-700">⚙️ In code</strong> — message text hardcoded in the route file; safe to read, edit in Phase 2</span>
            <span><strong className="text-red-700">⚠️ Not wired</strong> — route exists but sending channel (Resend/Twilio) not yet connected</span>
          </div>
        </div>

      </main>
    </div>
  )
}
