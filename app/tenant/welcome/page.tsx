'use client'
// The first-run welcome for a new tenant (24 Nov 2026): an animated arrival, then the few things that matter.
// Steps: arrival → introduce yourself (existing ice breaker) → notifications → finish. Skip on every step.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { enablePush, pushSupported, pushPermission } from '@/lib/push'
import { adminFetch } from '@/lib/adminFetch'

const INK = '#17332B', MINT = '#98ECD5', GOLD = '#F2B84B', IVORY = '#F6F3EC'
type Step = 'arrive' | 'you' | 'notify' | 'done'
const STEPS: Step[] = ['arrive', 'you', 'notify', 'done']

// little houses and flats drive past on the way in (drawn in CSS, no images)
function Passing() {
  const items = ['h1', 'f1', 'h2', 'f2', 'h3', 'f3']
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {items.map((k, i) => (
        <div key={k} style={{ position: 'absolute', bottom: 120 + (i % 3) * 40, left: -120, width: 70 + (i % 2) * 20, height: 54 + (i % 3) * 10,
          background: i % 2 ? '#ffffff' : INK, borderRadius: i % 2 ? 6 : '10px 10px 4px 4px', opacity: 0.85,
          animation: `pass ${2.2 + i * 0.2}s ease-in ${i * 0.25}s forwards`, animationFillMode: 'forwards' }}>
          <div style={{ margin: 8, height: 10, background: i % 2 ? INK : GOLD, borderRadius: 3 }} />
        </div>
      ))}
    </div>
  )
}

