'use client'

// "Say hello to your housemates" on the move-in pack (6 Nov 2026 — lib/icebreaker, lib/housemates/profile). All
// optional: a photo they're happy to share, a few taps, a line or two if they like. Saved as they go. The photo is
// shrunk on the phone first (≤1200px JPEG) — smaller, and its location data doesn't leave the phone.
import { useEffect, useRef, useState } from 'react'
import { ICEBREAKER_QUESTIONS } from '@/lib/icebreaker'

async function shrink(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
    // a centred square (7 Nov 2026) so it sits in a neat circle everywhere — Outlook ignores object-fit and would stretch
    // a tall photo into an oval; faces are usually in the upper middle, so the square leans upward on portrait photos
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    const sx = (img.naturalWidth - side) / 2, sy = img.naturalHeight > side ? (img.naturalHeight - side) * 0.3 : 0
    const out = Math.min(800, side)
    const c = document.createElement('canvas')
    c.width = out; c.height = out
    c.getContext('2d')!.drawImage(img, sx, sy, side, side, 0, 0, out, out)
    return await new Promise<Blob>((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('Couldn’t read that photo')), 'image/jpeg', 0.86))
  } finally { URL.revokeObjectURL(url) }
}

export default function AboutYou({ token, firstName, wholeLet }: { token: string; firstName: string; wholeLet: boolean }) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [visible, setVisible] = useState(true)
  const [adverts, setAdverts] = useState(false)
  const [photo, setPhoto] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [state, setState] = useState<'' | 'saving' | 'saved'>('')
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const api = `/api/pack/${encodeURIComponent(token)}/about-you`

  useEffect(() => {
    fetch(api).then(r => r.ok ? r.json() : null).then(d => { if (d) { setAnswers(d.answers ?? {}); setVisible(d.visible !== false); setAdverts(d.adverts === true); setPhoto(d.photoUrl ?? null) } setLoaded(true) }).catch(() => setLoaded(true))
  }, [api])

  // saved a moment after they stop typing or tapping
  function change(next: Record<string, string>, vis = visible, ads = adverts) {
    setAnswers(next); setState('saving')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: next, visible: vis, adverts: ads }) })
      if (r.ok) { setState('saved'); setError('') } else { setState(''); setError('That didn’t save — please try again') }
    }, 700)
  }
  const pick = (id: string, opt: string) => {
    const cur = (answers[id] ?? '').split(',').map(x => x.trim()).filter(Boolean)
    change({ ...answers, [id]: (cur.includes(opt) ? cur.filter(x => x !== opt) : [...cur, opt]).join(', ') })
  }
  async function upload(f: File | undefined) {
    if (!f) return
    setUploading(true); setError('')
    try {
      const blob = await shrink(f)
      const r = await fetch(api, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: blob })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error ?? 'Couldn’t save the photo')
      setPhoto(d.photoUrl ?? null)
    } catch (e: any) { setError(e?.message ?? 'Couldn’t save the photo') }
    setUploading(false)
  }
  async function removePic() { await fetch(api, { method: 'DELETE' }); setPhoto(null) }

  if (!loaded) return null
  const who = wholeLet ? 'your landlord' : 'your new housemates and your landlord'
  return (
    <section className="pub-rise flex max-w-3xl flex-col gap-7" aria-labelledby="hello-h">
      <div className="flex flex-col gap-3">
        <h2 id="hello-h" className="pub-h2">Say hello, <span className="italic">{firstName}.</span></h2>
        <p className="m-0 text-[16px] leading-relaxed" style={{ color: '#4A4741' }}>
          {wholeLet ? 'A few lines so your landlord knows a little about who’s moving in.' : 'A few lines so your housemates know a little about who’s moving in — something to chat about on day one.'} Everything here is optional: tap what fits, skip what doesn’t.
        </p>
      </div>

      <div className="flex items-center gap-5">
        <div style={{ width: 96, height: 96, borderRadius: 48, overflow: 'hidden', background: '#ECE8E0', flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {photo ? <img src={photo} alt="Your photo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span className="pub-serif text-[34px]" style={{ color: '#8A8478' }}>{firstName.slice(0, 1)}</span>}
        </div>
        <div className="flex flex-col gap-2">
          <label className="pub-btn-ghost cursor-pointer self-start" style={{ minHeight: 40 }}>
            {uploading ? 'Saving…' : photo ? 'Change photo' : 'Add a photo'}
            <input type="file" accept="image/*" className="hidden" onChange={e => { upload(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          {photo ? <button type="button" onClick={removePic} className="pub-link self-start text-[14px]">Remove</button>
            : <span className="text-[13px]" style={{ color: '#6F6A60' }}>A clear, friendly one of you — it doesn’t need to be fancy.</span>}
        </div>
      </div>

      {ICEBREAKER_QUESTIONS.map(q => (
        <div key={q.id} className="flex flex-col gap-2">
          <p className="pub-label m-0">{q.prompt}</p>
          {q.kind === 'pick' || q.kind === 'choice' ? (
            <div className="flex flex-wrap gap-2">
              {q.options!.map(o => {
                const on = q.kind === 'choice' ? answers[q.id] === o : (answers[q.id] ?? '').split(',').map(x => x.trim()).includes(o)
                return <button key={o} type="button" aria-pressed={on} className={`pub-pill ${on ? 'on' : ''}`}
                  onClick={() => q.kind === 'choice' ? change({ ...answers, [q.id]: on ? '' : o }) : pick(q.id, o)}>{o}</button>
              })}
            </div>
          ) : (
            <input className="pub-input" value={answers[q.id] ?? ''} maxLength={200} placeholder={q.placeholder} onChange={e => change({ ...answers, [q.id]: e.target.value })} />
          )}
        </div>
      ))}

      <div style={{ borderTop: '1px solid #111' }}>
        <button type="button" className="pub-choice" aria-pressed={visible} onClick={() => { setVisible(!visible); change(answers, !visible) }}>
          <span className={`pub-dot sq ${visible ? 'on' : ''}`} />
          <span>Happy for {who} to see this</span>
        </button>
        {!wholeLet && (
          <button type="button" className="pub-choice" aria-pressed={adverts} onClick={() => { setAdverts(!adverts); change(answers, visible, !adverts) }}>
            <span className={`pub-dot sq ${adverts ? 'on' : ''}`} />
            <span>Help find a great housemate: show a short intro on adverts for empty rooms in your house — what you do, weekends and so on. Never your name or photo.</span>
          </button>
        )}
      </div>
      <p className="m-0 text-[13px]" style={{ color: error ? '#9B2C1F' : '#6F6A60' }}>{error || (state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved — you can change it any time in the Capital Rooms app.' : 'Saved as you go.')}</p>
    </section>
  )
}
