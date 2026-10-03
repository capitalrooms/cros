/**
 * /api/capture/upload — the iPhone "Send to CROS" shortcut posts photos / PDFs here.
 *   POST multipart/form-data, header  Authorization: Bearer <personal key from the Capture screen>
 *   fields: file (one or more)  → { ok, count }
 * Each file lands in the capture inbox (migration 204) for the office to confirm and file.
 */
import crypto from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { sendServerPush } from '@/lib/serverPush'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const safeName = (n: string) => n.replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').slice(-80) || 'file'

export async function POST(req: NextRequest) {
  const key = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ?? ''
  if (!key.startsWith('cros_')) return NextResponse.json({ error: 'Missing or wrong key' }, { status: 401 })
  const s = createServiceClient()
  const { data: k } = await s.from('capture_keys').select('id, person_id').eq('key_hash', crypto.createHash('sha256').update(key).digest('hex')).is('revoked_at', null).maybeSingle()
  if (!k) return NextResponse.json({ error: 'This key has been turned off — make a new one on the Capture screen' }, { status: 401 })
  const form = await req.formData().catch(() => null)
  const files = form ? form.getAll('file').filter((f): f is File => f instanceof File && f.size > 0) : []
  if (!files.length) return NextResponse.json({ error: 'No file received' }, { status: 400 })
  let count = 0
  for (const f of files.slice(0, 20)) {
    if (f.size > 25_000_000) continue
    const name = f.name || `shared-${Date.now()}.${(f.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')}`
    const path = `${k.person_id}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeName(name)}`
    const { error: upErr } = await s.storage.from('capture').upload(path, Buffer.from(await f.arrayBuffer()), { contentType: f.type || 'application/octet-stream' })
    if (upErr) continue
    const { error } = await s.from('capture_items').insert({ uploaded_by: k.person_id, source: 'shortcut', file_path: path, file_name: name, mime: f.type || null, size_bytes: f.size })
    if (!error) count++
  }
  await s.from('capture_keys').update({ last_used_at: new Date().toISOString() }).eq('id', k.id)
  if (count) await sendServerPush({ personId: k.person_id, title: '📥 Ready to file', body: `${count} item${count === 1 ? '' : 's'} in your capture inbox`, url: '/admin/capture', tag: 'capture' })
  return NextResponse.json({ ok: true, count })
}
