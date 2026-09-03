/**
 * TenantCardBody — shared left-hand content for tenancy cards.
 *
 * Renders the info half of a tenancy card: tenant name, room + property,
 * rent, dates, status badge, and optional comms prefs / email.
 *
 * The RIGHT side (action buttons: set on notice, cancel move-out, delete, etc.)
 * stays in each consuming page — they're different per context.
 *
 * Usage:
 *   <div className="flex items-start justify-between gap-md">
 *     <TenantCardBody {...props} />
 *     <div className="shrink-0 flex flex-col gap-sm">
 *       {page-specific action buttons}
 *     </div>
 *   </div>
 */

interface OptIns {
  maintenance?: boolean
  viewings?: boolean
  appointments?: boolean
  cleaning?: boolean
}

export interface TenantCardBodyProps {
  name: string
  email?: string | null
  roomName?: string | null
  propertyName?: string | null
  propertyAddress?: string | null
  rentAmount?: number | null
  startDate?: string | null
  endDate?: string | null       // null/undefined = active; a date string = on notice
  communicationPreference?: 'email' | 'text' | string | null
  optIns?: OptIns
  /** Show the communication preference and opt-in badges (tenancies page shows these; tenancy-management doesn't) */
  showPreferences?: boolean
}

function formatDate(d: string | null | undefined) {
  if (!d) return null
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function TenantCardBody({
  name,
  email,
  roomName,
  propertyName,
  propertyAddress,
  rentAmount,
  startDate,
  endDate,
  communicationPreference,
  optIns,
  showPreferences = false,
}: TenantCardBodyProps) {
  const isOnNotice = Boolean(endDate)

  return (
    <div className="flex-1 min-w-0">
      {/* Name */}
      <p className="font-bold text-neutral-900 truncate">{name}</p>

      {/* Room + Property */}
      {(roomName || propertyName) && (
        <p className="text-sm text-neutral-600 mt-xs truncate">
          {[roomName, propertyName].filter(Boolean).join(' · ')}
        </p>
      )}
      {propertyAddress && propertyAddress !== propertyName && (
        <p className="text-sm text-neutral-500 truncate">{propertyAddress}</p>
      )}

      {/* Email */}
      {email && (
        <p className="text-xs text-neutral-500 mt-xs">{email}</p>
      )}

      {/* Status + date badges */}
      <div className="flex flex-wrap gap-sm mt-md text-xs">
        {/* Active / On Notice */}
        <span
          className={`px-sm py-xs rounded font-semibold ${
            isOnNotice ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
          }`}
        >
          {isOnNotice ? '📋 On notice' : '🏠 Active'}
        </span>

        {/* Move-in date */}
        {startDate && (
          <span className="px-sm py-xs bg-neutral-100 rounded text-neutral-600">
            📅 Since {formatDate(startDate)}
          </span>
        )}

        {/* Move-out date (if on notice) */}
        {endDate && (
          <span className="px-sm py-xs bg-amber-100 text-amber-800 rounded font-semibold">
            🚚 Available from {formatDate(endDate)}
          </span>
        )}

        {/* Rent */}
        {rentAmount != null && (
          <span className="px-sm py-xs bg-neutral-100 rounded text-neutral-600">
            £{rentAmount}/month
          </span>
        )}

        {/* Comms preference */}
        {showPreferences && communicationPreference && (
          <span className="px-sm py-xs bg-neutral-100 rounded text-neutral-600">
            {communicationPreference === 'email' ? '📧' : '💬'} {communicationPreference}
          </span>
        )}
      </div>

      {/* Opt-in preferences (shown only when showPreferences=true) */}
      {showPreferences && optIns && (
        <div className="mt-sm text-xs text-neutral-500">
          {[
            optIns.maintenance  && '🔧 Maintenance',
            optIns.viewings     && '👁️ Viewings',
            optIns.appointments && '📅 Appointments',
            optIns.cleaning     && '🧹 Cleaning',
          ]
            .filter(Boolean)
            .join(' · ') || null}
        </div>
      )}
    </div>
  )
}
