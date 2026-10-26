// Garden Square's typefaces (26 Oct 2026): Sora for headings, Nunito Sans for text. Loaded on the server (next/font
// can't load from a client component in this build) and handed to app/components/GardenTheme by the role layouts.
import { Sora, Nunito_Sans } from 'next/font/google'

const sora = Sora({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-sora', display: 'swap' })
const nunito = Nunito_Sans({ subsets: ['latin'], weight: ['400', '600', '700', '800'], variable: '--font-nunito', display: 'swap' })

export const gardenFontClasses = `${sora.variable} ${nunito.variable}`
