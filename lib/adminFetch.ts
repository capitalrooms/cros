'use client'
// fetch() for admin API routes: attaches the signed-in user's access token (checked by lib/adminAuth).
import { createClient } from '@/lib/supabase'

export async function adminFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await createClient().auth.getSession()
  const headers = new Headers(init.headers)
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`)
  return fetch(input, { ...init, headers })
}

/** Download a PDF from an admin API route (a plain link can't carry the auth header). */
export async function downloadPdf(url: string, fallbackName: string): Promise<void> {
  const res = await adminFetch(url)
  if (!res.ok) {
    const d = await res.json().catch(() => ({}))
    alert(d.error ?? 'Could not generate the PDF')
    return
  }
  const name = res.headers.get('content-disposition')?.match(/filename="?([^"]+)"?/)?.[1] ?? fallbackName
  const blobUrl = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = blobUrl; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(blobUrl), 5000)
}
