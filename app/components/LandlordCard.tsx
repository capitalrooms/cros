'use client'

/**
 * LandlordCard — canonical landlord identity card.
 *
 * Used on EVERY screen that shows a landlord:
 *   - Admin landlord profile page (/admin/landlord/[personId])
 *   - Onboarding pipeline detail panel (/admin/new-business/onboarding)
 *   - Landlords list (/admin/landlords) — via compact prop
 *
 * Accepts a unified LandlordCardData interface built from EITHER:
 *   - A landlord_onboarding row (pipeline prospects, no people.id yet)
 *   - A people row + joins (active landlord, fully onboarded)
 *
 * Strip colour:
 *   Pipeline (stage 1–5)          → blue
 *   Active, AML not assessed      → neutral grey
 *   Active, AML low risk          → green
 *   Active, AML medium risk       → amber
 *   Active, AML high risk         → red
 */

export type LandlordStatus = 'pipeline' | 'active'
export type AmlRisk = 'low' | 'medium' | 'high'

export interface LandlordProperty {
  id: string
  name: string
  address: string
  managementFeePct?: number | null
}

export interface LandlordCardData {
  // Navigation helpers
  personId?: string | null           // people.id — set once onboarded
  onboardingId?: string | null       // landlord_onboarding.id

  // Identity
  displayName: string                // company name, or first+last, or email fallback
  email: string
  phone?: string | null
  company?: string | null            // company name (corporate landlords)
  companyNumber?: string | null      // Companies House number
  homeAddress?: string | null        // residential address (AML)
  idPhotoUrl?: string | null         // passport/ID scan thumbnail

  // Status
  status: LandlordStatus
  onboardingStage?: number | null    // 1–6

  // AML
  amlRiskLevel?: AmlRisk | null
  amlRiskNotes?: string | null
  identityVerified?: boolean | null

  // Comms
  commsEnabled?: boolean | null

  // Properties (active only)
  properties?: LandlordProperty[]

  // Timestamps
  createdAt?: string | null
  onboardedAt?: string | null
}

/* ─── Helpers exported so pages can use them ─── */

/** Build a LandlordCardData from a landlord_onboarding row (pipeline prospect) */
export function fromOnboarding(row: any): LandlordCardData {
  return {
    onboardingId:   row.id,
    personId:       row.landlord_people_id ?? null,
    displayName:    row.full_name || row.email,
    email:          row.email,
    phone:          row.phone ?? null,
    company:        null,
    status:         (row.stage ?? 1) >= 6 ? 'active' : 'pipeline',
    onboardingStage: row.stage ?? 1,
    identityVerified: row.identity_verified ?? false,
    amlRiskLevel:   row.risk_level ?? null,
    amlRiskNotes:   row.risk_reason ?? null,
    createdAt:      row.created_at ?? null,
    onboardedAt:    row.onboarded_at ?? null,
  }
}

/** Build a LandlordCardData from a people row + optional joins */
export function fromPeople(
  person: any,
  properties?: LandlordProperty[],
  onboarding?: any
): LandlordCardData {
  const name =
    person.company ||
    person.full_name ||
    [person.first_name, person.last_name].filter(Boolean).join(' ') ||
    person.name ||
    person.email

  return {
    personId:       person.id,
    onboardingId:   onboarding?.id ?? null,
    displayName:    name,
    email:          person.email,
    phone:          person.phone ?? null,
    company:        person.company ?? null,
    companyNumber:  person.company_number ?? null,
    homeAddress:    person.home_address ?? null,
    idPhotoUrl:     person.id_photo_url ?? null,
    status:         'active',
    onboardingStage: onboarding?.stage ?? null,
    amlRiskLevel:   person.aml_risk_level ?? onboarding?.risk_level ?? null,
    amlRiskNotes:   person.aml_risk_notes ?? onboarding?.risk_reason ?? null,
    identityVerified: onboarding?.identity_verified ?? null,
    commsEnabled:   person.landlord_comms_enabled ?? null,
    properties:     properties ?? [],
    createdAt:      person.created_at ?? null,
    onboardedAt:    onboarding?.onboarded_at ?? null,
  }
}

/* ─── Strip colour ─── */

function stripClass(data: LandlordCardData): string {
  if (data.status === 'pipeline') return 'bg-blue-400'
  if (!data.amlRiskLevel)         return 'bg-neutral-200'
  if (data.amlRiskLevel === 'low')    return 'bg-green-500'
  if (data.amlRiskLevel === 'medium') return 'bg-amber-400'
  return 'bg-red-500'
}

/* ─── Badge helpers ─── */

function amlBadge(level: AmlRisk | null | undefined) {
  if (!level) return null
  const map: Record<AmlRisk, string> = {
    low:    'bg-green-100 text-green-800 border-green-200',
    medium: 'bg-amber-100 text-amber-800 border-amber-200',
    high:   'bg-red-100 text-red-800 border-red-200',
  }
  return (
    <span className={`text-xs font-semibold px-sm py-xs rounded-full border ${map[level]}`}>
      AML {level}
    </span>
  )
}

function stageBadge(stage: number | null | undefined) {
  if (!stage || stage >= 6) return null
  const labels: Record<number, string> = {
    1: 'New enquiry',
    2: 'Welcome sent',
    3: 'Docs received',
    4: 'Verified',
    5: 'Agreement sent',
  }
  return (
    <span className="text-xs font-semibold px-sm py-xs rounded-full border bg-blue-50 text-blue-700 border-blue-200">
      Stage {stage} · {labels[stage] ?? 'In progress'}
    </span>
  )
}

