'use client'
// Open a stored file from an office screen: private folders get a 5-minute signed link first.
import { adminFetch } from '@/lib/adminFetch'
import { parseStorageUrl, PRIVATE_BUCKETS } from '@/lib/files/paths'

export async function openStoredFile(urlOrRef: string | { bucket: string; path: string }) {
  const win = window.open('', '_blank')   // open now (keeps the click's permission), fill in when signed
  try {
    const ref = typeof urlOrRef === 'string' ? parseStorageUrl(urlOrRef) : urlOrRef
    if (typeof urlOrRef === 'string' && (!ref || !PRIVATE_BUCKETS.has(ref.bucket))) { if (win) win.location.href = urlOrRef; return }
    const r = await adminFetch('/api/admin/files/sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(typeof urlOrRef === 'string' ? { url: urlOrRef } : urlOrRef) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || 'Could not open the file')
    if (win) win.location.href = j.url; else window.location.href = j.url
  } catch (e) {
    win?.close()
    alert(e instanceof Error ? e.message : 'Could not open the file')
  }
}
