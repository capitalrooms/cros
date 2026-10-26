'use client'

// "Garden Square" (26 Oct 2026, Harry's pick from four options): the look of the tenant, contractor and cleaner apps.
// Admin and lettings keep the office look. This loads the two typefaces and switches the colour variables in
// app/globals.css (.garden) — on this wrapper for the first paint, and on <html> so pop-ups drawn outside the page
// (sheets, menus) match too.
import { useEffect } from 'react'
import { Sora, Nunito_Sans } from 'next/font/google'

const sora = Sora({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-sora', display: 'swap' })
const nunito = Nunito_Sans({ subsets: ['latin'], weight: ['400', '600', '700', '800'], variable: '--font-nunito', display: 'swap' })

export default function GardenTheme({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const cls = ['garden', sora.variable, nunito.variable]
    document.documentElement.classList.add(...cls)
    return () => { document.documentElement.classList.remove(...cls) }
  }, [])
  return <div className={`garden ${sora.variable} ${nunito.variable}`}>{children}</div>
}
