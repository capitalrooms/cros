'use client'
// Your profile (9 Nov 2026 rebuild): how your housemates see you. A photo or a fun avatar, a short bio and a few
// light, tap-to-answer questions (lib/icebreaker). Everything optional; you can hide it from housemates any time.
// Saves through /api/tenant/profile (server side; the photo stays private and is shown through short signed links).
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import Face from '@/components/Face'
import { adminFetch } from '@/lib/adminFetch'
import { ICEBREAKER_QUESTIONS, type IcebreakerAnswers } from '@/lib/icebreaker'
import { AVATAR_EMOJI, AVATAR_COLOURS, parseAvatar, avatarValue } from '@/lib/housemates/avatar'

const BIO_MAX = 160

/** Shrink a phone photo before it leaves the phone (long side 1200px, JPEG). */
async function shrink(file: File): Promise<Blob> {
  const img = await createImageBitmap(file).catch(() => null)
  if (!img) return file
  const k = Math.min(1, 1200 / Math.max(img.width, img.height))
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  return await new Promise<Blob>(res => c.toBlob(b => res(b ?? file), 'image/jpeg', 0.85))
}

export default function MyProfile() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [firstName, setFirstName] = useState('')
  const [answers, setAnswers] = useState<IcebreakerAnswers>({})
  const [visible, setVisible] = useState(true)
  const [adverts, setAdverts] = useState(false)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [avatar, setAvatar] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    adminFetch('/api/tenant/profile').then(async r => {
      if (r.status === 401) { router.push('/login'); return }
      const d = await r.json()
      setFirstName(d.firstName ?? ''); setAnswers(d.answers ?? {}); setVisible(d.visible !== false); setAdverts(d.adverts === true)
      setPhotoUrl(d.photoUrl ?? null); setAvatar(d.answers?.avatar ?? null)
      setLoading(false)
    }).catch(() => { setError('Couldn’t load your profile. Check your connection and try again.'); setLoading(false) })
  }, [router])

  // warn before leaving with unsaved answers
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const set = (id: string, v: string) => { setAnswers(a => ({ ...a, [id]: v })); setDirty(true); setNote('') }
  const toggle = (id: string, opt: string) => {
    const cur = String(answers[id] ?? '').split(',').map(x => x.trim()).filter(Boolean)
    set(id, (cur.includes(opt) ? cur.filter(x => x !== opt) : [...cur, opt]).join(', '))
  }

  async function save() {
    setBusy('save'); setError('')
    const r = await adminFetch('/api/tenant/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers, visible, adverts }) }).catch(() => null)
    setBusy('')
    if (r?.ok) { setDirty(false); setNote('Saved. Your housemates will see this.') } else setError((await r?.json().catch(() => ({})))?.error ?? 'Couldn’t save. Check your connection and try again.')
  }
  async function choosePhoto(f?: File) {
    if (!f) return
    setBusy('photo'); setError('')
    const fd = new FormData(); fd.append('photo', new File([await shrink(f)], 'photo.jpg', { type: 'image/jpeg' }))
    const r = await adminFetch('/api/tenant/profile', { method: 'PUT', body: fd }).catch(() => null)
    const d = await r?.json().catch(() => ({}))
    setBusy('')
    if (r?.ok) { setPhotoUrl(d.photoUrl); setPicking(false); setNote('Photo added.') } else setError(d?.error ?? 'Couldn’t add that photo. Try another one.')
  }
  async function removePic() {
    setBusy('photo'); await adminFetch('/api/tenant/profile', { method: 'DELETE' }).catch(() => null); setBusy(''); setPhotoUrl(null)
  }
  async function pickAvatar(v: string | null) {
    setAvatar(v); setBusy('avatar')
    await adminFetch('/api/tenant/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ avatar: v }) }).catch(() => null)
    // an avatar takes the photo's place (14 Nov 2026: "I picked an avatar after a horrid photo and it didn't replace it")
    if (v && photoUrl) { await adminFetch('/api/tenant/profile', { method: 'DELETE' }).catch(() => null); setPhotoUrl(null) }
    setBusy('')
  }

  if (loading) return <div className="min-h-screen bg-neutral-100"><AppBar left={<BackButton href="/tenant" label="Home" />} /><p className="p-xl text-sm text-neutral-400">Loading…</p></div>

  const av = parseAvatar(avatar) ?? { emoji: '🦊', colour: 'sage' }
  const bio = String(answers.bio ?? '')
  const others = ICEBREAKER_QUESTIONS.filter(q => q.id !== 'bio')

  return (
    <div className="min-h-screen bg-neutral-100 pb-[120px]">
      <AppBar left={<BackButton href="/tenant" label="Home" />} />
      <main className="mx-auto max-w-xl px-lg py-lg">
        <h1 className="text-2xl font-bold text-neutral-900">Your profile</h1>
        <p className="mt-xs text-sm text-neutral-600">How your housemates see you. Everything is optional.</p>

        {/* face */}
        <section className="mt-lg rounded-2xl border border-neutral-200 bg-white p-lg">
          <div className="flex items-center gap-lg">
            <Face name={firstName} photoUrl={photoUrl} avatar={photoUrl ? null : avatar} size={84} ring />
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold text-neutral-900">{firstName || 'You'}</p>
              <div className="mt-sm flex flex-wrap gap-sm">
                <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy} className="rounded-full bg-neutral-900 px-md py-xs text-sm font-semibold text-white disabled:opacity-50">{busy === 'photo' ? 'Adding…' : photoUrl ? 'Change photo' : 'Add a photo'}</button>
                <button type="button" onClick={() => setPicking(p => !p)} className="rounded-full border border-neutral-300 px-md py-xs text-sm font-semibold text-neutral-800">{picking ? 'Done' : 'Pick an avatar'}</button>
                {photoUrl && <button type="button" onClick={removePic} disabled={!!busy} className="px-xs text-sm font-semibold text-neutral-500 underline">Remove photo</button>}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={e => { choosePhoto(e.target.files?.[0]); e.target.value = '' }} />
            </div>
          </div>
          {picking && (
            <div className="mt-lg border-t border-neutral-100 pt-lg">
              {photoUrl && <p className="mb-sm text-xs text-neutral-500">Your photo shows first. Remove it to use an avatar instead.</p>}
              <div className="grid grid-cols-8 gap-xs">
                {AVATAR_EMOJI.map(e => (
                  <button key={e} type="button" onClick={() => pickAvatar(avatarValue({ emoji: e, colour: av.colour }))} aria-label={`Avatar ${e}`}
                    className={`grid aspect-square place-items-center rounded-full text-2xl ${av.emoji === e && avatar ? 'ring-2 ring-neutral-900' : ''}`} style={{ background: AVATAR_COLOURS[av.colour] }}>{e}</button>
                ))}
              </div>
              <div className="mt-md flex flex-wrap items-center gap-sm">
                <span className="text-xs font-semibold text-neutral-500">Colour</span>
                {Object.entries(AVATAR_COLOURS).map(([k, hex]) => (
                  <button key={k} type="button" onClick={() => pickAvatar(avatarValue({ emoji: av.emoji, colour: k }))} aria-label={`Colour ${k}`}
                    className={`h-8 w-8 rounded-full ${av.colour === k ? 'ring-2 ring-neutral-900 ring-offset-2' : ''}`} style={{ background: hex }} />
                ))}
                {avatar && <button type="button" onClick={() => pickAvatar(null)} className="ml-auto text-xs font-semibold text-neutral-500 underline">No avatar</button>}
              </div>
            </div>
          )}
        </section>

        {/* bio */}
        <section className="mt-md rounded-2xl border border-neutral-200 bg-white p-lg">
          <label htmlFor="bio" className="block text-sm font-bold text-neutral-900">Your bio</label>
          <textarea id="bio" value={bio} onChange={e => set('bio', e.target.value.slice(0, BIO_MAX))} rows={3} placeholder="e.g. Just moved from Bristol for a new job. Always up for a Sunday roast."
            className="mt-sm w-full resize-none rounded-xl border border-neutral-300 px-md py-sm text-[15px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900" />
          <p className="mt-xs text-right text-xs text-neutral-400">{bio.length}/{BIO_MAX}</p>
        </section>

        {/* the light questions */}
        <section className="mt-md rounded-2xl border border-neutral-200 bg-white p-lg">
          <p className="text-sm font-bold text-neutral-900">A bit more, if you like</p>
          <div className="mt-md space-y-lg">
            {others.map(q => (
              <div key={q.id}>
                <p className="text-sm font-semibold text-neutral-800">{q.prompt}</p>
                {q.kind === 'pick' || q.kind === 'choice' ? (
                  <div className="mt-sm flex flex-wrap gap-xs">
                    {q.options!.map(o => {
                      const on = q.kind === 'choice' ? answers[q.id] === o : String(answers[q.id] ?? '').split(',').map(x => x.trim()).includes(o)
                      return <button key={o} type="button" aria-pressed={on} onClick={() => q.kind === 'choice' ? set(q.id, on ? '' : o) : toggle(q.id, o)}
                        className={`rounded-full border px-md py-xs text-sm ${on ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-800'}`}>{o}</button>
                    })}
                  </div>
                ) : (
                  <input value={String(answers[q.id] ?? '')} onChange={e => set(q.id, e.target.value)} placeholder={q.placeholder}
                    className="mt-sm w-full rounded-xl border border-neutral-300 px-md py-sm text-[15px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                )}
              </div>
            ))}
          </div>
        </section>

        <label className="mt-md flex cursor-pointer items-start gap-sm rounded-2xl border border-neutral-200 bg-white p-lg">
          <input type="checkbox" checked={visible} onChange={e => { setVisible(e.target.checked); setDirty(true) }} className="mt-0.5 h-5 w-5" />
          <span className="text-sm text-neutral-700"><span className="font-bold text-neutral-900">Show my profile to my housemates.</span> Turn this off to keep it private.</span>
        </label>
        <label className="mt-sm flex cursor-pointer items-start gap-sm rounded-2xl border border-neutral-200 bg-white p-lg">
          <input type="checkbox" checked={adverts} onChange={e => { setAdverts(e.target.checked); setDirty(true) }} className="mt-0.5 h-5 w-5" />
          <span className="text-sm text-neutral-700"><span className="font-bold text-neutral-900">Help find a great housemate.</span> Show a short intro on adverts for empty rooms in your house: what you do, where you’re from and your weekends. Never your name or photo.</span>
        </label>
        <p className="mt-lg text-center"><Link href="/tenant/housemates" className="text-sm font-semibold text-neutral-600 underline">See your housemates</Link></p>
      </main>

      {/* save bar */}
      <div className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-white/95 px-lg py-md backdrop-blur" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
        <div className="mx-auto flex max-w-xl items-center gap-md">
          <p className={`min-w-0 flex-1 text-sm ${error ? 'text-red-700' : 'text-neutral-600'}`} role={error ? 'alert' : undefined}>{error || note || (dirty ? 'You have changes to save.' : 'All saved.')}</p>
          <button type="button" onClick={save} disabled={!dirty || busy === 'save'} className="rounded-xl bg-neutral-900 px-xl py-md text-sm font-bold text-white disabled:opacity-40">{busy === 'save' ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}
