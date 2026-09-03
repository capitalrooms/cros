import UserProfilePage from '@/app/components/UserProfilePage'
export default function CleanerProfile() {
  return <UserProfilePage allowedRoles={['cleaner']} backHref="/cleaner" roleName="Cleaner" />
}
