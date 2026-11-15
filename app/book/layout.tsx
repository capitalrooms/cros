// Public pages (design "C"): white browser bar / status bar on phones, to match the white header.
import type { Viewport } from 'next'

export const viewport: Viewport = { themeColor: '#EEF2EC' }   // the contractor app's ground (15 Nov 2026)

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return children
}
