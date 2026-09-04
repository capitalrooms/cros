'use client'

import { useEffect, useRef, useState } from 'react'
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
  slug: string | null
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

// Variables used in each template (for the edit UI helper panel)
const SLUG_VARS: Record<string, string[]> = {
  'maintenance-tenant-receipt':      ['heading', 'ticket_title', 'where', 'priority'],
  'maintenance-admin-alert':         ['heading', 'reporter_email', 'where', 'priority', 'description'],
  'maintenance-contractor-assignment': ['contractor_name', 'heading', 'ticket_title', 'property_name', 'property_address', 'room_name', 'priority', 'portal_url'],
  'repair-booked-all':               ['heading', 'when', 'attending', 'where', 'priority', 'ticket_title', 'contractor_name', 'property_name'],
  'job-held-tenant':                 ['category', 'room_name'],
  'job-completed-all':               ['category', 'where', 'property_name', 'tenant_name', 'room_name'],
  'contractor-room-access':          ['property_name', 'when', 'ticket_title', 'date_str'],
  'contractor-nudge':                ['slot'],
  'viewing-all-recipients':          ['room_name', 'property_name', 'property_name_address', 'when', 'visitor_name', 'visitor_first_name', 'visitor_email_suffix', 'address'],
  'appointment-viewing-tenants':     ['tenant_name', 'when', 'room_name', 'property_name', 'room_or_at_property'],
  'viewing-confirmation-sms':        ['visitor_first_name', 'room_name', 'address', 'when'],
  'let-only-contact-notice':         ['contact_name', 'event_subject', 'event_intro', 'address', 'sender_name'],
  'tenant-portal-invite':            ['first_name', 'property_address', 'room_name', 'start_date', 'monthly_rent', 'sign_in_link', 'email'],
  'landlord-portal-invite':          ['first_name', 'sign_in_link', 'email'],
  'landlord-onboarding-welcome':     ['first_name'],
  'landlord-onboarding-approved':    ['first_name'],
  'landlord-aml-reverification':     ['first_name'],
  'landlord-acquisition-pitch':      ['first_name'],
  'checkout-tenant-notice':          ['move_out_date'],
  'checkout-cleaner-headsup':        ['cleaner_name', 'room_name', 'property_address', 'move_out_date', 'clean_date'],
  'staff-calendar-invite':           ['title', 'when', 'location', 'description'],
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

// ── Inline edit panel ─────────────────────────────────────────────────────────

function EditPanel({
  template,
  onSave,
  onCancel,
}: {
  template: MessageTemplate
  onSave: (id: string, subject: string, body: string) => Promise<void>
  onCancel: () => void
}) {
  // Detect whether body is HTML — more reliable than checking channels (some rows have channels=null).
  // HTML bodies get the WYSIWYG contenteditable editor; plain text gets a simple textarea.
  const isHtmlBody = /<[a-z][\s\S]*?>/i.test(template.template_text ?? '')

  const editorRef = useRef<HTMLDivElement>(null)
  const [subject, setSubject]     = useState(template.subject_line ?? '')
  const [plainBody, setPlainBody] = useState(isHtmlBody ? '' : (template.template_text ?? ''))
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const vars = template.slug ? (SLUG_VARS[template.slug] ?? []) : []

  // Seed the rich-text editor once when the panel opens for this template
  useEffect(() => {
    if (isHtmlBody && editorRef.current) {
      editorRef.current.innerHTML = template.template_text ?? ''
    }
  // We intentionally only re-seed when the template id changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.id])

  function execFormat(cmd: string) {
    document.execCommand(cmd, false)
    editorRef.current?.focus()
  }

  async function handleSave() {
    const body = isHtmlBody
      ? (editorRef.current?.innerHTML ?? '')
      : plainBody
    setSaving(true)
    setError(null)
    try {
      await onSave(template.id, subject, body)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-lg pb-lg pt-0 bg-white border-t border-neutral-200">
      <div className="pt-md space-y-md">

        {/* Route reference */}
        {template.route_path && (
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-xs">Route</p>
            <code className="text-xs bg-neutral-100 text-neutral-700 px-sm py-xs rounded font-mono">
              {template.route_path}
            </code>
          </div>
        )}

        {/* Available placeholders */}
        {vars.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-xs">Available variables</p>
            <div className="flex flex-wrap gap-xs">
              {vars.map(v => (
                <code
                  key={v}
                  className="text-xs bg-neutral-100 text-neutral-600 px-xs py-0.5 rounded font-mono cursor-pointer hover:bg-neutral-200"
                  title="Click to copy"
                  onClick={() => navigator.clipboard?.writeText(`{{${v}}}`).catch(() => {})}
                >
                  {`{{${v}}}`}
                </code>
              ))}
            </div>
            <p className="text-xs text-neutral-400 mt-xs">Click a variable to copy it. Variables are replaced with live data when the message is sent.</p>
          </div>
        )}

        {/* Subject line */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-neutral-400 mb-xs">
            Subject line
          </label>
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none"
            placeholder="Enter subject line — use {{variable}} for dynamic values"
          />
        </div>

        {/* Body — WYSIWYG for HTML content, plain textarea for SMS/push */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-neutral-400 mb-xs">
            Body / message
          </label>
          {isHtmlBody ? (
            <>
              {/* Minimal formatting toolbar */}
              <div className="flex items-center gap-xs border border-neutral-300 border-b-0 rounded-t-lg px-sm py-xs bg-neutral-50">
                <button
                  type="button"
                  onMouseDown={e => { e.preventDefault(); execFormat('bold') }}
                  className="px-xs py-0.5 rounded text-sm font-bold text-neutral-700 hover:bg-neutral-200 transition-colors select-none"
                  title="Bold"
                >B</button>
                <button
                  type="button"
                  onMouseDown={e => { e.preventDefault(); execFormat('italic') }}
                  className="px-xs py-0.5 rounded text-sm italic text-neutral-700 hover:bg-neutral-200 transition-colors select-none"
                  title="Italic"
                >I</button>
                <div className="w-px h-3.5 bg-neutral-300 mx-xs" />
                <span className="text-xs text-neutral-400 leading-tight">
                  Edit words directly — layout and styling are preserved automatically
                </span>
              </div>
              {/* The WYSIWYG canvas: renders email HTML as visible formatted text */}
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                className="w-full min-h-[180px] rounded-b-lg border border-neutral-300 bg-white px-md py-sm text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none"
                style={{ lineHeight: '1.6', wordBreak: 'break-word' }}
              />
            </>
          ) : (
            <>
              <textarea
                value={plainBody}
                onChange={e => setPlainBody(e.target.value)}
                rows={6}
                className="w-full rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none resize-y"
                placeholder="Enter message text. Use {{variable}} for dynamic values."
              />
              <p className="text-xs text-neutral-400 mt-xs">Plain text — used for SMS or push notifications.</p>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-sm">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-neutral-900 px-lg py-sm text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save changes'}
          </button>
          <button
            onClick={onCancel}
            className="rounded-lg border border-neutral-300 px-lg py-sm text-sm font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            Cancel
          </button>
          {error && (
            <p className="text-xs text-red-600">{error}</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Read-only expanded detail ─────────────────────────────────────────────────

function ReadOnlyDetail({ template }: { template: MessageTemplate }) {
  const [showSource, setShowSource] = useState(false)
  const isUnwired  = template.template_text?.startsWith('⚠️')
  const hasBody    = !!template.template_text && !isUnwired
  // Detect HTML content from the template_text itself — more reliable than checking channels,
  // since some rows have channels=null in the DB even though the body is HTML.
  const isHtmlBody = hasBody && /<[a-z][\s\S]*?>/i.test(template.template_text ?? '')

  return (
    <div className="px-lg pb-lg pt-0 bg-neutral-50 border-t border-neutral-100">
      <div className="pt-md space-y-md">
        {template.route_path && (
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-xs">Route</p>
            <code className="text-xs bg-neutral-200 text-neutral-700 px-sm py-xs rounded font-mono">
              {template.route_path}
            </code>
          </div>
        )}
        {template.subject_line && (
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-xs">Subject</p>
            <p className="text-sm text-neutral-700">{template.subject_line}</p>
          </div>
        )}
        {isUnwired && (
          <p className="text-sm text-red-700 font-medium">{template.template_text}</p>
        )}
        {hasBody && (
          <div>
            <div className="flex items-center justify-between mb-xs">
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">Message preview</p>
              {isHtmlBody && (
                <button
                  onClick={() => setShowSource(s => !s)}
                  className="text-xs text-neutral-400 hover:text-neutral-600 underline underline-offset-2 transition-colors"
                >
                  {showSource ? 'Hide source' : 'View raw HTML'}
                </button>
              )}
            </div>
            {isHtmlBody && showSource ? (
              <pre className="text-xs font-mono text-neutral-600 bg-neutral-100 rounded-lg p-sm overflow-x-auto whitespace-pre-wrap break-all">
                {template.template_text}
              </pre>
            ) : isHtmlBody ? (
              <div
                className="rounded-lg border border-neutral-200 bg-white px-md py-sm text-sm"
                style={{ lineHeight: '1.6' }}
                dangerouslySetInnerHTML={{ __html: template.template_text! }}
              />
            ) : (
              <p className="text-sm text-neutral-700 whitespace-pre-line">{template.template_text}</p>
            )}
            {isHtmlBody && !showSource && (
              <p className="text-xs text-neutral-400 mt-xs">
                Variables like <code className="font-mono bg-neutral-100 px-xs rounded">{'{{name}}'}</code> are replaced with real data at send time.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MessageTemplatesPage() {
  const router = useRouter()
  const [loading, setLoading]       = useState(true)
  const [templates, setTemplates]   = useState<MessageTemplate[]>([])
  const [activeGroup, setActiveGroup] = useState<Group | 'all'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId]   = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser()
      if (!user || !['administrator', 'admin'].includes(user.assignment?.role)) {
        router.push('/login')
        return
      }
      await loadTemplates()
      setLoading(false)
    }
    init()
  }, [router])

  async function loadTemplates() {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('notification_templates')
      .select('id, name, slug, category, group_name, sort_order, trigger_description, recipient_description, channels, is_hardcoded, route_path, subject_line, template_text')
      .eq('is_system_message', true)
      .order('group_name')
      .order('sort_order')
    if (!error && data) {
      setTemplates(data as MessageTemplate[])
    }
  }

  async function handleSave(id: string, subject: string, body: string) {
    const supabase = createClient()
    const { error } = await supabase
      .from('notification_templates')
      .update({
        subject_line:  subject,
        template_text: body,
        is_hardcoded:  false,
      })
      .eq('id', id)

    if (error) throw new Error(error.message)

    // Optimistically update local state
    setTemplates(prev =>
      prev.map(t => t.id === id ? { ...t, subject_line: subject, template_text: body, is_hardcoded: false } : t)
    )
  }

  if (loading) return <GenericPageSkeleton />

  // Group the templates
  const grouped = GROUPS.reduce<Record<string, MessageTemplate[]>>((acc, g) => {
    acc[g] = templates.filter(t => t.group_name === g)
    return acc
  }, {} as Record<string, MessageTemplate[]>)

  const visible = activeGroup === 'all'
    ? GROUPS.filter(g => (grouped[g]?.length ?? 0) > 0)
    : [activeGroup]

  const totalCount    = templates.length
  const editableCount = templates.filter(t => !t.is_hardcoded && !t.template_text?.startsWith('⚠️')).length
  const unwiredCount  = templates.filter(t => t.template_text?.startsWith('⚠️')).length
  const inCodeCount   = totalCount - editableCount - unwiredCount

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin" />} />

      <main className="mx-auto max-w-6xl px-lg py-2xl">

        {/* Page header */}
        <div className="mb-2xl">
          <h1 className="text-3xl font-bold text-neutral-900">✉️ Message Templates</h1>
          <p className="mt-sm text-sm text-neutral-600">
            Every automated message the system sends — grouped by purpose.
            Templates marked <strong>✏️ Editable</strong> can be changed here;
            changes take effect on the next send without a code deploy.
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
            {inCodeCount > 0 && (
              <span className="rounded-full bg-amber-100 px-md py-xs text-sm font-semibold text-amber-700">
                ⚙️ {inCodeCount} in code
              </span>
            )}
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
                    const isEditing  = editingId === t.id
                    const isEditable = !t.is_hardcoded && !t.template_text?.startsWith('⚠️')

                    return (
                      <div key={t.id}>
                        {/* Row header */}
                        <div
                          className="w-full text-left px-lg py-md hover:bg-neutral-50 transition-colors cursor-pointer"
                          onClick={() => {
                            if (isEditing) return
                            setExpandedId(isExpanded ? null : t.id)
                            if (!isExpanded) setEditingId(null)
                          }}
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

                            {/* Right: channels + actions */}
                            <div className="flex flex-col items-end gap-sm shrink-0">
                              <ChannelChips channels={t.channels} />
                              <div className="flex items-center gap-sm">
                                {isEditable && !isEditing && (
                                  <button
                                    onClick={e => {
                                      e.stopPropagation()
                                      setExpandedId(t.id)
                                      setEditingId(t.id)
                                    }}
                                    className="text-xs font-semibold text-neutral-700 bg-neutral-100 border border-neutral-300 rounded-lg px-sm py-0.5 hover:bg-neutral-200 transition-colors"
                                  >
                                    Edit
                                  </button>
                                )}
                                <span className="text-xs text-neutral-400">
                                  {isExpanded ? '▲' : '▼'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Expanded panel: edit form or read-only */}
                        {isExpanded && (
                          isEditing ? (
                            <EditPanel
                              template={t}
                              onSave={handleSave}
                              onCancel={() => setEditingId(null)}
                            />
                          ) : (
                            <div className="px-lg pb-lg pt-0 bg-neutral-50 border-t border-neutral-100">
                              <div className="pt-md space-y-md">
                                {t.route_path && (
                                  <div>
                                    <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-xs">Route</p>
                                    <code className="text-xs bg-neutral-200 text-neutral-700 px-sm py-xs rounded font-mono">
                                      {t.route_path}
                                    </code>
                                  </div>
                                )}
                                {t.subject_line && (
                                  <div>
                                    <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-xs">Subject</p>
                                    <p className="text-sm text-neutral-700">{t.subject_line}</p>
                                  </div>
                                )}
                                <div>
                                  <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-xs">
                                    {t.is_hardcoded || t.template_text?.startsWith('⚠️') ? 'Status' : 'Body template'}
                                  </p>
                                  {t.template_text?.startsWith('⚠️') ? (
                                    <p className="text-sm text-red-700 font-medium">{t.template_text}</p>
                                  ) : t.is_hardcoded ? (
                                    <p className="text-sm text-neutral-500 italic">{t.template_text}</p>
                                  ) : (
                                    <pre className="whitespace-pre-wrap text-sm text-neutral-700 font-mono bg-white border border-neutral-200 rounded-lg p-md overflow-x-auto">
                                      {t.template_text}
                                    </pre>
                                  )}
                                </div>
                                {isEditable && (
                                  <button
                                    onClick={() => setEditingId(t.id)}
                                    className="rounded-lg bg-neutral-900 px-lg py-sm text-sm font-semibold text-white hover:bg-neutral-700 transition-colors"
                                  >
                                    Edit this template
                                  </button>
                                )}
                              </div>
                            </div>
                          )
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
                No system message types found. Run migration 121 then 122 in Supabase first.
              </p>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="mt-2xl rounded-2xl bg-white border border-neutral-200 px-lg py-md">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-sm">Legend</p>
          <div className="flex flex-wrap gap-lg text-xs text-neutral-600">
            <span><strong className="text-emerald-700">✏️ Editable</strong> — subject + body stored in the database; edit here, live on next send</span>
            <span><strong className="text-amber-700">⚙️ In code</strong> — message text hardcoded in the route file; read-only here</span>
            <span><strong className="text-red-700">⚠️ Not wired</strong> — route exists but sending channel not yet connected</span>
          </div>
        </div>

      </main>
    </div>
  )
}
