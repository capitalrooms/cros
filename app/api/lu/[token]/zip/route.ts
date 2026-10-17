// Every document a landlord update shared, as one zip of the original files (Harry, 17 Oct 2026: "maybe they can just
// download it as a zip folder full of the tenancy docs"), with a short "Tenant details.txt" of what we sent. Saved in
// private storage and handed over by a 5-minute link, like the PDF report (replies over 4.5 MB can't come straight
// from the server).
import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { createServiceClient } from '@/lib/supabase'
import { readStoredFile } from '@/lib/files/server'
import { openUpdate, sharedDocs } from '@/lib/landlordUpdates/open'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const safe = (v: string) => v.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const o = await openUpdate(token)
  if ('error' in o) return NextResponse.json({ error: o.error }, { status: o.status })
  const { s, u } = o
  const docs = await sharedDocs(s, u.doc_ids ?? [])
  const place = String(u.subject ?? '').split(' — ').slice(1).join(' — ')
  const name = (u.facts ?? []).find((f: any) => f.label === 'Full name')?.value
  const zip = new JSZip()
  const missed: string[] = []
  const used = new Set<string>()
  let n = 0
  for (const d of docs) {
    try {
      if (!d.url) throw new Error('no file')
      const { bytes } = await readStoredFile(d.url)
      n++
      const ext = (d.fileName.match(/\.[a-z0-9]{2,5}$/i)?.[0] ?? (d.kind === 'pdf' ? '.pdf' : '')).toLowerCase()
      let fname = `${String(n).padStart(2, '0')} ${safe(d.label)}${ext}`
      while (used.has(fname)) fname = fname.replace(/(\.[a-z0-9]+)?$/i, ` (2)$1`)
      used.add(fname)
      zip.file(fname, bytes)
    } catch { missed.push(`${d.label} (${d.fileName})`) }
  }
  zip.file('00 Tenant details.txt', [
    `${name ? `New tenant: ${name}` : u.subject ?? 'Tenant details'}`, place, '',
    ...(u.facts ?? []).map((f: any) => `${f.label}: ${f.value}`),
    ...(missed.length ? ['', 'Not included (please ask us for a copy):', ...missed.map(m => `- ${m}`)] : []),
    '', 'Capital Rooms · management@capitalrooms.co.uk · 0207 112 9163',
    'These are personal documents. Please keep them safely and only for managing the tenancy, as data-protection law requires.',
  ].join('\r\n'))
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })

  const fileName = safe(`${name ? `${name} - ` : ''}Tenancy documents${place ? ` - ${place}` : ''}`) + '.zip'
  const path = `tenant-reports/${u.id}.zip`   // one file per update, replaced each time it's downloaded
  const store = createServiceClient().storage.from('landlord-docs')
  const up = await store.upload(path, bytes, { contentType: 'application/zip', upsert: true })
  if (up.error) return NextResponse.json({ error: 'The files couldn’t be prepared. Please try again, or ask us for a copy.' }, { status: 500 })
  const { data } = await store.createSignedUrl(path, 300, { download: fileName })
  return data?.signedUrl ? NextResponse.redirect(data.signedUrl) : NextResponse.json({ error: 'The files couldn’t be prepared. Please try again, or ask us for a copy.' }, { status: 500 })
}
