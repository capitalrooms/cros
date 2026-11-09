import Link from 'next/link'
import type { Metadata } from 'next'
import { siteBase } from '@/lib/website/base'
import { livePosts } from '@/lib/website/posts'
import { PageTop } from '../parts'
export const metadata: Metadata = { title: 'Advice for London Landlords and Tenants', description: 'Practical advice for London landlords and tenants from Capital Rooms: lettings law, HMO licensing, deposits, compliance and renting tips.', alternates: { canonical: '/blogs' } }
export const revalidate = 300
export default async function Blogs() {
  const [b, posts] = await Promise.all([siteBase(), livePosts()])
  return (
    <>
      <PageTop eyebrow="News & advice" title="Advice from the team." />
      <section className="block" style={{ paddingTop: 48 }}><div className="wrap grid3">
        {posts.map(p => (
          <Link key={p.slug} href={`${b}/blogs/${p.slug}`} className="card rise" style={{ padding: 14, textDecoration: 'none', color: 'var(--ink)' }}>
            <div className="ph sage" style={{ height: 200, borderRadius: 20 }}>{/* eslint-disable-next-line @next/next/no-img-element */}{p.cover_url && <img src={p.cover_url} alt="" loading="lazy" />}</div>
            <div style={{ padding: '6px 8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--forest)', textTransform: 'capitalize' }}>{p.category}{p.shown_date ? ` · ${new Date(`${p.shown_date}T12:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}` : ''}</span>
              <span style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.25 }}>{p.title}</span>
              {p.excerpt && <span style={{ color: 'var(--muted)', fontSize: 16 }}>{p.excerpt}</span>}
            </div>
          </Link>
        ))}
        {!posts.length && <p>No posts yet.</p>}
      </div></section>
    </>
  )
}
