'use client'
// The landlord's Rightmove documents (12 Nov 2026, Harry): three things, each a photo or a scan — the signed letter of
// authority (written for them: print it or copy it out by hand), proof of ownership, and photo ID. Files go straight
// from the phone to private storage (photos are converted and shrunk first). Data: /api/portal-docs/<token>.
import { use, useEffect, useRef, useState } from 'react'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import PublicShell from '@/components/public/PublicShell'

const storage = () => createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } }).storage
const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' }
const OWNERSHIP = [['land_registry', 'Land Registry title'], ['insurance', 'Insurance certificate'], ['solicitor', 'Solicitor’s letter (completion, or confirming ownership)'], ['mortgage', 'Mortgage letter']] as const
type Doc = 'letter' | 'ownership' | 'id'

async function prepare(file: File): Promise<File> {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  if (['heic', 'heif'].includes(ext) || /image\/hei[cf]/.test(file.type)) {
    const heic2any = (await import('heic2any')).default
    const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 })
    file = new File([Array.isArray(out) ? out[0] : out], file.name.replace(/\.(heic|heif)$/i, '') + '.jpg', { type: 'image/jpeg' })
  }
  if (/^image\/(jpeg|png|webp)$/.test(file.type) && file.size > 2.5 * 1024 * 1024) {
    try {
      const bmp = await createImageBitmap(file), k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height))
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
      c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
      const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.88))
      if (blob && blob.size < file.size) file = new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
    } catch { /* keep the original */ }
  }
  return file
}

/** A signature drawn with a finger or mouse; hands back a PNG when something's been drawn. */
function SignaturePad({ onChange }: { onChange: (png: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false), drawn = useRef(false)
  useEffect(() => {
    const c = ref.current!; const r = c.getBoundingClientRect(), k = window.devicePixelRatio || 1
    c.width = r.width * k; c.height = r.height * k
    const g = c.getContext('2d')!; g.scale(k, k); g.lineWidth = 2.4; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#111'
  }, [])
  const at = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] }
  return (
    <div>
      <canvas ref={ref} style={{ width: '100%', height: 150, border: '1px dashed #9A948A', borderRadius: 12, background: '#fff', touchAction: 'none', display: 'block' }}
        onPointerDown={e => { drawing.current = true; ref.current!.setPointerCapture(e.pointerId); const g = ref.current!.getContext('2d')!; const [x, y] = at(e); g.beginPath(); g.moveTo(x, y) }}
        onPointerMove={e => { if (!drawing.current) return; const g = ref.current!.getContext('2d')!; const [x, y] = at(e); g.lineTo(x, y); g.stroke(); drawn.current = true }}
        onPointerUp={() => { drawing.current = false; onChange(drawn.current ? ref.current!.toDataURL('image/png') : null) }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 13, color: '#6F6A60' }}>
        <span>Sign with your finger or mouse</span>
        <button type="button" onClick={() => { const c = ref.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); drawn.current = false; onChange(null) }} style={{ background: 'none', border: 0, textDecoration: 'underline', cursor: 'pointer', color: '#111', fontSize: 13 }}>Clear</button>
      </div>
    </div>
  )
}

