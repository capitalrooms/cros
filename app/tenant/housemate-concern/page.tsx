'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'

// ── Category definitions with tailored tips + example sentences ──────────────
const HM_TIPS: Record<string, {
  label: string
  icon: string
  tips: string[]
  examples: string[]
  canSendHouseNote: boolean
  mediationLine?: string
}> = {
  cleaning: {
    label: 'Cleaning & tidying',
    icon: '🧹',
    tips: [
      'Most shared-house tension over cleaning is about expectations, not bad intentions.',
      'A simple rota or cleaning checklist can resolve this without a conversation.',
    ],
    examples: [
      '"The kitchen surfaces have been left unwashed a few times this week — could we agree to wipe down after cooking?"',
      '"The bathroom could use a clean — could we take turns on a weekly basis?"',
    ],
    canSendHouseNote: true,
    mediationLine: 'If this has been an ongoing issue after trying the above, Capital Rooms can facilitate a house conversation.',
  },
  noise_day: {
    label: 'Noise during the day',
    icon: '🔊',
    tips: [
      'Daytime noise expectations can vary a lot — a direct, friendly conversation often helps more than assuming.',
      'Agreeing on "quiet hours" even just for weekday mornings can work well.',
    ],
    examples: [
      '"I\'ve been working from home recently and the noise has made it difficult — could we find a way to keep it down around 9–5?"',
      '"Could we avoid loud calls in the communal areas during the morning?"',
    ],
    canSendHouseNote: true,
    mediationLine: 'If a conversation hasn\'t helped, Capital Rooms can reach out to the household.',
  },
  noise_night: {
    label: 'Noise at night',
    icon: '🌙',
    tips: [
      'Late-night noise is one of the most disruptive issues in shared houses — you have a right to a good night\'s sleep.',
      'Try mentioning it once, calmly and directly, before escalating.',
    ],
    examples: [
      '"I\'ve been woken up a few times after midnight — could we keep things quieter after 11pm?"',
      '"The music last night was too loud to sleep through — is there a way we can agree on a cut-off time?"',
    ],
    canSendHouseNote: true,
    mediationLine: 'Repeated night disturbances are something Capital Rooms takes seriously — let us know if it continues.',
  },
  guests: {
    label: 'Guests staying over',
    icon: '🛌',
    tips: [
      'The tenancy allows occasional guests but extended stays can affect everyone in the house.',
      'Guests should not regularly use communal spaces as if they live there.',
    ],
    examples: [
      '"A guest has been staying most nights for a few weeks — I\'m not sure that\'s fair on the rest of us. Could we talk about it?"',
      '"The guest policy is 2 nights a week — could we try to stick to that?"',
    ],
    canSendHouseNote: false,
    mediationLine: 'If a guest is regularly staying beyond what\'s agreed, Capital Rooms can clarify the policy with the household.',
  },
  belongings: {
    label: 'Using others\' belongings',
    icon: '🍴',
    tips: [
      'Borrowing food or personal items without asking is a common source of tension.',
      'A friendly note or conversation usually resolves this quickly.',
    ],
    examples: [
      '"Some of my food has been used without asking — could we make sure to check first?"',
      '"Could we respect each other\'s labelled things in the fridge?"',
    ],
    canSendHouseNote: true,
  },
  communal_clutter: {
    label: 'Belongings left in communal areas',
    icon: '📦',
    tips: [
      'Communal hallways, kitchens, and bathrooms are shared — leaving personal items there long-term isn\'t fair on others.',
      'A quick reminder is usually all it takes.',
    ],
    examples: [
      '"There are bags/shoes left in the hallway most of the time — could we keep it clear?"',
      '"Could we keep personal items out of the kitchen counters so there\'s space for everyone?"',
    ],
    canSendHouseNote: true,
    mediationLine: 'If items are genuinely blocking access or have been there a long time, Capital Rooms can step in.',
  },
  communal_bathroom: {
    label: 'Communal bathroom/sink not kept clean',
    icon: '🚿',
    tips: [
      'Shared bathrooms need everyone to clean up after themselves — it\'s one of the most common shared-house issues.',
      'A rota or a friendly reminder often resolves this without any confrontation.',
    ],
    examples: [
      '"The bathroom hasn\'t been cleaned in a while — could we take turns or agree on a weekly tidy?"',
      '"Could we make sure the sink and surfaces are wiped down after use? It would make a big difference."',
    ],
    canSendHouseNote: true,
    mediationLine: 'If the bathroom is being left in an unhygienic state repeatedly, Capital Rooms can help set expectations.',
  },
  chores: {
    label: 'Shared chores',
    icon: '♻️',
    tips: [
      'Shared responsibilities work best when they\'re explicit rather than assumed.',
      'A simple shared list (even a photo on the fridge) can make a real difference.',
    ],
    examples: [
      '"The bins need taking out regularly — could we agree on who does it each week?"',
      '"The communal areas haven\'t been getting much attention — could we set up a simple rota?"',
    ],
    canSendHouseNote: true,
    mediationLine: 'If a fair split hasn\'t been agreed after trying to discuss it, Capital Rooms can help set expectations.',
  },
  rude: {
    label: 'Rude or unkind behaviour',
    icon: '😔',
    tips: [
      'Feeling disrespected at home is serious. You deserve to feel comfortable where you live.',
      'If you feel safe doing so, raising it directly and calmly often de-escalates things.',
      'You do not have to engage if the behaviour is aggressive or abusive.',
    ],
    examples: [
      '"I\'ve felt spoken to quite rudely recently — I\'d appreciate if we could keep things respectful between us."',
    ],
    canSendHouseNote: false,
    mediationLine: 'If this behaviour has been repeated or you don\'t feel safe addressing it, please contact Capital Rooms directly — this is something we\'ll take seriously.',
  },
  money: {
    label: 'Money or shared costs',
    icon: '💷',
    tips: [
      'Shared costs — like household supplies or group orders — can be a real source of friction if not handled openly.',
      'Agreeing a "house fund" with small contributions avoids awkward individual requests.',
    ],
    examples: [
      '"We\'ve been splitting the cost of washing-up liquid and cleaning stuff — could we set up a small shared fund?"',
      '"I feel like I\'ve been covering more than my share lately — can we talk about splitting costs more fairly?"',
    ],
    canSendHouseNote: true,
    mediationLine: 'If there\'s a genuine financial dispute, Capital Rooms can help set clear expectations.',
  },
  excluded: {
    label: 'Feeling excluded',
    icon: '🤝',
    tips: [
      'Moving into a shared house where others already know each other can feel isolating.',
      'A small gesture — introducing yourself, offering a cup of tea — can break the ice.',
    ],
    examples: [
      '"I\'ve found it hard to feel part of the house — I\'d love to get to know everyone a bit better."',
    ],
    canSendHouseNote: true,
  },
  other: {
    label: 'Something else',
    icon: '💬',
    tips: [],
    examples: [],
    canSendHouseNote: false,
  },
}

