'use client'

// Website — what the new capitalrooms.co.uk shows (switching from GNB on 1 Dec 2026), edited here without Claude:
// advice posts (write, schedule, publish), which available rooms appear, and the footer documents.
// Data: /api/admin/website (migration 221). Posts are simple markdown, previewed exactly as the site will show them.

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import { adminFetch } from '@/lib/adminFetch'
import { createClient } from '@/lib/supabase'
import { markdownToHtml, slugify, isLive } from '@/lib/website/markdown'
import { one, type PageSearchParams } from '@/lib/pageSearchParams'

type Tab = 'advice' | 'rooms' | 'documents'
interface Post { id?: string; slug: string; title: string; excerpt: string | null; body: string; cover_url: string | null; category: string; status: string; publish_at: string | null; shown_date: string | null; old_path?: string | null; note: string | null; updated_at?: string; updated_by?: string | null }
const CATS: [string, string][] = [['tenants', 'Tenants'], ['landlords', 'Landlords'], ['area', 'Area guide'], ['rooms', 'Rooms'], ['news', 'News']]
const blank = (): Post => ({ slug: '', title: '', excerpt: '', body: '', cover_url: null, category: 'tenants', status: 'draft', publish_at: null, shown_date: null, note: null })
const card = 'rounded-2xl border border-neutral-200 bg-white'
const btn = 'rounded-lg border border-neutral-300 bg-white px-md py-xs text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-40'
const btnDark = 'rounded-lg bg-neutral-900 px-md py-xs text-sm font-bold text-white hover:bg-neutral-700 disabled:opacity-40'
const input = 'w-full rounded-lg border border-neutral-300 bg-white px-sm py-xs text-sm text-neutral-900'
const day = (d: string | null) => d ? new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''
const stateOf = (p: Post): [string, string] => p.status !== 'published' ? ['Draft', 'bg-neutral-100 text-neutral-600'] : isLive(p) ? ['Live', 'bg-green-50 text-green-800'] : [`Scheduled ${new Date(p.publish_at!).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`, 'bg-blue-50 text-blue-800']

