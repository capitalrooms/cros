'use client'
import UserProfilePage from '@/app/components/UserProfilePage'
import SupplierLogo from '@/components/SupplierLogo'
import { RoleTabBar, type ContractorTab } from '@/app/components/RoleTabBar'
export default function ContractorProfile() {
  return <><UserProfilePage allowedRoles={['contractor']} backHref="/contractor" roleName="Contractor" extra={<SupplierLogo />} /><RoleTabBar<ContractorTab> role="contractor" active="me" /></>
}
