import UserProfilePage from '@/app/components/UserProfilePage'

export default function TenantProfilePage() {
  return (
    <UserProfilePage
      allowedRoles={['tenant']}
      backHref="/tenant"
      roleName="Tenant"
    />
  )
}
