// The cleaner app wears "Garden Square" (26 Oct 2026) — app/components/GardenTheme; the office keeps its own look.
import type { Viewport } from 'next'
import GardenTheme from '@/app/components/GardenTheme'
import { gardenFontClasses } from '@/lib/fonts/garden'

export const viewport: Viewport = { themeColor: '#17332B' }

export default function CleanerLayout({ children }: { children: React.ReactNode }) {
  return <GardenTheme fonts={gardenFontClasses}>{children}</GardenTheme>
}