type Step = 'category' | 'tips' | 'text' | 'routing' | 'done'

export default function HouseMateConcernPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('category')
  const [categoryKey, setCategoryKey] = useState<string>('')
  const [freeText, setFreeText] = useState('')
  const [sending, setSending] = useState(false)
  const [routingResult, setRoutingResult] = useState<{ type: 'capital_rooms' | 'house_note'; summary?: string; draft?: string } | null>(null)
  const [houseNoteText, setHouseNoteText] = useState('')
  const [houseNoteSent, setHouseNoteSent] = useState(false)
  const [aiError, setAiError] = useState(false)

  const category = categoryKey ? HM_TIPS[categoryKey] : null

  async function handleGetResponse() {
    if (!freeText.trim()) return
    setSending(true)
    setAiError(false)

    // Categories that go straight to Capital Rooms (no house note option)
    if (categoryKey !== 'other' && !category?.canSendHouseNote) {
      setRoutingResult({ type: 'capital_rooms' })
      setStep('routing')
      setSending(false)
      return
    }

    // For named categories with canSendHouseNote, AND for "other" — use AI to polish the draft
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      // For named categories, tell AI we want a house note draft (not routing decision)
      const prompt = categoryKey !== 'other'
        ? `A tenant in a shared house (HMO) has a concern about: "${category?.label}". They wrote: "${freeText.trim()}"\n\nWrite a warm, anonymous, non-accusatory house reminder for the notice board (max 60 words, no names). Respond with JSON only: { "type": "house_note", "draft": "..." }`
        : undefined

      const res = await fetch('/api/tenant/housemate-concern-route', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ concern: freeText.trim(), prompt }),
      })
      if (!res.ok) throw new Error('API error')
      const data = await res.json()
      setRoutingResult(data)
      if (data.type === 'house_note' && data.draft) {
        setHouseNoteText(data.draft)
      } else if (categoryKey !== 'other' && category?.canSendHouseNote) {
        // AI failed or returned capital_rooms for a named category — fall back to raw text
        setRoutingResult({ type: 'house_note', draft: freeText.trim() })
        setHouseNoteText(freeText.trim())
      }
      setStep('routing')
    } catch {
      setAiError(true)
      if (categoryKey !== 'other' && category?.canSendHouseNote) {
        // Fall back to raw text as draft
        setRoutingResult({ type: 'house_note', draft: freeText.trim() })
        setHouseNoteText(freeText.trim())
        setStep('routing')
      } else {
        setRoutingResult({ type: 'capital_rooms' })
        setStep('routing')
      }
    } finally {
      setSending(false)
    }
  }

  async function sendToCapitalRooms() {
    setSending(true)
    setAiError(false)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/tenant/housemate-concern-send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          category: categoryKey,
          concern: freeText.trim(),
        }),
      })
      if (!res.ok) {
        console.error('[sendToCapitalRooms] API error', res.status)
        setAiError(true)
        return
      }
      setStep('done')
    } catch (err) {
      console.error('[sendToCapitalRooms] fetch error', err)
      setAiError(true)
    } finally {
      setSending(false)
    }
  }

  async function sendHouseNote() {
    if (!houseNoteText.trim()) return
    setSending(true)
    setAiError(false)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/tenant/house-reminder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ text: houseNoteText.trim(), category: categoryKey }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        console.error('[sendHouseNote] API error', res.status, body)
        setAiError(true)
        return
      }
      setHouseNoteSent(true)
      setTimeout(() => router.push('/tenant'), 2000)
    } catch (err) {
      console.error('[sendHouseNote] fetch error', err)
      setAiError(true)
    } finally {
      setSending(false)
    }
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton href="/tenant" />} />
        <div className="mx-auto max-w-lg px-lg py-3xl text-center">
          <p className="text-5xl mb-lg">✅</p>
          <h1 className="text-2xl font-bold text-neutral-900">Message sent to Capital Rooms</h1>
          <p className="mt-sm text-neutral-600">We'll look into this privately and be in touch.</p>
          <p className="mt-sm text-sm text-neutral-400">Your name is not shared with housemates.</p>
          <button onClick={() => router.push('/tenant')} className="mt-xl w-full rounded-2xl bg-neutral-900 py-md text-white font-semibold">
            Back to dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      {/* Step-aware back navigation */}
      <AppBar left={
        step === 'category' ? <BackButton href="/tenant" /> :
        step === 'tips'     ? <BackButton onClick={() => setStep('category')} /> :
        step === 'text'     ? <BackButton onClick={() => setStep('tips')} /> :
        step === 'routing'  ? <BackButton onClick={() => setStep('text')} /> :
        <BackButton href="/tenant" />
      } />

      <div className="mx-auto max-w-lg px-lg pt-xl">

        {/* ── Step 1: Category ─────────────────────────────────────────── */}
        {step === 'category' && (
          <>
            <h1 className="text-2xl font-bold text-neutral-900 mb-xs">Trouble with a housemate?</h1>
            <p className="text-sm text-neutral-500 mb-xl">Pick the closest match — we'll offer some guidance before anything else.</p>
            <div className="space-y-xs">
              {Object.entries(HM_TIPS).map(([key, cat]) => (
                <button
                  key={key}
                  onClick={() => { setCategoryKey(key); setStep('tips') }}
                  className="flex w-full items-center gap-md rounded-2xl border border-neutral-200 bg-white p-md text-left hover:border-neutral-400 transition-colors"
                >
                  <span className="text-2xl">{cat.icon}</span>
                  <p className="flex-1 font-semibold text-neutral-900">{cat.label}</p>
                  <span className="text-neutral-400">›</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── Step 2: Tips + examples ──────────────────────────────────── */}
        {step === 'tips' && category && (
          <>
            <div className="mb-xl">
              <p className="text-2xl mb-xs">{category.icon}</p>
              <h1 className="text-xl font-bold text-neutral-900 mb-sm">{category.label}</h1>
              {category.tips.length > 0 && (
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-md mb-md">
                  <p className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-sm">Before you do anything else</p>
                  <ul className="space-y-xs">
                    {category.tips.map((tip, i) => (
                      <li key={i} className="text-sm text-blue-900 leading-snug">• {tip}</li>
                    ))}
                  </ul>
                </div>
              )}
              {category.examples.length > 0 && (
                <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-md mb-md">
                  <p className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-sm">Example things to say</p>
                  <div className="space-y-sm">
                    {category.examples.map((ex, i) => (
                      <p key={i} className="text-sm italic text-neutral-700 leading-snug">{ex}</p>
                    ))}
                  </div>
                </div>
              )}
              {category.mediationLine && (
                <p className="text-sm text-neutral-500 leading-snug">{category.mediationLine}</p>
              )}
            </div>

            <div className="space-y-sm">
              {categoryKey !== 'other' && (
                <>
                  <button
                    onClick={() => setStep('text')}
                    className="w-full rounded-2xl bg-neutral-900 py-md text-sm font-bold text-white"
                  >
                    I've tried that — I need more help
                  </button>
                  <a
                    href="mailto:hello@capitalrooms.co.uk"
                    className="block w-full rounded-2xl border border-neutral-200 bg-white py-md text-center text-sm font-semibold text-neutral-700"
                  >
                    Contact Capital Rooms directly
                  </a>
                </>
              )}
              {categoryKey === 'other' && (
                <button
                  onClick={() => setStep('text')}
                  className="w-full rounded-2xl bg-neutral-900 py-md text-sm font-bold text-white"
                >
                  Tell us what's happening
                </button>
              )}
              <button onClick={() => setStep('category')} className="w-full py-md text-sm text-neutral-400 hover:text-neutral-700">
                ← Back
              </button>
            </div>
          </>
        )}

        {/* ── Step 3: Free text ────────────────────────────────────────── */}
        {step === 'text' && (
          <>
            <h1 className="text-xl font-bold text-neutral-900 mb-xs">Tell us what's happening</h1>
            <p className="text-sm text-neutral-500 mb-lg">
              {categoryKey === 'other'
                ? "Describe what's going on. We'll help decide the best next step."
                : 'Add any detail that would help. Everything you write here is private.'}
            </p>
            <textarea
              value={freeText}
              onChange={e => setFreeText(e.target.value)}
              rows={6}
              placeholder={categoryKey === 'other' ? 'What\'s been going on?' : 'Describe what\'s happened and what you\'ve already tried…'}
              className="w-full rounded-2xl border border-neutral-200 bg-white px-md py-sm text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 mb-lg"
            />
            {aiError && (
              <div className="mb-md rounded-xl border border-red-200 bg-red-50 p-md text-sm text-red-800">
                Something went wrong — we'll send this to Capital Rooms directly.
              </div>
            )}
            <div className="space-y-sm">
              <button
                onClick={handleGetResponse}
                disabled={!freeText.trim() || sending}
                className="w-full rounded-2xl bg-neutral-900 py-md text-sm font-bold text-white disabled:opacity-40"
              >
                {sending ? 'Drafting reminder…' : 'Get a response →'}
              </button>
              <button onClick={() => setStep('tips')} className="w-full py-md text-sm text-neutral-400 hover:text-neutral-700">
                ← Back
              </button>
            </div>
          </>
        )}

        {/* ── Step 4: Routing result ───────────────────────────────────── */}
        {step === 'routing' && routingResult && (
          <>
            {routingResult.type === 'house_note' ? (
              <>
                <h1 className="text-xl font-bold text-neutral-900 mb-xs">Send an anonymous House Reminder?</h1>
                <p className="text-sm text-neutral-500 mb-lg">
                  This would go to the whole house as a friendly reminder — your name won't be on it. You can edit it first.
                </p>
                {houseNoteSent ? (
                  <div className="rounded-2xl border border-green-200 bg-green-50 p-md text-center">
                    <p className="text-lg mb-xs">✓</p>
                    <p className="font-bold text-green-900">Reminder sent to the house</p>
                    <p className="text-sm text-green-700 mt-xs">Redirecting you home…</p>
                  </div>
                ) : (
                  <>
                    <textarea
                      value={houseNoteText}
                      onChange={e => setHouseNoteText(e.target.value)}
                      rows={5}
                      className="w-full rounded-2xl border border-neutral-200 bg-white px-md py-sm text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900 mb-lg"
                    />
                    {aiError && (
                      <div className="mb-md rounded-xl border border-red-200 bg-red-50 p-md text-sm text-red-800">
                        Something went wrong sending the reminder. Please try again or contact Capital Rooms directly.
                      </div>
                    )}
                    <div className="space-y-sm">
                      <button
                        onClick={sendHouseNote}
                        disabled={!houseNoteText.trim() || sending}
                        className="w-full rounded-2xl bg-neutral-900 py-md text-sm font-bold text-white disabled:opacity-40"
                      >
                        {sending ? 'Sending…' : 'Send anonymous reminder'}
                      </button>
                      <p className="text-xs text-center text-neutral-400">Anonymous — no name attached. Goes on the Notice Board.</p>
                      <div className="border-t border-neutral-200 pt-md">
                        <p className="text-sm text-neutral-600 mb-sm">Or, send privately to Capital Rooms:</p>
                        <button
                          onClick={sendToCapitalRooms}
                          disabled={sending}
                          className="w-full rounded-2xl border border-neutral-200 bg-white py-md text-sm font-semibold text-neutral-700"
                        >
                          Contact Capital Rooms instead
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                <h1 className="text-xl font-bold text-neutral-900 mb-xs">We'll look into this</h1>
                <p className="text-sm text-neutral-500 mb-lg">
                  This is best handled privately. Your name won't be shared with your housemates.
                </p>
                <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-md mb-lg">
                  <p className="text-sm font-semibold text-neutral-700 mb-xs">Your message</p>
                  <p className="text-sm text-neutral-600 whitespace-pre-wrap">{freeText}</p>
                </div>
                {aiError && (
                  <div className="mb-md rounded-xl border border-red-200 bg-red-50 p-md text-sm text-red-800">
                    Something went wrong. Please try again or email us at hello@capitalrooms.co.uk.
                  </div>
                )}
                <div className="space-y-sm">
                  <button
                    onClick={sendToCapitalRooms}
                    disabled={sending}
                    className="w-full rounded-2xl bg-neutral-900 py-md text-sm font-bold text-white disabled:opacity-40"
                  >
                    {sending ? 'Sending…' : 'Send to Capital Rooms'}
                  </button>
                  <a
                    href="mailto:hello@capitalrooms.co.uk"
                    className="block w-full rounded-2xl border border-neutral-200 bg-white py-md text-center text-sm font-semibold text-neutral-700"
                  >
                    Email us instead
                  </a>
                  <button onClick={() => setStep('text')} className="w-full py-md text-sm text-neutral-400">← Edit message</button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
