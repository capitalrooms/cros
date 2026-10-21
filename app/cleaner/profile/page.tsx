'use client'
import UserProfilePage from '@/app/components/UserProfilePage'
import { RoleTabBar, type CleanerTab } from '@/app/components/RoleTabBar'
export default function CleanerProfile() {
  return <><UserProfilePage allowedRoles={['cleaner']} backHref="/cleaner" roleName="Cleaner" /><RoleTabBar<CleanerTab> role="cleaner" active="me" /></>
}