export default function Welcome() {
  const [i, setI] = useState(0)
  const [name, setName] = useState('')
  const [house, setHouse] = useState('')
  const [personId, setPersonId] = useState<string | null>(null)
  const [pushMsg, setPushMsg] = useState('')
  const step = STEPS[i]
  const next = () => setI(x => Math.min(x + 1, STEPS.length - 1))
  const skip = () => { window.location.href = '/tenant' }

  useEffect(() => {
    adminFetch('/api/tenant/profile').then(r => r.ok ? r.json() : null).then(d => {
      if (!d) return
      setName(d.firstName ?? d.first_name ?? ''); setHouse(d.propertyName ?? d.property ?? '')
      setPersonId(d.personId ?? null)
    }).catch(() => null)
  }, [])

  async function turnOnPush() {
    setPushMsg('')
    const r = await enablePush({ id: personId ?? undefined, role: 'tenant' }).catch(() => ({ ok: false, reason: 'Something went wrong' }))
    setPushMsg(r.ok ? 'Notifications are on. We will only use them for things that matter.' : (r.reason || 'Notifications were not turned on. You can try again from your profile.'))
  }

  return (
    <main style={{ minHeight: '100vh', background: step === 'arrive' ? INK : IVORY, color: step === 'arrive' ? '#fff' : INK,
      fontFamily: 'Nunito, system-ui, sans-serif', position: 'relative', overflow: 'hidden', padding: '20px max(18px, env(safe-area-inset-left,0px)) 36px' }}>
      <style>{`
        @keyframes pass { from { transform: translateX(0) } to { transform: translateX(460px) } }
        @keyframes rise { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
        @keyframes settle { 0% { opacity: 0; transform: translateY(-18px) scale(.96) } 100% { opacity: 1; transform: none } }
        @keyframes bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important } }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.08em', opacity: .7 }}>{i + 1} OF {STEPS.length}</span>
        <button onClick={skip} style={{ background: 'none', border: 0, color: 'inherit', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer' }}>Skip</button>
      </div>

      {step === 'arrive' && (
        <section style={{ position: 'relative', minHeight: 'calc(100vh - 80px)' }}>
          <Passing />
          <div style={{ position: 'relative', zIndex: 2, paddingTop: 90 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800, letterSpacing: '.1em', color: GOLD, animation: 'rise .6s ease-out 2.4s both' }}>WELCOME HOME</p>
            <h1 style={{ fontFamily: 'Baloo 2, system-ui, sans-serif', fontSize: 40, lineHeight: 1.05, margin: '10px 0 0', animation: 'settle .7s ease-out 2.7s both' }}>
              {house || 'Your new home'}
            </h1>
            <p style={{ fontSize: 17, lineHeight: 1.55, marginTop: 14, opacity: .9, animation: 'rise .6s ease-out 3.2s both' }}>
              {name ? `Hi ${name}, ` : 'Hi, '}we are glad you are here. Let us show you the few things that make living here easy.
            </p>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, animation: 'rise .6s ease-out 3.6s both' }}>
              <button onClick={next} style={btn(GOLD, INK)}>Let&apos;s go</button>
            </div>
          </div>
        </section>
      )}

      {step === 'you' && (
        <section style={{ paddingTop: 40, animation: 'rise .5s ease-out both' }}>
          <div style={{ width: 96, height: 96, borderRadius: 48, background: MINT, display: 'grid', placeItems: 'center', fontFamily: 'Baloo 2, system-ui, sans-serif', fontSize: 30, fontWeight: 700, color: INK, animation: 'bob 3s ease-in-out infinite' }}>Hi</div>
          <h2 style={head}>Introduce yourself</h2>
          <p style={body}>Your housemates see a short card about you, with three quick answers and an optional photo. It takes about a minute, and you can change it any time.</p>
          <Link href="/tenant/icebreaker" style={{ ...btn(INK, '#fff'), display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 26 }}>Write my card</Link>
          <button onClick={next} style={{ ...btn('transparent', INK), border: `1.5px solid ${INK}`, marginTop: 12 }}>I will do it later</button>
        </section>
      )}

      {step === 'notify' && (
        <section style={{ paddingTop: 40, animation: 'rise .5s ease-out both' }}>
          <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
            {[['Repair booked for Thursday', 'Your contractor is on the way at 1:30pm.'], ['Bins go out tonight', 'Bin day is Friday. Put them out after 8pm.'], ['Something urgent at the house', 'We will tell you straight away.']].map(([t, b], n) => (
              <div key={t} style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', boxShadow: '0 6px 18px rgba(23,51,43,.10)', animation: `rise .5s ease-out ${0.2 + n * 0.25}s both` }}>
                <strong style={{ fontSize: 15 }}>{t}</strong>
                <div style={{ fontSize: 14, opacity: .75, marginTop: 2 }}>{b}</div>
              </div>
            ))}
          </div>
          <h2 style={{ ...head, marginTop: 28 }}>Turn on notifications</h2>
          <p style={body}>So repairs, bins and anything urgent reach you straight away. We only send what matters.</p>
          <button onClick={turnOnPush} disabled={!pushSupported() || pushPermission() === 'granted'} style={{ ...btn(INK, '#fff'), marginTop: 22, opacity: !pushSupported() ? .5 : 1 }}>
            {pushPermission() === 'granted' ? 'Notifications are on' : 'Turn on notifications'}
          </button>
          {pushMsg && <p style={{ ...body, marginTop: 12 }}>{pushMsg}</p>}
          <button onClick={next} style={{ ...btn('transparent', INK), border: `1.5px solid ${INK}`, marginTop: 12 }}>Not now</button>
        </section>
      )}

      {step === 'done' && (
        <section style={{ paddingTop: 60, textAlign: 'center', animation: 'rise .5s ease-out both' }}>
          <img src="/icon-512.png" alt="Capital Rooms" width={110} height={110} style={{ borderRadius: 26, display: 'block', margin: '0 auto', animation: 'bob 3s ease-in-out infinite' }} />
          <h2 style={{ ...head, marginTop: 24 }}>You are all set</h2>
          <p style={body}>Add Capital Rooms to your home screen so it opens like an app. The steps are in your app guide.</p>
          <Link href="/tenant" style={{ ...btn(GOLD, INK), display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 26 }}>Go to my home</Link>
        </section>
      )}
    </main>
  )
}

const head: React.CSSProperties = { fontFamily: 'Baloo 2, system-ui, sans-serif', fontSize: 30, lineHeight: 1.1, margin: '18px 0 8px' }
const body: React.CSSProperties = { fontSize: 16, lineHeight: 1.6, margin: 0, opacity: .85 }
const btn = (bg: string, fg: string): React.CSSProperties => ({ width: '100%', padding: '15px 20px', borderRadius: 999, border: 0, background: bg, color: fg, fontWeight: 800, fontSize: 16, cursor: 'pointer' })