function commsBadge(enabled: boolean | null | undefined) {
  if (enabled == null) return null
  return (
    <span className={`text-xs font-semibold px-sm py-xs rounded-full border ${enabled ? 'bg-green-50 text-green-700 border-green-200' : 'bg-neutral-100 text-neutral-500 border-neutral-200'}`}>
      {enabled ? 'Comms on' : 'Comms off'}
    </span>
  )
}

function fmtDate(d: string | null | undefined) {
  if (!d) return null
  return new Date(d).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
}

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

/* ─── Component ─── */

interface LandlordCardProps {
  data: LandlordCardData
  /** Compact = single-line list row. Default = full profile card. */
  compact?: boolean
  /** Actions slot — rendered to the right of name+badges in full mode */
  actions?: React.ReactNode
}

export default function LandlordCard({ data, compact = false, actions }: LandlordCardProps) {
  const managementFees = (data.properties ?? [])
    .map(p => p.managementFeePct)
    .filter((f): f is number => f != null)
  const feeDisplay = managementFees.length === 0
    ? null
    : managementFees.every(f => f === managementFees[0])
      ? `${managementFees[0]}% fee`
      : `${Math.min(...managementFees)}–${Math.max(...managementFees)}% fee`

  /* ── Compact (list row) ── */
  if (compact) {
    return (
      <div className="flex items-center gap-md px-xl py-md">
        {/* Mini avatar */}
        <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs flex-shrink-0">
          {data.idPhotoUrl
            ? <img src={data.idPhotoUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
            : initials(data.displayName)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-sm flex-wrap">
            <span className="font-semibold text-neutral-900 text-sm">{data.displayName}</span>
            {data.company && <span className="text-xs text-neutral-400">Company</span>}
            {amlBadge(data.amlRiskLevel)}
            {stageBadge(data.onboardingStage)}
          </div>
          <p className="text-xs text-neutral-400 truncate">{data.email}{data.phone ? ` · ${data.phone}` : ''}</p>
        </div>

        <div className="text-xs text-neutral-400 flex-shrink-0">
          {data.properties?.length ? `${data.properties.length} prop.` : null}
        </div>
      </div>
    )
  }

  /* ── Full profile card ── */
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
      {/* Status strip */}
      <div className={`h-1.5 w-full ${stripClass(data)}`} />

      <div className="px-xl py-xl">
        <div className="flex items-start gap-xl">

          {/* Avatar */}
          <div className="flex-shrink-0">
            {data.idPhotoUrl ? (
              <img
                src={data.idPhotoUrl}
                alt={data.displayName}
                className="w-16 h-16 rounded-full object-cover border border-neutral-200 bg-neutral-100"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xl select-none">
                {initials(data.displayName)}
              </div>
            )}
          </div>

          {/* Name + badges + actions + facts */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-md flex-wrap mb-sm">
              <div>
                <h2 className="text-2xl font-bold text-neutral-900 leading-tight">{data.displayName}</h2>
                {data.company && data.company !== data.displayName && (
                  <p className="text-sm text-neutral-400 mt-xs">{data.company}</p>
                )}
              </div>

              <div className="flex items-center gap-sm flex-wrap">
                {data.company && (
                  <span className="text-xs font-semibold px-sm py-xs rounded-full border bg-indigo-50 text-indigo-700 border-indigo-200">
                    Company
                  </span>
                )}
                {amlBadge(data.amlRiskLevel)}
                {data.status === 'pipeline'
                  ? stageBadge(data.onboardingStage)
                  : commsBadge(data.commsEnabled)}
                {data.identityVerified && (
                  <span className="text-xs font-semibold px-sm py-xs rounded-full border bg-green-50 text-green-700 border-green-200">
                    ✓ ID verified
                  </span>
                )}
                {actions}
              </div>
            </div>

            {/* Key facts row */}
            <div className="flex flex-wrap gap-x-xl gap-y-xs text-sm">
              <span>
                <span className="text-neutral-400 text-xs uppercase tracking-wide mr-xs">Email</span>
                <span className="text-neutral-700 font-medium">{data.email}</span>
              </span>
              {data.phone && (
                <span>
                  <span className="text-neutral-400 text-xs uppercase tracking-wide mr-xs">Phone</span>
                  <span className="text-neutral-700 font-medium">{data.phone}</span>
                </span>
              )}
              {(data.properties?.length ?? 0) > 0 && (
                <span>
                  <span className="text-neutral-400 text-xs uppercase tracking-wide mr-xs">Properties</span>
                  <span className="text-neutral-700 font-medium">{data.properties!.length}</span>
                </span>
              )}
              {feeDisplay && (
                <span>
                  <span className="text-neutral-400 text-xs uppercase tracking-wide mr-xs">Mgmt</span>
                  <span className="text-neutral-700 font-medium">{feeDisplay}</span>
                </span>
              )}
              {data.companyNumber && (
                <span>
                  <span className="text-neutral-400 text-xs uppercase tracking-wide mr-xs">Co. No.</span>
                  <span className="text-neutral-700 font-medium">{data.companyNumber}</span>
                </span>
              )}
              {data.createdAt && (
                <span>
                  <span className="text-neutral-400 text-xs uppercase tracking-wide mr-xs">Since</span>
                  <span className="text-neutral-700 font-medium">{fmtDate(data.createdAt)}</span>
                </span>
              )}
            </div>

            {/* Home address — below facts row, shown when present */}
            {data.homeAddress && (
              <p className="mt-sm text-xs text-neutral-500">
                <span className="text-neutral-400 uppercase tracking-wide mr-xs">Address</span>
                {data.homeAddress}
              </p>
            )}

            {/* AML risk notes — shown when present */}
            {data.amlRiskNotes && (
              <p className="mt-sm text-xs text-neutral-400 italic">{data.amlRiskNotes}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
