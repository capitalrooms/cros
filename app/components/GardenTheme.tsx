'use client'

// "Garden Square" (26 Oct 2026, Harry's pick from four options): the look of the tenant, contractor and cleaner apps.
// Admin and lettings keep the office look. This switches the colour variables in app/globals.css (.garden) — on this
// wrapper for the first paint, and on <html> so pop-ups drawn outside the page (sheets, menus) match too. The fonts
// come from lib/fonts/garden, via the role layouts.
import { useEffect } from 'react'

export default function GardenTheme({ fonts, children }: { fonts: string; children: React.ReactNode }) {
  useEffect(() => {
    const cls = ['garden', ...fonts.split(' ').filter(Boolean)]
    document.documentElement.classList.add(...cls)
    return () => { document.documentElement.classList.remove(...cls) }
  }, [fonts])
  return <div className={`garden ${fonts}`}>{children}</div>
}
