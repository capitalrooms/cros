'use client'

/**
 * TenantOnboarding
 * Full-screen overlay shown once on first login.
 * Slide content (title + body) is fetched from the onboarding_steps table
 * so it can be edited in Admin → Message Templates → Onboarding.
 * Dismissed via localStorage flag 'cros-onboarded-tenant'.
 */

import { useEffect, useState } from 'react'

interface Step {
  id: string
  sort_order: number
  screen: string   // 'brand' | 'dashboard' | 'maintenance' | 'notices' | 'profile' | 'ready'
  title: string
  body: string
}

const STORAGE_KEY = 'cros-onboarded-tenant'

// ── App screen mocks embedded per slide ──────────────────────────────────────

function ScreenDashboard() {
  return (
    <div className="flex-1 overflow-hidden" style={{ background: '#f5f5f4' }}>
      {/* Dark tenancy band */}
      <div style={{ background: '#171717', padding: '10px 14px 22px' }}>
        <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>Your tenancy</p>
        <p style={{ fontSize: 15, fontWeight: 700, color: '#fff', lineHeight: 1.15, marginBottom: 3 }}>Room 3, 14 Saltwell St</p>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>14 Saltwell Street, Newcastle, NE8</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 10 }}>
          {[['Rent','£650','per month'],['Next due','1 Oct','in 17 days'],['Started','Oct \'26','contract']].map(([l,v,s]) => (
            <div key={l}>
              <p style={{ fontSize: 8.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.3)' }}>{l}</p>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#fff', margin: '3px 0 1px' }}>{v}</p>
              <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>{s}</p>
            </div>
          ))}
        </div>
        <p style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 10, paddingTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>Plumber visiting — Tomorrow · 9am–12pm</p>
      </div>
      {/* Cards */}
      <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: '9px 11px', border: '1px solid #fde68a', display: 'flex', gap: 7 }}>
          <span style={{ fontSize: 15 }}>💧</span>
          <div>
            <p style={{ fontSize: 11.5, fontWeight: 700, color: '#1c1917', marginBottom: 2 }}>Humidity today</p>
            <p style={{ fontSize: 10, color: '#374151', lineHeight: 1.5 }}>14°C · 68% — keep windows ajar when cooking or showering.</p>
          </div>
        </div>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <div style={{ height: 2, background: 'linear-gradient(to right, #60a5fa, #f59e0b)' }} />
          <div style={{ padding: '9px 11px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>📋 Notice Board</p>
              <p style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>📢 Bin collections move to Friday from Oct</p>
            </div>
            <span style={{ color: '#9ca3af', fontSize: 13 }}>›</span>
          </div>
        </div>
        <button style={{ width: '100%', background: '#1f2937', color: '#fff', border: 'none', borderRadius: 12, padding: '11px', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit' }}>⚠️ Report an issue</button>
        <p style={{ fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#9ca3af' }}>EVERYTHING ELSE</p>
        {['Messages','Guides & safety','Property info & housemates'].map(t => (
          <div key={t} style={{ background: '#fff', borderRadius: 12, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', border: '1px solid #e5e7eb' }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: '#111827' }}>{t}</span>
            <span style={{ color: '#9ca3af', fontSize: 13 }}>›</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ScreenMaintenance() {
  return (
    <div className="flex-1 overflow-hidden" style={{ background: '#f5f5f4', padding: '12px 12px 0' }}>
      <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9ca3af', marginBottom: 8 }}>My maintenance</p>
      {/* Active ticket */}
      <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb', marginBottom: 7 }}>
        <div style={{ background: '#1c1917', padding: '10px 12px' }}>
          <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)', marginBottom: 3 }}>In progress</p>
          <p style={{ fontSize: 13.5, fontWeight: 700, color: '#fff' }}>🔧 Leaking tap — Kitchen</p>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>Room 3 · raised 3 days ago</p>
        </div>
        <div style={{ padding: '8px 12px' }}>
          <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, background: '#fef3c7', color: '#92400e', padding: '2px 7px', borderRadius: 999 }}>Awaiting contractor</span>
            <span style={{ fontSize: 9.5, fontWeight: 700, background: '#dbeafe', color: '#1e40af', padding: '2px 7px', borderRadius: 999 }}>High priority</span>
          </div>
          <div style={{ background: '#f3f4f6', height: 3, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: '25%', height: '100%', background: '#f59e0b', borderRadius: 2 }} />
          </div>
        </div>
      </div>
      {[['✅','Bedroom light','Completed · 1 week ago','#f0fdf4'],['🕐','Boiler pressure low','Booked: Tue 6 Oct · 9–12','#eff6ff']].map(([icon,title,sub,bg]) => (
        <div key={title as string} style={{ background: '#fff', borderRadius: 12, padding: '9px 12px', border: '1px solid #e5e7eb', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: bg as string, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>{icon}</div>
          <div>
            <p style={{ fontSize: 11.5, fontWeight: 600, color: '#1c1917' }}>{title as string}</p>
            <p style={{ fontSize: 10, color: '#6b7280', marginTop: 1 }}>{sub as string}</p>
          </div>
        </div>
      ))}
      {/* Bottom sheet peeping up */}
      <div style={{ background: '#fff', borderRadius: '16px 16px 0 0', padding: '7px 12px 12px', boxShadow: '0 -3px 16px rgba(0,0,0,0.12)', marginTop: 4 }}>
        <div style={{ width: 32, height: 3, background: '#d1d5db', borderRadius: 2, margin: '0 auto 8px' }} />
        <p style={{ fontSize: 13, fontWeight: 700, color: '#1c1917', marginBottom: 2 }}>What's this about?</p>
        <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>Pick the closest match.</p>
        {[['🔧','Maintenance issue','Something broken or needs fixing'],['🏠','Trouble with a housemate','Having a difficult time with someone']].map(([icon,t,s]) => (
          <div key={t as string} style={{ display: 'flex', gap: 9, border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '8px 10px', marginBottom: 6 }}>
            <span style={{ fontSize: 18, marginTop: 1 }}>{icon}</span>
            <div>
              <p style={{ fontSize: 11.5, fontWeight: 700, color: '#1c1917' }}>{t as string}</p>
              <p style={{ fontSize: 10, color: '#6b7280' }}>{s as string}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ScreenNotices() {
  return (
    <div className="flex-1 overflow-hidden" style={{ background: '#f5f5f4', padding: '12px 12px 0' }}>
      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '9px 11px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: '#15803d' }}>🛎 Guest staying over</span>
        <span style={{ fontSize: 10, color: '#16a34a' }}>One tap →</span>
      </div>
      <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
        {['All active','✅ Tasks','🏠 House 1','Done'].map((p,i) => (
          <span key={p} style={{ padding: '5px 10px', borderRadius: 999, fontSize: 10.5, fontWeight: 600, background: i===0?'#111827':'#fff', color: i===0?'#fff':'#374151', border: i===0?'none':'1px solid #e5e7eb' }}>{p}</span>
        ))}
      </div>
      {[
        { bar: '#f59e0b', type: '✅ Task', typeCol: '#d97706', title: 'Check your smoke alarm this month', body: 'Press and hold the test button until it beeps. Takes 30 seconds.', task: true },
        { bar: '#3b82f6', type: '📢 Announcement', typeCol: '#2563eb', title: 'Bin collections moving to Friday from October', body: 'Newcastle City Council updated the schedule. Bins out by 7am on Fridays.', task: false },
      ].map(n => (
        <div key={n.title} style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb', marginBottom: 7 }}>
          <div style={{ height: 3, background: n.bar }} />
          <div style={{ padding: '9px 11px' }}>
            <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: n.typeCol, marginBottom: 3 }}>{n.type}</p>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#111827', marginBottom: 3 }}>{n.title}</p>
            <p style={{ fontSize: 10, color: '#4b5563', lineHeight: 1.5 }}>{n.body}</p>
            {n.task && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 7, padding: '5px 8px' }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, border: '1.5px solid #d97706', flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: '#92400e' }}>Mark as done</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function ScreenProfile() {
  return (
    <div className="flex-1 overflow-hidden" style={{ background: '#f5f5f4', padding: '12px' }}>
      {/* Avatar card */}
      <div style={{ background: '#1c1917', borderRadius: 16, padding: '14px', display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#fff', flexShrink: 0 }}>S</div>
        <div>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Sarah Mitchell</p>
          <p style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>sarah.mitchell@email.com</p>
          <span style={{ display: 'inline-block', marginTop: 5, fontSize: 9, fontWeight: 600, background: '#374151', color: '#9ca3af', padding: '2px 8px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Tenant</span>
        </div>
      </div>
      {/* Form */}
      <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb', marginBottom: 9 }}>
        <p style={{ padding: '7px 12px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9ca3af', borderBottom: '1px solid #f5f5f4' }}>Your details</p>
        {[['First name','Sarah'],['Last name','Mitchell'],['Phone','07700 900123']].map(([l,v]) => (
          <div key={l} style={{ padding: '7px 12px', borderBottom: '1px solid #f9fafb' }}>
            <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: '#9ca3af', marginBottom: 3 }}>{l}</p>
            <div style={{ padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 11, color: '#111827', background: '#fff' }}>{v}</div>
          </div>
        ))}
      </div>
      {/* Push toggle */}
      <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb', marginBottom: 9 }}>
        <p style={{ padding: '7px 12px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9ca3af', borderBottom: '1px solid #f5f5f4' }}>Push notifications</p>
        <div style={{ padding: '9px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
            <span style={{ fontSize: 11.5, color: '#374151' }}>Enabled on this device</span>
          </span>
          <span style={{ fontSize: 11, color: '#6b7280', textDecoration: 'underline' }}>Disable</span>
        </div>
        <div style={{ margin: '0 12px 10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '7px 9px', display: 'flex', gap: 6 }}>
          <span style={{ fontSize: 11, flexShrink: 0 }}>⚠️</span>
          <p style={{ fontSize: 10, color: '#92400e', lineHeight: 1.5 }}><strong>Heads up:</strong> Disabling means you won't receive alerts when contractors need access or there are important updates.</p>
        </div>
      </div>
      <button style={{ display: 'block', width: '100%', background: '#111827', color: '#fff', border: 'none', borderRadius: 10, padding: 10, fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>Save changes</button>
    </div>
  )
}

// ── AppBar shown on all slides except brand/ready ─────────────────────────────
function AppBar({ back }: { back?: boolean }) {
  return (
    <div style={{ background: '#0a0a0a', height: 38, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', flexShrink: 0, position: 'relative' }}>
      <span style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)', fontWeight: 300 }}>{back ? '‹' : ''}</span>
      {/* Emblem — CSS crop of logo.png */}
      <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
        <div style={{ width: 40, height: 19.7, overflow: 'hidden', position: 'relative' }}>
          <img
            src="/logo.png"
            alt="Capital Rooms"
            style={{
              position: 'absolute',
              top: -0.88,
              left: -0.93,
              width: 42.3,
              height: 39.4,
              filter: 'invert(1)',
            }}
          />
        </div>
      </div>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>{back ? '' : '👋 Sign out'}</span>
    </div>
  )
}

// ── Individual slide ──────────────────────────────────────────────────────────
function Slide({ step, isLast, onNext, onSkip, slideIndex, total }: {
  step: Step
  isLast: boolean
  onNext: () => void
  onSkip: () => void
  slideIndex: number
  total: number
}) {
  const isBrand = step.screen === 'brand'
  const isReady = step.screen === 'ready'

  const dots = Array.from({ length: total }).map((_, i) => (
    <span key={i} style={{
      display: 'inline-block',
      width: i === slideIndex ? 16 : 5,
      height: 5,
      borderRadius: i === slideIndex ? 3 : '50%',
      background: i === slideIndex ? '#c4922a' : 'rgba(255,255,255,0.25)',
      transition: 'all 0.2s',
    }} />
  ))

  // ── Brand slide ──
  if (isBrand) {
    return (
      <div style={{ height: '100%', background: '#0a0a0a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px 80px', position: 'relative', overflow: 'hidden' }}>
        {/* Glow */}
        <div style={{ position: 'absolute', width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, rgba(196,146,42,0.18) 0%, transparent 70%)', top: 24, left: '50%', transform: 'translateX(-50%)' }} />
        {/* Logo */}
        <div style={{ marginBottom: 28, position: 'relative', zIndex: 1 }}>
          <div style={{ width: 94, height: 43, overflow: 'hidden', position: 'relative' }}>
            <img src="/logo.png" alt="Capital Rooms" style={{ position: 'absolute', top: -2.1, left: -2.2, width: 99.6, height: 92.9, filter: 'invert(1)' }} />
          </div>
        </div>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 24, fontWeight: 700, color: '#fff', textAlign: 'center', lineHeight: 1.2, marginBottom: 10, position: 'relative', zIndex: 1 }}>{step.title}</h2>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.42)', textAlign: 'center', lineHeight: 1.6, position: 'relative', zIndex: 1 }}>{step.body}</p>
        {/* Nav */}
        <div style={{ position: 'absolute', bottom: 24, left: 24, right: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={onSkip} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' }}>Skip all</button>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>{dots}</div>
          <button onClick={onNext} style={{ background: '#c4922a', color: '#1c1917', border: 'none', borderRadius: 999, padding: '8px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Next</button>
        </div>
      </div>
    )
  }

  // ── Ready slide ──
  if (isReady) {
    return (
      <div style={{ height: '100%', background: '#0a0a0a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px 80px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(34,197,94,0.14) 0%, transparent 70%)', top: 20, left: '50%', transform: 'translateX(-50%)' }} />
        <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(34,197,94,0.14)', border: '1.5px solid rgba(34,197,94,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, marginBottom: 18, position: 'relative', zIndex: 1 }}>✓</div>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 700, color: '#fff', textAlign: 'center', lineHeight: 1.25, marginBottom: 10, position: 'relative', zIndex: 1 }}>{step.title}</h2>
        <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.42)', textAlign: 'center', lineHeight: 1.65, position: 'relative', zIndex: 1 }}>{step.body}</p>
        <button onClick={onNext} style={{ position: 'absolute', bottom: 24, left: 24, right: 24, background: '#22c55e', color: '#fff', border: 'none', borderRadius: 12, padding: 13, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          Open Capital Rooms →
        </button>
      </div>
    )
  }

  // ── App screen slides ──
  const screenMap: Record<string, React.ReactNode> = {
    dashboard:   <ScreenDashboard />,
    maintenance: <ScreenMaintenance />,
    notices:     <ScreenNotices />,
    profile:     <ScreenProfile />,
  }
  const screen = screenMap[step.screen] ?? <ScreenDashboard />

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <AppBar back={step.screen !== 'dashboard'} />
      {screen}
      {/* Text + nav overlay */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top, rgba(10,10,10,0.88) 0%, rgba(10,10,10,0.4) 60%, transparent 100%)', padding: '36px 18px 18px' }}>
        <h3 style={{ fontFamily: 'Georgia, serif', fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{step.title}</h3>
        <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.55)', lineHeight: 1.55, marginBottom: 14 }}>{step.body}</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={onSkip} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Skip</button>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>{dots}</div>
          {isLast
            ? <button onClick={onNext} style={{ background: '#22c55e', color: '#fff', border: 'none', borderRadius: 999, padding: '7px 16px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Done</button>
            : <button onClick={onNext} style={{ background: '#c4922a', color: '#1c1917', border: 'none', borderRadius: 999, padding: '7px 16px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Next</button>
          }
        </div>
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function TenantOnboarding({ onComplete }: { onComplete: () => void }) {
  const [steps, setSteps]   = useState<Step[]>([])
  const [index, setIndex]   = useState(0)
  const [ready, setReady]   = useState(false)
  const [exiting, setExiting] = useState(false)
  const [slideDir, setSlideDir] = useState<'in' | 'out'>('in')

  useEffect(() => {
    // Don't show if already onboarded
    try {
      if (localStorage.getItem(STORAGE_KEY)) { onComplete(); return }
    } catch { /* private mode */ }

    fetch('/api/onboarding-steps?role=tenant')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.steps?.length) {
          setSteps(d.steps)
          setReady(true)
        } else {
          // No steps configured — skip onboarding
          finish()
        }
      })
      .catch(() => finish())
  }, [])

  function finish() {
    try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* ignore */ }
    setExiting(true)
    setTimeout(() => onComplete(), 400)
  }

  function next() {
    if (index < steps.length - 1) {
      setIndex(i => i + 1)
    } else {
      finish()
    }
  }

  if (!ready) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      opacity: exiting ? 0 : 1,
      transition: 'opacity 0.4s ease',
      pointerEvents: exiting ? 'none' : 'auto',
    }}>
      {/* Backdrop blur */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} />

      {/* Phone frame */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 320, maxWidth: '92vw',
          height: 620, maxHeight: '88vh',
          background: '#f5f5f4',
          borderRadius: 44,
          overflow: 'hidden',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.1), 0 32px 80px rgba(0,0,0,0.5)',
          position: 'relative',
        }}>
          {/* Slide with transition */}
          <div
            key={index}
            style={{
              position: 'absolute', inset: 0,
              animation: 'slideIn 0.28s ease forwards',
            }}
          >
            <Slide
              step={steps[index]}
              isLast={index === steps.length - 1}
              onNext={next}
              onSkip={finish}
              slideIndex={index}
              total={steps.length}
            />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}
