'use client'

import { useState, useEffect, useRef } from 'react'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'

const GREETING_PRESETS = [
  'I hope this email finds you well.',
  'Happy New Year!',
  'Hope you\'re having a great week.',
  'I wanted to reach out personally.',
]

export default function AcquisitionEmailPage() {
  const [firstName, setFirstName]     = useState('')
  const [email, setEmail]             = useState('')
  const [greeting, setGreeting]       = useState(GREETING_PRESETS[0])
  const [customGreeting, setCustomGreeting] = useState('')
  const [useCustom, setUseCustom]     = useState(false)
  const [headshotUrl, setHeadshotUrl] = useState('https://cros-sigma.vercel.app/harry.jpg')
  const [step, setStep]               = useState<'compose' | 'preview' | 'sent'>('compose')
  const [previewSrc, setPreviewSrc]   = useState('')
  const [sending, setSending]         = useState(false)
  const [sendError, setSendError]     = useState('')
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Fees & offers
  const [managementFee, setManagementFee]             = useState('5%')
  const [lettingFee, setLettingFee]                   = useState('4%')
  const [showOfferBanner, setShowOfferBanner]         = useState(true)
  const [showFreeManagement, setShowFreeManagement]   = useState(true)
  const [freeMonths, setFreeMonths]                   = useState('1')
  const [showLettingDiscount, setShowLettingDiscount] = useState(true)
  const [discountedFee, setDiscountedFee]             = useState('2%')

  const activeGreeting = useCustom ? customGreeting : greeting
  const canPreview = firstName.trim().length > 0

  // Build preview URL whenever fields change
  useEffect(() => {
    if (!canPreview) return
    const params = new URLSearchParams({
      firstName: firstName.trim() || 'there',
      ...(activeGreeting ? { greeting: activeGreeting } : {}),
      ...(headshotUrl.trim() ? { headshotUrl: headshotUrl.trim() } : {}),
      managementFee: managementFee.trim() || '5%',
      lettingFee: lettingFee.trim() || '4%',
      showOfferBanner: String(showOfferBanner),
      showFreeManagement: String(showFreeManagement),
      freeManagementMonths: freeMonths || '1',
      showLettingDiscount: String(showLettingDiscount),
      discountedLettingFee: discountedFee.trim() || '2%',
    })
    setPreviewSrc(`/api/landlord-acquisition?${params}`)
  }, [firstName, activeGreeting, headshotUrl, managementFee, lettingFee, showOfferBanner, showFreeManagement, freeMonths, showLettingDiscount, discountedFee, canPreview])

  async function handleSend() {
    if (!email.trim() || !firstName.trim()) return
    setSending(true)
    setSendError('')
    const res = await fetch('/api/landlord-acquisition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: firstName.trim(),
        email: email.trim(),
        greeting: activeGreeting || undefined,
        headshotUrl: headshotUrl.trim() || undefined,
        managementFee: managementFee.trim() || undefined,
        lettingFee: lettingFee.trim() || undefined,
        showOfferBanner,
        showFreeManagement,
        freeManagementMonths: freeMonths || '1',
        showLettingDiscount,
        discountedLettingFee: discountedFee.trim() || undefined,
      }),
    })
    const d = await res.json()
    if (!res.ok || !d.ok) {
      setSendError(d.error ?? 'Send failed')
    } else {
      setStep('sent')
    }
    setSending(false)
  }

  const inp = 'w-full rounded-xl border border-neutral-200 bg-white px-md py-sm text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900'
  const lbl = 'block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs'

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/new-business" />} />

      <main className="mx-auto max-w-6xl px-lg py-lg">
        <div className="mb-xl">
          <h1 className="text-2xl font-bold text-neutral-900">✉️ Send Acquisition Email</h1>
          <p className="text-sm text-neutral-500 mt-xs">
            Personalised introduction email sent directly to a prospective landlord. The template is fixed — only the name, greeting, and headshot swap per send.
          </p>
        </div>

        {step === 'sent' ? (
          <div className="bg-white rounded-2xl border border-neutral-200 p-2xl text-center max-w-md mx-auto">
            <div className="text-4xl mb-md">✅</div>
            <h2 className="text-xl font-bold text-neutral-900 mb-sm">Email sent!</h2>
            <p className="text-sm text-neutral-500 mb-xl">
              The acquisition email has been delivered to <strong>{email}</strong>. The reply-to is set to management@capitalrooms.co.uk so any response comes straight to Harry.
            </p>
            <div className="flex gap-md justify-center">
              <button
                onClick={() => { setStep('compose'); setEmail(''); setFirstName(''); setSendError('') }}
                className="rounded-xl bg-neutral-900 text-white px-xl py-sm text-sm font-semibold hover:bg-neutral-700 transition"
              >
                Send another
              </button>
              <button
                onClick={() => setStep('preview')}
                className="rounded-xl border border-neutral-200 px-xl py-sm text-sm font-semibold text-neutral-600 hover:bg-neutral-50 transition"
              >
                Review what was sent
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-xl items-start">
            {/* Left panel — form */}
            <div className="w-96 shrink-0 space-y-lg">

              {/* Step tabs */}
              <div className="flex rounded-xl border border-neutral-200 overflow-hidden bg-white">
                {(['compose', 'preview'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => s === 'preview' && canPreview ? setStep('preview') : setStep('compose')}
                    disabled={s === 'preview' && !canPreview}
                    className={`flex-1 py-sm text-sm font-semibold transition ${
                      step === s ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-neutral-50 disabled:opacity-30'
                    }`}
                  >
                    {s === 'compose' ? '1 · Compose' : '2 · Preview & Send'}
                  </button>
                ))}
              </div>

              {step === 'compose' && (
                <>
                  <div className="bg-white rounded-2xl border border-neutral-200 p-lg space-y-md">
                    <h2 className="text-sm font-bold text-neutral-900">Recipient</h2>
                    <div>
                      <label className={lbl}>First name *</label>
                      <input value={firstName} onChange={e => setFirstName(e.target.value)} className={inp} placeholder="e.g. James" />
                    </div>
                    <div>
                      <label className={lbl}>Email address *</label>
                      <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inp} placeholder="james@example.com" />
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-neutral-200 p-lg space-y-md">
                    <h2 className="text-sm font-bold text-neutral-900">Opening greeting</h2>
                    <div className="space-y-xs">
                      {GREETING_PRESETS.map(g => (
                        <button
                          key={g}
                          onClick={() => { setGreeting(g); setUseCustom(false) }}
                          className={`w-full text-left text-sm px-md py-sm rounded-xl border-2 transition ${
                            !useCustom && greeting === g ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 hover:border-neutral-300'
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                      <button
                        onClick={() => setUseCustom(true)}
                        className={`w-full text-left text-sm px-md py-sm rounded-xl border-2 transition ${
                          useCustom ? 'border-neutral-900 bg-neutral-50' : 'border-dashed border-neutral-300 hover:border-neutral-400'
                        }`}
                      >
                        Custom…
                      </button>
                    </div>
                    {useCustom && (
                      <input
                        value={customGreeting}
                        onChange={e => setCustomGreeting(e.target.value)}
                        className={inp}
                        placeholder="e.g. I wanted to reach out after meeting you at…"
                        autoFocus
                      />
                    )}
                  </div>

                  <div className="bg-white rounded-2xl border border-neutral-200 p-lg space-y-md">
                    <h2 className="text-sm font-bold text-neutral-900">Headshot photo</h2>
                    <div>
                      <label className={lbl}>Image URL (optional)</label>
                      <input
                        value={headshotUrl}
                        onChange={e => setHeadshotUrl(e.target.value)}
                        className={inp}
                        placeholder="https://… (must be publicly accessible)"
                      />
                    </div>
                    <p className="text-xs text-neutral-400 leading-relaxed">
                      Paste a direct link to a hosted photo. If blank, initials &ldquo;HB&rdquo; appear instead. The image must be a public URL — email clients cannot access private storage.
                    </p>
                  </div>

                  {/* Fees & Offers */}
                  <div className="bg-white rounded-2xl border border-neutral-200 p-lg space-y-md">
                    <h2 className="text-sm font-bold text-neutral-900">Fees</h2>
                    <div className="grid grid-cols-2 gap-md">
                      <div>
                        <label className={lbl}>Management fee</label>
                        <input value={managementFee} onChange={e => setManagementFee(e.target.value)} className={inp} placeholder="5%" />
                      </div>
                      <div>
                        <label className={lbl}>Letting fee</label>
                        <input value={lettingFee} onChange={e => setLettingFee(e.target.value)} className={inp} placeholder="4%" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-neutral-200 p-lg space-y-md">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-bold text-neutral-900">Offer banner</h2>
                      <button
                        onClick={() => setShowOfferBanner(v => !v)}
                        className={`text-xs font-semibold px-sm py-1 rounded-full border transition ${showOfferBanner ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-500 border-neutral-300'}`}
                      >
                        {showOfferBanner ? 'Showing' : 'Hidden'}
                      </button>
                    </div>

                    {showOfferBanner && (
                      <div className="space-y-md pt-xs">
                        {/* Free management offer */}
                        <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-md space-y-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-neutral-700">Free management offer</span>
                            <button
                              onClick={() => setShowFreeManagement(v => !v)}
                              className={`text-xs font-semibold px-sm py-1 rounded-full border transition ${showFreeManagement ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-500 border-neutral-300'}`}
                            >
                              {showFreeManagement ? 'On' : 'Off'}
                            </button>
                          </div>
                          {showFreeManagement && (
                            <div>
                              <label className={lbl}>Free months</label>
                              <input
                                value={freeMonths}
                                onChange={e => setFreeMonths(e.target.value)}
                                className={inp}
                                placeholder="1"
                                type="number"
                                min="1"
                              />
                            </div>
                          )}
                        </div>

                        {/* Letting discount offer */}
                        <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-md space-y-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-neutral-700">Letting fee discount</span>
                            <button
                              onClick={() => setShowLettingDiscount(v => !v)}
                              className={`text-xs font-semibold px-sm py-1 rounded-full border transition ${showLettingDiscount ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-500 border-neutral-300'}`}
                            >
                              {showLettingDiscount ? 'On' : 'Off'}
                            </button>
                          </div>
                          {showLettingDiscount && (
                            <div>
                              <label className={lbl}>Discounted rate</label>
                              <input
                                value={discountedFee}
                                onChange={e => setDiscountedFee(e.target.value)}
                                className={inp}
                                placeholder="2%"
                              />
                              <p className="text-xs text-neutral-400 mt-xs">Shows as &ldquo;just {discountedFee || '…'} instead of the usual {lettingFee || '…'}&rdquo;</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => setStep('preview')}
                    disabled={!canPreview}
                    className="w-full rounded-xl bg-neutral-900 text-white py-sm text-sm font-semibold hover:bg-neutral-700 transition disabled:opacity-40"
                  >
                    Preview email →
                  </button>
                </>
              )}

              {step === 'preview' && (
                <>
                  <div className="bg-white rounded-2xl border border-neutral-200 p-lg space-y-sm">
                    <h2 className="text-sm font-bold text-neutral-900 mb-sm">Ready to send</h2>
                    <div className="text-sm space-y-xs text-neutral-600">
                      <div className="flex gap-sm"><span className="text-neutral-400 w-20 shrink-0">To</span><span className="font-medium text-neutral-900">{email || <span className="italic text-neutral-400">no email</span>}</span></div>
                      <div className="flex gap-sm"><span className="text-neutral-400 w-20 shrink-0">Greeting</span><span>{activeGreeting || '—'}</span></div>
                      <div className="flex gap-sm"><span className="text-neutral-400 w-20 shrink-0">Headshot</span><span>{headshotUrl ? 'Custom URL' : 'HB initials'}</span></div>
                    </div>
                  </div>

                  {sendError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-md text-sm text-red-700">⚠ {sendError}</div>
                  )}

                  <div className="flex gap-md">
                    <button onClick={() => setStep('compose')} className="flex-1 rounded-xl border border-neutral-200 py-sm text-sm font-semibold text-neutral-600 hover:bg-neutral-50 transition">
                      ← Edit
                    </button>
                    <button
                      onClick={handleSend}
                      disabled={sending || !email.trim() || !firstName.trim()}
                      className="flex-1 rounded-xl bg-neutral-900 text-white py-sm text-sm font-semibold hover:bg-neutral-700 transition disabled:opacity-40"
                    >
                      {sending ? 'Sending…' : '✉ Send now'}
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Right panel — live preview iframe */}
            <div className="flex-1 min-w-0">
              <div className="rounded-2xl border border-neutral-200 overflow-hidden bg-white">
                <div className="flex items-center gap-sm px-md py-sm bg-neutral-50 border-b border-neutral-200">
                  <div className="flex gap-xs">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-amber-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                  </div>
                  <p className="text-xs text-neutral-400 flex-1 text-center font-mono">
                    {firstName.trim() ? `Dear ${firstName.trim()},` : 'Enter a name to preview'}
                  </p>
                </div>
                {canPreview && previewSrc ? (
                  <iframe
                    ref={iframeRef}
                    src={previewSrc}
                    className="w-full"
                    style={{ height: 'calc(100vh - 200px)', border: 'none' }}
                    title="Email preview"
                  />
                ) : (
                  <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 200px)' }}>
                    <p className="text-sm text-neutral-400">Enter a first name to see the live preview</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
