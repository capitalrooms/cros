import UserProfilePage from '@/app/components/UserProfilePage'
export default function LettingsProfile() {
  return <UserProfilePage allowedRoles={['lettings']} backHref="/lettings" roleName="Lettings" />
}
