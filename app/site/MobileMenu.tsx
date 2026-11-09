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
      <button type="button" className="line sm menu-btn" aria-expanded={open} onClick={() => setOpen(o => !o)}>{open ? 'Close' : 'Menu'}</button>
    </>
  )
}
