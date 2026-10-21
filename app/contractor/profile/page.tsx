'use client'
import UserProfilePage from '@/app/components/UserProfilePage'
import { RoleTabBar, type ContractorTab } from '@/app/components/RoleTabBar'
export default function ContractorProfile() {
  return <><UserProfilePage allowedRoles={['contractor']} backHref="/contractor" roleName="Contractor" /><RoleTabBar<ContractorTab> role="contractor" active="me" /></>
}
