// The tenant app wears "Garden Square" (26 Oct 2026) — app/components/GardenTheme; the office keeps its own look.
// On a computer every screen sits beside the shared side rail (app/components/role/RoleShell).
import type { Viewport } from 'next'
import GardenTheme from '@/app/components/GardenTheme'
import RoleShell from '@/app/components/role/RoleShell'
import { gardenFontClasses } from '@/lib/fonts/garden'
import ViewAsBar from './ViewAsBar'
import TenantTabBar from '@/app/components/garden/TenantTabBar'

export const viewport: Viewport = { themeColor: '#17332B' }

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  return <GardenTheme fonts={gardenFontClasses}><RoleShell role="tenant"><ViewAsBar />{children}<TenantTabBar /></RoleShell></GardenTheme>
}
