'use client'
import UserProfilePage from '@/app/components/UserProfilePage'
import SupplierLogo from '@/components/SupplierLogo'
import { RoleTabBar, type CleanerTab } from '@/app/components/RoleTabBar'
export default function CleanerProfile() {
  return <><UserProfilePage allowedRoles={['cleaner']} backHref="/cleaner" roleName="Cleaner" extra={<SupplierLogo />} /><RoleTabBar<CleanerTab> role="cleaner" active="me" /></>
}
