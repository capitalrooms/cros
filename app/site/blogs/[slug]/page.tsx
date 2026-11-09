import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { siteBase } from '@/lib/website/base'
import { livePost } from '@/lib/website/posts'
import { markdownToHtml } from '@/lib/website/markdown'
export const revalidate = 300
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await livePost((await params).slug)
  return p ? { title: p.title, description: p.excerpt ?? undefined, alternates: { canonical: `/blogs/${p.slug}` }, openGraph: { type: 'article', title: p.title, description: p.excerpt ?? undefined, images: p.cover_url ? [p.cover_url] : ['/og-capital-rooms.jpg'] } } : { title: 'Not found', robots: { index: false } }
}
export default async function Post({ params }: { params: Promise<{ slug: string }> }) {
  const [b, p] = await Promise.all([siteBase(), livePost((await params).slug)])
  if (!p) notFound()
  return (
    <article className="wrap" style={{ paddingTop: 56 }}>
      <p><Link href={`${b}/blogs`} style={{ fontWeight: 600 }}>← All advice</Link></p>
      <h1 className="h1 load2" style={{ margin: '18px 0 28px', maxWidth: 900, fontSize: 'clamp(40px,6vw,68px)' }}>{p.title}</h1>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {p.cover_url && <img src={p.cover_url} alt="" style={{ width: '100%', maxHeight: 520, objectFit: 'cover', borderRadius: 32, marginBottom: 40 }} />}
      <div className="prose" dangerouslySetInnerHTML={{ __html: markdownToHtml(p.body ?? '') }} />
    </article>
  )
}
