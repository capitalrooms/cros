'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { createClient } from '@/lib/supabase'

interface Notification {
  id: string
  title: string
  body: string | null
  type: string | null
  link: string | null
  read: boolean
  created_at: string
}

interface Notice {
  id: string
  notice_type: 'info' | 'task'
  subtype: string | null
  ai_text: string | null
  raw_text: string
  status: 'active' | 'resolved'
  created_at: string
  created_by_person: { first_name: string; last_name: string } | null
}

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

// ── Quick Action tile ─────────────────────────────────────────────────────────
function ActionTile({ emoji, label, href }: { emoji: string; label: string; href: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-sm rounded-2xl border border-neutral-200 bg-white px-md py-lg text-center hover:border-neutral-400 transition-colors"
    >
      <span className="text-2xl">{emoji}</span>
      <span className="text-xs font-bold text-neutral-700 leading-tight">{label}</span>
    </Link>
  )
}

export default function InboxPage() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notices, setNotices] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        // Auth + person id
        const { data: authData } = await supabase.auth.getUser()
        if (!authData?.user) { router.push('/login'); return }

        const { data: person } = await supabase
          .from('people')
          .select('id')
          .eq('email', authData.user.email)
          .single()

        if (!person) { router.push('/login'); return }

        // Fetch notifications (system messages, quick notify)
        const { data: notifs } = await supabase
          .from('notifications')
          .select('id, title, body, type, link, read, created_at')
          .eq('user_id', person.id)
          .order('created_at', { ascending: false })
          .limit(30)

        setNotifications(notifs || [])

        // Fetch recent notice board posts
        const { data: { session } } = await supabase.auth.getSession()
        const noticeHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
        if (session?.access_token) noticeHeaders['Authorization'] = `Bearer ${session.access_token}`
        const noticesRes = await fetch('/api/tenant/notices', { headers: noticeHeaders })
        if (noticesRes.ok) {
          const json = await noticesRes.json()
          const active = ((json.notices || []) as Notice[]).filter(n => n.status === 'active').slice(0, 5)
          setNotices(active)
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function markAllRead() {
    const unread = notifications.filter(n => !n.read).map(n => n.id)
    if (unread.length === 0) return
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    await supabase.from('notifications').update({ read: true }).in('id', unread)
  }

  async function markOneRead(id: string) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    await supabase.from('notifications').update({ read: true }).eq('id', id)
  }

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <div className="min-h-screen bg-neutral-50">
      <AppBar left={<BackButton href="/tenant" />} />

      <main className="mx-auto max-w-xl px-lg pb-2xl pt-md">

        {/* Header */}
        <div className="mb-lg flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-neutral-900">Inbox</h1>
            {unreadCount > 0 && (
              <p className="text-sm text-neutral-500 mt-xs">{unreadCount} unread</p>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-sm font-semibold text-neutral-500 hover:text-neutral-900"
            >
              Mark all read
            </button>
          )}
        </div>

        {/* Quick action tiles */}
        <div className="grid grid-cols-4 gap-sm mb-xl">
          <ActionTile emoji="🔧" label="Report issue" href="/tenant/maintenance-choose" />
          <ActionTile emoji="📋" label="Notice board" href="/tenant/notices" />
          <ActionTile emoji="🏠" label="House info" href="/tenant/property-info" />
          <ActionTile emoji="📄" label="My tenancy" href="/tenant" />
        </div>

        {loading ? (
          <div className="space-y-md">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 rounded-2xl bg-neutral-100 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* ── Messages from Capital Rooms ───────────────────────────── */}
            {notifications.length > 0 && (
              <section className="mb-xl">
                <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-md">
                  Messages
                </h2>
                <div className="space-y-sm">
                  {notifications.map(n => (
                    <div
                      key={n.id}
                      onClick={async () => {
                        await markOneRead(n.id)
                        if (n.link && n.link !== '/tenant/inbox') router.push(n.link)
                      }}
                      className={`rounded-2xl border p-lg cursor-pointer transition-colors ${
                        n.read
                          ? 'border-neutral-200 bg-white hover:border-neutral-300'
                          : 'border-blue-200 bg-blue-50 hover:border-blue-300'
                      }`}
                    >
                      <div className="flex items-start gap-md">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-sm">
                            {!n.read && (
                              <span className="h-2 w-2 rounded-full bg-blue-600 shrink-0" />
                            )}
                            <p className="font-bold text-sm text-neutral-900 truncate">{n.title}</p>
                          </div>
                          {n.body && (
                            <p className="mt-xs text-sm text-neutral-600 leading-snug line-clamp-2">
                              {n.body}
                            </p>
                          )}
                          <p className="mt-sm text-xs text-neutral-400">{timeAgo(n.created_at)}</p>
                        </div>
                        {n.link && n.link !== '/tenant/inbox' && (
                          <span className="text-neutral-300 text-lg shrink-0">›</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Notice board preview ──────────────────────────────────── */}
            {notices.length > 0 && (
              <section className="mb-xl">
                <div className="flex items-center justify-between mb-md">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400">
                    Notice Board
                  </h2>
                  <Link href="/tenant/notices" className="text-xs font-semibold text-neutral-500 hover:text-neutral-900">
                    See all →
                  </Link>
                </div>
                <div className="space-y-sm">
                  {notices.map(n => (
                    <Link
                      key={n.id}
                      href="/tenant/notices"
                      className="block rounded-2xl border border-neutral-200 bg-white p-lg hover:border-neutral-400 transition-colors"
                    >
                      <div className="flex items-start gap-sm">
                        <span className="text-base shrink-0">{n.notice_type === 'task' ? '✅' : '📢'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-neutral-800 line-clamp-2 leading-snug">
                            {(n.ai_text || n.raw_text).slice(0, 100)}{(n.ai_text || n.raw_text).length > 100 ? '…' : ''}
                          </p>
                          <p className="mt-xs text-xs text-neutral-400">
                            {n.created_by_person?.first_name || 'Someone'} · {timeAgo(n.created_at)}
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
                <Link
                  href="/tenant/notices"
                  className="mt-md flex w-full items-center justify-center gap-sm rounded-2xl border border-neutral-200 bg-white py-md text-sm font-bold text-neutral-700 hover:border-neutral-400 transition-colors"
                >
                  <span>+</span> Post a notice
                </Link>
              </section>
            )}

            {/* ── Empty state ───────────────────────────────────────────── */}
            {notifications.length === 0 && notices.length === 0 && (
              <div className="rounded-2xl border border-dashed border-neutral-300 py-16 text-center">
                <p className="text-4xl mb-md">📭</p>
                <p className="font-bold text-neutral-700">All clear</p>
                <p className="text-sm text-neutral-400 mt-xs">No messages or notices right now.</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
