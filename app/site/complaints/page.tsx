import type { Metadata } from 'next'
import fs from 'fs'
import path from 'path'
import { markdownToHtml } from '@/lib/website/markdown'
import { PageTop } from '../parts'

// The in-house complaints procedure as a web page (24 Nov 2026). The PDF stays available as a download.
export const metadata: Metadata = { title: 'Complaints procedure', description: 'How to make a complaint to Capital Rooms, and how it is handled, step by step.', alternates: { canonical: '/complaints' } }

export default function Complaints() {
  const md = fs.readFileSync(path.join(process.cwd(), 'lib/website/content/complaints.md'), 'utf8')
  return (
    <>
      <PageTop title="Complaints procedure" />
      <section className="block" style={{ paddingTop: 40 }}><div className="wrap"><div className="prose" dangerouslySetInnerHTML={{ __html: markdownToHtml(md) }} /></div></section>
    </>
  )
}