export default function PortalDocsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const api = `/api/portal-docs/${token}`
  const [d, setD] = useState<{ address: string; landlord: string; done: Record<Doc, boolean>; completed: boolean; properties: { id: string; address: string; street: string; ownershipType: string | null; done: boolean; onFile?: boolean }[]; idOnFile?: boolean } | null>(null)
  // documents we already hold (from when they joined) — shown as done, with a way to send a newer one
  const [newer, setNewer] = useState<Record<string, boolean>>({})
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState<Doc | 'submit' | ''>('')
  // which kind of proof, per property (a request can cover several — migration 283)
  const [own, setOwnMap] = useState<Record<string, string>>({})
  const [busyProp, setBusyProp] = useState('')
  const [sent, setSent] = useState(false)
  const [showText, setShowText] = useState(false)
  // sign on screen (default) or print / write it out and send a photo
  const [how, setHow] = useState<'screen' | 'paper'>('screen')
  const [signName, setSignName] = useState('')
  const [sig, setSig] = useState<string | null>(null)
  const [agree, setAgree] = useState(false)
  async function signLetter() {
    setBusy('letter'); setErr('')
    const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sign', name: signName, signature: sig, agree }) })
    const x = await r.json().catch(() => ({}))
    setBusy('')
    if (!r.ok) { setErr(x.error || 'That didn’t sign — please try again'); return }
    await load()
  }
  const load = () => fetch(api).then(async r => { const x = await r.json(); if (!r.ok) setErr(x.error || 'This link isn’t valid'); else { setD(x); setOwnMap(m => { const n = { ...m }; for (const p of x.properties ?? []) if (p.ownershipType && !n[p.id]) n[p.id] = p.ownershipType; return n }); setSignName(n => n || x.landlord?.replace(/^(Mr|Mrs|Ms|Miss|Dr|Mx|Prof|Rev)\.?\s+/i, '') || '') } })
  useEffect(() => { load() }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  async function upload(doc: Doc, f: File | undefined, propertyId = '') {
    if (!f) return
    if (doc === 'ownership' && !own[propertyId]) { setErr('First choose which proof of ownership you’re sending.'); return }
    setBusy(doc); setBusyProp(propertyId); setErr('')
    try {
      const file = await prepare(f)
      const ct = MIME[(file.name.split('.').pop() ?? '').toLowerCase()] ?? file.type
      if (!Object.values(MIME).includes(ct)) throw new Error('Please choose a photo (JPEG, PNG, HEIC) or a PDF.')
      const call = async (body: any) => { const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ doc, ...body }) }); const x = await r.json().catch(() => ({})); if (!r.ok) throw new Error(x.error || 'Upload failed — please try again'); return x }
      const st = await call({ action: 'start', contentType: ct, size: file.size })
      const { error } = await storage().from(st.bucket).uploadToSignedUrl(st.path, st.uploadToken, file, { contentType: ct })
      if (error) throw new Error('Upload failed — please check your connection and try again')
      await call({ action: 'confirm', path: st.path, propertyId, ownershipType: own[propertyId] })
      await load()
    } catch (e: any) { setErr(e?.message || 'Upload failed') }
    setBusy(''); setBusyProp('')
  }
  async function submit() {
    setBusy('submit'); setErr('')
    const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit' }) })
    const x = await r.json().catch(() => ({}))
    setBusy('')
    if (!r.ok) setErr(x.error || 'That didn’t send'); else setSent(true)
  }

  // the website's own look (components/public/public.css): roomy cards, one clear button per step (12 Nov 2026, Harry:
  // "it's all quite bunched up")
  const card: React.CSSProperties = { background: '#fff', border: '1px solid #E4E0D8', borderRadius: 20, padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 16 }
  const btn = (primary = false): React.CSSProperties => primary ? {} : {}
  const Upload = ({ doc, label, propertyId = '', done }: { doc: Doc; label: string; propertyId?: string; done?: boolean }) => {
    const isDone = done ?? d?.done[doc], working = busy === doc && busyProp === propertyId
    return (
      <label className={isDone ? 'pub-btn-ghost' : 'pub-btn'} style={{ alignSelf: 'flex-start', opacity: working ? 0.6 : 1, cursor: 'pointer' }}>
        {working ? 'Uploading…' : isDone ? '✓ Added — replace it' : label}
        <input type="file" accept="image/*,application/pdf" capture={doc === 'ownership' ? undefined : 'environment'} style={{ display: 'none' }} onChange={e => { upload(doc, e.target.files?.[0], propertyId); e.target.value = '' }} />
      </label>
    )
  }
  const Step = ({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) => (
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ flex: '0 0 auto', width: 36, height: 36, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', background: done ? '#2F6B4F' : '#111', color: '#fff', fontSize: 15, fontWeight: 600 }}>{done ? '✓' : n}</span>
        <h2 className="pub-h3" style={{ margin: 0, fontSize: 24, lineHeight: 1.15 }}>{title}</h2>
      </div>
      {children}
    </section>
  )
  const doneCount = d ? [d.done.letter, d.done.ownership, d.done.id].filter(Boolean).length : 0
  const p = (t: React.ReactNode) => <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: '#4A4741' }}>{t}</p>

  return (
    <PublicShell centred label="Rightmove advertising">
      <main style={{ maxWidth: 600, margin: '0 auto', padding: '36px 20px 80px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {err && !d && <p className="pub-error">{err}</p>}
        {d && (d.completed || sent ? (
          <section style={{ ...card, alignItems: 'flex-start' }}>
            <span style={{ width: 44, height: 44, borderRadius: 22, background: '#2F6B4F', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>✓</span>
            <h1 className="pub-h2" style={{ margin: 0 }}>Thank you — all done</h1>
            {p(<>We’ve got all the required info for Rightmove advertising. We’ll let you know when {d.properties.length > 1 ? 'they’re' : `${d.address.split(',')[0]} is`} live.</>)}
          </section>
        ) : (<>
          <header style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 4 }}>
            <span className="pub-eyebrow">Rightmove advertising</span>
            <h1 className="pub-h2" style={{ margin: 0 }}>Required info for Rightmove advertising</h1>
            <p className="pub-intro" style={{ margin: 0 }}>{d.landlord ? <>{d.landlord}, before</> : 'Before'} <b>{d.address}</b> can go on Rightmove, {(() => { const held = (d.idOnFile ? 1 : 0) + (d.properties.length && d.properties.every(x => x.onFile) ? 1 : 0); const need = 3 - held; return need === 3 ? 'they need three things from you' : `there ${need === 1 ? 'is just one thing' : 'are two things'} left for you to do — we already have the rest` })()}. A clear photo of each is fine — a scan is great too. You can stop and come back to this link any time.</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <div style={{ display: 'flex', gap: 6 }}>{[0, 1, 2].map(i => <span key={i} style={{ width: 28, height: 6, borderRadius: 3, background: i < doneCount ? '#2F6B4F' : '#E4E0D8' }} />)}</div>
              <span className="pub-muted" style={{ fontSize: 14 }}>{doneCount} of 3 done</span>
            </div>
          </header>

          <Step n={1} title="Sign the letter of authority" done={d.done.letter}>
            {d.done.letter ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
                <span style={{ color: '#2F6B4F', fontWeight: 600, fontSize: 16 }}>Signed and saved</span>
                <a href={`${api}/letter`} target="_blank" rel="noreferrer" className="pub-link" style={{ fontSize: 15, color: '#111' }}>See the wording</a>
                <button type="button" onClick={() => setD(x => x ? { ...x, done: { ...x.done, letter: false } } : x)} style={{ background: 'none', border: 0, textDecoration: 'underline', cursor: 'pointer', fontSize: 15, padding: 0 }}>Sign again</button>
              </div>
            ) : (<>
              {p(<>We’ve written it for you — <a href={`${api}/letter`} target="_blank" rel="noreferrer" style={{ color: '#111' }}>read the letter</a>. Sign it here on screen, or print it and send a photo.</>)}
              <div style={{ display: 'flex', gap: 4, background: '#F1EEE7', borderRadius: 999, padding: 4, alignSelf: 'flex-start' }}>
                {([['screen', 'Sign on screen'], ['paper', 'Print or write it']] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setHow(k)} style={{ padding: '9px 16px', borderRadius: 999, border: 0, fontWeight: 600, fontSize: 14, cursor: 'pointer', background: how === k ? '#fff' : 'transparent', boxShadow: how === k ? '0 1px 3px rgba(0,0,0,.12)' : 'none' }}>{l}</button>)}
              </div>
              {how === 'screen' ? (<>
                <label className="pub-label">Your full name<input className="pub-input" value={signName} onChange={e => setSignName(e.target.value)} autoComplete="name" /></label>
                <SignaturePad onChange={setSig} />
                <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 15, lineHeight: 1.5, cursor: 'pointer' }}><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} style={{ marginTop: 4, width: 18, height: 18 }} />{d.properties.length > 1 ? `I own these ${d.properties.length} properties and authorise Capital Rooms to advertise them to let on my behalf, as the letter says.` : `I own ${d.address.split(',')[0]} and authorise Capital Rooms to advertise it to let on my behalf, as the letter says.`}</label>
                <button type="button" className="pub-btn" onClick={signLetter} disabled={busy === 'letter' || !sig || !agree || signName.trim().split(/\s+/).length < 2} style={{ alignSelf: 'flex-start' }}>{busy === 'letter' ? 'Signing…' : 'Sign the letter'}</button>
              </>) : (<>
                {p('Print it, sign and date it at the bottom, then take a photo. No printer? Copy it out by hand and sign that instead.')}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  <a href={`${api}/letter`} target="_blank" rel="noreferrer" className="pub-btn-ghost">Open the letter</a>
                  <button type="button" className="pub-btn-ghost" onClick={() => setShowText(!showText)}>{showText ? 'Hide the wording' : 'Copy it out by hand'}</button>
                </div>
                {showText && <div className="pub-note" style={{ borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span>To: OpenRent Ltd and Rightmove plc — Letter of authority — {d.address}</span>
                  <span>I, {d.landlord || '[your full name]'}, confirm that I am the owner of the property at {d.address}.</span>
                  <span>I authorise Capital Rooms Ltd, of Hoxton Mix, 66 Paul Street, London EC2A 4NA, to advertise this property to let on my behalf on Rightmove, OpenRent and other property portals, and to arrange viewings and the letting as my agent.</span>
                  <span>Signed · Full name · Date</span>
                </div>}
                <Upload doc="letter" label="Add a photo of the signed letter" />
              </>)}
            </>)}
          </Step>

          <Step n={2} title={d.properties.length > 1 ? 'Proof you own each property' : 'Proof you own the property'} done={d.done.ownership}>
            {p(d.properties.length > 1 ? 'For each property, any one of: a Land Registry title, insurance certificate, solicitor’s letter or mortgage letter.' : 'Any one of these:')}
            {d.properties.map((pr, i) => (
              <div key={pr.id} style={{ display: 'flex', flexDirection: 'column', gap: 10, ...(d.properties.length > 1 ? { borderTop: i ? '1px solid #E4E0D8' : 0, paddingTop: i ? 18 : 4 } : {}) }}>
                {d.properties.length > 1 && <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>{pr.done ? '✓ ' : ''}{pr.street}</p>}
{pr.onFile && !newer[pr.id] ? (
                  <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>✓ We already have this from you — nothing to do. <button type="button" onClick={() => setNewer(m => ({ ...m, [pr.id]: true }))} style={{ background: 'none', border: 0, padding: 0, color: '#111', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>Send a newer one</button></p>
                ) : (<>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {OWNERSHIP.map(([k, l]) => <button key={k} type="button" className="pub-choice" aria-pressed={own[pr.id] === k} onClick={() => setOwnMap(m => ({ ...m, [pr.id]: k }))}><span className={`pub-dot ${own[pr.id] === k ? 'on' : ''}`} /><span>{l}</span></button>)}
                </div>
                <Upload doc="ownership" propertyId={pr.id} done={pr.done && !pr.onFile} label={d.properties.length > 1 ? `Add it for ${pr.street}` : 'Add it'} />
                </>)}
              </div>
            ))}
            <p className="pub-muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>Don’t have one to hand? You can download your title from the Land Registry online: <a href="https://www.gov.uk/get-information-about-property-and-land/search-the-register" target="_blank" rel="noreferrer" style={{ color: '#111' }}>search the register</a>.</p>
          </Step>

          <Step n={3} title="Photo ID" done={d.done.id}>
            {d.idOnFile && !newer.__id ? (
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>✓ We already have your photo ID — nothing to do. <button type="button" onClick={() => setNewer(m => ({ ...m, __id: true }))} style={{ background: 'none', border: 0, padding: 0, color: '#111', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>Send a newer one</button></p>
            ) : (<>
              {p('Your passport (the photo page) or driving licence. Make sure all four corners are in the photo and it isn’t blurry.')}
              <Upload doc="id" label="Add a photo of your ID" done={d.done.id && !d.idOnFile} />
            </>)}
          </Step>

          {err && <p className="pub-error" style={{ margin: 0 }}>{err}</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
            <button type="button" className="pub-btn" onClick={submit} disabled={doneCount < 3 || busy === 'submit'}>{busy === 'submit' ? 'Sending…' : doneCount < 3 ? `Finish the steps above to send (${doneCount} of 3 done)` : 'Send to Capital Rooms'}</button>
            <p className="pub-muted" style={{ margin: 0, fontSize: 13, textAlign: 'center' }}>Your documents are kept private and encrypted, and only used to list {d.properties.length > 1 ? 'these properties' : 'this property'}.</p>
          </div>
        </>))}
      </main>
    </PublicShell>
  )
}