export default function WebsitePage({ searchParams }: { searchParams: PageSearchParams }) {
  const sp = use(searchParams)
  const initial = (one(sp.tab) as Tab) ?? 'advice'
  const [tab, setTab] = useState<Tab>(['advice', 'rooms', 'documents'].includes(initial) ? initial : 'advice')
  const [data, setData] = useState<any>(null)
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState<Post | null>(null)

  const load = useCallback(async () => {
    const r = await adminFetch('/api/admin/website')
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(d.error ?? 'Could not load'); return }
    setData(d)
  }, [])
  useEffect(() => { load() }, [load])

  async function act(body: Record<string, unknown>) {
    const r = await adminFetch('/api/admin/website', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { alert(d.error ?? 'Could not do that'); return null }
    return d
  }

  const posts: Post[] = data?.posts ?? []
  const live = posts.filter(isLive).length
  const shown = (data?.rooms ?? []).filter((r: any) => r.show).length

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin" />} title="Website" />
      <PageHero
        eyebrow="Website"
        title="capitalrooms.co.uk"
        subtitle="What the website shows — advice posts, the rooms you choose and the footer documents. The new site goes live on 1 December; everything here is ready for it."
        stats={[
          { label: 'Posts live', value: live },
          { label: 'Drafts', value: posts.filter(p => p.status !== 'published').length },
          { label: 'Rooms on the site', value: shown },
        ]}
        tabs={([['advice', 'Advice posts'], ['rooms', 'Rooms'], ['documents', 'Documents']] as [Tab, string][]).map(([k, l]) => ({ key: k, label: l, active: tab === k, onClick: () => { setTab(k); setEditing(null) } }))}
      />
      <main className="mx-auto max-w-6xl px-lg py-xl space-y-lg">
        {err && <p className="rounded-xl bg-red-50 px-md py-sm text-sm text-red-800">{err}</p>}
        {data?.setupNeeded && <p className="rounded-xl border border-amber-300 bg-amber-50 px-md py-sm text-sm text-amber-900">Run migration 221 to switch the Website section on.</p>}

        {data && tab === 'advice' && (editing
          ? <PostEditor post={editing} onClose={() => setEditing(null)} onSaved={async p => { await load(); setEditing(p) }} onDeleted={async () => { await load(); setEditing(null) }} act={act} />
          : (
            <section className={card}>
              <div className="flex flex-wrap items-center justify-between gap-sm border-b border-neutral-100 px-lg py-sm">
                <h2 className="text-sm font-bold text-neutral-900">Advice posts</h2>
                <div className="flex flex-wrap gap-xs">
                  {data.oldCount > 0 && posts.filter(p => p.old_path).length < data.oldCount && (
                    <button type="button" className={btn} onClick={async () => { const d = await act({ action: 'import_old' }); if (d) { alert(`Brought in ${d.added} post${d.added === 1 ? '' : 's'} from the old site${d.skipped ? ` (${d.skipped} already here)` : ''}.`); load() } }}>
                      Bring in the {data.oldCount} posts from the old site
                    </button>
                  )}
                  <button type="button" className={btnDark} onClick={() => setEditing(blank())}>+ New post</button>
                </div>
              </div>
              {posts.length ? (
                <ul className="divide-y divide-neutral-100">
                  {posts.map(p => {
                    const [label, cls] = stateOf(p)
                    return (
                      <li key={p.id}>
                        <button type="button" onClick={() => setEditing(p)} className="flex w-full items-center gap-md px-lg py-sm text-left hover:bg-neutral-50">
                          {p.cover_url
                            ? <img src={p.cover_url} alt="" className="h-12 w-16 shrink-0 rounded-md object-cover bg-neutral-100" />
                            : <span className="h-12 w-16 shrink-0 rounded-md bg-neutral-100" />}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-neutral-900">{p.title}</span>
                            <span className="block truncate text-xs text-neutral-500">{CATS.find(c => c[0] === p.category)?.[1]} · {day(p.shown_date) || 'no date yet'}{p.note ? ` · ${p.note}` : ''}</span>
                          </span>
                          <span className={`shrink-0 rounded-full px-sm py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : <p className="px-lg py-md text-sm text-neutral-500">No posts yet. Bring in the posts from the old site, or write a new one.</p>}
            </section>
          ))}

        {data && tab === 'rooms' && (
          <section className={card}>
            <div className="border-b border-neutral-100 px-lg py-sm">
              <h2 className="text-sm font-bold text-neutral-900">Rooms on the website</h2>
              <p className="text-xs text-neutral-500">Available and coming-up rooms. Tick the ones to advertise — rent, photos, description and move-in date come from the room in CROS. They stop showing once the room is let.</p>
            </div>
            {(data.rooms ?? []).length ? (
              <ul className="divide-y divide-neutral-100">
                {data.rooms.map((r: any) => (
                  <li key={r.id}>
                    <label className="flex cursor-pointer items-center gap-md px-lg py-sm hover:bg-neutral-50">
                      <input type="checkbox" checked={r.show} onChange={async e => { const show = e.target.checked; if (await act({ action: 'room', roomId: r.id, show })) load() }} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-neutral-900">{r.name} · {r.house}{r.letOnly ? <span className="ml-xs rounded bg-purple-100 px-1 text-[10px] font-semibold text-purple-700">LET-ONLY</span> : null}</span>
                        <span className="block text-xs text-neutral-500">{r.rent != null ? `£${Number(r.rent).toLocaleString('en-GB')} pcm` : 'no asking rent set'} · {r.status === 'on_notice' ? 'coming up' : 'available'}{r.availableDate ? ` from ${day(r.availableDate)}` : ''}</span>
                      </span>
                      <span className={`shrink-0 rounded-full px-sm py-0.5 text-[11px] font-semibold ${r.show ? 'bg-green-50 text-green-800' : 'bg-neutral-100 text-neutral-500'}`}>{r.show ? 'On the site' : 'Not shown'}</span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : <p className="px-lg py-md text-sm text-neutral-500">No rooms available or coming up right now.</p>}
          </section>
        )}

        {data && tab === 'documents' && (
          <section className={card}>
            <div className="border-b border-neutral-100 px-lg py-sm">
              <h2 className="text-sm font-bold text-neutral-900">Documents in the website footer</h2>
              <p className="text-xs text-neutral-500">Copied from the old site on 14 October 2026, so they stay available after GNB is switched off.</p>
            </div>
            <ul className="divide-y divide-neutral-100">
              {data.documents.map((d: any) => (
                <li key={d.path} className="flex items-center justify-between gap-md px-lg py-sm">
                  <span className="text-sm font-semibold text-neutral-900">{d.label}</span>
                  <a href={d.path} target="_blank" rel="noopener" className={btn}>Open PDF</a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  )
}

function PostEditor({ post, onClose, onSaved, onDeleted, act }: {
  post: Post; onClose: () => void; onSaved: (p: Post) => void; onDeleted: () => void; act: (b: Record<string, unknown>) => Promise<any>
}) {
  const [p, setP] = useState<Post>({ ...post, excerpt: post.excerpt ?? '', note: post.note ?? '' })
  const [slugTouched, setSlugTouched] = useState(!!post.id)
  const [busy, setBusy] = useState('')
  const [schedule, setSchedule] = useState(!!post.publish_at && !isLive(post))
  useEffect(() => { setP({ ...post, excerpt: post.excerpt ?? '', note: post.note ?? '' }); setSlugTouched(!!post.id); setSchedule(!!post.publish_at && !isLive(post)) }, [post])
  const set = <K extends keyof Post>(k: K, v: Post[K]) => setP(x => ({ ...x, [k]: v }))
  const preview = useMemo(() => markdownToHtml(p.body), [p.body])

  async function upload(file: File): Promise<string | null> {
    setBusy('upload')
    try {
      const d = await act({ action: 'upload', fileName: file.name, mimeType: file.type })
      if (!d) return null
      const { error } = await createClient().storage.from('website').uploadToSignedUrl(d.path, d.token, file, { contentType: file.type })
      if (error) { alert(`Upload failed: ${error.message}`); return null }
      return d.publicUrl as string
    } finally { setBusy('') }
  }
  async function save(status: 'draft' | 'published') {
    setBusy('save')
    const d = await act({ action: 'save_post', post: { ...p, status, publish_at: status === 'published' && schedule ? p.publish_at : null } })
    setBusy('')
    if (d) onSaved(d.post)
  }

  return (
    <div className="grid gap-lg lg:grid-cols-2">
      <section className={`${card} p-lg space-y-md`}>
        <div className="flex items-center justify-between gap-sm">
          <button type="button" className={btn} onClick={onClose}>← All posts</button>
          {p.id && <span className={`rounded-full px-sm py-0.5 text-[11px] font-semibold ${stateOf(post)[1]}`}>{stateOf(post)[0]}</span>}
        </div>
        <label className="block text-sm font-semibold text-neutral-800">Title
          <input className={`${input} mt-xs text-base`} value={p.title} onChange={e => { set('title', e.target.value); if (!slugTouched) set('slug', slugify(e.target.value)) }} placeholder="e.g. Moving-in checklist for your first London room" />
        </label>
        <div className="grid gap-md sm:grid-cols-2">
          <label className="block text-sm font-semibold text-neutral-800">Address
            <span className="mt-xs flex items-center gap-xs text-xs font-normal text-neutral-500">/advice/<input className={input} value={p.slug} onChange={e => { setSlugTouched(true); set('slug', slugify(e.target.value)) }} /></span>
          </label>
          <label className="block text-sm font-semibold text-neutral-800">For
            <select className={`${input} mt-xs`} value={p.category} onChange={e => set('category', e.target.value)}>
              {CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
        </div>
        <label className="block text-sm font-semibold text-neutral-800">Summary <span className="font-normal text-neutral-500">— one or two lines, shown in lists and on Google</span>
          <textarea rows={2} className={`${input} mt-xs`} value={p.excerpt ?? ''} onChange={e => set('excerpt', e.target.value)} />
        </label>
        <div>
          <p className="text-sm font-semibold text-neutral-800">Cover picture</p>
          <div className="mt-xs flex items-center gap-sm">
            {p.cover_url ? <img src={p.cover_url} alt="" className="h-16 w-24 rounded-md object-cover" /> : <span className="h-16 w-24 rounded-md bg-neutral-100" />}
            <label className={`${btn} cursor-pointer`}>{busy === 'upload' ? 'Uploading…' : p.cover_url ? 'Change' : 'Add a picture'}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) { const url = await upload(f); if (url) set('cover_url', url) } e.target.value = '' }} />
            </label>
            {p.cover_url && <button type="button" className="text-xs font-semibold text-neutral-500 underline" onClick={() => set('cover_url', null)}>Remove</button>}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between gap-sm">
            <p className="text-sm font-semibold text-neutral-800">The post</p>
            <label className="cursor-pointer text-xs font-semibold text-blue-700">{busy === 'upload' ? 'Uploading…' : '+ Picture in the post'}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) { const url = await upload(f); if (url) set('body', `${p.body.trimEnd()}\n\n![](${url})\n\n`) } e.target.value = '' }} />
            </label>
          </div>
          <textarea rows={16} className={`${input} mt-xs font-mono text-[13px] leading-relaxed`} value={p.body} onChange={e => set('body', e.target.value)}
            placeholder={'Write in plain text. A blank line starts a new paragraph.\n\n## A heading\n\n**bold words**, a [link](https://…), and lists:\n- one\n- two'} />
          <p className="mt-xs text-xs text-neutral-500">## for a heading · **bold** · [words](link) · a line starting “- ” for a list. The preview shows it as the site will.</p>
        </div>
        <div className="grid gap-md sm:grid-cols-2">
          <label className="block text-sm font-semibold text-neutral-800">Date shown on the post
            <input type="date" className={`${input} mt-xs`} value={p.shown_date ?? ''} onChange={e => set('shown_date', e.target.value || null)} />
          </label>
          <div className="text-sm font-semibold text-neutral-800">
            <label className="flex items-center gap-xs"><input type="checkbox" checked={schedule} onChange={e => setSchedule(e.target.checked)} /> Publish later</label>
            {schedule && <input type="datetime-local" className={`${input} mt-xs`} value={p.publish_at ? p.publish_at.slice(0, 16) : ''} onChange={e => set('publish_at', e.target.value ? new Date(e.target.value).toISOString() : null)} />}
          </div>
        </div>
        <label className="block text-sm font-semibold text-neutral-800">Note for the office <span className="font-normal text-neutral-500">— never shown on the site</span>
          <input className={`${input} mt-xs`} value={p.note ?? ''} onChange={e => set('note', e.target.value)} />
        </label>
        <div className="flex flex-wrap items-center gap-sm border-t border-neutral-100 pt-md">
          <button type="button" className={btnDark} disabled={!!busy || !p.title.trim()} onClick={() => save('published')}>{busy === 'save' ? 'Saving…' : schedule ? 'Schedule' : p.status === 'published' ? 'Save — stays live' : 'Publish'}</button>
          <button type="button" className={btn} disabled={!!busy || !p.title.trim()} onClick={() => save('draft')}>{p.status === 'published' ? 'Take off the site (draft)' : 'Save as draft'}</button>
          {p.id && <button type="button" className="ml-auto text-xs font-semibold text-red-700 underline" onClick={async () => { if (confirm(`Delete “${p.title}” for good?`) && await act({ action: 'delete_post', id: p.id })) onDeleted() }}>Delete</button>}
        </div>
        {p.updated_at && <p className="text-xs text-neutral-400">Last saved {new Date(p.updated_at).toLocaleString('en-GB')}{p.updated_by ? ` by ${p.updated_by}` : ''}{p.old_path ? ` · was ${p.old_path} on the old site (it will redirect here)` : ''}</p>}
      </section>

      <section className={`${card} overflow-hidden`}>
        <p className="border-b border-neutral-100 px-lg py-sm text-xs font-bold uppercase tracking-wider text-neutral-500">Preview</p>
        <article className="website-post px-lg py-lg">
          {p.cover_url && <img src={p.cover_url} alt="" className="mb-md w-full rounded-xl object-cover" style={{ maxHeight: 320 }} />}
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{CATS.find(c => c[0] === p.category)?.[1]}{p.shown_date ? ` · ${day(p.shown_date)}` : ''}</p>
          <h1 className="mt-xs font-serif text-3xl leading-tight text-neutral-900">{p.title || 'Your title'}</h1>
          {p.excerpt && <p className="mt-sm text-base text-neutral-600">{p.excerpt}</p>}
          <div className="mt-md" dangerouslySetInnerHTML={{ __html: preview }} />
        </article>
        <style>{`.website-post h2{font-size:1.35rem;font-weight:700;margin:1.4rem 0 .5rem;color:#171717}.website-post h3{font-size:1.1rem;font-weight:700;margin:1.1rem 0 .4rem}.website-post p{margin:0 0 .9rem;line-height:1.7;color:#404040}.website-post ul{margin:0 0 .9rem 1.2rem;list-style:disc;color:#404040}.website-post li{margin:.2rem 0}.website-post a{color:#1d4ed8;text-decoration:underline}.website-post figure{margin:1rem 0}.website-post img{max-width:100%;border-radius:.75rem}`}</style>
      </section>
    </div>
  )
}
