'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { createClient } from '@/lib/supabase'

// Returns the current user's access token from the Supabase session (stored in localStorage).
async function getAuthToken(): Promise<string | null> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

interface GuideBlock {
  id: string
  sort_order: number
  heading: string
  body: string
  inline_image_url: string | null
}

interface Guide {
  id: string
  slug: string
  title: string
  emoji: string
  acknowledgment_required: boolean
  hero_image_url: string | null
}

// ── Scroll-reveal hook ──────────────────────────────────────────────────────
function useScrollReveal(ref: React.RefObject<Element>, threshold = 0.15) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!ref.current) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold }
    )
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [ref, threshold])
  return visible
}

// ── Block with scroll-triggered reveal and image ─────────────────────────────
function GuideBlock({ block, index }: { block: GuideBlock; index: number }) {
  const blockRef = useRef<HTMLDivElement>(null!)
  const blockVisible = useScrollReveal(blockRef, 0.1)

  const bullets = block.body.split('\n').filter(Boolean)

  return (
    <div
      ref={blockRef}
      className="transition-all duration-700 ease-out"
      style={{
        opacity: blockVisible ? 1 : 0,
        transform: blockVisible ? 'translateY(0)' : 'translateY(32px)',
        transitionDelay: `${index * 80}ms`,
      }}
    >
      <div className="rounded-2xl bg-white border border-neutral-100 overflow-hidden shadow-sm">

        {/* Inline image — fades in with the block, slightly delayed */}
        {block.inline_image_url && (
          <div
            className="overflow-hidden bg-neutral-100 transition-all duration-700 ease-out"
            style={{
              opacity: blockVisible ? 1 : 0,
              transform: blockVisible ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.97)',
              transitionDelay: `${index * 80 + 150}ms`,
            }}
          >
            <img
              src={block.inline_image_url}
              alt={block.heading}
              className="w-full object-contain"
              style={{ display: 'block', maxHeight: '240px' }}
            />
          </div>
        )}

        <div className="p-lg">
          <h3 className="text-base font-bold text-neutral-900 mb-md leading-snug">
            {block.heading}
          </h3>
          <ul className="space-y-sm">
            {bullets.map((line, i) => (
              <li key={i} className="flex gap-sm text-sm text-neutral-700 leading-relaxed">
                <span className="flex-shrink-0 w-[6px] h-[6px] rounded-full bg-neutral-300 mt-[7px]" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

// ── Bouncing scroll-down chevron ─────────────────────────────────────────────
function ScrollHint({ visible }: { visible: boolean }) {
  return (
    <div
      className="pointer-events-none transition-opacity duration-500"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <div
        className="w-12 h-12 rounded-full bg-white/90 backdrop-blur-sm shadow-lg flex items-center justify-center"
        style={{ animation: visible ? 'bounce-hint 1.4s ease-in-out infinite' : 'none' }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M5 8l5 5 5-5" stroke="#374151" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </div>
  )
}

// ── Acknowledgment button ────────────────────────────────────────────────────
function AcknowledgeButton({
  guideSlug,
  acknowledged,
  onAcknowledged,
}: {
  guideSlug: string
  acknowledged: boolean
  onAcknowledged: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(acknowledged)

  async function handleAck() {
    if (done || loading) return
    setLoading(true)
    try {
      const token = await getAuthToken()
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch(`/api/tenant/guides/${guideSlug}/acknowledge`, { method: 'POST', headers })
      if (res.ok) { setDone(true); onAcknowledged() }
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="flex items-center gap-sm text-green-700 bg-green-50 border border-green-200 rounded-2xl px-lg py-md">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="9" stroke="#16a34a" strokeWidth="1.5"/>
          <path d="M6 10l3 3 5-5" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="text-sm font-semibold">Guide read and confirmed</span>
      </div>
    )
  }

  return (
    <button
      onClick={handleAck}
      disabled={loading}
      className="w-full rounded-2xl bg-neutral-900 text-white font-semibold text-sm py-md px-lg transition-opacity disabled:opacity-50 active:opacity-80"
    >
      {loading ? 'Confirming…' : "I've read this guide — confirm"}
    </button>
  )
}

// ── Hero cover screen (fills 100dvh like a book cover) ───────────────────────
function HeroCover({
  guide,
  onScrollHintVisible,
}: {
  guide: Guide
  onScrollHintVisible: boolean
}) {
  return (
    <div
      className="relative w-full flex-shrink-0 bg-white"
      style={{ height: '100dvh' }}
    >
      {/* Hero image starts below the AppBar so the baked-in title text is naturally visible */}
      {guide.hero_image_url ? (
        <img
          src={guide.hero_image_url}
          alt={guide.title}
          className="absolute left-0 right-0 bottom-0 w-full object-cover object-top"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 60px)', height: 'calc(100dvh - env(safe-area-inset-top, 0px) - 60px)' }}
        />
      ) : (
        /* Fallback gradient cover when no hero image */
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ background: 'linear-gradient(160deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)' }}
        >
          <p className="text-7xl mb-6">{guide.emoji}</p>
          <h1
            className="text-3xl font-black text-white text-center px-xl leading-tight"
            style={{ fontFamily: "'Lato', system-ui, sans-serif", fontWeight: 900 }}
          >
            {guide.title}
          </h1>
        </div>
      )}

      {/* Gradient vignette at bottom for chevron legibility */}
      <div
        className="absolute inset-x-0 bottom-0 h-32 pointer-events-none"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.4) 0%, transparent 100%)' }}
      />

      {/* Bouncing scroll hint centered at bottom of cover */}
      <div className="absolute inset-x-0 bottom-8 flex justify-center">
        <ScrollHint visible={onScrollHintVisible} />
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function GuidePage() {
  const { slug } = useParams<{ slug: string }>()
  const [guide, setGuide] = useState<Guide | null>(null)
  const [blocks, setBlocks] = useState<GuideBlock[]>([])
  const [acknowledged, setAcknowledged] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Scroll hint: show while cover is visible, hide once user scrolls past it
  const [showScrollHint, setShowScrollHint] = useState(true)

  useEffect(() => {
    getAuthToken().then(token => {
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`
      return fetch(`/api/tenant/guides/${slug}`, { headers })
    })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        setGuide(d.guide)
        setBlocks(d.blocks)
        setAcknowledged(d.acknowledged)
      })
      .catch(() => setError('Could not load guide'))
      .finally(() => setLoading(false))
  }, [slug])

  // Hide scroll hint once user scrolls past ~60% of the viewport height
  const checkScrollHint = useCallback(() => {
    const scrolled = window.scrollY || document.documentElement.scrollTop
    const vh = window.innerHeight
    setShowScrollHint(scrolled < vh * 0.6)
  }, [])

  useEffect(() => {
    window.addEventListener('scroll', checkScrollHint, { passive: true })
    checkScrollHint()
    return () => window.removeEventListener('scroll', checkScrollHint)
  }, [checkScrollHint])

  // Inject bounce animation once
  useEffect(() => {
    if (document.getElementById('bounce-hint-style')) return
    const style = document.createElement('style')
    style.id = 'bounce-hint-style'
    style.textContent = `
      @keyframes bounce-hint {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(8px); }
      }
    `
    document.head.appendChild(style)
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <AppBar left={<BackButton href="/tenant" />} />
        <div className="flex items-center justify-center pt-[30vh]">
          <div className="w-6 h-6 rounded-full border-2 border-neutral-300 border-t-neutral-700 animate-spin" />
        </div>
      </div>
    )
  }

  if (error || !guide) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <AppBar left={<BackButton href="/tenant" />} />
        <div className="p-xl text-center text-neutral-500 text-sm">{error ?? 'Guide not found'}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50">

      {/* AppBar floated over the hero with transparent/dark background */}
      <div className="fixed top-0 inset-x-0 z-50">
        <AppBar left={<BackButton href="/tenant" />} />
      </div>

      {/* Hero cover — full viewport, like a book cover */}
      <HeroCover guide={guide} onScrollHintVisible={showScrollHint} />

      {/* Guide content — below the fold */}
      <div className="px-lg pt-xl pb-[100px] space-y-md">

        {/* Guide title below hero (visible once scrolled past cover) */}
        <div className="pb-sm">
          <h1
            className="text-2xl font-black text-neutral-900 leading-tight"
            style={{ fontFamily: "'Lato', system-ui, sans-serif", fontWeight: 900 }}
          >
            {guide.title}
          </h1>
          {guide.acknowledgment_required && !acknowledged && (
            <p className="mt-sm text-xs text-neutral-500">
              Read through the guide below, then confirm you've read it at the bottom.
            </p>
          )}
        </div>

        {/* Content blocks with scroll-reveal + inline images */}
        {blocks.length === 0 ? (
          <div className="rounded-2xl bg-white border border-neutral-100 p-lg text-sm text-neutral-400 text-center">
            Content coming soon
          </div>
        ) : (
          blocks.map((block, i) => (
            <GuideBlock key={block.id} block={block} index={i} />
          ))
        )}

        {/* Acknowledgment */}
        {guide.acknowledgment_required && (
          <div className="pt-md">
            <AcknowledgeButton
              guideSlug={guide.slug}
              acknowledged={acknowledged}
              onAcknowledged={() => setAcknowledged(true)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
