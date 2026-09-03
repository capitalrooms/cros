import UserProfilePage from '@/app/components/UserProfilePage'
export default function ContractorProfile() {
  return <UserProfilePage allowedRoles={['contractor']} backHref="/contractor" roleName="Contractor" />
}
