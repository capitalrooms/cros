'use client'

import { useEffect, useMemo, useState } from 'react'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import { createClient } from '@/lib/supabase'
import {
  fullSignatureHtml, replySignatureHtml, signatureText, signatureNameUrl,
  SIGNATURE_ASSET_BASE, type SignaturePerson,
} from '@/lib/brand/signature'

interface Staff { id: string; first_name: string | null; last_name: string | null; email: string | null; role: string; job_title: string | null; direct_phone: string | null }

const PRESETS: Record<string, SignaturePerson> = {
  accounts: { name: 'Accounts Department', title: 'Capital Rooms', phone: '0207 112 9163', email: 'accounts@capitalrooms.co.uk' },
}
const ROLE_TITLE: Record<string, string> = { administrator: 'Property Manager', admin: 'Property Manager', lettings: 'Lettings', cleaner: 'Property Services' }

export default function SignaturesPage() {
  const supabase = createClient()
  const [staff, setStaff] = useState<Staff[]>([])
  const [who, setWho] = useState('')
  const [person, setPerson] = useState<SignaturePerson>({ name: '', title: '', phone: '', email: '' })
  const [nameWidth, setNameWidth] = useState<number | null>(null)
  const [nameError, setNameError] = useState('')
  const [copied, setCopied] = useState<{ key: string; ok: boolean; text: string } | null>(null)

  useEffect(() => {
    ;(supabase.from('people') as any)
      .select('id, first_name, last_name, email, role, job_title, direct_phone')
      .in('role', ['administrator', 'admin', 'lettings', 'cleaner'])
      .order('first_name')
      .then(({ data }: { data: Staff[] | null }) => setStaff(data ?? []))
  }, [])

  function choose(value: string) {
    setWho(value); setCopied(null)
    if (PRESETS[value]) return setPerson(PRESETS[value])
    const s = staff.find(x => x.id === value)
    if (s) setPerson({
      name: [s.first_name, s.last_name].filter(Boolean).join(' '),
      title: s.job_title || ROLE_TITLE[s.role] || '',
      phone: s.direct_phone || '0207 112 9163',
      email: s.email || '',
    })
    else setPerson({ name: '', title: '', phone: '', email: '' })
  }

  // The name image's width decides the <img> size in the signature
  useEffect(() => {
    const n = person.name.trim()
    setNameWidth(null); setNameError('')
    if (!n) return
    const t = setTimeout(async () => {
      const res = await fetch(`/api/brand/signature-name?n=${encodeURIComponent(n.toUpperCase())}&meta=1`)
      if (!res.ok) { setNameError('Names can use letters, numbers, spaces and & \' . , - (up to 48 characters).'); return }
      setNameWidth((await res.json()).width)
    }, 350)
    return () => clearTimeout(t)
  }, [person.name])

  const ready = !!(nameWidth && person.name.trim() && person.email.trim() && person.phone.trim())
  // Preview loads images from this site; the copied signature always points at the live site Gmail can reach
  const previewBase = typeof window !== 'undefined' ? window.location.origin : SIGNATURE_ASSET_BASE
  const preview = useMemo(() => ready ? {
    full: fullSignatureHtml(person, nameWidth!, previewBase),
    reply: replySignatureHtml(person, nameWidth!, previewBase),
  } : null, [ready, person, nameWidth, previewBase])

  async function copy(kind: 'full' | 'reply', asHtml: boolean) {
    if (!ready) return
    const html = kind === 'full' ? fullSignatureHtml(person, nameWidth!) : replySignatureHtml(person, nameWidth!)
    try {
      if (asHtml) await navigator.clipboard.writeText(html)
      else await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([signatureText(person)], { type: 'text/plain' }),
      })])
      setCopied({ key: kind, ok: true, text: asHtml ? 'HTML copied' : 'Copied — paste it into Gmail’s signature box' })
    } catch {
      setCopied({ key: kind, ok: false, text: 'Your browser blocked copying — try Chrome, or use Copy HTML' })
    }
  }

  const input = 'w-full rounded-lg border border-neutral-200 bg-white px-md py-sm text-sm text-neutral-900'
  const label = 'block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs'

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/settings" />} title="Email signatures" />
      <PageHero eyebrow="Settings" title="Email signatures" subtitle="Make a Gmail signature in the Capital Rooms house style for anyone on the team. Pick the person, check their details, then copy it into Gmail." />
      <div className="mx-auto max-w-6xl px-lg py-xl space-y-lg">
        <header>
        </header>

        <div className="grid gap-lg lg:grid-cols-[320px_1fr]">
          <section className="bg-white rounded-xl border border-neutral-200 p-lg space-y-md h-fit">
            <div>
              <label className={label} htmlFor="sig-who">Who is it for?</label>
              <select id="sig-who" className={input} value={who} onChange={e => choose(e.target.value)}>
                <option value="">Choose…</option>
                {staff.map(s => <option key={s.id} value={s.id}>{[s.first_name, s.last_name].filter(Boolean).join(' ') || s.email} · {s.role}</option>)}
                <option value="accounts">Accounts Department (accounts@)</option>
                <option value="other">Someone else — type their details</option>
              </select>
            </div>
            {([['name', 'Name', 'Harry Buchanan'], ['title', 'Job title', 'Property Manager'], ['phone', 'Mobile', '+44 7700 900123'], ['email', 'Email', 'name@capitalrooms.co.uk']] as const).map(([k, l, ph]) => (
              <div key={k}>
                <label className={label} htmlFor={`sig-${k}`}>{l}</label>
                <input id={`sig-${k}`} className={input} value={person[k]} placeholder={ph}
                  onChange={e => { setPerson(p => ({ ...p, [k]: e.target.value })); setCopied(null) }} />
              </div>
            ))}
            {nameError && <p className="text-xs text-red-700">{nameError}</p>}
            <p className="text-xs text-neutral-400">These details are only used for the signature. To change someone’s saved job title or mobile, edit their profile.</p>
          </section>

          <section className="space-y-md">
            {(['full', 'reply'] as const).map(kind => (
              <div key={kind} className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-md px-lg py-md border-b border-neutral-100">
                  <div>
                    <p className="text-sm font-bold text-neutral-900">{kind === 'full' ? 'New emails' : 'Replies'}</p>
                    <p className="text-xs text-neutral-500">{kind === 'full' ? 'Full signature with credentials' : 'Slim dark bar that keeps reply chains tidy'}</p>
                  </div>
                  <div className="flex gap-sm">
                    <button type="button" disabled={!ready} onClick={() => copy(kind, false)}
                      className="rounded-lg bg-neutral-900 text-white px-md py-xs text-sm font-semibold hover:bg-neutral-700 disabled:opacity-40">Copy for Gmail</button>
                    <button type="button" disabled={!ready} onClick={() => copy(kind, true)}
                      className="rounded-lg border border-neutral-300 px-md py-xs text-sm font-semibold text-neutral-900 hover:bg-neutral-50 disabled:opacity-40">Copy HTML</button>
                  </div>
                </div>
                <div className="p-lg overflow-x-auto">
                  <p className="text-sm text-neutral-800 mb-md" style={{ fontFamily: 'Arial, sans-serif' }}>Kind regards,</p>
                  {preview
                    ? <div dangerouslySetInnerHTML={{ __html: preview[kind] }} />
                    : <p className="text-sm text-neutral-400">{person.name.trim() ? 'Preparing…' : 'Choose a person to see their signature.'}</p>}
                </div>
                {copied?.key === kind && <p className={`px-lg pb-md text-sm ${copied.ok ? 'text-green-700' : 'text-red-700'}`}>{copied.text}</p>}
              </div>
            ))}

            <div className="bg-white rounded-xl border border-neutral-200 p-lg text-sm text-neutral-700">
              <p className="font-bold text-neutral-900 mb-xs">Putting it into Gmail</p>
              <ol className="list-decimal pl-lg space-y-xs text-neutral-600">
                <li>Press <b>Copy for Gmail</b> on “New emails”.</li>
                <li>In Gmail: cog → <b>See all settings</b> → <b>General</b> → <b>Signature</b> → <b>Create new</b>, and paste.</li>
                <li>Do the same with “Replies” as a second signature.</li>
                <li>Under <b>Signature defaults</b> choose the full one for new emails and the reply one for replies, then <b>Save changes</b> at the bottom.</li>
                <li>In the Gmail phone app, turn off <b>Mobile signature</b> so it uses this one.</li>
              </ol>
              {person.name.trim() && <p className="text-xs text-neutral-400 mt-sm break-all">Name image: {signatureNameUrl(person.name)}</p>}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
