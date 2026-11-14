// The role apps' typefaces (14 Nov 2026, "Garden Ask"): the website's — Bricolage Grotesque for headings, Figtree for
// text — so capitalrooms.co.uk and the tenant, cleaner and contractor apps read as one brand. (26 Oct–13 Nov it was
// Sora and Nunito Sans.) Loaded on the server and handed to app/components/GardenTheme by the role layouts. The old
// variable names (--font-sora, --font-nunito) are kept as aliases in app/globals.css so every screen picks these up.
import { Bricolage_Grotesque, Figtree } from 'next/font/google'

const display = Bricolage_Grotesque({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-display', display: 'swap' })
const text = Figtree({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-text', display: 'swap' })

export const gardenFontClasses = `${display.variable} ${text.variable}`
