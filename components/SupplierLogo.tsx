'use client'

// A contractor's or cleaner's own logo for their invoices (21 Oct 2026, Harry: "can the contractor upload a png on
// their user profile for their logo … that will sit neatly on their invoice?"). On their profile and in Invoices ›
// My details. PNG stays PNG (a see-through background stays see-through — it used to turn black as a JPEG), the empty
// margin around it is trimmed so it sits tight, and it's scaled to a sensible size. Shows exactly what's on file.
import { useEffect, useState } from 'react'

/** trim transparent / near-white margins, cap the size, keep PNG (or JPEG for photos with no transparency) */
async function prepare(file: File): Promise<string> {
  const bmp = await createImageBitmap(file)
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height
  const x = c.getContext('2d')!; x.drawImage(bmp, 0, 0)
  const { data, width, height } = x.getImageData(0, 0, c.width, c.height)
  let top = height, left = width, right = -1, bottom = -1, see = false
  for (let yy = 0; yy < height; yy++) for (let xx = 0; xx < width; xx++) {
    const i = (yy * width + xx) * 4, a = data[i + 3]
    if (a < 250) see = true
    if (a > 16 && !(data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245)) {
      if (yy < top) top = yy; if (yy > bottom) bottom = yy; if (xx < left) left = xx; if (xx > right) right = xx
    }
  }
  if (right < 0) { top = 0; left = 0; right = width - 1; bottom = height - 1 }   // all white: keep as it is
  const pad = Math.round(Math.max(right - left, bottom - top) * 0.03)
  left = Math.max(0, left - pad); top = Math.max(0, top - pad); right = Math.min(width - 1, right + pad); bottom = Math.min(height - 1, bottom + pad)
  const w = right - left + 1, h = bottom - top + 1, scale = Math.min(1, 900 / w, 360 / h)
  const out = document.createElement('canvas'); out.width = Math.round(w * scale); out.height = Math.round(h * scale)
  const o = out.getContext('2d')!
  if (!see && file.type !== 'image/png') { o.fillStyle = '#fff'; o.fillRect(0, 0, out.width, out.height) }
  o.drawImage(c, left, top, w, h, 0, 0, out.width, out.height)
  return see || file.type === 'image/png' ? out.toDataURL('image/png') : out.toDataURL('image/jpeg', 0.9)
}

export default function SupplierLogo({ viewAs, compact = false }: { viewAs?: string | null; compact?: boolean }) {
  const [url, setUrl] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(viewAs ? { 'x-view-as': viewAs } : {}) }
  async function load() {
    const r = await fetch('/api/supplier/invoices?logo=1', { headers }).catch(() => null)
    const d = await r?.json().catch(() => ({}))
    setUrl(d?.url ?? null); setLoaded(true)
  }
  useEffect(() => { load() }, [viewAs])   // eslint-disable-line react-hooks/exhaustive-deps
  async function send(body: object, ok: string) {
    setBusy(true); setMsg('')
    try {
      const r = await fetch('/api/supplier/invoices', { method: 'POST', headers, body: JSON.stringify(body) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'That didn’t save — try again')
      setMsg(ok); await load()
    } catch (e) { setMsg(e instanceof Error ? e.message : 'That didn’t save') } finally { setBusy(false) }
  }
  async function pick(file?: File) {
    if (!file) return
    if (!/^image\/(png|jpeg)$/.test(file.type)) { setMsg('Use a PNG or JPEG file'); return }
    try { await send({ action: 'logo', dataUrl: await prepare(file) }, 'Logo saved — it’s on your next invoice') } catch { setMsg('That image couldn’t be read — try a PNG') }
  }
  if (!loaded) return null
  return (
    <div className={compact ? 'space-y-2' : 'space-y-3 rounded-2xl border border-neutral-200 bg-white p-lg'}>
      {!compact && <div><p className="text-sm font-bold text-neutral-900">Your logo for invoices</p><p className="text-xs text-neutral-500">A PNG works best — a see-through or white background both look right. We trim the edges so it sits neatly beside your business name.</p></div>}
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-40 items-center justify-center rounded-lg border border-neutral-200 bg-white p-2">
          {url ? <img src={url} alt="Your logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-neutral-400">No logo yet</span>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={`cursor-pointer rounded-lg bg-neutral-900 px-3 py-1.5 text-center text-xs font-bold text-white ${busy ? 'opacity-50' : ''}`}>
            {busy ? 'Saving…' : url ? 'Change logo' : 'Upload logo'}
            <input type="file" accept="image/png,image/jpeg" className="hidden" disabled={busy} onChange={e => { pick(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          {url && <button type="button" disabled={busy} onClick={() => send({ action: 'logo', remove: true }, 'Logo removed')} className="text-xs font-semibold text-neutral-500 underline">Remove</button>}
        </div>
      </div>
      {msg && <p className={`text-xs ${/saved|removed/i.test(msg) ? 'text-green-700' : 'text-red-700'}`}>{msg}</p>}
    </div>
  )
}
