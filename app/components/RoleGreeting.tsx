/**
 * The one greeting header shared by every role's dashboard, so the role label,
 * "Hello [Name] 👋" heading (always the same size), and subtitle look identical
 * on every login — with a bit more space under the role label than before.
 */
export default function RoleGreeting({
  role,
  name,
  subtitle,
}: {
  role: string
  name?: string | null
  subtitle?: string
}) {
  return (
    <div className="mb-3xl">
      <p className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-lg">{role}</p>
      <h1 className="text-3xl font-bold text-neutral-900">Hello {name || 'there'} 👋</h1>
      {subtitle && <p className="mt-sm text-neutral-600">{subtitle}</p>}
    </div>
  )
}
