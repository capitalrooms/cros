'use client'

// Draws a pop-up window on <body>, above the office top bar and menu, and stops the page behind from scrolling
// (23 Oct 2026: windows drawn inside a page's scrolling area had the top bar and rail over their backdrop).
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export default function BodyPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  return mounted ? createPortal(children, document.body) : null
}
