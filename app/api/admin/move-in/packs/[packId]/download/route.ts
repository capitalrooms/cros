// GET /api/admin/move-in/packs/[packId]/download?set=sign|all — a sent move-in pack's documents as one ZIP, to upload
// to Adobe Sign (24 Oct 2026, Harry: "when they are ready to sign I can download all the docs so I can add them to
// adobesign to then send for signing").
//   set=sign → the documents that are signed: the tenancy agreement, the deposit prescribed information (with the DPS
//              Terms and Conditions, which must go with it) and the guarantor form when it was in the pack
//   set=all  → every document in the pack
// Always the copies that were sent (the pack's stored files), never regenerated — what they sign is what they read.
import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import path from 'node:path'
import JSZip from 'jszip'
import { requireAdmin } from '@/lib/adminAuth'
import { svc, PACK_BUCKET } from '@/lib/movein/email'
import { loadPackContext, packFileName, GENERATED_KEYS, TO_SIGN, type GeneratedKey } from '@/lib/movein/pack'
import { fetchStored } from '@/lib/files/server'
import { contentDisposition } from '@/lib/contentDisposition'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const clean = (v: string) => v.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim()

export async function GET(req: NextRequest, { params }: { params: Promise<{ packId: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { packId } = await params
  const set = req.nextUrl.searchParams.get('set') === 'all' ? 'all' : 'sign'
  const s = svc()
  const { data: pack } = await s.from('tenancy_packs').select('id, tenancy_id, documents, status, sent_at').eq('id', packId).maybeSingle()
  if (!pack) return NextResponse.json({ error: 'Pack not found' }, { status: 404 })
  const ctx = await loadPackContext(s, pack.tenancy_id)
  if (!ctx) return NextResponse.json({ error: 'Tenancy not found' }, { status: 404 })

  const all = (pack.documents ?? []) as { key: string; label: string; source: string; path?: string; url?: string; available?: boolean }[]
  const hasPI = all.some(d => d.key === 'prescribed_info')
  const wanted = set === 'all' ? all : all.filter(d => TO_SIGN.includes(d.key) || (hasPI && d.key === 'dps_terms'))
  if (!wanted.length) return NextResponse.json({ error: set === 'sign' ? 'This pack has no documents to sign — it was sent before the agreement was included.' : 'This pack has no documents.' }, { status: 404 })

  const zip = new JSZip()
  const missing: string[] = []
  let n = 0
  for (const d of wanted) {
    let bytes: Buffer | null = null
    try {
      if (d.path) {
        const { data } = await s.storage.from(PACK_BUCKET).download(d.path)
        if (data) bytes = Buffer.from(await data.arrayBuffer())
      } else if (d.url?.startsWith('/tenancy-pack/')) {
        bytes = await fs.readFile(path.join(process.cwd(), 'public', d.url))
      } else if (d.url) {
        const r = await fetchStored(d.url)
        if (r.ok) bytes = Buffer.from(await r.arrayBuffer())
      }
    } catch { /* noted below */ }
    if (!bytes) { missing.push(d.label); continue }
    const name = GENERATED_KEYS.includes(d.key as GeneratedKey) ? packFileName(ctx, d.key as GeneratedKey) : `${clean(d.label)}.pdf`
    zip.file(`${++n} ${name}`, bytes)
  }
  if (missing.length) zip.file('MISSING - read me.txt', `These documents in the pack couldn't be read, so they aren't in this download:\n\n${missing.map(m => `- ${m}`).join('\n')}\n`)
  const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  const fileName = `${set === 'sign' ? 'For signing' : 'Move-in pack'} - ${clean(ctx.tenant.name)} - ${clean(ctx.address)}.zip`
  return new NextResponse(new Uint8Array(out), { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': contentDisposition(fileName, 'attachment') } })
}
