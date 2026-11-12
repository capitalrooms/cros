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
  const [d, setD] = useState<{ address: string; landlord: string; done: Record<Doc, boolean>; ownershipType: string | null; completed: boolean } | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState<Doc | 'submit' | ''>('')
  const [own, setOwn] = useState('')
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
  const load = () => fetch(api).then(async r => { const x = await r.json(); if (!r.ok) setErr(x.error || 'This link isn’t valid'); else { setD(x); if (x.ownershipType) setOwn(x.ownershipType); setSignName(n => n || x.landlord?.replace(/^(Mr|Mrs|Ms|Miss|Dr|Mx|Prof|Rev)\.?\s+/i, '') || '') } })
  useEffect(() => { load() }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  async function upload(doc: Doc, f: File | undefined) {
    if (!f) return
    if (doc === 'ownership' && !own) { setErr('First choose which proof of ownership you’re sending.'); return }
    setBusy(doc); setErr('')
    try {
      const file = await prepare(f)
      const ct = MIME[(file.name.split('.').pop() ?? '').toLowerCase()] ?? file.type
      if (!Object.values(MIME).includes(ct)) throw new Error('Please choose a photo (JPEG, PNG, HEIC) or a PDF.')
      const call = async (body: any) => { const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ doc, ...body }) }); const x = await r.json().catch(() => ({})); if (!r.ok) throw new Error(x.error || 'Upload failed — please try again'); return x }
      const st = await call({ action: 'start', contentType: ct, size: file.size })
      const { error } = await storage().from(st.bucket).uploadToSignedUrl(st.path, st.uploadToken, file, { contentType: ct })
      if (error) throw new Error('Upload failed — please check your connection and try again')
      await call({ action: 'confirm', path: st.path, ownershipType: own })
      await load()
    } catch (e: any) { setErr(e?.message || 'Upload failed') }
    setBusy('')
  }
  async function submit() {
    setBusy('submit'); setErr('')
    const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit' }) })
    const x = await r.json().catch(() => ({}))
    setBusy('')
    if (!r.ok) setErr(x.error || 'That didn’t send'); else setSent(true)
  }

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #E4E0D8', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }
  const btn = (primary = false): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '12px 18px', borderRadius: 999, fontWeight: 600, fontSize: 15, border: primary ? 0 : '1px solid #111', background: primary ? '#111' : '#fff', color: primary ? '#fff' : '#111', cursor: 'pointer', textDecoration: 'none' })
  const Upload = ({ doc, label }: { doc: Doc; label: string }) => (
    <label style={{ ...btn(!d?.done[doc]), alignSelf: 'flex-start', opacity: busy === doc ? 0.6 : 1 }}>
      {busy === doc ? 'Uploading…' : d?.done[doc] ? '✓ Added — replace it' : label}
      <input type="file" accept="image/*,application/pdf" capture={doc === 'ownership' ? undefined : 'environment'} style={{ display: 'none' }} onChange={e => { upload(doc, e.target.files?.[0]); e.target.value = '' }} />
    </label>
  )
  const step = (n: number, title: string, done: boolean) => <p style={{ margin: 0, fontWeight: 700, fontSize: 17 }}><span style={{ display: 'inline-block', width: 26, height: 26, lineHeight: '26px', textAlign: 'center', borderRadius: 13, background: done ? '#2F6B4F' : '#111', color: '#fff', fontSize: 13, marginRight: 8 }}>{done ? '✓' : n}</span>{title}</p>

  return (
    <PublicShell centred label="For Rightmove">
      <main style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px 64px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {err && !d && <p style={{ color: '#9B2C1F' }}>{err}</p>}
        {d && (d.completed || sent ? (
          <div style={card}><p style={{ margin: 0, fontWeight: 700, fontSize: 20 }}>Thank you — all done</p><p style={{ margin: 0, color: '#4A4741' }}>We’ve got everything we need for Rightmove. We’ll let you know when {d.address.split(',')[0]} is live.</p></div>
        ) : (<>
          <div>
            <h1 style={{ margin: '0 0 6px', fontSize: 26, lineHeight: 1.15 }}>Three documents for Rightmove</h1>
            <p style={{ margin: 0, color: '#4A4741' }}>{d.landlord ? `${d.landlord}, ` : ''}to advertise <b>{d.address}</b> on Rightmove, they ask for these three things. A clear photo of each is fine — a scan is great too.</p>
          </div>

          <div style={card}>
            {step(1, 'Sign the letter of authority', d.done.letter)}
            {d.done.letter ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <span style={{ color: '#2F6B4F', fontWeight: 600 }}>Signed and saved.</span>
                <a href={`${api}/letter`} target="_blank" rel="noreferrer" style={{ fontSize: 14, color: '#111' }}>See the wording</a>
                <button type="button" onClick={() => load().then(() => setD(x => x ? { ...x, done: { ...x.done, letter: false } } : x))} style={{ background: 'none', border: 0, textDecoration: 'underline', cursor: 'pointer', fontSize: 14 }}>Sign again</button>
              </div>
            ) : (<>
              <p style={{ margin: 0, color: '#4A4741', fontSize: 15 }}>We’ve written it for you — <a href={`${api}/letter`} target="_blank" rel="noreferrer" style={{ color: '#111' }}>read the letter</a>. Sign it here on screen, or print it and send a photo.</p>
              <div style={{ display: 'flex', gap: 6, background: '#F1EEE7', borderRadius: 999, padding: 4, alignSelf: 'flex-start' }}>
                {([['screen', 'Sign on screen'], ['paper', 'Print or write it']] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setHow(k)} style={{ padding: '7px 14px', borderRadius: 999, border: 0, fontWeight: 600, fontSize: 14, cursor: 'pointer', background: how === k ? '#fff' : 'transparent', boxShadow: how === k ? '0 1px 3px rgba(0,0,0,.12)' : 'none' }}>{l}</button>)}
              </div>
              {how === 'screen' ? (<>
                <input value={signName} onChange={e => setSignName(e.target.value)} placeholder="Your full name" autoComplete="name" style={{ padding: '11px 12px', borderRadius: 10, border: '1px solid #D9D4CA', fontSize: 16 }} />
                <SignaturePad onChange={setSig} />
                <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, cursor: 'pointer' }}><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} style={{ marginTop: 3 }} />I own {d.address.split(',')[0]} and authorise Capital Rooms to advertise it to let on my behalf, as the letter says.</label>
                <button type="button" onClick={signLetter} disabled={busy === 'letter' || !sig || !agree || signName.trim().split(/\s+/).length < 2} style={{ ...btn(true), alignSelf: 'flex-start', opacity: sig && agree && signName.trim().split(/\s+/).length >= 2 ? 1 : 0.4 }}>{busy === 'letter' ? 'Signing…' : 'Sign the letter'}</button>
              </>) : (<>
                <p style={{ margin: 0, color: '#4A4741', fontSize: 15 }}>Print it, sign and date it at the bottom, then take a photo. No printer? Copy it out by hand and sign that instead.</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <a href={`${api}/letter`} target="_blank" rel="noreferrer" style={btn()}>Open the letter</a>
                  <button type="button" onClick={() => setShowText(!showText)} style={btn()}>{showText ? 'Hide the wording' : 'Copy it out by hand'}</button>
                </div>
                {showText && <div style={{ background: '#F7F4EE', borderRadius: 12, padding: 14, fontSize: 14, lineHeight: 1.6 }}>
                  <p style={{ margin: '0 0 8px' }}>To: OpenRent Ltd and Rightmove plc — Letter of authority — {d.address}</p>
                  <p style={{ margin: '0 0 8px' }}>I, {d.landlord || '[your full name]'}, confirm that I am the owner of the property at {d.address}.</p>
                  <p style={{ margin: '0 0 8px' }}>I authorise Capital Rooms Ltd, of Hoxton Mix, 66 Paul Street, London EC2A 4NA, to advertise this property to let on my behalf on Rightmove, OpenRent and other property portals, and to arrange viewings and the letting as my agent.</p>
                  <p style={{ margin: 0 }}>Signed · Full name · Date</p>
                </div>}
                <Upload doc="letter" label="Add a photo of the signed letter" />
              </>)}
            </>)}
          </div>

          <div style={card}>
            {step(2, 'Proof you own the property', d.done.ownership)}
            <p style={{ margin: 0, color: '#4A4741', fontSize: 15 }}>Any one of these:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {OWNERSHIP.map(([k, l]) => <label key={k} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 15, cursor: 'pointer' }}><input type="radio" name="own" checked={own === k} onChange={() => setOwn(k)} style={{ marginTop: 4 }} />{l}</label>)}
            </div>
            <p style={{ margin: 0, fontSize: 13, color: '#6F6A60' }}>Don’t have one to hand? You can download your title from the Land Registry online: <a href="https://www.gov.uk/get-information-about-property-and-land/search-the-register" target="_blank" rel="noreferrer" style={{ color: '#111' }}>search the register</a>.</p>
            <Upload doc="ownership" label="Add it" />
          </div>

          <div style={card}>
            {step(3, 'Photo ID', d.done.id)}
            <p style={{ margin: 0, color: '#4A4741', fontSize: 15 }}>Your passport (the photo page) or driving licence. Make sure all four corners are in the photo and it isn’t blurry.</p>
            <Upload doc="id" label="Add a photo of your ID" />
          </div>

          {err && <p style={{ margin: 0, color: '#9B2C1F' }}>{err}</p>}
          <button type="button" onClick={submit} disabled={!d.done.letter || !d.done.ownership || !d.done.id || busy === 'submit'} style={{ ...btn(true), opacity: d.done.letter && d.done.ownership && d.done.id ? 1 : 0.4 }}>{busy === 'submit' ? 'Sending…' : 'Send to Capital Rooms'}</button>
          <p style={{ margin: 0, fontSize: 13, color: '#6F6A60' }}>Your documents are kept private and encrypted, and only used to list this property.</p>
        </>))}
      </main>
    </PublicShell>
  )
}
