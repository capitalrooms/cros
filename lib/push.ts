'use client'

// Client-side Web Push helpers.

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  if (!pushSupported()) return 'unsupported'
  return Notification.permission
}

/**
 * Ask permission, subscribe this device to push, and store the subscription
 * against the given person. Safe to call repeatedly (upserts by endpoint).
 */
export async function enablePush(person: {
  id?: string
  email?: string
  role?: string
}): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' }

  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!key) return { ok: false, reason: 'missing VAPID key' }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, reason: permission }

  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    }))

  const json: any = sub.toJSON()
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      personId: person.id ?? null,
      email: person.email ?? null,
      role: person.role ?? null,
    }),
  })
  if (!res.ok) return { ok: false, reason: 'save failed' }
  return { ok: true }
}

/** Whose phone this is, as far as notifications go — checked again every time the app is opened (sessionStorage), so a
 *  phone can never stay stuck on someone who signed out. */
const OWNER_KEY = 'cros-push-owner'
const ownerStore = () => { try { return window.sessionStorage } catch { return null } }

/**
 * Signing out: stop this phone getting the signed-out person's notifications (15 Nov 2026 — Harry signed in as Alice,
 * then as David on the same phone, and still got Alice's). Call it BEFORE signing out — it needs their sign-in.
 */
export async function forgetThisDevice(): Promise<void> {
  try { ownerStore()?.removeItem(OWNER_KEY); localStorage.removeItem(OWNER_KEY) } catch { /* private mode */ }
  if (!pushSupported()) return
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) return
    await fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) })
  } catch { /* offline — the next sign-in takes the phone over anyway */ }
}

/**
 * Signed in: if this phone already allows notifications, make sure they come to THIS person — the phone moves to
 * whoever signed in last. Runs once each time the app is opened (not every page).
 */
export async function claimThisDevice(personId: string): Promise<boolean> {
  if (!pushSupported() || pushPermission() !== 'granted') return false
  try { if (ownerStore()?.getItem(OWNER_KEY) === personId) return true } catch { /* private mode */ }
  // Move this phone's existing registration to whoever is signed in (saving it again re-points it). Never unsubscribe
  // here: on an iPhone a new registration can only be made from a tap, so throwing the old one away left the phone
  // with none (15 Nov 2026). No registration → EnableNotifications shows its button and the person taps it.
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return false
    const json: any = sub.toJSON()
    const res = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth }) })
    if (!res.ok) return false
    try { ownerStore()?.setItem(OWNER_KEY, personId); localStorage.setItem(OWNER_KEY, personId) } catch { /* private mode */ }
    window.dispatchEvent(new Event('cros-push-ready'))
    return true
  } catch { return false }
}

/** Is this phone getting this person's notifications? (allowed, registered, and saved for them this session) */
export async function deviceReady(personId?: string | null): Promise<boolean> {
  if (!pushSupported() || pushPermission() !== 'granted') return false
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) return false
    if (!personId) return true
    return ownerStore()?.getItem(OWNER_KEY) === personId || await claimThisDevice(personId)
  } catch { return false }
}
