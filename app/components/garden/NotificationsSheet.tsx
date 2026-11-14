'use client'
// "Turn on notifications" — asked once, clearly, on the first visit (14 Nov 2026, Harry: "all users should start with
// all push notifications and then they work out which ones they don't need and turn them off"). Every kind of message
// is already on by default (people.notify_by_push / email / sms); a phone only shows them after the person taps Allow
// once, so this sheet asks for that on every tenant, cleaner and contractor screen until they do. "Not now" waits
// three days before asking again. Uses app/components/EnableNotifications for the asking itself.
import { useEffect, useState } from 'react'
import EnableNotifications from '@/app/components/EnableNotifications'

const KEY = 'cros-notif-ask-later'

export default function NotificationsSheet({ role }: { role: 'tenant' | 'cleaner' | 'contractor' }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) return
    let later = 0
    try { later = Number(localStorage.getItem(KEY) || 0) } catch { /* private mode */ }
    if (Notification.permission !== 'default' || Date.now() < later) return
    // let the first screen settle (and the tenant's intro tour finish) before asking
    const t = setTimeout(() => setShow(true), role === 'tenant' ? 9000 : 2500)
    // close by itself once they've allowed (or blocked) it
    const i = setInterval(() => { if (Notification.permission !== 'default') { setShow(false); clearInterval(i) } }, 1000)
    return () => { clearTimeout(t); clearInterval(i) }
  }, [role])
  if (!show) return null
  const why = role === 'tenant' ? 'when a repair is booked, someone’s visiting, or the office messages you'
    : role === 'cleaner' ? 'when a clean is booked or moved, and when tenants ask for something'
    : 'the moment a new job is sent to you, and when a tenant answers'
  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label="Turn on notifications">
      <div className="w-full max-w-md rounded-t-[28px] bg-[#EEF2EC] p-5 sm:rounded-[28px]" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 20px)' }}>
        <span className="grid h-12 w-12 place-items-center rounded-full text-[#17332B]" style={{ background: 'var(--cr-gold, #F2B84B)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        </span>
        <p className="mt-3 text-[22px] font-extrabold leading-tight text-[#14261F]" style={{ fontFamily: 'var(--font-display), var(--font-text), sans-serif' }}>Don’t miss a thing</p>
        <p className="mt-1 text-[15px] leading-snug text-[#14261F]">Turn on notifications so your phone tells you {why}. You can switch off any you don’t want later.</p>
        <div className="mt-4"><EnableNotifications /></div>
        <button type="button" onClick={() => { try { localStorage.setItem(KEY, String(Date.now() + 3 * 86400000)) } catch { /* ignore */ } setShow(false) }} className="mt-2 h-11 w-full rounded-full text-sm font-semibold text-[#4E6158]">Not now</button>
      </div>
    </div>
  )
}
