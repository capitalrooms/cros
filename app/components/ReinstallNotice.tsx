'use client'

// The app moved to capitalrooms.co.uk (9 Nov 2026). A home-screen app installed from the old address
// (cros-sigma.vercel.app) is forwarded here, but iPhones and Android can't move an installed app to a new address,
// so it opens in a browser view with the address bar and toolbar showing. proxy.ts adds ?from=old-app when it
// forwards; this tells people how to put the app back on their home screen properly. Shown until they dismiss it,
// and never inside an app that's already installed from the new address.
import { useEffect, useState } from 'react'

const KEY = 'cros-reinstall-notice'

export default function ReinstallNotice() {
  const [show, setShow] = useState(false)
  const [ios, setIos] = useState(true)
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
    if (standalone) return
    const url = new URL(window.location.href)
    let flagged = false
    try {
      if (url.searchParams.get('from') === 'old-app') localStorage.setItem(KEY, 'show')
      flagged = localStorage.getItem(KEY) === 'show'
    } catch { flagged = url.searchParams.get('from') === 'old-app' }
    if (url.searchParams.has('from') && url.searchParams.get('from') === 'old-app') {
      url.searchParams.delete('from'); window.history.replaceState(null, '', url.toString())
    }
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent))
    setShow(flagged)
  }, [])
  if (!show) return null
  const close = () => { try { localStorage.setItem(KEY, 'done') } catch { /* private mode */ } setShow(false) }
  return (
    <div role="dialog" aria-label="Reinstall the app" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(10,20,15,.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 440, background: '#fff', borderRadius: 20, padding: '22px 20px 18px', boxShadow: '0 10px 40px rgba(0,0,0,.25)', color: '#1C2B24' }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#4B6358' }}>The app has a new address</p>
        <h2 style={{ margin: '6px 0 8px', fontSize: 20, fontWeight: 700, lineHeight: 1.25 }}>Put Capital Rooms back on your home screen</h2>
        <p style={{ margin: '0 0 12px', fontSize: 15, lineHeight: 1.5, color: '#44544B' }}>Your app icon still points to our old address, so it opens with browser bars. It takes a minute to fix:</p>
        <ol style={{ margin: '0 0 16px', paddingLeft: 22, fontSize: 15, lineHeight: 1.6, listStyle: 'decimal' }}>
          <li>Delete the old Capital Rooms icon from your home screen.</li>
          {ios
            ? <><li>Open <strong>capitalrooms.co.uk/app</strong> in Safari.</li><li>Tap Share <span aria-hidden="true">⬆︎</span>, then <strong>Add to Home Screen</strong>.</li></>
            : <><li>Open <strong>capitalrooms.co.uk/app</strong> in Chrome.</li><li>Tap the menu <span aria-hidden="true">⋮</span>, then <strong>Add to Home screen</strong> or <strong>Install app</strong>.</li></>}
        </ol>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: '#5F6F66' }}>You may need to sign in once more, then everything works the same.</p>
        <button type="button" onClick={close} style={{ width: '100%', padding: '13px 0', borderRadius: 12, border: 'none', background: '#1C2B24', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>Got it</button>
      </div>
    </div>
  )
}
