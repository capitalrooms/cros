import type { Metadata } from 'next'
import fs from 'fs'
import path from 'path'
import { markdownToHtml } from '@/lib/website/markdown'
import { PageTop } from '../parts'
export const metadata: Metadata = { title: 'Privacy Policy', alternates: { canonical: '/privacy_policy' } }
export default function Privacy() {
  const md = fs.readFileSync(path.join(process.cwd(), 'lib/website/content/privacy.md'), 'utf8')
  return (
    <>
      <PageTop title="Privacy policy" />
      <section className="block" style={{ paddingTop: 40 }}><div className="wrap"><div className="prose" dangerouslySetInnerHTML={{ __html: markdownToHtml(md) }} /></div></section>
    </>
  )
}
