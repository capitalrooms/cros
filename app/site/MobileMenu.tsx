'use client'
// The menu: a row on a computer, a button that opens it on a phone.
import { useState } from 'react'
import { usePathname } from 'next/navigation'
export default function MobileMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const path = (usePathname() ?? '').replace(/^\/site(?=\/|$)/, '') || '/'
  return (
    <>
      <nav aria-label="Main" className={open ? 'open' : ''} onClick={() => setOpen(false)} data-here={path}>{children}</nav>
      <button type="button" className="menu-btn" aria-expanded={open} aria-label={open ? 'Close the menu' : 'Open the menu'} onClick={() => setOpen(o => !o)}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">{open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}</svg>
      </button>
    </>
  )
}
